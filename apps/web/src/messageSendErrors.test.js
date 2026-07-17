import assert from "node:assert/strict";
import test from "node:test";
import { sendErrorMessage } from "./messageSendErrors.js";

test("send errors translate group restrictions", () => {
  assert.equal(sendErrorMessage(new Error("group rate limit exceeded")), "发言太频繁，请稍后再试");
  assert.equal(sendErrorMessage(new Error("group is all muted")), "本群已开启全员禁言");
  assert.equal(sendErrorMessage(new Error("member is muted")), "你已被禁言，暂时无法在本群发送消息");
  assert.equal(sendErrorMessage(new Error("only group owners or administrators can mention everyone")), "只有群主或管理员可以 @所有人");
});

test("send errors translate personal blacklist restrictions", () => {
  assert.equal(sendErrorMessage(new Error("target blocked messages")), "对方已开启黑名单限制，消息无法送达");
});

test("send errors parse json api error bodies", () => {
  assert.equal(sendErrorMessage(new Error('{"error":"target blocked messages"}')), "对方已开启黑名单限制，消息无法送达");
});

test("send errors use fallback for unknown failures", () => {
  assert.equal(sendErrorMessage(new Error("network failed")), "消息发送失败，请稍后再试");
});
