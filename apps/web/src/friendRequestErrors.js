const friendRequestErrorLabels = [
  ["cannot add yourself", "不能添加自己"],
  ["already friends", "你们已经是好友了"],
  ["friend request already pending", "好友申请已发送，等待对方验证"],
  ["target blocked friend requests", "对方无法收到你的好友申请"],
  ["user not found", "未找到这个聊天号"]
];

export function friendRequestErrorMessage(error) {
  const raw = String(error?.message || "");
  const message = parseErrorBody(raw) || raw;
  const lower = message.toLowerCase();
  if (lower.includes("group blocks member friend requests")) {
    const groupTitle = message.split(":").slice(1).join(":").trim();
    return `${groupTitle || "该群"} 已禁止成员互加好友`;
  }
  const label = friendRequestErrorLabels.find(([key]) => lower.includes(key))?.[1];
  return label || "好友申请发送失败，请稍后再试";
}

function parseErrorBody(value) {
  try {
    const data = JSON.parse(value);
    return data?.error || data?.message || "";
  } catch (_) {
    return "";
  }
}
