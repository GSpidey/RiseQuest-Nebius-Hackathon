import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'risequest_backend_base_url';

// Existing Express backend, hosted locally through the RiseQuest Cloudflare Tunnel.
export const DEFAULT_BACKEND_BASE_URL = 'https://risequest-api.goldenepics.com';

export function migrateBackendMediaUrl(value) {
  return typeof value === 'string'
    ? value.replace(/^https?:\/\/178\.156\.157\.240(?::3000)?(?=\/|$)/, DEFAULT_BACKEND_BASE_URL)
    : value;
}

export async function getBackendBaseUrl() {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (saved && /^https?:\/\/178\.156\.157\.240(?::3000)?\/?$/.test(saved)) {
    await AsyncStorage.setItem(STORAGE_KEY, DEFAULT_BACKEND_BASE_URL);
    return DEFAULT_BACKEND_BASE_URL;
  }
  if (saved && (__DEV__ || /^https:\/\//i.test(saved))) return saved;

  if (__DEV__) {
    if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  return DEFAULT_BACKEND_BASE_URL;
}

export async function setBackendBaseUrl(url) {
  const value = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value) || (!__DEV__ && !/^https:\/\//i.test(value))) throw new Error('Use an HTTPS backend URL');
  await AsyncStorage.setItem(STORAGE_KEY, value);
}
