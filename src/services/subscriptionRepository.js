const keyFor = owner => `risequest_subscription:${encodeURIComponent(owner)}`;
const free = owner => ({ owner, tier: 'free', adFree: false, trialUsed: false, purchasedPacks: [], risePoints: 0, region: 'DEFAULT' });
function createSubscriptionRepository({ storage, identity, request, now = Date.now }) {
  async function get({ force = false } = {}) {
    const owner = await identity();
    if (!owner) return free(null);
    let cache;
    try { cache = JSON.parse(await storage.getItem(keyFor(owner))); } catch (_) {}
    if (cache?.owner !== owner) cache = null;
    if (!force && cache?.verifiedAt > now() - 30000) return cache;
    try {
      const result = await request('GET');
      if (await identity() !== owner) return free(await identity());
      const next = { ...free(owner), ...cache, ...result, owner, verifiedAt: now(),
        startDate: result.startDate ? new Date(result.startDate).getTime() : null,
        endDate: result.endDate ? new Date(result.endDate).getTime() : null };
      await storage.setItem(keyFor(owner), JSON.stringify(next));
      return next;
    } catch (error) {
      if (await identity() !== owner || [401, 403].includes(error.status)) return free(await identity());
      // Short, account-bound offline grace only; never migrate the old global
      // subscription cache because its ownership cannot be established.
      if (cache?.verifiedAt > now() - 86400000 && (!cache.endDate || cache.endDate > now())) return cache;
      return { ...free(owner), trialUsed: cache?.trialUsed || false };
    }
  }
  async function update(value) {
    const owner = await identity();
    if (!owner || value.owner !== owner) return;
    await storage.setItem(keyFor(owner), JSON.stringify(value));
  }
  async function startTrial() {
    const owner = await identity();
    if (!owner) throw new Error('Sign in to start your trial.');
    await request('POST');
    if (await identity() !== owner) throw new Error('Your account changed.');
    return get({ force: true });
  }
  return { get, update, startTrial };
}
module.exports = { createSubscriptionRepository, subscriptionCacheKey: keyFor };
