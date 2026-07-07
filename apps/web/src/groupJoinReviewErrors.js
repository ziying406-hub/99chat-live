export function groupJoinReviewErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("group blacklist blocks join")) {
    return "该用户已在群黑名单，不能同意入群";
  }
  if (message.includes("admin permission required")) {
    return "只有群主和管理员可以处理入群申请";
  }
  return "入群审核失败";
}
