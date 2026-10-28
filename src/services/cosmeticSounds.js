import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { getAuthToken } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
const fingerprints={"sound_birds":"e6204e3f4c29c89f52d33c0d2db22c1d6c5bc7cd4001449afc5804961968e0cf","sound_rain":"13b065876b97f04edd1001d03265132826cae56159620a756bf02ab4572a8d2c","sound_motivational":"10da834c1dcd306fb41d5f46522af2a868f82ccbf94c8f05e7e982f8e279b40e"};
async function ownerKey() {
 const owner = await AsyncStorage.getItem('risequest_user_id') || await AsyncStorage.getItem('user_email');
 if (!owner || !await getAuthToken()) throw new Error('Sign in to manage your sounds.');
 return encodeURIComponent(owner.toLowerCase());
}
export async function saveCollectionSound(item, uri, name) {
 const owner = await ownerKey();
 await AsyncStorage.setItem(`cosmeticSound:${owner}:${item.id}`, JSON.stringify({uri,name}));
}
export async function prepareCollectionSound(item) {
 const token = await getAuthToken(), owner = await ownerKey();
 const raw = await AsyncStorage.getItem(`cosmeticSound:${owner}:${item.id}`);
 if (raw) return JSON.parse(raw);
 if (!['sound_birds','sound_rain','sound_motivational'].includes(item.id)) throw new Error('Choose a sound file first.');
 const fingerprint = fingerprints[item.id], native = NativeModules.RiseQuestAlarmAudio;
 const cached = await AsyncStorage.getItem(`cosmeticBuiltIn:${fingerprint}`);
 if (cached && await native.hasSpeech(fingerprint)) {
  if (await getAuthToken() !== token) throw new Error('Your account changed.');
  return {uri:cached,name:item.name};
 }
 const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),30000);
 try {
  const response = await fetch(`${await getBackendBaseUrl()}/api/cosmetics/sounds/${item.id}`, {
   headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
  if (!response.ok) throw new Error('Could not prepare this sound. Please retry.');
  const blob = await response.blob();
  if (blob.size > 1200044) throw new Error('This sound could not be prepared.');
  const encoded = await new Promise((resolve,reject)=>{
   const reader = new FileReader();
   reader.onload=()=>resolve(String(reader.result).split(',')[1]);
   reader.onerror=()=>reject(new Error('Could not read this sound.'));
   reader.readAsDataURL(blob);
  });
  if (await getAuthToken() !== token) throw new Error('Your account changed.');
  const uri = await native.cacheSpeech(fingerprint,encoded);
  await AsyncStorage.setItem(`cosmeticBuiltIn:${fingerprint}`,uri);
  if (await getAuthToken() !== token) throw new Error('Your account changed.');
  return {uri,name:item.name};
 } finally { clearTimeout(timer); }
}
export async function applyCollectionSound(item, expectedOwner) {
 const token=await getAuthToken();
 const value = await prepareCollectionSound(item), owner = await ownerKey();
 if(await getAuthToken()!==token || (expectedOwner && owner!==encodeURIComponent(String(expectedOwner).toLowerCase())))throw new Error('Your account changed.');
 await AsyncStorage.setItem(`cosmeticDefaultSound:${owner}`, JSON.stringify({ selectedTone:'custom',customToneUri:value.uri,
  customToneName:value.name,source:'store',soundId:item.id }));
 return value;
}
export async function currentCollectionSound() {
 try { return await AsyncStorage.getItem(`cosmeticDefaultSound:${await ownerKey()}`); } catch (_) { return null; }
}
export async function clearCollectionSound(expectedOwner) {
 const owner=await ownerKey();
 if(expectedOwner && owner!==encodeURIComponent(String(expectedOwner).toLowerCase()))throw new Error('Your account changed.');
 await AsyncStorage.removeItem(`cosmeticDefaultSound:${owner}`);
}
