import {NativeModules,PermissionsAndroid,Platform,AppState} from 'react-native';
import Tts from 'react-native-tts';
export async function listenOnce() {
 if(!NativeModules.RiseQuestAlarmAudio?.listenOnce) throw new Error('Voice input needs the updated RiseQuest build. You can type your message.');
 await Tts.stop();
 if(Platform.OS==='android'&&await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)!==PermissionsAndroid.RESULTS.GRANTED) throw new Error('Microphone permission was not granted. You can type instead.');
 return NativeModules.RiseQuestAlarmAudio.listenOnce();
}
export async function speak(text){await Tts.getInitStatus();await Tts.stop();Tts.speak(String(text).slice(0,2500));}
export function stopSpeech(){Tts.stop();NativeModules.RiseQuestAlarmAudio?.cancelListening?.();}
export function stopWhenBackgrounded(){const s=AppState.addEventListener('change',v=>{if(v!=='active')stopSpeech();});return()=>{s.remove();stopSpeech();};}
