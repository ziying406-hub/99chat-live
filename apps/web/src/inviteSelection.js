export function updateInviteSelection(selectedIds, userId, checked) {
  const next = new Set(selectedIds || []);
  if (checked) {
    next.add(userId);
  } else {
    next.delete(userId);
  }
  return next;
}

export function updateInviteSelectionForCandidates(selectedIds, candidateIds, checked) {
  const next = new Set(selectedIds || []);
  for (const userId of candidateIds || []) {
    if (checked) {
      next.add(userId);
    } else {
      next.delete(userId);
    }
  }
  return next;
}

export function areAllInviteCandidatesSelected(selectedIds, candidateIds) {
  const candidates = candidateIds || [];
  return candidates.length > 0 && candidates.every(userId => selectedIds?.has(userId));
}
