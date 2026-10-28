const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createCompanionManager,chooseManagementOption}=require('../src/features/companion/management');
const {prepareAlarmSave,persistAlarmEdit,persistAlarmDelete}=require('../src/services/alarmEditing');
const ctx={...require('../backend/src/careActions')};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../src/features/companion/actions.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+';globalThis.api={directManagement,validCompanionAction,parseAlarmTime};',ctx);
const {directManagement,validCompanionAction,parseAlarmTime}=ctx.api;
function harness(overrides={}){
 const state={alarms:[{id:'a',label:'Morning',time:'07:00',isEnabled:true,notificationId:42,repeatDaily:true,challengeMode:true,challengeDifficulty:'hard',speechUri:'private.wav',createdAt:12}],quests:[{id:'q',userId:'one',title:'Tidy room',progress:0,updatedAt:'today'}],collection:{catalog:[{id:'ocean',name:'Ocean',type:'themes',price:50}],inventory:[{id:'spark',name:'Bright Spark',type:'badges'},{id:'bird',name:'Early Bird',type:'badges'}],loadout:{badgeIds:['bird']},requiresParentApproval:false},current:true,calls:[]};
 const deps={owner:'one',isCurrent:()=>state.current,getAlarms:()=>state.alarms,listQuests:async()=>state.quests,getCollection:async()=>state.collection,
  removeAlarm:async record=>{state.calls.push(['delete',record.id]);state.alarms=state.alarms.filter(a=>a.id!==record.id);},
  updateAlarm:async(record,changes)=>{const result=prepareAlarmSave(state.alarms,{...record,...changes},record.id);state.alarms=result.alarms;state.calls.push(['update',result.alarm]);},
  removeQuest:async id=>{state.calls.push(['quest',id]);},quote:async()=>({amount:50}),buy:async(path,body)=>state.calls.push([path,body]),equip:async body=>{state.calls.push(['equip',body]);state.collection.loadout[body.slot]=body.itemId;},...overrides};
 return {state,deps,manager:createCompanionManager(deps)};
}
test('explicit management requests cover alarm edits, quests, purchases and owned items',()=>{
 const examples=[['Delete alarm','alarm_delete',''],['Remove the Morning alarm','alarm_delete','Morning'],['Delete my quest Tidy room','quest_delete','Tidy room'],['Rename my Morning alarm to Work','alarm_rename','Morning'],['Rename alarm to Work','alarm_rename',''],['Change the Morning alarm time to 7:30 am','alarm_time','Morning'],['Change alarm time to 8 pm','alarm_time',''],['Change the time of my alarm to 06:00','alarm_time',''],['Disable alarm Morning','alarm_disable','Morning'],['Turn on my Morning alarm','alarm_enable','Morning'],['Buy the Ocean theme','item_buy','Ocean'],['Equip Bright Spark badge','item_equip','Bright Spark'],['Unequip badge Bright Spark','item_unequip','Bright Spark']];
 for(const [text,op,query]of examples){const action=directManagement(text);assert.ok(action,text);assert.equal(action.operation,op,text);assert.equal(action.query,query,text);}
 for(const [text,time]of [['12 am','00:00'],['12 pm','12:00'],['7:30 PM','19:30'],['23:59','23:59']])assert.equal(parseAlarmTime(text),time);
 for(const text of ['24:00','7:61 am','0 am','13 pm','tomorrow'])assert.equal(parseAlarmTime(text),null);
});
test('negations, batch requests, invented IDs/prices and invalid changes never become executable commands',()=>{
 for(const text of ['Do not delete alarm','delete all alarms','delete Morning alarm and Work alarm','rename alarm to','change alarm to 29:00','buy all themes'])assert.equal(directManagement(text),null,text);
 assert.equal(validCompanionAction({type:'manage',operation:'account_delete',query:''}),null);
 assert.equal(validCompanionAction({type:'manage',operation:'item_equip',itemType:'__proto__',query:''}),null);
 const safe=validCompanionAction({type:'manage',operation:'item_buy',itemType:'themes',query:'Ocean',targetId:'forged',expectedAmount:0,key:'forged'});
 assert.equal(safe.targetId,undefined);assert.equal(safe.expectedAmount,undefined);
});
test('missing and duplicate targets ask for selection without mutating anything',async()=>{
 const {manager,state}=harness();state.alarms.push({...state.alarms[0],id:'b',time:'08:00'});
 let result=await manager.prepare(directManagement('delete alarm'));assert.equal(result.selection.choices.length,2);assert.equal(result.action,undefined);assert.deepEqual(state.calls,[]);
 assert.equal(chooseManagementOption(result.selection,'the second one'),'b');assert.equal(chooseManagementOption(result.selection,'one'),'a');assert.equal(chooseManagementOption(result.selection,'99'),null);
 result=await manager.prepare(result.selection.request,'b');assert.equal(result.action.targetId,'b');assert.match(result.reply,/08:00/);assert.deepEqual(state.calls,[]);
 assert.equal((await manager.prepare(directManagement('delete Missing alarm'))).action,undefined);
});
test('confirmed edits preserve the alarm identity, challenge, speech and repeat settings',async()=>{
 const {manager,state}=harness();const original={...state.alarms[0]};
 let {action}=await manager.prepare(directManagement('change Morning alarm to 8:30 am'));await manager.execute(action);
 assert.equal(state.alarms[0].time,'08:30');for(const key of ['id','notificationId','repeatDaily','challengeDifficulty','speechUri','createdAt'])assert.equal(state.alarms[0][key],original[key]);
 ({action}=await manager.prepare(directManagement('rename Morning alarm to Work')));await manager.execute(action);assert.equal(state.alarms[0].label,'Work');
});
test('a changed or removed alarm, switched account or blocked screen prevents execution',async()=>{
 for(const mutate of [s=>{s.alarms[0].time='09:00';},s=>{s.alarms=[];},s=>{s.current=false;}]){
  const {manager,state}=harness();const {action}=await manager.prepare(directManagement('delete alarm'));mutate(state);await assert.rejects(()=>manager.execute(action));assert.deepEqual(state.calls,[]);
 }
 const {manager,state}=harness();const {action}=await manager.prepare(directManagement('delete alarm'));action.owner='two';await assert.rejects(()=>manager.execute(action));assert.deepEqual(state.calls,[]);
});
test('quest deletion rechecks ownership and current record before using the existing repository',async()=>{
 const {manager,state}=harness();state.quests.push({id:'other',userId:'two',title:'Private'});
 assert.equal((await manager.prepare(directManagement('delete quest Private'))).action,undefined);
 let {action}=await manager.prepare(directManagement('delete quest Tidy room'));state.quests[0].progress=50;await assert.rejects(()=>manager.execute(action));assert.deepEqual(state.calls,[]);
 ({action}=await manager.prepare(directManagement('delete quest Tidy room')));await manager.execute(action);assert.deepEqual(state.calls,[['quest','q']]);
});
test('purchase confirmation uses the live quoted amount, one reference and parent approval flow',async()=>{
 for(const parent of [false,true]){
  const {manager,state}=harness();state.collection.requiresParentApproval=parent;
  const {action,reply}=await manager.prepare(directManagement('buy Ocean theme'));assert.match(reply,/50 Rise Points/);assert.deepEqual(state.calls,[]);
  await manager.execute(action);assert.equal(state.calls[0][0],parent?'requests':'purchase');assert.equal(state.calls[0][1].expectedAmount,50);assert.equal(state.calls[0][1].key,action.key);
 }
 const {manager,state}=harness({buy:async()=>{throw Error('Review the current price.');}});const {action}=await manager.prepare(directManagement('buy Ocean theme'));await assert.rejects(()=>manager.execute(action),/current price/);assert.deepEqual(state.calls,[]);
});
test('equipping a badge preserves other badges, requires ownership and never replaces a full display',async()=>{
 const {manager,state}=harness();const {action}=await manager.prepare(directManagement('equip Bright Spark badge'));assert.deepEqual(action.itemId,['bird','spark']);await manager.execute(action);assert.deepEqual(state.collection.loadout.badgeIds,['bird','spark']);
 assert.equal((await manager.prepare(directManagement('equip Unknown badge'))).action,undefined);
 assert.equal((await manager.prepare(directManagement('equip Bright Spark badge'))).action,undefined);
 state.collection.loadout.badgeIds=['bird','a','b'];const result=await manager.prepare(directManagement('equip Bright Spark badge'));assert.equal(result.action,undefined);assert.match(result.reply,/three badges/);
});
test('changed loadout and purchase approval settings require a new review',async()=>{
 const {manager,state}=harness();let {action}=await manager.prepare(directManagement('equip Bright Spark badge'));state.collection.loadout.badgeIds=[];await assert.rejects(()=>manager.execute(action),/changed/);
 ({action}=await manager.prepare(directManagement('buy Ocean theme')));state.collection.requiresParentApproval=true;await assert.rejects(()=>manager.execute(action),/settings changed/);assert.deepEqual(state.calls,[]);
});
test('alarm delete persists first; failed storage leaves the notification intact and cancellation failure restores it',async()=>{
 const alarms=[{id:'one',isEnabled:true}],calls=[];
 await assert.rejects(()=>persistAlarmDelete(alarms,'one',{persist:async()=>{throw Error('disk');},cancel:()=>calls.push('cancel')}));assert.deepEqual(calls,[]);
 await assert.rejects(()=>persistAlarmDelete(alarms,'one',{persist:async a=>calls.push(a.length),cancel:async()=>{throw Error('native');},schedule:async()=>calls.push('restore')}));assert.deepEqual(calls,[0,1,'restore']);
});
test('alarm edit rollback preserves the previous notification after a scheduling error',async()=>{
 const before={id:'one',time:'07:00',notificationId:1},result=prepareAlarmSave([before],{...before,time:'08:00'},'one'),calls=[];
 await assert.rejects(()=>persistAlarmEdit(result,{persist:async a=>calls.push(a[0].time),cancel:async()=>{},schedule:async a=>{if(a.time==='08:00')throw Error('native');calls.push('scheduled '+a.time);}}));assert.deepEqual(calls,['08:00','07:00','scheduled 07:00']);
});

test('the actual App management adapter reschedules the same alarm and refreshes quest screens',async()=>{
 const source=fs.readFileSync(require.resolve('../App.js'),'utf8'),start=source.indexOf('  const companionOwner ='),end=source.indexOf('  useEffect(() => registerCompanionActions({',start);
 const alarms=[{id:'a',label:'Morning',time:'07:00',isEnabled:true,notificationId:42,challengeMode:true,challengeDifficulty:'hard',speechUri:'private.wav'}],calls=[];
 const c={createCareManager:()=>({}),isAuthenticated:true,isGuest:false,userProfile:{id:'one'},AppState:{currentState:'active'},companionRuntime:{current:{owner:'one',ready:true,alarms}},createCompanionManager,prepareAlarmSave,persistAlarmEdit,
  QuestService:{getUserQuests:async()=>[],deleteQuest:async id=>calls.push(['quest',id])},setQuestRevision:fn=>calls.push(['revision',fn(0)]),
  deleteAlarm:async id=>calls.push(['delete',id]),ensureAlarmPermissions:async()=>true,AsyncStorage:{setItem:async(k,v)=>calls.push(['persist',JSON.parse(v)])},
  cancelAlarmNotification:async a=>calls.push(['cancel',a.id]),scheduleAlarmNotification:async a=>calls.push(['schedule',a.time]),setAlarms:a=>{c.companionRuntime.current.alarms=a;},
  refreshCollection:async()=>({}),featureApi:async()=>({}),changeCollection:async()=>({})};
 vm.createContext(c);vm.runInContext(source.slice(start,end)+';globalThis.manager=companionManager;',c);
 const {action}=await c.manager.prepare(directManagement('change Morning alarm to 8 am'));await c.manager.execute(action);
 assert.equal(c.companionRuntime.current.alarms[0].time,'08:00');assert.equal(c.companionRuntime.current.alarms[0].challengeDifficulty,'hard');assert.equal(c.companionRuntime.current.alarms[0].notificationId,42);assert.equal(calls[0][0],'persist');assert.deepEqual(calls.slice(1),[['cancel','a'],['schedule','08:00']]);
 c.AppState.currentState='background';await assert.rejects(()=>c.manager.prepare(directManagement('delete alarm')));
});
