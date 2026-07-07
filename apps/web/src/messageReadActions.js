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
