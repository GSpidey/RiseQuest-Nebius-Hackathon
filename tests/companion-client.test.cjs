const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=file=>fs.readFileSync(require.resolve('../src/features/companion/'+file),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function setupCare(){
 let current=true,n=0,mutations=[];
 const quests=[{id:'q1',revision:3,title:'Lunch',subtasks:[{id:'s1',title:'Cook',order:1}]},{id:'q2',revision:2,title:'Lunch shopping',subtasks:[]}];
 const ctx={getAuthToken:async()=> 'owner-token',requestKey:()=>`key_${++n}`,supportSnapshot:async()=>({quests,notes:[],plan:{today:[{stepTitle:'Cook',minutes:5}],gentle:true,clock:{local:'2026-10-27 10:00'},unfinishedCount:2}}),supportChange:async(body,options)=>{mutations.push({body,options});},featureApi:async()=>({})};
 vm.runInNewContext(source('careCommands.js')+';globalThis.api={parseCareCommand,createCareManager};',ctx);
 const manager=ctx.api.createCareManager({isCurrent:()=>current,readNote:async()=>{}});
 return {...ctx.api,manager,mutations,setCurrent:v=>current=v};
}
test('care commands resolve real records and bind revisions and session before confirmed changes',async()=>{
 const h=setupCare(),r=h.parseCareCommand('rename quest Lunch to Lunch prep');const proposed=await h.manager.prepare(r);
 assert.equal(h.mutations.length,0);assert.match(proposed.reply,/Lunch prep/);assert.equal(proposed.action.body.id,'q1');assert.equal(proposed.action.body.revision,3);
 await h.manager.execute(proposed.action);assert.equal(h.mutations.length,1);assert.equal(h.mutations[0].options.expectedToken,'owner-token');
 h.setCurrent(false);await assert.rejects(h.manager.execute(proposed.action));assert.equal(h.mutations.length,1);
});
test('ambiguous care requests ask for selection; check-in and note creation require review',async()=>{
 const h=setupCare();const r=await h.manager.prepare({operation:'care_complete',query:'lun'});assert.equal(r.selection.choices.length,2);assert.equal(h.mutations.length,0);
 const step=await h.manager.prepare(h.parseCareCommand('complete step Cook in Lunch'));assert.equal(step.action.body.stepId,'s1');assert.equal(step.action.body.completed,true);
 const note=await h.manager.prepare(h.parseCareCommand('save note Remember: bring lunch'));assert.match(note.reply,/bring lunch/);assert.equal(note.action.body.operation,'note_save');
 assert.equal(h.parseCareCommand('do not complete quest Lunch'),null);
 const check=await h.manager.prepare(h.parseCareCommand('check in mood -1 energy 2 focus 3'));assert.equal(check.action.body.energy,2);assert.equal(h.mutations.length,0);
});
test('local planning produces real bounded next steps without calling a model',async()=>{
 const h=setupCare();const result=await h.manager.prepare(h.parseCareCommand('plan my day'));assert.match(result.reply,/Cook for 5 minutes/);assert.match(result.reply,/2 unfinished/);assert.equal(result.action,undefined);
});
test('date entry roundtrips a real time zone and rejects nonexistent DST time',()=>{
 const c={};vm.runInNewContext(source('readerText.js')+';globalThis.api={dueInstant,dueText,removeRepeatedHeaders}',c);
 assert.equal(c.api.dueInstant('2026-10-27 10:00','America/Vancouver'),'2026-10-27T17:00:00.000Z');
 assert.throws(()=>c.api.dueInstant('2026-03-08 02:30','America/Vancouver'));
 assert.equal(c.api.removeRepeatedHeaders('Header\nA\n\nHeader\nB\n\nHeader\nC'),'A\n\nB\n\nC');
});
test('quiet hours and DST produce bounded reminders; cancellation invalidates pending permission callbacks',async()=>{
 let permission,scheduled=[];const c={PushNotification:{cancelLocalNotification(){},createChannel(_,fn){fn()},checkPermissions:fn=>permission=fn,localNotificationSchedule:v=>scheduled.push(v)}};
 vm.runInNewContext(source('supportReminders.js')+';globalThis.api={reminderDates,scheduleSupportReminders,cancelSupportReminders}',c);
 const p={timezone:'America/New_York',quietStart:'21:00',quietEnd:'08:00',checkInTime:'09:00',checkIns:true,reminders:true};
 const dates=c.api.reminderDates(p,new Date('2026-10-31T20:00:00Z'));assert(dates.length<=16);
 assert(dates.some(d=>d.date.toISOString()==='2026-11-01T14:00:00.000Z'));
 const pending=c.api.scheduleSupportReminders('one',p);c.api.cancelSupportReminders();permission({alert:true});await pending;assert.equal(scheduled.length,0);
});
test('legacy history ownership is claimed before copying and another account cannot claim it',async()=>{
 const values=new Map([['mood_history','[{"notes":"private"}]']]),writes=[];const c={AsyncStorage:{getItem:async k=>values.get(k),setItem:async(k,v)=>{writes.push(k);values.set(k,v);}}};
 vm.runInNewContext(source('supportClient.js')+';globalThis.claim=claimLegacyMood',c);
 const rows=await c.claim('one');assert.equal(rows[0].notes,'private');assert.equal(writes[0],'risequest_legacy_mood_owner');await assert.rejects(c.claim('two'));assert(values.has('mood_history'));
});

test('focus reminders use explicit sessions, quiet hours, and cancellation instead of assumed inactivity',async()=>{
 let scheduled=[],cancelled=[],grant;
 const c={PushNotification:{cancelLocalNotification:id=>cancelled.push(id),createChannel:(_,fn)=>fn(),checkPermissions:fn=>grant=fn,localNotificationSchedule:v=>scheduled.push(v)}};
 vm.runInNewContext(source('supportReminders.js')+';globalThis.api={scheduleFocusReminder,cancelFocusReminder}',c);
 const p={reminders:true,timezone:'UTC',quietStart:'21:00',quietEnd:'08:00'};
 await c.api.scheduleFocusReminder('one',p,5,'focus',new Date('2026-10-27T22:00:00Z'));assert.equal(scheduled.length,0);
 const first=c.api.scheduleFocusReminder('one',p,5,'focus',new Date('2026-10-27T10:00:00Z'));c.api.cancelFocusReminder();grant({alert:true});await first;assert.equal(scheduled.length,0);
 const next=c.api.scheduleFocusReminder('one',p,5,'break',new Date('2026-10-27T10:00:00Z'));grant({alert:true});await next;
 assert.equal(scheduled[0].date.toISOString(),'2026-10-27T10:05:00.000Z');assert.equal(scheduled[0].userInfo.owner,'one');assert.match(scheduled[0].message,/break has ended/);
});
