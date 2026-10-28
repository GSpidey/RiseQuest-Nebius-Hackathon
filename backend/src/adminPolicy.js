const OWNER_ID = process.env.RISEQUEST_OWNER_ID || null;
const ranks = { USER: 0, STAFF: 1, ADMIN: 2, SUPERADMIN: 3 };
const fail = (status, message) => Object.assign(new Error(message), { status });
function assertAccountManagement(actor, target, changes = {}) {
  if (!actor || actor.disabledAt || (ranks[actor.role] || 0) < 2) throw fail(403, 'Administrator access required.');
  if (!target) throw fail(404, 'Account not found.');
  if (target.id === OWNER_ID) throw fail(403, 'The owner account is protected. Use its own account recovery settings.');
  if (actor.id === target.id) throw fail(403, 'Use another authorized administrator to change your access.');
  if (actor.id !== OWNER_ID && ranks[target.role] >= ranks[actor.role]) throw fail(403, 'You cannot manage an account at or above your access level.');
  if (changes.role && !Object.hasOwn(ranks, changes.role)) throw fail(400, 'Invalid role.');
  if (changes.role && ranks[changes.role] >= 2 && actor.role !== 'SUPERADMIN') throw fail(403, 'Only a super admin can grant administrator access.');
}
async function manageAccount(prisma, actorId, targetId, changes, action, update) {
  return prisma.$transaction(async tx => {
    // Serialize access changes and recheck the actor inside the same transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741192007)`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    const target = await tx.user.findUnique({ where: { id: targetId } });
    assertAccountManagement(actor, target, changes);
    const result = await update(tx, target);
    await tx.adminAuditLog.create({ data: { actorId, targetUserId: targetId, action,
      metadata: { previousRole: target.role, ...JSON.parse(JSON.stringify(changes)) } } });
    return result;
  });
}
// Operator-only provisioning; never called during login or signup.
async function provisionOwner(prisma) {
  if (!OWNER_ID) throw fail(503, 'Set RISEQUEST_OWNER_ID before audited operator provisioning.');
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741192007)`;
    const prior = await tx.user.findUnique({ where: { id: OWNER_ID } });
    if (prior?.disabledAt) throw fail(409, 'Owner account is disabled; review before provisioning.');
    if (prior?.role === 'SUPERADMIN') return { id: OWNER_ID, changed: false };
    await tx.user.upsert({ where: { id: OWNER_ID },
      create: { id: OWNER_ID, name: 'Owner', role: 'SUPERADMIN' }, update: { role: 'SUPERADMIN' } });
    await tx.adminAuditLog.create({ data: { actorId: OWNER_ID, targetUserId: OWNER_ID, action: 'OWNER_PROVISIONED',
      metadata: { authorization: 'Explicit operator provisioning', previousRole: prior?.role || null } } });
    return { id: OWNER_ID, changed: true, existingAccount: Boolean(prior) };
  });
}
module.exports = { OWNER_ID, assertAccountManagement, manageAccount, provisionOwner };
