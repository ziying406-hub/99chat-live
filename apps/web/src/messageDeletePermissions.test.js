import assert from "node:assert/strict";
import test from "node:test";

import { canDeleteMessage, deleteBlockedSummary, findUndeletableMessages } from "./messageDeletePermissions.js";

const user = { id: "u1" };
const ownerGroup = { members: [{ userId: "u1", role: "owner" }] };
const memberGroup = { members: [{ userId: "u1", role: "member" }] };

test("users can delete their own messages", () => {
  assert.equal(canDeleteMessage({ senderId: "u1" }, user, null), true);
});

test("regular group members cannot delete another member message", () => {
  assert.equal(canDeleteMessage({ senderId: "u2" }, user, memberGroup), false);
});

test("group managers can delete another member message", () => {
  assert.equal(canDeleteMessage({ senderId: "u2" }, user, ownerGroup), true);
});

test("batch permission check returns only undeletable messages", () => {
  assert.deepEqual(
    findUndeletableMessages([{ id: "own", senderId: "u1" }, { id: "other", senderId: "u2" }], user, memberGroup)
      .map(message => message.id),
    ["other"]
  );
});

test("blocked delete summary names senders and message previews", () => {
  assert.equal(
    deleteBlockedSummary([
      { senderName: "苏雅", body: "hello world" },
      { senderName: "小花", type: "image", attachment: { name: "photo.png" } },
      { senderName: "恋情客", body: "third" },
      { senderName: "陈刀仔", body: "fourth" }
    ]),
    "有 4 条消息无权删除：苏雅：hello world；小花：[图片] photo.png；恋情客：third 等"
  );
});
