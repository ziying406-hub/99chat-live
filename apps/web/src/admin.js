import { createAdminApi } from "./adminApi.js";
import { adminRoutes, adminStatusLabel, requiresConfirmation } from "./adminStatus.js";

const api = createAdminApi();
const root = document.querySelector("#admin-root");
const protectedSections = new Set(adminRoutes.map(route => route.key));
const routeMap = new Map(adminRoutes.map(route => [route.path, route.key]));
const loaders = {
  users: filters => api.listUsers(filters),
  groups: filters => api.listGroups(filters),
  messages: filters => api.listMessages(filters),
  reports: filters => api.listReports(filters),
  feedback: filters => api.listFeedback(filters),
  files: filters => api.listFiles(filters),
  "audit-logs": filters => api.listAuditLogs(filters)
};

const state = {
  admin: null,
  section: deriveSection(window.location.pathname),
  loading: false,
  filters: {},
  rows: [],
  detail: null,
  error: "",
  toast: null,
  confirm: null
};

const dashboardStats = [
  ["totalUsers", "总用户"],
  ["bannedUsers", "封禁用户"],
  ["totalGroups", "群组"],
  ["totalMessages", "消息"],
  ["openReports", "待处理举报"],
  ["openFeedback", "待处理反馈"],
  ["attachmentCount", "附件数"],
  ["attachmentBytes", "附件体积"]
];

const tableMeta = {
  users: {
    title: "用户管理",
    description: "查看账号状态并执行封禁处理。",
    empty: "当前没有用户数据。",
    filterPlaceholder: "搜索用户 ID、昵称、手机号或 Chat ID"
  },
  groups: {
    title: "群组管理",
    description: "查看群组规模、群号与全员禁言状态。",
    empty: "当前没有群组数据。",
    filterPlaceholder: "搜索群组 ID、标题或群号"
  },
  messages: {
    title: "消息巡检",
    description: "快速定位异常内容并执行删除。",
    empty: "当前没有消息数据。",
    filterPlaceholder: "搜索消息 ID、会话、发送者或正文"
  },
  reports: {
    title: "举报处理",
    description: "处理待办举报并记录结论。",
    empty: "当前没有举报记录。",
    filterPlaceholder: "搜索举报 ID、目标 ID、原因或状态"
  },
  feedback: {
    title: "反馈跟进",
    description: "同步用户反馈进度与管理员备注。",
    empty: "当前没有反馈记录。",
    filterPlaceholder: "搜索反馈 ID、用户 ID、类型或内容"
  },
  files: {
    title: "文件审查",
    description: "查看上传附件、大小与来源会话。",
    empty: "当前没有文件记录。",
    filterPlaceholder: "搜索文件 ID、名称、类型或会话"
  },
  "audit-logs": {
    title: "审计日志",
    description: "查看后台操作留痕。",
    empty: "当前没有审计日志。",
    filterPlaceholder: "搜索操作、管理员、目标或详情"
  }
};

function deriveSection(pathname) {
  if (pathname === "/admin/login") return "login";
  if (pathname === "/admin.html") return "login";
  return routeMap.get(pathname) || "dashboard";
}

function routePath(section) {
  if (section === "login") return "/admin/login";
  return adminRoutes.find(route => route.key === section)?.path || "/admin";
}

function setFilter(section, nextKeyword) {
  state.filters[section] = {
    ...(state.filters[section] || {}),
    keyword: nextKeyword
  };
}

function currentKeyword() {
  return state.filters[state.section]?.keyword || "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function toast(message, tone = "success") {
  state.toast = { message, tone };
  render();
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    if (state.toast?.message === message) {
      state.toast = null;
      render();
    }
  }, 2800);
}

function applySectionRules() {
  const isProtected = protectedSections.has(state.section) || state.section === "dashboard";
  if (!state.admin && isProtected) {
    navigate("/admin/login", { replace: true, load: false });
    return false;
  }
  if (state.admin && state.section === "login") {
    navigate("/admin", { replace: true, load: false });
    return false;
  }
  return true;
}

function normalizeLoaderFilters(section, keyword) {
  if (!keyword) return {};
  if (section === "users") return { keyword };
  if (section === "messages") return { q: keyword };
  if (section === "files") return { q: keyword };
  return { keyword };
}

function haystackForRow(section, row) {
  if (section === "users") return [row.id, row.nickname, row.phone, row.chatId, row.status, row.banReason];
  if (section === "groups") return [row.id, row.title, row.chatId, row.announcement];
  if (section === "messages") return [row.id, row.conversationTitle, row.senderName, row.body, row.type];
  if (section === "reports") return [row.id, row.targetType, row.targetId, row.reason, row.status, row.resolution];
  if (section === "feedback") return [row.id, row.userId, row.type, row.text, row.status, row.adminNote];
  if (section === "files") return [row.id, row.name, row.mimeType, row.conversationId, row.senderId];
  return [row.id, row.action, row.adminUsername, row.targetType, row.targetId, row.detail];
}

function filterRows(section, rows, keyword) {
  const text = String(keyword || "").trim().toLowerCase();
  if (!text) return rows;
  return rows.filter(row => haystackForRow(section, row).some(value => String(value || "").toLowerCase().includes(text)));
}

async function loadSection(section = state.section) {
  if (!applySectionRules()) return;
  state.error = "";
  state.loading = true;
  render();

  try {
    if (section === "dashboard") {
      state.detail = await api.getDashboard();
      state.rows = [];
    } else if (loaders[section]) {
      const keyword = state.filters[section]?.keyword || "";
      const rawRows = await loaders[section](normalizeLoaderFilters(section, keyword));
      state.rows = filterRows(section, Array.isArray(rawRows) ? rawRows : [], keyword);
      state.detail = null;
    }
  } catch (error) {
    state.error = error.message || "加载失败";
    if (!api.token()) {
      api.clearToken();
      state.admin = null;
      navigate("/admin/login", { replace: true, load: false });
    }
  } finally {
    state.loading = false;
    render();
  }
}

function navigate(path, { replace = false, load = true } = {}) {
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  state.section = deriveSection(window.location.pathname);
  state.error = "";
  state.confirm = null;
  if (load) {
    loadSection();
  } else {
    render();
  }
}

async function bootstrap() {
  render();
  if (!api.token()) {
    applySectionRules();
    render();
    return;
  }
  state.loading = true;
  render();
  try {
    state.admin = await api.me();
  } catch (error) {
    api.clearToken();
    state.admin = null;
    state.error = deriveSection(window.location.pathname) === "login" ? "" : (error.message || "登录已过期");
  } finally {
    state.loading = false;
  }
  if (applySectionRules()) {
    loadSection();
  } else {
    render();
  }
}

function renderSidebar() {
  return `
    <aside class="admin-sidebar">
      <div class="admin-brand">
        <span class="admin-brand-mark">66</span>
        <div>
          <strong>66chat Admin</strong>
          <small>运营控制台</small>
        </div>
      </div>
      <nav class="admin-nav">
        ${adminRoutes.map(route => `
          <button class="admin-nav-link${state.section === route.key ? " active" : ""}" data-route="${route.path}">
            <span>${escapeHtml(route.label)}</span>
          </button>
        `).join("")}
      </nav>
    </aside>
  `;
}

function renderTopbar() {
  const meta = state.section === "dashboard"
    ? { title: "首页", description: "总览关键指标与待处理事项。" }
    : tableMeta[state.section];
  return `
    <header class="admin-topbar">
      <div>
        <h1>${escapeHtml(meta?.title || "管理员登录")}</h1>
        <p>${escapeHtml(meta?.description || "使用管理员账号登录后台控制台。")}</p>
      </div>
      <div class="admin-topbar-actions">
        <div class="admin-admin-chip">
          <strong>${escapeHtml(state.admin?.username || "未登录")}</strong>
          <span>${escapeHtml(state.admin?.role || "访客")}</span>
        </div>
        ${state.admin ? `<button class="ghost-btn inline admin-logout-btn" data-action="logout">退出</button>` : ""}
      </div>
    </header>
  `;
}

function renderError() {
  if (!state.error) return "";
  return `<div class="admin-banner admin-banner-error">${escapeHtml(state.error)}</div>`;
}

function renderLogin() {
  return `
    <section class="admin-login-shell">
      <div class="admin-login-card">
        <div class="admin-login-copy">
          <span class="admin-kicker">Admin Console</span>
          <h1>后台登录</h1>
          <p>使用管理员账号进入运营控制台，查看指标、执行内容治理与处理反馈。</p>
        </div>
        ${renderError()}
        <form class="admin-login-form" data-form="login">
          <label>
            <span>用户名</span>
            <input class="input admin-compact-input" type="text" name="username" placeholder="admin" required />
          </label>
          <label>
            <span>密码</span>
            <input class="input admin-compact-input" type="password" name="password" placeholder="admin123" required />
          </label>
          <button class="primary-btn" type="submit" ${state.loading ? "disabled" : ""}>${state.loading ? "登录中..." : "登录"}</button>
        </form>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const stats = state.detail || {};
  return `
    ${renderError()}
    <section class="admin-stats">
      ${dashboardStats.map(([key, label]) => `
        <article class="admin-stat-card">
          <span>${escapeHtml(label)}</span>
          <strong>${key === "attachmentBytes" ? escapeHtml(formatBytes(stats[key])) : escapeHtml(formatNumber(stats[key]))}</strong>
        </article>
      `).join("")}
    </section>
  `;
}

function statusPill(kind, value) {
  const status = adminStatusLabel(kind, value);
  return `<span class="admin-status-pill tone-${escapeHtml(status.tone)}">${escapeHtml(status.text)}</span>`;
}

function renderTableScreen() {
  const meta = tableMeta[state.section];
  return `
    ${renderError()}
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="filter">
        <input
          class="input admin-compact-input"
          type="search"
          name="keyword"
          value="${escapeHtml(currentKeyword())}"
          placeholder="${escapeHtml(meta.filterPlaceholder)}"
        />
        <button class="ghost-btn inline" type="submit">搜索</button>
      </form>
      <div class="admin-table-wrap">
        ${state.loading ? `<div class="admin-empty">正在加载...</div>` : renderTableContent(meta)}
      </div>
    </section>
  `;
}

function renderTableContent(meta) {
  if (!state.rows.length) {
    return `<div class="admin-empty">${escapeHtml(meta.empty)}</div>`;
  }
  if (state.section === "users") return renderUsersTable();
  if (state.section === "groups") return renderGroupsTable();
  if (state.section === "messages") return renderMessagesTable();
  if (state.section === "reports") return renderReportsTable();
  if (state.section === "feedback") return renderFeedbackTable();
  if (state.section === "files") return renderFilesTable();
  return renderAuditLogTable();
}

function renderUsersTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>用户</th><th>账号</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>
        ${state.rows.map(user => `
          <tr>
            <td><strong>${escapeHtml(user.nickname || "未命名")}</strong><small>${escapeHtml(user.id)}</small></td>
            <td>${escapeHtml(`${user.country || ""} ${user.phone || ""}`.trim() || "—")}<small>${escapeHtml(user.chatId || "—")}</small></td>
            <td>${statusPill("user", user.status)}${user.banReason ? `<small>${escapeHtml(user.banReason)}</small>` : ""}</td>
            <td>${escapeHtml(formatDate(user.createdAt))}</td>
            <td>
              <div class="admin-row-actions">
                ${user.status === "banned"
                  ? `<button class="ghost-btn inline" data-action="unban-user" data-id="${escapeHtml(user.id)}">解封</button>`
                  : `<button class="danger-btn inline" data-action="ban-user" data-id="${escapeHtml(user.id)}" data-name="${escapeHtml(user.nickname || user.id)}">封禁</button>`}
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderGroupsTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>群组</th><th>群号</th><th>成员</th><th>模式</th><th>创建时间</th></tr></thead>
      <tbody>
        ${state.rows.map(group => `
          <tr>
            <td><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.id)}</small></td>
            <td>${escapeHtml(group.chatId || "—")}</td>
            <td>${escapeHtml(String(group.members?.length || 0))}</td>
            <td>${group.allMuted ? `<span class="admin-inline-flag">全员禁言</span>` : "正常"}</td>
            <td>${escapeHtml(formatDate(group.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderMessagesTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>消息</th><th>会话</th><th>发送者</th><th>时间</th><th>操作</th></tr></thead>
      <tbody>
        ${state.rows.map(message => `
          <tr>
            <td>
              <strong>${escapeHtml(message.body || message.attachment?.name || message.type)}</strong>
              <small>${escapeHtml(message.id)}</small>
            </td>
            <td>${escapeHtml(message.conversationTitle || message.conversationId)}</td>
            <td>${escapeHtml(message.senderName || message.senderId)}</td>
            <td>${escapeHtml(formatDate(message.createdAt))}</td>
            <td>
              <div class="admin-row-actions">
                <button class="danger-btn inline" data-action="delete-message" data-id="${escapeHtml(message.id)}" data-name="${escapeHtml(message.body || message.id)}">删除</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderReportsTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>举报</th><th>目标</th><th>状态</th><th>处理结果</th><th>操作</th></tr></thead>
      <tbody>
        ${state.rows.map(report => `
          <tr>
            <td><strong>${escapeHtml(report.reason || "未填写原因")}</strong><small>${escapeHtml(report.id)}</small></td>
            <td>${escapeHtml(report.targetType || "—")}<small>${escapeHtml(report.targetId || "—")}</small></td>
            <td>${statusPill("report", report.status)}</td>
            <td>${escapeHtml(report.resolution || "—")}<small>${escapeHtml(formatDate(report.createdAt))}</small></td>
            <td>
              <div class="admin-row-actions">
                <button class="ghost-btn inline" data-action="resolve-report" data-id="${escapeHtml(report.id)}" data-status="resolved">解决</button>
                <button class="ghost-btn inline" data-action="resolve-report" data-id="${escapeHtml(report.id)}" data-status="rejected">驳回</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderFeedbackTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>反馈</th><th>用户</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
      <tbody>
        ${state.rows.map(item => `
          <tr>
            <td><strong>${escapeHtml(item.type || "反馈")}</strong><small>${escapeHtml(item.text || item.id)}</small></td>
            <td>${escapeHtml(item.userId || "—")}<small>${escapeHtml(item.id)}</small></td>
            <td>${statusPill("feedback", item.status)}</td>
            <td>${escapeHtml(item.adminNote || "—")}<small>${escapeHtml(formatDate(item.createdAt))}</small></td>
            <td>
              <div class="admin-row-actions">
                <button class="ghost-btn inline" data-action="feedback-status" data-id="${escapeHtml(item.id)}" data-status="reviewing">处理中</button>
                <button class="ghost-btn inline" data-action="feedback-status" data-id="${escapeHtml(item.id)}" data-status="resolved">已解决</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderFilesTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>文件</th><th>类型</th><th>来源</th><th>大小</th><th>时间</th></tr></thead>
      <tbody>
        ${state.rows.map(file => `
          <tr>
            <td>
              <strong><a href="${escapeHtml(file.publicUrl || "#")}" target="_blank" rel="noreferrer">${escapeHtml(file.name || file.id)}</a></strong>
              <small>${escapeHtml(file.id)}</small>
            </td>
            <td>${escapeHtml(file.mimeType || "—")}</td>
            <td>${escapeHtml(file.conversationId || "—")}<small>${escapeHtml(file.senderId || "—")}</small></td>
            <td>${escapeHtml(formatBytes(file.size))}</td>
            <td>${escapeHtml(formatDate(file.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAuditLogTable() {
  return `
    <table class="admin-table">
      <thead><tr><th>操作</th><th>管理员</th><th>目标</th><th>详情</th><th>时间</th></tr></thead>
      <tbody>
        ${state.rows.map(log => `
          <tr>
            <td><strong>${escapeHtml(log.action || "—")}</strong><small>${escapeHtml(log.id)}</small></td>
            <td>${escapeHtml(log.adminUsername || "—")}</td>
            <td>${escapeHtml(log.targetType || "—")}<small>${escapeHtml(log.targetId || "—")}</small></td>
            <td>${escapeHtml(log.detail || "—")}</td>
            <td>${escapeHtml(formatDate(log.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderConfirmModal() {
  if (!state.confirm) return "";
  return `
    <div class="admin-modal-backdrop">
      <div class="admin-modal">
        <div class="admin-modal-head">
          <h2>${escapeHtml(state.confirm.label)}</h2>
          <button class="icon-btn" type="button" data-action="close-confirm">✕</button>
        </div>
        <p>${escapeHtml(state.confirm.detail)}</p>
        <form class="admin-confirm-form" data-form="confirm">
          ${state.confirm.reasonRequired ? `
            <label>
              <span>处理原因</span>
              <textarea class="textarea admin-compact-input" name="reason" placeholder="请填写原因" required></textarea>
            </label>
          ` : ""}
          <div class="admin-modal-actions">
            <button class="ghost-btn inline" type="button" data-action="close-confirm">取消</button>
            <button class="danger-btn inline" type="submit">${escapeHtml(state.confirm.submitText || "确认")}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderToast() {
  if (!state.toast) return "";
  return `<div class="admin-toast tone-${escapeHtml(state.toast.tone)}">${escapeHtml(state.toast.message)}</div>`;
}

function renderShell() {
  if (state.section === "login") return `${renderLogin()}${renderToast()}`;
  return `
    <div class="admin-shell">
      ${renderSidebar()}
      <section class="admin-main">
        ${renderTopbar()}
        ${state.section === "dashboard" ? renderDashboard() : renderTableScreen()}
      </section>
    </div>
    ${renderConfirmModal()}
    ${renderToast()}
  `;
}

function render() {
  if (!root) return;
  root.innerHTML = renderShell();
}

async function submitLogin(form) {
  const formData = new FormData(form);
  state.loading = true;
  state.error = "";
  render();
  try {
    const response = await api.login({
      username: String(formData.get("username") || "").trim(),
      password: String(formData.get("password") || "")
    });
    api.setToken(response.token);
    state.admin = response.admin;
    toast("已进入后台");
    navigate("/admin");
  } catch (error) {
    state.error = error.message || "登录失败";
    state.loading = false;
    render();
  }
}

function openConfirm(action, id, name) {
  const copy = requiresConfirmation(action, name);
  state.confirm = {
    action,
    id,
    label: copy.label,
    detail: copy.detail,
    reasonRequired: action === "ban-user",
    submitText: action === "ban-user" ? "确认封禁" : "确认删除"
  };
  render();
}

async function handleConfirmedAction(form) {
  if (!state.confirm) return;
  const current = state.confirm;
  const reason = String(new FormData(form).get("reason") || "").trim();
  try {
    if (current.action === "ban-user") {
      await api.banUser(current.id, reason);
      toast("用户已封禁");
    } else if (current.action === "delete-message") {
      await api.deleteMessage(current.id);
      toast("消息已删除");
    }
    state.confirm = null;
    await loadSection();
  } catch (error) {
    state.error = error.message || "操作失败";
    render();
  }
}

async function handleAction(button) {
  if (button.dataset.route) {
    navigate(button.dataset.route);
    return;
  }

  const action = button.dataset.action;
  if (!action) return;

  if (action === "logout") {
    try {
      await api.logout();
    } catch {}
    api.clearToken();
    state.admin = null;
    state.rows = [];
    state.detail = null;
    toast("已退出登录");
    navigate("/admin/login", { replace: true, load: false });
    return;
  }

  if (action === "close-confirm") {
    state.confirm = null;
    render();
    return;
  }

  if (action === "ban-user" || action === "delete-message") {
    openConfirm(action, button.dataset.id || "", button.dataset.name || "");
    return;
  }

  try {
    if (action === "unban-user") {
      await api.unbanUser(button.dataset.id || "");
      toast("用户已解封");
    } else if (action === "resolve-report") {
      const status = button.dataset.status || "resolved";
      const resolution = window.prompt(status === "resolved" ? "请输入处理结果" : "请输入驳回说明", "");
      if (resolution === null) return;
      await api.resolveReport(button.dataset.id || "", { status, resolution: resolution.trim() });
      toast(status === "resolved" ? "举报已解决" : "举报已驳回");
    } else if (action === "feedback-status") {
      const status = button.dataset.status || "reviewing";
      const adminNote = window.prompt("请输入管理员备注（可留空）", "");
      if (adminNote === null) return;
      await api.updateFeedback(button.dataset.id || "", { status, adminNote: adminNote.trim() });
      toast("反馈状态已更新");
    }
    await loadSection();
  } catch (error) {
    state.error = error.message || "操作失败";
    render();
  }
}

root?.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.route && button.type === "submit") return;
  handleAction(button);
});

root?.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.form === "login") {
    submitLogin(form);
    return;
  }
  if (form.dataset.form === "filter") {
    const keyword = String(new FormData(form).get("keyword") || "").trim();
    setFilter(state.section, keyword);
    loadSection();
    return;
  }
  if (form.dataset.form === "confirm") {
    handleConfirmedAction(form);
  }
});

window.addEventListener("popstate", () => {
  state.section = deriveSection(window.location.pathname);
  loadSection();
});

bootstrap();
