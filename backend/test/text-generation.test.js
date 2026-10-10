const { generateText } = require('../src/services/textGeneration');
const saved = { ...process.env };
const input = { coaching: { externalAllowed: true, profile: { ageGroup: 'adult' } },
  safetyInput: 'Start my morning', messages: [{ role: 'user', content: 'Start my morning' }] };
const safe = { ok: true, json: async () => ({ results: [{ flagged: false }] }) };
const answer = choice => ({ ok: true, json: async () => ({ choices: [choice] }) });
beforeEach(() => {
  process.env.AI_TEXT_PROVIDER = 'nebius'; process.env.NEBIUS_API_KEY = 'test';
  process.env.NEBIUS_TEXT_MODEL = 'test'; process.env.OPENAI_API_KEY = 'test';
});
afterEach(() => { process.env = { ...saved }; });
test.each(['refusal', 'content_filter', 'http-policy'])('%s stops without fallback', async reason => {
  const request = jest.fn(async url => url.endsWith('/moderations') ? safe :
    reason === 'http-policy' ? { ok: false, json: async () => ({ error: { code: 'content_policy_violation' } }) } :
      answer(reason === 'refusal' ? { message: { refusal: 'Cannot help' } } : { finish_reason: 'content_filter' }));
  expect((await generateText({ ...input, request })).kind).toBe('blocked');
  expect(request.mock.calls.filter(([u]) => u.endsWith('/chat/completions'))).toHaveLength(1);
});
test('output moderation rejection never asks fallback provider', async () => {
  let screenings = 0;
  const request = jest.fn(async url => url.endsWith('/moderations') ?
    { ok: true, json: async () => ({ results: [{ flagged: ++screenings > 1 }] }) } : answer({ message: { content: 'Generated message' } }));
  expect((await generateText({ ...input, request })).kind).toBe('blocked');
  expect(request.mock.calls.filter(([u]) => u.endsWith('/chat/completions'))).toHaveLength(1);
});
test('output moderation outage stops the chain', async () => {
  let screenings = 0;
  const request = jest.fn(async url => {
    if (!url.endsWith('/moderations')) return answer({ message: { content: 'Generated message' } });
    if (++screenings > 1) throw Error('offline');
    return safe;
  });
  await expect(generateText({ ...input, request })).rejects.toThrow();
  expect(request.mock.calls.filter(([u]) => u.endsWith('/chat/completions'))).toHaveLength(1);
});
test('restricted profile sends nothing', async () => {
  const request = jest.fn();
  expect((await generateText({ ...input, coaching: { externalAllowed: false }, request })).kind).toBe('restricted');
  expect(request).not.toHaveBeenCalled();
});
test('invalid result falls back and validates again', async () => {
  const request = jest.fn(async url => url.endsWith('/moderations') ? safe : answer({ message: { content: url.includes('tokenfactory') ? 'invalid' : 'valid' } }));
  expect(await generateText({ ...input, request, validate: v => v === 'valid' ? v : null })).toMatchObject({ kind: 'generated', provider: 'openai', value: 'valid' });
});
