const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function isolated(file,dependencies){const box={module:{exports:{}},exports:{},require:id=>Object.hasOwn(dependencies,id)?dependencies[id]:require(id),process,fetch,AbortSignal,console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'),box,{filename:file});return box.module.exports;}
const context={loadCoachingContext:async()=>({externalAllowed:true,profile:{},context:{}}),SAFETY_PROMPT:'',safePersonality:(_,v)=>v};
const {validateTurn}=isolated('../backend/src/services/assistant.js',{'./coachingContext':context,'./textGeneration':{}});
test('assistant proposals accept only known, well-formed actions',()=>{
 for(const value of ['null','[]','{}','not json',JSON.stringify({reply:'OK',action:{type:'purchase',amount:1}}),JSON.stringify({reply:'OK',action:{type:'alarm',time:'25:99'}}),JSON.stringify({reply:'OK',action:{type:'navigate',screen:'admin'}})])assert.equal(validateTurn(value),null);
 assert.equal(validateTurn(JSON.stringify({reply:'Review this',action:{type:'alarm',time:'07:30',label:'Rise'}})).action.time,'07:30');
 assert.equal(validateTurn(JSON.stringify({reply:'Which day?',action:null})).action,null);
});
function wakeFixture(kind='generated'){
 let balance=100,calls=0,queue=Promise.resolve();const rows=new Map();
 const db={user:{findUnique:async()=>({disabledAt:null})},risePointsTransaction:{findUnique:async({where})=>rows.get(where.id),create:async({data})=>{assert(!rows.has(data.id));rows.set(data.id,data);}},risePointsBalance:{findUnique:async()=>({balance}),update:async({data})=>{balance-=data.balance.decrement;}}};
 const walletTransaction=(_,id,fn)=>{const result=queue.then(()=>fn(db));queue=result.catch(()=>{});return result;};
 const {generateWakeup}=isolated('../backend/src/services/wakeupMessage.js',{'../security':{walletTransaction},'./coachingContext':context,'./textGeneration':{generateText:async()=>{calls++;return {kind,value:'A small step is enough.',provider:'nebius'};}}});
 return {call:(key='same-reference',input={label:'Wake'})=>generateWakeup({prisma:db,userId:'owner',input,key}),get balance(){return balance},get calls(){return calls},rows};
}
test('concurrent successful wake-message retries debit once and replay the saved response',async()=>{const f=wakeFixture(),results=await Promise.all([f.call(),f.call(),f.call()]);assert.equal(f.balance,75);assert.equal(f.rows.size,1);assert(results.every(r=>r.cost===25&&r.balance===75));assert.equal(results.filter(r=>r.replayed).length,2);await assert.rejects(f.call('same-reference',{label:'Different'}),e=>e.status===409);});
test('provider failures return a free prepared message without a wallet debit',async()=>{const f=wakeFixture('unavailable');const result=await f.call();assert.equal(result.cost,0);assert.equal(result.provider,'curated');assert.equal(f.balance,100);assert.equal(f.rows.size,0);});
