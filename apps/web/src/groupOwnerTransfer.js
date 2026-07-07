export function canTransferOwner(group, user) {
  return Boolean(group?.members?.some(member => member.userId === user?.id && member.role === "owner"));
}

export function applyOwnerTransfer(group, currentOwnerId, newOwnerId) {
  const hasCurrentOwner = group?.members?.some(member => member.userId === currentOwnerId && member.role === "owner");
  const hasNewOwner = group?.members?.some(member => member.userId === newOwnerId && member.userId !== currentOwnerId);
  if (!group || !hasCurrentOwner || !hasNewOwner) return group;
  return {
    ...group,
    members: group.members.map(member => {
      if (member.userId === currentOwnerId) return { ...member, role: "admin" };
      if (member.userId === newOwnerId) return { ...member, role: "owner" };
      return member;
    })
  };
}

export function ownerTransferHint() {
  return "转让后，你将自动变为管理员，新群主将拥有全部群管理权限。";
}

export function ownerTransferConfirmText(target) {
  return `确定将群主转让给 ${target?.nickname || "该成员"}？转让后你将变为管理员，新群主将拥有全部群管理权限。`;
}
