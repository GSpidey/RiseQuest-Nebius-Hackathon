// Keep the configured model. GPT-5's original reasoning models reject custom
// sampling temperatures; use their supported latency control instead.
function chatParameters(model, temperature, maxCompletionTokens = 1800) {
  const originalGpt5 = /^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
  return {
    model,
    max_completion_tokens: maxCompletionTokens,
    ...(originalGpt5 ? { reasoning_effort: 'minimal' } : { temperature }),
  };
}
module.exports = { chatParameters };
