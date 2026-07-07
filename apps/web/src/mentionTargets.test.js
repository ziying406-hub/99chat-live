import assert from "node:assert/strict";
import test from "node:test";

import { collectMentionIdsFromText, findMentionTargetById, findMentionTargetByName, mentionCandidatesFromGroup } from "./mentionTargets.js";

const group = {
  members: [
    { userId: "me", nickname: "我", role: "owner" },
    { userId: "u2", nickname: "测试账号2", role: "member" },
    { userId: "u3", nickname: "功能账号1", role: "member" }
  ]
};

const contacts = [
  { id: "u3", nickname: "功能账号1", chatId: "q765fz", remark: "好友备注" }
];

test("mention candidates include group members that are not contacts", () => {
  assert.deepEqual(
    mentionCandidatesFromGroup(group, contacts, "me").map(item => ({ id: item.id, nickname: item.nickname })),
    [
      { id: "u2", nickname: "测试账号2" },
      { id: "u3", nickname: "功能账号1" }
    ]
  );
});

test("mention lookup finds group members by nickname before sending", () => {
  assert.deepEqual(findMentionTargetByName("测试账号2", { group, contacts, currentUserId: "me" }), {
    id: "u2",
    nickname: "测试账号2",
    avatar: "",
    subtitle: "member"
  });
});

test("mention lookup finds group members by id for menu clicks", () => {
  assert.deepEqual(findMentionTargetById("u2", { group, contacts, currentUserId: "me" }), {
    id: "u2",
    nickname: "测试账号2",
    avatar: "",
    subtitle: "member"
  });
});

test("mention ids are collected from typed group member mentions", () => {
  assert.deepEqual(
    collectMentionIdsFromText("@测试账号2 你好 @功能账号1", { group, contacts, currentUserId: "me" }),
    ["u2", "u3"]
  );
});
