export function canManageMember(currentMember, targetMember) {
  if (!currentMember || !targetMember || targetMember.role === "owner") return false;
  if (currentMember.role === "owner") return currentMember.userId !== targetMember.userId;
  if (currentMember.role === "admin") return targetMember.role === "member";
  return false;
}

export function memberStatusText(member, mentionCount = 0) {
  return [
    memberRoleText(member?.role),
    member?.muted ? "已禁言" : "",
    mentionCount ? `被@${mentionCount}次` : ""
  ].filter(Boolean).join(" · ");
}

function memberRoleText(role) {
  if (role === "owner") return "群主";
  if (role === "admin") return "管理员";
  return "群成员";
}
