import assert from "node:assert/strict";
import test from "node:test";

import { canManageMember, memberStatusText } from "./groupMemberPermissions.js";

test("owner can manage admins and members but not owner row", () => {
  const owner = { userId: "u1", role: "owner" };
  assert.equal(canManageMember(owner, { userId: "u2", role: "admin" }), true);
  assert.equal(canManageMember(owner, { userId: "u3", role: "member" }), true);
  assert.equal(canManageMember(owner, { userId: "u1", role: "owner" }), false);
});

test("admin can only manage regular members", () => {
  const admin = { userId: "u2", role: "admin" };
  assert.equal(canManageMember(admin, { userId: "u3", role: "member" }), true);
  assert.equal(canManageMember(admin, { userId: "u4", role: "admin" }), false);
  assert.equal(canManageMember(admin, { userId: "u1", role: "owner" }), false);
});

test("member status includes mute state", () => {
  assert.equal(memberStatusText({ role: "member", muted: true }, 2), "群成员 · 已禁言 · 被@2次");
  assert.equal(memberStatusText({ role: "admin", muted: false }, 0), "管理员");
});
