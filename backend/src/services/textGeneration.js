const { questProviders } = require('./questProviders');
const { checkAiSafety } = require('./aiSafety');
const { chatParameters } = require('./openaiParameters');

// Shared generation transport; moderation never follows the generation provider.
// Safety failures are terminal, while transport/format failures may fall back.
async function generateText({ coaching, messages, safetyInput, temperature = 0.4,
  maxTokens = 1800, validate = value => value, request = fetch }) {
  if (!coaching?.externalAllowed) return { kind: 'restricted' };
  const inputSafety = await checkAiSafety(safetyInput, coaching, request);
  if (!inputSafety.allowed) return { kind: 'blocked', reply: inputSafety.reply };
  for (const provider of questProviders(coaching)) {
    let content;
    try {
      const parameters = provider.name === 'openai'
        ? chatParameters(provider.model, temperature, maxTokens)
        : { model: provider.model, temperature, max_tokens: maxTokens };
      // Nemotron's default reasoning can exhaust a short answer budget before
      // producing any content. These routine-support paths need direct answers.
      if (provider.name === 'nebius' && /^nvidia\/nvidia-nemotron-3-nano-30b-a3b$/i.test(provider.model))
        parameters.chat_template_kwargs = { enable_thinking: false };
      const response = await request(`${provider.baseUrl}/chat/completions`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({ ...parameters, messages }),
      });
      if (!response.ok) {
        // A provider's explicit safety rejection must not be retried elsewhere.
        const body = await response.json().catch(() => null);
        if (/content_filter|content_policy|safety|moderation/i.test(String(body?.error?.code || body?.error?.type || '')))
          return { kind: 'blocked' };
        continue;
      }
      const choice = (await response.json()).choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') return { kind: 'blocked' };
      if (choice?.finish_reason === 'length') continue;
      content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim() || content.length > 18000) continue;
      content = content.trim();
    } catch (_) { continue; }
    // Deliberately outside transport catch: moderation outages/rejections stop
    // the chain instead of asking another provider for an unsafe alternative.
    const safety = await checkAiSafety(content, coaching, request);
    if (!safety.allowed) return { kind: 'blocked', reply: safety.reply };
    let value;
    try { value = validate(content); } catch (_) { continue; }
    if (value == null) continue;
    return { kind: 'generated', value, provider: provider.name, model: provider.model };
  }
  return { kind: 'unavailable' };
}
module.exports = { generateText };
