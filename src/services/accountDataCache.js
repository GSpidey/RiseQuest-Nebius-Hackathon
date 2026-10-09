// Never adopt legacy unowned health records: the same device may have several
// accounts. Leave those records intact, but restore signed-in data from the API.
function accountDataKey(profile, name) {
  const owner = profile?.isGuest ? 'guest' : String(profile?.email || profile?.id || '').trim().toLowerCase();
  if (!owner) return null;
  return `risequest_data:${encodeURIComponent(owner)}:${encodeURIComponent(name)}`;
}

function createAccountDataCache(storage, profile) {
  return {
    async read(name, fallback) {
      const key = accountDataKey(profile, name);
      if (!key) return fallback;
      try {
        const value = await storage.getItem(key);
        return value == null ? fallback : JSON.parse(value);
      } catch { return fallback; }
    },
    async write(name, value) {
      const key = accountDataKey(profile, name);
      if (!key) throw new Error('Account identity is required to cache personal data');
      await storage.setItem(key, JSON.stringify(value));
    },
  };
}

module.exports = { accountDataKey, createAccountDataCache };
