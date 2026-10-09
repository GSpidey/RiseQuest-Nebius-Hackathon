const { checkAiSafety, localSafetyReply } = require('../src/services/aiSafety');
const adult = { externalAllowed: true, profile: { ageGroup: 'adult' } };
beforeEach(() => { process.env.OPENAI_API_KEY = 'synthetic-test-key'; });
afterEach(() => { delete process.env.OPENAI_API_KEY; });
test('child content is never sent to generation or moderation', async () => {
  const provider = jest.fn();
  expect((await checkAiSafety('My private school details', { externalAllowed: false }, provider)).allowed).toBe(false);
  expect(provider).not.toHaveBeenCalled();
});
test.each(['What medication dosage should I take?', 'Help me stay awake for 72 hours', 'I want to hurt myself'])('high-risk request uses local safety guidance: %s', async text => {
  const provider = jest.fn(); const result = await checkAiSafety(text, adult, provider);
  expect(result.allowed).toBe(false); expect(result.provider).toBe('curated'); expect(provider).not.toHaveBeenCalled();
});
test('provider flags prevent delivery', async () => {
  const provider = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ flagged: true }] }) });
  expect((await checkAiSafety('unsafe fixture', adult, provider)).allowed).toBe(false);
});
test('incomplete or unavailable moderation fails closed', async () => {
  await expect(checkAiSafety('Help focus', adult, async () => ({ ok: false }))).rejects.toMatchObject({ status: 503 });
  await expect(checkAiSafety('Help focus', adult, async () => ({ ok: true, json: async () => ({}) }))).rejects.toMatchObject({ status: 503 });
});
test('eligible practical request can proceed, with bounded timeout', async () => {
  const provider = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ flagged: false, categories: {} }] }) });
  expect((await checkAiSafety('Help me start my homework', adult, provider)).allowed).toBe(true);
  expect(provider.mock.calls[0][1].signal).toBeDefined();
  expect(localSafetyReply('Take a gentle break')).toBeNull();
});
