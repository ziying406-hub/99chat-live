import assert from "node:assert/strict";
import test from "node:test";
import { friendRequestErrorMessage, friendRequestReviewErrorMessage } from "./friendRequestErrors.js";

test("friend request errors translate backend validation messages", () => {
	assert.equal(friendRequestErrorMessage(new Error("cannot add yourself")), "不能添加自己");
	assert.equal(friendRequestErrorMessage(new Error("already friends")), "你们已经是好友了");
	assert.equal(friendRequestErrorMessage(new Error("friend request already pending")), "好友申请已发送，等待对方验证");
	assert.equal(friendRequestErrorMessage(new Error("target blocked friend requests")), "对方无法收到你的好友申请");
	assert.equal(friendRequestErrorMessage(new Error("user not found")), "未找到这个聊天号");
});

test("friend request errors translate group member add restriction", () => {
  assert.equal(
    friendRequestErrorMessage(new Error("group blocks member friend requests: 测试群")),
    "测试群 已禁止成员互加好友"
  );
});

test("friend request errors parse json api error bodies", () => {
  assert.equal(friendRequestErrorMessage(new Error('{"error":"already friends"}')), "你们已经是好友了");
});

test("friend request errors use fallback for unknown failures", () => {
  assert.equal(friendRequestErrorMessage(new Error("network failed")), "好友申请发送失败，请稍后再试");
});

test("friend request review errors explain stale requests", () => {
  assert.equal(friendRequestReviewErrorMessage(new Error('{"error":"request not found"}')), "这条申请已失效，请刷新后重试");
  assert.equal(friendRequestReviewErrorMessage(new Error("network failed")), "好友申请处理失败，请稍后再试");
});
