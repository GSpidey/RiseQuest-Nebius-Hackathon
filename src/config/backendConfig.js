import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'risequest_backend_base_url';

// Set your own HTTPS backend for release builds; debug builds use localhost.
export const DEFAULT_BACKEND_BASE_URL = 'https://api.example.invalid';

export function migrateBackendMediaUrl(value) { return value; }

export async function getBackendBaseUrl() {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
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
