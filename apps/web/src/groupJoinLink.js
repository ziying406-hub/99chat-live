import { isGroupQrExpired } from "./groupQrStatus.js";

export function groupJoinLinkState(join, user, now = new Date()) {
  const group = join?.group;
  if (!join) return { canProceed: false, status: "未找到入群链接", tone: "danger", action: null, actionLabel: "" };
  if (!group) return { canProceed: false, status: join.status || "未找到该群聊", tone: "danger", action: null, actionLabel: "" };

  const expectedCode = groupJoinCode(group);
  const codeMatched = !join.code || expectedCode === join.code;
  const expired = Boolean(join.code) && isGroupQrExpired(group, now);
  const alreadyMember = group.members?.some(member => member.userId === user?.id);

  if (!codeMatched) {
    return { canProceed: false, status: "二维码已失效或群号不匹配", tone: "danger", action: null, actionLabel: "" };
  }
  if (expired) {
    return { canProceed: false, status: "二维码已过期，请联系群管理员刷新", tone: "danger", action: null, actionLabel: "" };
  }
  if (alreadyMember) {
    return { canProceed: true, status: "你已在群聊中", tone: "info", action: "open", actionLabel: "进入群聊" };
  }
  if (group.joinMode === "closed") {
    return { canProceed: false, status: "该群暂不允许加入", tone: "danger", action: null, actionLabel: "" };
  }
  if (group.joinMode === "approval") {
    return { canProceed: true, status: "入群方式：需要审核", tone: "info", action: "confirm", actionLabel: "申请入群" };
  }
  return { canProceed: true, status: "入群方式：扫码直接加入", tone: "info", action: "confirm", actionLabel: "加入群聊" };
}

export function groupJoinCode(group) {
  return group?.qrCode || group?.chatId || "";
}

export function findPendingJoinRequest(requests, groupId, user) {
  return (requests || []).find(request =>
    request?.groupId === groupId &&
    request?.status === "pending" &&
    request?.user?.id === user?.id
  ) || null;
}

export function pendingGroupJoinRequestCount(requests) {
  return (requests || []).filter(request => request?.status === "pending").length;
}

export function groupJoinErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("group is closed")) return "该群暂不允许加入";
  if (message.includes("group blacklist blocks join")) return "你暂时无法加入该群";
  if (message.includes("invalid join code")) return "二维码已失效或群号不匹配";
  if (message.includes("group not found")) return "未找到该群聊";
  return "入群失败，请稍后再试";
}
