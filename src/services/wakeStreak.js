// A wake-up streak counts local calendar days, not alarm dismissals.
const localDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
function nextWakeStreak(stats, now = new Date()) {
  const previous = stats.lastWakeUpAt ? new Date(stats.lastWakeUpAt) : null;
  const count = Math.max(0, Math.floor(Number(stats.streak) || 0));
  const gap = previous && Number.isFinite(previous.getTime()) ? localDay(now) - localDay(previous) : null;
  if (gap !== null && gap <= 0) return {streak: count, newDay: false};
  return {streak: gap === 1 ? count + 1 : 1, newDay: true};
}
module.exports = {nextWakeStreak};
