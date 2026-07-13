export function messageAvatarContactKey(message, conversation, currentUserId) {
  if (!message?.senderId || message.senderId === currentUserId) return "";
  if (!conversation || (conversation.kind !== "session" && conversation.kind !== "group")) return "";
  return String(message.senderId);
}
