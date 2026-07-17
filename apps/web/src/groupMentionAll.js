export const ALL_MEMBERS_MENTION_ID = "__group-all__";

export function groupAllMentionCandidate(canManage = false) {
  if (!canManage) return null;
  return {
    id: ALL_MEMBERS_MENTION_ID,
    nickname: "所有人",
    avatar: "",
    subtitle: "通知群内全部成员",
    isAllMembers: true
  };
}

export function groupAllMentionIds(group, currentUserId = "") {
  const senderID = String(currentUserId || "");
  return [...new Set((group?.members || [])
    .map(member => String(member.userId || ""))
    .filter(userID => userID && userID !== senderID))];
}
