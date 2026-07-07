export function auditLogSentence(log) {
  const actor = log?.actorName || "管理员";
  const target = log?.targetName || log?.targetId || "群聊";
  if (log?.action === "member_invited") return log.detail || `${actor} 邀请 ${target} 入群`;
  if (log?.action === "member_added") return `${actor} 邀请 ${target} 入群`;
  if (log?.action === "member_left") return `${target} 退出群聊`;
  if (log?.action === "member_removed") return `${actor} 移除 ${target}`;
  if (log?.action === "messages_deleted") return log.detail || `${actor} 删除消息`;
  if (log?.action === "qrcode_refreshed") return `${actor} 刷新群二维码`;
  if (log?.action === "rate_limit_updated") return log.detail || `${actor} 修改发言限制`;
  if (log?.action === "auto_mute_new_members_updated") return log.detail || `${actor} 修改入群自动禁言`;
  if (log?.action === "join_accepted") return `${actor} 同意 ${target} 入群`;
  if (log?.action === "join_rejected") return `${actor} 拒绝 ${target} 入群`;
  if (log?.action === "member_blacklisted") return `${actor} 将 ${target} 加入群黑名单${log.detail ? `：${log.detail}` : ""}`;
  if (log?.action === "member_unblacklisted") return `${actor} 将 ${target} 移出群黑名单`;
  if (log?.action === "bot_enabled") return `${actor} 启用 ${target}`;
  if (log?.action === "bot_disabled") return `${actor} 停用 ${target}`;
  if (log?.action === "bot_plan_updated") return `${actor} 更新 ${target} 自动发送计划`;
  if (log?.action === "bot_created") return `${actor} 新增 ${target}`;
  if (log?.action === "bot_deleted") return `${actor} 删除 ${target}`;
  if (log?.action === "bot_keyword_rules_updated") return `${actor} 更新 ${target} 关键词回复`;
  if (log?.action === "bot_test_sent") return `${actor} 测试 ${target} 发送`;
  if (log?.action === "bot_auto_sent") return `${target} ${log.detail || "自动发送群消息"}`;
  if (log?.action === "owner_transferred") return `${actor} 将群主转让给 ${target}`;
  if (log?.action === "admin_added") return `${actor} 设置 ${target} 为管理员`;
  if (log?.action === "admin_removed") return `${actor} 移除 ${target} 的管理员权限`;
  if (log?.action === "member_muted") return `${actor} 禁言 ${target}`;
  if (log?.action === "member_unmuted") return `${actor} 解除 ${target} 禁言`;
  return log?.detail || `${actor} 操作 ${target}`;
}

export function sortAuditLogs(logs) {
  return [...(logs || [])].sort((a, b) => {
    const bTime = new Date(b?.createdAt || 0).getTime();
    const aTime = new Date(a?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}
