// Reuse app-private recordings from this account's saved alarms. Never copy
// alarm identity, scheduling or another account's recording into the form.
const voiceFields = ['speechUri', 'speechFingerprint', 'speechText', 'speechVoiceId', 'speechOwner', 'speechDurationMs'];
function voiceMatches(alarm, owner, text, voiceId) {
  return Boolean(owner && alarm?.speechOwner === owner && alarm.speechText === text &&
    alarm.speechVoiceId === voiceId && alarm.speechUri && /^[a-f0-9]{64}$/.test(alarm.speechFingerprint || ''));
}
function applySavedVoice(alarm, saved) {
  const next = { ...alarm, customMessage: saved.speechText, voiceId: saved.speechVoiceId };
  for (const field of voiceFields) next[field] = saved[field];
  return next;
}
async function readSavedAlarms(storage) {
  try {
    const rows = JSON.parse(await storage.getItem('risequest_alarms') || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
async function findSavedVoice(storage, audio, owner, text, voiceId, current) {
  for (const alarm of [current, ...await readSavedAlarms(storage)]) {
    if (voiceMatches(alarm, owner, text, voiceId) && await audio.hasSpeech(alarm.speechFingerprint)) return alarm;
  }
  return null;
}
async function suggestSavedVoice(storage, audio, owner, now = Date.now()) {
  // Occasionally offer a familiar message on a new alarm. Reuse is explicit;
  // a request to generate a fresh message always follows the paid path.
  const day = Math.floor(now / 86400000);
  if (!owner || day % 3 !== 0) return null;
  const rows = (await readSavedAlarms(storage)).filter(a =>
    voiceMatches(a, owner, a?.speechText, a?.speechVoiceId) && typeof a.speechText === 'string' && a.speechText.trim());
  for (let i = 0; i < rows.length; i++) {
    const row = rows[(Math.floor(day / 3) + i) % rows.length];
    if (await audio.hasSpeech(row.speechFingerprint)) return row;
  }
  return null;
}
module.exports = { voiceMatches, applySavedVoice, findSavedVoice, suggestSavedVoice };
