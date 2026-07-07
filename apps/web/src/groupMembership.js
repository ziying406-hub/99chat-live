export function canLeaveGroup(member) {
  return Boolean(member?.userId && member.role !== "owner");
}
