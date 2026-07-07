export function groupMemberActionErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("owner permission required")) {
    return "只有群主可以操作管理员或群主";
  }
  if (message.includes("admin permission required")) {
    return "只有群主和管理员可以操作成员";
  }
  if (message.includes("member not found")) {
    return "成员不存在或已离开群聊";
  }
  return "成员操作失败";
}
