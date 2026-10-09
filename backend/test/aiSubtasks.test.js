const { generateSubtasks } = require('../src/services/aiSubtasks');
describe('honest quest breakdown sources and child provider isolation', () => {
  const original = global.fetch;
  beforeEach(() => { process.env.OPENAI_API_KEY = 'synthetic-test-only'; global.fetch = jest.fn(); });
  afterEach(() => { delete process.env.OPENAI_API_KEY; global.fetch = original; });
  const input = { title: 'Learn a skill', description: 'One step', coaching: { externalAllowed: true, context: { goals: ['focus'] } } };
  test('child request is curated with zero provider calls', async () => {
    const result = await generateSubtasks({ ...input, coaching: { externalAllowed: false } });
    expect(result.source).toBe('curated'); expect(result.subtasks.length).toBeGreaterThan(0); expect(global.fetch).not.toHaveBeenCalled();
  });
  test('provider outage is labelled prepared, not AI', async () => {
    global.fetch.mockRejectedValue(Error('unavailable'));
    expect((await generateSubtasks(input)).source).toBe('offline');
  });
  test('valid provider output carries AI source and minimized preferences', async () => {
    global.fetch.mockImplementation(async url => ({ ok: true, json: async () => url.endsWith('/moderations') ? { results: [{ flagged: false }] } : { choices: [{ message: { content: JSON.stringify([{ title: 'Open your notes', estimatedMinutes: 2 }]) } }] } }));
    const result = await generateSubtasks(input);
    expect(result.source).toBe('ai'); expect(result.subtasks[0].estimatedMinutes).toBe(5);
    expect(JSON.parse(global.fetch.mock.calls.find(([url]) => url.endsWith('/chat/completions'))[1].body).messages[1].content).toContain('focus');
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });
  test('malformed provider output does not masquerade as generated steps', async () => {
    global.fetch.mockImplementation(async url => ({ ok: true, json: async () => url.endsWith('/moderations') ? { results: [{ flagged: false }] } : { choices: [{ message: { content: '[null]' } }] } }));
    expect((await generateSubtasks(input)).source).toBe('offline');
  });
  test('configured GPT-5 mini request excludes unsupported sampling', async () => {
    const previous = process.env.OPENAI_TEXT_MODEL;
    process.env.OPENAI_TEXT_MODEL = 'gpt-5-mini';
    try {
      global.fetch.mockImplementation(async url => ({ ok: true, json: async () => url.endsWith('/moderations') ? { results: [{ flagged: false }] } : { choices: [{ message: { content: '[{"title":"Open your notes"}]' } }] } }));
      expect((await generateSubtasks(input)).source).toBe('ai');
      const body = JSON.parse(global.fetch.mock.calls.find(([url]) => url.endsWith('/chat/completions'))[1].body);
      expect(body.model).toBe('gpt-5-mini');
      expect(body.temperature).toBeUndefined();
      expect(body.reasoning_effort).toBe('minimal');
      expect(body.max_completion_tokens).toBe(1800);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_TEXT_MODEL;
      else process.env.OPENAI_TEXT_MODEL = previous;
    }
  });
});
