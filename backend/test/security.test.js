process.env.NODE_ENV = 'test';
process.env.AUTH_JWT_SECRET = 'isolated-test-secret-not-a-production-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
const jwt = require('jsonwebtoken');
const { authentication, ownRequest, pointPurchase, validPurchasedPoints, walletTransaction } = require('../src/security');
const { rewardFor, spendFor } = require('../src/walletPolicy');

function response() { return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }; }
const token = (claims = {}) => jwt.sign({ sub: 'owner@example.com', ...claims }, process.env.AUTH_JWT_SECRET, { expiresIn: '1h' });

test.each([null, 'invalid', token({ sub: '' })])('rejects missing/invalid identity %s', async value => {
  const prisma = { user: { findUnique: jest.fn() } }, res = response(), next = jest.fn();
  await authentication(prisma, process.env.AUTH_JWT_SECRET)({ headers: { authorization: value && `Bearer ${value}` } }, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
test.each([null, { id: 'owner@example.com', disabledAt: new Date() }])('rejects deleted or disabled account', async user => {
  const res = response(), next = jest.fn();
  await authentication({ user: { findUnique: jest.fn().mockResolvedValue(user) } }, process.env.AUTH_JWT_SECRET)({ headers: { authorization: `Bearer ${token()}` } }, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(user ? 403 : 401);
});
test('authenticates existing JWT against the current database user', async () => {
  const req = { headers: { authorization: `Bearer ${token()}` } }, next = jest.fn();
  await authentication({ user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner@example.com', role: 'SUPERADMIN' }) } }, process.env.AUTH_JWT_SECRET)(req, response(), next);
  expect(req.auth.role).toBe('SUPERADMIN'); expect(next).toHaveBeenCalled();
});
test.each(['params', 'query', 'body', 'metadata'])('rejects cross-account %s', field => {
  const req = { auth: { userId: 'owner@example.com' }, params: {}, query: {}, body: {} };
  if (field === 'metadata') req.body.metadata = { userId: 'victim@example.com' }; else req[field].userId = 'victim@example.com';
  const res = response(), next = jest.fn(); ownRequest(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
});
test('overrides client fulfillment metadata with server catalog', () => {
  const req = { auth: { userId: 'owner@example.com' }, body: { amount: 299, currency: 'usd', metadata: { type: 'risepoints', risePoints: 250, app: 'attacker' } } };
  const next = jest.fn(); pointPurchase(req, response(), next);
  expect(next).toHaveBeenCalled(); expect(req.body.metadata).toEqual({ app: 'RiseQuest', type: 'risepoints', packageId: 'small', risePoints: '250', userId: 'owner@example.com' });
});
test.each([1, -299, 299.5, 999999])('rejects altered purchase amount %s', amount => {
  const res = response(), next = jest.fn();
  pointPurchase({ auth: { userId: 'owner' }, body: { amount, currency: 'usd', metadata: { type: 'risepoints', risePoints: 250 } } }, res, next);
  expect(res.status).toHaveBeenCalledWith(400); expect(next).not.toHaveBeenCalled();
});
test('only successful matching owner payments fulfill points', () => {
  const pi = { status: 'succeeded', currency: 'usd', amount: 299, amount_received: 299, metadata: { app: 'RiseQuest', type: 'risepoints', userId: 'owner', risePoints: 250 } };
  expect(validPurchasedPoints(pi, 'owner')).toBe(true);
  expect(validPurchasedPoints(pi, 'other')).toBe(false);
  expect(validPurchasedPoints({ ...pi, status: 'processing' }, 'owner')).toBe(false);
  expect(validPurchasedPoints({ ...pi, amount_received: 1 }, 'owner')).toBe(false);
});
test('daily reward receipt is stable, bounded and account scoped', async () => {
  const a = await rewardFor({}, 'owner', 'Daily login bonus'), b = await rewardFor({}, 'owner', 'Daily login bonus');
  expect(a).toEqual(b); expect(a.amount).toBe(2);
  expect((await rewardFor({}, 'other', 'Daily login bonus')).id).not.toBe(a.id);
});
test('quest rewards require ownership and completed steps', async () => {
  const prisma = { quest: { findUnique: jest.fn().mockResolvedValue({ id: 'q', userId: 'other', subtasks: [] }) } };
  await expect(rewardFor(prisma, 'owner', 'creating a new quest', { questId: 'q' })).rejects.toThrow();
  prisma.quest.findUnique.mockResolvedValue({ id: 'q', userId: 'owner', subtasks: [{ id: 's', completed: false }] });
  await expect(rewardFor(prisma, 'owner', 'completing a quest step', { questId: 'q', subtaskId: 's' })).rejects.toThrow();
});
test('store price is calculated from known distinct items', () => {
  expect(spendFor({ delta: 320, metadata: { itemIds: ['theme_nature', 'sound_birds'] } }).amount).toBe(320);
  expect(() => spendFor({ delta: 1, metadata: { itemIds: ['theme_nature'] } })).toThrow();
  expect(() => spendFor({ delta: 400, metadata: { itemIds: ['theme_nature', 'theme_nature'] } })).toThrow();
  expect(() => spendFor({ delta: 5 })).toThrow();
});
test('wallet acquires transaction-scoped lock before reading balance', async () => {
  const calls = [], tx = { $executeRaw: async () => calls.push('lock') };
  await walletTransaction({ $transaction: cb => cb(tx) }, 'owner', async () => calls.push('write'));
  expect(calls).toEqual(['lock', 'write']);
});
