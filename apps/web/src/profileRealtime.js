function isPrivateConversationWithUser(conversationId, currentUserId, profileUserId) {
  const raw = String(conversationId || "").replace(/^session-/, "");
  if (!raw) return false;
  const parts = raw.split("--");
  if (parts.length === 1) return parts[0] === profileUserId;
  return parts.length === 2 && parts.includes(String(currentUserId || "")) && parts.includes(profileUserId);
}

export function applyProfileRealtimeUpdate(data, currentUser, profile) {
  const profileUserId = String(profile?.id || "");
  if (!data || !profileUserId) return false;
  const fields = ["nickname", "signature", "avatar", "chatId"];
  let changed = false;
  for (const key of ["contacts", "directory"]) {
    for (const item of data[key] || []) {
      if (String(item?.id || "") !== profileUserId) continue;
      for (const field of fields) {
        if (profile[field] !== undefined && item[field] !== profile[field]) {
          item[field] = profile[field];
          changed = true;
        }
      }
    }
  }
  for (const conversation of data.conversations || []) {
    if (conversation?.kind !== "session" || !isPrivateConversationWithUser(conversation.id, currentUser?.id, profileUserId)) continue;
    if (profile.nickname && conversation.title !== profile.nickname) {
      conversation.title = profile.nickname;
      changed = true;
    }
    if (profile.avatar && conversation.avatar !== profile.avatar) {
      conversation.avatar = profile.avatar;
      changed = true;
    }
  }
  for (const messages of Object.values(data.messages || {})) {
    for (const message of messages || []) {
      if (String(message?.senderId || "") !== profileUserId) continue;
      if (profile.nickname && message.senderName !== profile.nickname) {
        message.senderName = profile.nickname;
        changed = true;
      }
      if (profile.avatar && message.senderAvatar !== profile.avatar) {
        message.senderAvatar = profile.avatar;
        changed = true;
      }
    }
  }
  return changed;
}
