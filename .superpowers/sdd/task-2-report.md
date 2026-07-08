# Task 2 Report

## What I Implemented

- Added admin dashboard route: `GET /api/admin/dashboard`
- Added admin user moderation routes:
  - `GET /api/admin/users`
  - `GET /api/admin/users/{id}`
  - `POST /api/admin/users/{id}/ban`
  - `POST /api/admin/users/{id}/unban`
- Added `appendAdminAuditLog(...)` with in-memory and Postgres persistence
- Added banned-user enforcement for:
  - password login
  - code login
  - authenticated routes via `requireAuth`
- Added user moderation persistence and scans in Postgres:
  - dashboard counters
  - user search/detail
  - ban/unban updates
  - ban fields on user reads/writes
- Preserved seed/demo compatibility used by existing tests:
  - `demo-token` remains valid in in-memory test mode
  - `u-demo` admin target is resolved to the seeded demo user

## What I Tested And Test Results

- Targeted Task 2 tests passed
- Full `./cmd/server` backend test suite passed

Commands:

```bash
./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DashboardReturnsCounts|BanUserBlocksLoginAndWritesAudit)' -count=1
./scripts/go-test.sh ./cmd/server -count=1
```

Results:

```text
ok  	chatclone/apps/api/cmd/server	0.937s
ok  	chatclone/apps/api/cmd/server	8.826s
```

## TDD Evidence

### RED

Command:

```bash
./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DashboardReturnsCounts|BanUserBlocksLoginAndWritesAudit)' -count=1
```

Output:

```text
--- FAIL: TestAdminDashboardReturnsCounts (0.15s)
    main_test.go:106: expected dashboard 200, got 404: 404 page not found
--- FAIL: TestAdminBanUserBlocksLoginAndWritesAudit (0.12s)
    main_test.go:127: expected ban 200, got 404: 404 page not found
FAIL
FAIL	chatclone/apps/api/cmd/server	0.966s
FAIL
```

### GREEN

Command:

```bash
./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DashboardReturnsCounts|BanUserBlocksLoginAndWritesAudit)' -count=1
```

Output:

```text
ok  	chatclone/apps/api/cmd/server	0.937s
```

## Files Changed

- `apps/api/cmd/server/main.go`
- `apps/api/cmd/server/db.go`
- `apps/api/cmd/server/main_test.go`

## Self-Review Findings

- No known failing tests remain in `./cmd/server`
- Ban enforcement is applied consistently at login, code login, and authenticated route entry
- Admin moderation writes audit records for both ban and unban
- Postgres user reads/writes were updated so ban state is not lost on persistence

## Issues Or Concerns

- No known functional concerns after the full `./cmd/server` test pass

## Fix After Review

- Fixed the in-memory `requireAuth` bypass so headerless demo-mode requests still reject the seeded user with `403 account banned` when that account has been banned.
- Reworked ban/unban to use one atomic store path:
  - in-memory updates ban state and admin audit log together under the same lock
  - Postgres performs the user update and admin audit insert in one transaction
- Added focused coverage for:
  - banned code-login rejection
  - banned `requireAuth` rejection without `Authorization` in in-memory mode
  - rollback behavior when audit logging fails during ban

Exact test results:

```text
$ ./scripts/go-test.sh ./cmd/server -run 'Test(AdminBanUserBlocks(LoginAndWritesAudit|CodeLogin|RequireAuthWithoutAuthorization|RollsBackWhenAuditFails)|CodeLoginRejectsBannedUser)' -count=1
ok  	chatclone/apps/api/cmd/server	0.974s

$ ./scripts/go-test.sh ./cmd/server -count=1
ok  	chatclone/apps/api/cmd/server	8.903s
```
