const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { revokeAppleIdentity } = require('./appleAuth');
const fail = (status, message) => Object.assign(new Error(message), { status });
const ownerHash = (id, secret) => crypto.createHmac('sha256', secret).update(`deleted:${id}`).digest('hex');

function ownedMediaPath(url, uploadsDir) {
  try {
    const pathname = new URL(url).pathname;
    const match = /^\/uploads\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/.exec(pathname);
    if (!match) return null;
    const resolved = path.resolve(uploadsDir, match[1]);
    return path.dirname(resolved) === path.resolve(uploadsDir) ? resolved : null;
  } catch (_) { return null; }
}
async function requestDeletion(prisma, userId, secret) {
  return prisma.$transaction(async tx => {
    const children = await tx.childAccount.findMany({ where: { parentId: userId }, select: { childId: true } });
    await tx.user.updateMany({ where: { id: { in: [userId, ...children.map(c => c.childId)] } }, data: { disabledAt: new Date() } });
    const job = await tx.accountDeletion.upsert({ where: { userId }, create: { userId, ownerHash: ownerHash(userId, secret) }, update: {} });
    return { ...job, cacheOwners: [userId, ...children.map(c => c.childId)] };
  });
}
async function completeDeletion(job, { prisma, stripe, secret, uploadsDir, revokeApple = revokeAppleIdentity }) {
  const user = await prisma.user.findUnique({ where: { id: job.userId }, include: { appleIdentity: true,
    subscriptions: true, managedChildren: { include: { child: true } } } });
  if (!user) {
    await prisma.accountDeletion.update({ where: { id: job.id }, data: { userId: null, status: 'COMPLETE', completedAt: new Date() } });
    return;
  }
  // Cancellation cannot create a charge, invoice, refund or proration. Failed
  // provider work leaves a disabled account and a durable job for retry.
  for (const subscription of user.subscriptions) {
    if (['canceled', 'incomplete_expired'].includes(subscription.status)) continue;
    try { await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, { invoice_now: false, prorate: false }); }
    catch (error) { if (error.code !== 'resource_missing') throw error; }
  }
  if (user.appleIdentity) await revokeApple(user.appleIdentity, secret);
  const ids = [user.id, ...user.managedChildren.map(c => c.childId)];
  const media = [user, ...user.managedChildren.map(c => c.child)]
    .flatMap(u => [ownedMediaPath(u.photoUrl, uploadsDir), ownedMediaPath(u.bannerUrl, uploadsDir)]).filter(Boolean);
  // Media unlink is idempotent. An interrupted job can safely repeat it.
  for (const file of new Set(media)) {
    const name = path.basename(file);
    const shared = await prisma.user.count({ where: { id: { notIn: ids }, OR: [{ photoUrl: { endsWith: `/uploads/${name}` } }, { bannerUrl: { endsWith: `/uploads/${name}` } }] } });
    if (!shared) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  await prisma.$transaction(async tx => {
    // Delete personal support text; retain only de-identified financial proofs
    // needed to prevent refunds/replays from granting points a second time.
    await tx.supportTicket.deleteMany({ where: { OR: [{ userId: { in: ids } }, { userEmail: { in: ids } }] } });
    await tx.paymentIntent.updateMany({ where: { userId: { in: ids } }, data: { metadata: {} } });
    await tx.storePurchase.updateMany({ where: { userId: { in: ids } }, data: { token: null } });
    await tx.adminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetUserId: { in: ids } }] } });
    // Remove child users before deleting their guardian/consent relationships.
    await tx.user.deleteMany({ where: { id: { in: ids.filter(id => id !== user.id) } } });
    await tx.user.delete({ where: { id: user.id } });
    await tx.accountDeletion.update({ where: { id: job.id }, data: { userId: null, status: 'COMPLETE', completedAt: new Date() } });
  }, { isolationLevel: 'Serializable' });
}
function registerAccountDeletion(app, dependencies) {
  const { prisma, requireAuth, secret } = dependencies;
  let running = false;
  async function processPending() {
    if (running) return;
    running = true;
    try {
      const jobs = await prisma.accountDeletion.findMany({ where: { status: 'PENDING' }, take: 20, orderBy: { createdAt: 'asc' } });
      for (const job of jobs) {
        try { await completeDeletion(job, dependencies); }
        catch (_) { await prisma.accountDeletion.update({ where: { id: job.id }, data: { attempts: { increment: 1 } } }); }
      }
    } finally { running = false; }
  }
  app.post('/api/me/delete-account', requireAuth, async (req, res) => {
    try {
      if (req.auth.provider === 'child') throw fail(403, 'Ask your parent to delete this profile in Family profiles.');
      if (!req.auth.issuedAt || req.auth.issuedAt < Date.now() / 1000 - 600) throw fail(401, 'Sign out and sign in again before deleting your account.');
      if (req.body.confirmation !== 'DELETE' || req.body.storeSubscriptionsAcknowledged !== true) throw fail(400, 'Confirm deletion and review your store subscriptions first.');
      const row = await requestDeletion(prisma, req.auth.userId, secret);
      res.status(202).json({ requested: true, reference: row.id, cacheOwners: row.cacheOwners,
        message: 'Online access is disabled. Account and managed child data are queued for deletion. Store subscriptions must be canceled in your store settings.' });
      void processPending().catch(() => {});
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Deletion could not be requested. Please retry.' }); }
  });
  if (process.env.NODE_ENV !== 'test') {
    setInterval(() => { void processPending().catch(() => {}); }, 60000).unref();
  }
  return { processPending };
}
module.exports = { registerAccountDeletion, requestDeletion, completeDeletion, ownedMediaPath };
