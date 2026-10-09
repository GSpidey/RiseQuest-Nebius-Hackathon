// Generation only. OpenAI moderation remains separate from provider selection.
function questProviders(coaching, env = process.env) {
  const providers = [];
  if (env.QUEST_AI_PROVIDER === 'nebius' && env.NEBIUS_API_KEY && env.NEBIUS_TEXT_MODEL &&
      coaching?.externalAllowed && coaching.profile?.ageGroup === 'adult' &&
      !coaching.profile.managedByParent) {
    providers.push({
      name: 'nebius', apiKey: env.NEBIUS_API_KEY, model: env.NEBIUS_TEXT_MODEL,
      baseUrl: 'https://api.tokenfactory.nebius.com/v1',
      parameters: { model: env.NEBIUS_TEXT_MODEL, temperature: 0.4, max_tokens: 1800 },
    });
  }
  const model = env.OPENAI_TEXT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
  providers.push({ name: 'openai', apiKey: env.OPENAI_API_KEY, model,
    baseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    parameters: require('./openaiParameters').chatParameters(model, 0.4),
  });
  return providers;
}
module.exports = { questProviders };
