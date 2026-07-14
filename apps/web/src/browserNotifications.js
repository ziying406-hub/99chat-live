export function shouldShowBrowserNotification({
  incoming,
  activeConversationOpen,
  conversation,
  mentionedMe,
  settings,
  permission,
  supported
} = {}) {
  if (!supported) return false;
  if (permission !== "granted") return false;
  if (!settings?.notificationsEnabled) return false;
  if (!incoming) return false;
  if (conversation?.muted && !mentionedMe) return false;
  if (activeConversationOpen && !mentionedMe) return false;
  return true;
}

export function browserNotificationDelivery({ serviceWorkerReady } = {}) {
  return serviceWorkerReady ? "service-worker" : "window";
}

export function browserNotificationPayload(conversation = {}, message = {}) {
  const title = conversation.title || "新消息";
  const sender = message.senderName ? `${message.senderName}：` : "";
  const body = `${sender}${message.body || "[新消息]"}`.trim();
  return {
    title,
    body: body.length > 80 ? `${body.slice(0, 80)}...` : body,
    tag: conversation.id || message.conversationId || "chat-message"
  };
}

export function browserNotificationPermissionView({ supported, permission } = {}) {
  if (!supported) {
    return {
      enabled: false,
      action: "不可用",
      description: "当前浏览器不支持系统通知",
      toast: "当前浏览器不支持消息通知"
    };
  }
  if (permission === "granted") {
    return {
      enabled: true,
      action: "已允许",
      description: "已允许，普通会话新消息会弹出浏览器通知",
      toast: "浏览器通知已开启"
    };
  }
  if (permission === "denied") {
    return {
      enabled: false,
      action: "已拒绝",
      description: "已被浏览器拒绝，需要到 Chrome 网站设置里重新允许",
      toast: "浏览器通知已被拒绝，请在 Chrome 网站设置里允许通知"
    };
  }
  return {
    enabled: false,
    action: "去开启",
    description: "尚未授权，打开开关后允许浏览器弹出新消息",
    toast: "未开启浏览器通知权限"
  };
}
