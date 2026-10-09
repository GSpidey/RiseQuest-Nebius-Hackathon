const { generateSubtasks } = require('../src/services/aiSubtasks');
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const input = { title: 'Organize my desk', description: 'Start small',
  coaching: { externalAllowed: true, profile: { ageGroup: 'adult' }, context: { goals: ['focus'] } } };
const response = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
beforeEach(() => {
  process.env.QUEST_AI_PROVIDER = 'nebius';
  process.env.NEBIUS_API_KEY = 'synthetic-nebius';
  process.env.NEBIUS_TEXT_MODEL = 'nvidia/test-model';
  process.env.OPENAI_API_KEY = 'synthetic-openai';
  delete process.env.OPENAI_BASE_URL;
  global.fetch = jest.fn(async url => url.endsWith('/moderations')
    ? { ok: true, json: async () => ({ results: [{ flagged: false }] }) }
    : response('[{"title":"Clear one corner","estimatedMinutes":5}]'));
});
afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; });
const generationCalls = () => global.fetch.mock.calls.filter(([url]) => url.endsWith('/chat/completions'));
test('adult generation uses Nebius; moderation stays OpenAI', async () => {
  expect((await generateSubtasks(input)).provider).toBe('nebius');
  expect(generationCalls()).toHaveLength(1);
  expect(generationCalls()[0][0]).toContain('api.tokenfactory.nebius.com');
  expect(global.fetch.mock.calls.filter(([u]) => u.endsWith('/moderations')).every(([u]) => u.startsWith('https://api.openai.com/'))).toBe(true);
});
test.each(['http', 'timeout', 'invalid-json', 'invalid-step'])('Nebius %s falls back to OpenAI', async kind => {
  const healthy = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (!url.includes('tokenfactory')) return healthy(url, options);
    if (kind === 'timeout') throw new Error('timeout');
    if (kind === 'http') return { ok: false, status: 429 };
    return response(kind === 'invalid-json' ? 'not json' : '[null]');
  });
  expect((await generateSubtasks(input)).provider).toBe('openai');
  expect(generationCalls()).toHaveLength(2);
});
test('teen retains existing OpenAI route', async () => {
  expect((await generateSubtasks({ ...input, coaching: { ...input.coaching, profile: { ageGroup: 'teen' } } })).provider).toBe('openai');
  expect(generationCalls().some(([u]) => u.includes('tokenfactory'))).toBe(false);
});
test('child sends nothing to either provider', async () => {
  expect((await generateSubtasks({ ...input, coaching: { externalAllowed: false, profile: { ageGroup: 'child' } } })).source).toBe('curated');
  expect(global.fetch).not.toHaveBeenCalled();
});
test('safety rejection never calls generation', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ results: [{ flagged: true }] }) });
  expect((await generateSubtasks(input)).source).toBe('curated');
  expect(generationCalls()).toHaveLength(0);
});
test('both providers unavailable returns honestly labelled prepared steps', async () => {
  const healthy = global.fetch.getMockImplementation();
  global.fetch.mockImplementation((url, options) => url.endsWith('/moderations') ? healthy(url, options) : Promise.reject(Error('offline')));
  expect((await generateSubtasks(input)).source).toBe('offline');
});
test('unset opt-in preserves existing provider', async () => {
  delete process.env.QUEST_AI_PROVIDER;
  expect((await generateSubtasks(input)).provider).toBe('openai');
});
