const crypto = require('crypto');
const { POINT_PACKS_V2 } = require('./economy');
const TERMS = 'recharge-2026-10-26-v1';
const PENDING = ['reserved', 'ready', 'processing', 'requires_action'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const objectId = value => typeof value === 'string' ? value : value?.id;
const period = date => date.toISOString().slice(0, 7);
const lock = (db, userId, fn) => db.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  return fn(tx);
}, { timeout: 30000, maxWait: 10000 });

function configuration(input = {}) {
  const pack = Object.hasOwn(POINT_PACKS_V2, input.pack || '') && POINT_PACKS_V2[input.pack];
  if (!pack) throw fail('Choose a current points pack.');
  if (!Number.isSafeInteger(input.threshold) || input.threshold < 1 || input.threshold > pack.points)
    throw fail('Choose a threshold between 1 and the points in your pack.');
  if (!Number.isSafeInteger(input.monthlyCents) || input.monthlyCents < pack.cents || input.monthlyCents > 100000)
    throw fail('Choose a monthly limit that covers your pack, up to US$1,000.');
  if (input.terms !== TERMS || input.confirmed !== true) throw fail('Review and authorise automatic recharge.');
  return { pack: input.pack, threshold: input.threshold, monthlyCents: input.monthlyCents,
    amount: pack.cents, points: pack.points, currency: 'usd', terms: TERMS };
}
async function adult(tx, userId) {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user || user.disabledAt || user.profile?.data?.ageGroup !== 'adult' || user.profile.data.managedByParent)
    throw fail('An adult account is required to authorise card recharge.', 403);
  return user;
}
function canReserve(agreement, balance, attempts, now = new Date()) {
  const d = agreement?.data, pack = POINT_PACKS_V2[d?.pack];
  if (!d?.enabled || d.terms !== TERMS || !pack || d.amount !== pack.cents || d.points !== pack.points ||
      !d.paymentMethod || balance >= d.threshold) return false;
  if (attempts.some(a => PENDING.includes(a.status))) return false;
  if (attempts.some(a => !['cancelled', 'failed'].includes(a.status) &&
      new Date(a.createdAt).getTime() > now.getTime() - 86400000)) return false;
  const spent = attempts.filter(a => a.period === period(now) && !['cancelled', 'failed'].includes(a.status))
    .reduce((sum, a) => sum + a.amount, 0);
  return spent + d.amount <= d.monthlyCents;
}
async function reserve(db, userId, now = new Date()) {
  return lock(db, userId, async tx => {
    await adult(tx, userId);
    const agreement = await tx.rechargeAgreement.findUnique({ where: { userId } });
    const balance = (await tx.risePointsBalance.findUnique({ where: { userId } }))?.balance || 0;
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 2 * 86400000);
    const attempts = await tx.rechargeAttempt.findMany({ where: { userId,
      OR: [{ createdAt: { gte: since } }, { period: period(now) }, { status: { in: PENDING } }] } });
    if (!canReserve(agreement, balance, attempts, now)) return null;
    const d = agreement.data;
    return tx.rechargeAttempt.create({ data: { id: crypto.randomUUID(), userId,
      agreementRevision: agreement.revision, amount: d.amount, points: d.points,
      pack: d.pack, currency: d.currency, customerId: d.customerId,
      paymentMethod: d.paymentMethod, period: period(now) } });
  });
}
async function pause(tx, userId, reason, cancelPending = false) {
  const row = await tx.rechargeAgreement.findUnique({ where: { userId } });
  if (row && (row.data.enabled || row.data.pauseReason !== reason || (cancelPending && !row.data.cancelPending)))
    await tx.rechargeAgreement.update({ where: { userId }, data: {
      revision: { increment: 1 }, data: { ...row.data, enabled: false, pauseReason: reason,
        cancelPending: cancelPending || !!row.data.cancelPending } } });
}
function matchReceipt(row, pi) {
  if (objectId(pi.customer) !== row.customerId || pi.metadata?.rechargeAttempt !== row.id ||
      pi.amount !== row.amount || pi.currency !== row.currency) throw Error('Recharge receipt mismatch');
}
async function pauseAttempt(tx, row, reason) {
  const agreement = await tx.rechargeAgreement.findUnique({ where: { userId: row.userId } });
  // A late failure from an older card must not revoke a newer agreement.
  if (agreement?.revision === row.agreementRevision) await pause(tx, row.userId, reason);
}
async function settleIn(tx, row, pi, now = new Date()) {
  matchReceipt(row, pi);
  if (['succeeded', 'cancelled', 'failed'].includes(row.status) && pi.status !== 'succeeded') return;
  if (pi.status === 'succeeded') {
    if (pi.amount_received !== row.amount) throw Error('Recharge amount mismatch');
    const id = `recharge_${row.id}`;
    if (!await tx.risePointsTransaction.findUnique({ where: { id } })) {
      const reversal = await tx.risePointsTransaction.findUnique({ where: { id: `recharge_refund_${row.id}` } });
      const net = Math.max(0, row.points - (reversal?.metadata?.revokedPoints || 0));
      await tx.risePointsTransaction.create({ data: { id, userId: row.userId, delta: net,
        reason: 'Automatic RP recharge', stripePaymentIntentId: pi.id,
        metadata: { attempt: row.id, amount: row.amount, currency: row.currency, agreementRevision: row.agreementRevision } } });
      await tx.risePointsBalance.upsert({ where: { userId: row.userId }, create: { userId: row.userId, balance: net },
        update: { balance: { increment: net } } });
    }
    await tx.rechargeAttempt.update({ where: { id: row.id }, data: { status: 'succeeded',
      ...(row.status !== 'succeeded' ? { period: period(now) } : {}) } });
  } else if (pi.status === 'canceled') {
    await tx.rechargeAttempt.update({ where: { id: row.id }, data: { status: 'cancelled' } });
  } else if (pi.status === 'requires_action') {
    await tx.rechargeAttempt.update({ where: { id: row.id }, data: { status: 'requires_action' } });
    await pauseAttempt(tx, row, 'bank_confirmation');
  } else if (pi.status === 'requires_payment_method') {
    await tx.rechargeAttempt.update({ where: { id: row.id }, data: { status: 'failed' } });
    await pauseAttempt(tx, row, 'payment_failed');
  } else if (pi.status === 'processing') {
    await tx.rechargeAttempt.update({ where: { id: row.id }, data: { status: 'processing' } });
  }
}
async function settle(db, pi) {
  if (pi.metadata?.type !== 'rp_recharge') return false;
  const row = await db.rechargeAttempt.findUnique({ where: { stripeId: pi.id } });
  if (!row) throw Error('Recharge reservation is awaiting reconciliation');
  await lock(db, row.userId, async tx => settleIn(tx,
    await tx.rechargeAttempt.findUnique({ where: { id: row.id } }), pi));
  return true;
}
async function refund(db, charge) {
  if (charge.metadata?.type !== 'rp_recharge') return false;
  const row = await db.rechargeAttempt.findUnique({ where: { stripeId: objectId(charge.payment_intent) } });
  if (!row) throw Error('Refund reservation missing');
  if (objectId(charge.customer) !== row.customerId || charge.amount !== row.amount ||
      charge.currency !== row.currency || charge.metadata?.rechargeAttempt !== row.id ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > row.amount)
    throw Error('Recharge refund mismatch');
  await lock(db, row.userId, async tx => {
    const id = `recharge_refund_${row.id}`, old = await tx.risePointsTransaction.findUnique({ where: { id } });
    const revokedPoints = Math.ceil(row.points * charge.amount_refunded / row.amount);
    const difference = Math.max(0, revokedPoints - (old?.metadata?.revokedPoints || 0));
    if (!difference) return;
    const grant = await tx.risePointsTransaction.findUnique({ where: { id: `recharge_${row.id}` } });
    const balance = (await tx.risePointsBalance.findUnique({ where: { userId: row.userId } }))?.balance || 0;
    const debit = grant ? Math.min(balance, difference) : 0;
    const data = { delta: (old?.delta || 0) - debit, reason: 'Automatic recharge refund',
      metadata: { revokedPoints, refundedCents: charge.amount_refunded,
        unrecovered: (old?.metadata?.unrecovered || 0) + (grant ? difference - debit : 0) } };
    await tx.risePointsTransaction.upsert({ where: { id }, create: { id, userId: row.userId, ...data }, update: data });
    if (debit) await tx.risePointsBalance.update({ where: { userId: row.userId }, data: { balance: { decrement: debit } } });
    await pause(tx, row.userId, 'refunded', true);
  });
  return true;
}
async function processAttempt(db, stripe, id, now = new Date()) {
  const initial = await db.rechargeAttempt.findUnique({ where: { id } });
  if (!initial || !PENDING.includes(initial.status)) return;
  return lock(db, initial.userId, async tx => {
    const row = await tx.rechargeAttempt.findUnique({ where: { id } });
    if (!PENDING.includes(row.status)) return;
    const agreement = await tx.rechargeAgreement.findUnique({ where: { userId: row.userId } });
    let eligible = true;
    try { await adult(tx, row.userId); } catch (_) { eligible = false; }
    const valid = eligible && agreement?.data.enabled && agreement.revision === row.agreementRevision &&
      row.period === period(now) && !agreement.data.cancelPending;
    const bankRecovery = row.status === 'requires_action' && agreement?.data.pauseReason === 'bank_confirmation' &&
      agreement.revision === row.agreementRevision + 1 && !agreement.data.enabled;
    const cancel = !eligible || !agreement || agreement.data.cancelPending || row.period !== period(now) ||
      (!bankRecovery && !valid);
    if (!row.stripeId) {
      if (!valid) return tx.rechargeAttempt.update({ where: { id }, data: { status: 'cancelled' } });
      // Creating an unconfirmed intent cannot charge. Persist its identity before confirmation.
      const pi = await stripe.paymentIntents.create({ amount: row.amount, currency: row.currency,
        customer: row.customerId, payment_method: row.paymentMethod, allowed_payment_method_types: ['card'],
        metadata: { type: 'rp_recharge', rechargeAttempt: id }, description: 'RiseQuest automatic RP recharge' },
      { idempotencyKey: `rq_recharge_create_${id}` });
      matchReceipt(row, pi);
      await tx.rechargeAttempt.update({ where: { id }, data: { stripeId: pi.id, status: 'ready' } });
      return;
    }
    let pi = await stripe.paymentIntents.retrieve(row.stripeId);
    matchReceipt(row, pi);
    if (cancel && ['requires_confirmation', 'requires_action', 'requires_payment_method'].includes(pi.status))
      pi = await stripe.paymentIntents.cancel(pi.id, {}, { idempotencyKey: `rq_recharge_cancel_${id}` });
    else if (valid && pi.status === 'requires_confirmation') {
      try { pi = await stripe.paymentIntents.confirm(pi.id, { off_session: true }, { idempotencyKey: `rq_recharge_confirm_${id}` }); }
      catch (error) {
        // A timeout may have charged successfully. Retrieve before another attempt.
        pi = await stripe.paymentIntents.retrieve(pi.id);
        if (pi.status === 'requires_confirmation') throw error;
      }
    }
    await settleIn(tx, row, pi, now);
  });
}
function registerRecharge(app, { prisma, stripe, requireAuth, publishableKey, schedule = setInterval, log = console }) {
  // Availability is unconditional. Only the user's agreement controls automatic charges.
  const route = fn => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await fn(req)); }
    catch (error) {
      if (!error.status) log.error('recharge_operation_failed', { code: error.code || 'UNKNOWN' });
      res.status(error.status || 503).json({ error: error.status ? error.message : 'Recharge could not connect. Please try again.' });
    }
  };
  const status = async userId => {
    const [agreement, attempts, user] = await Promise.all([
      prisma.rechargeAgreement.findUnique({ where: { userId } }),
      prisma.rechargeAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
      prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    ]);
    const d = agreement?.data || {};
    return { available: true, eligible: !!user && !user.disabledAt && user.profile?.data?.ageGroup === 'adult' && !user.profile.data.managedByParent,
      terms: TERMS, revision: agreement?.revision || 0, enabled: d.enabled === true,
      pack: d.pack || 'pocket', threshold: d.threshold || 50, monthlyCents: d.monthlyCents || 1000,
      pauseReason: d.pauseReason || null, currency: 'usd', packs: POINT_PACKS_V2,
      attempts: attempts.map(a => ({ id: a.id, amount: a.amount, points: a.points, currency: a.currency, status: a.status, createdAt: a.createdAt })) };
  };
  app.get('/api/wallet/recharge', requireAuth, route(req => status(req.auth.userId)));
  app.post('/api/wallet/recharge/setup', requireAuth, route(req => lock(prisma, req.auth.userId, async tx => {
    const userId = req.auth.userId, user = await adult(tx, userId), c = configuration(req.body);
    const old = await tx.rechargeAgreement.findUnique({ where: { userId } });
    if ((old?.revision || 0) !== req.body.revision) throw fail('Your recharge settings changed. Refresh first.', 409);
    const linked = await tx.stripeCustomer.findUnique({ where: { userId } });
    const nonce = crypto.randomUUID();
    const customer = linked ? await stripe.customers.retrieve(linked.stripeCustomerId) :
      await stripe.customers.create({ metadata: { userId }, ...(userId.includes('@') ? { email: userId } : {}) },
        { idempotencyKey: `rq_recharge_customer_${crypto.createHash('sha256').update(userId + user.createdAt.toISOString()).digest('hex')}` });
    if (customer.deleted) throw fail('Your saved payment profile needs to be updated. Contact support.', 409);
    if (!linked) await tx.stripeCustomer.create({ data: { userId, stripeCustomerId: customer.id } });
    const intent = await stripe.setupIntents.create({ customer: customer.id, usage: 'off_session',
      allowed_payment_method_types: ['card'], metadata: { type: 'rp_recharge', nonce } }, { idempotencyKey: `rq_recharge_setup_${nonce}` });
    const data = { ...c, enabled: false, cancelPending: true, customerId: customer.id,
      setupId: intent.id, setupNonce: nonce, setupAt: new Date().toISOString() };
    const a = await tx.rechargeAgreement.upsert({ where: { userId }, create: { userId, data }, update: { data, revision: { increment: 1 } } });
    return { setupIntentClientSecret: intent.client_secret, setupId: intent.id, revision: a.revision, publishableKey };
  })));
  app.post('/api/wallet/recharge/activate', requireAuth, route(req => lock(prisma, req.auth.userId, async tx => {
    const userId = req.auth.userId;
    await adult(tx, userId);
    const a = await tx.rechargeAgreement.findUnique({ where: { userId } });
    if (!a || a.revision !== req.body.revision || a.data.setupId !== req.body.setupId)
      throw fail('Your recharge setup changed. Reopen it first.', 409);
    if (a.data.enabled) return { enabled: true, revision: a.revision };
    if (Date.now() - Date.parse(a.data.setupAt) > 3600000 || req.body.confirmed !== true || req.body.terms !== TERMS)
      throw fail('Review and authorise recharge again.');
    const si = await stripe.setupIntents.retrieve(a.data.setupId);
    if (si.status !== 'succeeded' || objectId(si.customer) !== a.data.customerId ||
        si.metadata?.nonce !== a.data.setupNonce || si.metadata?.type !== 'rp_recharge')
      throw fail('Finish saving your card before enabling recharge.', 409);
    const payment = await stripe.paymentMethods.retrieve(objectId(si.payment_method));
    if (payment.type !== 'card' || objectId(payment.customer) !== a.data.customerId) throw fail('Choose your own saved card.', 403);
    // Completed consent is durable; general preferences cannot create or amend it.
    const data = { ...a.data, enabled: true, cancelPending: false, pauseReason: null,
      paymentMethod: payment.id, consentAt: new Date().toISOString() };
    await tx.rechargeConsent.create({ data: { userId, revision: a.revision, data } });
    await tx.rechargeAgreement.update({ where: { userId }, data: { data } });
    return { enabled: true, revision: a.revision };
  })));
  app.post('/api/wallet/recharge/disable', requireAuth, route(async req => {
    await lock(prisma, req.auth.userId, tx => pause(tx, req.auth.userId, 'user_disabled', true));
    return { enabled: false };
  }));
  app.post('/api/wallet/recharge/recover', requireAuth, route(req => lock(prisma, req.auth.userId, async tx => {
    const userId = req.auth.userId;
    await adult(tx, userId);
    const row = await tx.rechargeAttempt.findFirst({ where: { id: String(req.body.id || ''), userId, status: 'requires_action' } });
    const a = await tx.rechargeAgreement.findUnique({ where: { userId } });
    if (!row || !a || a.data.cancelPending || a.data.pauseReason !== 'bank_confirmation' ||
        a.revision !== row.agreementRevision + 1 || row.period !== period(new Date())) throw fail('This payment can no longer be confirmed. Refresh your wallet.', 409);
    const pi = await stripe.paymentIntents.retrieve(row.stripeId);
    matchReceipt(row, pi);
    await settleIn(tx, row, pi);
    return pi.status === 'requires_action' ? { paymentIntentClientSecret: pi.client_secret, publishableKey } : { status: pi.status };
  })));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const attempts = await prisma.rechargeAttempt.findMany({ where: { status: { in: PENDING } }, orderBy: { updatedAt: 'asc' }, take: 100 });
      for (const row of attempts) try { await processAttempt(prisma, stripe, row.id); }
      catch (e) { log.error('recharge_attempt_retry', { attempt: row.id, code: e.code || 'UNKNOWN' }); }
      const agreements = await prisma.rechargeAgreement.findMany({ where: { data: { path: ['enabled'], equals: true } }, orderBy: { userId: 'asc' } });
      for (const a of agreements) try { const row = await reserve(prisma, a.userId); if (row) await processAttempt(prisma, stripe, row.id); }
      catch (e) { log.error('recharge_account_retry', { code: e.code || 'UNKNOWN' }); }
    } catch (e) { log.error('recharge_worker_retry', { code: e.code || 'UNKNOWN' }); }
    finally { running = false; }
  };
  const timer = schedule(tick, 60000); timer?.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
module.exports = { TERMS, PENDING, configuration, canReserve, reserve, processAttempt, settle, refund, registerRecharge };
