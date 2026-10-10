const crypto = require('crypto');
const { walletTransaction } = require('../security');
const { loadCoachingContext, SAFETY_PROMPT, safePersonality } = require('./coachingContext');
const { generateText } = require('./textGeneration');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const PREPARED = 'Good morning! Take a gentle breath, stretch if comfortable, and choose one small step for your day.';
const fallback = () => ({ success: true, message: PREPARED, provider: 'curated', cost: 0, balance: null });
function replay(row, requestHash) {
  if (!row) return null;
  if (row.metadata?.requestHash !== requestHash || !row.metadata?.response) throw Object.assign(Error('This request was already used for a different message.'), { status: 409 });
  return { ...row.metadata.response, replayed: true };
}
async function generateWakeup({ prisma, userId, input, key, generateGeminiText, request = fetch }) {
  const coaching = await loadCoachingContext(prisma, userId);
  if (!coaching.externalAllowed) return fallback();
  const styles = { motivational: 'Uplifting, no guilt.', gentle: 'Calm, low-pressure.', scientific: 'Practical, no invented evidence.',
    friendly: 'Warm and casual.', professional: 'Respectful and concise.', strict: 'Firm but kind; no shame or coercion.',
    rude: 'Light playful sarcasm, never insults.', fun: 'Playful and encouraging.' };
  const personality = safePersonality(coaching.profile, Object.hasOwn(styles, input.personality) ? input.personality : 'motivational');
  const context = { label: String(input.label || '').slice(0, 60), time: String(input.time || '').slice(0, 12),
    importance: ['low', 'medium', 'high'].includes(input.importance) ? input.importance : 'medium', personality };
  const requestHash = digest(JSON.stringify(context));
  const id = `ai_wakeup_${digest(`${userId}|${key || crypto.randomUUID()}`)}`;
  const existing = replay(await prisma.risePointsTransaction.findUnique({ where: { id } }), requestHash);
  if (existing) return existing;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback();
  const cost = Math.max(1, Math.min(500, Number(process.env.AI_WAKEUP_MESSAGE_COST) || 25));
  const balance = (await prisma.risePointsBalance.findUnique({ where: { userId } }))?.balance || 0;
  if (balance < cost) throw Object.assign(Error('Insufficient RisePoints'), { status: 400, balance, cost });
  let message = '', provider = 'openai';
  try {
    const system = `${SAFETY_PROMPT} Write one wake-up message under 240 characters. Style: ${styles[personality]}`;
    const user = JSON.stringify({ ...context, preferences: coaching.context });
    const result = await generateText({ coaching, safetyInput: context.label, request,
      temperature: 0.6, maxTokens: 512,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      validate: value => value.length <= 240 ? value : null,
    });
    if (result.kind !== 'generated') return fallback();
    message = result.value;
    provider = result.provider;
  } catch (_) { return fallback(); }
  // Only a generated, screened result is charged. Response and debit are in the
  // same transaction, so retries cannot double-charge or claim a false refund.
  return walletTransaction(prisma, userId, async tx => {
    const prior = replay(await tx.risePointsTransaction.findUnique({ where: { id } }), requestHash);
    if (prior) return prior;
    const active = await tx.user.findUnique({ where: { id: userId }, select: { disabledAt: true } });
    if (!active || active.disabledAt) throw Object.assign(Error('Account unavailable.'), { status: 403 });
    const current = (await tx.risePointsBalance.findUnique({ where: { userId } }))?.balance || 0;
    if (current < cost) throw Object.assign(Error('Insufficient RisePoints'), { status: 400, balance: current, cost });
    const result = { success: true, message, provider, personality, cost, balance: current - cost };
    await tx.risePointsBalance.update({ where: { userId }, data: { balance: { decrement: cost } } });
    await tx.risePointsTransaction.create({ data: { id, userId, delta: -cost, reason: `ai_wakeup_message:${personality}`, metadata: { requestHash, response: result } } });
    return result;
  });
}
function registerWakeupRoute(app, { prisma, requireAuth, generateGeminiText }) {
  app.post('/api/ai/wakeup-message', requireAuth, async (req, res) => {
    try {
      const key = req.get('Idempotency-Key');
      if (key && !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) return res.status(400).json({ error: 'Invalid request reference.' });
      res.json(await generateWakeup({ prisma, userId: req.auth.userId, input: req.body || {}, key, generateGeminiText }));
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'The message could not be saved. Please retry.',
      ...(error.balance != null ? { balance: error.balance, cost: error.cost } : {}) }); }
  });
}
module.exports = { generateWakeup, registerWakeupRoute, replay };
