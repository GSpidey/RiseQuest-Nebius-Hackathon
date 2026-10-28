const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const {mutate,snapshot}=require('../backend/src/companionSupport');
const {plan,defaults,preferences}=require('../backend/src/companionPlanning');
const root = path.resolve(__dirname, '..');
let pg, socket, prisma, dir;

before(async () => {
  const { PGlite } = await import('../backend/node_modules/@electric-sql/pglite/dist/index.js');
  const { PGLiteSocketServer } = await import('../backend/node_modules/@electric-sql/pglite-socket/dist/index.js');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rq-recharge-test-'));
  const schema=path.join(root,'tests/fixtures/pre-companion.prisma');
  const sql = execFileSync(path.join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', schema, '--script'], { encoding: 'utf8', cwd: root });
  pg = await PGlite.create();
  await pg.exec(sql);
  await pg.exec(`INSERT INTO users(id,updated_at) VALUES ('before-migration',NOW());
    INSERT INTO quests(id,user_id,title,description,difficulty,category,status,total_steps,current_step,estimated_total_minutes,updated_at)
    VALUES ('old-quest','before-migration','Keep my work','Existing notes','easy','personal','active',2,1,20,NOW());`);
  await pg.exec(fs.readFileSync(path.join(root, 'backend/prisma/migrations/20261027010000_companion_support/migration.sql'), 'utf8'));
  socket = new PGLiteSocketServer({ db: pg, port: 15434, host: '127.0.0.1' });
  await socket.start();
  // Deliberately ignore any inherited production database URL.
  prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@127.0.0.1:15434/postgres?connection_limit=1' } } });
  await prisma.$connect();
});
after(async () => {
  await prisma?.$disconnect();
  const fallback = setTimeout(() => process.exit(process.exitCode || 0), 3000); fallback.unref();
  await socket?.stop(); await pg?.close(); fs.rmSync(dir, { recursive: true, force: true });
});
test('additive migration preserves a quest inserted with the original schema',async()=>{
 const q=await prisma.quest.findUnique({where:{id:'old-quest'}});
 assert.equal(q.title,'Keep my work');assert.equal(q.description,'Existing notes');assert.equal(q.currentStep,1);
 assert.equal(q.totalSteps,2);assert.equal(q.lane,'later');assert.equal(q.revision,1);assert.equal(q.lastProgressAt,null);
});
let n=0;
async function fixture(){
 const userId=`care-${++n}@example.test`;
 await prisma.user.create({data:{id:userId}});
 const quest=await prisma.quest.create({data:{userId,title:'Prepare lunch',description:'',difficulty:'easy',category:'personal',status:'active',totalSteps:2,currentStep:0,estimatedTotalMinutes:20,
 subtasks:{create:[{title:'Gather ingredients',description:'',order:1,estimatedMinutes:5,difficulty:'easy'},{title:'Cook',description:'',order:2,estimatedMinutes:15,difficulty:'easy'}]}},include:{subtasks:{orderBy:{order:'asc'}}}});
 return {userId,quest,change:input=>mutate(prisma,userId,{key:`request_${++n}`,id:quest.id,revision:1,...input})};
}
test('new quests and preferences have valid defaults',async()=>{
 const f=await fixture();const data=await snapshot(prisma,f.userId);
 assert.equal(data.quests[0].lane,'later');assert.equal(data.plan.unfinishedCount,1);assert.equal(data.plan.remainingMinutes,20);
 assert.equal(data.preferences.data.automaticRP.enabled,false);
});
test('notes are owner-scoped, revision protected and exact retries are idempotent',async()=>{
 const a=await fixture(),b=await fixture(),input={operation:'note_save',id:'note-owner',revision:0,title:'Remember',body:'Bring lunch',questId:a.quest.id,key:'same_request_123'};
 const row=await a.change(input);assert.deepEqual(await a.change(input),row);
 await assert.rejects(b.change(input),e=>e.status===404);
 await assert.rejects(a.change({...input,title:'Different'}),e=>e.status===409);
 await assert.rejects(a.change({...input,key:'stale_request_123'}),e=>e.status===409);
 const saved=await a.change({...input,key:'new_request_123',revision:1,title:'Lunch'});assert.equal(saved.revision,2);
});
test('quest ownership, stale edits, reorder uniqueness and one Now lane are enforced',async()=>{
 const a=await fixture(),b=await fixture();await assert.rejects(b.change({operation:'quest_update',id:a.quest.id,changes:{lane:'now'}}),e=>e.status===404);
 const ids=a.quest.subtasks.map(s=>s.id).reverse();const q=await a.change({operation:'steps_reorder',ids});assert.deepEqual(q.subtasks.map(s=>s.id),ids);
 await assert.rejects(a.change({operation:'quest_update',changes:{title:'stale'}}),e=>e.status===409);
 await a.change({operation:'quest_update',revision:2,changes:{lane:'now'}});
 const second=await prisma.quest.create({data:{userId:a.userId,title:'Other',description:'',difficulty:'easy',category:'personal',status:'active',totalSteps:0,currentStep:0,estimatedTotalMinutes:5}});
 await a.change({operation:'quest_update',id:second.id,changes:{lane:'now'}});
 assert.equal(await prisma.quest.count({where:{userId:a.userId,lane:'now'}}),1);
});
test('step rewards and XP do not repeat after undo, redo or deletion',async()=>{
 const a=await fixture();let q=await a.change({operation:'quest_complete'});
 const balance=(await prisma.risePointsBalance.findUnique({where:{userId:a.userId}})).balance;
 assert.equal(balance,5);
 q=await a.change({operation:'step_complete',revision:q.revision,stepId:q.subtasks[0].id,completed:false});
 q=await a.change({operation:'quest_complete',revision:q.revision});
 assert.equal((await prisma.risePointsBalance.findUnique({where:{userId:a.userId}})).balance,balance);
 await a.change({operation:'quest_delete',revision:q.revision});
 assert.equal((await prisma.risePointsBalance.findUnique({where:{userId:a.userId}})).balance,balance);
});
test('check-ins are recent only, account scoped and deletable; preferences require spending consent',async()=>{
 const a=await fixture(),b=await fixture();const mood=await a.change({operation:'check_in',valence:-1,energy:1,focus:2,restless:true,notes:'A slow morning'});
 assert.equal((await snapshot(prisma,a.userId)).plan.gentle,true);
 assert.equal((await snapshot(prisma,b.userId)).history.length,0);
 await assert.rejects(b.change({operation:'check_in_delete',id:mood.id}),e=>e.status===404);
 await a.change({operation:'check_in_delete',id:mood.id});
 const data={...defaults(),automaticRP:{...defaults().automaticRP,enabled:true,features:['notes']}};
 await assert.rejects(a.change({operation:'preferences',revision:0,data}),e=>e.status===400);
 await a.change({operation:'preferences',revision:0,data,confirmSpending:true});
 assert.equal((await snapshot(prisma,a.userId)).preferences.data.automaticRP.enabled,true);
});
test('planning leaves headroom, ignores old mood and preserves a large unfinished workload',()=>{
 const now=new Date('2026-10-27T10:00:00Z'),quests=Array.from({length:20},(_,i)=>({id:String(i),title:'Work',lane:'later',priority:1,estimatedTotalMinutes:120,subtasks:[]}));
 const p=plan(quests,defaults(),{recordedAt:'2026-10-20T00:00:00Z',energy:1},null,now);
 assert.equal(p.gentle,false);assert.equal(p.unfinishedCount,20);assert.equal(p.remainingMinutes,2400);assert(p.plannedMinutes<=48);assert.equal(p.today.length+p.later.length,20);
 assert.throws(()=>preferences({timezone:'not-a-zone'}));assert.throws(()=>preferences({automaticRP:{...defaults().automaticRP,enabled:true,features:['notes'],priceVersion:'old'}}));
});
const reading=require('../backend/src/services/readerVoice');
async function readerFixture(){
 const f=await fixture();await prisma.userProfile.create({data:{userId:f.userId,data:{ageGroup:'adult'}}});
 await prisma.cosmeticOwnership.create({data:{userId:f.userId,itemId:'avatar_lumen',source:'purchase'}});
 await prisma.risePointsBalance.create({data:{userId:f.userId,balance:500}});
 let calls=0,fail=false;
 const wav=Buffer.alloc(48);wav.write('RIFF');wav.write('WAVE',8);
 return {...f,get calls(){return calls;},set fail(v){fail=v;},read:input=>reading.prepareReading({prisma,userId:f.userId,directory:path.join(dir,'audio'),input:{companion:'lumen',feature:'reader',voiceId:reading.lumenVoices[0].id,text:'Hello from your reader.',confirmed:true,priceVersion:'reader-2026-10-26-v1',maxCost:25,...input},synthesize:async()=>{calls++;if(fail)throw Error('synthetic upstream failure');return {audio:wav};}})};
}
test('reading receipts replay privately without another provider call or debit',async()=>{
 const a=await readerFixture();const first=await a.read({});assert.equal(first.cost,25);assert.equal(a.calls,1);
 assert.equal((await a.read({confirmed:false})).cost,0);assert.equal(a.calls,1);
 const b=await readerFixture();assert.equal((await b.read({})).cost,25);assert.equal(b.calls,1);
 assert.notEqual(first.fingerprint,(await b.read({})).fingerprint);
});
test('reading rejects unowned companions, stale consent, low balances and provider failure without debit',async()=>{
 const a=await readerFixture();await assert.rejects(a.read({confirmed:false}),e=>e.status===409);assert.equal(a.calls,0);
 await assert.rejects(a.read({priceVersion:'old'}),e=>e.status===409);assert.equal(a.calls,0);
 a.fail=true;await assert.rejects(a.read({}));assert.equal(a.calls,1);
 assert.equal((await prisma.risePointsBalance.findUnique({where:{userId:a.userId}})).balance,500);
 await prisma.cosmeticOwnership.deleteMany({where:{userId:a.userId}});await assert.rejects(a.read({}),e=>e.status===403);
});
test('automatic spending caps apply to successful debits and cached replay remains free',async()=>{
 const a=await readerFixture();const data=defaults();data.automaticRP={...data.automaticRP,enabled:true,features:['reader'],dailyCap:25,monthlyCap:25};
 await a.change({operation:'preferences',revision:0,data,confirmSpending:true});
 assert.equal((await a.read({automatic:true,confirmed:false})).cost,25);
 assert.equal((await a.read({automatic:true,confirmed:false})).cost,0);
 await assert.rejects(a.read({automatic:true,text:'A new passage.'}),e=>e.status===409);assert.equal(a.calls,1);
});
test('provider reservations survive failures and user limits do not affect another user',async()=>{
 const a=await readerFixture(),b=await readerFixture();process.env.COMPANION_USER_DAILY_CHARACTERS='30';
 try{a.fail=true;await assert.rejects(a.read({}));await assert.rejects(a.read({text:'Another long passage.'}),e=>e.status===429);assert.equal(a.calls,1);assert.equal((await b.read({})).cost,25);}
 finally{delete process.env.COMPANION_USER_DAILY_CHARACTERS;}
});
const ordinaryVoice=require('../backend/src/services/companionVoice');
const ordinaryVoiceId=require('../backend/src/services/alarmVoices').voices[0].id;
const {pcmToWav}=require('../backend/src/services/alarmSpeechTransport');
test('ordinary companion voice preserves Async allowance, pricing and no-charge replay with one connection',async()=>{
 const a=await readerFixture();const message=await prisma.coachChatMessage.create({data:{userId:a.userId,role:'assistant',content:'One small step.'}});
 let calls=0;const synthesize=async()=>{calls++;return pcmToWav(Buffer.alloc(9600));};
 const input={voiceId:ordinaryVoiceId,messageId:message.id,maxCost:60,allowPoints:true,acceptedRate:10};
 const args={prisma,userId:a.userId,directory:path.join(dir,'ordinary'),apiKey:'fixture',synthesize};
 const first=await ordinaryVoice.prepare({...args,input});assert.equal(first.cost,10);
 const replay=await ordinaryVoice.prepare({...args,input:{...input,allowPoints:false,maxCost:0}});assert.equal(replay.cost,0);assert.equal(calls,1);
 await prisma.user.update({where:{id:a.userId},data:{premiumTrialStartedAt:new Date()}});
 const next=await prisma.coachChatMessage.create({data:{userId:a.userId,role:'assistant',content:'Take a gentle pause.'}});
 assert.equal((await ordinaryVoice.prepare({...args,input:{...input,messageId:next.id,maxCost:0,allowPoints:false}})).cost,0);
 assert.equal((await ordinaryVoice.status(prisma,a.userId)).remaining,9);
});
test('ordinary voice automatic consent is rechecked and provider failures leave no RP debit',async()=>{
 const a=await readerFixture(),message=await prisma.coachChatMessage.create({data:{userId:a.userId,role:'assistant',content:'An automatic reply.'}});
 const data=defaults();data.automaticRP={...data.automaticRP,enabled:true,features:['conversation'],dailyCap:10,monthlyCap:10};
 await a.change({operation:'preferences',revision:0,data,confirmSpending:true});
 const input={voiceId:ordinaryVoiceId,messageId:message.id,maxCost:60,automatic:true,priceVersion:data.automaticRP.priceVersion};
 const args={prisma,userId:a.userId,directory:path.join(dir,'ordinary'),apiKey:'fixture',input};
 await assert.rejects(ordinaryVoice.prepare({...args,synthesize:async()=>{throw Error('synthetic failure');}}));
 assert.equal((await prisma.risePointsBalance.findUnique({where:{userId:a.userId}})).balance,500);
 await a.change({operation:'preferences',revision:1,data:{...data,automaticRP:{...data.automaticRP,enabled:false}}});
 await assert.rejects(ordinaryVoice.prepare({...args,synthesize:async()=>pcmToWav(Buffer.alloc(9600))}),e=>e.status===409);
});
