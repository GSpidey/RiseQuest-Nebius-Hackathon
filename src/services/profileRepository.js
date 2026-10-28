// Dependency-injected so account isolation/offline recovery can be tested
// without a native runtime. The legacy key is only an active-session mirror.
const normalize = value => String(value || '').trim().toLowerCase();
const keyFor = owner => `risequest_profile:${encodeURIComponent(normalize(owner))}`;
const parse = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
function createProfileRepository({ storage, request, identity }) {
  const matches = (profile, owner) => profile && !profile.isGuest && normalize(profile.email) === normalize(owner);
  async function cache(profile, owner) {
    if (!matches(profile, owner)) throw new Error('Profile owner does not match this account');
    await storage.setItem(keyFor(owner), JSON.stringify(profile));
    // A response from a previous session must not overwrite the next account.
    if (normalize(await identity()) === normalize(owner)) await storage.setItem('user_profile', JSON.stringify(profile));
    return profile;
  }
  async function local(owner) {
    const scoped = parse(await storage.getItem(keyFor(owner)));
    if (matches(scoped, owner)) return scoped;
    const legacy = parse(await storage.getItem('user_profile'));
    return matches(legacy, owner) ? legacy : null;
  }
  async function restore(account) {
    const owner = normalize(account.email || account.id);
    if (!owner || normalize(await identity()) !== owner) throw new Error('Sign in before restoring preferences');
    const cached = await local(owner);
    let result;
    try { result = await request('GET'); }
    catch (error) {
      if (cached && ![401, 403].includes(error.status)) return cache({ ...cached, syncPending: true }, owner);
      throw error;
    }
    const canonical = { id: owner, email: owner, displayName: account.displayName, phoneNumber: account.phoneNumber,
      photoUrl: account.photoUrl, bannerUrl: account.bannerUrl, authProvider: account.authProvider, isGuest: false };
    // Do not erase locally cached identity when the startup caller has only ID.
    Object.keys(canonical).forEach(k => canonical[k] === undefined && delete canonical[k]);
    if (result.profile) {
      const previousIdentity = cached ? Object.fromEntries(['displayName','phoneNumber','photoUrl','bannerUrl','authProvider'].map(k=>[k,cached[k]])) : {};
      return cache({ ...(result.profile.onboardingCompleted ? cached : previousIdentity), ...result.profile, ...canonical, syncPending: false }, owner);
    }
    const marker = await storage.getItem(`risequest_onboarded_email:${owner}`);
    if (cached && cached.ageGroup && marker === 'true' && !cached.version) {
      const migrated = await request('PUT', { version: 0, profile: cached, complete: true });
      return cache({ ...cached, ...migrated.profile, ...canonical, syncPending: false }, owner);
    }
    return cache({ ...cached, ...canonical, version: 0, onboardingCompleted: false, syncPending: false }, owner);
  }
  async function save(profile, { complete = false } = {}) {
    const owner = normalize(await identity());
    if (!owner || !matches(profile, owner)) throw new Error('Sign in to save this profile');
    const result = await request('PUT', { version: profile.version || 0, profile, complete });
    return cache({ ...profile, ...result.profile, syncPending: false }, owner);
  }
  return { restore, save, local, cache };
}
module.exports = { createProfileRepository, profileCacheKey: keyFor };
