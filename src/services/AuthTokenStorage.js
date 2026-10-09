import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

const options = { service: 'com.risequest.app.auth' };
let pendingMigration;
const sessionListeners = new Set();
export function onAuthSessionChanged(listener) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}
const notifySessionChanged = () => sessionListeners.forEach(listener => listener());

// Move the existing session, not the account or local alarms. Never fall back to
// plaintext storage if the device keystore is unavailable.
async function migrate() {
  if (!pendingMigration) {
    pendingMigration = (async () => {
      const stored = await Keychain.getGenericPassword(options);
      if (!stored) {
        const legacy = await AsyncStorage.getItem('risequest_auth_token') ||
          await AsyncStorage.getItem('auth_token');
        if (legacy && !await Keychain.setGenericPassword('session', legacy, options)) {
          throw new Error('Could not secure the existing session');
        }
      }
      await AsyncStorage.multiRemove(['risequest_auth_token', 'auth_token']);
      const googleProfile = await AsyncStorage.getItem('google_user_data');
      if (googleProfile) {
        let profile;
        try { profile = JSON.parse(googleProfile); } catch { profile = null; }
        if (profile && Object.prototype.hasOwnProperty.call(profile, 'accessToken')) {
          delete profile.accessToken;
          await AsyncStorage.setItem('google_user_data', JSON.stringify(profile));
        }
      }
    })().catch(error => { pendingMigration = null; throw error; });
  }
  await pendingMigration;
}

export async function getAuthToken() {
  await migrate();
  const credentials = await Keychain.getGenericPassword(options);
  return credentials ? credentials.password : null;
}

export async function setAuthToken(token) {
  await migrate();
  if (!token) return clearAuthToken();
  const existing = await Keychain.getGenericPassword(options);
  if (existing?.password === String(token)) return;
  if (!await Keychain.setGenericPassword('session', String(token), options)) {
    throw new Error('Could not securely save the session');
  }
  notifySessionChanged();
}

export async function clearAuthToken() {
  await migrate();
  await Keychain.resetGenericPassword(options);
  notifySessionChanged();
  await AsyncStorage.multiRemove(['risequest_auth_token', 'auth_token']);
}

export async function authHeaders() {
  const token = await getAuthToken();
  return { 'Content-Type': 'application/json', 'Idempotency-Key': `request_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
