import { friendRequestSyncUpdate } from "./friendRealtime.js";

export const FRIEND_REALTIME_SYNC_INTERVAL_MS = 5000;

export function shouldSkipFriendRealtimeSync({ useMock, data, ws, visibilityState } = {}) {
  if (useMock) return true;
  if (!data) return true;
  if (ws) return true;
  if (visibilityState === "hidden") return true;
  return false;
}

export function friendRealtimeSyncDecision({ previousRequests, nextRequests, previousState, nextState } = {}) {
  const toastMessage = friendRequestSyncUpdate(previousRequests, nextRequests);
  const didStateChange = JSON.stringify(previousState || {}) !== JSON.stringify(nextState || {});
  return {
    toastMessage,
    shouldRender: Boolean(toastMessage) || didStateChange,
    nextSnapshot: (nextRequests || []).map(request => ({ ...request }))
  };
}

