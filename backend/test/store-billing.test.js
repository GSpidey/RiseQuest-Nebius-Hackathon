const { applePurchase, googlePurchase, storeEntitlement, trialEntitlement, complimentaryEntitlement } = require('../src/storeCatalog');
const { applyPurchase, allowedEnvironment } = require('../src/storeBilling');
const now = Date.now(), owner = '4ba30fd8-1cba-484d-a159-65eecf756b35';

test('complimentary membership requires exact operator configuration and an enabled account', () => {
  const user = { id: 'review@example.invalid', role: 'USER' };
  expect(complimentaryEntitlement(user, '')).toBeNull();
  expect(complimentaryEntitlement(user, 'someone-else@example.invalid')).toBeNull();
  expect(complimentaryEntitlement({ ...user, disabledAt: new Date() }, user.id)).toBeNull();
  expect(complimentaryEntitlement(null, user.id)).toBeNull();
  expect(complimentaryEntitlement(user, ' REVIEW@example.invalid ')).toEqual({ tier: 'family', adFree: true, source: 'complimentary' });
  expect(complimentaryEntitlement({ ...user, id: 'review@example.invalid.attacker' }, user.id)).toBeNull();
});
test('server trial expires after seven days and preserves once-only history', () => {
  const user = { premiumTrialStartedAt: new Date(now) };
  expect(trialEntitlement(user, now).adFree).toBe(true);
  expect(trialEntitlement(user, now + 7 * 86400000)).toEqual({ trialUsed: true });
  expect(trialEntitlement({}, now)).toEqual({ trialUsed: false });
});
const apple = { bundleId: 'com.goldenepics.risequest', productId: 'risequest.points.small', appAccountToken: owner,
  transactionId: 'tx1', originalTransactionId: 'tx1', quantity: 1, signedDate: now, purchaseDate: now,
  environment: 'Sandbox', inAppOwnershipType: 'PURCHASED', type: 'Consumable' };
test('store ownership, products and quantities cannot be supplied by an unverified client', () => {
  expect(applePurchase(apple, owner, now).points).toBe(250);
  for (const overrides of [{ bundleId: 'other' }, { appAccountToken: 'other' }, { productId: 'unknown' }, { quantity: 9 }, { type: 'Non-Consumable' }, { inAppOwnershipType: 'FAMILY_SHARED' }]) {
    expect(() => applePurchase({ ...apple, ...overrides }, owner, now)).toThrow();
  }
});
test('pending Google purchases grant nothing; canceled subscriptions remain eligible only until paid expiry', () => {
  const google = { obfuscatedExternalAccountId: owner, productLineItem: [{ productId: 'risequest.points.small', productOfferDetails: { quantity: 1 } }], purchaseStateContext: { purchaseState: 'PENDING' } };
  expect(googlePurchase(google, 'risequest.points.small', owner, 'hash', now).status).toBe('pending');
  expect(() => googlePurchase(google, 'risequest.points.small', 'other', 'hash', now)).toThrow();
  const subscription = { externalAccountIdentifiers: { obfuscatedExternalAccountId: owner }, subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ productId: 'risequest.premium.monthly', expiryTime: new Date(now + 60000).toISOString() }] };
  expect(googlePurchase(subscription, 'risequest.premium.monthly', owner, 'hash', now).status).toBe('active');
  expect(googlePurchase(subscription, 'risequest.premium.monthly', owner, 'hash', now + 60001).status).not.toBe('active');
});
test('expired/refunded subscriptions are not Premium, active store purchases are ad-free', () => {
  const base = { kind: 'subscription', status: 'active', productId: 'risequest.premium.monthly', expiresAt: new Date(now + 60000), store: 'apple' };
  expect(storeEntitlement([base], now).adFree).toBe(true);
  expect(storeEntitlement([{ ...base, status: 'revoked' }], now).adFree).toBe(false);
  expect(storeEntitlement([base], now + 60001).adFree).toBe(false);
});
function ledger() {
  const rows = new Map(), notifications = new Map(), entries = new Map(); let balance = 0;
  const tx = { $executeRaw: async () => {},
    user: { findUnique: async () => ({ disabledAt: null }) },
    storePurchase: { findUnique: async ({ where }) => rows.get(where.id), updateMany: jest.fn(), upsert: async ({ where, create, update }) => rows.set(where.id, rows.has(where.id) ? { ...rows.get(where.id), ...update } : create) },
    storeNotification: { findUnique: async ({ where }) => notifications.get(where.id), create: async ({ data }) => notifications.set(data.id, data) },
    risePointsTransaction: { create: async ({ data }) => { if (entries.has(data.id)) throw Error('duplicate'); entries.set(data.id, data); } },
    risePointsBalance: { findUnique: async () => ({ balance }), upsert: async ({ update }) => { balance += update.balance.increment; }, update: async ({ data }) => { balance -= data.balance.decrement; } },
  };
  return { prisma: { $transaction: fn => fn(tx) }, rows, entries, balance: () => balance, spend: n => { balance -= n; } };
}
test('verified points and webhook replays grant once, refunds never make balance negative', async () => {
  const db = ledger(), purchase = applePurchase(apple, owner, now);
  await applyPurchase(db.prisma, 'user', purchase);
  await applyPurchase(db.prisma, 'user', purchase, undefined, 'event1');
  await applyPurchase(db.prisma, 'user', purchase, undefined, 'event1');
  expect(db.balance()).toBe(250); expect(db.entries.size).toBe(1);
  await expect(applyPurchase(db.prisma, 'other', purchase)).rejects.toMatchObject({ status: 403 });
  db.spend(200);
  await applyPurchase(db.prisma, 'user', { ...purchase, status: 'revoked', observedAt: new Date(now + 1000) }, undefined, 'refund');
  expect(db.balance()).toBe(0); expect(db.rows.get(purchase.id).pointsRecovered).toBe(50);
  await applyPurchase(db.prisma, 'user', purchase);
  expect(db.balance()).toBe(0); expect(db.entries.size).toBe(2);
});
test('sandbox receipts require an explicitly configured test account', () => {
  const old = process.env.STORE_SANDBOX_USER_IDS; process.env.STORE_SANDBOX_USER_IDS = 'tester@example.invalid';
  try {
    expect(() => allowedEnvironment({ environment: 'Sandbox' }, 'ordinary@example.invalid')).toThrow();
    expect(() => allowedEnvironment({ environment: 'Sandbox' }, 'tester@example.invalid')).not.toThrow();
  } finally { if (old === undefined) delete process.env.STORE_SANDBOX_USER_IDS; else process.env.STORE_SANDBOX_USER_IDS = old; }
});
