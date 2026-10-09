const { curatedReply } = require('./coachingContext');
const SAFE_REPLY = 'Prepared safety guidance: I can help with a gentle routine or a small practical step, but not diagnosis, medication changes or harmful instructions. For health concerns, speak with a qualified professional; if there is immediate danger, contact local emergency services and someone you trust.';
function localSafetyReply(text) {
  const value = String(text || '');
  if (/suicid|kill myself|hurt myself|self[ -]?harm|end my life/i.test(value)) return curatedReply('hurt myself');
  if (/(?:dose|dosage|prescrib|stop taking|double.*medication|skip.*medication)|(?:stay awake|without sleep).*(?:days|48|72)/i.test(value)) return SAFE_REPLY;
  return null;
}
async function checkAiSafety(text, coaching, request = fetch) {
  // This guard must run before moderation too: moderation is an external API.
  if (!coaching?.externalAllowed) return { allowed: false, reply: curatedReply(text), provider: 'curated' };
  const local = localSafetyReply(text);
  if (local) return { allowed: false, reply: local, provider: 'curated' };
  if (!process.env.OPENAI_API_KEY) throw Object.assign(Error('Live safety checks are unavailable.'), { status: 503 });
  const response = await request(`${String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/moderations`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: String(text).slice(0, 18000) }),
  });
  if (!response.ok) throw Object.assign(Error('Live safety checks are unavailable. Please try again.'), { status: 503 });
  const result = (await response.json()).results?.[0];
  if (!result || typeof result.flagged !== 'boolean') throw Object.assign(Error('Safety check was incomplete.'), { status: 503 });
  const categories = result.categories || {};
  const blocked = result.flagged || (coaching.profile?.ageGroup !== 'adult' &&
    (categories.sexual || categories['violence/graphic'] || categories['self-harm']));
  return blocked ? { allowed: false, reply: SAFE_REPLY, provider: 'curated' } : { allowed: true };
}
module.exports = { checkAiSafety, localSafetyReply, SAFE_REPLY };
