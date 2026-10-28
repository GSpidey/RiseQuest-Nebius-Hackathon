const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const {eligibility, ownerFolder} = require('./alarmSpeech');
const {ownedAvatars} = require('../companions');
const {getPreferences} = require('../companionSupport');
const {PRICE_VERSION, fail, text} = require('../companionPlanning');
const {synthesizeAlarmSpeech} = require('./alarmSpeechTransport');
const {voices:asyncVoices} = require('./alarmVoices');
const lumenVoices = [
  {id:'EXAVITQu4vr4xnSDxMaL', name:'Sarah'},
  {id:'JBFqnCBsd6RMkjVDRZzb', name:'George'},
  {id:'SAz9YHcvj6GT2YYXdXww', name:'River'},
];
const REASON = 'Companion reading voice';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const {reserveProvider}=require('../providerUsage');
async function synthesizeEleven({text,voiceId,apiKey,request=fetch}) {
  if(!lumenVoices.some(v=>v.id===voiceId)||!apiKey)throw fail('This voice is temporarily unavailable.',503);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);let reader;
  try {
    const response=await request(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,{
      method:'POST',redirect:'error',signal:controller.signal,headers:{'xi-api-key':apiKey,'Content-Type':'application/json'},
      body:JSON.stringify({text,model_id:'eleven_multilingual_v2'}),
    });
    if(!response.ok||!response.body||/json|text\//i.test(response.headers.get('content-type')||''))throw fail('This voice could not be prepared. Please try again.',503);
    reader=response.body.getReader();const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>14400000)throw fail('Choose a shorter passage.');chunks.push(Buffer.from(value));}
    const raw=Buffer.concat(chunks);if(raw.length<2||raw.length%2)throw fail('This voice could not be prepared.',503);
    const audio=Buffer.alloc(raw.length+44);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);
    audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(24000,24);audio.writeUInt32LE(48000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(raw.length,40);raw.copy(audio,44);
    return {audio};
  } finally {clearTimeout(timeout);await reader?.cancel().catch(()=>{});controller.abort();}
}
async function readingStatus(prisma,userId,companion) {
  if(!require('../companions').AVATARS.some(a=>a.id===companion))throw fail('Choose an available companion.');
  const {data:preferences}=await getPreferences(prisma,userId);
  const lumen=companion==='lumen',owned=!lumen||(await ownedAvatars(prisma,userId)).includes('lumen');
  return {reader:lumen,automaticRP:preferences.automaticRP,eligible:await eligibility(prisma,userId),owned,available:!!process.env[lumen?'ELEVENLABS_API_KEY':'ASYNC_API_KEY'],
    voices:lumen?lumenVoices:asyncVoices,rate:lumen?25:10,unitCharacters:lumen?500:250,maxCharacters:3000,priceVersion:PRICE_VERSION};
}
async function sourceText(db,userId,input) {
  if(input.feature==='notes'){
    const note=await db.companionNote.findFirst({where:{userId,id:String(input.noteId)}});
    if(!note)throw fail('That note could not be found.',404);
    if(note.revision!==input.revision)throw fail('The note changed. Refresh before reading it.',409);
    const offset=Number.isSafeInteger(input.offset)&&input.offset>=0?input.offset:0;
    return text(note.body.slice(offset,offset+3000),3000,'passage');
  }
  if(input.feature==='conversation'){
    const message=await db.coachChatMessage.findFirst({where:{userId,id:String(input.messageId),role:'assistant'}});
    if(!message)throw fail('That reply could not be found.',404);
    return text(message.content.replace(/<[^>]*>/g,''),3000,'reply');
  }
  if(input.feature!=='reader')throw fail('Choose a reading feature.');
  if(input.companion!=='lumen')throw fail('Choose Lumen for screen and document reading.',403);
  return text(input.text,3000,'passage');
}
async function spending(tx,userId,input,cost,now=new Date()) {
  if(!Number.isSafeInteger(input.maxCost)||cost>input.maxCost||input.maxCost>150)throw fail('Review the passage price.',409);
  const {data:p}=await getPreferences(tx,userId),a=p.automaticRP;
  if(input.automatic===true){
    if(!a.enabled||!a.features.includes(input.feature)||a.priceVersion!==PRICE_VERSION||input.priceVersion!==PRICE_VERSION)throw fail('Review your automatic RP choices.',409);
    const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)),day=new Date(now);day.setUTCHours(0,0,0,0);
    const rows=await tx.risePointsTransaction.findMany({where:{userId,createdAt:{gte:month},delta:{lt:0}},select:{delta:true,createdAt:true,metadata:true}});
    const auto=rows.filter(r=>r.metadata?.automatic===true);
    if(auto.reduce((n,r)=>n-r.delta,0)+cost>a.monthlyCap||auto.filter(r=>r.createdAt>=day).reduce((n,r)=>n-r.delta,0)+cost>a.dailyCap)throw fail('Your automatic RP limit has been reached.',409);
  }else if(input.confirmed!==true||input.priceVersion!==PRICE_VERSION)throw fail('Confirm this passage’s price.',409);
  return a;
}
async function prepareReading({prisma,userId,input,directory,synthesize}) {
  const state=await readingStatus(prisma,userId,input.companion);
  if(!state.eligible)throw fail('Device voice is available for this profile.',403);
  if(!state.owned)throw fail('Choose an unlocked companion.',403);
  if(!state.voices.some(v=>v.id===input.voiceId))throw fail('Choose an available voice.');
  const content=await sourceText(prisma,userId,input),lumen=input.companion==='lumen';
  const owner=await prisma.user.findUnique({where:{id:userId},select:{createdAt:true}});
  const fingerprint=digest([userId,owner.createdAt,lumen?'eleven_multilingual_v2':'async_flash_v1.5',input.voiceId,content]);
  const file=path.join(directory,ownerFolder(userId),'reading',fingerprint+'.wav'),id='reading_'+fingerprint;
  let audio=await fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  const cost=Math.ceil(content.length/state.unitCharacters)*state.rate;
  if(!audio){
    if(!state.available&&!synthesize)throw fail('This voice is temporarily unavailable. Device voice is available.',503);
    // Preflight consent before reserving provider capacity.
    await spending(prisma,userId,input,cost);
  }
  let reservation,called=false;
  if(!audio)reservation=await reserveProvider(prisma,userId,lumen?'elevenlabs':'async',content.length);
  try{
    return await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      if(!await eligibility(tx,userId)||lumen&&!(await ownedAvatars(tx,userId)).includes('lumen'))throw fail('This reading is unavailable for the current account.',403);
      if(await sourceText(tx,userId,input)!==content)throw fail('The passage changed. Review it again.',409);
      const prior=await tx.risePointsTransaction.findUnique({where:{id}});
      audio=await fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      const balance=(await tx.risePointsBalance.findUnique({where:{userId}}))?.balance||0;
      if(prior){if(!audio)throw fail('Saved audio is temporarily unavailable.',503);return {audioBase64:audio.toString('base64'),fingerprint,cost:0,balance,replayed:true};}
      await spending(tx,userId,input,cost);
      if(balance<cost)throw fail('You need more RisePoints for this passage. Device voice is available.',409);
      if(!audio){
        called=true;
        const result=await (synthesize||(lumen?synthesizeEleven:synthesizeAlarmSpeech))({text:content,voiceId:input.voiceId,
          allowedVoiceIds:state.voices.map(v=>v.id),apiKey:process.env[lumen?'ELEVENLABS_API_KEY':'ASYNC_API_KEY'],maxCharacters:3000,maxSeconds:300,timeoutMs:45000});
        audio=result.audio;if(!Buffer.isBuffer(audio)||audio.length<46||audio.length>14400044||audio.toString('ascii',0,4)!=='RIFF')throw fail('This voice could not be prepared.',503);
        await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+crypto.randomUUID();
        try{await fs.writeFile(temp,audio,{mode:0o600});await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
      }
      // The same wallet lock serializes preference changes, so this consent remains
      // authoritative until the receipt and debit commit together.
      if(!await eligibility(tx,userId)){await fs.unlink(file).catch(()=>{});throw fail('This account is unavailable.',403);}
      const debit=await tx.risePointsBalance.updateMany({where:{userId,balance:{gte:cost}},data:{balance:{decrement:cost}}});
      if(debit.count!==1)throw fail('Your RisePoints balance changed. Review this passage again.',409);
      await tx.risePointsTransaction.create({data:{id,userId,delta:-cost,reason:REASON,metadata:{automatic:input.automatic===true,feature:input.feature,priceVersion:PRICE_VERSION,voiceId:input.voiceId,characters:content.length}}});
      return {audioBase64:audio.toString('base64'),fingerprint,cost,balance:balance-cost};
    },{timeout:60000,maxWait:5000});
  } finally {if(reservation&&!called)await prisma.providerUsage.delete({where:{id:reservation.id}}).catch(()=>{});}
}
function registerReaderVoice(app,{prisma,requireAuth,uploadsDir}) {
  const route=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){if(!e.status)console.error('reading_voice',{code:e.code||e.name});res.status(e.status||503).json({error:e.status?e.message:'Reading could not start. Please try again.'});}};
  app.get('/api/companion/reading',requireAuth,route(req=>readingStatus(prisma,req.auth.userId,req.query.companion)));
  app.post('/api/companion/reading',requireAuth,route(req=>prepareReading({prisma,userId:req.auth.userId,input:req.body||{},directory:path.join(uploadsDir,'tts','alarm')})));
}
module.exports={readingStatus,prepareReading,sourceText,spending,reserveProvider,synthesizeEleven,lumenVoices,registerReaderVoice};
