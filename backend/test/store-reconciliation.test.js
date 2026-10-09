const { refreshPurchase, reconcileBatch, configuredStores } = require('../src/storeReconciliation');
const { sealDocument } = require('../src/family');
const { applyPurchase } = require('../src/storeBilling');
const now = Date.now(), owner = { id: 'owner', userId: 'user' };
const row = { id: 'apple:old', userId: 'user', store: 'apple', originalId: 'original', kind: 'subscription', environment: 'Production' };
const claims = { transactionId: 'renewed', originalTransactionId: 'original', appAccountToken: 'owner', bundleId: 'com.goldenepics.risequest',
  productId: 'risequest.premium.monthly', quantity: 1, purchaseDate: now, signedDate: now, expiresDate: now + 3600000,
  environment: 'Production', inAppOwnershipType: 'PURCHASED', type: 'Auto-Renewable Subscription' };
function appleDeps(status, override = {}) {
  return { appleClient: () => ({ getAllSubscriptionStatuses: async () => ({ bundleId: 'com.goldenepics.risequest', environment: 'Production',
    data: [{ lastTransactions: [{ originalTransactionId: 'original', status, signedTransactionInfo: 'signed', signedRenewalInfo: 'renewal' }] }] }) }),
    verifiedApple: async () => ({ claims: { ...claims, ...override }, verifier: { verifyAndDecodeRenewalInfo: async () => ({ originalTransactionId: 'original', environment: 'Production', gracePeriodExpiresDate: now + 7200000, signedDate: now }) } }) };
}
test('Apple status recovery discovers a missed renewal with a new transaction id', async () => {
  const [result] = await refreshPurchase(row, owner, 'secret', appleDeps(1));
  expect(result.id).toBe('apple:renewed'); expect(result.status).toBe('active');
});
test.each([[2, 'expired'], [3, 'expired'], [5, 'revoked']])('Apple status %s does not retain active access', async (status, expected) => {
  expect((await refreshPurchase(row, owner, 'secret', appleDeps(status)))[0].status).toBe(expected);
});
test('Apple verified grace period preserves paid entitlement', async () => {
  const [result] = await refreshPurchase(row, owner, 'secret', appleDeps(4));
  expect(result.status).toBe('active'); expect(result.expiresAt.getTime()).toBe(now + 7200000);
});
test.each([{ appAccountToken: 'other' }, { originalTransactionId: 'other' }, { environment: 'Sandbox' }])('Apple mismatched ownership or chain is rejected', async override => {
  await expect(refreshPurchase(row, owner, 'secret', appleDeps(1, override))).rejects.toThrow();
});
test('Google proof is decrypted only for provider verification and identity must match', async () => {
  const google = { ...row, id: 'google:hash', store: 'google', productId: 'risequest.premium.monthly' };
  google.token = sealDocument(Buffer.from('synthetic-proof'), 'secret', google.id);
  const verifyPurchase = jest.fn(async () => ({ id: google.id, environment: 'Production', status: 'active' }));
  expect((await refreshPurchase(google, owner, 'secret', { verifyPurchase }))[0].status).toBe('active');
  expect(verifyPurchase).toHaveBeenCalledWith({ store: 'google', productId: google.productId, proof: 'synthetic-proof' }, owner.id);
  verifyPurchase.mockResolvedValue({ id: 'google:other', environment: 'Production' });
  await expect(refreshPurchase(google, owner, 'secret', { verifyPurchase })).rejects.toThrow();
});
test('outages persist attempt time without applying fake expiry, and remaining rows continue', async () => {
  const prisma = { storePurchase: { findMany: jest.fn(async () => [row, { ...row, id: 'apple:second' }]), updateMany: jest.fn(async () => ({})) },
    storeAccount: { findUnique: async () => owner } };
  const apply = jest.fn(), refresh = jest.fn().mockRejectedValueOnce(Error('outage')).mockResolvedValueOnce([{ environment: 'Production', status: 'active' }]);
  expect(await reconcileBatch(prisma, 'secret', { stores: ['apple'], refresh, apply })).toEqual({ checked: 2, updated: 1, failed: 1 });
  expect(apply).toHaveBeenCalledTimes(1); expect(prisma.storePurchase.updateMany).toHaveBeenCalledTimes(2);
  expect(prisma.storePurchase.findMany.mock.calls[0][0].where.user).toEqual({ disabledAt: null });
});
test('missing provider setup makes no provider or database calls', async () => {
  expect(configuredStores({})).toEqual([]);
  expect(await reconcileBatch({}, 'secret', { stores: [] })).toEqual({ checked: 0, updated: 0, failed: 0 });
});
test('a disabled account cannot receive a background purchase grant', async () => {
  const tx = { $executeRaw: async () => {}, user: { findUnique: async () => ({ disabledAt: new Date() }) } };
  await expect(applyPurchase({ $transaction: fn => fn(tx) }, 'user', { status: 'active' })).rejects.toMatchObject({ status: 403 });
});
