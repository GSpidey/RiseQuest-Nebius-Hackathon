import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { applySavedVoice, findSavedVoice, suggestSavedVoice } from './alarmVoiceReuse';
import { GENERATION_FAILED } from './alarmGenerationFeedback';
const voiceErrors = new Set(['Sign in to use realistic voices.', 'Your account changed. Reopen the alarm and try again.',
  'Write a wake-up message first.', 'Shorten the spoken message to 240 characters.',
  'Choose an available voice.', 'You need 10 RisePoints to prepare this voice.',
  'Use the device voice for this profile.', 'This profile cannot use realistic voices.',
  'Review the audio generation price and save again.']);
const customerVoiceError = error => Error(voiceErrors.has(error?.message) ? error.message : GENERATION_FAILED);
async function request(path, body) {
  const token = await getAuthToken();
  if (!token) throw Error('Sign in to use realistic voices.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(`${await getBackendBaseUrl()}${path}`, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (token !== await getAuthToken()) throw Error('Your account changed. Reopen the alarm and try again.');
    if (!response.ok) throw customerVoiceError(Error(data.error));
    return data;
  } catch (error) { throw customerVoiceError(error);
  } finally { clearTimeout(timer); }
}
export const loadAlarmVoices = () => request('/api/tts/alarm-voices');
export async function loadSavedVoiceSuggestion() {
  const owner = await AsyncStorage.getItem('risequest_user_id');
  const saved = await suggestSavedVoice(AsyncStorage, NativeModules.RiseQuestAlarmAudio, owner);
  return owner === await AsyncStorage.getItem('risequest_user_id') ? saved : null;
}
export async function useSavedVoiceSuggestion(alarm, saved) {
  const owner = await AsyncStorage.getItem('risequest_user_id');
  if (!owner || saved?.speechOwner !== owner || !await NativeModules.RiseQuestAlarmAudio.hasSpeech(saved.speechFingerprint) ||
      owner !== await AsyncStorage.getItem('risequest_user_id')) throw Error('This message is unavailable. Choose another message.');
  return applySavedVoice(alarm, saved);
}
export async function prepareAlarmVoice(alarm, acceptedCost) {
  // The realistic-voice switch is the single choice to prepare audio on save.
  // Preserve recordings when switched off so they can be reused later.
  if (!alarm.speechEnabled) return { ...alarm, speechConsent: false };
  try {
    const text = String(alarm.customMessage || '').trim();
    if (!text) throw Error('Write a wake-up message first.');
    if (text.length > 240) throw Error('Shorten the spoken message to 240 characters.');
    const owner = await AsyncStorage.getItem('risequest_user_id');
    if (!owner) throw Error('Sign in to use realistic voices.');
    const cached = await findSavedVoice(AsyncStorage, NativeModules.RiseQuestAlarmAudio, owner, text, alarm.voiceId, alarm);
    if (owner !== await AsyncStorage.getItem('risequest_user_id')) throw Error('Your account changed. Reopen the alarm and try again.');
    if (cached) return { ...applySavedVoice(alarm, cached), speechConsent: true };
    const result = await request('/api/tts/alarm', { text, voiceId: alarm.voiceId, consent: true, acceptedCost });
    if (owner !== await AsyncStorage.getItem('risequest_user_id')) throw Error('Your account changed. Reopen the alarm and try again.');
    const uri = await NativeModules.RiseQuestAlarmAudio.cacheSpeech(result.fingerprint, result.audioBase64);
    if (owner !== await AsyncStorage.getItem('risequest_user_id')) throw Error('Your account changed. Reopen the alarm and try again.');
    return { ...alarm, speechUri: uri, speechFingerprint: result.fingerprint,
      speechText: text, speechVoiceId: alarm.voiceId, speechOwner: owner, speechDurationMs: result.durationMs, speechConsent: true };
  } catch (error) { throw customerVoiceError(error); }
}

