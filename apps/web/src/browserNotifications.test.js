import assert from "node:assert/strict";
import test from "node:test";

import {
  browserNotificationDelivery,
  browserNotificationOptions,
  browserNotificationPayload,
  browserNotificationPermissionView,
  shouldShowBrowserNotification
} from "./browserNotifications.js";

const base = {
  incoming: true,
  activeConversationOpen: false,
  conversation: { id: "session-b", title: "测试账号2" },
  settings: { notificationsEnabled: true },
  permission: "granted",
  supported: true
};

test("browser notification shows for incoming non-muted background conversation", () => {
  assert.equal(shouldShowBrowserNotification(base), true);
});

test("browser notification is suppressed for muted conversations and disabled settings", () => {
  assert.equal(shouldShowBrowserNotification({ ...base, conversation: { ...base.conversation, muted: true } }), false);
  assert.equal(shouldShowBrowserNotification({ ...base, settings: { notificationsEnabled: false } }), false);
});

test("browser notification still shows mentions from muted conversations", () => {
  assert.equal(shouldShowBrowserNotification({
    ...base,
    conversation: { ...base.conversation, muted: true },
    mentionedMe: true
  }), true);
});

test("browser notification requires support, permission, incoming message, and inactive conversation for ordinary messages", () => {
  assert.equal(shouldShowBrowserNotification({ ...base, supported: false }), false);
  assert.equal(shouldShowBrowserNotification({ ...base, permission: "default" }), false);
  assert.equal(shouldShowBrowserNotification({ ...base, incoming: false }), false);
  assert.equal(shouldShowBrowserNotification({ ...base, activeConversationOpen: true }), false);
});

test("browser notification can show for selected conversation when app is not actively viewing it", () => {
  assert.equal(shouldShowBrowserNotification({ ...base, activeConversationOpen: false }), true);
});

test("browser notification still shows mentions for the active open conversation", () => {
  assert.equal(shouldShowBrowserNotification({ ...base, activeConversationOpen: true, mentionedMe: true }), true);
});

test("mobile-capable browsers prefer the service worker notification path", () => {
  assert.equal(browserNotificationDelivery({ serviceWorkerReady: true }), "service-worker");
  assert.equal(browserNotificationDelivery({ serviceWorkerReady: false }), "window");
});

test("browser notification payload uses conversation and sender text", () => {
  assert.deepEqual(
    browserNotificationPayload(
      { id: "session-b", title: "测试账号2" },
      { senderName: "测试账号2", body: "你好" }
    ),
    { title: "测试账号2", body: "测试账号2：你好", tag: "session-b" }
  );
});

test("every incoming message uses a fresh tag and requests another browser alert", () => {
  const payload = browserNotificationPayload(
    { id: "group-1", title: "测试群" },
    { id: "message-7", senderName: "测试账号2", body: "@你 你好" }
  );

  assert.deepEqual(
    browserNotificationOptions(payload, { id: "message-7" }, { mentionedMe: true }),
    { tag: "group-1:mention:message-7", renotify: true }
  );
  assert.deepEqual(
    browserNotificationOptions(payload, { id: "message-7" }),
    { tag: "group-1:message:message-7", renotify: true }
  );
});

test("browser notification permission view maps permission states to switch copy", () => {
  assert.deepEqual(
    browserNotificationPermissionView({ supported: true, permission: "granted" }),
    {
      enabled: true,
      requestable: false,
      action: "已允许",
      description: "已允许，普通会话新消息会弹出浏览器通知",
      toast: "浏览器通知已允许；如需关闭请到浏览器网站设置中操作"
    }
  );
  assert.deepEqual(
    browserNotificationPermissionView({ supported: true, permission: "denied" }),
    {
      enabled: false,
      requestable: false,
      action: "已拒绝",
      description: "已被浏览器拒绝，需要到 Chrome 网站设置里重新允许",
      toast: "浏览器通知已被拒绝，请在 Chrome 网站设置里允许通知"
    }
  );
  assert.deepEqual(
    browserNotificationPermissionView({ supported: true, permission: "default" }),
    {
      enabled: false,
      requestable: true,
      action: "去开启",
      description: "尚未授权，打开开关后允许浏览器弹出新消息",
      toast: "未开启浏览器通知权限"
    }
  );
  assert.deepEqual(
    browserNotificationPermissionView({ supported: false, permission: "denied" }),
    {
      enabled: false,
      requestable: false,
      action: "不可用",
      description: "当前浏览器不支持系统通知",
      toast: "当前浏览器不支持消息通知"
    }
  );
});
