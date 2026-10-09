// Only explicit natural breaks may show an already-loaded ad. Never wait for an
// ad at navigation time, and never show later from a load callback.
const TRIGGERS = ['standalone_game_complete', 'cosmetics_browse_done'];
function permitted(state, policy, now) {
  return !!(state.account && !state.guest && !state.premium && !state.blocked && state.foreground &&
    state.ageBand === 'adult' && policy?.eligible === true && policy.adFree === false &&
    policy.audience === 'adult' && policy.childDirected === false && policy.underAgeOfConsent === false &&
    policy.networks?.length === 1 && policy.networks[0] === 'google' &&
    new Date(policy.validUntil).getTime() > now && !(state.nextAlarmAt <= now + 120000));
}
function createTransitionAds({ state, storage, policyRequest, sdkLoader, unitId, now = Date.now }) {
  let generation = 0, ready = null, history = null, policy = null, flow = null, owner = null, failed = false;
  const key = account => `risequest_interstitial_caps:${encodeURIComponent(account)}`;
  function cancel() { generation++; ready?.ad.removeAllListeners(); ready = null; flow = null; }
  async function prepare(trigger) {
    cancel();
    if (!TRIGGERS.includes(trigger)) return;
    const current = state();
    if (failed || !current.account || current.guest || current.premium || current.ageBand !== 'adult' || current.blocked || !current.foreground) return;
    const ticket = generation; owner = current.account; flow = trigger;
    const live = () => ticket === generation && state().account === owner && permitted(state(), policy, now());
    try {
      const raw = await storage.getItem(key(owner));
      if (ticket !== generation) return;
      history = raw ? JSON.parse(raw) : { attempts: 0, shown: [] };
      if (!Number.isInteger(history.attempts) || history.attempts < 0 || !Array.isArray(history.shown) || history.shown.some(t => !Number.isFinite(t) || t > now())) return;
      history.shown = history.shown.filter(t => t > now() - 86400000);
      if (history.shown.length >= 2 || history.shown.some(t => now() - t < 600000)) return;
      const nextPolicy = await policyRequest();
      if (ticket !== generation) return;
      policy = nextPolicy;
      if (!live()) return;
      const sdk = sdkLoader();
      await sdk.default().setRequestConfiguration({ maxAdContentRating: sdk.MaxAdContentRating.G, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false });
      if (!live()) return;
      const consent = await sdk.AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: false });
      if (!live() || !consent.canRequestAds) return;
      await sdk.default().initialize();
      if (!live()) return;
      const id = unitId(sdk);
      if (!id) return;
      const ad = sdk.InterstitialAd.createForAdRequest(id, { requestNonPersonalizedAdsOnly: true });
      ready = { ad, loaded: false };
      ad.addAdEventListener(sdk.AdEventType.LOADED, () => { if (live() && ready?.ad === ad) ready.loaded = true; });
      ad.addAdEventListener(sdk.AdEventType.ERROR, cancel);
      ad.addAdEventListener(sdk.AdEventType.CLOSED, cancel);
      ad.load();
    } catch (_) { cancel(); }
  }
  function trigger(value) {
    if (value !== flow || !TRIGGERS.includes(value) || !ready?.loaded || failed || state().account !== owner || !permitted(state(), policy, now())) return false;
    history.shown = history.shown.filter(t => t > now() - 86400000);
    if (history.shown.length >= 2 || history.shown.some(t => now() - t < 600000)) return false;
    history.attempts++;
    const show = history.attempts % 3 === 0;
    if (show) history.shown.push(now()); // Reserve conservatively, including failed presentations.
    storage.setItem(key(owner), JSON.stringify(history)).catch(() => { failed = true; cancel(); });
    if (!show) { cancel(); return false; }
    const ad = ready.ad;
    ready.loaded = false;
    // Synchronously initiate only at the owner's approved transition. No timer,
    // retry, load-callback show, or wait that blocks navigation.
    try { Promise.resolve(ad.show()).catch(cancel); } catch (_) { cancel(); return false; }
    return true;
  }
  return { prepare, trigger, cancel };
}
module.exports = { createTransitionAds, permitted, TRIGGERS };
