const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { SignedDataVerifier, AppStoreServerAPIClient, Environment } = require('@apple/app-store-server-library');
const { STORE_CATALOG, storeProduct, applePurchase, googlePurchase, storeEntitlement, trialEntitlement, complimentaryEntitlement } = require('./storeCatalog');
const { sealDocument, openDocument } = require('./family');
const { isAdFree } = require('./adPolicy');
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const IOS_ID = 'com.goldenepics.risequest', ANDROID_ID = 'com.risequest.app';
const roots = ['AppleRootCA-G2.cer', 'AppleRootCA-G3.cer'].map(name => fs.readFileSync(path.join(__dirname, '../certificates', name)));
const appleVerifiers = [Environment.PRODUCTION, Environment.SANDBOX].map(env => new SignedDataVerifier(roots, true, env, IOS_ID, 6816001740));
async function verifiedApple(signed, notification = false) {
  if (typeof signed !== 'string' || signed.length > 30000) throw fail(400, 'Invalid store proof.');
  for (const verifier of appleVerifiers) {
    try { return { verifier, claims: await (notification ? verifier.verifyAndDecodeNotification(signed) : verifier.verifyAndDecodeTransaction(signed)) }; }
    catch (_) { /* Only the configured Apple production/sandbox roots are accepted. */ }
  }
  throw fail(401, 'Apple signature verification failed.');
}
function appleClient(environment) {
  if (!process.env.APPLE_IAP_KEY_BASE64 || !process.env.APPLE_IAP_KEY_ID || !process.env.APPLE_IAP_ISSUER_ID) throw fail(503, 'App Store verification is unavailable.');
  return new AppStoreServerAPIClient(Buffer.from(process.env.APPLE_IAP_KEY_BASE64, 'base64').toString(), process.env.APPLE_IAP_KEY_ID,
    process.env.APPLE_IAP_ISSUER_ID, IOS_ID, environment);
}
let googleClient;
async function playApi(resource, method = 'GET', body) {
  if (!process.env.PLAY_SERVICE_ACCOUNT_BASE64) throw fail(503, 'Google Play verification is unavailable.');
  if (!googleClient) googleClient = new GoogleAuth({ credentials: JSON.parse(Buffer.from(process.env.PLAY_SERVICE_ACCOUNT_BASE64, 'base64').toString()),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const client = await googleClient.getClient();
  const response = await client.request({ url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_ID}/${resource}`,
    method, ...(body ? { data: body } : {}), timeout: 15000 });
  return response.data;
}
function allowedEnvironment(purchase, userId) {
  if (purchase.environment === 'Production') return;
  const testers = String(process.env.STORE_SANDBOX_USER_IDS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!testers.includes(userId.toLowerCase())) throw fail(403, 'Use the configured sandbox tester account for test purchases.');
}
async function verifyPurchase(body, accountId) {
  if (body.store === 'apple') {
    const original = await verifiedApple(body.proof);
    // Re-check with Apple so an old, correctly signed pre-refund receipt cannot
    // establish new entitlements after a refund or revocation.
    const latest = await appleClient(original.claims.environment).getTransactionInfo(original.claims.transactionId);
    const claims = await original.verifier.verifyAndDecodeTransaction(latest.signedTransactionInfo);
    if (claims.transactionId !== original.claims.transactionId) throw fail(401, 'Transaction verification mismatch.');
    return applePurchase(claims, accountId);
  }
  if (body.store !== 'google' || typeof body.proof !== 'string' || !body.proof || body.proof.length > 4096) throw fail(400, 'Invalid store proof.');
  const product = storeProduct(body.productId);
  const segment = product.kind === 'subscription' ? 'subscriptionsv2' : 'productsv2';
  const payload = await playApi(`purchases/${segment}/tokens/${encodeURIComponent(body.proof)}`);
  return googlePurchase(payload, body.productId, accountId, hash(body.proof));
}
async function applyPurchase(prisma, userId, purchase, encryptedToken = undefined, eventId = null) {
  const { points, ...data } = purchase;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    if (eventId && await tx.storeNotification.findUnique({ where: { id: eventId } })) return { duplicate: true };
    const user = await tx.user.findUnique({ where: { id: userId }, select: { disabledAt: true } });
    if (!user || user.disabledAt) throw fail(403, 'Purchase account is unavailable.');
    const previous = await tx.storePurchase.findUnique({ where: { id: data.id } });
    if (previous && previous.userId !== userId) throw fail(403, 'This purchase is already associated with another account.');
    if (previous && (previous.status === 'revoked' || previous.observedAt > data.observedAt)) {
      if (eventId) await tx.storeNotification.create({ data: { id: eventId } });
      return { duplicate: true };
    }
    let pointsGranted = previous?.pointsGranted || 0, pointsRecovered = previous?.pointsRecovered || 0;
    if (data.kind === 'points' && data.status === 'active' && !pointsGranted) {
      pointsGranted = points;
      await tx.risePointsTransaction.create({ data: { id: `store_grant:${data.id}`, userId, delta: points, reason: 'Verified store Rise Points purchase' } });
      await tx.risePointsBalance.upsert({ where: { userId }, create: { userId, balance: points }, update: { balance: { increment: points } } });
    } else if (data.status === 'revoked' && pointsGranted && !pointsRecovered) {
      const wallet = await tx.risePointsBalance.findUnique({ where: { userId } });
      const recover = Math.min(wallet?.balance || 0, pointsGranted);
      if (recover) {
        await tx.risePointsBalance.update({ where: { userId }, data: { balance: { decrement: recover } } });
        await tx.risePointsTransaction.create({ data: { id: `store_revoke:${data.id}`, userId, delta: -recover, reason: 'Refunded store Rise Points purchase' } });
      }
      // Spent points are recorded as unrecovered (granted minus recovered), not
      // converted into a negative balance or silently charged to the user.
      pointsRecovered = recover;
    }
    if (data.store === 'apple' && data.kind === 'subscription' && data.status === 'active' && data.purchasedAt) {
      // An older renewal arriving late must not restore a superseded tier.
      // Conversely, refunding an old period must not expire a newer renewal.
      const newer = await tx.storePurchase.findFirst({ where: { userId, store: 'apple', originalId: data.originalId,
        id: { not: data.id }, purchasedAt: { gt: data.purchasedAt } } });
      if (newer) data.status = 'expired';
      else await tx.storePurchase.updateMany({ where: { userId, store: 'apple', originalId: data.originalId,
        id: { not: data.id }, status: 'active', purchasedAt: { lte: data.purchasedAt } }, data: { status: 'expired' } });
    }
    await tx.storePurchase.upsert({ where: { id: data.id }, create: { ...data, userId, token: encryptedToken, pointsGranted, pointsRecovered },
      update: { ...data, ...(encryptedToken ? { token: encryptedToken } : {}), pointsGranted, pointsRecovered } });
    if (eventId) await tx.storeNotification.create({ data: { id: eventId } });
    return { status: data.status, pointsGranted, pointsRecovered };
  });
}
async function entitlements(prisma, userId) {
  const [purchases, stripe, user] = await Promise.all([
    prisma.storePurchase.findMany({ where: { userId, kind: 'subscription' } }),
    prisma.subscription.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  const result = storeEntitlement(purchases);
  const trial = trialEntitlement(user);
  const complimentary = complimentaryEntitlement(user);
  if (complimentary) return { ...complimentary, trialUsed: trial.trialUsed };
  if (isAdFree(stripe) && !result.adFree) return { tier: 'premium', adFree: true, source: 'stripe', trialUsed: trial.trialUsed };
  return result.adFree ? { ...result, trialUsed: trial.trialUsed } : { ...result, ...trial };
}
function registerStoreBilling(app, { prisma, requireAuth, secret }) {
  const wrap = fn => async (req, res) => { res.set('Cache-Control', 'no-store'); try { await fn(req, res); }
    catch (error) { res.status(error.status || (error.code === 'P2002' ? 409 : 503)).json({ error: error.status ? error.message : 'Store verification is temporarily unavailable. Purchases will be retried; no duplicate rewards will be granted.' }); } };
  const account = userId => prisma.storeAccount.upsert({ where: { userId }, create: { userId }, update: {} });
  app.post('/api/store/trial', requireAuth, wrap(async (req, res) => {
    if (req.auth.provider === 'child') throw fail(403, 'A parent manages subscriptions.');
    // This is a no-card promotional trial, not an auto-renewing subscription.
    await prisma.user.updateMany({ where: { id: req.auth.userId, premiumTrialStartedAt: null }, data: { premiumTrialStartedAt: new Date() } });
    res.json(await entitlements(prisma, req.auth.userId));
  }));
  app.get('/api/store/catalog', requireAuth, wrap(async (req, res) => {
    if (req.auth.provider === 'child') throw fail(403, 'A parent manages purchases.');
    res.json({ accountToken: (await account(req.auth.userId)).id, products: STORE_CATALOG });
  }));
  app.get('/api/store/entitlements', requireAuth, wrap(async (req, res) => {
    let result = await entitlements(prisma, req.auth.userId);
    if (req.auth.provider === 'child') {
      const child = await prisma.childAccount.findUnique({ where: { childId: req.auth.userId } });
      if (child) result = await entitlements(prisma, child.parentId);
    }
    res.json(result);
  }));
  app.post('/api/store/verify', requireAuth, wrap(async (req, res) => {
    if (req.auth.provider === 'child') throw fail(403, 'A parent manages purchases.');
    const owner = await account(req.auth.userId), purchase = await verifyPurchase(req.body, owner.id);
    allowedEnvironment(purchase, req.auth.userId);
    const token = purchase.store === 'google' ? sealDocument(Buffer.from(req.body.proof), secret, purchase.id) : undefined;
    const applied = await applyPurchase(prisma, req.auth.userId, purchase, token);
    res.json({ verified: true, finish: purchase.status === 'active', ...applied, entitlement: await entitlements(prisma, req.auth.userId) });
  }));
  app.post('/api/store/notifications/apple', wrap(async (req, res) => {
    const { claims, verifier } = await verifiedApple(req.body.signedPayload, true);
    if (!claims.notificationUUID) throw fail(400, 'Missing notification identity.');
    if (claims.notificationType === 'TEST') return res.json({ received: true });
    if (!claims.data?.signedTransactionInfo) return res.json({ received: true, noTransaction: true });
    const transaction = await verifier.verifyAndDecodeTransaction(claims.data.signedTransactionInfo);
    const owner = transaction.appAccountToken && await prisma.storeAccount.findUnique({ where: { id: transaction.appAccountToken } });
    if (!owner) return res.json({ received: true, noAccount: true });
    const purchase = applePurchase(transaction, owner.id);
    if (Number.isFinite(claims.signedDate)) purchase.observedAt = new Date(claims.signedDate);
    if (claims.data.signedRenewalInfo && claims.notificationType === 'DID_FAIL_TO_RENEW' && claims.subtype === 'GRACE_PERIOD') {
      const renewal = await verifier.verifyAndDecodeRenewalInfo(claims.data.signedRenewalInfo);
      if (renewal.originalTransactionId === purchase.originalId && renewal.gracePeriodExpiresDate > Date.now()) {
        purchase.status = 'active'; purchase.expiresAt = new Date(renewal.gracePeriodExpiresDate);
      }
    }
    allowedEnvironment(purchase, owner.userId);
    await applyPurchase(prisma, owner.userId, purchase, undefined, `apple:${claims.notificationUUID}`);
    res.json({ received: true });
  }));
  app.post('/api/store/notifications/google', wrap(async (req, res) => {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token || !process.env.PLAY_NOTIFICATION_AUDIENCE || !process.env.PLAY_NOTIFICATION_SERVICE_EMAIL) throw fail(401, 'Unverified notification.');
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience: process.env.PLAY_NOTIFICATION_AUDIENCE });
    const identity = ticket.getPayload();
    if (!identity?.email_verified || identity.email !== process.env.PLAY_NOTIFICATION_SERVICE_EMAIL) throw fail(401, 'Wrong notification sender.');
    const message = req.body.message;
    if (!message?.messageId || typeof message.data !== 'string' || message.data.length > 20000) throw fail(400, 'Invalid notification.');
    const payload = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
    if (payload.packageName !== ANDROID_ID) throw fail(400, 'Wrong application.');
    if (payload.testNotification) return res.json({ received: true });
    const proof = payload.subscriptionNotification?.purchaseToken || payload.oneTimeProductNotification?.purchaseToken || payload.voidedPurchaseNotification?.purchaseToken;
    if (!proof) return res.json({ received: true, noPurchase: true });
    const previous = await prisma.storePurchase.findUnique({ where: { id: `google:${hash(proof)}` } });
    if (!previous?.userId) return res.json({ received: true, noAccount: true });
    const owner = await account(previous.userId), purchase = await verifyPurchase({ store: 'google', productId: previous.productId, proof }, owner.id);
    if (payload.voidedPurchaseNotification) purchase.status = 'revoked';
    allowedEnvironment(purchase, previous.userId);
    await applyPurchase(prisma, previous.userId, purchase, undefined, `google:${message.messageId}`);
    res.json({ received: true });
  }));
}
module.exports = { registerStoreBilling, applyPurchase, entitlements, verifyPurchase, allowedEnvironment, appleClient, verifiedApple };
