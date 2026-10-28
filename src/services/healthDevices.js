import {fetchWithTimeout} from './fetchWithTimeout';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { getAuthToken } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
const native = () => {
 if (Platform.OS !== 'android' || !NativeModules.RiseQuestHealthDevices) throw new Error('This connection needs the updated Android app.');
 return NativeModules.RiseQuestHealthDevices;
};
export async function searchDevices() {
 const permissions = Number(Platform.Version) >= 31 ? ['android.permission.BLUETOOTH_SCAN','android.permission.BLUETOOTH_CONNECT'] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
 const result=await PermissionsAndroid.requestMultiple(permissions);
 if(permissions.some(p=>result[p]!==PermissionsAndroid.RESULTS.GRANTED))throw new Error('Allow Nearby devices in app permissions, then search again.');
 return native().scanDevices();
}
export const cancelDeviceSearch=()=>NativeModules.RiseQuestHealthDevices?.cancelScan();
export const pairDevice=id=>native().pairDevice(id);
export const bluetoothSettings=()=>native().openSettings();
export const healthStatus=()=>native().healthStatus();
export const healthSettings=()=>native().openHealth();
export async function readHealthSources(){
 if(!await native().requestSleepPermission())throw new Error('Sleep permission was not granted. You can try again when ready.');
 return native().readSleep();
}
export async function importHealthSource(records,source){
 const token=await getAuthToken();if(!token)throw new Error('Sign in to save sleep data to your account.');
 const base=await getBackendBaseUrl();
 // Pick the longest session per UTC day; overlapping watch/app recordings must
 // not double-count a night. Other source data is never imported implicitly.
 const days=new Map();
 for(const row of records.filter(r=>r.source===source)){
  const duration=Date.parse(row.wakeAt)-Date.parse(row.bedtimeAt),day=row.wakeAt.slice(0,10);
  if(duration>0&&duration<=86400000&&(!days.has(day)||duration>days.get(day).duration))days.set(day,{...row,duration});
 }
 let count=0;
 for(const row of days.values()){
  if(await getAuthToken()!==token)throw new Error('Your account changed. Reopen Devices before importing.');
  const response=await fetchWithTimeout(`${base}/api/sleep/entries`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({bedtimeAt:row.bedtimeAt,wakeAt:row.wakeAt,source:'wearable',notes:`Imported from ${row.sourceName} via Health Connect. Sleep quality was not measured.`})});
  if(!response.ok)throw new Error(`Saved ${count} nights. The remaining sleep data could not be saved; try again.`);
  count++;
 }
 return count;
}
