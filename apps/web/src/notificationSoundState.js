export function shouldPlayUnreadSnapshotSound({ previousUnreadCount, nextUnreadCount } = {}) {
  const next = Math.max(0, Number(nextUnreadCount) || 0);
  if (next === 0) return false;
  const previous = Number(previousUnreadCount);
  // Loading an account with old unread data is not a new incoming message.
  // Only a later synchronization that grows an established unread count may alert.
  return Number.isFinite(previous) && next > previous;
}
