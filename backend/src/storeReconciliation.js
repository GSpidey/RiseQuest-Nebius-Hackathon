const { applyPurchase, verifyPurchase, allowedEnvironment, appleClient, verifiedApple } = require('./storeBilling');
const { applePurchase } = require('./storeCatalog');
const { openDocument } = require('./family');
const unavailable = () => { throw Error('Store reconciliation could not verify the recorded purchase.'); };

async function refreshPurchase(row, owner, secret, deps = {}) {
  const verify = deps.verifyPurchase || verifyPurchase;
  if (row.store === 'google') {
    if (!row.token) return unavailable();
    const proof = openDocument(row.token, secret, row.id).toString();
    const purchase = await verify({ store: 'google', productId: row.productId, proof }, owner.id);
    if (purchase.id !== row.id || purchase.environment !== row.environment) return unavailable();
    return [purchase];
  }
  if (row.store !== 'apple') return unavailable();
  const client = (deps.appleClient || appleClient)(row.environment);
  const signed = deps.verifiedApple || verifiedApple;
  if (row.kind === 'points') {
    const result = await client.getTransactionInfo(row.id.slice('apple:'.length));
    const { claims } = await signed(result.signedTransactionInfo);
    const purchase = applePurchase(claims, owner.id);
    if (purchase.id !== row.id || purchase.environment !== row.environment) return unavailable();
    return [purchase];
  }
  const result = await client.getAllSubscriptionStatuses(row.originalId);
  if (result.bundleId !== 'com.goldenepics.risequest' || result.environment !== row.environment) return unavailable();
  const entries = (result.data || []).flatMap(group => group.lastTransactions || [])
    .filter(entry => entry.originalTransactionId === row.originalId);
  if (!entries.length) return unavailable();
  const purchases = [];
  for (const entry of entries) {
    if (![1, 2, 3, 4, 5].includes(entry.status)) return unavailable();
    const { claims, verifier } = await signed(entry.signedTransactionInfo);
    const purchase = applePurchase(claims, owner.id);
    if (purchase.originalId !== row.originalId || purchase.environment !== row.environment || purchase.kind !== 'subscription') return unavailable();
    if (entry.status === 5) purchase.status = 'revoked';
    else if ([2, 3].includes(entry.status)) purchase.status = 'expired';
    else if (entry.status === 4) {
      const renewal = await verifier.verifyAndDecodeRenewalInfo(entry.signedRenewalInfo);
      if (renewal.originalTransactionId !== row.originalId || renewal.environment !== row.environment || !Number.isFinite(renewal.gracePeriodExpiresDate)) return unavailable();
      purchase.expiresAt = new Date(renewal.gracePeriodExpiresDate);
      purchase.status = renewal.gracePeriodExpiresDate > Date.now() ? 'active' : 'expired';
      purchase.observedAt = new Date(Math.max(claims.signedDate, renewal.signedDate || 0));
    }
    purchases.push(purchase);
  }
  return purchases;
}

function configuredStores(env = process.env) {
  return [env.PLAY_SERVICE_ACCOUNT_BASE64 && 'google',
    env.APPLE_IAP_KEY_BASE64 && env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && 'apple'].filter(Boolean);
}
async function reconcileBatch(prisma, secret, { stores = configuredStores(), now = new Date(), refresh = refreshPurchase, apply = applyPurchase } = {}) {
  const report = { checked: 0, updated: 0, failed: 0 };
  if (!stores.length) return report;
  const rows = await prisma.storePurchase.findMany({ where: { store: { in: stores }, userId: { not: null },
    user: { disabledAt: null }, OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lt: new Date(now.getTime() - 3600000) } }] },
    orderBy: [{ lastReconciledAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 50 });
  for (const row of rows) {
    // Persist the attempt time even on an outage so failures cannot starve the
    // rest of the queue. Do not change entitlement status on transport errors.
    await prisma.storePurchase.updateMany({ where: { id: row.id, userId: row.userId }, data: { lastReconciledAt: now } });
    report.checked++;
    try {
      const owner = await prisma.storeAccount.findUnique({ where: { userId: row.userId } });
      if (!owner) continue;
      const purchases = await refresh(row, owner, secret);
      for (const purchase of purchases) {
        allowedEnvironment(purchase, row.userId);
        await apply(prisma, row.userId, purchase);
        report.updated++;
      }
    } catch (_) { report.failed++; } // Never log receipts, tokens or provider bodies.
  }
  return report;
}
function startStoreReconciliation(prisma, secret) {
  if (process.env.NODE_ENV === 'test') return;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const report = await reconcileBatch(prisma, secret);
      if (report.failed) console.warn(`Store reconciliation: ${report.failed} verification attempts will retry.`);
    } catch (_) { console.warn('Store reconciliation will retry.'); }
    finally { busy = false; }
  };
  const initial = setTimeout(run, 30000), interval = setInterval(run, 15 * 60000);
  initial.unref(); interval.unref();
  return () => { clearTimeout(initial); clearInterval(interval); };
}
module.exports = { refreshPurchase, reconcileBatch, startStoreReconciliation, configuredStores };
