export function applyGroupBlacklistEvent(state, payload) {
  if (!payload?.groupId) return state;
  const groupId = payload.groupId;
  const groupBlacklists = { ...(state.groupBlacklists || {}) };
  const currentEntries = groupBlacklists[groupId] || [];

  if (payload.removed) {
    groupBlacklists[groupId] = currentEntries.filter(entry => entry.user?.id !== payload.removed);
    return { ...state, groupBlacklists };
  }

  const entry = payload;
  groupBlacklists[groupId] = [
    entry,
    ...currentEntries.filter(item => item.user?.id !== entry.user?.id)
  ];

  const groups = (state.groups || []).map(group => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      members: (group.members || []).filter(member => member.userId !== entry.user?.id)
    };
  });

  return { ...state, groupBlacklists, groups };
}

export function groupBlacklistEntrySummary(entry, formatDate) {
  const reason = entry?.reason || "未填写原因";
  const time = entry?.createdAt && typeof formatDate === "function" ? formatDate(new Date(entry.createdAt)) : "";
  return time ? `${reason} · ${time}` : reason;
}
