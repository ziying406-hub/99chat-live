import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOwnerTransfer,
  canTransferOwner,
  ownerTransferConfirmText,
  ownerTransferErrorMessage,
  ownerTransferHint
} from "./groupOwnerTransfer.js";

const group = {
  members: [
    { userId: "u1", nickname: "旧群主", role: "owner" },
    { userId: "u2", nickname: "新群主", role: "member" },
    { userId: "u3", nickname: "管理员", role: "admin" }
  ]
};

test("only current owner can transfer group ownership", () => {
  assert.equal(canTransferOwner(group, { id: "u1" }), true);
  assert.equal(canTransferOwner(group, { id: "u3" }), false);
  assert.equal(canTransferOwner(group, { id: "u2" }), false);
});

test("owner transfer updates old and new owner roles", () => {
  const updated = applyOwnerTransfer(group, "u1", "u2");

  assert.equal(updated.members.find(member => member.userId === "u1").role, "admin");
  assert.equal(updated.members.find(member => member.userId === "u2").role, "owner");
  assert.equal(updated.members.find(member => member.userId === "u3").role, "admin");
});

test("owner transfer ignores invalid target", () => {
  const updated = applyOwnerTransfer(group, "u1", "missing");

  assert.deepEqual(updated.members, group.members);
});

test("owner transfer copy names the consequence", () => {
  assert.equal(
    ownerTransferConfirmText({ nickname: "新群主" }),
    "确定将群主转让给 新群主？转让后你将变为管理员，新群主将拥有全部群管理权限。"
  );
  assert.equal(ownerTransferHint(), "转让后，你将自动变为管理员，新群主将拥有全部群管理权限。");
});

test("owner transfer turns server failures into actionable copy", () => {
  assert.equal(ownerTransferErrorMessage(new Error("owner permission required")), "只有当前群主可以转让群主身份");
  assert.equal(ownerTransferErrorMessage(new Error("invalid transfer target")), "该成员已不在群内，无法转让");
});
