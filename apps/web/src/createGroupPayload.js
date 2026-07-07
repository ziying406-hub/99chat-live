export function buildCreateGroupPayload(title, selectedIds, contacts = []) {
  const validIds = new Set((contacts || []).map(contact => contact.id).filter(Boolean));
  const memberIds = [];
  for (const id of selectedIds || []) {
    if (!validIds.has(id) || memberIds.includes(id)) continue;
    memberIds.push(id);
  }
  return {
    title: String(title || "").trim() || "新的群聊",
    memberIds
  };
}

export function toggleCreateGroupSelection(selectedIds, targetId, contacts = []) {
  const selected = new Set(selectedIds || []);
  const contactIds = (contacts || []).map(contact => contact.id).filter(Boolean);
  if (targetId === "all") {
    return selected.size === contactIds.length ? [] : contactIds;
  }
  if (selected.has(targetId)) {
    selected.delete(targetId);
  } else if (contactIds.includes(targetId)) {
    selected.add(targetId);
  }
  return contactIds.filter(id => selected.has(id));
}
