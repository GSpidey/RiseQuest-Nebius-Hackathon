import {useSyncExternalStore} from 'react';
import {AppState,NativeModules,NativeEventEmitter,PermissionsAndroid,Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Sound from 'react-native-sound';
import Tts from 'react-native-tts';
import {featureApi} from '../api';
import {onAuthSessionChanged} from '../../services/AuthTokenStorage';
import {refreshCollection} from '../../services/cosmeticCollection';
import {listenOnce,stopSpeech} from './speech';
import {directNavigation,isNavigationRequest,confirmationIntent,validCompanionAction,actionPrompt,directManagement,isManagementRequest} from './actions';
import {parseCareCommand} from './careCommands';
import {chooseManagementOption} from './management';
const native=NativeModules.RiseQuestVoiceSession;
const defaults={realistic:false,allowPoints:false,background:false,voiceId:null,sessionLimit:20,unlimited:false,acceptedRate:null,autoRead:true};
const initial={owner:null,active:false,busy:false,phase:'off',reply:null,action:null,selection:null,actionCreatedAt:0,messageId:null,notice:'',spent:0,settings:defaults,status:null};
let state=initial,generation=0,turn=0,cancelPlayback=null,starting=false,context={companion:'sol',personality:'gentle'},fallbackTimer;
let actionHandlers=null,executingAction=false;
const actionLifetimeMs=120000;
// App owns this registration, so a screen change cannot disconnect voice actions.
export function registerCompanionActions(handlers){actionHandlers=handlers;return()=>{if(actionHandlers===handlers)actionHandlers=null;};}
const listeners=new Set();
const publish=patch=>{state={...state,...patch};listeners.forEach(f=>f());};
export const getVoiceConversation=()=>state;
export const useVoiceConversation=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},getVoiceConversation,getVoiceConversation);
export function stopVoiceConversation(notice='',preserveDeviceAudio=false){
 generation++;NativeModules.RiseQuestReader?.stopCapture();clearTimeout(fallbackTimer);native?.stop();if(state.active&&!native)NativeModules.RiseQuestAlarmAudio?.cancelListening?.();cancelPlayback?.(preserveDeviceAudio);cancelPlayback=null;
 publish({active:false,busy:false,phase:'off',action:null,selection:null,actionCreatedAt:0,notice});
}
export async function configureVoiceAccount(owner){
 if(owner===state.owner)return;
 stopVoiceConversation();const version=generation;publish({...initial,owner,settings:{...defaults}});
 if(!owner)return;
 try{const saved=JSON.parse(await AsyncStorage.getItem(`companion_voice:${owner}`)||'null');if(version!==generation||state.owner!==owner)return;
  if(saved)publish({settings:{...defaults,...saved,sessionLimit:Number.isSafeInteger(saved.sessionLimit)&&saved.sessionLimit>0?saved.sessionLimit:20}});
  await refreshVoiceStatus();
 }catch(_){/* Safe defaults until settings are available. */}
}
export function setVoiceContext(value){const changed=value.companion&&value.companion!==context.companion;context={...context,...value};if(changed)void refreshVoiceStatus();}
export async function updateVoiceSettings(patch){if(state.active||state.busy)return;const settings={...state.settings,...patch,...(patch.allowPoints===true?{acceptedRate:state.status?.rate}:{} )};publish({settings});if(state.owner)await AsyncStorage.setItem(`companion_voice:${state.owner}`,JSON.stringify(settings));}
export async function refreshVoiceStatus(){const owner=state.owner,companion=context.companion;if(!owner)return;try{const status=await featureApi(companion==='lumen'?'/api/companion/reading?companion=lumen':'/api/assistant/voice');if(owner!==state.owner||companion!==context.companion)return;const priceChanged=state.settings.allowPoints&&state.settings.acceptedRate!==status.rate;publish({status,...(priceChanged?{notice:'Voice prices changed. Review Voice & spending to enable paid extras again.'}:{}),settings:{...state.settings,...(priceChanged?{allowPoints:false}:{}),voiceId:status.voices?.some(v=>v.id===state.settings.voiceId)?state.settings.voiceId:status.voices?.[0]?.id||null}});}catch(_){if(owner===state.owner&&companion===context.companion)publish({notice:'Voice settings could not refresh. Device voice is available.'});}}
function deviceSpeech(text){return new Promise(async(resolve,reject)=>{
 let done,error,timer,finished=false;
 const finish=e=>{if(finished)return;finished=true;done?.remove();error?.remove();clearTimeout(timer);if(cancelPlayback===cancel)cancelPlayback=null;e?reject(e):resolve();};
 const cancel=(preserveDeviceAudio=false)=>{if(!preserveDeviceAudio)void Tts.stop();finish();};cancelPlayback=cancel;
 try{await Tts.getInitStatus();if(finished)return;await Tts.stop();if(finished)return;
  done=Tts.addEventListener('tts-finish',()=>finish());error=Tts.addEventListener('tts-error',()=>finish(Error('Device voice could not play.')));
  timer=setTimeout(()=>finish(Error('Audio timed out.')),360000);Tts.speak(text);
 }catch(e){finish(e);}
});}
function localAudio(uri){return new Promise((resolve,reject)=>{
 let sound,finished=false,timer;
 const finish=e=>{if(finished)return;finished=true;clearTimeout(timer);sound?.stop();sound?.release();if(cancelPlayback===cancel)cancelPlayback=null;e?reject(e):resolve();};
 const cancel=()=>finish();cancelPlayback=cancel;
 sound=new Sound(uri,null,e=>{if(finished){sound?.release();return;}if(e){finish(e);return;}sound.play(ok=>finish(ok?null:Error('Audio could not play.')));});
 timer=setTimeout(()=>finish(Error('Audio timed out.')),360000);
});}
async function renderReply(reply,version,session){
 let uri=null;
 if(state.settings.realistic&&reply.messageId&&state.status?.eligible&&state.settings.voiceId){
  try{
   const auto=state.status?.automaticRP?.enabled&&state.status.automaticRP.features.includes('conversation');
   const ceiling=context.companion==='lumen'?150:60;
   const maxCost=state.settings.allowPoints?state.settings.unlimited?ceiling:Math.max(0,Math.min(ceiling,state.settings.sessionLimit-state.spent)):auto?ceiling:0;
   const result=await featureApi(context.companion==='lumen'?'/api/companion/reading':'/api/assistant/voice',{messageId:reply.messageId,voiceId:state.settings.voiceId,allowPoints:state.settings.allowPoints,acceptedRate:state.settings.acceptedRate,maxCost,companion:context.companion,feature:'conversation',automatic:!!auto,confirmed:!auto&&state.settings.allowPoints,priceVersion:state.status?.priceVersion},{timeoutMs:70000});
   if(version!==generation)return;
   publish({spent:state.spent+result.cost,notice:result.cost?`${result.cost} RP used · ${state.spent+result.cost}${state.settings.unlimited?'':` / ${state.settings.sessionLimit}`} RP this session`:state.notice});
   uri=await NativeModules.RiseQuestAlarmAudio.cacheSpeech(result.fingerprint,result.audioBase64);
   void refreshVoiceStatus();void refreshCollection().catch(()=>{});
  }catch(e){if(version!==generation)return;if(e.code==='VOICE_PRICE'){publish({settings:{...state.settings,allowPoints:false}});void refreshVoiceStatus();}publish({notice:e.message||'Realistic voice could not load. Using device voice.'});}
 }
 if(version!==generation)return;
 publish({phase:'speaking',busy:true});
 if(session&&native){uri?native.play(uri):native.speak(reply.reply);return;}
 if(uri)await localAudio(uri);else await deviceSpeech(reply.reply);
 if(version===generation){publish({phase:session?'listening':'off',busy:false});if(session)fallbackListen(version);}
}
async function performCompanionAction(action){
 const handlers=actionHandlers;
 if(AppState.currentState!=='active')return 'Open RiseQuest, then say yes to continue.';
 if(!handlers||handlers.owner!==state.owner)return 'Open your companion and try again.';
 const ready=handlers.canExecute?.();
 if(ready!==true)return typeof ready==='string'?ready:'Finish the current screen, then say yes to continue.';
 if(typeof handlers[action.type]!=='function')return 'That action is unavailable. Please try its screen directly.';
 // Consume before invoking: repeated transcripts/taps cannot create two quests.
 clearVoiceAction();executingAction=true;
 try{return await handlers[action.type](action) || 'Done.';}
 catch(e){return action.type==='quest'?'I could not confirm the quest was saved. Check your quests before trying again.':action.type==='manage'?(e.message || 'That change could not finish. Check its screen before trying again.'):'That action could not finish. Please try again.';}
 finally{executingAction=false;}
}
export async function confirmCompanionAction(){return sendCompanionMessage('confirm');}
export async function sendCompanionMessage(message,{read=state.settings.autoRead}={}){
 if(state.busy||executingAction||!message?.trim()||!state.owner)return;
 const version=generation,id=++turn,session=state.active;
 if(session)native?.pause();publish({busy:true,phase:'thinking',notice:''});
 try{
  let reply;
  const intent=confirmationIntent(message),destination=directNavigation(message),management=parseCareCommand(message)||directManagement(message);
  const prepare=async (request,selectedId=null)=>{
   if(AppState.currentState!=='active')return {reply:'Open RiseQuest and ask again to review that change.'};
   const handlers=actionHandlers;
   if(!handlers||handlers.owner!==state.owner||typeof handlers.prepare!=='function')return {reply:'Open your companion and ask again.'};
   const ready=handlers.canExecute?.();
   if(ready!==true)return {reply:typeof ready==='string'?ready:'Finish the current screen, then ask again.'};
   const result=await handlers.prepare(request,selectedId);
   if(version!==generation||id!==turn)return {reply:''};
   publish({action:result.action||null,selection:result.selection||null,actionCreatedAt:result.action||result.selection?Date.now():0});
   return {reply:result.reply};
  };
  if(intent){
   if(intent==='cancel'&&(state.action||state.selection)){clearVoiceAction();reply={reply:'Cancelled.'};}
   else if(state.selection)reply={reply:'Choose a number or name first, or say cancel.'};
   else if(!state.action)reply={reply:'There is no pending action. Tell me what you would like to open or do.'};
   else if(Date.now()-state.actionCreatedAt>actionLifetimeMs){clearVoiceAction();reply={reply:'That request has expired. Please tell me what you would like to do again.'};}
   else reply={reply:await performCompanionAction(state.action)};
  }else if(management){
   clearVoiceAction();reply=await prepare(management);
  }else if(state.selection&&!destination&&!isManagementRequest(message)){
   if(Date.now()-state.actionCreatedAt>actionLifetimeMs){clearVoiceAction();reply={reply:'That request has expired. Please ask again.'};}
   else {
    const selection=state.selection,selectedId=chooseManagementOption(selection,message);
    reply=selectedId?await prepare(selection.request,selectedId):{reply:'Please say the number or name of one of those choices, or say cancel.'};
   }
  }else if(isManagementRequest(message)){
   clearVoiceAction();reply={reply:'Tell me one change and its name. For example: delete the Morning alarm, change the Morning alarm to 7:30 am, or equip the Bright Spark badge.'};
  }else if(destination){
   const action={type:'navigate',screen:destination};publish({action,actionCreatedAt:Date.now()});
   reply={reply:await performCompanionAction(action)};
  }else{
   clearVoiceAction();
   reply=await featureApi('/api/assistant/turn',{message:message.trim(),...context,navigationMode:'direct-v1',careMode:'care-v1'});
   if(version!==generation||id!==turn)return;
   const action=validCompanionAction(reply.action);
   if(action?.type==='manage'||action?.type==='care')reply=await prepare(action);
   else {publish({action,actionCreatedAt:action?Date.now():0});
   if(action?.type==='navigate'&&isNavigationRequest(message))reply={reply:await performCompanionAction(action)};
   else if(action)reply={reply:actionPrompt(action)};
   else if(reply.action)reply={reply:'I could not prepare that action. Try asking for a specific screen or task.'};
   }
  }
  if(version!==generation||id!==turn)return;
  publish({reply:reply.reply,messageId:reply.messageId||null});
  if(session||read)await renderReply(reply,version,session);else publish({busy:false,phase:'off'});
 }catch(e){if(version===generation){publish({busy:false,notice:e.message||'Could not connect. Try again.',phase:session?'listening':'off'});if(session){if(native)native.resume();else fallbackListen(version);}}}
}
export function clearVoiceAction(){publish({action:null,selection:null,actionCreatedAt:0});}
export function setCompanionReply(reply){publish({reply,action:null,selection:null,messageId:null});}
export async function replayCompanionReply(){if(!state.reply||state.busy)return;const version=generation;publish({busy:true});try{await renderReply({reply:state.reply,messageId:state.messageId},version,state.active);}catch(e){if(version===generation){publish({busy:false,notice:e.message});if(state.active)stopVoiceConversation(e.message);}}}
async function fallbackListen(version){if(version!==generation||!state.active||AppState.currentState!=='active')return;
 publish({phase:'listening',busy:false});try{const text=await listenOnce();if(version!==generation||!state.active)return;if(text?.trim())await sendCompanionMessage(text);else fallbackTimer=setTimeout(()=>fallbackListen(version),700);}catch(e){if(version===generation)stopVoiceConversation(e.message);}}
export async function startVoiceConversation(){
 if(state.active){stopVoiceConversation();return;}
 if(!state.owner)throw Error('Sign in to start voice chat.');
 if(state.busy||starting)return;
 starting=true;const requested=generation;
 try{
 stopSpeech();publish({spent:0,notice:''});
 if(Platform.OS==='android'){
  const mic=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);if(mic!==PermissionsAndroid.RESULTS.GRANTED)throw Error('Allow the microphone to start voice chat.');
  if(Number(Platform.Version)>=33){const permission=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);if(permission!==PermissionsAndroid.RESULTS.GRANTED)throw Error('Allow notifications so you can stop background voice chat.');}
 }
 if(requested!==generation||!state.owner||AppState.currentState!=='active')return;
 const version=++generation;
 try{if(native){publish({active:true,phase:'starting',busy:false});await native.start(state.settings.background);}else{publish({active:true,phase:'listening',busy:false});fallbackListen(version);}}catch(e){if(version===generation)stopVoiceConversation(e.message);throw e;}
 }finally{starting=false;}
}
if(native){new NativeEventEmitter(native).addListener('risequestVoice',event=>{
 if(event.kind==='stopped'){if(state.active)stopVoiceConversation(event.value||'');return;}
 if(!state.active)return;
 if(event.kind==='transcript')void sendCompanionMessage(event.value);
 else if(event.kind==='state')publish({phase:event.value,...(event.value==='listening'&&!executingAction?{busy:false}:{})});
 else if(event.kind==='played'&&!executingAction)publish({busy:false});
});}
AppState.addEventListener('change',value=>{if(value!=='active'&&(state.phase==='speaking'&&!state.active||state.active&&(!native||!state.settings.background)))stopVoiceConversation('Voice chat stopped. Tap the microphone to start again.');});
onAuthSessionChanged(()=>{const owner=state.owner;stopVoiceConversation();publish({...initial,owner,settings:{...defaults}});});

// Notes and reader playback share the conversation cancellation generation and audio
// ownership, so account changes and alarm takeover stop the same player.
export async function playReading(text,input,options={}){
 if(options.owner&&options.owner!==state.owner)throw Error('Your account changed. Reopen the reader.');
 stopVoiceConversation();const version=generation;publish({busy:true,phase:'speaking'});
 try{
  if(input){
   const result=await featureApi('/api/companion/reading',input,{timeoutMs:70000,expectedToken:options.expectedToken});
   if(version!==generation)return;
   const uri=await NativeModules.RiseQuestAlarmAudio.cacheSpeech(result.fingerprint,result.audioBase64);
   if(version!==generation)return;void refreshCollection().catch(()=>{});await localAudio(uri);
  }else await deviceSpeech(text);
 }finally{if(version===generation)publish({busy:false,phase:'off'});}
}
