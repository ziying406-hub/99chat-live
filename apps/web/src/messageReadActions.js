export function canShowReadDetailAction(message, user, conversation) {
  return Boolean(
    message?.senderId &&
      !message.sendStatus &&
      user?.id &&
      message.senderId === user.id &&
      conversation?.kind === "group"
  );
}

export function readStateControl(message, user, conversation) {
  const readCount = Number(message?.readCount || 0);
  const readTotal = Number(message?.readTotal || 0);
  const label = conversation?.kind === "group"
    ? readTotal > 0 ? `已读 ${readCount}/${readTotal}` : "未读"
    : readCount > 0 ? "已读" : "未读";
  return {
    clickable: canShowReadDetailAction(message, user, conversation),
    label
  };
}

export function applyMessageReadReceipt(messages, payload) {
  if (!Array.isArray(messages) || !Array.isArray(payload?.messages)) return messages;
  const updates = new Map(payload.messages
    .filter(update => update?.messageId)
    .map(update => [update.messageId, update]));
  if (!updates.size) return messages;

  let changed = false;
  const nextMessages = messages.map(message => {
    const update = updates.get(message.id);
    if (!update) return message;
    const readCount = Number(update.readCount || 0);
    const readTotal = Number(update.readTotal || 0);
    if (message.readCount === readCount && message.readTotal === readTotal) return message;
    changed = true;
    return { ...message, readCount, readTotal };
  });
  return changed ? nextMessages : messages;
}
