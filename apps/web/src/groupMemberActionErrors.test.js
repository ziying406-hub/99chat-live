import assert from "node:assert/strict";
import test from "node:test";

import { groupMemberActionErrorMessage } from "./groupMemberActionErrors.js";

test("translates member permission errors", () => {
  assert.equal(groupMemberActionErrorMessage(new Error("admin permission required")), "只有群主和管理员可以操作成员");
});

test("translates owner-only member action errors", () => {
  assert.equal(groupMemberActionErrorMessage(new Error("owner permission required")), "只有群主可以操作管理员或群主");
});

test("translates missing member errors", () => {
  assert.equal(groupMemberActionErrorMessage(new Error("member not found")), "成员不存在或已离开群聊");
});

test("translates group invite errors", () => {
  assert.equal(groupMemberActionErrorMessage(new Error("group or user not found")), "该联系人账号不存在或暂时无法邀请");
  assert.equal(groupMemberActionErrorMessage(new Error("group blacklist blocks invite")), "该联系人已在群黑名单中，无法邀请");
});

test("falls back for unknown member action errors", () => {
  assert.equal(groupMemberActionErrorMessage(new Error("network failed")), "成员操作失败");
});
