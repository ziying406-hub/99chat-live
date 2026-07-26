export function groupNicknameForMember(group, userId, fallback = "你") {
  const member = group?.members?.find(item => item.userId === userId);
  return member?.nickname || group?.myNickname || fallback;
}
