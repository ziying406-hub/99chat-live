# Admin Management MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable 66chat admin console with protected admin login, dashboard counts, user moderation, group/message inspection, report and feedback handling, file inspection, and admin audit logs.

**Architecture:** Add a separate `/api/admin/*` backend surface with admin session middleware and focused store methods, then add a separate `/admin` frontend shell that does not mix admin state into the chat workspace. Keep MVP state in the existing Go in-memory store and Postgres migration path, and keep frontend logic in small admin-specific helper modules with Node tests.

**Tech Stack:** Go HTTP API with bcrypt and existing store patterns, PostgreSQL-compatible schema migrations in `apps/api/cmd/server/db.go` and `apps/api/migrations/001_initial_schema.sql`, vanilla JavaScript frontend served from `apps/web`, Node built-in test runner, existing `scripts/go-test.sh` and `scripts/web-test.sh`.

## Global Constraints

- Use `/api/admin/*` endpoints and require admin authentication on every route except `POST /api/admin/auth/login`.
- Use separate admin routes: `/admin/login`, `/admin`, `/admin/users`, `/admin/groups`, `/admin/messages`, `/admin/reports`, `/admin/feedback`, `/admin/files`, `/admin/audit-logs`.
- Store admin passwords as bcrypt hashes.
- Store admin sessions using random tokens and hash tokens at rest.
- Never expose password hashes, session tokens, or internal auth fields to the frontend.
- Block banned normal users from logging in or using authenticated user APIs.
- Every sensitive admin action must write an `admin_audit_logs` entry.
- File deletion is out of MVP scope; file removal happens by deleting the related message through moderation.
- Keep user-facing chat behavior unchanged except that banned users are blocked.
- Follow existing single-binary Go server patterns and existing vanilla JavaScript frontend patterns.

---

## File Structure

- Modify: `apps/api/migrations/001_initial_schema.sql`
  Add admin tables and moderation/status columns for durable Postgres installs.
- Modify: `apps/api/cmd/server/db.go`
  Add idempotent migration statements, admin seed data, Postgres store persistence for admin sessions, user bans, report/feedback status, and audit logs.
- Modify: `apps/api/cmd/server/main.go`
  Add admin types, in-memory fields, admin auth middleware, admin route registration, admin handlers, and normal-user banned checks.
- Modify: `apps/api/cmd/server/main_test.go`
  Add backend API tests for admin auth, dashboard, moderation, reports, feedback, files, audit logs, and banned-user blocking.
- Create: `apps/web/admin.html`
  Dedicated admin app entry page.
- Create: `apps/web/src/admin.js`
  Admin shell rendering, navigation, screen routing, table/detail actions, and browser event binding.
- Create: `apps/web/src/adminApi.js`
  Admin API base resolution, token storage, request helper, and endpoint wrappers.
- Create: `apps/web/src/adminApi.test.js`
  Tests for admin token attachment, query building, and auth failure handling.
- Create: `apps/web/src/adminStatus.js`
  Status label, route metadata, filter serialization, and destructive-action confirmation helpers.
- Create: `apps/web/src/adminStatus.test.js`
  Tests for labels, filters, and confirmation helper behavior.
- Modify: `apps/web/src/styles.css`
  Add compact admin shell styles scoped under `.admin-app`.
- Modify: `README.md`
  Add local admin account and smoke-test instructions after the feature is implemented.

---

### Task 1: Admin Data Model, Seed Account, And Auth Middleware

**Files:**
- Modify: `apps/api/migrations/001_initial_schema.sql`
- Modify: `apps/api/cmd/server/db.go`
- Modify: `apps/api/cmd/server/main.go`
- Modify: `apps/api/cmd/server/main_test.go`

**Interfaces:**
- Produces: `type AdminUser struct { ID string; Username string; Role string; CreatedAt time.Time; LastLoginAt *time.Time; DisabledAt *time.Time }`
- Produces: `type AdminSession struct { ID string; AdminUserID string; TokenHash string; ExpiresAt time.Time; CreatedAt time.Time; RevokedAt *time.Time }`
- Produces: `type AdminAuditLog struct { ID string; AdminUserID string; AdminUsername string; Action string; TargetType string; TargetID string; Detail string; CreatedAt time.Time }`
- Produces: `func (s *Store) requireAdmin(next func(http.ResponseWriter, *http.Request, AdminUser)) http.HandlerFunc`
- Produces: `POST /api/admin/auth/login`, `POST /api/admin/auth/logout`, `GET /api/admin/auth/me`
- Consumes: existing `hashPassword`, `checkPasswordHash`, `newID`, `writeJSON`, `writeError`, and `seedStore` patterns.

- [ ] **Step 1: Add failing admin login success test**

Add this test to `apps/api/cmd/server/main_test.go`:

```go
func TestAdminLoginReturnsTokenAndProfile(t *testing.T) {
	store := seedStore()
	mux := store.routes("")

	req := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(`{"username":"admin","password":"admin123"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected admin login 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var response struct {
		Token string    `json:"token"`
		Admin AdminUser `json:"admin"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode admin login response: %v", err)
	}
	if response.Token == "" {
		t.Fatal("expected admin token")
	}
	if response.Admin.Username != "admin" || response.Admin.Role != "super_admin" {
		t.Fatalf("unexpected admin profile: %+v", response.Admin)
	}
}
```

- [ ] **Step 2: Add failing admin middleware test**

Add this test to `apps/api/cmd/server/main_test.go`:

```go
func TestAdminRoutesRequireAdminToken(t *testing.T) {
	store := seedStore()
	mux := store.routes("")

	req := httptest.NewRequest(http.MethodGet, "/api/admin/auth/me", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without admin token, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 3: Run backend tests and verify the new tests fail**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(LoginReturnsTokenAndProfile|RoutesRequireAdminToken)' -count=1`

Expected: FAIL because admin routes and types are not implemented yet.

- [ ] **Step 4: Add admin schema**

Add these SQL objects to `apps/api/migrations/001_initial_schema.sql`:

```sql
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE reports ADD COLUMN resolution TEXT NOT NULL DEFAULT '';
ALTER TABLE reports ADD COLUMN resolved_by_admin_id TEXT;
ALTER TABLE reports ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback ADD COLUMN resolved_by_admin_id TEXT;
ALTER TABLE feedback ADD COLUMN resolved_at TIMESTAMPTZ;

CREATE INDEX idx_admin_sessions_token_hash ON admin_sessions(token_hash);
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
CREATE INDEX idx_reports_status_created_at ON reports(status, created_at);
CREATE INDEX idx_feedback_status_created_at ON feedback(status, created_at);
```

- [ ] **Step 5: Add idempotent Postgres migrations**

In `apps/api/cmd/server/db.go`, add matching `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS` statements inside the existing migration list. Use the same column names from Step 4.

- [ ] **Step 6: Add in-memory admin fields and seed account**

In `apps/api/cmd/server/main.go`, add store fields:

```go
adminUsers     map[string]AdminUserRecord
adminSessions  map[string]AdminSession
adminAuditLogs []AdminAuditLog
```

Define internal record type:

```go
type AdminUserRecord struct {
	AdminUser
	PasswordHash string `json:"-"`
}
```

Seed one local admin in `seedStore()`:

```go
adminHash, _ := hashPassword("admin123")
admin := AdminUserRecord{
	AdminUser: AdminUser{
		ID:        "admin-1",
		Username:  "admin",
		Role:      "super_admin",
		CreatedAt: now.Add(-48 * time.Hour),
	},
	PasswordHash: adminHash,
}
```

Assign `adminUsers: map[string]AdminUserRecord{admin.ID: admin}` and empty maps/slices for sessions and audit logs.

- [ ] **Step 7: Implement admin auth handlers**

In `routes`, register admin auth before the static handler:

```go
mux.HandleFunc("/api/admin/auth/login", s.adminLogin)
mux.HandleFunc("/api/admin/auth/logout", s.requireAdmin(s.adminLogout))
mux.HandleFunc("/api/admin/auth/me", s.requireAdmin(s.adminMe))
```

Implement login request and response:

```go
type adminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type adminLoginResponse struct {
	Token string    `json:"token"`
	Admin AdminUser `json:"admin"`
}
```

`adminLogin` must trim username, compare bcrypt password, reject disabled admins, create a random token using the existing token generation style, store a SHA-256 token hash in `adminSessions`, and return only the raw token once.

`requireAdmin` must read `Authorization: Bearer <token>`, hash the token, find a non-revoked non-expired session, load the admin user, and call the next handler. Invalid or missing tokens return `401`.

- [ ] **Step 8: Implement Postgres admin seed and session persistence**

In `apps/api/cmd/server/db.go`, seed the admin account during `seed`. Use bcrypt hash for `admin123`. Implement store helpers so admin login/session validation work in both in-memory and Postgres modes:

```go
func (s *Store) adminByUsername(ctx context.Context, username string) (AdminUserRecord, bool, error)
func (s *Store) saveAdminSession(ctx context.Context, session AdminSession) error
func (s *Store) adminBySessionToken(ctx context.Context, token string) (AdminUser, AdminSession, bool, error)
func (s *Store) revokeAdminSession(ctx context.Context, token string) error
```

- [ ] **Step 9: Run targeted backend tests**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(LoginReturnsTokenAndProfile|RoutesRequireAdminToken)' -count=1`

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add apps/api/migrations/001_initial_schema.sql apps/api/cmd/server/db.go apps/api/cmd/server/main.go apps/api/cmd/server/main_test.go
git commit -m "feat: add admin authentication"
```

---

### Task 2: Dashboard, User Moderation, And Banned User Blocking

**Files:**
- Modify: `apps/api/cmd/server/main.go`
- Modify: `apps/api/cmd/server/db.go`
- Modify: `apps/api/cmd/server/main_test.go`

**Interfaces:**
- Consumes: `requireAdmin` from Task 1.
- Produces: `GET /api/admin/dashboard`
- Produces: `GET /api/admin/users`
- Produces: `GET /api/admin/users/{id}`
- Produces: `POST /api/admin/users/{id}/ban`
- Produces: `POST /api/admin/users/{id}/unban`
- Produces: `func (s *Store) appendAdminAuditLog(ctx context.Context, admin AdminUser, action string, targetType string, targetID string, detail string) error`
- Produces: normal auth rejection with `403` and message `account banned` for banned users.

- [ ] **Step 1: Add failing dashboard test**

Add this helper and test to `apps/api/cmd/server/main_test.go`:

```go
func adminTokenForTest(t *testing.T, mux http.Handler) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(`{"username":"admin","password":"admin123"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin login failed: %d %s", rec.Code, rec.Body.String())
	}
	var response struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode admin token: %v", err)
	}
	return response.Token
}

func TestAdminDashboardReturnsCounts(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected dashboard 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var response map[string]int
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	if response["totalUsers"] == 0 || response["totalGroups"] == 0 || response["totalMessages"] == 0 {
		t.Fatalf("expected nonzero dashboard counts, got %+v", response)
	}
}
```

- [ ] **Step 2: Add failing user ban test**

```go
func TestAdminBanUserBlocksLoginAndWritesAudit(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/u-demo/ban", bytes.NewBufferString(`{"reason":"spam"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected ban 200, got %d: %s", rec.Code, rec.Body.String())
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","password":"demo123456"}`))
	loginRec := httptest.NewRecorder()
	mux.ServeHTTP(loginRec, loginReq)
	if loginRec.Code != http.StatusForbidden {
		t.Fatalf("expected banned login 403, got %d: %s", loginRec.Code, loginRec.Body.String())
	}
	if len(store.adminAuditLogs) != 1 || store.adminAuditLogs[0].Action != "user_banned" {
		t.Fatalf("expected user_banned audit log, got %+v", store.adminAuditLogs)
	}
}
```

- [ ] **Step 3: Run backend tests and verify they fail**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DashboardReturnsCounts|BanUserBlocksLoginAndWritesAudit)' -count=1`

Expected: FAIL because dashboard and user moderation routes are not implemented.

- [ ] **Step 4: Implement admin dashboard and user routes**

Register:

```go
mux.HandleFunc("/api/admin/dashboard", s.requireAdmin(s.adminDashboard))
mux.HandleFunc("/api/admin/users", s.requireAdmin(s.adminUsersRoute))
mux.HandleFunc("/api/admin/users/", s.requireAdmin(s.adminUserRoute))
```

Implement:

```go
type adminDashboardResponse struct {
	TotalUsers      int `json:"totalUsers"`
	BannedUsers     int `json:"bannedUsers"`
	TotalGroups     int `json:"totalGroups"`
	TotalMessages   int `json:"totalMessages"`
	OpenReports     int `json:"openReports"`
	OpenFeedback    int `json:"openFeedback"`
	AttachmentCount int `json:"attachmentCount"`
	AttachmentBytes int `json:"attachmentBytes"`
}
```

`adminUsersRoute` must support `GET` with `keyword`, `status`, `from`, and `to` query parameters. `adminUserRoute` must support `GET`, `POST /ban`, and `POST /unban`.

- [ ] **Step 5: Implement banned checks for normal users**

Add `BannedAt *time.Time` and `BanReason string` to the normal `User` type or a private user record used by auth. Ensure `login`, `codeLogin`, and `requireAuth` reject banned users with `403`.

- [ ] **Step 6: Implement Postgres persistence**

In `db.go`, add store methods for counting dashboard data, searching users, setting ban state, and writing admin audit logs. Update user scans to include ban fields.

- [ ] **Step 7: Run targeted backend tests**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DashboardReturnsCounts|BanUserBlocksLoginAndWritesAudit)' -count=1`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add apps/api/cmd/server/main.go apps/api/cmd/server/db.go apps/api/cmd/server/main_test.go
git commit -m "feat: add admin dashboard and user moderation"
```

---

### Task 3: Admin Content, Reports, Feedback, Files, And Audit APIs

**Files:**
- Modify: `apps/api/cmd/server/main.go`
- Modify: `apps/api/cmd/server/db.go`
- Modify: `apps/api/cmd/server/main_test.go`

**Interfaces:**
- Consumes: `requireAdmin` and `appendAdminAuditLog`.
- Produces: `GET /api/admin/groups`, `GET /api/admin/groups/{id}`, `GET /api/admin/groups/{id}/members`, `POST /api/admin/groups/{id}/mute-all`, `POST /api/admin/groups/{id}/unmute-all`
- Produces: `GET /api/admin/messages`, `GET /api/admin/messages/{id}`, `DELETE /api/admin/messages/{id}`
- Produces: `GET /api/admin/reports`, `GET /api/admin/reports/{id}`, `POST /api/admin/reports/{id}/resolve`
- Produces: `GET /api/admin/feedback`, `GET /api/admin/feedback/{id}`, `POST /api/admin/feedback/{id}/status`
- Produces: `GET /api/admin/files`, `GET /api/admin/files/{id}`
- Produces: `GET /api/admin/audit-logs`

- [ ] **Step 1: Add failing message delete audit test**

```go
func TestAdminDeleteMessageWritesAuditLog(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	messageID := store.messages["group-21444"][0].ID
	req := httptest.NewRequest(http.MethodDelete, "/api/admin/messages/"+messageID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected delete 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if messageExists(store.messages["group-21444"], messageID) {
		t.Fatal("message still exists after admin delete")
	}
	if len(store.adminAuditLogs) == 0 || store.adminAuditLogs[len(store.adminAuditLogs)-1].Action != "message_deleted" {
		t.Fatalf("expected message_deleted audit, got %+v", store.adminAuditLogs)
	}
}
```

- [ ] **Step 2: Add failing report resolution test**

```go
func TestAdminResolveReportUpdatesStatus(t *testing.T) {
	store := seedStore()
	store.reports = append(store.reports, Report{ID: "report-admin-1", TargetID: "u-demo", TargetType: "user", Reason: "spam", CreatedAt: time.Now()})
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/reports/report-admin-1/resolve", bytes.NewBufferString(`{"status":"resolved","resolution":"warning sent"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected resolve 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.reports[0].Status != "resolved" || store.reports[0].Resolution != "warning sent" {
		t.Fatalf("unexpected report state: %+v", store.reports[0])
	}
}
```

- [ ] **Step 3: Run backend tests and verify they fail**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DeleteMessageWritesAuditLog|ResolveReportUpdatesStatus)' -count=1`

Expected: FAIL because content and report admin routes are missing.

- [ ] **Step 4: Add status fields to API structs**

Extend `Report` with:

```go
Status            string     `json:"status"`
Resolution        string     `json:"resolution"`
ResolvedByAdminID string     `json:"resolvedByAdminId"`
ResolvedAt        *time.Time `json:"resolvedAt,omitempty"`
```

Extend `Feedback` with:

```go
AdminNote         string     `json:"adminNote"`
ResolvedByAdminID string     `json:"resolvedByAdminId"`
ResolvedAt        *time.Time `json:"resolvedAt,omitempty"`
```

When existing reports are created, default `Status` to `open`. Existing feedback already uses Chinese display statuses for user-facing screens; admin endpoints should normalize accepted updates to `submitted`, `reviewing`, or `resolved` and map user-facing text only in the chat UI if needed.

- [ ] **Step 5: Implement group and message admin handlers**

Register `/api/admin/groups`, `/api/admin/groups/`, `/api/admin/messages`, and `/api/admin/messages/`. Group list/detail endpoints should read existing groups and members. Message list should search across `s.messages` by query filters. Message delete should reuse the existing delete logic where possible, remove the message from its conversation, and append `message_deleted`.

- [ ] **Step 6: Implement reports, feedback, files, and audit handlers**

Register `/api/admin/reports`, `/api/admin/reports/`, `/api/admin/feedback`, `/api/admin/feedback/`, `/api/admin/files`, `/api/admin/files/`, and `/api/admin/audit-logs`. File endpoints should list `message_attachments` and include the related message id, conversation id, sender id, name, mime type, size, and public URL when available.

- [ ] **Step 7: Implement Postgres persistence**

In `db.go`, add SQL-backed methods for report status update, feedback status update, message lookup/delete, attachment listing, group/member listing, and audit log listing. Keep in-memory and Postgres response shapes identical.

- [ ] **Step 8: Run targeted backend tests**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DeleteMessageWritesAuditLog|ResolveReportUpdatesStatus)' -count=1`

Expected: PASS.

- [ ] **Step 9: Run full backend tests**

Run: `./scripts/go-test.sh ./cmd/server -count=1`

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add apps/api/cmd/server/main.go apps/api/cmd/server/db.go apps/api/cmd/server/main_test.go
git commit -m "feat: add admin moderation APIs"
```

---

### Task 4: Admin Frontend Helpers And Tests

**Files:**
- Create: `apps/web/src/adminApi.js`
- Create: `apps/web/src/adminApi.test.js`
- Create: `apps/web/src/adminStatus.js`
- Create: `apps/web/src/adminStatus.test.js`

**Interfaces:**
- Produces: `ADMIN_TOKEN_KEY = "chatlite-admin-token"`
- Produces: `buildAdminQuery(params)` returning a query string beginning with `?` or an empty string.
- Produces: `createAdminApi({ fetchImpl, storage, apiBase })`
- Produces: `adminStatusLabel(kind, value)` returning `{ text, tone }`
- Produces: `adminRoutes` array with route metadata for dashboard, users, groups, messages, reports, feedback, files, and audit logs.
- Produces: `requiresConfirmation(action, target)` returning `{ required: true, label, detail }` for destructive actions.

- [ ] **Step 1: Add failing admin API tests**

Create `apps/web/src/adminApi.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_TOKEN_KEY, buildAdminQuery, createAdminApi } from "./adminApi.js";

test("buildAdminQuery omits empty values and encodes filters", () => {
  assert.equal(
    buildAdminQuery({ keyword: "Alice Chen", status: "", page: 2 }),
    "?keyword=Alice+Chen&page=2"
  );
});

test("admin API attaches bearer token", async () => {
  const calls = [];
  const storage = new Map([[ADMIN_TOKEN_KEY, "admin-token"]]);
  const api = createAdminApi({
    apiBase: "http://api.test",
    storage: {
      getItem: key => storage.get(key) || "",
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  });

  await api.getDashboard();
  assert.equal(calls[0].url, "http://api.test/api/admin/dashboard");
  assert.equal(calls[0].options.headers.Authorization, "Bearer admin-token");
});
```

- [ ] **Step 2: Add failing admin status tests**

Create `apps/web/src/adminStatus.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { adminRoutes, adminStatusLabel, requiresConfirmation } from "./adminStatus.js";

test("admin route metadata includes all MVP sections", () => {
  assert.deepEqual(adminRoutes.map(route => route.key), [
    "dashboard",
    "users",
    "groups",
    "messages",
    "reports",
    "feedback",
    "files",
    "audit-logs"
  ]);
});

test("status labels map report states", () => {
  assert.deepEqual(adminStatusLabel("report", "resolved"), { text: "已解决", tone: "success" });
  assert.deepEqual(adminStatusLabel("report", "open"), { text: "待处理", tone: "warning" });
});

test("destructive admin actions require confirmation copy", () => {
  assert.deepEqual(requiresConfirmation("ban-user", "Alice"), {
    required: true,
    label: "确认封禁",
    detail: "封禁 Alice 后，该用户不能继续登录或使用聊天 API。"
  });
});
```

- [ ] **Step 3: Run web tests and verify they fail**

Run: `./scripts/web-test.sh`

Expected: FAIL because `adminApi.js` and `adminStatus.js` do not exist.

- [ ] **Step 4: Implement `adminApi.js`**

Create `apps/web/src/adminApi.js` with:

```js
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

export function createAdminApi({ fetchImpl = fetch, storage = localStorage, apiBase = "" } = {}) {
  const base = String(apiBase || resolveAdminApiBase()).replace(/\/$/, "");
  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = storage.getItem(ADMIN_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${base}${path}`, { ...options, headers });
    if (response.status === 401) storage.removeItem(ADMIN_TOKEN_KEY);
    if (!response.ok) {
      const text = await response.text?.();
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
    banUser: (id, reason) => request(`/api/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason }) }),
    unbanUser: id => request(`/api/admin/users/${id}/unban`, { method: "POST" }),
    deleteMessage: id => request(`/api/admin/messages/${id}`, { method: "DELETE" }),
    resolveReport: (id, payload) => request(`/api/admin/reports/${id}/resolve`, { method: "POST", body: JSON.stringify(payload) }),
    updateFeedback: (id, payload) => request(`/api/admin/feedback/${id}/status`, { method: "POST", body: JSON.stringify(payload) })
  };
}

export function resolveAdminApiBase() {
  const configured = globalThis.window?.CHAT_API_BASE || "";
  if (configured) return String(configured).replace(/\/$/, "");
  const origin = globalThis.window?.location?.origin || "";
  const host = globalThis.window?.location?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8080";
  return origin;
}
```

- [ ] **Step 5: Implement `adminStatus.js`**

Create `apps/web/src/adminStatus.js` with route metadata, label maps, and confirmation copy matching the tests:

```js
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
    return { required: true, label: "确认封禁", detail: `封禁 ${name} 后，该用户不能继续登录或使用聊天 API。` };
  }
  if (action === "delete-message") {
    return { required: true, label: "确认删除", detail: `删除 ${name} 后，聊天中将不再显示这条消息。` };
  }
  return { required: false, label: "", detail: "" };
}
```

- [ ] **Step 6: Run web helper tests**

Run: `./scripts/web-test.sh`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/web/src/adminApi.js apps/web/src/adminApi.test.js apps/web/src/adminStatus.js apps/web/src/adminStatus.test.js
git commit -m "feat: add admin frontend helpers"
```

---

### Task 5: Admin Frontend Shell And Screens

**Files:**
- Create: `apps/web/admin.html`
- Create: `apps/web/src/admin.js`
- Modify: `apps/web/src/styles.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `createAdminApi`, `adminRoutes`, `adminStatusLabel`, and `requiresConfirmation`.
- Produces: dedicated admin app entry at `/admin.html` for static serving.
- Produces: browser route support for `/admin/login`, `/admin`, `/admin/users`, `/admin/groups`, `/admin/messages`, `/admin/reports`, `/admin/feedback`, `/admin/files`, `/admin/audit-logs` when served by the Go static route.

- [ ] **Step 1: Create admin HTML entry**

Create `apps/web/admin.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>66chat Admin</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body class="admin-body">
    <main id="admin-root" class="admin-app"></main>
    <script type="module" src="/src/admin.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement admin shell state and routing**

Create `apps/web/src/admin.js` with `state = { admin, section, loading, filters, rows, detail, error, toast, confirm }`. Derive section from `window.location.pathname`, map `/admin` to dashboard and `/admin/login` to login. On load, call `api.me()` if a token exists.

- [ ] **Step 3: Implement login screen**

Render a compact login form with username and password fields. On submit, call `api.login`, store token via `api.setToken`, set `state.admin`, navigate to `/admin`, and load dashboard.

- [ ] **Step 4: Implement dashboard screen**

Call `api.getDashboard()` and render count tiles for `totalUsers`, `bannedUsers`, `totalGroups`, `totalMessages`, `openReports`, `openFeedback`, `attachmentCount`, and `attachmentBytes`.

- [ ] **Step 5: Implement table screens**

For each route, call the matching list method and render a dense table:

```js
const loaders = {
  users: filters => api.listUsers(filters),
  groups: filters => api.listGroups(filters),
  messages: filters => api.listMessages(filters),
  reports: filters => api.listReports(filters),
  feedback: filters => api.listFeedback(filters),
  files: filters => api.listFiles(filters),
  "audit-logs": filters => api.listAuditLogs(filters)
};
```

Each table must include a keyword filter input and an empty state. Reports and feedback must show status labels using `adminStatusLabel`.

- [ ] **Step 6: Implement moderation actions**

Add buttons for:

- Ban user.
- Unban user.
- Delete message.
- Resolve report.
- Update feedback status.

Use `requiresConfirmation` before ban and delete. After each action, refresh the current table and show a toast.

- [ ] **Step 7: Add admin CSS**

Append styles scoped to `.admin-body` and `.admin-app`. Include layout, side nav, top bar, login form, stat grid, filters, tables, status pills, modal confirmation, toast, and responsive behavior below 760px.

- [ ] **Step 8: Update README**

Add:

```md
## Admin Console

- URL: `http://localhost:5173/admin.html`
- Username: `admin`
- Password: `admin123`

The first admin console includes dashboard counts, users, groups, messages, reports, feedback, files, and audit logs. The API must be running on `http://localhost:8080` for live admin data.
```

- [ ] **Step 9: Run web tests**

Run: `./scripts/web-test.sh`

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

```bash
git add apps/web/admin.html apps/web/src/admin.js apps/web/src/styles.css README.md
git commit -m "feat: add admin console UI"
```

---

### Task 6: Full Verification And Smoke Test

**Files:**
- Modify only files needed to fix failures found by this task.

**Interfaces:**
- Consumes: all endpoints and frontend modules from Tasks 1-5.
- Produces: verified local admin MVP.

- [ ] **Step 1: Run full backend tests**

Run: `./scripts/go-test.sh ./...`

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run: `./scripts/web-test.sh`

Expected: PASS.

- [ ] **Step 3: Start API for manual smoke**

Run: `cd apps/api && go run ./cmd/server`

Expected: API listens on `http://localhost:8080`.

- [ ] **Step 4: Start static web app**

Run in a second terminal: `python3 -m http.server 5173 -d apps/web`

Expected: web app listens on `http://localhost:5173`.

- [ ] **Step 5: Manual browser smoke**

Open `http://localhost:5173/admin.html` and verify:

- Sign in with `admin` / `admin123`.
- Dashboard shows nonzero user, group, and message counts.
- Users table loads.
- Ban and unban the demo user.
- Reports table loads.
- Feedback table loads.
- Messages table loads and a message can be deleted after confirmation.
- Audit logs show `user_banned`, `user_unbanned`, and `message_deleted`.
- Demo user login is blocked while banned and works after unban.

- [ ] **Step 6: Commit verification fixes**

If Step 1-5 required fixes, commit them:

```bash
git add apps/api apps/web README.md
git commit -m "fix: stabilize admin console smoke flow"
```

If no fixes were needed, do not create an empty commit.

