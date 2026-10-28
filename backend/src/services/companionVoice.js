const crypto=require('crypto'),fs=require('fs/promises'),path=require('path');
const {voices}=require('./alarmVoices');
const {synthesizeAlarmSpeech}=require('./alarmSpeechTransport');
const {ownerFolder,eligibility}=require('./alarmSpeech');
const {reserveProvider}=require('../providerUsage');
const {getPreferences}=require('../companionSupport');
const {PRICE_VERSION}=require('../companionPlanning');
const {storeEntitlement,trialEntitlement,complimentaryEntitlement}=require('../storeCatalog');
const REASON='Companion realistic voice',UNIT=250,MODEL='async_flash_v1.5';
const fail=(status,message,code)=>Object.assign(Error(message),{status,code});
async function voiceEntitlement(prisma,userId,now=Date.now()){
 const [purchases,subscriptions,user]=await Promise.all([
  prisma.storePurchase.findMany({where:{userId,kind:'subscription'}}),
  prisma.subscription.findMany({where:{userId}}),prisma.user.findUnique({where:{id:userId}}),
 ]);
 const complimentary=complimentaryEntitlement(user);if(complimentary)return complimentary;
 const store=storeEntitlement(purchases,now);
 // Paid speech has a bounded allowance; the more generous ad-free grace policy
 // must not turn paused or expired Stripe subscriptions into unlimited access.
 const active=subscriptions.filter(s=>s.status==='active'&&new Date(s.currentPeriodEnd).getTime()>now);
 const familyPrices=[process.env.STRIPE_PRICE_FAMILY_MONTHLY,process.env.STRIPE_PRICE_FAMILY_YEARLY].filter(Boolean);
 if(store.tier==='family'||active.some(s=>familyPrices.includes(s.priceId)))return {tier:'family'};
 if(store.tier==='premium'||active.length)return {tier:'premium'};
 return {tier:'free',...trialEntitlement(user,now)};
}
function policy(entitlement,now=new Date()){
 const paid=['premium','family'].includes(entitlement.tier),trial=entitlement.tier==='trial';
 const period=trial?`trial:${new Date(entitlement.startDate).toISOString()}`:now.toISOString().slice(0,7);
 return {period,limit:paid?(entitlement.tier==='family'?200:100):trial?10:0,rate:paid?5:10,subscriber:paid,
  renewsAt:trial?entitlement.endDate:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString()};
}
function quote(characters,used,p){const units=Math.ceil(characters/UNIT),included=Math.min(units,Math.max(0,p.limit-used));return {units,included,cost:(units-included)*p.rate};}
async function status(prisma,userId){
 if(!await eligibility(prisma,userId))return {eligible:false,voices:[],unitCharacters:UNIT};
 const p=policy(await voiceEntitlement(prisma,userId));
 const rows=await prisma.risePointsTransaction.findMany({where:{userId,reason:REASON,metadata:{path:['period'],equals:p.period}},select:{metadata:true}});
 const used=rows.reduce((n,r)=>n+Math.max(0,Number(r.metadata?.included)||0),0);
 const {data:preferences}=await getPreferences(prisma,userId);
 return {...p,automaticRP:preferences.automaticRP,priceVersion:PRICE_VERSION,used,remaining:Math.max(0,p.limit-used),eligible:true,available:!!process.env.ASYNC_API_KEY,voices,unitCharacters:UNIT};
}
async function prepare({prisma,userId,input,directory,apiKey=process.env.ASYNC_API_KEY,synthesize=synthesizeAlarmSpeech}){
 if(!voices.some(v=>v.id===input.voiceId)||typeof input.messageId!=='string'||input.messageId.length>200)throw fail(400,'Choose a reply and an available voice.');
 if(!Number.isInteger(input.maxCost)||input.maxCost<0||input.maxCost>60)throw fail(400,'Review the voice price.');
 if(!await eligibility(prisma,userId))throw fail(403,'Use the device voice for this profile.');
 const source=await prisma.coachChatMessage.findFirst({where:{id:input.messageId,userId,role:'assistant'}});
 if(!source)throw fail(404,'This reply is no longer available.');
 const sourceText=String(source.content).replace(/<[^>]*>/g,'').trim();
 if(!sourceText||sourceText.length>1500)throw fail(400,'Choose a shorter reply.');
 const account=await prisma.user.findUnique({where:{id:userId},select:{createdAt:true}});
 const sourceHash=crypto.createHash('sha256').update(JSON.stringify([userId,account.createdAt,MODEL,input.voiceId,sourceText])).digest('hex');
 const cached=await fs.readFile(path.join(directory,ownerFolder(userId),'companion',sourceHash+'.wav')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 let reservation,called=false;
 if(!cached){
  const current=await status(prisma,userId),price=quote(sourceText.length,current.used,current);
  if(price.cost&&input.automatic===true)await require('./readerVoice').spending(prisma,userId,{...input,feature:'conversation'},price.cost);
  else if(price.cost&&(input.allowPoints!==true||input.acceptedRate!==current.rate))throw fail(409,'Review Voice & spending before preparing this reply.',input.allowPoints!==true?'VOICE_OPT_IN':'VOICE_PRICE');
  if(price.cost>input.maxCost)throw fail(409,'Your session’s RP limit has been reached.','VOICE_BUDGET');
  if(!apiKey)throw fail(503,'Realistic voice is temporarily unavailable.');
  reservation=await reserveProvider(prisma,userId,'async',sourceText.length);
 }
 try{return await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  if(!await eligibility(tx,userId))throw fail(403,'Use the device voice for this profile.');
  const message=await tx.coachChatMessage.findFirst({where:{id:input.messageId,userId,role:'assistant'}});
  if(!message)throw fail(404,'This reply is no longer available.');
  // Only a server-stored, safety-checked assistant reply may be synthesized.
  const text=String(message.content).replace(/<[^>]*>/g,'').trim();
  if(!text||text.length>1500)throw fail(400,'Choose a shorter reply.');
  const owner=await tx.user.findUnique({where:{id:userId},select:{createdAt:true}});
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([userId,owner.createdAt,MODEL,input.voiceId,text])).digest('hex');
  const id='companion_voice_'+fingerprint,folder=path.join(directory,ownerFolder(userId),'companion'),file=path.join(folder,fingerprint+'.wav');
  const prior=await tx.risePointsTransaction.findUnique({where:{id}});
  let audio=await fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  const balance=(await tx.risePointsBalance.findUnique({where:{userId}}))?.balance||0;
  if(prior){if(!audio)throw fail(503,'Saved audio is temporarily unavailable. Try again shortly.');return {audioBase64:audio.toString('base64'),fingerprint,cost:0,replayed:true,balance,durationMs:prior.metadata.durationMs};}
  const p=policy(await voiceEntitlement(tx,userId));
  const rows=await tx.risePointsTransaction.findMany({where:{userId,reason:REASON,metadata:{path:['period'],equals:p.period}},select:{metadata:true}});
  const used=rows.reduce((n,r)=>n+Math.max(0,Number(r.metadata?.included)||0),0),q=quote(text.length,used,p);
  if(q.cost&&input.automatic===true)await require('./readerVoice').spending(tx,userId,{...input,feature:'conversation'},q.cost);
  if(q.cost&&input.automatic!==true&&input.allowPoints!==true)throw fail(409,'Turn on RisePoints for more realistic replies, or continue with device voice.','VOICE_OPT_IN');
  if(q.cost&&input.automatic!==true&&input.acceptedRate!==p.rate)throw fail(409,'Voice prices changed. Review Voice & spending to enable paid extras again.','VOICE_PRICE');
  if(q.cost>input.maxCost)throw fail(409,'Your session’s RP limit has been reached. Continuing with device voice.','VOICE_BUDGET');
  if(balance<q.cost)throw fail(409,'Your RisePoints are low. The reply is still available with the device voice.','VOICE_BALANCE');
  if(!audio){
   if(!apiKey)throw fail(503,'Realistic voice is temporarily unavailable.');
   called=true;const result=await synthesize({text,voiceId:input.voiceId,allowedVoiceIds:voices.map(v=>v.id),apiKey,maxCharacters:1500,maxSeconds:150,timeoutMs:45000});
   audio=result.audio;
   if(!Buffer.isBuffer(audio)||audio.length<46||audio.length>7200044)throw fail(503,'Could not prepare this reply.');
   await fs.mkdir(folder,{recursive:true,mode:0o700});const temp=file+'.'+crypto.randomUUID()+'.tmp';
   try{await fs.writeFile(temp,audio,{mode:0o600});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
  }
  // Recheck access after generation and commit receipt plus debit together. Orphaned files
  // after a failed commit are reused without a second provider request.
  if(!await eligibility(tx,userId)){await fs.unlink(file).catch(()=>{});throw fail(403,'This account is unavailable.');}
  if(q.cost){const debit=await tx.risePointsBalance.updateMany({where:{userId,balance:{gte:q.cost}},data:{balance:{decrement:q.cost}}});if(debit.count!==1)throw fail(409,'Your RisePoints are low. Use the device voice.','VOICE_BALANCE');}
  const durationMs=Math.ceil((audio.length-44)/48000*1000);
  await tx.risePointsTransaction.create({data:{id,userId,delta:-q.cost,reason:REASON,metadata:{automatic:input.automatic===true,priceVersion:PRICE_VERSION,feature:'conversation',period:p.period,included:q.included,units:q.units,rate:p.rate,durationMs,voiceId:input.voiceId,provider:'async',model:MODEL}}});
  return {audioBase64:audio.toString('base64'),fingerprint,cost:q.cost,balance:balance-q.cost,durationMs,remaining:Math.max(0,p.limit-used-q.included)};
 },{timeout:60000,maxWait:5000});}finally{if(reservation&&!called)await prisma.providerUsage.delete({where:{id:reservation.id}}).catch(()=>{});}
}
function registerCompanionVoice(app,{prisma,requireAuth,uploadsDir}){
 app.get('/api/assistant/voice',requireAuth,async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await status(prisma,req.auth.userId));}catch(_){res.status(503).json({error:'Voice settings could not refresh.'});}});
 app.post('/api/assistant/voice',requireAuth,async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await prepare({prisma,userId:req.auth.userId,input:req.body||{},directory:path.join(uploadsDir,'tts','alarm')}));}catch(e){if(!e.status)console.error('companion_voice_failed',{code:e.code||'GENERATION_ERROR'});res.status(e.status||503).json({error:e.status?e.message:'Realistic voice could not load. Please try again.',...(e.code?{code:e.code}:{})});}});
}
module.exports={policy,quote,status,prepare,registerCompanionVoice,voiceEntitlement,UNIT,REASON};
