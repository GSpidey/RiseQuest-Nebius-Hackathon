// Uses the existing on-device list; no uploads or automatic outreach.
const BUDDY_STORAGE_KEY = 'wakeUpBuddies';
function dialablePhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '');
  return /^\+?\d{3,15}$/.test(phone) ? phone : null;
}
async function loadWakeBuddies(storage) {
  const raw = await storage.getItem(BUDDY_STORAGE_KEY);
  const items = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(items)) throw new Error('Your buddy list could not be loaded. Please retry.');
  return items.filter(item => item && item.id != null && String(item.name || '').trim() && dialablePhone(item.phone));
}
async function addWakeBuddy(storage, { name, phone }) {
  const cleanName = String(name || '').trim().slice(0, 80);
  const cleanPhone = dialablePhone(phone);
  if (!cleanName || !cleanPhone) throw new Error('Enter a name and a valid phone number, including country code if needed.');
  const raw = await storage.getItem(BUDDY_STORAGE_KEY);
  const items = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(items)) throw new Error('Your buddy list could not be loaded. Please retry.');
  const existing = items.find(item => dialablePhone(item?.phone) === cleanPhone);
  if (existing?.id != null) return existing;
  const buddy = { id: `buddy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, name: cleanName,
    phone: cleanPhone, type: 'buddy', addedAt: new Date().toISOString() };
  await storage.setItem(BUDDY_STORAGE_KEY, JSON.stringify([...items, buddy]));
  return buddy;
}
async function resolveAlarmBuddy(storage, alarm) {
  if (!alarm?.wakeBuddyId) return null;
  return (await loadWakeBuddies(storage)).find(item => String(item.id) === String(alarm.wakeBuddyId)) || null;
}
module.exports = { BUDDY_STORAGE_KEY, dialablePhone, loadWakeBuddies, addWakeBuddy, resolveAlarmBuddy };
