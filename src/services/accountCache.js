const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const keysForAccount = owner => {
  const id = normalize(owner);
  if (!id) return [];
  const encoded = encodeURIComponent(id);
  return [`risequest_profile:${encoded}`, `risequest_subscription:${encoded}`, `risequest_quests:${encoded}`,
    `risequest_chat:${encoded}`, `risequest_chat:${encoded}:personality`, `risequest_onboarded_email:${id}`,
    `risequest_data:${encoded}:sleepData`];
};

// Only explicitly identified account caches are removed. Alarms/settings and
// unrelated accounts on the shared device are intentionally retained.
async function clearAccountCaches(storage, owners) {
  const ids = new Set((owners || []).map(normalize).filter(Boolean));
  await storage.multiRemove([...new Set([...ids].flatMap(keysForAccount))]);
  const legacyQuests = await storage.getItem('risequest_quests');
  if (legacyQuests) {
    let rows;
    try { rows = JSON.parse(legacyQuests); } catch (_) { return; }
    if (Array.isArray(rows)) await storage.setItem('risequest_quests', JSON.stringify(rows.filter(row => !ids.has(normalize(row?.userId)))));
  }
}
module.exports = { keysForAccount, clearAccountCaches };
