import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
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
    if (!response.ok) throw Error(data.error || 'Could not prepare the voice. Please retry.');
    return data;
  } finally { clearTimeout(timer); }
}
export const loadAlarmVoices = () => request('/api/tts/alarm-voices');
export async function prepareAlarmVoice(alarm, acceptedCost) {
  if (!alarm.speechEnabled) return { ...alarm, speechUri: null };
  const text = String(alarm.customMessage || '').trim();
  if (!text) throw Error('Write a wake-up message first.');
  if (text.length > 240) throw Error('Shorten the spoken message to 240 characters.');
  const owner = await AsyncStorage.getItem('risequest_user_id');
  const cached = alarm.speechOwner === owner && alarm.speechText === text &&
    alarm.speechVoiceId === alarm.voiceId && alarm.speechUri;
  if (cached && await NativeModules.RiseQuestAlarmAudio.hasSpeech(alarm.speechFingerprint)) return alarm;
  if (!alarm.speechConsent) throw Error('Review and enable the voice privacy choice before saving.');
  const result = await request('/api/tts/alarm', { text, voiceId: alarm.voiceId, consent: true, acceptedCost });
  if (owner !== await AsyncStorage.getItem('risequest_user_id')) throw Error('Your account changed. Reopen the alarm.');
  const uri = await NativeModules.RiseQuestAlarmAudio.cacheSpeech(result.fingerprint, result.audioBase64);
  if (owner !== await AsyncStorage.getItem('risequest_user_id')) throw Error('Your account changed. Reopen the alarm.');
  return { ...alarm, speechUri: uri, speechFingerprint: result.fingerprint,
    speechText: text, speechVoiceId: alarm.voiceId, speechOwner: owner, speechDurationMs: result.durationMs };
}
