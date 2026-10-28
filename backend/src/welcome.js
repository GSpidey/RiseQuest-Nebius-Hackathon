const crypto = require('crypto');
const { walletTransaction } = require('./security');
const WELCOME_POINTS = 75;
const rewardId = userId => 'welcome_v1_' + crypto.createHash('sha256').update(userId).digest('hex');
function eligible(user, profile, start = process.env.WELCOME_BONUS_START) {
  const cutoff = Date.parse(start || '');
  return Boolean(user && !user.disabledAt && profile?.completedAt && Number.isFinite(cutoff) &&
    user.createdAt.getTime() >= cutoff);
}
// Caller holds the user's wallet lock. The ledger id survives retries and device changes.
async function grantWelcome(tx, userId, start = process.env.WELCOME_BONUS_START) {
  const id = rewardId(userId);
  const prior = await tx.risePointsTransaction.findUnique({where:{id}});
  if (prior) return prior;
  const [user,profile] = await Promise.all([
    tx.user.findUnique({where:{id:userId}}), tx.userProfile.findUnique({where:{userId}}),
  ]);
  if (!eligible(user,profile,start)) return null;
  const reward = await tx.risePointsTransaction.create({data:{id,userId,delta:WELCOME_POINTS,
    reason:'Welcome to RiseQuest',metadata:{campaign:'welcome-v1',rolloutStart:start}}});
  await tx.risePointsBalance.upsert({where:{userId},create:{userId,balance:WELCOME_POINTS},update:{balance:{increment:WELCOME_POINTS}}});
  return reward;
}
function registerWelcome(app,{prisma,requireAuth,entitlements}) {
  const wrap = fn => async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){
    if(!e.status)console.error('[Welcome]',e.code||e.name);
    res.status(e.status||503).json({error:e.status?e.message:'Your welcome could not finish. Please try again.'});
  }};
  const status = async(tx,userId)=>{
    const [reward,profile,user] = await Promise.all([grantWelcome(tx,userId),tx.userProfile.findUnique({where:{userId}}),tx.user.findUnique({where:{id:userId}})]);
    const child = user?.authProvider==='child'||Boolean(await tx.childAccount.findUnique({where:{childId:userId}}));
    const subscription = child ? null : await entitlements(tx,userId);
    return {pending:Boolean(reward&&!reward.metadata?.acknowledgedAt),bonus:reward?.delta||0,
      canStartTrial:Boolean(profile?.completedAt&&!child&&!user.premiumTrialStartedAt&&subscription?.tier==='free'),
      profileComplete:Boolean(profile?.completedAt)};
  };
  app.post('/api/welcome/status',requireAuth,wrap(req=>walletTransaction(prisma,req.auth.userId,tx=>status(tx,req.auth.userId))));
  app.post('/api/welcome/complete',requireAuth,wrap(req=>walletTransaction(prisma,req.auth.userId,async tx=>{
    if(typeof req.body?.startTrial!=='boolean')throw Object.assign(new Error('Choose whether to start your free trial.'),{status:400});
    const userId=req.auth.userId,current=await status(tx,userId);
    if(!current.profileComplete)throw Object.assign(new Error('Complete your profile first.'),{status:409});
    const id=rewardId(userId),reward=await tx.risePointsTransaction.findUnique({where:{id}});
    // A repeated completion cannot turn a prior "continue free" decision into an unrequested trial.
    if(reward?.metadata?.acknowledgedAt)return {...current,pending:false,trialStarted:reward.metadata.trialStarted===true};
    let trialStarted=false;
    if(req.body.startTrial){
      if(!current.canStartTrial)throw Object.assign(new Error('Your plan changed. Continue without a new trial, or check your subscription in Settings.'),{status:409});
      const updated=await tx.user.updateMany({where:{id:userId,premiumTrialStartedAt:null},data:{premiumTrialStartedAt:new Date()}});
      trialStarted=updated.count===1;
    }
    if(reward)await tx.risePointsTransaction.update({where:{id},data:{metadata:{...reward.metadata,acknowledgedAt:new Date().toISOString(),trialStarted}}});
    const wallet=await tx.risePointsBalance.findUnique({where:{userId}});
    return {pending:false,bonus:current.bonus,trialStarted,balance:wallet?.balance||0};
  })));
}
module.exports={WELCOME_POINTS,rewardId,eligible,grantWelcome,registerWelcome};
