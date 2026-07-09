export const adminRoutes = [
  { key: "dashboard", path: "/admin", label: "首页", permission: "dashboard.view" },
  { key: "users", path: "/admin/users", label: "用户", permission: "users.view" },
  { key: "groups", path: "/admin/groups", label: "群组", permission: "groups.view" },
  { key: "messages", path: "/admin/messages", label: "消息", permission: "messages.view" },
  { key: "reports", path: "/admin/reports", label: "举报", permission: "reports.view" },
  { key: "feedback", path: "/admin/feedback", label: "反馈", permission: "feedback.view" },
  { key: "files", path: "/admin/files", label: "文件", permission: "files.view" },
  { key: "audit-logs", path: "/admin/audit-logs", label: "审计", permission: "audit_logs.view" },
  { key: "settings", path: "/admin/settings", label: "系统设置", permission: "settings.view", stage: "二期" },
  { key: "admins", path: "/admin/admins", label: "管理员与权限", permission: "admins.view", stage: "二期" }
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

const rolePermissions = {
  super_admin: adminRoutes.map(route => route.permission).filter(Boolean).concat([
    "users.ban",
    "groups.mute",
    "groups.blacklist",
    "messages.delete",
    "reports.resolve",
    "feedback.update",
    "settings.update",
    "admins.invite",
    "admins.disable",
    "admins.role_update"
  ]),
  support: ["dashboard.view", "users.view", "reports.view", "feedback.view", "feedback.update"],
  moderator: ["dashboard.view", "users.view", "users.ban", "groups.view", "groups.mute", "groups.blacklist", "messages.view", "messages.delete", "reports.view", "reports.resolve", "files.view", "audit_logs.view"],
  operator: ["dashboard.view", "users.view", "groups.view", "messages.view", "reports.view", "feedback.view", "feedback.update", "files.view"]
};

export function adminStatusLabel(kind, value) {
  return labels[kind]?.[value] || { text: value || "未知", tone: "muted" };
}

export function hasAdminPermission(admin, permission) {
  if (!permission) return true;
  if (Array.isArray(admin?.permissions)) return admin.permissions.includes(permission);
  return Array.isArray(rolePermissions[admin?.role]) && rolePermissions[admin.role].includes(permission);
}

export function visibleAdminRoutes(admin) {
  if (!admin) return adminRoutes;
  return adminRoutes.filter(route => hasAdminPermission(admin, route.permission));
}

export function firstVisibleAdminPath(admin) {
  return visibleAdminRoutes(admin)[0]?.path || "/admin/login";
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
