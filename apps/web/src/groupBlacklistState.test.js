import assert from "node:assert/strict";
import test from "node:test";

import { applyGroupBlacklistEvent, groupBlacklistEntrySummary } from "./groupBlacklistState.js";

const group = {
  id: "g1",
  members: [
    { userId: "u1", nickname: "群主", role: "owner" },
    { userId: "u2", nickname: "风险用户", role: "member" }
  ]
};

test("blacklist add event updates list and removes member", () => {
  const state = {
    groupBlacklists: { g1: [] },
    groups: [group]
  };

  const next = applyGroupBlacklistEvent(state, {
    groupId: "g1",
    user: { id: "u2", nickname: "风险用户" },
    reason: "刷屏",
    createdAt: "2026-07-06T00:00:00Z"
  });

  assert.equal(next.groupBlacklists.g1.length, 1);
  assert.equal(next.groups[0].members.some(member => member.userId === "u2"), false);
});

test("blacklist remove event removes entry only", () => {
  const state = {
    groupBlacklists: {
      g1: [{ groupId: "g1", user: { id: "u2", nickname: "风险用户" }, reason: "刷屏" }]
    },
    groups: [group]
  };

  const next = applyGroupBlacklistEvent(state, { groupId: "g1", removed: "u2" });

  assert.deepEqual(next.groupBlacklists.g1, []);
  assert.equal(next.groups[0].members.length, 2);
});

test("blacklist entry summary shows reason and time", () => {
  assert.equal(
    groupBlacklistEntrySummary(
      { reason: "刷屏", createdAt: "2026-07-06T12:30:00Z" },
      date => `时间:${date.toISOString()}`
    ),
    "刷屏 · 时间:2026-07-06T12:30:00.000Z"
  );
});
