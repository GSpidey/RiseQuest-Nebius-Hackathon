const crypto = require('crypto');

const COSMETICS = Object.freeze({ theme_nature: 200, theme_space: 200, theme_ocean: 200,
  theme_urban: 350, theme_zen: 350, sound_birds: 120, sound_rain: 120,
  sound_motivational: 220, anim_sparkles: 150, anim_fireworks: 250,
  badge_early_bird: 80, badge_streak_master: 150, bundle_starter: 450, bundle_premium: 900 });

function receipt(userId, type, key) {
  return `reward_${crypto.createHash('sha256').update(JSON.stringify([userId, type, key])).digest('hex')}`;
}

async function rewardFor(prisma, userId, reason, metadata = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const since = new Date(`${day}T00:00:00Z`);
  const rules = {
    'creating a new quest': ['quest_created', 15],
    'completing a quest step': ['quest_step', 5],
    'completing a full quest': ['quest_completed', 50],
  };
  let type, amount, key;
  if (rules[reason]) {
    [type, amount] = rules[reason];
    const quest = await prisma.quest.findUnique({ where: { id: String(metadata.questId || '') }, include: { subtasks: true } });
    if (!quest || quest.userId !== userId) throw new Error('A saved quest is required for this reward');
    key = quest.id;
    if (type === 'quest_completed' && quest.status !== 'completed') throw new Error('Quest is not complete');
    if (type === 'quest_step') {
      const step = quest.subtasks.find(s => s.id === metadata.subtaskId && s.completed);
      if (!step) throw new Error('Quest step is not complete');
      key = step.id;
    }
  } else if (reason === 'Daily login bonus' || metadata.type === 'daily_login') {
    type = 'daily_login'; amount = 10; key = day;
  } else if (reason === 'waking up on time' || metadata.type === 'alarm_completion') {
    const event = await prisma.alarmEvent.findFirst({ where: { userId, type: 'dismiss', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    if (!event) throw new Error('A completed alarm is required for this reward');
    type = 'alarm_completion'; amount = 10; key = day;
  } else if (reason === 'completing mini-game challenge' || metadata.type === 'snooze_challenge') {
    const event = await prisma.alarmEvent.findFirst({ where: { userId, type: 'challenge_completed', createdAt: { gte: since } } });
    if (!event) throw new Error('A completed challenge is required for this reward');
    type = 'challenge_completed'; amount = 25; key = day;
  } else if (/^\d+-day streak milestone$/.test(reason) || metadata.type === 'streak_bonus') {
    const events = await prisma.alarmEvent.findMany({ where: { userId, type: 'dismiss', createdAt: { gte: new Date(Date.now() - 60 * 86400000) } }, select: { createdAt: true } });
    const days = new Set(events.map(e => e.createdAt.toISOString().slice(0, 10)));
    let streak = 0;
    while (days.has(new Date(since.getTime() - streak * 86400000).toISOString().slice(0, 10))) streak++;
    if (!streak || streak % 7 !== 0) throw new Error('Streak milestone not reached');
    type = 'streak'; amount = 50; key = day;
  } else {
    throw new Error('Unsupported reward event');
  }
  return { id: receipt(userId, type, key), amount, reason: String(reason), type };
}

function spendFor(body) {
  const ids = body.metadata?.itemIds;
  if (Array.isArray(ids) && ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length &&
      ids.every(id => typeof id === 'string' && Object.hasOwn(COSMETICS, id))) {
    const amount = ids.reduce((sum, id) => sum + COSMETICS[id], 0);
    if (amount !== Number(body.delta)) throw new Error('Store price changed. Refresh and try again.');
    return { amount, reason: `Cosmetics: ${ids.join(',')}` };
  }
  throw new Error('Select an item from the store before spending points');
}

module.exports = { COSMETICS, receipt, rewardFor, spendFor };
