// Keep the pre-server XP snapshot recoverable. Old versions did not attach an
// account owner to local stats, so those values cannot safely be granted to a
// newly signed-in account. Saved server activities are reconciled separately.
let pending=Promise.resolve();
export function saveProgress(storage,next){
 const work=pending.catch(()=>{}).then(async()=>{
  const previous=await storage.getItem('risequest_stats');
  if(previous && !await storage.getItem('risequest_stats_before_xp_v2')){
   let serverOwned=false;try{serverOwned=JSON.parse(previous)?.serverXp===true;}catch(_){}
   if(!serverOwned)await storage.setItem('risequest_stats_before_xp_v2',previous);
  }
  await storage.setItem('risequest_stats',JSON.stringify(next));
 });
 pending=work;return work;
}
