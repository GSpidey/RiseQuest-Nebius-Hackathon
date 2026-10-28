const crypto=require('crypto');
const {levelProgress}=require('./leveling');
const {walletTransaction}=require('./security');
const key=(user,source,ref)=>'xp_'+crypto.createHash('sha256').update(JSON.stringify([user,source,ref])).digest('hex');
async function grants(tx,userId,source,entries) {
 if(entries.length)await tx.xpGrant.createMany({data:entries.map(([ref,amount])=>({id:key(userId,source,ref),userId,source,amount})),skipDuplicates:true});
}
function loginStreak(days,now=new Date()) {
 const set=new Set(days),today=now.toISOString().slice(0,10);let day=Date.parse(today+'T00:00:00Z');
 if(!set.has(today))day-=86400000;
 let streak=0;while(set.has(new Date(day).toISOString().slice(0,10))){streak++;day-=86400000;}return streak;
}
async function progression(tx,userId) {
 const [sum,logins]=await Promise.all([tx.xpGrant.aggregate({where:{userId},_sum:{amount:true}}),tx.xpGrant.findMany({where:{userId,source:'login'},select:{createdAt:true}})]);
 return {...levelProgress(sum._sum.amount||0),loginStreak:loginStreak(logins.map(x=>x.createdAt.toISOString().slice(0,10)))};
}
function registerProgression(app,{prisma,requireAuth}) {
 app.post('/api/progression/check-in',requireAuth,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{res.json(await walletTransaction(prisma,req.auth.userId,async tx=>{
   const userId=req.auth.userId;
   await require('./cosmetics').awardAchievements(tx,userId);
   // Preserve an old installation's saved XP once. This never grants money,
   // purchases or badges and is restricted to accounts predating this rollout.
   const legacy=req.body?.legacyXp;
   if(Number.isInteger(legacy)&&legacy>=0&&legacy<=1000000){
    const user=await tx.user.findUnique({where:{id:userId}});
    const cutoff=Date.parse(process.env.XP_ROLLOUT_START||'');
    if(Number.isFinite(cutoff)&&user.createdAt.getTime()<cutoff){
     const id=key(userId,'legacy','v1');
     if(!await tx.xpGrant.findUnique({where:{id}})){
      const base=await tx.xpGrant.aggregate({where:{userId,source:'activity'},_sum:{amount:true}});
      await tx.xpGrant.create({data:{id,userId,source:'legacy',amount:Math.max(0,legacy-(base._sum.amount||0))}});
     }
    }
   }
   await grants(tx,userId,'login',[[new Date().toISOString().slice(0,10),5]]);
   return {progression:await progression(tx,userId)};
  }));}catch(e){console.error('[Progression]',e.code||e.name);res.status(503).json({error:'Your progress could not refresh. Please try again.'});}
 });
}
module.exports={key,grants,progression,loginStreak,registerProgression};
