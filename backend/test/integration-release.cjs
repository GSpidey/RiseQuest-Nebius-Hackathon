const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const secret = process.env.AUTH_JWT_SECRET;
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL.includes('risequest-release-validation-postgres')) throw Error('Only the isolated disposable database is allowed.');
const mail = [];
const email = require('../src/services/email');
email.getSmtpConfigFromEnv = () => ({ ok: true, from: 'test@example.invalid' });
email.getTransporter = () => ({ sendMail: async message => { mail.push(message); } });
const { registerFamilyRoutes, NOTICE_VERSION } = require('../src/family');
const { authentication } = require('../src/security');
const { registerProfileRoutes } = require('../src/profilePolicy');
const { registerStoreBilling, applyPurchase } = require('../src/storeBilling');
const { registerAdPolicy } = require('../src/adPolicy');
const { requestDeletion, completeDeletion } = require('../src/accountDeletion');
const requireAuth = authentication(prisma, secret);
const requireRole = () => (req, res, next) => req.auth.role === 'ADMIN' ? next() : res.sendStatus(403);
const app = express(); app.use(express.json());
registerFamilyRoutes(app, { prisma, requireAuth, requireAdmin: requireAuth, requireRole, secret });
registerProfileRoutes(app, { prisma, requireAuth }); registerStoreBilling(app, { prisma, requireAuth, secret }); registerAdPolicy(app, { prisma, requireAuth });
app.get('/session', requireAuth, (_req, res) => res.json({ ok: true }));
let server, base;
const token = (sub, provider = 'password') => jwt.sign({ sub, provider }, secret, { expiresIn: '1h' });
async function req(method, route, auth, body) {
  const form = body instanceof FormData;
  const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${auth}`,
    ...(!form ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => ({}));
  return { status: response.status, result };
}
async function main() {
  for (const [id, role] of [['parent@example.invalid', 'ADMIN'], ['other@example.invalid', 'USER'], ['reviewer@example.invalid', 'ADMIN']]) {
    await prisma.user.create({ data: { id, role, authProvider: 'password', profile: { create: { completedAt: new Date(),
      data: { ageGroup: 'adult', ageBand: 'adult', preferences: { analyticsOptIn: false } } } } } });
  }
  server = app.listen(0, '0.0.0.0'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const parent = token('parent@example.invalid'), other = token('other@example.invalid'), admin = token('reviewer@example.invalid');
  let response = await req('POST', '/api/family/consents', parent, { noticeVersion: NOTICE_VERSION });
  assert.equal(response.status, 201); const consentId = response.result.consent.id;
  assert.equal(mail.length, 1); assert.equal(mail[0].to, 'parent@example.invalid');
  const code = /Verification code: ([a-f0-9]+)/.exec(mail[0].text)[1];
  assert.equal((await req('POST', `/api/family/consents/${consentId}/verify-email`, other, { code })).status, 404);
  assert.equal((await req('POST', `/api/family/consents/${consentId}/verify-email`, parent, { code })).status, 200);
  assert.equal((await req('POST', `/api/family/consents/${consentId}/verify-email`, parent, { code })).status, 400);
  assert.equal((await req('POST', '/api/family/children', parent, { consentId, nickname: 'Synthetic child' })).status, 403);
  const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const form = new FormData(); form.append('file', new Blob([image], { type: 'image/jpeg' }), 'synthetic-test-only.jpg');
  assert.equal((await req('POST', `/api/family/consents/${consentId}/document`, parent, form)).status, 200);
  const pending = await prisma.familyConsent.findUnique({ where: { id: consentId } });
  assert.ok(pending.document); assert.equal(Buffer.from(pending.document).equals(image), false);
  const review = { approve: true, note: 'Automated synthetic fixture only, not a real parental approval.',
    checks: { signature: true, guardianDeclaration: true, emailMatches: true, referenceMatches: true, noticeMatches: true } };
  assert.equal((await req('POST', `/api/admin/family/consents/${consentId}/review`, parent, review)).status, 403);
  assert.equal((await req('POST', `/api/admin/family/consents/${consentId}/review`, admin, review)).status, 200);
  assert.equal((await prisma.familyConsent.findUnique({ where: { id: consentId } })).document, null);
  response = await req('POST', '/api/family/children', parent, { consentId, nickname: 'Synthetic child', profile: { ageBand: 'under13' } });
  assert.equal(response.status, 201); const childId = response.result.child.id;
  assert.equal((await req('GET', `/api/family/children/${childId}/records`, other)).status, 404);
  response = await req('POST', `/api/family/children/${childId}/session`, parent, {}); assert.equal(response.status, 200); const childToken = response.result.token;
  assert.equal((await req('GET', '/api/store/catalog', childToken)).status, 403);
  assert.equal((await req('GET', '/api/me/ad-policy', childToken)).result.eligible, false);
  assert.equal((await req('PUT', `/api/family/children/${childId}/advertising`, parent, { allowed: true })).status, 200);
  const ad = (await req('GET', '/api/me/ad-policy', childToken)).result;
  assert.deepEqual(ad.networks, ['google']); assert.equal(ad.childDirected, true); assert.equal(ad.personalized, false);
  console.log('PASS real PostgreSQL consent ownership, email-code replay, encrypted document, separate reviewer, child access and advertising choice');
  process.env.COMPLIMENTARY_PREMIUM_USER_IDS = 'parent@example.invalid';
  const granted = (await req('GET', '/api/store/entitlements', parent)).result;
  assert.equal(granted.source, 'complimentary'); assert.equal(granted.tier, 'family');
  assert.equal((await req('GET', '/api/me/ad-policy', childToken)).result.adFree, true);
  assert.equal((await req('GET', '/api/store/entitlements', other)).result.tier, 'free');
  assert.equal(await prisma.storePurchase.count(), 0);
  delete process.env.COMPLIMENTARY_PREMIUM_USER_IDS;
  assert.equal((await req('GET', '/api/store/entitlements', parent)).result.tier, 'free');
  console.log('PASS complimentary membership account isolation, child ad suppression, withdrawal and no fabricated payment records');
  const starts = await Promise.all(Array.from({ length: 4 }, () => req('POST', '/api/store/trial', parent, {})));
  assert.ok(starts.every(r => r.status === 200 && r.result.tier === 'trial'));
  assert.equal((await req('GET', '/api/me/ad-policy', childToken)).result.adFree, true);
  const user = await prisma.user.findUnique({ where: { id: 'parent@example.invalid' } });
  assert.ok(user.premiumTrialStartedAt);
  await req('POST', '/api/store/trial', parent, {});
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).premiumTrialStartedAt.getTime(), user.premiumTrialStartedAt.getTime());
  const purchase = { id: 'google:synthetic', store: 'google', productId: 'risequest.points.small', originalId: 'synthetic', kind: 'points', status: 'active', environment: 'Sandbox', expiresAt: null, observedAt: new Date(), points: 250 };
  await Promise.all(Array.from({ length: 8 }, () => applyPurchase(prisma, user.id, purchase)));
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: user.id } })).balance, 250);
  assert.equal(await prisma.risePointsTransaction.count({ where: { userId: user.id } }), 1);
  await applyPurchase(prisma, user.id, { ...purchase, status: 'revoked', observedAt: new Date() });
  await applyPurchase(prisma, user.id, purchase);
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: user.id } })).balance, 0);
  console.log('PASS concurrent wallet grants, refund replay, once-only server trial, Premium parent child ad suppression');
  const { reconcileBatch } = require('../src/storeReconciliation');
  await prisma.storeAccount.create({ data: { userId: user.id } });
  process.env.STORE_SANDBOX_USER_IDS = user.id;
  const period = { id: 'apple:period1', store: 'apple', productId: 'risequest.premium.monthly',
    originalId: 'synthetic-chain', kind: 'subscription', status: 'active', environment: 'Sandbox',
    expiresAt: new Date(Date.now() + 86400000), purchasedAt: new Date(Date.now() - 10000), observedAt: new Date(Date.now() - 10000), points: 0 };
  await applyPurchase(prisma, user.id, period);
  const renewal = { ...period, id: 'apple:period2', purchasedAt: new Date(), observedAt: new Date(), expiresAt: new Date(Date.now() + 2 * 86400000) };
  const checkedAt = new Date();
  const report = await reconcileBatch(prisma, secret, { stores: ['apple'], now: checkedAt, refresh: async () => [renewal] });
  assert.deepEqual(report, { checked: 1, updated: 1, failed: 0 });
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: period.id } })).lastReconciledAt.getTime(), checkedAt.getTime());
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: period.id } })).status, 'expired');
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: renewal.id } })).status, 'active');
  await applyPurchase(prisma, user.id, { ...period, observedAt: new Date(Date.now() + 500) }); // Freshly signed old period is not a new renewal.
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: period.id } })).status, 'expired');
  await applyPurchase(prisma, user.id, { ...period, status: 'revoked', observedAt: new Date(Date.now() + 1000) });
  await applyPurchase(prisma, user.id, renewal);
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: renewal.id } })).status, 'active');
  const outage = await reconcileBatch(prisma, secret, { stores: ['apple'], refresh: async () => { throw Error('Synthetic provider outage'); } });
  assert.deepEqual(outage, { checked: 1, updated: 0, failed: 1 });
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: renewal.id } })).status, 'active');
  delete process.env.STORE_SANDBOX_USER_IDS;
  console.log('PASS real PostgreSQL reconciliation queue, renewal supersession, delayed notification, old-period refund and provider-outage preservation');
  const { generateWakeup } = require('../src/services/wakeupMessage');
  process.env.OPENAI_API_KEY = 'synthetic-not-a-provider-key';
  await prisma.risePointsBalance.update({ where: { userId: user.id }, data: { balance: 100 } });
  const fakeProvider = async url => ({ ok: true, json: async () => url.endsWith('/moderations')
    ? { results: [{ flagged: false }] } : { choices: [{ message: { content: 'A synthetic safe wake-up message.' } }] } });
  const wakeups = await Promise.all(Array.from({ length: 4 }, () => generateWakeup({ prisma, userId: user.id,
    input: { label: 'Synthetic routine' }, key: 'concurrent_fixture', request: fakeProvider })));
  assert.ok(wakeups.every(result => result.message === wakeups[0].message && result.balance === 75));
  assert.equal((await prisma.risePointsBalance.findUnique({ where: { userId: user.id } })).balance, 75);
  assert.equal(await prisma.risePointsTransaction.count({ where: { userId: user.id, reason: 'ai_wakeup_message:motivational' } }), 1);
  delete process.env.OPENAI_API_KEY;
  console.log('PASS concurrent AI wake-up retry charges once and returns the same saved response');
  assert.equal((await req('POST', `/api/family/consents/${consentId}/withdraw`, parent, {})).status, 200);
  assert.equal(await prisma.user.findUnique({ where: { id: childId } }), null);
  assert.equal((await req('GET', '/session', childToken)).status, 401);
  const deletion = await requestDeletion(prisma, user.id, secret);
  assert.equal((await req('GET', '/session', parent)).status, 403);
  await completeDeletion(deletion, { prisma, secret, uploadsDir: '/app/uploads', stripe: { subscriptions: { cancel: () => { throw Error('Unexpected external call'); } } } });
  assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null);
  assert.equal((await prisma.storePurchase.findUnique({ where: { id: purchase.id } })).userId, null);
  assert.equal((await prisma.accountDeletion.findUnique({ where: { id: deletion.id } })).status, 'COMPLETE');
  assert.equal((await req('GET', '/session', parent)).status, 401);
  console.log('PASS consent withdrawal, existing-session rejection, queued account deletion and de-identified receipt preservation');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
