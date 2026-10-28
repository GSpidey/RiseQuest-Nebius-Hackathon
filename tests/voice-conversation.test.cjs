const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const careSource=fs.readFileSync(path.join(__dirname,'../src/features/companion/careCommands.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const actionSource=fs.readFileSync(path.join(__dirname,'../src/features/companion/actions.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const {createCompanionManager,chooseManagementOption}=require('../src/features/companion/management');
const source=fs.readFileSync(path.join(__dirname,'../src/features/companion/voiceConversation.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({android=true}={}){
 let event,appChange,authChange,pending,voiceCost=10,settings={},calls=[],stops=0,spoken=0,globalStops=0;
 const native={start:async()=>true,stop:()=>stops++,pause:()=>event?.({kind:'state',value:'thinking'}),resume:()=>event?.({kind:'state',value:'listening'}),play:()=>spoken++,speak:()=>spoken++};
 const api=async(route,body)=>{calls.push({route,body});if(route.endsWith('/turn'))return pending?pending:{reply:'A small next step.',messageId:'reply-id'};if(body)return {cost:voiceCost,fingerprint:'hash',audioBase64:'audio'};return {eligible:true,voices:[{id:'stella',name:'Stella'}],remaining:0,rate:10};};
 const context={...require('../backend/src/careActions'),useSyncExternalStore:()=>{},AppState:{currentState:'active',addEventListener:(_,f)=>{appChange=f}},NativeModules:{RiseQuestVoiceSession:android?native:null,RiseQuestAlarmAudio:{cacheSpeech:async()=>'/cache.wav'}},NativeEventEmitter:class{addListener(_,f){event=f}},PermissionsAndroid:{PERMISSIONS:{RECORD_AUDIO:'mic',POST_NOTIFICATIONS:'notification'},RESULTS:{GRANTED:'granted'},request:async()=> 'granted'},Platform:{OS:android?'android':'ios',Version:36},AsyncStorage:{getItem:async()=>null,setItem:async(_,value)=>{settings=JSON.parse(value)}},Sound:class{},Tts:{getInitStatus:async()=>{},stop:async()=>{},addEventListener:()=>({remove(){}}),speak:()=>{}},featureApi:api,onAuthSessionChanged:f=>authChange=f,refreshCollection:async()=>{},listenOnce:async()=>new Promise(()=>{}),stopSpeech:()=>{globalStops++;},setTimeout,clearTimeout,Promise,Error,Math,JSON,Number,Set};
 context.chooseManagementOption=chooseManagementOption;
 vm.createContext(context);vm.runInContext(careSource+'\n'+actionSource+'\n'+source+';globalThis.api={configureVoiceAccount,updateVoiceSettings,startVoiceConversation,stopVoiceConversation,sendCompanionMessage,getVoiceConversation,replayCompanionReply,registerCompanionActions,confirmCompanionAction,clearVoiceAction,setVoiceContext,refreshVoiceStatus};',context);
 return {api:context.api,event:e=>event(e),background:()=>{context.AppState.currentState='background';appChange('background')},auth:()=>authChange(),calls,native,context,get globalStops(){return globalStops},get spoken(){return spoken},get stops(){return stops},setPending:p=>pending=p,setCost:c=>voiceCost=c,get settings(){return settings}};
}
test('native thinking event before transcript sends exactly once and resumes on listening',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');await h.api.startVoiceConversation();h.event({kind:'state',value:'thinking'});h.event({kind:'transcript',value:'Help me start'});h.event({kind:'transcript',value:'duplicate'});await tick();assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,1);assert.equal(h.spoken,1);assert.equal(h.api.getVoiceConversation().busy,true);h.event({kind:'state',value:'listening'});assert.equal(h.api.getVoiceConversation().busy,false);h.api.stopVoiceConversation();assert.equal(h.api.getVoiceConversation().active,false);
});
test('stopping while reply is pending prevents speech and paid generation',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');await h.api.updateVoiceSettings({realistic:true,allowPoints:true});let finish;h.setPending(new Promise(r=>finish=r));await h.api.startVoiceConversation();h.event({kind:'transcript',value:'Hello'});h.api.stopVoiceConversation();finish({reply:'Late reply',messageId:'late'});await tick();assert.equal(h.spoken,0);assert.equal(h.calls.filter(c=>c.route.endsWith('/voice')&&c.body).length,0);
});
test('defaults never authorize points; session cap reduces the maximum debit',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');assert.equal(h.api.getVoiceConversation().settings.allowPoints,false);await h.api.updateVoiceSettings({realistic:true,allowPoints:true,sessionLimit:20});h.setCost(12);await h.api.startVoiceConversation();h.event({kind:'transcript',value:'First'});await tick();h.event({kind:'state',value:'listening'});h.event({kind:'transcript',value:'Second'});await tick();const paid=h.calls.filter(c=>c.route.endsWith('/voice')&&c.body);assert.equal(paid[0].body.maxCost,20);assert.equal(paid[1].body.maxCost,8);h.api.stopVoiceConversation();
});
test('background is explicit; account change and sign-out stop the session',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');await h.api.startVoiceConversation();h.background();assert.equal(h.api.getVoiceConversation().active,false);
 h.context.AppState.currentState='active';await h.api.updateVoiceSettings({background:true});await h.api.startVoiceConversation();h.background();assert.equal(h.api.getVoiceConversation().active,true);h.auth();assert.equal(h.api.getVoiceConversation().active,false);assert.equal(h.api.getVoiceConversation().settings.allowPoints,false);
 h.context.AppState.currentState='active';await h.api.startVoiceConversation();await h.api.configureVoiceAccount('two');assert.equal(h.api.getVoiceConversation().active,false);assert.equal(h.api.getVoiceConversation().reply,null);
});
test('iOS foreground session stops when app leaves foreground',async()=>{
 const h=setup({android:false});await h.api.configureVoiceAccount('one');await h.api.updateVoiceSettings({background:true});await h.api.startVoiceConversation();h.background();assert.equal(h.api.getVoiceConversation().active,false);
});

test('user-selected large cap and no-cap mode are preserved without a sales ceiling',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');await h.api.updateVoiceSettings({realistic:true,allowPoints:true,sessionLimit:10000});assert.equal(h.settings.sessionLimit,10000);assert.equal(h.settings.acceptedRate,10);await h.api.updateVoiceSettings({unlimited:true});await h.api.startVoiceConversation();h.event({kind:'transcript',value:'Long reply'});await tick();const request=h.calls.find(c=>c.route.endsWith('/voice')&&c.body);assert.equal(request.body.maxCost,60);assert.equal(request.body.acceptedRate,10);h.api.stopVoiceConversation();
});
test('permission prompt completion cannot revive a stopped session',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');let grant;h.context.PermissionsAndroid.request=()=>new Promise(r=>grant=r);h.context.Platform.Version=32;const start=h.api.startVoiceConversation();h.api.stopVoiceConversation();grant('granted');await start;assert.equal(h.api.getVoiceConversation().active,false);
});

test('idle/session cleanup does not stop speech owned by an alarm',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');assert.equal(h.globalStops,0);h.api.stopVoiceConversation('Alarm started',true);assert.equal(h.globalStops,0);await h.api.startVoiceConversation();const before=h.globalStops;h.api.stopVoiceConversation('Alarm started',true);assert.equal(h.globalStops,before);
});
test('alarm handoff preserves shared device speech; explicit Stop ends owned device playback',async()=>{
 for(const preserve of [true,false]){
  const h=setup();let stops=0;h.context.Tts.stop=async()=>{stops++;};await h.api.configureVoiceAccount('one');const sending=h.api.sendCompanionMessage('Hello',{read:true});await tick();assert.equal(h.api.getVoiceConversation().phase,'speaking');const before=stops;h.api.stopVoiceConversation(preserve?'Alarm started':'',preserve);await sending;assert.equal(stops,before+(preserve?0:1));assert.equal(h.api.getVoiceConversation().busy,false);
 }
});

test('thirty native conversation turns survive reconnecting without duplicate requests',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');await h.api.startVoiceConversation();
 for(let i=0;i<30;i++){
  h.event({kind:'state',value:'starting'});assert.equal(h.api.getVoiceConversation().active,true);
  h.event({kind:'state',value:'listening'});h.event({kind:'transcript',value:'Turn '+i});
  h.event({kind:'transcript',value:'duplicate'});await tick();
  assert.equal(h.api.getVoiceConversation().active,true);assert.equal(h.spoken,i+1);
  h.event({kind:'played',value:''});h.event({kind:'state',value:'starting'});
 }
 assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,30);h.api.stopVoiceConversation();
});

function bindActions(h,{owner='one',ready=true,quest,navigate}={}){
 const performed=[];
 const cleanup=h.api.registerCompanionActions({owner,canExecute:()=>ready,
  navigate:async action=>{performed.push(action);return navigate?await navigate(action):'Opening '+action.screen;},
  alarm:async action=>{performed.push(action);return 'Review your alarm draft.';},
  quest:async action=>{performed.push(action);return quest?await quest(action):'Quest saved.';}});
 return {performed,cleanup};
}
for(const android of [true,false])test(`${android?'Android':'iOS'} direct navigation works without chat or paid voice requests`,async()=>{
 const h=setup({android});await h.api.configureVoiceAccount('one');const a=bindActions(h);
 await h.api.sendCompanionMessage('Could you please open my alarms?',{read:false});
 assert.equal(a.performed[0].screen,'alarms');assert.equal(h.api.getVoiceConversation().action,null);
 assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,0);
 assert.equal(h.calls.filter(c=>c.route.endsWith('/voice')&&c.body).length,0);
 await h.api.sendCompanionMessage('Take me to settings',{read:false});assert.equal(a.performed[1].screen,'settings');
});
test('spoken yes consumes a proposal once, including duplicate recognition events',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);
 h.setPending({reply:'Let us make a task.',action:{type:'quest',title:'Tidy room',description:'Start small'},messageId:'proposal'});
 await h.api.startVoiceConversation();h.event({kind:'transcript',value:'Help me tidy my room'});await tick();
 assert.match(h.api.getVoiceConversation().reply,/Say yes or cancel/);assert.equal(a.performed.length,0);
 h.event({kind:'state',value:'listening'});h.event({kind:'transcript',value:'Yes please'});h.event({kind:'transcript',value:'Yes please'});await tick();
 assert.equal(a.performed.length,1);assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,1);
 h.event({kind:'state',value:'listening'});h.event({kind:'transcript',value:'yes'});await tick();assert.equal(a.performed.length,1);
 h.api.stopVoiceConversation();
});
test('spoken cancellation clears a pending alarm without creating it or asking the model',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);
 h.setPending({reply:'Set alarm.',action:{type:'alarm',time:'07:30',label:'Morning'}});
 await h.api.sendCompanionMessage('Prepare a morning alarm',{read:false});
 await h.api.sendCompanionMessage('No thanks',{read:false});
 assert.equal(a.performed.length,0);assert.equal(h.api.getVoiceConversation().action,null);assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,1);
});
test('confirmation button and spoken confirmations use the same global action handler',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');await h.api.updateVoiceSettings({autoRead:false});const a=bindActions(h);
 h.setPending({reply:'Draft.',action:{type:'alarm',time:'08:00',label:'Wake up'}});
 await h.api.sendCompanionMessage('Alarm tomorrow',{read:false});await h.api.confirmCompanionAction();
 assert.equal(a.performed.length,1);assert.equal(a.performed[0].type,'alarm');assert.match(h.api.getVoiceConversation().reply,/draft/);
});
test('navigation suggestions wait for confirmation; explicit server-resolved destinations open',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);
 h.setPending({reply:'Maybe practice?',action:{type:'navigate',screen:'brain-training'}});
 await h.api.sendCompanionMessage('I am bored',{read:false});assert.equal(a.performed.length,0);
 await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.performed[0].screen,'brain-training');
 h.setPending({reply:'Sure.',action:{type:'navigate',screen:'sleep'}});
 await h.api.sendCompanionMessage('Open the place with my sleeping records',{read:false});assert.equal(a.performed[1].screen,'sleep');
 assert.equal(h.calls.find(c=>c.route.endsWith('/turn')).body.navigationMode,'direct-v1');
});
test('background navigation waits until the user returns and confirms',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);h.context.AppState.currentState='background';
 await h.api.sendCompanionMessage('Open quests',{read:false});assert.equal(a.performed.length,0);assert.equal(h.api.getVoiceConversation().action.screen,'quests');
 h.context.AppState.currentState='active';await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.performed[0].screen,'quests');
});
test('blocked alarm or modal retains requested destination for later confirmation',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h,{ready:'Finish your alarm challenge first.'});
 await h.api.sendCompanionMessage('Open home',{read:false});assert.equal(a.performed.length,0);assert.match(h.api.getVoiceConversation().reply,/alarm challenge/);
 const b=bindActions(h);await h.api.sendCompanionMessage('yes',{read:false});assert.equal(b.performed[0].screen,'home');
});
test('expired actions, sign-out and Stop prevent later confirmations',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);
 h.setPending({reply:'Proposal',action:{type:'quest',title:'Walk'}});await h.api.sendCompanionMessage('Plan a walk',{read:false});
 const future=Date.now()+121000;h.context.Date=class extends Date {static now(){return future;}};
 await h.api.sendCompanionMessage('yes',{read:false});assert.match(h.api.getVoiceConversation().reply,/expired/);assert.equal(a.performed.length,0);
 await h.api.sendCompanionMessage('Plan a walk',{read:false});h.api.stopVoiceConversation();await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.performed.length,0);
 await h.api.sendCompanionMessage('Plan a walk',{read:false});h.auth();assert.equal(h.api.getVoiceConversation().action,null);
});
test('account change discards a pending response before it can navigate',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);let finish;
 h.setPending(new Promise(r=>finish=r));const sent=h.api.sendCompanionMessage('Open my sleeping records',{read:false});
 await h.api.configureVoiceAccount('two');finish({reply:'Open sleep',action:{type:'navigate',screen:'sleep'}});await sent;
 assert.equal(a.performed.length,0);assert.equal(h.api.getVoiceConversation().reply,null);
 await h.api.sendCompanionMessage('Open alarms',{read:false});assert.equal(a.performed.length,0);
});
test('pending save ignores playback events and duplicate confirmation; Stop suppresses late reply',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');let finish;const a=bindActions(h,{quest:()=>new Promise(r=>finish=r)});
 h.setPending({reply:'Proposal',action:{type:'quest',title:'Walk'}});await h.api.sendCompanionMessage('Plan a walk',{read:false});
 await h.api.startVoiceConversation();const confirmed=h.api.sendCompanionMessage('yes',{read:false});
 h.event({kind:'played'});h.event({kind:'state',value:'listening'});await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.performed.length,1);
 h.api.stopVoiceConversation();finish('Saved late');await confirmed;assert.notEqual(h.api.getVoiceConversation().reply,'Saved late');
});
test('unknown or privileged action is rejected; ordinary conversation still works',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h);
 for(const action of [{type:'navigate',screen:'admin'},{type:'purchase',amount:100},{type:'alarm',time:'25:00'}]){
  h.setPending({reply:'Done!',action});await h.api.sendCompanionMessage('Do something',{read:false});assert.equal(h.api.getVoiceConversation().action,null);assert.doesNotMatch(h.api.getVoiceConversation().reply,/Done!/);
 }
 assert.equal(a.performed.length,0);h.setPending({reply:'Hello there'});await h.api.sendCompanionMessage('hello',{read:false});assert.equal(h.api.getVoiceConversation().reply,'Hello there');
});
test('handler failure is reported without a false success or automatic duplicate save',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindActions(h,{quest:async()=>{throw Error('offline');}});
 h.setPending({reply:'Proposal',action:{type:'quest',title:'Walk'}});await h.api.sendCompanionMessage('Plan a walk',{read:false});await h.api.sendCompanionMessage('yes',{read:false});
 assert.match(h.api.getVoiceConversation().reply,/could not confirm/);assert.equal(h.api.getVoiceConversation().action,null);await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.performed.length,1);
});

function bindManagement(h,{multiple=false,...overrides}={}){
 const calls=[],alarms=[{id:'a',label:'Morning',time:'07:00'},...(multiple?[{id:'b',label:'Work',time:'08:00'}]:[])];
 const manager=createCompanionManager({owner:'one',isCurrent:()=>h.api.getVoiceConversation().owner==='one',getAlarms:()=>alarms,
  removeAlarm:async a=>{calls.push(['delete',a.id]);},updateAlarm:async(a,c)=>calls.push(['update',a.id,c]),
  getCollection:async()=>({catalog:[{id:'ocean',name:'Ocean',type:'themes'}],inventory:[],loadout:{}}),quote:async()=>({amount:50}),buy:async(path,body)=>calls.push([path,body]),...overrides});
 h.api.registerCompanionActions({owner:'one',canExecute:()=>true,prepare:manager.prepare,manage:manager.execute,navigate:async()=>{calls.push(['navigate']);return 'Opening.';}});
 return {calls,alarms};
}
test('delete alarm asks which one, confirms the selected target and executes exactly once',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindManagement(h,{multiple:true});
 await h.api.sendCompanionMessage('Delete alarm',{read:false});assert.match(h.api.getVoiceConversation().reply,/Which one/);assert.equal(h.api.getVoiceConversation().action,null);
 await h.api.sendCompanionMessage('yes',{read:false});assert.deepEqual(a.calls,[]);
 await h.api.sendCompanionMessage('the second one',{read:false});assert.equal(h.api.getVoiceConversation().action.targetId,'b');assert.match(h.api.getVoiceConversation().reply,/Work at 08:00/);assert.deepEqual(a.calls,[]);
 await h.api.sendCompanionMessage('yes',{read:false});await h.api.sendCompanionMessage('yes',{read:false});assert.deepEqual(a.calls,[['delete','b']]);assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,0);
});
test('local rename, time change and purchase show the exact proposed change before confirmation',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindManagement(h);
 await h.api.sendCompanionMessage('Rename Morning alarm to Work',{read:false});assert.match(h.api.getVoiceConversation().reply,/to “Work”/);await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.calls[0][2].label,'Work');
 await h.api.sendCompanionMessage('Change Morning alarm to 7:30 am',{read:false});await h.api.sendCompanionMessage('cancel',{read:false});assert.equal(a.calls.length,1);
 await h.api.sendCompanionMessage('Buy Ocean theme',{read:false});assert.match(h.api.getVoiceConversation().reply,/50 Rise Points/);assert.equal(a.calls.length,1);await h.api.sendCompanionMessage('yes',{read:false});assert.equal(a.calls[1][0],'purchase');assert.equal(a.calls[1][1].expectedAmount,50);
});
test('negated or compound management cannot fall back to misleading navigation or execute a pending deletion',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');const a=bindManagement(h);h.setPending({reply:'Opening alarms',action:{type:'navigate',screen:'alarms'}});
 await h.api.sendCompanionMessage('Delete Morning alarm',{read:false});
 await h.api.sendCompanionMessage('Do not delete alarm',{read:false});await h.api.sendCompanionMessage('yes',{read:false});
 await h.api.sendCompanionMessage('delete alarm and buy a theme',{read:false});assert.deepEqual(a.calls,[]);assert.equal(h.calls.filter(c=>c.route.endsWith('/turn')).length,0);
});
test('account changes discard pending target resolution; expired or stopped actions cannot delete',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');let finish;const a=bindManagement(h,{getCollection:()=>new Promise(r=>finish=r)});
 const pending=h.api.sendCompanionMessage('Buy Ocean theme',{read:false});await tick();await h.api.configureVoiceAccount('two');finish({catalog:[],inventory:[],loadout:{}});await pending;assert.equal(h.api.getVoiceConversation().action,null);assert.deepEqual(a.calls,[]);
 await h.api.configureVoiceAccount('one');bindManagement(h);await h.api.sendCompanionMessage('delete Morning alarm',{read:false});
 const future=Date.now()+121000;h.context.Date=class extends Date{static now(){return future;}};
 await h.api.sendCompanionMessage('yes',{read:false});assert.match(h.api.getVoiceConversation().reply,/expired/);
});

test('late voice settings cannot overwrite a newly selected reader companion',async()=>{
 const h=setup();await h.api.configureVoiceAccount('one');let finishOld;
 h.context.featureApi=route=>route.includes('reading')?Promise.resolve({eligible:true,rate:25,voices:[{id:'reader-voice'}]}):new Promise(resolve=>finishOld=resolve);
 const old=h.api.refreshVoiceStatus();h.api.setVoiceContext({companion:'lumen'});await tick();
 assert.equal(h.api.getVoiceConversation().status.rate,25);
 finishOld({eligible:true,rate:10,voices:[{id:'ordinary-voice'}]});await old;
 assert.equal(h.api.getVoiceConversation().status.rate,25);assert.equal(h.api.getVoiceConversation().settings.voiceId,'reader-voice');
});
