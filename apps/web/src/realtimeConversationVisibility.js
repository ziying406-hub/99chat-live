export function canReceiveRealtimeConversation({ conversationId, currentUserId, contactIds = [] } = {}) {
  const raw = String(conversationId || "");
  const userId = String(currentUserId || "");
  if (!raw.startsWith("session-")) return true;

  const participants = raw.slice("session-".length).split("--");
  if (participants.length === 2 && participants[0] && participants[1]) {
    return participants.includes(userId);
  }

  const contactId = participants[0] || "";
  return Boolean(contactId && contactIds.includes(contactId));
}
