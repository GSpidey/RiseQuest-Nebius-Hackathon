// Account protections always apply. Apple information can narrow, never expand,
// access. Declined sharing and older OS versions retain the saved account policy.
function refreshCommunityAgeSignal(previous, result) {
  // Keep a confirmed, session-only restriction through transient provider errors.
  // An explicit new result (including declined sharing) replaces it. The keyed
  // account boundary owns this state; never persist or share it across accounts.
  if (result?.status === 'error' && previous?.status === 'shared') {
    return { ...previous, unavailable: true };
  }
  return result;
}
function communityAgeDecision(profile, signal) {
  if (!profile || profile.isGuest) return { allowed: false, reason: 'signin' };
  if (profile.ageGroup === 'child' || profile.ageBand === 'under13') return { allowed: false, reason: 'child' };
  if (!['adult', 'teen'].includes(profile.ageGroup)) return { allowed: false, reason: 'profile' };
  if (!signal) return { allowed: false, reason: 'pending' };
  if (signal.status === 'shared') {
    if (!Number.isInteger(signal.lowerBound) || signal.lowerBound < 13) return { allowed: false, reason: 'child' };
    if (signal.upperBound != null && (!Number.isInteger(signal.upperBound) || signal.upperBound < signal.lowerBound)) return { allowed: false, reason: 'retry' };
    return { allowed: true, communicationLimited: signal.communicationLimited === true,
      teen: signal.lowerBound < 18 || profile.ageGroup === 'teen',
      ...(signal.unavailable ? { unavailable: true } : {}) };
  }
  if (['unsupported', 'declined', 'not-ios'].includes(signal.status)) return {
    allowed: true, teen: profile.ageGroup === 'teen', communicationLimited: false,
  };
  // A failed optional OS check is not permission to shut down existing social
  // features. Retain the saved account rules and expose the specific limitation.
  return { allowed: true, teen: profile.ageGroup === 'teen', communicationLimited: false, unavailable: true };
}
module.exports = { communityAgeDecision, refreshCommunityAgeSignal };
