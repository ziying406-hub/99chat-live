import assert from "node:assert/strict";
import test from "node:test";

import { registerErrorMessage } from "./registerErrors.js";

test("register errors show missing input instead of duplicate account", () => {
  assert.equal(
    registerErrorMessage(new Error(`{"error":"phone and password with at least 6 chars are required"}`)),
    "请输入手机号和至少 6 位密码"
  );
});

test("register errors show duplicate phone only for real duplicate accounts", () => {
  assert.equal(
    registerErrorMessage(new Error(`{"error":"user already exists"}`)),
    "这个手机号已经注册"
  );
});
