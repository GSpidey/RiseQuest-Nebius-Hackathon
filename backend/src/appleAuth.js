const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sealDocument, openDocument } = require('./family');
const CLIENT_ID = 'com.goldenepics.risequest';
const ISSUER = 'https://appleid.apple.com';
const failure = (status, message, code) => Object.assign(new Error(message), { status, code });
let cachedKeys = [], keysExpire = 0, keysRequest;
async function appleKeys() {
  if (Date.now() < keysExpire) return cachedKeys;
  if (!keysRequest) keysRequest = (async () => {
    const response = await fetch(`${ISSUER}/auth/keys`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw failure(503, 'Apple sign-in is temporarily unavailable.');
    const json = await response.json();
    if (!Array.isArray(json.keys)) throw failure(503, 'Apple signing keys unavailable.');
    cachedKeys = json.keys.filter(k => k.kty === 'RSA' && k.alg === 'RS256' && k.use === 'sig');
    keysExpire = Date.now() + 3600000;
    return cachedKeys;
  })().finally(() => { keysRequest = null; });
  return keysRequest;
}
function verifyIdentity(token, nonceHash, keys, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 12000) throw failure(401, 'Invalid Apple identity.');
  const header = jwt.decode(token, { complete: true })?.header;
  const jwk = keys.find(k => k.kid === header?.kid && k.kty === 'RSA' && k.alg === 'RS256');
  if (!jwk || header.alg !== 'RS256') throw failure(401, 'Invalid Apple identity.');
  const claims = jwt.verify(token, crypto.createPublicKey({ key: jwk, format: 'jwk' }), {
    algorithms: ['RS256'], issuer: ISSUER, audience: CLIENT_ID, maxAge: '10m', clockTimestamp: now, clockTolerance: 5,
  });
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || !Number.isFinite(claims.exp) ||
    claims.nonce !== nonceHash || claims.iat > now + 5) throw failure(401, 'Invalid Apple identity.');
  return claims;
}
function clientSecret() {
  const key = process.env.APPLE_AUTH_PRIVATE_KEY_BASE64, kid = process.env.APPLE_AUTH_KEY_ID;
  if (!key || !kid) throw failure(503, 'Apple sign-in is temporarily unavailable.');
  return jwt.sign({}, Buffer.from(key, 'base64'), { algorithm: 'ES256', keyid: kid,
    issuer: '928X72628Q', subject: CLIENT_ID, audience: ISSUER, expiresIn: '5m' });
}
async function tokenRequest(parameters, endpoint = 'token') {
  const response = await fetch(`${ISSUER}/auth/${endpoint}`, { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: clientSecret(), ...parameters }),
  });
  if (!response.ok) throw failure(503, 'Apple verification could not be completed. Please retry.');
  return endpoint === 'revoke' ? null : response.json();
}
async function revokeAppleIdentity(identity, secret) {
  const refreshToken = openDocument(identity.refreshToken, secret, `apple:${identity.subject}`).toString('utf8');
  await tokenRequest({ token: refreshToken, token_type_hint: 'refresh_token' }, 'revoke');
}
function registerAppleAuth(app, { prisma, requireAuth, issueAuthToken, secret }) {
  const wrap = fn => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await fn(req, res); } catch (error) {
      const status = error.status || (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name) ? 401 : error.code === 'P2002' ? 409 : 503);
      res.status(status).json({ error: error.status ? error.message : 'Apple sign-in could not be completed. Please retry.', ...(error.status && error.code ? { code: error.code } : {}) });
    }
  };
  app.post('/api/auth/apple/challenge', wrap(async (_req, res) => {
    clientSecret(); // Fail before opening Apple's sheet if server setup is missing.
    // Clean short-lived challenges without retaining IP addresses or tokens.
    await prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const nonce = crypto.randomBytes(32).toString('hex');
    const row = await prisma.authChallenge.create({ data: { nonceHash: crypto.createHash('sha256').update(nonce).digest('hex'), expiresAt: new Date(Date.now() + 300000) } });
    res.json({ challengeId: row.id, nonce });
  }));
  const signIn = link => wrap(async (req, res) => {
    const row = await prisma.authChallenge.findUnique({ where: { id: String(req.body.challengeId || '') } });
    if (!row || row.usedAt || row.expiresAt <= new Date()) throw failure(401, 'Apple sign-in expired. Please try again.');
    const keys = await appleKeys();
    const claims = verifyIdentity(req.body.identityToken, row.nonceHash, keys);
    const existingIdentity = await prisma.appleIdentity.findUnique({ where: { subject: claims.sub }, include: { user: true } });
    if (existingIdentity?.user.disabledAt) throw failure(403, 'Account disabled.');
    if (link && existingIdentity && existingIdentity.userId !== req.auth.userId) throw failure(409, 'This Apple account is already linked.');
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!existingIdentity && !link && (!email.includes('@') || ![true, 'true'].includes(claims.email_verified))) throw failure(401, 'A verified Apple email is required.');
    if (!existingIdentity && !link && await prisma.user.findUnique({ where: { id: email } })) {
      throw failure(409, 'Sign in to your existing RiseQuest account first, then link Apple in Settings.', 'LINK_EXISTING_ACCOUNT');
    }
    if (!existingIdentity && !link && !require('./agePolicy').canRegister(req.body.ageBand, req.body.countryCode)) throw failure(400, 'Select your age and country before registration. A parent may need to create your profile.', 'AGE_SCREEN_REQUIRED');
    if (typeof req.body.authorizationCode !== 'string' || req.body.authorizationCode.length > 4096) throw failure(400, 'Apple authorization code is required.');
    const exchange = await tokenRequest({ code: req.body.authorizationCode, grant_type: 'authorization_code' });
    const exchanged = verifyIdentity(exchange.id_token, row.nonceHash, keys);
    if (exchanged.sub !== claims.sub || !exchange.refresh_token) throw failure(401, 'Apple verification did not match.');
    const user = await prisma.$transaction(async tx => {
      const consumed = await tx.authChallenge.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (!consumed.count) throw failure(401, 'Apple sign-in has already been used.');
      let account = existingIdentity?.user;
      if (link) account = await tx.user.findUnique({ where: { id: req.auth.userId } });
      if (!account) account = await tx.user.create({ data: { id: email, authProvider: 'apple',
        name: String(req.body.displayName || 'RiseQuest User').trim().slice(0, 100),
        profile: { create: { data: { ageBand: req.body.ageBand, countryCode: req.body.countryCode, ageGroup: req.body.ageBand === 'adult' ? 'adult' : 'teen', preferences: { analyticsOptIn: false } } } },
      } });
      if (account.disabledAt || account.authProvider === 'child') throw failure(403, 'This account cannot use Apple sign-in.');
      const refreshToken = sealDocument(Buffer.from(exchange.refresh_token), secret, `apple:${claims.sub}`);
      await tx.appleIdentity.upsert({ where: { subject: claims.sub }, create: { subject: claims.sub, userId: account.id, refreshToken }, update: { refreshToken } });
      return account;
    }, { isolationLevel: 'Serializable' });
    res.json({ token: issueAuthToken(user.id, 'apple'), user: { id: user.id, email: user.id, displayName: user.name,
      role: user.role, authProvider: 'apple', photoUrl: user.photoUrl, bannerUrl: user.bannerUrl } });
  });
  app.post('/api/auth/apple', signIn(false));
  app.post('/api/auth/apple/link', requireAuth, signIn(true));
}
module.exports = { registerAppleAuth, verifyIdentity, revokeAppleIdentity };
