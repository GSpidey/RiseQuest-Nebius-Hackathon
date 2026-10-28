const crypto=require('crypto');
const {fail}=require('./companionPlanning');
const limit = (name, fallback) => /^\d+$/.test(process.env[name] || '') ? Number(process.env[name]) : fallback;
async function reserveProvider(prisma,userId,provider,amount) {
  // Reserve before the network call and outside the wallet transaction. Failed upstream
  // requests may still incur cost, so their reservation remains in the daily total.
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'provider:'+provider}))`;
    const since=new Date();since.setUTCHours(0,0,0,0);
    const rows=await tx.providerUsage.findMany({where:{provider,createdAt:{gte:since}},select:{userId:true,amount:true}});
    const total=rows.reduce((n,r)=>n+r.amount,0),own=rows.filter(r=>r.userId===userId).reduce((n,r)=>n+r.amount,0);
    const chat=provider==='chat',eleven=provider==='elevenlabs';
    if(total+amount>limit(chat?'COMPANION_GLOBAL_DAILY_TURNS':'COMPANION_PROVIDER_DAILY_CHARACTERS',chat?5000:eleven?1000000:2000000)||own+amount>limit(chat?'COMPANION_USER_DAILY_TURNS':'COMPANION_USER_DAILY_CHARACTERS',chat?240:eleven?15000:30000))throw fail('Realistic voice has reached today’s limit. Device voice is available.',429);
    return tx.providerUsage.create({data:{id:crypto.randomUUID(),userId,provider,amount}});
  });
}
module.exports={reserveProvider};
