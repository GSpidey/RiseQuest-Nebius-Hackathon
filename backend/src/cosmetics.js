const crypto = require('crypto');
const { CATALOG, ACHIEVEMENTS, byId, expand, quote } = require('./cosmeticCatalog');
const { walletTransaction } = require('./security');
const { grants, progression } = require('./progression');
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyFor = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw fail(400, 'A purchase reference is required.');
  return value;
};
async function catalogFor(tx) {
  const themes = await tx.cosmeticTheme.findMany({ where: { status: 'PUBLISHED' } });
  return Object.fromEntries([...CATALOG, ...ACHIEVEMENTS, ...themes.map(t => ({ id: t.id, ...(t.published || {name:t.name,description:t.description,price:t.price,design:t.design}), type: 'themes', category: 'premium' }))].map(t => [t.id, t]));
}
async function grant(tx, userId, ids, source, reference) {
  if (ids.length) await tx.cosmeticOwnership.createMany({ data: [...new Set(ids)].map(itemId => ({ userId, itemId, source, reference })), skipDuplicates: true });
}
async function recoverPurchases(tx, userId) {
  // Only the authoritative ledger can restore an entitlement. Never accept a device's ownership list.
  const rows = await tx.risePointsTransaction.findMany({ where: { userId, delta: { lt: 0 }, reason: { startsWith: 'Cosmetics: ' } } });
  for (const row of rows) {
    const ids = row.reason.slice(11).split(',').filter(id => Object.hasOwn(byId, id));
    await grant(tx, userId, expand(ids, byId, row.metadata?.cosmeticsVersion !== 2), 'purchase', row.id);
  }
}
function bestStreak(days) {
  const times = [...new Set(days)].map(day => Date.parse(`${day}T00:00:00Z`)).filter(Number.isFinite).sort((a,b) => a-b);
  let best = 0, current = 0, previous;
  for (const time of times) { current = time - previous === 86400000 ? current + 1 : 1; best = Math.max(best, current); previous = time; }
  return best;
}
async function awardAchievements(tx, userId) {
  const [events, quests, steps, sleep] = await Promise.all([
    tx.alarmEvent.findMany({ where: { userId, type: { in: ['dismiss', 'challenge_completed'] } }, select: { type: true, createdAt: true } }),
    tx.quest.findMany({ where: { userId, status: 'completed' }, select: { id: true } }),
    tx.questSubtask.findMany({ where: { completed: true, quest: { userId } }, select: { id: true } }),
    tx.sleepEntry.findMany({ where: { userId }, select: { dateKey: true }, distinct: ['dateKey'] }),
  ]);
  const days = type => [...new Set(events.filter(e => e.type === type).map(e => e.createdAt.toISOString().slice(0,10)))];
  const wake = days('dismiss');
  const progress = { wakeDays: wake.length, bestStreak: bestStreak(wake), quests: quests.length, steps: steps.length,
    challenges: days('challenge_completed').length, sleepDays: sleep.length };
  await grant(tx, userId, ACHIEVEMENTS.filter(a => progress[a.metric] >= a.target).map(a => a.id), 'achievement', 'activity-v1');
  const earned = ACHIEVEMENTS.filter(a => progress[a.metric] >= a.target);
  await grants(tx,userId,'badge',earned.map(a=>[a.id,a.xp]));
  await grants(tx,userId,'activity',[
    ...wake.map(day=>['wake:'+day,10]), ...days('challenge_completed').map(day=>['challenge:'+day,15]),
    ...quests.map(q=>['quest:'+q.id,20]), ...steps.map(s=>['step:'+s.id,3]), ...sleep.map(s=>['sleep:'+s.dateKey,5]),
  ]);
  return progress;
}
async function ownedIds(tx, userId) {
  return (await tx.cosmeticOwnership.findMany({ where: { userId } })).map(row => row.itemId);
}
async function snapshot(tx, userId, reconcile = true) {
  if (reconcile) await recoverPurchases(tx, userId);
  const progress = await awardAchievements(tx, userId);
  const catalog = await catalogFor(tx);
  const [inventory, loadout, wallet, child] = await Promise.all([
    tx.cosmeticOwnership.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    tx.cosmeticLoadout.findUnique({ where: { userId } }),
    tx.risePointsBalance.findUnique({ where: { userId } }),
    tx.childAccount.findUnique({ where: { childId: userId } }),
  ]);
  // Previously purchased unpublished themes remain usable; unpublished themes never enter the store.
  const hidden = inventory.filter(row => !catalog[row.itemId]).map(row => row.itemId);
  const archived = hidden.length ? await tx.cosmeticTheme.findMany({ where: { id: { in: hidden } } }) : [];
  const inventoryCatalog = { ...catalog, ...Object.fromEntries(archived.map(t => [t.id, { id:t.id, ...(t.published || {name:t.name,description:t.description,price:t.price,design:t.design}), type: 'themes', category: 'premium' }])) };
  return { catalog: Object.values(catalog).filter(i => i.category !== 'earned'),
    inventory: inventory.map(row => ({ ...inventoryCatalog[row.itemId], ...row, id: row.itemId })).filter(row => row.type),
    achievements: ACHIEVEMENTS.map(a => ({ ...a, progress: Math.min(a.target, progress[a.metric]),
      earned: inventory.some(row => row.itemId === a.id) })), loadout: loadout || {}, balance: wallet?.balance || 0,
    requiresParentApproval: Boolean(child), progression: await progression(tx,userId) };
}
async function purchase(tx, { payerId, recipientId = payerId, itemIds, expectedAmount, key, source = 'purchase' }) {
  const reference = 'cosmetic_' + hash([payerId, keyFor(key)]);
  const signature = hash([recipientId, itemIds, expectedAmount]);
  const previous = await tx.risePointsTransaction.findUnique({ where: { id: reference } });
  if (previous) {
    if (previous.metadata?.signature !== signature) throw fail(409, 'This purchase reference was used for different items.');
    return { reference, alreadyCompleted: true };
  }
  await recoverPurchases(tx, recipientId);
  const catalog = await catalogFor(tx);
  let current;
  try { current = quote(itemIds, await ownedIds(tx, recipientId), catalog); } catch (e) { throw fail(409, e.message); }
  if (current.amount !== expectedAmount) throw fail(409, 'Your collection or the price changed. Review the updated total.');
  const paid = current.amount === 0 ? { count: 1 } : await tx.risePointsBalance.updateMany({ where: { userId: payerId, balance: { gte: current.amount } }, data: { balance: { decrement: current.amount } } });
  if (paid.count !== 1) throw fail(400, 'You need more Rise Points for this purchase.');
  await tx.risePointsTransaction.create({ data: { id: reference, userId: payerId, delta: -current.amount,
    reason: `Collection purchase: ${itemIds.join(',')}`, metadata: { signature, recipientId, itemIds, grants: current.grants } } });
  await grant(tx, recipientId, current.grants, source, reference);
  return { reference, alreadyCompleted: false };
}
async function activeChild(tx, childId, parentId) {
  const child = await tx.childAccount.findUnique({ where: { childId }, include: { parent: true, consent: true } });
  if (!child || (parentId && child.parentId !== parentId) || child.parent.disabledAt ||
      child.consent.status !== 'APPROVED' || child.consent.withdrawnAt) throw fail(403, 'This child profile needs active parent consent.');
  return child;
}
function registerCosmetics(app, { prisma, requireAuth, requireAdmin, requireRole }) {
  const wrap = fn => async (req,res) => { try { res.json(await fn(req)); } catch(e) {
    if (!e.status) console.error('[Cosmetics]', e.code || e.name);
    res.status(e.status || 503).json({ error: e.status ? e.message : 'Your collection could not refresh. Please try again.' });
  } };
  app.get('/api/cosmetics', requireAuth, wrap(req => walletTransaction(prisma, req.auth.userId, tx => snapshot(tx, req.auth.userId))));
  app.post('/api/cosmetics/quote', requireAuth, wrap(req => walletTransaction(prisma, req.auth.userId, async tx => {
    await recoverPurchases(tx, req.auth.userId);
    try { return quote(req.body.itemIds, await ownedIds(tx, req.auth.userId), await catalogFor(tx)); }
    catch(e) { throw fail(400, e.message); }
  })));
  app.post('/api/cosmetics/purchase', requireAuth, wrap(async req => {
    if (req.auth.provider === 'child' || await prisma.childAccount.findUnique({ where: { childId: req.auth.userId } })) throw fail(403, 'Send a request to your parent to purchase this item.');
    return walletTransaction(prisma, req.auth.userId, async tx => {
      const receipt = await purchase(tx, { payerId: req.auth.userId, ...pickPurchase(req.body) });
      return { ...receipt, ...await snapshot(tx, req.auth.userId, false) };
    });
  }));
  app.post('/api/cosmetics/equip', requireAuth, wrap(req => walletTransaction(prisma, req.auth.userId, async tx => {
    await recoverPurchases(tx, req.auth.userId);
    const { slot, itemId } = req.body;
    const types = { themeId: 'themes', soundId: 'sounds', animationId: 'animations', badgeIds: 'badges' };
    if (!Object.hasOwn(types, slot)) throw fail(400, 'Choose a collection slot.');
    const ids = slot === 'badgeIds' ? itemId : itemId == null ? [] : [itemId];
    if (!Array.isArray(ids) || ids.length > (slot === 'badgeIds' ? 3 : 1) || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) throw fail(400, 'Choose up to three different badges.');
    const catalog = await catalogFor(tx), owned = new Set(await ownedIds(tx, req.auth.userId));
    for (const id of ids) {
      const product = catalog[id] || await tx.cosmeticTheme.findUnique({ where: { id } }).then(t => t ? { type: 'themes' } : null);
      if (!owned.has(id) || product?.type !== types[slot]) throw fail(403, 'Choose an item from your collection.');
    }
    const data = { [slot]: slot === 'badgeIds' ? ids : ids[0] || null };
    await tx.cosmeticLoadout.upsert({ where: { userId: req.auth.userId }, create: { userId: req.auth.userId, ...data }, update: data });
    return snapshot(tx, req.auth.userId, false);
  })));
  app.post('/api/cosmetics/requests', requireAuth, wrap(req => walletTransaction(prisma, req.auth.userId, async tx => {
    const child = await activeChild(tx, req.auth.userId);
    const requestKey = hash([req.auth.userId, keyFor(req.body.key)]);
    const previous = await tx.cosmeticPurchaseRequest.findUnique({ where: { requestKey } });
    if (previous) {
      if (hash(previous.itemIds) !== hash(req.body.itemIds) || previous.amount !== req.body.expectedAmount) throw fail(409, 'This request reference is already in use.');
      return { request: previous };
    }
    const pending = await tx.cosmeticPurchaseRequest.count({ where: { childId: child.childId, status: 'PENDING', expiresAt: { gt: new Date() } } });
    if (pending >= 5) throw fail(429, 'Your parent has five requests to review.');
    await recoverPurchases(tx, child.childId);
    let current;
    try { current = quote(req.body.itemIds, await ownedIds(tx, child.childId), await catalogFor(tx)); } catch(e) { throw fail(400, e.message); }
    if (current.amount !== req.body.expectedAmount) throw fail(409, 'Review the current price before sending your request.');
    return { request: await tx.cosmeticPurchaseRequest.create({ data: { childId: child.childId, parentId: child.parentId,
      consentId: child.consentId, itemIds: current.itemIds, amount: current.amount, requestKey, expiresAt: new Date(Date.now()+7*86400000) } }) };
  })));
  app.get('/api/family/purchases', requireAuth, wrap(async req => ({ requests: await prisma.cosmeticPurchaseRequest.findMany({
    where: { parentId: req.auth.userId, status: 'PENDING', expiresAt: { gt: new Date() } }, include: { child: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }), catalog: CATALOG })));
  app.post('/api/family/purchases/:id', requireAuth, wrap(req => walletTransaction(prisma, req.auth.userId, async tx => {
    const request = await tx.cosmeticPurchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!request || request.parentId !== req.auth.userId) throw fail(404, 'Request not found.');
    if (typeof req.body.approve !== 'boolean') throw fail(400, 'Choose approve or decline.');
    if (request.status !== 'PENDING') return { status: request.status };
    if (request.expiresAt <= new Date()) throw fail(409, 'This request expired. Ask your child to send a new request.');
    // Serialize child grants with child equip/requests as well as parent spending.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${request.childId}))`;
    const child = await activeChild(tx, request.childId, req.auth.userId);
    if (child.consentId !== request.consentId) throw fail(403, 'Parent consent changed.');
    if (req.body.approve) await purchase(tx, { payerId: req.auth.userId, recipientId: request.childId,
      itemIds: request.itemIds, expectedAmount: request.amount, key: `family_${request.id}`, source: 'parent' });
    const status = req.body.approve ? 'APPROVED' : 'DECLINED';
    await tx.cosmeticPurchaseRequest.update({ where: { id: request.id }, data: { status, resolvedAt: new Date() } });
    return { status };
  })));
  app.post('/api/admin/cosmetics/grant', requireAdmin, requireRole('ADMIN'), wrap(req => walletTransaction(prisma, String(req.body.targetUserId || ''), async tx => {
    const targetUserId = String(req.body.targetUserId || '').trim().toLowerCase();
    if (!await tx.user.findUnique({ where: { id: targetUserId } })) throw fail(404, 'Account not found.');
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 8 || reason.length > 500) throw fail(400, 'Enter a reason for this grant.');
    const catalog = await catalogFor(tx), ids = req.body.itemIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => !Object.hasOwn(catalog, id) || catalog[id].category === 'earned')) throw fail(400, 'Choose catalog items. Achievement badges must be earned.');
    const reference = 'admin_grant_' + hash([req.auth.userId, keyFor(req.body.key)]);
    const existing = await tx.adminAuditLog.findUnique({ where: { id: reference } });
    const metadata = { itemIds: ids, reason };
    if (existing && (existing.targetUserId !== targetUserId || hash(existing.metadata) !== hash(metadata))) throw fail(409, 'Grant reference already used.');
    if (!existing) {
      await grant(tx, targetUserId, expand(ids, catalog), 'admin', reference);
      await tx.adminAuditLog.create({ data: { id: reference, actorId: req.auth.userId, targetUserId, action: 'cosmetics.grant', metadata } });
    }
    return { granted: ids, reference };
  })));
}
function pickPurchase(body) { return { itemIds: body.itemIds, expectedAmount: body.expectedAmount, key: body.key }; }
module.exports = { registerCosmetics, catalogFor, grant, recoverPurchases, ownedIds, purchase, snapshot, bestStreak, awardAchievements, activeChild };
