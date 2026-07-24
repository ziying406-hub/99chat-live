export function shouldPlayUnreadSnapshotSound({ previousUnreadCount, nextUnreadCount } = {}) {
  const next = Math.max(0, Number(nextUnreadCount) || 0);
  if (next === 0) return false;
  const previous = Number(previousUnreadCount);
  return !Number.isFinite(previous) || next > previous;
}
