# Admin Settings And Admins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `系统设置` and `管理员与权限` placeholders with real admin settings and admin account management functionality.

**Architecture:** Extend the existing admin API and in-memory/Postgres-backed store with a small system settings model and admin account management methods. Reuse the existing admin permission middleware, audit log helper, admin shell, and table/action rendering style.

**Tech Stack:** Go HTTP server and tests under `apps/api/cmd/server`; vanilla JS admin app and Node tests under `apps/web/src`.

## Global Constraints

- Keep the `二期` menu label for `系统设置` and `管理员与权限`.
- Only `super_admin` should have settings update and admin management permissions.
- Mutating actions must write admin audit logs.
- Do not add custom role matrix editing in this change.

---

### Task 1: Backend Settings API

**Files:**
- Modify: `apps/api/cmd/server/main.go`
- Modify: `apps/api/cmd/server/main_test.go`

**Interfaces:**
- Produces: `AdminSystemSettings` JSON shape with `registrationEnabled`, `maxUploadBytes`, `maxGroupMembers`, `sensitiveWords`, `spamDetectionEnabled`.
- Produces: `GET /api/admin/settings` and `POST /api/admin/settings`.

- [ ] **Step 1: Write failing backend settings tests**

Add tests that call `GET /api/admin/settings`, update valid settings, reject invalid limits, and assert `system_settings_updated` audit log creation.

- [ ] **Step 2: Run the settings tests and verify they fail**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdminSystemSettings' -count=1`

- [ ] **Step 3: Implement the settings store and routes**

Add a settings struct, defaults, validation, permission-protected routes, and audit logging.

- [ ] **Step 4: Run settings tests and verify they pass**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdminSystemSettings' -count=1`

### Task 2: Backend Admin Account API

**Files:**
- Modify: `apps/api/cmd/server/main.go`
- Modify: `apps/api/cmd/server/main_test.go`

**Interfaces:**
- Produces: `GET /api/admin/admins`.
- Produces: `POST /api/admin/admins`.
- Produces: `POST /api/admin/admins/{id}/status`.
- Produces: `POST /api/admin/admins/{id}/role`.

- [ ] **Step 1: Write failing admin account tests**

Add tests for listing, creating, disabling/enabling, role updates, self-protection, and support permission denial.

- [ ] **Step 2: Run the admin account tests and verify they fail**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdminAccountManagement' -count=1`

- [ ] **Step 3: Implement admin account methods and routes**

Use the existing `adminUsers` map for local store behavior, hash new passwords, expose safe summaries, and audit changes.

- [ ] **Step 4: Run admin account tests and verify they pass**

Run: `./scripts/go-test.sh ./cmd/server -run 'TestAdminAccountManagement' -count=1`

### Task 3: Frontend API Client

**Files:**
- Modify: `apps/web/src/adminApi.js`
- Modify: `apps/web/src/adminApp.test.js`

**Interfaces:**
- Produces: `api.getSettings`, `api.updateSettings`, `api.listAdmins`, `api.createAdmin`, `api.updateAdminStatus`, `api.updateAdminRole`.

- [ ] **Step 1: Write failing frontend API/render tests for real pages**

Assert settings/admins pages no longer render the placeholder-only copy and include real form/table controls.

- [ ] **Step 2: Run web tests and verify they fail**

Run: `./scripts/web-test.sh adminApp`

- [ ] **Step 3: Implement client methods and render functions**

Wire loaders and renderers for settings and admins.

- [ ] **Step 4: Run focused web tests and verify they pass**

Run: `./scripts/web-test.sh adminApp`

### Task 4: Frontend Actions And Browser Smoke

**Files:**
- Modify: `apps/web/src/admin.js`
- Modify: `apps/web/src/adminApp.test.js`

**Interfaces:**
- Consumes: frontend API methods from Task 3.
- Produces: submit handlers for settings/admin create/admin status/admin role.

- [ ] **Step 1: Write failing action tests**

Assert mutating buttons/forms are permission-gated and emit the expected API calls.

- [ ] **Step 2: Run focused web tests and verify they fail**

Run: `./scripts/web-test.sh adminApp`

- [ ] **Step 3: Implement submit/click handlers**

Add form serialization, validation display, optimistic reloads, and toast feedback.

- [ ] **Step 4: Run full verification**

Run:

```bash
./scripts/go-test.sh ./cmd/server -count=1
./scripts/web-test.sh
git diff --check
```

- [ ] **Step 5: Browser smoke test**

Verify `/admin/settings` and `/admin/admins` show real controls locally and can complete at least one safe non-destructive update.
