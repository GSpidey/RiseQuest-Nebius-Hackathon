const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OWNER_ID, manageAccount } = require('./adminPolicy');
const { PLANS, POINT_PACKS_V2 } = require('./economy');
const selectUser = { id: true, name: true, role: true, disabledAt: true, updatedAt: true };
const fail = (status, message) => Object.assign(new Error(message), { status });
function registerAdminConsole(app, { prisma, requireAdmin, requireRole, sendPasswordResetEmail }) {
  const wrap = fn => async (req, res) => { try { res.set('Cache-Control','no-store').json(await fn(req)); } catch(e) {
    if (!e.status) console.error('[AdminConsole]', e.code || e.name);
    res.status(e.status || 503).json({ error: e.status ? e.message : 'Could not complete this admin action. Please retry.' });
  } };
  const access = [requireAdmin, requireRole('ADMIN')];
  app.get('/api/admin/team', ...access, wrap(async () => ({ ownerId: OWNER_ID,
    users: await prisma.user.findMany({ where: { role: { in: ['STAFF','ADMIN','SUPERADMIN'] } }, select: selectUser, orderBy: { id: 'asc' } }) })));
  app.patch('/api/admin/users/:id', ...access, wrap(async req => {
    const body = req.body || {}, data = {};
    if (body.role !== undefined) { if (typeof body.role !== 'string') throw fail(400, 'Invalid role.'); data.role = body.role.toUpperCase(); }
    if (body.disabled !== undefined) { if (typeof body.disabled !== 'boolean') throw fail(400, 'Invalid account status.'); data.disabledAt = body.disabled ? new Date() : null; }
    if (!Object.keys(data).length) throw fail(400, 'Choose an access or account status change.');
    const id = req.params.id.trim().toLowerCase();
    return { success: true, user: await manageAccount(prisma, req.auth.userId, id, data, 'USER_UPDATE',
      tx => tx.user.update({ where: { id }, data, select: selectUser })) };
  }));
  app.post('/api/admin/users/:id/set-password', ...access, wrap(async req => {
    const id = req.params.id.trim().toLowerCase(), password = req.body?.password;
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) throw fail(400, 'Use a password of at least 8 characters and at most 72 bytes.');
    const passwordHash = await bcrypt.hash(password, 10);
    return { success: true, user: await manageAccount(prisma, req.auth.userId, id, {}, 'USER_SET_PASSWORD',
      tx => tx.user.update({ where: { id }, data: { passwordHash, authProvider: 'password' }, select: selectUser })) };
  }));
  app.post('/api/admin/users/:id/trigger-password-reset', ...access, wrap(async req => {
    const id = req.params.id.trim().toLowerCase(), token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await manageAccount(prisma, req.auth.userId, id, {}, 'USER_TRIGGER_PASSWORD_RESET', async (tx, target) => {
      if (target.disabledAt) throw fail(400, 'Account is disabled.');
      await tx.passwordResetToken.create({ data: { userId: id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt } });
    });
    await sendPasswordResetEmail({ to: id, token, expiresAt });
    return { success: true };
  }));
  app.get('/api/admin/users/:id/economy', ...access, wrap(async req => {
    const userId = req.params.id.trim().toLowerCase();
    const [wallet, transactions, inventory, subscriptions, storePurchases] = await Promise.all([
      prisma.risePointsBalance.findUnique({ where: { userId } }),
      prisma.risePointsTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id:true,delta:true,reason:true,createdAt:true } }),
      prisma.cosmeticOwnership.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { itemId:true,source:true,createdAt:true } }),
      prisma.subscription.findMany({ where: { userId }, select: { status:true,currentPeriodEnd:true,cancelAtPeriodEnd:true }, take:50 }),
      prisma.storePurchase.findMany({ where: { userId }, select: { store:true,productId:true,status:true,expiresAt:true }, take:50 }),
    ]);
    return { balance: wallet?.balance || 0, transactions, inventory, subscriptions, storePurchases };
  }));
  app.get('/api/admin/analytics', ...access, wrap(async req => {
    const days = [7,30,90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const since = new Date();since.setUTCHours(0,0,0,0);since.setUTCDate(since.getUTCDate()-days+1);
    const window = { gte: since };
    const [users, newUsers, disabled, roles, outstanding, issued, spent, reasons, stripe, store, payments, quests, alarms, sleeps, tickets, consents, cosmetics, activity] = await Promise.all([
      prisma.user.count(), prisma.user.count({where:{createdAt:window}}), prisma.user.count({where:{disabledAt:{not:null}}}),
      prisma.user.groupBy({by:['role'],_count:{_all:true}}), prisma.risePointsBalance.aggregate({_sum:{balance:true}}),
      prisma.risePointsTransaction.aggregate({where:{createdAt:window,delta:{gt:0}},_sum:{delta:true}}),
      prisma.risePointsTransaction.aggregate({where:{createdAt:window,delta:{lt:0}},_sum:{delta:true}}),
      prisma.risePointsTransaction.groupBy({by:['reason'],where:{createdAt:window},_sum:{delta:true},_count:{_all:true},orderBy:{_count:{reason:'desc'}},take:30}),
      prisma.subscription.groupBy({by:['status'],_count:{_all:true}}),
      prisma.storePurchase.groupBy({by:['store','status'],_count:{_all:true}}),
      prisma.paymentIntent.groupBy({by:['currency','status'],where:{createdAt:window},_sum:{amount:true},_count:{_all:true}}),
      prisma.quest.count({where:{status:'completed',completedAt:window}}), prisma.alarmEvent.count({where:{createdAt:window,type:'dismiss'}}),
      prisma.sleepEntry.count({where:{createdAt:window}}), prisma.supportTicket.groupBy({by:['status'],_count:{_all:true}}),
      prisma.familyConsent.groupBy({by:['status'],_count:{_all:true}}),
      prisma.cosmeticOwnership.groupBy({by:['source'],where:{createdAt:window},_count:{_all:true}}),
      // Aggregate only; never return individual activity or sensitive support answers.
      prisma.$queryRaw`SELECT day, COUNT(*)::int AS users FROM (SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') AS day, user_id FROM alarm_events WHERE created_at >= ${since} UNION SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') AS day, user_id FROM sleep_entries WHERE created_at >= ${since} UNION SELECT DISTINCT DATE(updated_at AT TIME ZONE 'UTC') AS day, user_id FROM quests WHERE updated_at >= ${since}) activity GROUP BY day ORDER BY day`,
    ]);
    return { days, since, timestamp: new Date(), users:{total:users,new:newUsers,disabled,roles},
      economy:{outstanding:outstanding._sum.balance||0,issued:issued._sum.delta||0,spent:-(spent._sum.delta||0),reasons,plans:PLANS,pointPacks:POINT_PACKS_V2},
      subscriptions:{stripe,store}, payments, engagement:{completedQuests:quests,wakeUps:alarms,sleepEntries:sleeps,dailyActive:activity}, tickets,consents,cosmetics };
  }));
}
module.exports = { registerAdminConsole };
