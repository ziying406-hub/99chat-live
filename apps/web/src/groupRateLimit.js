export function groupRateLimitKey(rateLimit) {
  if (!rateLimit?.enabled) return "off";
  if (rateLimit.windowSeconds === 60 && rateLimit.maxMessages === 10) return "steady";
  return "fast";
}

export function groupRateLimitLabel(rateLimit) {
  if (!rateLimit?.enabled) return "未开启";
  return `${rateLimit.windowSeconds || 10} 秒最多 ${rateLimit.maxMessages || 3} 条`;
}

export function groupRateLimitExceeded({ conversation, group, member, messages, user, now = Date.now() }) {
  if (!conversation || conversation.kind !== "group") return false;
  const rateLimit = group?.rateLimit;
  if (!rateLimit?.enabled || ["owner", "admin"].includes(member?.role)) return false;
  const windowMs = (rateLimit.windowSeconds || 10) * 1000;
  const count = (messages || []).filter(message =>
    !message.sendStatus &&
    message.senderId === user?.id &&
    now - new Date(message.createdAt).getTime() <= windowMs
  ).length;
  return count >= (rateLimit.maxMessages || 3);
}
