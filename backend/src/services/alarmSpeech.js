const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { voices } = require('./alarmVoices');
const { synthesizeAlarmSpeech } = require('./alarmSpeechTransport');
const COST = 10;
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const ownerFolder = userId => hash(`alarm-speech-owner:${userId}`);
const fail = (status, message, code = 'ALARM_SPEECH_ERROR') => Object.assign(Error(message), { status, code, customerSafe: true });

async function eligibility(prisma, userId) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { disabledAt: true } }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);
  return Boolean(user && !user.disabledAt && profile?.data?.ageGroup === 'adult' && !profile.data.managedByParent);
}

async function prepareSpeech({ prisma, userId, input, directory, apiKey, synthesize = synthesizeAlarmSpeech }) {
  if (!await eligibility(prisma, userId)) throw fail(403, 'Use the device voice for this profile.');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text || text.length > 240 || /[<>]/.test(text)) throw fail(400, 'Enter a plain-text message of 1–240 characters.');
  if (!voices.some(v => v.id === input.voiceId)) throw fail(400, 'Choose an available voice.');
  if (input.consent !== true || input.acceptedCost !== COST) throw fail(409, 'Review the audio generation price and save again.');
  const fingerprint = hash(`flash1.5|${userId}|${input.voiceId}|${text}`);
  const id = `alarm_speech_${fingerprint}`;
  const folder = path.join(directory, ownerFolder(userId));
  const file = path.join(folder, `${fingerprint}.wav`);
  // The database lock covers generation as well as debit: concurrent saves,
  // retries and multiple backend processes cannot buy this message twice.
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    if (!await eligibility(tx, userId)) throw fail(403, 'This profile cannot use realistic voices.');
    const prior = await tx.risePointsTransaction.findUnique({ where: { id } });
    let audio = await fs.readFile(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    const balance = (await tx.risePointsBalance.findUnique({ where: { userId } }))?.balance || 0;
    if (!prior && balance < COST) throw fail(400, 'You need 10 RisePoints to prepare this voice.');
    // A missing paid file is an integrity/recovery problem, never a second debit.
    if (prior && !audio) throw fail(503, 'Saved voice is temporarily unavailable. Try again later.', 'PAID_AUDIO_MISSING');
    let durationMs = prior?.metadata?.durationMs;
    if (!audio) {
      if (!apiKey) throw fail(503, 'Generation failed. Try again later.', 'ASYNC_KEY_MISSING');
      const result = await synthesize({ text, voiceId: input.voiceId, allowedVoiceIds: voices.map(v => v.id), apiKey });
      if (!await eligibility(tx, userId)) throw fail(403, 'This profile cannot use realistic voices.');
      audio = result.audio; durationMs = result.durationMs;
      if (!Buffer.isBuffer(audio) || audio.length < 46 || audio.length > 1200044 || !durationMs || durationMs > 25000)
        throw fail(503, 'Could not prepare a short voice message. Please shorten it and retry.');
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, audio, { mode: 0o600 }); await fs.rename(temporary, file); }
      finally { await fs.unlink(temporary).catch(() => {}); }
    }
    if (!prior) {
      // A file may survive a failed database commit. Reuse it without another
      // provider charge, deriving duration from our canonical PCM16 WAV format.
      durationMs = Math.ceil((audio.length - 44) / 48000 * 1000);
      await tx.risePointsBalance.update({ where: { userId }, data: { balance: { decrement: COST } } });
      await tx.risePointsTransaction.create({ data: { id, userId, delta: -COST, reason: 'alarm_speech',
        metadata: { fingerprint, durationMs, voiceId: input.voiceId, provider: 'async', model: 'async_flash_v1.5' } } });
    }
    return { audioBase64: audio.toString('base64'), fingerprint, durationMs, cost: prior ? 0 : COST,
      balance: balance - (prior ? 0 : COST), voiceId: input.voiceId };
  }, { timeout: 35000, maxWait: 5000 });
}

function registerAlarmSpeech(app, { prisma, requireAuth, uploadsDir, logger = console }) {
  const directory = path.join(uploadsDir, 'tts', 'alarm'); // /uploads/tts is already denied publicly.
  app.get('/api/tts/alarm-voices', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json({ voices, cost: COST, eligible: await eligibility(prisma, req.auth.userId),
      available: Boolean(process.env.ASYNC_API_KEY), maxCharacters: 240, maxRepeats: 3 }); }
    catch (_) { res.status(503).json({ error: 'Voice settings are temporarily unavailable.' }); }
  });
  app.post('/api/tts/alarm', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await prepareSpeech({ prisma, userId: req.auth.userId, input: req.body || {}, directory, apiKey: process.env.ASYNC_API_KEY })); }
    catch (error) {
      // Owner diagnostics contain actionable provider status, never the user's
      // message, audio, API key or the upstream response body.
      if (!error.customerSafe || error.status >= 500) logger.error('alarm_speech_failed', {
        provider: 'async', code: error.code || 'ALARM_SPEECH_ERROR',
        ...(Number.isInteger(error.upstreamStatus) ? { upstreamStatus: error.upstreamStatus } : {}),
      });
      res.status(error.customerSafe ? error.status : 503).json({
        error: error.customerSafe && error.status < 500 ? error.message : 'Generation failed. Try again later.',
      });
    }
  });
}
module.exports = { registerAlarmSpeech, prepareSpeech, ownerFolder, eligibility, COST };

