import assert from "node:assert/strict";
import test from "node:test";

import { codeLoginFailureAction, sendCodeFailureMessage, validateDemoLoginCode } from "./authModes.js";

test("demo verification login accepts the visible demo code", () => {
  assert.deepEqual(validateDemoLoginCode("123456"), { ok: true, message: "" });
});

test("demo verification login rejects other codes", () => {
  assert.deepEqual(validateDemoLoginCode("000000"), { ok: false, message: "验证码不正确，请输入 123456" });
});

test("code login keeps real API errors instead of falling back to demo", () => {
  assert.deepEqual(codeLoginFailureAction(new Error(`{"error":"user not found"}`)), { fallbackToMock: false, message: "未找到该手机号" });
  assert.deepEqual(codeLoginFailureAction(new Error(`{"error":"invalid verification code"}`)), { fallbackToMock: false, message: "验证码不正确，请输入 123456" });
});

test("code login does not fall back to demo when the API is unavailable", () => {
  assert.deepEqual(codeLoginFailureAction(new Error("Failed to fetch")), { fallbackToMock: false, message: "验证码登录失败，请确认 API 已启动" });
});

test("send code errors are readable", () => {
  assert.equal(sendCodeFailureMessage(new Error(`{"error":"user not found"}`)), "未找到该手机号");
  assert.equal(sendCodeFailureMessage(new Error(`{"error":"phone is required"}`)), "请输入手机号码");
  assert.equal(sendCodeFailureMessage(new Error("Failed to fetch")), "验证码发送失败，请确认 API 已启动");
});
