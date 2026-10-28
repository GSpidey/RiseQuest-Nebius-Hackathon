import AsyncStorage from '@react-native-async-storage/async-storage';
import {featureApi} from '../api';
export const requestKey=()=>`care_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
export const supportSnapshot=options=>featureApi('/api/companion/support',undefined,options);
export const supportChange=(body,options)=>featureApi('/api/companion/change',body,options);
// Never assign legacy, unowned mood records to whoever happens to sign in next.
// Retain them locally for explicit review; new records are always owner-scoped.
export const moodStorageKey=owner=>`risequest_mood:${owner||'guest'}`;
export async function legacyMood(){try{return JSON.parse(await AsyncStorage.getItem('mood_history')||'[]');}catch(_){return [];}}
export async function restoreCompanion(owner){
 if(!owner)return {character:'sol',personality:'gentle'};
 const saved=JSON.parse(await AsyncStorage.getItem(`risequest_companion:${owner}`)||'null');
 const {avatars}=await featureApi('/api/companions');
 return {character:avatars.some(a=>a.id===saved?.character&&a.unlocked)?saved.character:'sol',personality:saved?.personality||'gentle'};
}

let claiming=Promise.resolve();
export function claimLegacyMood(owner){
 const action=claiming.then(async()=>{
  const claimed=await AsyncStorage.getItem('risequest_legacy_mood_owner');
  if(claimed&&claimed!==owner)throw Error('Older check-ins belong to another account on this device.');
  // Claim first; an interrupted copy can only be resumed by this same owner.
  if(!claimed)await AsyncStorage.setItem('risequest_legacy_mood_owner',owner);
  const key=`risequest_legacy_mood:${owner}`,existing=await AsyncStorage.getItem(key);
  if(existing)return JSON.parse(existing);
  const rows=await legacyMood();await AsyncStorage.setItem(key,JSON.stringify(rows));return rows;
 });claiming=action.catch(()=>{});return action;
}
