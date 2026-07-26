function peerIdForSession(conversationId, userId) {
  const parts = String(conversationId || "").replace("session-", "").split("--");
  if (parts.length !== 2) return "";
  if (parts[0] === userId) return parts[1];
  if (parts[1] === userId) return parts[0];
  return "";
}

export function isFormerFriendSession(conversation, userId, contacts) {
  if (conversation?.kind !== "session") return false;
  const peerId = peerIdForSession(conversation.id, userId);
  return Boolean(peerId) && !(contacts || []).some(contact => contact.id === peerId);
}
