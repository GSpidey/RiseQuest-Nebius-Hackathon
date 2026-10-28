const { ACHIEVEMENTS } = require('./cosmeticCatalog');
const { bestStreak } = require('./cosmetics');
const fail = () => Object.assign(new Error('This profile is not available.'), { status: 404 });
function mayViewProfile({ viewer, target, viewerSettings, targetSettings, blocked, buddy }) {
  if (!viewer || !target || viewer.disabledAt || target.disabledAt || blocked) return false;
  const vp = viewer.profile?.data || {}, tp = target.profile?.data || {};
  if ([viewer.authProvider,target.authProvider].includes('child') || vp.ageGroup === 'child' || tp.ageGroup === 'child') return false;
  if (!viewerSettings?.optIn || !targetSettings?.optIn) return false;
  if (buddy) return true;
  // Public discovery is adults-only. Teens and incomplete age profiles stay within accepted buddies.
  return vp.ageGroup === 'adult' && tp.ageGroup === 'adult' && !viewerSettings.teenSafety && !targetSettings.teenSafety && targetSettings.visibility === 'PUBLIC';
}
function publicCard(user, badgeIds, owned) {
  const displayed = new Set(badgeIds || []), earned = new Set(owned.map(row => row.itemId));
  return { displayName: user.name || 'RiseQuester', photoUrl: user.photoUrl || null,
    joined: user.createdAt.toISOString().slice(0,7),
    badges: ACHIEVEMENTS.filter(a => displayed.has(a.id) && earned.has(a.id)).slice(0,3).map(({id,name,description,symbol,palette}) => ({id,name,description,symbol,palette})) };
}
function registerProfileCards(app, { prisma, requireAuth }) {
  const wrap = fn => async (req,res) => { try { res.set('Cache-Control','no-store').json(await fn(req)); } catch(e) {
    if (!e.status) console.error('[ProfileCard]',e.code||e.name);
    res.status(e.status||503).json({ error: e.status ? e.message : 'Could not load this profile. Please try again.' });
  } };
  app.get('/api/me/profile-card', requireAuth, wrap(async req => {
    const userId = req.auth.userId;
    const [user, quests, events, sleeps] = await Promise.all([
      prisma.user.findUnique({where:{id:userId},select:{name:true,photoUrl:true,createdAt:true}}),
      prisma.quest.count({where:{userId,status:'completed'}}),
      prisma.alarmEvent.findMany({where:{userId,type:'dismiss'},select:{createdAt:true}}),
      prisma.sleepEntry.count({where:{userId}}),
    ]);
    const days = [...new Set(events.map(e=>e.createdAt.toISOString().slice(0,10)))];
    return { profile: { displayName:user.name||'RiseQuester',photoUrl:user.photoUrl,joined:user.createdAt.toISOString().slice(0,7),
      stats:{quests,wakeDays:days.length,bestStreak:bestStreak(days),sleepEntries:sleeps} } };
  }));
  app.get('/api/community/profiles/:id', requireAuth, wrap(async req => {
    const viewerId=req.auth.userId,targetId=req.params.id.trim().toLowerCase();
    const [viewer,target,viewerSettings,targetSettings,block,buddy] = await Promise.all([
      prisma.user.findUnique({where:{id:viewerId},include:{profile:true}}),
      prisma.user.findUnique({where:{id:targetId},include:{profile:true}}),
      prisma.communitySettings.findUnique({where:{userId:viewerId}}),prisma.communitySettings.findUnique({where:{userId:targetId}}),
      prisma.communityBlock.findFirst({where:{OR:[{blockerId:viewerId,blockedId:targetId},{blockerId:targetId,blockedId:viewerId}]},select:{blockerId:true}}),
      prisma.communityBuddy.findFirst({where:{userAId:[viewerId,targetId].sort()[0],userBId:[viewerId,targetId].sort()[1],status:'ACCEPTED'},select:{id:true}}),
    ]);
    if(!mayViewProfile({viewer,target,viewerSettings,targetSettings,blocked:Boolean(block),buddy:Boolean(buddy)}))throw fail();
    const [loadout,owned]=await Promise.all([prisma.cosmeticLoadout.findUnique({where:{userId:targetId}}),prisma.cosmeticOwnership.findMany({where:{userId:targetId,source:'achievement'},select:{itemId:true}})]);
    return {profile:publicCard(target,loadout?.badgeIds,owned)};
  }));
}
module.exports = { registerProfileCards, mayViewProfile, publicCard };
