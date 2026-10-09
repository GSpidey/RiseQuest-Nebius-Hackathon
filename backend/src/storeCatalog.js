const STORE_CATALOG = Object.freeze({
  'risequest.premium.monthly': { kind: 'subscription', tier: 'premium', plan: 'monthly' },
  'risequest.premium.yearly': { kind: 'subscription', tier: 'premium', plan: 'yearly' },
  'risequest.family.monthly': { kind: 'subscription', tier: 'family', plan: 'family_monthly' },
  'risequest.family.yearly': { kind: 'subscription', tier: 'family', plan: 'family_yearly' },
  'risequest.points.small': { kind: 'points', points: 250, pack: 'small' },
  'risequest.points.medium': { kind: 'points', points: 550, pack: 'medium' },
  'risequest.points.large': { kind: 'points', points: 1150, pack: 'large' },
  'risequest.points.mega': { kind: 'points', points: 3125, pack: 'mega' },
});
const invalid = message => Object.assign(new Error(message), { status: 400 });
function storeProduct(id) {
  if (!Object.hasOwn(STORE_CATALOG, id)) throw invalid('Unknown store product.');
  return STORE_CATALOG[id];
}
function applePurchase(claims, accountId, now = Date.now()) {
  const product = storeProduct(claims.productId);
  if (claims.bundleId !== 'com.goldenepics.risequest' || claims.appAccountToken?.toLowerCase() !== accountId.toLowerCase() ||
    !claims.transactionId || !claims.originalTransactionId || claims.quantity !== 1 || !Number.isFinite(claims.signedDate) ||
    !Number.isFinite(claims.purchaseDate) || claims.purchaseDate > now + 300000 ||
    !['Production', 'Sandbox'].includes(claims.environment) || claims.inAppOwnershipType !== 'PURCHASED' ||
    claims.type !== (product.kind === 'points' ? 'Consumable' : 'Auto-Renewable Subscription')) throw invalid('Store purchase does not match this account or product.');
  if (product.kind === 'subscription' && !Number.isFinite(claims.expiresDate)) throw invalid('Subscription expiry is missing.');
  return { id: `apple:${claims.transactionId}`, store: 'apple', productId: claims.productId, kind: product.kind,
    originalId: claims.originalTransactionId, environment: claims.environment,
    status: claims.revocationDate ? 'revoked' : product.kind === 'subscription' && claims.expiresDate <= now ? 'expired' : 'active',
    expiresAt: product.kind === 'subscription' ? new Date(claims.expiresDate) : null,
    purchasedAt: new Date(claims.purchaseDate), observedAt: new Date(claims.signedDate), points: product.points || 0 };
}
function googlePurchase(payload, productId, accountId, tokenHash, now = Date.now()) {
  const product = storeProduct(productId), subscription = product.kind === 'subscription';
  const owner = subscription ? payload.externalAccountIdentifiers?.obfuscatedExternalAccountId : payload.obfuscatedExternalAccountId;
  if (owner !== accountId) throw invalid('Store purchase belongs to another account.');
  const line = subscription ? payload.lineItems?.find(v => v.productId === productId) : payload.productLineItem?.find(v => v.productId === productId);
  if (!line || (!subscription && line.productOfferDetails?.quantity !== 1)) throw invalid('Store product or quantity does not match.');
  const expiry = subscription ? new Date(line.expiryTime) : null;
  if (subscription && !Number.isFinite(expiry.getTime())) throw invalid('Subscription expiry is missing.');
  const state = subscription ? payload.subscriptionState : payload.purchaseStateContext?.purchaseState;
  const active = subscription
    ? ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(state) && expiry.getTime() > now
    : state === 'PURCHASED';
  const revoked = subscription ? state === 'SUBSCRIPTION_STATE_EXPIRED' : state === 'CANCELLED';
  return { id: `google:${tokenHash}`, store: 'google', productId, kind: product.kind, originalId: tokenHash,
    environment: (payload.testPurchase || payload.testPurchaseContext) ? 'Sandbox' : 'Production',
    status: active ? 'active' : revoked ? (subscription ? 'expired' : 'revoked') : 'pending', expiresAt: expiry,
    observedAt: new Date(now), points: product.points || 0 };
}
function storeEntitlement(rows, now = Date.now()) {
  const active = rows.filter(r => r.kind === 'subscription' && r.status === 'active' && new Date(r.expiresAt).getTime() > now);
  const family = active.find(r => STORE_CATALOG[r.productId]?.tier === 'family');
  const chosen = family || active.sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];
  return chosen ? { tier: family ? 'family' : 'premium', adFree: true, endDate: chosen.expiresAt, source: chosen.store } : { tier: 'free', adFree: false };
}
function trialEntitlement(user, now = Date.now()) {
  const start = user?.premiumTrialStartedAt && new Date(user.premiumTrialStartedAt).getTime();
  const end = start && start + 7 * 86400000;
  return { trialUsed: !!start, ...(end > now ? { tier: 'trial', adFree: true, startDate: new Date(start), endDate: new Date(end), source: 'trial' } : {}) };
}
// Operator-funded membership, independent of payment records. No client field
// can grant this access. Used for the ordinary, disclosed store-review account.
function complimentaryEntitlement(user, configured = process.env.COMPLIMENTARY_PREMIUM_USER_IDS) {
  if (!user?.id || user.disabledAt) return null;
  const members = String(configured || '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
  return members.includes(user.id.toLowerCase())
    ? { tier: 'family', adFree: true, source: 'complimentary' } : null;
}
module.exports = { STORE_CATALOG, storeProduct, applePurchase, googlePurchase, storeEntitlement, trialEntitlement, complimentaryEntitlement };
