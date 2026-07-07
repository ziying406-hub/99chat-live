import assert from "node:assert/strict";
import test from "node:test";

import { currentDeviceInfo, loginDeviceDisplay } from "./securityDevices.js";

test("current device info labels the browser session", () => {
  assert.deepEqual(currentDeviceInfo("Mozilla/5.0 Safari/605.1.15"), {
    name: "Safari 浏览器",
    status: "当前设备",
    hint: "正在使用此浏览器登录"
  });
});

test("login device display labels current and revocable sessions", () => {
  assert.deepEqual(loginDeviceDisplay({ name: "Safari 浏览器", current: true, createdAt: "2026-07-06T08:00:00Z" }), {
    name: "Safari 浏览器",
    status: "当前设备",
    hint: "正在使用此浏览器登录",
    canRevoke: false
  });
  assert.deepEqual(loginDeviceDisplay({ name: "Chrome 浏览器", current: false, createdAt: "2026-07-06T08:00:00Z" }), {
    name: "Chrome 浏览器",
    status: "其它设备",
    hint: "可退出此登录",
    canRevoke: true
  });
});
