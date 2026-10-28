const AVATARS = [
  {id:'lumen',name:'Lumen',access:'purchase',price:1800,color:'#D39440',reader:true,description:'A lantern-bearing fox who reads alongside you'},
  {id:'sol',name:'Sol',access:'free',color:'#F4A544',description:'A warm, encouraging guide'},
  {id:'fern',name:'Fern',access:'free',color:'#44AD94',description:'Calm company for one small step'},
  {id:'luna',name:'Luna',access:'subscription',color:'#9582DD',description:'A gentle night-sky companion'},
  {id:'nova',name:'Nova',access:'subscription',color:'#48A5DE',description:'A curious explorer'},
  {id:'orbit',name:'Orbit',access:'purchase',price:650,color:'#D48CC9',description:'Your friendly space traveller'},
  {id:'ember',name:'Ember',access:'purchase',price:850,color:'#E87658',description:'A bright spark for your day'},
];
async function ownedAvatars(prisma,userId) {
  const rows=await prisma.risePointsTransaction.findMany({where:{userId,delta:{lt:0},reason:{startsWith:'Cosmetics: '}}});
  const inventory = await prisma.cosmeticOwnership.findMany({where:{userId,itemId:{startsWith:'avatar_'}}});
  const ids=new Set([...rows.flatMap(row=>row.reason.slice(11).split(',')),...inventory.map(row=>row.itemId)]);
  return AVATARS.filter(a=>ids.has(`avatar_${a.id}`)).map(a=>a.id);
}
function registerCompanions(app,{prisma,requireAuth}) {
 app.get('/api/companions',requireAuth,async(req,res)=>{
  try {
   const {entitlements}=require('./storeBilling');
   let payer=req.auth.userId;
   if(req.auth.provider==='child'){const child=await prisma.childAccount.findUnique({where:{childId:req.auth.userId}});if(child)payer=child.parentId;}
   const [entitlement,owned]=await Promise.all([entitlements(prisma,payer),ownedAvatars(prisma,req.auth.userId)]);
   res.json({avatars:AVATARS.map(a=>({...a,unlocked:a.access==='free'||owned.includes(a.id)||(a.access==='subscription'&&entitlement.tier!=='free')}))});
  }catch(_){res.status(503).json({error:'Companions could not refresh. Your free companions are available.'});}
 });
}
module.exports={AVATARS,ownedAvatars,registerCompanions};
