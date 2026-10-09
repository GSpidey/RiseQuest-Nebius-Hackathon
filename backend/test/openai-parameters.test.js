const { chatParameters } = require('../src/services/openaiParameters');
test.each(['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-mini-2025-08-07'])('%s keeps its identity without unsupported temperature', model => {
  expect(chatParameters(model, 0.4)).toEqual({ model, reasoning_effort: 'minimal', max_completion_tokens: 1800 });
});
test('existing non-reasoning model keeps its sampling setting', () => {
  expect(chatParameters('gpt-4o-mini', 0.6, 512)).toEqual({ model: 'gpt-4o-mini', temperature: 0.6, max_completion_tokens: 512 });
});
