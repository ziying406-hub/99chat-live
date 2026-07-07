export function buildMarkUnreadPatch(conversation = {}) {
  return {
    unread: Math.max(1, conversation.unread || 0),
    mentionedMe: Boolean(conversation.mentionedMe)
  };
}

export function effectiveUnreadCount(conversations = []) {
  return conversations.reduce((sum, conversation) => (
    conversation?.muted && !conversation?.mentionedMe ? sum : sum + (conversation?.unread || 0)
  ), 0);
}

export function unreadBadgeLabel(count = 0) {
  const unread = Number(count) || 0;
  if (unread <= 0) return "";
  return unread > 99 ? "99+" : String(unread);
}

export function resolveSelectedConversationId(currentId, conversations = []) {
  if (currentId && conversations.some(conversation => conversation?.id === currentId)) {
    return currentId;
  }
  return conversations.find(conversation => conversation?.id)?.id || "";
}

export function shouldNotifyConversation(conversation = {}) {
  return !conversation.muted;
}

export function shouldShowMentionReminder(conversation = {}) {
  return Boolean(conversation.mentionedMe);
}

export function sortConversationList(conversations = []) {
  return [...conversations].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const attentionA = conversationNeedsAttention(a) ? 1 : 0;
    const attentionB = conversationNeedsAttention(b) ? 1 : 0;
    if (attentionA !== attentionB) return attentionB - attentionA;
    if ((a.unread || 0) !== (b.unread || 0)) return (b.unread || 0) - (a.unread || 0);
    return new Date(b.lastAt) - new Date(a.lastAt);
  });
}

function conversationNeedsAttention(conversation) {
  if (conversation?.mentionedMe) return true;
  if (conversation?.muted) return false;
  return Boolean((conversation?.unread || 0) > 0);
}
