import assert from "node:assert/strict";
import test from "node:test";

import { adminRoutes, adminStatusLabel, requiresConfirmation } from "./adminStatus.js";

test("admin route metadata includes MVP and planning placeholder sections", () => {
  assert.deepEqual(adminRoutes.map(route => route.key), [
    "dashboard",
    "users",
    "groups",
    "messages",
    "reports",
    "feedback",
    "files",
    "audit-logs",
    "settings",
    "admins"
  ]);
});

test("status labels map report states", () => {
  assert.deepEqual(adminStatusLabel("report", "resolved"), { text: "已解决", tone: "success" });
  assert.deepEqual(adminStatusLabel("report", "open"), { text: "待处理", tone: "warning" });
});

test("destructive admin actions require confirmation copy", () => {
  assert.deepEqual(requiresConfirmation("ban-user", "Alice"), {
    required: true,
    label: "确认封禁",
    detail: "封禁 Alice 后，该用户不能继续登录或使用聊天 API。"
  });
});
