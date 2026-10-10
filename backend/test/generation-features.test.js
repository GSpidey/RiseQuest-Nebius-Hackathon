const { generateWakeup } = require('../src/services/wakeupMessage');
const { generateCoachReply } = require('../src/services/coachGeneration');
const saved = {};
const keys = ['OPENAI_API_KEY', 'NEBIUS_API_KEY', 'NEBIUS_TEXT_MODEL', 'AI_TEXT_PROVIDER'];
beforeEach(() => {
  for (const key of keys) saved[key] = process.env[key];
  Object.assign(process.env, { OPENAI_API_KEY: 'test-openai', NEBIUS_API_KEY: 'test-nebius', NEBIUS_TEXT_MODEL: 'test-model', AI_TEXT_PROVIDER: 'nebius' });
});
afterEach(() => { for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key]; });
const coaching = { externalAllowed: true, profile: { ageGroup: 'adult', ageBand: 'adult' }, context: { ageGroup: 'adult' } };
const safe = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
function transport(failNebius = false) {
  return jest.fn(async url => url.endsWith('/moderations') ? { ok: true, json: async () => ({ results: [{ flagged: false }] }) }
    : failNebius && url.includes('nebius.com') ? { ok: false, json: async () => ({ error: { code: 'rate_limit_exceeded' } }) }
    : safe('Choose one small step to start your day.'));
}
function wallet() {
  let balance = 100; const rows = new Map();
  const prisma = {
    userProfile: { findUnique: async () => ({ data: coaching.profile }) }, user: { findUnique: async () => ({ disabledAt: null }) },
    risePointsTransaction: { findUnique: async ({ where }) => rows.get(where.id), create: async ({ data }) => { rows.set(data.id, data); return data; } },
    risePointsBalance: { findUnique: async () => ({ balance }), update: async ({ data }) => { balance -= data.balance.decrement; } },
    $executeRaw: async () => {}, $transaction: async work => work(prisma),
  };
  return { prisma, balance: () => balance };
}
test.each([false, true])('wake-up uses ordered providers and charges once (fallback=%s)', async fallback => {
  const db = wallet(), request = transport(fallback);
  const args = { prisma: db.prisma, userId: 'fixture', input: { label: 'Morning' }, key: 'fixture-request', request };
  const result = await generateWakeup(args);
  expect(result.provider).toBe(fallback ? 'openai' : 'nebius'); expect(result.cost).toBe(25);
  expect((await generateWakeup(args)).replayed).toBe(true); expect(db.balance()).toBe(75);
  expect(request.mock.calls.filter(([url]) => url.endsWith('/chat/completions')).map(([url]) => new URL(url).host))
    .toEqual(fallback ? ['api.tokenfactory.nebius.com', 'api.openai.com'] : ['api.tokenfactory.nebius.com']);
});
test.each([false, true])('coach uses ordered providers with honest missing history (fallback=%s)', async fallback => {
  const request = transport(fallback);
  const result = await generateCoachReply({ coaching, history: [{ role: 'user', content: 'Help me start my morning' }], personality: 'gentle', request });
  expect(result.provider).toBe(fallback ? 'openai' : 'nebius');
  const body = JSON.parse(request.mock.calls.find(([url]) => url.endsWith('/chat/completions'))[1].body);
  expect(body.messages[0].content).toContain('Never invent measurements');
  expect(body.messages[0].content).not.toContain('completedQuests');
});
test('restricted coach makes no moderation or generation requests', async () => {
  const request = jest.fn();
  expect((await generateCoachReply({ coaching: { ...coaching, externalAllowed: false }, history: [], request })).kind).toBe('restricted');
  expect(request).not.toHaveBeenCalled();
});
test('Nemotron direct-answer mode preserves the bounded answer budget', async () => {
  process.env.NEBIUS_TEXT_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
  const request = transport();
  await generateCoachReply({ coaching, history: [], request });
  const body = JSON.parse(request.mock.calls.find(([url]) => url.endsWith('/chat/completions'))[1].body);
  expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  expect(body.max_tokens).toBe(1800);
});
test('wake-up safety refusal never falls through to OpenAI or charges points', async () => {
  const db = wallet(), request = jest.fn(async url => url.endsWith('/moderations')
    ? { ok: true, json: async () => ({ results: [{ flagged: false }] }) }
    : { ok: true, json: async () => ({ choices: [{ message: { refusal: 'Cannot assist' } }] }) });
  expect((await generateWakeup({ prisma: db.prisma, userId: 'fixture', input: {}, request })).cost).toBe(0);
  expect(db.balance()).toBe(100);
  expect(request.mock.calls.filter(([url]) => url.endsWith('/chat/completions'))).toHaveLength(1);
});
