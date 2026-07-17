import assert from "node:assert/strict";
import test from "node:test";

import { ALL_MEMBERS_MENTION_ID, groupAllMentionCandidate, groupAllMentionIds } from "./groupMentionAll.js";

test("only group managers receive the all-members mention candidate", () => {
  assert.equal(groupAllMentionCandidate(false), null);
  assert.deepEqual(groupAllMentionCandidate(true), {
    id: ALL_MEMBERS_MENTION_ID,
    nickname: "所有人",
    avatar: "",
    subtitle: "通知群内全部成员",
    isAllMembers: true
  });
});

test("all-members mentions target every other group member once", () => {
  assert.deepEqual(groupAllMentionIds({
    members: [
      { userId: "owner" },
      { userId: "member-a" },
      { userId: "member-b" },
      { userId: "member-a" }
    ]
  }, "owner"), ["member-a", "member-b"]);
});
