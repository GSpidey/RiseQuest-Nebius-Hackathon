const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const actionsSource=fs.readFileSync(path.join(root,'src/features/companion/actions.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const c={...require('../backend/src/careActions')};vm.createContext(c);vm.runInContext(actionsSource+';globalThis.actions={companionDestinations,directNavigation,isNavigationRequest,confirmationIntent,validCompanionAction};',c);
const {companionDestinations,directNavigation,isNavigationRequest,confirmationIntent,validCompanionAction}=c.actions;
test('all destination aliases open through explicit polite commands',()=>{
 for(const [screen,aliases] of Object.entries(companionDestinations))for(const alias of aliases){
  assert.equal(directNavigation('Open '+alias),screen);
  assert.equal(directNavigation('Could you please take me to the '+alias+' screen?'),screen);
 }
 assert.equal(directNavigation('Please open my alarms please.'),'alarms');
});
test('discussion, negation, ambiguous destinations and compound requests never match local navigation',()=>{
 for(const text of ['Do not open alarms',"Don't open alarms",'Can you explain how to open alarms?','I wish I could open alarms','Open alarms and settings','Open not the alarms','Open the unknown thing','open admin','Open __proto__'])assert.equal(directNavigation(text),null,text);
 assert.equal(isNavigationRequest('Open alarms but only if I ask'),false);
});
test('only unambiguous whole utterances confirm or cancel',()=>{
 for(const text of ['Yes.','Yes please','Yes, please.','Okay','Go ahead','Confirm'])assert.equal(confirmationIntent(text),'confirm');
 for(const text of ['No thanks','Cancel that','Never mind.'])assert.equal(confirmationIntent(text),'cancel');
 for(const text of ['Yes but make it tomorrow','Do not cancel','I said yes yesterday','No later than 7','Yes, change the title'])assert.equal(confirmationIntent(text),null);
});
test('client validates actions and normalizes briefings without exposing privileged destinations',()=>{
 for(const screen of ['admin','family-review','auth','constructor','__proto__'])assert.equal(validCompanionAction({type:'navigate',screen}),null);
 assert.equal(validCompanionAction({type:'briefing'}).screen,'routine');
 assert.equal(validCompanionAction({type:'alarm',time:'24:00'}),null);assert.equal(validCompanionAction({type:'quest',title:' '}),null);
 assert.equal(validCompanionAction({type:'purchase'}),null);
});
function backend(){
 let handler,options;const module={exports:{}};
 const ctx={module,require:name=>name==='../careActions'?require('../backend/src/careActions'):name==='../providerUsage'?{reserveProvider:async()=>{}}:name==='./coachingContext'?{loadCoachingContext:async()=>({externalAllowed:true,profile:{},context:{}}),SAFETY_PROMPT:'Safety',safePersonality:()=> 'gentle'}:{generateText:async opts=>{options=opts;return {kind:'generated',value:{reply:'Ready',action:null}};}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'backend/src/services/assistant.js'),'utf8'),ctx);
 const prisma={coachChatMessage:{findMany:async()=>[],create:async()=>({id:'message'})},$transaction:async fn=>fn(prisma)};
 module.exports.registerAssistant({post:(_path,_auth,fn)=>{handler=fn;}},{prisma,requireAuth:()=>{}});
 return {...module.exports,turn:async body=>{let response;await handler({body,auth:{userId:'one'}},{json:x=>response=x,status:()=>{throw Error('Unexpected status');}});return {options,response};}};
}
test('server and app destination allowlists match',()=>{
 const b=backend();assert.deepEqual([...b.DESTINATIONS].sort(),Object.keys(companionDestinations).sort());
});
test('older clients retain confirmation and legacy routes; new clients receive direct-navigation instructions',async()=>{
 const b=backend();const old=await b.turn({message:'Open settings'});
 assert.match(old.options.messages[0].content,/proposal requiring confirmation/);
 assert.equal(old.options.validate(JSON.stringify({reply:'Open settings',action:{type:'navigate',screen:'settings'}})),null);
 const next=await b.turn({message:'Open settings',navigationMode:'direct-v1'});
 assert.match(next.options.messages[0].content,/explicitly asks/);
 assert.equal(next.options.validate(JSON.stringify({reply:'Open settings',action:{type:'navigate',screen:'settings'}})).action.screen,'settings');
 assert.equal(next.options.validate(JSON.stringify({reply:'Open admin',action:{type:'navigate',screen:'admin'}})),null);
});
// Run the real App registration with state setters, without mounting native UI.
function appHandlers(overrides={}){
 const source=fs.readFileSync(path.join(root,'App.js'),'utf8');const start=source.indexOf('  useEffect(() => registerCompanionActions({');const end=source.indexOf('\n  }));',start)+9;
 assert.ok(start>0&&end>start);const calls=[];let handlers;
 const ctx={isAuthenticated:true,isGuest:false,userProfile:{id:'one'},needsOnboarding:false,mustSetPassword:false,currentScreen:'companion',currentActiveAlarm:null,challengeLockActive:false,adsSuppressed:false,
  companionDestinations,careManager:{prepare(){},execute(){}},companionManager:{prepare(){},execute(){}},setQuestRevision:()=>{},Keyboard:{dismiss:()=>calls.push(['keyboard'])},useEffect:fn=>fn(),registerCompanionActions:h=>{handlers=h;return ()=>{};},QuestService:{createQuest:async data=>{calls.push(['quest',data]);return {syncStatus:'synced'};}},...overrides};
 for(const name of ['setShowCosmeticStore','setShowPremiumModal','setUpgradeSource','setShowProfileModal','setShowSupportCenter','setEditingAlarm','setAlarmDraft','setShowCreateAlarm','handleNavChange'])ctx[name]=value=>calls.push([name,value]);
 vm.runInNewContext(source.slice(start,end),ctx);return {handlers,calls,source};
}
test('app routes every destination to a real screen or its existing modal',()=>{
 const {handlers,calls,source}=appHandlers();const modal={shop:'setShowCosmeticStore',premium:'setShowPremiumModal',profile:'setShowProfileModal',support:'setShowSupportCenter'};
 for(const screen of Object.keys(companionDestinations)){
  handlers.navigate({screen});
  if(modal[screen])assert.ok(calls.some(([name,value])=>name===modal[screen]&&value===true));
  else {assert.ok(source.includes("case '"+screen+"':"),screen);assert.deepEqual(calls.at(-1),['handleNavChange',screen]);}
 }
});
test('app preserves alarm locks, onboarding and existing panels',()=>{
 assert.equal(appHandlers().handlers.canExecute(),true);
 for(const state of [{currentActiveAlarm:{id:1}},{challengeLockActive:true},{adsSuppressed:true},{needsOnboarding:true},{isAuthenticated:false},{isGuest:true},{mustSetPassword:true}])assert.equal(typeof appHandlers(state).handlers.canExecute(),'string');
});
test('alarm confirmation only opens a draft and quest confirmation preserves owner identity',async()=>{
 const {handlers,calls}=appHandlers();const result=handlers.alarm({time:'07:30',label:'Morning'});
 assert.match(result,/tap Save/);assert.equal(calls.find(([name])=>name==='setAlarmDraft')[1].time,'07:30');assert.equal(calls.at(-1)[0],'setShowCreateAlarm');
 await handlers.quest({title:'Walk',description:'Outside'});assert.equal(calls.at(-1)[1].userId,'one');
});
test('Android reconstruction includes the action module and every companion module',()=>{
 const files=JSON.parse(fs.readFileSync(path.join(root,'tools/reconstruction/feature-overlay.json'),'utf8')).files;
 for(const name of ['actions.js','voiceConversation.js','CompanionHub.js','FloatingCompanion.js'])assert.ok(files.includes('src/features/companion/'+name),name);
});

test('care proposals require negotiated support, discard injected authority and reject invalid check-ins',async()=>{
 const b=backend(),action={type:'care',operation:'care_complete',query:'Lunch',id:'other-user-quest',revision:99,allowPoints:true};
 const old=await b.turn({message:'Complete quest Lunch'});assert.equal(old.options.validate(JSON.stringify({reply:'Confirm?',action})),null);
 const next=await b.turn({message:'Complete quest Lunch',careMode:'care-v1'});
 const proposal=next.options.validate(JSON.stringify({reply:'Confirm?',action})).action;
 assert.deepEqual(JSON.parse(JSON.stringify(proposal)),{type:'care',operation:'care_complete',query:'Lunch'});
 assert.equal(next.options.validate(JSON.stringify({reply:'Confirm?',action:{type:'care',operation:'care_checkin',valence:3,energy:4,focus:4}})),null);
 assert.equal(next.options.validate(JSON.stringify({reply:'Confirm?',action:{type:'care',operation:'care_recharge',query:'charge card'}})),null);
});
