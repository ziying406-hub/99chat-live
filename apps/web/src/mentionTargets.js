export function mentionCandidatesFromGroup(group, contacts = [], currentUserId = "") {
  if (!group) return [];
  return (group.members || [])
    .filter(member => member.userId && member.userId !== currentUserId)
    .map(member => {
      const contact = contacts.find(item => item.id === member.userId);
      const nickname = contact?.nickname || member.nickname || "成员";
      return {
        id: member.userId,
        nickname,
        avatar: contact?.avatar || "",
        subtitle: contact?.remark || contact?.chatId || member.role || "群成员"
      };
    });
}

export function findMentionTargetByName(name, { group, contacts = [], currentUserId = "" } = {}) {
  const query = normalizeMentionName(name);
  if (!query) return null;
  return mentionCandidatesFromGroup(group, contacts, currentUserId)
    .find(member => normalizeMentionName(member.nickname) === query) || null;
}

export function findMentionTargetById(id, { group, contacts = [], currentUserId = "" } = {}) {
  const query = String(id || "");
  if (!query) return null;
  return mentionCandidatesFromGroup(group, contacts, currentUserId)
    .find(member => member.id === query) || null;
}

export function collectMentionIdsFromText(body, context = {}) {
  const matches = String(body || "").match(/@([^\s@]+)/g) || [];
  const ids = [];
  for (const match of matches) {
    const target = findMentionTargetByName(match.slice(1), context);
    if (target) ids.push(target.id);
  }
  return [...new Set(ids)];
}

function normalizeMentionName(value) {
  return String(value || "").trim().toLowerCase();
}
