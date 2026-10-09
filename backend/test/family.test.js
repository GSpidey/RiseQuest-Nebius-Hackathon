const jwt = require('jsonwebtoken');
const { sealDocument, openDocument, childPreferences, consentSummary } = require('../src/family');
const { authentication } = require('../src/security');
const { adPolicy } = require('../src/adPolicy');
const secret = 'family-unit-test-only-secret';

test('child ads need both approved parent consent and separate optional ad consent', () => {
  const profile = { completedAt: new Date(), data: { ageBand: 'under13' } };
  expect(adPolicy(profile, []).eligible).toBe(false);
  for (const child of [
    { adsConsent: false, consent: { status: 'APPROVED' } },
    { adsConsent: true, consent: { status: 'PENDING_REVIEW' } },
    { adsConsent: true, consent: { status: 'APPROVED', withdrawnAt: new Date() } },
  ]) expect(adPolicy(profile, [], Date.now(), child).eligible).toBe(false);
  const child = { adsConsent: true, consent: { status: 'APPROVED' } };
  expect(adPolicy(profile, [], Date.now(), child)).toMatchObject({ eligible: true, childDirected: true,
    underAgeOfConsent: true, personalized: false, networks: ['google'], maxAdContentRating: 'G' });
  expect(adPolicy(profile, [{ status: 'active' }], Date.now(), child)).toEqual({ eligible: false, adFree: true });
});
test('signed documents are encrypted, authenticated and bound to one request', () => {
  const bytes = Buffer.from('synthetic signed notice'), encrypted = sealDocument(bytes, secret, 'one');
  expect(encrypted.includes(bytes)).toBe(false);
  expect(openDocument(encrypted, secret, 'one')).toEqual(bytes);
  expect(() => openDocument(encrypted, secret, 'two')).toThrow();
  expect(() => openDocument(encrypted, 'other-key', 'one')).toThrow();
  encrypted[encrypted.length - 1] ^= 1;
  expect(() => openDocument(encrypted, secret, 'one')).toThrow();
});
test('child preferences omit conditions, identifiers, free text and ad targeting', () => {
  const profile = childPreferences({ email: 'private', role: 'SUPERADMIN', ageBand: 'adult',
    supportEnabled: true, supportConditions: ['adhd'], preferences: { analyticsOptIn: true, communityOptIn: true, goals: ['focus', 'a private school name'] } });
  expect(profile.ageGroup).toBe('child'); expect(profile.email).toBeUndefined(); expect(profile.role).toBeUndefined();
  expect(profile.supportConditions).toEqual([]); expect(profile.preferences.goals).toEqual(['focus']);
  expect(profile.preferences.analyticsOptIn).toBe(false); expect(profile.preferences.communityOptIn).toBe(false);
});
test('consent summaries never expose verification codes or signed documents', () => {
  const summary = consentSummary({ id: 'c', status: 'PENDING_REVIEW', document: Buffer.from('private'), emailTokenHash: 'private', emailVerifiedAt: new Date(), documentHash: 'hash' });
  expect(summary.document).toBeUndefined(); expect(summary.emailTokenHash).toBeUndefined();
});
function fixture(status = 'APPROVED', withdrawnAt = null, parentDisabled = null) {
  const prisma = { user: { findUnique: async () => ({ id: 'child:test', role: 'USER', authProvider: 'child' }) },
    childAccount: { findUnique: async () => ({ consentId: 'consent', consent: { status, withdrawnAt }, parent: { disabledAt: parentDisabled } }) } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }, next = jest.fn();
  const token = jwt.sign({ sub: 'child:test', provider: 'child', consentId: 'consent' }, secret, { expiresIn: '1h' });
  return { prisma, res, next, req: { path: '/api/quests', method: 'POST', headers: { authorization: `Bearer ${token}` } } };
}
test.each(['AWAITING_EMAIL', 'AWAITING_DOCUMENT', 'PENDING_REVIEW', 'DENIED', 'WITHDRAWN'])('child session rejected for %s consent', async status => {
  const f = fixture(status); await authentication(f.prisma, secret)(f.req, f.res, f.next);
  expect(f.res.status).toHaveBeenCalledWith(403); expect(f.next).not.toHaveBeenCalled();
});
test('approved child can use quests but not purchases, identity changes or community', async () => {
  const good = fixture(); await authentication(good.prisma, secret)(good.req, good.res, good.next); expect(good.next).toHaveBeenCalled();
  for (const path of ['/api/create-payment-intent', '/api/family', '/api/community/posts', '/api/me', '/api/me/preferences']) {
    const f = fixture(); f.req.path = path; await authentication(f.prisma, secret)(f.req, f.res, f.next);
    expect(f.res.status).toHaveBeenCalledWith(403); expect(f.next).not.toHaveBeenCalled();
  }
});
test.each([[new Date(), null], [null, new Date()]])('revocation or disabled parent invalidates an already issued child session', async (withdrawnAt, disabled) => {
  const f = fixture('APPROVED', withdrawnAt, disabled); await authentication(f.prisma, secret)(f.req, f.res, f.next);
  expect(f.res.status).toHaveBeenCalledWith(403);
});
