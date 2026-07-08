export const adminRoutes = [
  { key: "dashboard", path: "/admin", label: "首页" },
  { key: "users", path: "/admin/users", label: "用户" },
  { key: "groups", path: "/admin/groups", label: "群组" },
  { key: "messages", path: "/admin/messages", label: "消息" },
  { key: "reports", path: "/admin/reports", label: "举报" },
  { key: "feedback", path: "/admin/feedback", label: "反馈" },
  { key: "files", path: "/admin/files", label: "文件" },
  { key: "audit-logs", path: "/admin/audit-logs", label: "审计" }
];

const labels = {
  report: {
    open: { text: "待处理", tone: "warning" },
    reviewing: { text: "处理中", tone: "info" },
    resolved: { text: "已解决", tone: "success" },
    rejected: { text: "已驳回", tone: "muted" }
  },
  feedback: {
    submitted: { text: "已提交", tone: "warning" },
    reviewing: { text: "处理中", tone: "info" },
    resolved: { text: "已解决", tone: "success" }
  },
  user: {
    active: { text: "正常", tone: "success" },
    banned: { text: "已封禁", tone: "danger" }
  }
};

export function adminStatusLabel(kind, value) {
  return labels[kind]?.[value] || { text: value || "未知", tone: "muted" };
}

export function requiresConfirmation(action, target) {
  const name = target || "该对象";
  if (action === "ban-user") {
    return {
      required: true,
      label: "确认封禁",
      detail: `封禁 ${name} 后，该用户不能继续登录或使用聊天 API。`
    };
  }
  if (action === "delete-message") {
    return {
      required: true,
      label: "确认删除",
      detail: `删除 ${name} 后，聊天中将不再显示这条消息。`
    };
  }
  return { required: false, label: "", detail: "" };
}
