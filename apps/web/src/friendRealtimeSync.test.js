import assert from "node:assert/strict";
import test from "node:test";
import {
  FRIEND_REALTIME_SYNC_INTERVAL_MS,
  friendRealtimeSyncDecision,
  shouldSkipFriendRealtimeSync
} from "./friendRealtimeSync.js";

test("friend realtime sync interval is 5 seconds", () => {
  assert.equal(FRIEND_REALTIME_SYNC_INTERVAL_MS, 5000);
});

test("friend realtime sync skips when websocket is connected", () => {
  assert.equal(shouldSkipFriendRealtimeSync({ useMock: false, data: {}, ws: {}, visibilityState: "visible" }), true);
});

test("friend realtime sync skips when page is hidden", () => {
  assert.equal(shouldSkipFriendRealtimeSync({ useMock: false, data: {}, ws: null, visibilityState: "hidden" }), true);
});

test("friend realtime sync runs only when data is present and ws is disconnected", () => {
  assert.equal(shouldSkipFriendRealtimeSync({ useMock: false, data: {}, ws: null, visibilityState: "visible" }), false);
  assert.equal(shouldSkipFriendRealtimeSync({ useMock: true, data: {}, ws: null, visibilityState: "visible" }), true);
  assert.equal(shouldSkipFriendRealtimeSync({ useMock: false, data: null, ws: null, visibilityState: "visible" }), true);
});

test("friend realtime sync renders when toast is produced", () => {
  const pending = { id: "fr-1", direction: "incoming", status: "pending", user: { nickname: "发送方" } };
  const decision = friendRealtimeSyncDecision({
    previousRequests: [],
    nextRequests: [pending],
    previousState: { requests: [], contacts: [], conversations: [] },
    nextState: { requests: [], contacts: [], conversations: [] }
  });
  assert.equal(decision.toastMessage, "收到来自 发送方 的好友申请");
  assert.equal(decision.shouldRender, true);
  assert.deepEqual(decision.nextSnapshot, [pending]);
});

test("friend realtime sync renders when state changes even without toast", () => {
  const decision = friendRealtimeSyncDecision({
    previousRequests: [],
    nextRequests: [],
    previousState: { requests: [], contacts: [], conversations: [] },
    nextState: { requests: [], contacts: [{ id: "u2" }], conversations: [] }
  });
  assert.equal(decision.toastMessage, "");
  assert.equal(decision.shouldRender, true);
});

test("friend realtime sync does not render when nothing changes", () => {
  const state = { requests: [], contacts: [], conversations: [] };
  const decision = friendRealtimeSyncDecision({
    previousRequests: [],
    nextRequests: [],
    previousState: state,
    nextState: { ...state }
  });
  assert.equal(decision.toastMessage, "");
  assert.equal(decision.shouldRender, false);
});

