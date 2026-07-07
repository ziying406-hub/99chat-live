import { quotePreviewText } from "./messagePreview.js";

export function canDeleteMessage(message, user, group, options = {}) {
  if (options.allowMock) return true;
  if (!message?.senderId || !user?.id) return false;
  if (message.senderId === user.id) return true;
  return canManageGroup(group, user.id);
}

export function findUndeletableMessages(messages, user, group, options = {}) {
  return (messages || []).filter(message => !canDeleteMessage(message, user, group, options));
}

export function deleteBlockedSummary(messages) {
  const blocked = messages || [];
  if (!blocked.length) return "";
  const preview = blocked.slice(0, 3).map(message => {
    const sender = message?.senderName || "成员";
    const body = quotePreviewText(message) || "消息";
    return `${sender}：${body}`;
  }).join("；");
  const suffix = blocked.length > 3 ? " 等" : "";
  return `有 ${blocked.length} 条消息无权删除：${preview}${suffix}`;
}

function canManageGroup(group, userId) {
  const member = (group?.members || []).find(item => item.userId === userId);
  return ["owner", "admin"].includes(member?.role);
}
