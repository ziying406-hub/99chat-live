export const ADMIN_TOKEN_KEY = "chatlite-admin-token";

export function buildAdminQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function resolveAdminApiBase() {
  const configured = globalThis.window?.CHAT_API_BASE || "";
  if (configured) return String(configured).replace(/\/$/, "");
  const origin = globalThis.window?.location?.origin || "";
  const host = globalThis.window?.location?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8080";
  return origin;
}

function createDefaultStorage() {
  return {
    getItem() {
      return "";
    },
    setItem() {},
    removeItem() {}
  };
}

export function createAdminApi({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage || createDefaultStorage(), apiBase = "" } = {}) {
  const base = String(apiBase || resolveAdminApiBase()).replace(/\/$/, "");

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = storage.getItem(ADMIN_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetchImpl(`${base}${path}`, {
      ...options,
      headers
    });

    if (response.status === 401) storage.removeItem(ADMIN_TOKEN_KEY);
    if (!response.ok) {
      const text = typeof response.text === "function" ? await response.text() : "";
      throw new Error(text || `admin request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return {
    token: () => storage.getItem(ADMIN_TOKEN_KEY),
    setToken: token => storage.setItem(ADMIN_TOKEN_KEY, token),
    clearToken: () => storage.removeItem(ADMIN_TOKEN_KEY),
    login: payload => request("/api/admin/auth/login", { method: "POST", body: JSON.stringify(payload) }),
    logout: () => request("/api/admin/auth/logout", { method: "POST" }),
    me: () => request("/api/admin/auth/me"),
    getDashboard: () => request("/api/admin/dashboard"),
    listUsers: filters => request(`/api/admin/users${buildAdminQuery(filters)}`),
    listGroups: filters => request(`/api/admin/groups${buildAdminQuery(filters)}`),
    listMessages: filters => request(`/api/admin/messages${buildAdminQuery(filters)}`),
    listReports: filters => request(`/api/admin/reports${buildAdminQuery(filters)}`),
    listFeedback: filters => request(`/api/admin/feedback${buildAdminQuery(filters)}`),
    listFiles: filters => request(`/api/admin/files${buildAdminQuery(filters)}`),
    listAuditLogs: filters => request(`/api/admin/audit-logs${buildAdminQuery(filters)}`),
    getSettings: () => request("/api/admin/settings"),
    updateSettings: payload => request("/api/admin/settings", { method: "POST", body: JSON.stringify(payload) }),
    listAdmins: () => request("/api/admin/admins"),
    createAdmin: payload => request("/api/admin/admins", { method: "POST", body: JSON.stringify(payload) }),
    updateAdminStatus: (id, disabled) => request(`/api/admin/admins/${id}/status`, { method: "POST", body: JSON.stringify({ disabled }) }),
    updateAdminRole: (id, role) => request(`/api/admin/admins/${id}/role`, { method: "POST", body: JSON.stringify({ role }) }),
    banUser: (id, reason) => request(`/api/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason }) }),
    unbanUser: id => request(`/api/admin/users/${id}/unban`, { method: "POST" }),
    deleteMessage: id => request(`/api/admin/messages/${id}`, { method: "DELETE" }),
    resolveReport: (id, payload) => request(`/api/admin/reports/${id}/resolve`, { method: "POST", body: JSON.stringify(payload) }),
    updateFeedback: (id, payload) => request(`/api/admin/feedback/${id}/status`, { method: "POST", body: JSON.stringify(payload) })
  };
}
