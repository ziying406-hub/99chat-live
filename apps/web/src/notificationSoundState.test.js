import test from "node:test";
import assert from "node:assert/strict";
import { shouldPlayUnreadSnapshotSound } from "./notificationSoundState.js";

test("initial unread snapshot stays silent", () => {
  assert.equal(shouldPlayUnreadSnapshotSound({ nextUnreadCount: 3 }), false);
});

test("a reconnect only requests sound when unread count increases", () => {
  assert.equal(shouldPlayUnreadSnapshotSound({ previousUnreadCount: 2, nextUnreadCount: 2 }), false);
  assert.equal(shouldPlayUnreadSnapshotSound({ previousUnreadCount: 2, nextUnreadCount: 3 }), true);
  assert.equal(shouldPlayUnreadSnapshotSound({ previousUnreadCount: 3, nextUnreadCount: 2 }), false);
});

test("empty unread snapshots stay silent", () => {
  assert.equal(shouldPlayUnreadSnapshotSound({ nextUnreadCount: 0 }), false);
});
