// Server-only Async transport. Callers must enforce account eligibility,
// disclosed cost, idempotency and ownership before invoking this adapter.
const SAMPLE_RATE = 24000;
const MAX_SECONDS = 25;
const MAX_BYTES = SAMPLE_RATE * 4 * MAX_SECONDS;

function pcmToWav(raw) {
  if (!raw.length || raw.length % 4 || raw.length > MAX_BYTES)
    throw Error('Invalid speech audio');
  const frames = raw.length / 4;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24); wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const sample = raw.readFloatLE(i * 4);
    if (!Number.isFinite(sample)) throw Error('Invalid speech audio');
    const bounded = Math.max(-1, Math.min(1, sample));
    wav.writeInt16LE(Math.round(bounded * (bounded < 0 ? 32768 : 32767)), 44 + i * 2);
  }
  return { audio: wav, durationMs: Math.ceil(frames / SAMPLE_RATE * 1000) };
}

async function synthesizeAlarmSpeech({ text, voiceId, allowedVoiceIds, apiKey,
  request = fetch }) {
  if (typeof text !== 'string' || !text.trim() || text.length > 240 || /[<>]/.test(text))
    throw Error('Use a plain-text message of 1–240 characters.');
  if (!Array.isArray(allowedVoiceIds) || !allowedVoiceIds.includes(voiceId))
    throw Error('Choose an available voice.');
  if (!apiKey) throw Error('Speech generation is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let reader;
  try {
    const response = await request('https://api.async.com/text_to_speech', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, version: 'v1' },
      body: JSON.stringify({ model_id: 'async_flash_v1.5', transcript: text.trim(),
        voice: { mode: 'id', id: voiceId },
        output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: SAMPLE_RATE } }),
    });
    // Never echo upstream response bodies: they may contain text or credentials.
    if (!response.ok || !response.body) throw Error('Speech generation is temporarily unavailable.');
    if (/json|text\//i.test(response.headers.get('content-type') || '')) throw Error('Invalid speech audio');
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_BYTES) throw Error('Speech message is too long.');
    reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('Speech message is too long.');
      chunks.push(Buffer.from(value));
    }
    return pcmToWav(Buffer.concat(chunks));
  } finally {
    clearTimeout(timeout);
    if (reader) await reader.cancel().catch(() => {});
    controller.abort();
  }
}

module.exports = { synthesizeAlarmSpeech, pcmToWav, SAMPLE_RATE, MAX_SECONDS };
