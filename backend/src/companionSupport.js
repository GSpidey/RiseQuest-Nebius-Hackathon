const crypto=require('crypto');
const {fail,integer,text,defaults,preferences,plan}=require('./companionPlanning');
const {awardReward}=require('./walletPolicy');
const {awardAchievements}=require('./cosmetics');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const lock=(db,userId,fn)=>db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;return fn(tx);},{timeout:15000,maxWait:5000});
function revision(row,expected){if(!Number.isSafeInteger(expected)||(row?.revision||0)!==expected)throw fail('This changed since you opened it. Refresh and review it again.',409);}
const date=value=>{if(value===null)return null;if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(Date.parse(value)))throw fail('Choose a valid date and time.');return new Date(value);};
async function getPreferences(db,userId){const row=await db.companionPreferences.findUnique({where:{userId}});return {data:preferences(row?.data||{}),revision:row?.revision||0};}
async function snapshot(db,userId){
  const [p,quests,mood,sleep,notes,history,balance]=await Promise.all([getPreferences(db,userId),
    db.quest.findMany({where:{userId,status:{not:'completed'}},include:{subtasks:{orderBy:{order:'asc'}}},orderBy:{createdAt:'asc'}}),
    db.moodEntry.findFirst({where:{userId},orderBy:{recordedAt:'desc'}}),db.sleepEntry.findFirst({where:{userId},orderBy:{wakeAt:'desc'}}),
    db.companionNote.findMany({where:{userId},orderBy:[{pinned:'desc'},{updatedAt:'desc'}],select:{id:true,title:true,pinned:true,questId:true,revision:true,updatedAt:true}}),
    db.moodEntry.findMany({where:{userId},orderBy:{recordedAt:'desc'},take:30}),db.risePointsBalance.findUnique({where:{userId}})]);
  return {preferences:p,plan:plan(quests,p.data,mood,sleep),quests,notes,history,balance:balance?.balance||0};
}
async function questFor(tx,userId,id){const q=await tx.quest.findFirst({where:{id,userId},include:{subtasks:{orderBy:{order:'asc'}}}});if(!q)throw fail('That quest could not be found.',404);return q;}
async function saveQuestProgress(tx,userId,questId,progressed=false){
  const steps=await tx.questSubtask.findMany({where:{questId},orderBy:{order:'asc'}}),done=steps.filter(s=>s.completed).length;
  const complete=steps.length>0&&done===steps.length;
  const old=await tx.quest.findUnique({where:{id:questId}});
  const result=await tx.quest.update({where:{id:questId},data:{totalSteps:steps.length,currentStep:done,progress:steps.length?Math.round(done/steps.length*100):0,
    estimatedTotalMinutes:steps.reduce((n,s)=>n+s.estimatedMinutes,0),status:complete?'completed':'active',completedAt:complete?(old.completedAt||new Date()):null,
    revision:{increment:1},...(progressed?{lastProgressAt:new Date()}:{})},include:{subtasks:{orderBy:{order:'asc'}}}});
  for(const step of steps.filter(s=>s.completed))await awardReward(tx,userId,'completing a quest step',{questId,subtaskId:step.id});
  if(complete)await awardReward(tx,userId,'completing a full quest',{questId});
  await awardAchievements(tx,userId);
  return result;
}
async function changeQuest(tx,userId,input){
  const q=await questFor(tx,userId,text(input.id,200,'quest'));
  if(input.revision!==undefined)revision(q,input.revision);
  if(input.operation==='quest_delete'){await awardAchievements(tx,userId);await tx.companionNote.updateMany({where:{userId,questId:q.id},data:{questId:null,revision:{increment:1}}});await tx.quest.delete({where:{id:q.id}});return {deleted:q.id};}
  if(input.operation==='quest_update'){
    const values=input.changes||{},data={revision:{increment:1}};
    if(Object.keys(values).some(k=>!['title','description','lane','priority','energyDemand','dueAt','plannedAt'].includes(k)))throw fail('Choose a supported quest change.');
    if('title'in values)data.title=text(values.title,120,'quest title');
    if('description'in values)data.description=text(values.description,1000,'description',true);
    if('lane'in values){if(!['now','today','later'].includes(values.lane))throw fail('Choose Now, Today or Later.');data.lane=values.lane;
      if(data.lane==='now')await tx.quest.updateMany({where:{userId,lane:'now',id:{not:q.id}},data:{lane:'today',revision:{increment:1}}});}
    for(const k of ['priority','energyDemand'])if(k in values)data[k]=integer(values[k],1,5,k);
    for(const k of ['dueAt','plannedAt'])if(k in values)data[k]=date(values[k]);
    return tx.quest.update({where:{id:q.id},data,include:{subtasks:{orderBy:{order:'asc'}}}});
  }
  // Reconcile earned XP before uncompleting or removing recorded work.
  await awardAchievements(tx,userId);
  if(input.operation==='quest_complete'&&!q.subtasks.length)throw fail('Add a step before completing this quest.');
  if(input.operation==='quest_complete')await tx.questSubtask.updateMany({where:{questId:q.id,completed:false},data:{completed:true,completedAt:new Date()}});
  else if(input.operation==='steps_reorder'){
    if(!Array.isArray(input.ids)||input.ids.length!==q.subtasks.length||new Set(input.ids).size!==q.subtasks.length||input.ids.some(id=>!q.subtasks.some(s=>s.id===id)))throw fail('Include each step once.');
    // Vacate into a range below every existing sort order before assigning final order.
    const floor=Math.min(0,...q.subtasks.map(s=>s.order))-q.subtasks.length-1;
    for(let i=0;i<input.ids.length;i++)await tx.questSubtask.update({where:{id:input.ids[i]},data:{order:floor-i}});
    for(let i=0;i<input.ids.length;i++)await tx.questSubtask.update({where:{id:input.ids[i]},data:{order:i+1}});
  }else if(input.operation==='step_add'){
    if(q.subtasks.length>=100)throw fail('Keep a quest to 100 steps.');
    await tx.questSubtask.create({data:{questId:q.id,title:text(input.title,120,'step title'),description:'',order:Math.max(0,...q.subtasks.map(s=>s.order))+1,
      estimatedMinutes:integer(input.estimatedMinutes,1,720,'step minutes'),difficulty:q.difficulty}});
  }else if(['step_update','step_delete','step_complete'].includes(input.operation)){
    const step=q.subtasks.find(s=>s.id===input.stepId);if(!step)throw fail('That step could not be found.',404);
    if(input.operation==='step_delete'){await awardAchievements(tx,userId);await tx.questSubtask.delete({where:{id:step.id}});}
    else if(input.operation==='step_complete'){
      if(typeof input.completed!=='boolean')throw fail('Choose whether the step is complete.');
      await tx.questSubtask.update({where:{id:step.id},data:{completed:input.completed,completedAt:input.completed?(step.completedAt||new Date()):null}});
    }else{const data={};if('title'in input)data.title=text(input.title,120,'step title');if('description'in input)data.description=text(input.description,1000,'step description',true);
      if('estimatedMinutes'in input)data.estimatedMinutes=integer(input.estimatedMinutes,1,720,'step minutes');await tx.questSubtask.update({where:{id:step.id},data});}
  }else throw fail('Choose a supported quest action.');
  return saveQuestProgress(tx,userId,q.id,input.operation==='quest_complete'||input.operation==='step_complete'&&input.completed);
}
async function mutate(db,userId,input){
  text(input.key,100,'request reference');if(!/^[\w-]{8,100}$/.test(input.key))throw fail('Use a valid request reference.');
  const id='care_'+hash([userId,input.key]),fingerprint=hash(input);
  return lock(db,userId,async tx=>{
    const previous=await tx.companionMutation.findUnique({where:{id}});
    if(previous){if(previous.fingerprint!==fingerprint)throw fail('This request reference was used for another change.',409);return previous.result;}
    let result;
    if(input.operation==='preferences'){
      const old=await getPreferences(tx,userId);revision(old,input.revision);
      const data=preferences(input.data,old.data);
      if(data.automaticRP.enabled&&JSON.stringify(data.automaticRP)!==JSON.stringify(old.data.automaticRP)&&input.confirmSpending!==true)throw fail('Confirm your RP spending choices.');
      result=await tx.companionPreferences.upsert({where:{userId},create:{userId,data},update:{data,revision:{increment:1}}});
    }else if(input.operation==='check_in'){
      result=await tx.moodEntry.create({data:{id,userId,valence:integer(input.valence,-2,2,'mood'),energy:integer(input.energy,1,7,'energy'),focus:integer(input.focus,1,7,'focus'),
        restless:input.restless===true,notes:text(input.notes||'',1000,'check-in notes',true)}});
    }else if(input.operation==='check_in_delete'){
      const deleted=await tx.moodEntry.deleteMany({where:{id:String(input.id),userId}});if(!deleted.count)throw fail('That check-in could not be found.',404);result={deleted:input.id};
    }else if(['note_save','note_delete'].includes(input.operation)){
      const noteId=text(input.id,200,'note reference'),old=await tx.companionNote.findUnique({where:{id:noteId}});
      if(old&&old.userId!==userId)throw fail('That note could not be found.',404);
      revision(old,input.revision);
      if(input.operation==='note_delete'){if(!old)throw fail('That note could not be found.',404);await tx.companionNote.delete({where:{id:noteId}});result={deleted:noteId};}
      else{
        if(!old&&await tx.companionNote.count({where:{userId}})>=200)throw fail('You have 200 notes. Edit an existing note or remove one to add another.');
        if(input.questId)await questFor(tx,userId,input.questId);
        const data={title:text(input.title,120,'note title'),body:text(input.body,30000,'note',true),pinned:input.pinned===true,questId:input.questId||null};
        result=await tx.companionNote.upsert({where:{id:noteId},create:{id:noteId,userId,...data},update:{...data,revision:{increment:1}}});
      }
    }else{
      if(!Number.isSafeInteger(input.revision))throw fail('Refresh this quest before changing it.',409);
      result=await changeQuest(tx,userId,input);
    }
    const stored=JSON.parse(JSON.stringify(result));
    await tx.companionMutation.create({data:{id,userId,fingerprint,result:stored}});return stored;
  });
}
function registerSupport(app,{prisma,requireAuth}){
  const route=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){if(!e.status)console.error('companion_support',{code:e.code||e.name});res.status(e.status||503).json({error:e.status?e.message:'Could not load your companion tools. Please try again.'});}};
  app.get('/api/companion/support',requireAuth,route(req=>snapshot(prisma,req.auth.userId)));
  app.get('/api/companion/notes/:id',requireAuth,route(async req=>{const note=await prisma.companionNote.findFirst({where:{id:req.params.id,userId:req.auth.userId}});if(!note)throw fail('That note could not be found.',404);return {note};}));
  app.post('/api/companion/change',requireAuth,route(req=>mutate(prisma,req.auth.userId,req.body||{})));
}
module.exports={lock,revision,getPreferences,snapshot,questFor,saveQuestProgress,changeQuest,mutate,registerSupport};
