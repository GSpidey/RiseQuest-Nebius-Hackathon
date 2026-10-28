import { useSyncExternalStore } from 'react';
import { featureApi } from '../features/api';
import { getAuthToken, onAuthSessionChanged } from './AuthTokenStorage';
const empty = { catalog: [], inventory: [], achievements: [], loadout: {}, balance: 0, ready: false };
let state = empty, generation = 0, pending;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
export const subscribeCollection = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getCollection = () => state;
export const useCollection = () => useSyncExternalStore(subscribeCollection, getCollection, getCollection);
export function applyCollection(value) { state = { ...value, ready: true }; notify(); }
export async function refreshCollection() {
  if (pending) return pending;
  const version = generation;
  const promise = (async () => {
    if (!await getAuthToken()) return empty;
    const value = await featureApi('/api/cosmetics');
    if (version === generation) applyCollection(value);
    return value;
  })();
  pending = promise;
  try { return await promise; } finally { if (pending === promise) pending = null; }
}
export async function changeCollection(path, body) {
  const version = generation;
  const value = await featureApi(`/api/cosmetics/${path}`, body);
  if (version !== generation) throw new Error('Your account changed. Reopen your collection.');
  if (value.inventory) applyCollection(value);
  return value;
}
onAuthSessionChanged(() => { generation++; pending = null; state = empty; notify(); });
