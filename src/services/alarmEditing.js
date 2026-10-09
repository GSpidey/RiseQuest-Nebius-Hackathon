function challengeDifficulty(alarm) {
  return ['easy', 'medium', 'hard'].includes(alarm?.challengeDifficulty)
    ? alarm.challengeDifficulty : 'medium';
}

function prepareAlarmSave(alarms, changes, editingId, newIdentity) {
  const existing = editingId == null ? null : alarms.find(a => String(a.id) === String(editingId));
  if (editingId != null && !existing) throw new Error('This alarm no longer exists. Reopen the alarm list.');
  const alarm = {
    ...existing, ...changes,
    ...(existing ? { id: existing.id, notificationId: existing.notificationId, createdAt: existing.createdAt } : newIdentity),
    challengeDifficulty: challengeDifficulty(changes),
    updatedAt: Date.now(),
  };
  return { alarm, existing, alarms: existing
    ? alarms.map(a => String(a.id) === String(editingId) ? alarm : a)
    : [...alarms, alarm] };
}

async function persistAlarmEdit(result, { persist, cancel, schedule }) {
  // A storage failure leaves the old schedule intact. Reuse the notification ID
  // so changing the time never leaves a second pending alarm behind.
  await persist(result.alarms);
  if (result.existing) await cancel(result.existing);
  if (result.alarm.isEnabled !== false) await schedule(result.alarm);
}

module.exports = { challengeDifficulty, prepareAlarmSave, persistAlarmEdit };
