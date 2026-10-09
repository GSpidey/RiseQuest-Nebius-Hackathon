const jwt = require('jsonwebtoken');

function authentication(prisma, secret) {
  return async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!match) return res.status(401).json({ error: 'Missing auth token' });
    let decoded;
    try {
      decoded = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
      if (typeof decoded.sub !== 'string' || !decoded.sub || !Number.isFinite(decoded.exp)) throw new Error();
    } catch (_) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }
    try {
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      if (user.disabledAt) return res.status(403).json({ error: 'Account disabled' });
      if (user.authProvider === 'child') {
        const linked = await prisma.childAccount.findUnique({ where: { childId: user.id }, include: { consent: true, parent: true } });
        if (decoded.provider !== 'child' || !linked || decoded.consentId !== linked.consentId ||
          linked.parent.disabledAt || linked.consent.status !== 'APPROVED' || linked.consent.withdrawnAt) {
          return res.status(403).json({ error: 'Parent consent is no longer active. Please return to your parent.' });
        }
        // Child sessions cannot change identity, publish, purchase, contact
        // providers, upload media, or act as a guardian. Local tools still work.
        if (/^\/api\/(?:admin|family|auth|community|stripe|support|create-payment-intent|create-subscription|cancel-subscription|tts)(?:\/|$)/.test(req.path) ||
          (req.path.startsWith('/api/me') && req.method !== 'GET') || req.path === '/api/wallet/spend') {
          return res.status(403).json({ error: 'Ask your parent to manage this feature.' });
        }
      }
      req.auth = { userId: user.id, provider: decoded.provider || null, role: user.role, issuedAt: decoded.iat };
      return next();
    } catch (_) {
      return res.status(503).json({ error: 'Authentication temporarily unavailable' });
    }
  };
}

function ownRequest(req, res, next) {
  const owner = req.auth.userId;
  const supplied = [req.params.userId, req.query.userId, req.body?.userId,
    req.body?.customerEmail, req.body?.metadata?.userId, req.body?.metadata?.customerEmail];
  if (supplied.some(value => value != null && (typeof value !== 'string' || value.trim().toLowerCase() !== owner.toLowerCase()))) {
    return res.status(403).json({ error: 'Cannot access another account' });
  }
  if (req.body && typeof req.body === 'object') req.body.userId = owner;
  if (req.params.userId) req.params.userId = owner;
  req.query.userId = owner;
  return next();
}

function ownQuest(prisma) {
  return async (req, res, next) => {
    try {
      const quest = await prisma.quest.findUnique({ where: { id: req.params.id } });
      if (!quest || quest.userId !== req.auth.userId) return res.status(404).json({ error: 'Quest not found' });
      return next();
    } catch (_) { return res.status(503).json({ error: 'Quest temporarily unavailable' }); }
  };
}

const POINT_PACKS = Object.freeze({
  small: { cents: 299, points: 250 }, medium: { cents: 499, points: 550 },
  large: { cents: 999, points: 1150 }, mega: { cents: 1999, points: 3125 },
});

// Legacy clients can select a pack by its point count, but can never set its
// price, owner, or fulfillment metadata. Existing endpoint shapes are retained.
function pointPurchase(req, res, next) {
  const body = req.body || {};
  const packEntry = Object.entries(POINT_PACKS).find(([id, pack]) =>
    body.packageId ? body.packageId === id : Number(body.metadata?.risePoints) === pack.points);
  if (!packEntry || body.metadata?.type !== 'risepoints') {
    return res.status(400).json({ error: 'Select a configured Rise Points package' });
  }
  const [packageId, pack] = packEntry;
  if (Number(body.amount) !== pack.cents || String(body.currency || '').toLowerCase() !== 'usd') {
    return res.status(400).json({ error: 'Price changed. Refresh the wallet and try again.' });
  }
  body.amount = pack.cents;
  body.currency = 'usd';
  body.customerEmail = req.auth.userId;
  body.description = `RiseQuest ${packageId} Rise Points package`;
  body.metadata = { app: 'RiseQuest', type: 'risepoints', packageId,
    risePoints: String(pack.points), userId: req.auth.userId };
  next();
}

function subscriptionMetadata(req, res, next) {
  req.body.customerEmail = req.auth.userId;
  req.body.metadata = { app: 'RiseQuest', type: 'subscription', userId: req.auth.userId };
  next();
}

async function walletTransaction(prisma, userId, work) {
  return prisma.$transaction(async tx => {
    // Serialize every read-modify-write for this user's ledger across requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    return work(tx);
  });
}

function validPurchasedPoints(pi, userId) {
  const pack = Object.values(POINT_PACKS).find(p => p.points === Number(pi.metadata?.risePoints));
  return Boolean(pack && pi.status === 'succeeded' && pi.metadata?.type === 'risepoints' &&
    pi.metadata?.app === 'RiseQuest' && pi.metadata?.userId === userId &&
    pi.currency === 'usd' && pi.amount === pack.cents && pi.amount_received === pack.cents);
}

module.exports = { authentication, ownRequest, ownQuest, pointPurchase,
  subscriptionMetadata, walletTransaction, validPurchasedPoints, POINT_PACKS };
