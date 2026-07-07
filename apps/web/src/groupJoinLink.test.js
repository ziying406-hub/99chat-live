import assert from "node:assert/strict";
import test from "node:test";
import { findPendingJoinRequest, groupJoinErrorMessage, groupJoinLinkState, pendingGroupJoinRequestCount } from "./groupJoinLink.js";

const user = { id: "u1", nickname: "访客" };

test("public qr link can join directly", () => {
  const state = groupJoinLinkState({
    code: "qr-1",
    group: { qrCode: "qr-1", chatId: "21444", joinMode: "public_qr", members: [] }
  }, user);

  assert.equal(state.canProceed, true);
  assert.equal(state.action, "confirm");
  assert.equal(state.actionLabel, "加入群聊");
});

test("approval qr link asks for application", () => {
  const state = groupJoinLinkState({
    code: "qr-1",
    group: { qrCode: "qr-1", joinMode: "approval", members: [] }
  }, user);

  assert.equal(state.canProceed, true);
  assert.equal(state.actionLabel, "申请入群");
  assert.equal(state.status, "入群方式：需要审核");
});

test("closed qr link blocks joining", () => {
  const state = groupJoinLinkState({
    code: "qr-1",
    group: { qrCode: "qr-1", joinMode: "closed", members: [] }
  }, user);

  assert.equal(state.canProceed, false);
  assert.equal(state.status, "该群暂不允许加入");
});

test("mismatched qr link is invalid", () => {
  const state = groupJoinLinkState({
    code: "old-code",
    group: { qrCode: "new-code", joinMode: "public_qr", members: [] }
  }, user);

  assert.equal(state.canProceed, false);
  assert.equal(state.status, "二维码已失效或群号不匹配");
});

test("expired qr link is invalid", () => {
  const state = groupJoinLinkState({
    code: "qr-1",
    group: { qrCode: "qr-1", qrCodeExpiresAt: "2026-07-05T00:00:00Z", joinMode: "public_qr", members: [] }
  }, user, new Date("2026-07-06T00:00:00Z"));

  assert.equal(state.canProceed, false);
  assert.equal(state.status, "二维码已过期，请联系群管理员刷新");
});

test("existing member opens group chat", () => {
  const state = groupJoinLinkState({
    code: "qr-1",
    group: { qrCode: "qr-1", joinMode: "public_qr", members: [{ userId: "u1" }] }
  }, user);

  assert.equal(state.canProceed, true);
  assert.equal(state.action, "open");
  assert.equal(state.actionLabel, "进入群聊");
});

test("join errors are translated", () => {
  assert.equal(groupJoinErrorMessage(new Error("invalid join code")), "二维码已失效或群号不匹配");
  assert.equal(groupJoinErrorMessage(new Error("group blacklist blocks join")), "你暂时无法加入该群");
  assert.equal(groupJoinErrorMessage(new Error("group is closed")), "该群暂不允许加入");
});

test("finds pending qr application for current user", () => {
  const request = findPendingJoinRequest([
    { groupId: "g1", status: "rejected", user: { id: "u1" } },
    { groupId: "g1", status: "pending", user: { id: "u1" } },
    { groupId: "g2", status: "pending", user: { id: "u1" } }
  ], "g1", user);

  assert.equal(request.status, "pending");
});

test("counts pending group join requests", () => {
  assert.equal(pendingGroupJoinRequestCount([
    { status: "pending" },
    { status: "accepted" },
    { status: "pending" }
  ]), 2);
});
