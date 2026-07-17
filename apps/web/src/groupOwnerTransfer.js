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

export function ownerTransferErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("owner permission required")) return "只有当前群主可以转让群主身份";
  if (message.includes("invalid transfer target")) return "该成员已不在群内，无法转让";
  if (message.includes("group not found")) return "群聊不存在或已被解散";
  return "群主转让失败，请稍后重试";
}
