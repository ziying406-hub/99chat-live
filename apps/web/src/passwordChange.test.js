import test from "node:test";
import assert from "node:assert/strict";

import * as passwordChange from "./passwordChange.js";

const { validateForgotPasswordReset, validatePasswordChange } = passwordChange;

test("password change requires current password", () => {
  assert.equal(validatePasswordChange("", "newpass123", "newpass123").message, "请输入旧密码");
});

test("password change requires at least six characters", () => {
  assert.equal(validatePasswordChange("demo123456", "123", "123").message, "新密码至少需要 6 位");
});

test("password change requires matching confirmation", () => {
  assert.equal(validatePasswordChange("demo123456", "newpass123", "otherpass").message, "两次输入的新密码不一致");
});

test("password change accepts a complete valid form", () => {
  assert.deepEqual(validatePasswordChange("demo123456", "newpass123", "newpass123"), {
    ok: true,
    message: ""
  });
});

test("password change action opens the security page", () => {
  assert.equal(passwordChange.passwordActionTarget?.("change-password"), "security");
});

test("forgot password reset requires verification code", () => {
  assert.equal(validateForgotPasswordReset("", "newpass123", "newpass123").message, "请输入验证码");
});

test("forgot password reset validates matching passwords", () => {
  assert.equal(validateForgotPasswordReset("123456", "newpass123", "otherpass").message, "两次输入的新密码不一致");
});
