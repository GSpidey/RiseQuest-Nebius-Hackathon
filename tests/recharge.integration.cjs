const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const recharge = require('../backend/src/recharge');
const root = path.resolve(__dirname, '..');
let pg, socket, prisma, dir;

before(async () => {
  const { PGlite } = await import('../backend/node_modules/@electric-sql/pglite/dist/index.js');
  const { PGLiteSocketServer } = await import('../backend/node_modules/@electric-sql/pglite-socket/dist/index.js');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rq-recharge-test-'));
  const schema = process.env.RQ_BASELINE_SCHEMA || path.join(dir, 'baseline.prisma');
  if (!process.env.RQ_BASELINE_SCHEMA) fs.writeFileSync(schema, execFileSync('git', ['show', '33972346013f93807f13a06ed2f657e955d3cb00:backend/prisma/schema.prisma'], { cwd: root }));
  const sql = execFileSync(path.join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', schema, '--script'], { encoding: 'utf8', cwd: root });
  pg = await PGlite.create();
  await pg.exec(sql);
  await pg.exec(fs.readFileSync(path.join(root, 'backend/prisma/migrations/20261026230000_recharge_available/migration.sql'), 'utf8'));
  socket = new PGLiteSocketServer({ db: pg, port: 15433, host: '127.0.0.1' });
  await socket.start();
  // Deliberately ignore any inherited production database URL.
  prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@127.0.0.1:15433/postgres?connection_limit=1' } } });
  await prisma.$connect();
});
after(async () => {
  await prisma?.$disconnect();
  const fallback = setTimeout(() => process.exit(process.exitCode || 0), 3000); fallback.unref();
  await socket?.stop(); await pg?.close(); fs.rmSync(dir, { recursive: true, force: true });
});
let sequence = 0;
async function fixture(ageGroup = 'adult') {
  const userId = `recharge-${++sequence}@example.test`;
  await prisma.user.create({ data: { id: userId, profile: { create: { data: { ageGroup } } } } });
  const intents = new Map(), setups = new Map();
  let confirms = 0, bank = false, failNext = false;
  const customer = { id: `cus_${sequence}` };
  const stripe = {
    customers: { create: async () => customer, retrieve: async () => customer },
    setupIntents: { create: async data => { const x = { ...data, id: `seti_${sequence}_${setups.size}`, client_secret: 'synthetic_setup_secret', status: 'succeeded', payment_method: `pm_${sequence}` }; setups.set(x.id, x); return x; }, retrieve: async id => setups.get(id) },
    paymentMethods: { retrieve: async id => ({ id, type: 'card', customer: customer.id }) },
    paymentIntents: {
      create: async data => { const x = { ...data, id: `pi_${sequence}_${intents.size}`, status: 'requires_confirmation', client_secret: 'synthetic_payment_secret' }; intents.set(x.id, x); return x; },
      retrieve: async id => intents.get(id),
      confirm: async id => { confirms++; const x = intents.get(id); x.status = bank ? 'requires_action' : 'succeeded'; x.amount_received = bank ? 0 : x.amount; if (failNext) { failNext = false; throw Error('synthetic timeout after payment'); } return x; },
      cancel: async id => { const x = intents.get(id); x.status = 'canceled'; return x; },
    },
  };
  const routes = {}, schedules = [];
  const app = { get: (p, ...handlers) => { routes[`GET ${p}`] = handlers.at(-1); }, post: (p, ...handlers) => { routes[`POST ${p}`] = handlers.at(-1); } };
  const service = recharge.registerRecharge(app, { prisma, stripe, requireAuth: () => {}, publishableKey: 'pk_test_synthetic',
    schedule: (callback, delay) => { schedules.push({ callback, delay }); return { unref() {} }; }, log: { error() {} } });
  async function call(method, suffix = '', body = {}, owner = userId) {
    let status = 200, data;
    const res = { set() { return this; }, status(s) { status = s; return this; }, json(d) { data = d; } };
    await routes[`${method} /api/wallet/recharge${suffix}`]({ auth: { userId: owner }, body }, res);
    return { status, data };
  }
  async function enable() {
    const state = (await call('GET')).data;
    const setup = await call('POST', '/setup', { pack: 'pocket', threshold: 50, monthlyCents: 1000, terms: recharge.TERMS, confirmed: true, revision: state.revision });
    assert.equal(setup.status, 200);
    const activated = await call('POST', '/activate', { ...setup.data, terms: recharge.TERMS, confirmed: true });
    assert.equal(activated.status, 200);
    return setup.data;
  }
  return { userId, stripe, call, enable, intents, service, schedules, get confirms() { return confirms; }, set bank(value) { bank = value; }, set failNext(value) { failNext = value; } };
}

test('recharge is available and its worker runs with absent or false rollout flag; no consent never charges', async () => {
  for (const value of [undefined, 'false']) {
    if (value === undefined) delete process.env.RISEQUEST_DIRECT_RECHARGE_ENABLED;
    else process.env.RISEQUEST_DIRECT_RECHARGE_ENABLED = value;
    const f = await fixture();
    assert.equal((await f.call('GET')).data.available, true);
    assert.equal(f.schedules[0].delay, 60000);
    await f.service.tick();
    assert.equal(f.intents.size, 0);
    assert.equal((await f.call('GET')).data.enabled, false);
  }
});
test('explicit setup records consent; enabled worker creates then confirms and credits once', async () => {
  const f = await fixture(), setup = await f.enable();
  assert.equal(await prisma.rechargeConsent.count({ where: { userId: f.userId } }), 1);
  assert.equal((await f.call('POST', '/activate', { ...setup, terms: recharge.TERMS, confirmed: true })).status, 200);
  await f.service.tick(); assert.equal(f.confirms, 0);
  await f.service.tick(); assert.equal(f.confirms, 1);
  const pi = [...f.intents.values()][0];
  await recharge.settle(prisma, pi); await recharge.settle(prisma, pi);
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: f.userId } })).balance, 100);
  await f.service.tick(); assert.equal(f.confirms, 1);
});
test('user opt-out after reservation cancels unconfirmed intent without charging', async () => {
  const f = await fixture(); await f.enable(); await f.service.tick();
  assert.equal((await f.call('POST', '/disable')).status, 200);
  await f.service.tick(); assert.equal(f.confirms, 0);
  assert.equal([...f.intents.values()][0].status, 'canceled');
  assert.equal((await f.call('GET')).data.available, true);
});
test('bank authentication is owner-scoped; cancelling stops pending payment', async () => {
  const f = await fixture(); f.bank = true; await f.enable(); await f.service.tick(); await f.service.tick();
  const row = (await f.call('GET')).data.attempts[0];
  assert.equal(row.status, 'requires_action');
  assert.equal((await f.call('POST', '/recover', { id: row.id })).data.paymentIntentClientSecret, 'synthetic_payment_secret');
  const other = await fixture();
  assert.equal((await f.call('POST', '/recover', { id: row.id }, other.userId)).status, 409);
  await f.call('POST', '/disable'); await f.service.tick();
  assert.equal([...f.intents.values()][0].status, 'canceled');
});
test('upstream timeout after successful payment does not cause a second charge', async () => {
  const f = await fixture(); f.failNext = true; await f.enable(); await f.service.tick(); await f.service.tick(); await f.service.tick();
  assert.equal(f.confirms, 1);
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: f.userId } })).balance, 100);
});
test('refunds are monotonic and duplicate success cannot re-credit refunded RP', async () => {
  const f = await fixture(); await f.enable(); await f.service.tick(); await f.service.tick();
  const pi = [...f.intents.values()][0], charge = { ...pi, payment_intent: pi.id, amount_refunded: 100 };
  await recharge.refund(prisma, charge); await recharge.refund(prisma, charge);
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: f.userId } })).balance, 49);
  await recharge.refund(prisma, { ...charge, amount_refunded: 199 }); await recharge.settle(prisma, pi);
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: f.userId } })).balance, 0);
  assert.equal((await f.call('GET')).data.available, true);
});
test('refund before success prevents later net over-credit', async () => {
  const f = await fixture(); await f.enable(); await f.service.tick();
  const pi = [...f.intents.values()][0];
  await recharge.refund(prisma, { ...pi, payment_intent: pi.id, amount_refunded: 199 });
  await recharge.settle(prisma, { ...pi, status: 'succeeded', amount_received: 199 });
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: f.userId } })).balance, 0);
});
test('24-hour and monthly cash limits apply to pending and successful attempts', () => {
  const now = new Date('2026-10-26T10:00:00Z'), a = { data: { enabled: true, terms: recharge.TERMS, pack: 'pocket', amount: 199, points: 100, threshold: 50, paymentMethod: 'pm', monthlyCents: 300 } };
  assert.equal(recharge.canReserve(a, 0, [], now), true);
  assert.equal(recharge.canReserve(a, 50, [], now), false);
  assert.equal(recharge.canReserve(a, 0, [{ status: 'succeeded', amount: 199, period: '2026-10', createdAt: '2026-10-20T00:00:00Z' }], now), false);
  assert.equal(recharge.canReserve(a, 0, [{ status: 'reserved', period: '2026-09', createdAt: '2026-09-30T00:00:00Z' }], now), false);
  assert.equal(recharge.canReserve(a, 0, [{ status: 'succeeded', amount: 199, period: '2026-09', createdAt: '2026-10-26T00:00:00Z' }], now), false);
});
test('child account cannot authorise charges; false terms and injected pack rejected', async () => {
  const f = await fixture('child');
  assert.equal((await f.call('GET')).data.available, true);
  assert.equal((await f.call('POST', '/setup', { pack: 'pocket', threshold: 50, monthlyCents: 1000, revision: 0, confirmed: true, terms: recharge.TERMS })).status, 403);
  assert.throws(() => recharge.configuration({ pack: '__proto__' }));
  assert.throws(() => recharge.configuration({ pack: 'pocket', threshold: 50, monthlyCents: 1000, confirmed: false, terms: recharge.TERMS }));
});
test('new card consent invalidates older bank-authentication attempts without disabling the feature', async () => {
  const f = await fixture(); f.bank = true; await f.enable(); await f.service.tick(); await f.service.tick();
  const row = (await f.call('GET')).data.attempts[0], old = { ...[...f.intents.values()][0] };
  await f.enable();
  const before = (await f.call('GET')).data;
  await recharge.settle(prisma, old);
  assert.equal((await f.call('GET')).data.revision, before.revision);
  assert.equal((await f.call('POST', '/recover', { id: row.id })).status, 409);
  await f.service.tick(); assert.equal([...f.intents.values()][0].status, 'canceled');
});
