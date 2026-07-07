export function selectBatchConversationIds(conversations, targets) {
  const targetSet = new Set(targets || []);
  const selected = [];
  const seen = new Set();

  for (const conversation of conversations || []) {
    if (!conversation?.id) continue;
    const matchesRecent = targetSet.has("recent");
    const matchesContact = targetSet.has("contacts") && conversation.kind === "session";
    const matchesGroup = targetSet.has("groups") && conversation.kind === "group";
    if (!(matchesRecent || matchesContact || matchesGroup) || seen.has(conversation.id)) continue;
    selected.push(conversation.id);
    seen.add(conversation.id);
  }

  return selected;
}
