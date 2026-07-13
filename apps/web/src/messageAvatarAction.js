export function messageAvatarContactKey(message, conversation, currentUserId, currentGroupRole = "") {
  if (!message?.senderId || message.senderId === currentUserId) return "";
  if (!conversation || conversation.kind === "group" && !["owner", "admin"].includes(currentGroupRole)) return "";
  if (conversation.kind !== "session" && conversation.kind !== "group") return "";
  return String(message.senderId);
}
