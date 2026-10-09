// Only age and paid entitlement reach the ad policy. Wellness data must never
// become targeting data. Missing/ambiguous account state fails closed.
const { storeEntitlement, trialEntitlement, complimentaryEntitlement } = require('./storeCatalog');
function isAdFree(subscriptions, now = Date.now()) {
  return subscriptions.some(s => ['active', 'trialing', 'past_due', 'paused'].includes(s.status) ||
    (s.cancelAtPeriodEnd && new Date(s.currentPeriodEnd).getTime() > now));
}
function adPolicy(profile, subscriptions, now = Date.now(), child = null) {
  const adFree = isAdFree(subscriptions, now);
  const optionalInlineAds = profile?.data?.ageGroup === 'adult' && profile?.data?.ageBand === 'adult' &&
    profile?.data?.preferences?.optionalInlineAds === true && !child;
  if (adFree && !optionalInlineAds) return { eligible: false, adFree: true };
  if (!profile?.completedAt) return { eligible: false, adFree: false };
  const ageBand = profile.data?.ageBand;
  if (child) {
    if (child.consent?.status !== 'APPROVED' || child.consent?.withdrawnAt || !child.adsConsent) return { eligible: false, adFree: false };
    return { eligible: true, adFree: false, audience: 'minor', childDirected: true, underAgeOfConsent: true,
      personalized: false, maxAdContentRating: 'G', networks: ['google'], validUntil: new Date(now + 60000).toISOString() };
  }
  if (!['13to15', '16to17', 'adult'].includes(ageBand)) return { eligible: false, adFree: false };
  if (require('./agePolicy').requiresParent(ageBand, profile.data?.countryCode)) return { eligible: false, adFree: false };
  return { eligible: true, adFree, optionalInlineAds, audience: ageBand === 'adult' ? 'adult' : 'minor',
    childDirected: false, underAgeOfConsent: ageBand !== 'adult', personalized: false,
    maxAdContentRating: 'G', networks: ['google'], validUntil: new Date(now + 60000).toISOString() };
}
function registerAdPolicy(app, { prisma, requireAuth }) {
  app.get('/api/me/ad-policy', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const [profile, subscriptions] = await Promise.all([
        prisma.userProfile.findUnique({ where: { userId: req.auth.userId } }),
        prisma.subscription.findMany({ where: { userId: req.auth.userId } }),
      ]);
      const child = req.auth.provider === 'child'
        ? await prisma.childAccount.findUnique({ where: { childId: req.auth.userId }, include: { consent: true } }) : null;
      // A paid parent never causes ad requests on their managed profiles.
      const parentSubscriptions = child ? await prisma.subscription.findMany({ where: { userId: child.parentId } }) : [];
      const purchases = await prisma.storePurchase.findMany({ where: { userId: { in: [req.auth.userId, ...(child ? [child.parentId] : [])] }, kind: 'subscription' } });
      const storePaid = storeEntitlement(purchases).adFree ? [{ status: 'active' }] : [];
      const trialOwner = await prisma.user.findUnique({ where: { id: child?.parentId || req.auth.userId } });
      const trial = trialEntitlement(trialOwner).adFree ? [{ status: 'trialing' }] : [];
      const complimentary = complimentaryEntitlement(trialOwner)?.adFree ? [{ status: 'active' }] : [];
      res.json(adPolicy(profile, [...subscriptions, ...parentSubscriptions, ...storePaid, ...trial, ...complimentary], Date.now(), child));
    } catch (_) { res.status(503).json({ eligible: false, error: 'Account eligibility unavailable' }); }
  });
}
module.exports = { isAdFree, adPolicy, registerAdPolicy };
