import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldKeepRealtimeSnapshotAtBottom,
  shouldReconnectRealtimeHeartbeat,
  shouldRefreshRealtimeSnapshotOnOpen
} from "./realtimeConnection.js";

test("a reconnected socket refreshes the realtime snapshot", () => {
  assert.equal(shouldRefreshRealtimeSnapshotOnOpen({ previousConnection: true }), true);
  assert.equal(shouldRefreshRealtimeSnapshotOnOpen({ previousConnection: false }), false);
});

test("a realtime snapshot only follows new messages when the reader was already at the bottom", () => {
  assert.equal(shouldKeepRealtimeSnapshotAtBottom({ wasAtBottom: true }), true);
  assert.equal(shouldKeepRealtimeSnapshotAtBottom({ wasAtBottom: false }), false);
});

test("a stale heartbeat forces the realtime socket to reconnect", () => {
  assert.equal(shouldReconnectRealtimeHeartbeat({ lastHeartbeatAt: 1000, now: 47001 }), true);
  assert.equal(shouldReconnectRealtimeHeartbeat({ lastHeartbeatAt: 1000, now: 46000 }), false);
});
