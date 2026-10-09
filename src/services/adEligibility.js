const PLACEMENTS = Object.freeze(['more_banner', 'discover_native']);
function canRequestAds({ policy, account, guest, localPremium, optionalInlineAds = false, placement, now = Date.now() }) {
  const paidOptIn = optionalInlineAds === true && policy?.optionalInlineAds === true && policy?.audience === 'adult';
  return Boolean(account && !guest && (!localPremium || paidOptIn) && PLACEMENTS.includes(placement) &&
    policy?.eligible === true && (policy.adFree === false || paidOptIn) &&
    ['adult', 'minor'].includes(policy.audience) &&
    policy.networks?.length === 1 && policy.networks[0] === 'google' &&
    new Date(policy.validUntil).getTime() > now);
}
// Intentionally no spread of profile/context: never forward private fields.
function adRequestOptions() { return { requestNonPersonalizedAdsOnly: true }; }
module.exports = { canRequestAds, adRequestOptions, PLACEMENTS };
