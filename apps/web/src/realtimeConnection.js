export function shouldRefreshRealtimeSnapshotOnOpen({ previousConnection } = {}) {
  return Boolean(previousConnection);
}

export function shouldReconnectRealtimeHeartbeat({ lastHeartbeatAt, now, timeoutMs = 45000 } = {}) {
  return Number.isFinite(lastHeartbeatAt) && Number.isFinite(now) && now - lastHeartbeatAt > timeoutMs;
}
