process.env.NODE_ENV = 'test';
process.env.AUTH_JWT_SECRET = 'route-tests-only';
process.env.STRIPE_SECRET_KEY = 'sk_test_no_external_calls';
const mockPrisma = {
  user: { findUnique: jest.fn() }, quest: { findUnique: jest.fn(), findMany: jest.fn() },
  subscription: { findUnique: jest.fn(), findMany: jest.fn() }, stripeWebhookEvent: { findUnique: jest.fn(), upsert: jest.fn() },
  userProfile: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  storePurchase: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn(fn => fn(mockPrisma)),
};
jest.mock('../src/prisma', () => ({ getPrisma: () => mockPrisma }));
const mockStripe = { paymentIntents: { create: jest.fn(), retrieve: jest.fn() }, subscriptions: { update: jest.fn(), create: jest.fn() } };
jest.mock('stripe', () => () => mockStripe);
const jwt = require('jsonwebtoken');
const app = require('../server');
let server, base;
beforeAll(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
afterAll(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { jest.clearAllMocks(); mockPrisma.user.findUnique.mockResolvedValue({ id: 'owner@example.com', role: 'USER' }); });
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ sub: 'owner@example.com' }, process.env.AUTH_JWT_SECRET, { expiresIn: '1h' })}` });
async function request(method, path, body, authenticated = false) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'isolated_request_123', ...(authenticated ? auth() : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test.each([
  ['POST', '/api/quests'], ['GET', '/api/quests/q'], ['DELETE', '/api/quests/q'],
  ['PATCH', '/api/quests/q/subtasks/s'], ['GET', '/api/users/owner/quests'], ['GET', '/api/users/owner/quest-stats'],
  ['GET', '/api/wallet/balance'], ['GET', '/api/wallet/transactions'], ['POST', '/api/wallet/award'], ['POST', '/api/wallet/spend'],
  ['POST', '/api/wallet/claim-rise-points'], ['POST', '/api/create-payment-intent'], ['POST', '/api/create-subscription'],
  ['POST', '/api/stripe/payment-intent/payment-sheet'], ['POST', '/api/stripe/subscription/payment-sheet'],
  ['POST', '/api/cancel-subscription'], ['GET', '/api/analytics'],
  ['GET', '/api/me/preferences'], ['PUT', '/api/me/preferences'],
  ['GET', '/api/me/ad-policy'],
  ['GET', '/api/store/catalog'], ['GET', '/api/store/entitlements'], ['POST', '/api/store/verify'],
  ['POST', '/api/auth/apple/link'],
  ['GET', '/api/family'], ['POST', '/api/family/consents'], ['POST', '/api/family/consents/c/document'],
  ['POST', '/api/family/consents/c/withdraw'], ['POST', '/api/family/children'], ['POST', '/api/family/children/c/session'],
  ['DELETE', '/api/family/children/c'], ['GET', '/api/admin/family/consents'],
])('%s %s rejects unauthenticated access', async (method, path) => {
  expect((await request(method, path, method === 'GET' ? null : {})).status).toBe(401);
});
test('authenticated ordinary account cannot access admin analytics', async () => {
  expect((await request('GET', '/api/analytics', null, true)).status).toBe(403);
});

test('ad eligibility checks authenticated paid records and reveals no wellness data', async () => {
  mockPrisma.userProfile.findUnique.mockResolvedValue({ completedAt: new Date(), data: { ageBand: 'adult', supportConditions: ['adhd'] } });
  mockPrisma.subscription.findMany.mockResolvedValue([{ status: 'active' }]);
  const res = await request('GET', '/api/me/ad-policy?userId=other@example.com', null, true);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ eligible: false, adFree: true });
  expect(mockPrisma.subscription.findMany).toHaveBeenCalledWith({ where: { userId: 'owner@example.com' } });
});
test('quest ownership is checked before mutation', async () => {
  mockPrisma.quest.findUnique.mockResolvedValue({ id: 'q', userId: 'other@example.com' });
  expect((await request('PATCH', '/api/quests/q/subtasks/s', { completed: true }, true)).status).toBe(404);
});
test('cross-account wallet and subscriptions never reach Stripe', async () => {
  expect((await request('POST', '/api/stripe/subscription/payment-sheet', { customerEmail: 'other@example.com' }, true)).status).toBe(403);
  expect((await request('GET', '/api/wallet/balance?userId=other@example.com', null, true)).status).toBe(403);
  expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
});
test('subscription cancellation checks stored ownership first', async () => {
  mockPrisma.subscription.findUnique.mockResolvedValue({ userId: 'other@example.com' });
  expect((await request('POST', '/api/cancel-subscription', { subscriptionId: 'sub_other' }, true)).status).toBe(404);
  expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
});
test('altered point price never reaches Stripe', async () => {
  expect((await request('POST', '/api/create-payment-intent', { amount: 1, currency: 'usd', metadata: { type: 'risepoints', risePoints: 3125 } }, true)).status).toBe(400);
  expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
});
test('disabled user rejected on protected route', async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'owner@example.com', disabledAt: new Date() });
  expect((await request('GET', '/api/me', null, true)).status).toBe(403);
});

test('preferences derive owner from JWT, never a submitted user id', async () => {
  mockPrisma.userProfile.findUnique.mockResolvedValue(null);
  mockPrisma.userProfile.create.mockImplementation(async ({ data }) => ({ ...data, version: 1 }));
  const res = await request('PUT', '/api/me/preferences', { userId: 'other@example.com', version: 0, complete: true, profile: { ageGroup: 'adult', preferences: { analyticsOptIn: false } } }, true);
  expect(res.status).toBe(200);
  expect(mockPrisma.userProfile.create.mock.calls[0][0].data.userId).toBe('owner@example.com');
});
test('stale version is rejected without overwriting newer settings', async () => {
  mockPrisma.userProfile.findUnique.mockResolvedValue({ version: 3, data: {} });
  expect((await request('PUT', '/api/me/preferences', { version: 1, profile: {} }, true)).status).toBe(409);
  expect(mockPrisma.userProfile.updateMany).not.toHaveBeenCalled();
});
test('child checkbox cannot complete parental verification', async () => {
  mockPrisma.userProfile.findUnique.mockResolvedValue(null);
  expect((await request('PUT', '/api/me/preferences', { version: 0, complete: true, profile: { ageGroup: 'child', parentalConsent: true } }, true)).status).toBe(403);
  expect(mockPrisma.userProfile.create).not.toHaveBeenCalled();
});
test('child coaching stays curated without storing conversation or calling providers', async () => {
  mockPrisma.userProfile.findUnique.mockResolvedValue({ data: { ageGroup: 'child' } });
  const res = await request('POST', '/api/coach/chat', { message: 'help with homework' }, true);
  expect(res.status).toBe(200);
  expect((await res.json()).provider).toBe('curated');
});
