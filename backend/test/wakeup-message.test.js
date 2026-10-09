const { generateWakeup, replay } = require('../src/services/wakeupMessage');
function database(profile = { ageGroup: 'adult', ageBand: 'adult' }) {
  const rows = new Map(); let balance = 100;
  const prisma = {
    userProfile: { findUnique: async () => ({ data: profile }) }, user: { findUnique: async () => ({ disabledAt: null }) },
    risePointsTransaction: { findUnique: async ({ where }) => rows.get(where.id), create: jest.fn(async ({ data }) => { rows.set(data.id, data); return data; }) },
    risePointsBalance: { findUnique: async () => ({ balance }), update: async ({ data }) => { balance -= data.balance.decrement; } },
    $executeRaw: async () => {}, $transaction: async work => work(prisma),
  };
  return { prisma, rows, balance: () => balance };
}
beforeEach(() => { process.env.OPENAI_API_KEY = 'synthetic-key'; });
afterEach(() => { delete process.env.OPENAI_API_KEY; });
const safeRequest = async url => ({ ok: true, json: async () => url.endsWith('/moderations') ? { results: [{ flagged: false }] } : { choices: [{ message: { content: 'Good morning. Start with one gentle step.' } }] } });
test('successful generation is charged once and response replays after a transport retry', async () => {
  const db = database(), request = jest.fn(safeRequest);
  const args = { prisma: db.prisma, userId: 'owner', input: { label: 'Wake up' }, key: 'same-request', request };
  const first = await generateWakeup(args); expect(first.cost).toBe(25); expect(db.balance()).toBe(75);
  const calls = request.mock.calls.length; const again = await generateWakeup(args);
  expect(again.message).toBe(first.message); expect(again.replayed).toBe(true); expect(db.balance()).toBe(75);
  expect(request.mock.calls).toHaveLength(calls); expect(db.prisma.risePointsTransaction.create).toHaveBeenCalledTimes(1);
});
test('unconfigured, failed or unsafe provider responses never charge or claim a refund', async () => {
  const db = database();
  for (const request of [async () => { throw Error('offline'); }, async () => ({ ok: true, json: async () => ({ results: [{ flagged: true }] }) })]) {
    const result = await generateWakeup({ prisma: db.prisma, userId: 'owner', input: {}, request });
    expect(result.provider).toBe('curated'); expect(result.cost).toBe(0); expect(result.refunded).toBeUndefined();
  }
  delete process.env.OPENAI_API_KEY;
  expect((await generateWakeup({ prisma: db.prisma, userId: 'owner', input: {}, request: safeRequest })).cost).toBe(0);
  expect(db.balance()).toBe(100); expect(db.prisma.risePointsTransaction.create).not.toHaveBeenCalled();
});
test('parent-managed child receives no external call and no debit', async () => {
  const db = database({ ageGroup: 'teen', ageBand: '16to17', countryCode: 'US', managedByParent: true });
  const request = jest.fn();
  expect((await generateWakeup({ prisma: db.prisma, userId: 'child', input: {}, request })).cost).toBe(0);
  expect(request).not.toHaveBeenCalled(); expect(db.balance()).toBe(100);
});
test('idempotency reference cannot be reused with different input', () => {
  expect(() => replay({ metadata: { requestHash: 'first', response: {} } }, 'changed')).toThrow(/different message/);
});
test('GPT-5 mini wake-up generation uses supported bounded parameters', async () => {
  const previous = process.env.OPENAI_TEXT_MODEL;
  process.env.OPENAI_TEXT_MODEL = 'gpt-5-mini';
  try {
    const db = database(), request = jest.fn(safeRequest);
    const result = await generateWakeup({ prisma: db.prisma, userId: 'owner', input: {}, request });
    expect(result.provider).toBe('openai');
    const body = JSON.parse(request.mock.calls.find(([url]) => url.endsWith('/chat/completions'))[1].body);
    expect(body.model).toBe('gpt-5-mini');
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning_effort).toBe('minimal');
    expect(body.max_completion_tokens).toBe(512);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_TEXT_MODEL;
    else process.env.OPENAI_TEXT_MODEL = previous;
  }
});
