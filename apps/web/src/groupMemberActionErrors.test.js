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

test("falls back for unknown member action errors", () => {
  assert.equal(groupMemberActionErrorMessage(new Error("network failed")), "成员操作失败");
});
