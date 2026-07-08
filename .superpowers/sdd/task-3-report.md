What I implemented
- Added Task 3 admin API routes for groups, messages, reports, feedback, files, and admin audit logs in `apps/api/cmd/server/main.go`.
- Extended `Report` with `targetType`, `status`, `resolution`, `resolvedByAdminId`, and `resolvedAt`.
- Extended `Feedback` with `adminNote`, `resolvedByAdminId`, and `resolvedAt`.
- Implemented admin group list/detail/member listing plus mute-all and unmute-all updates.
- Implemented admin message list/detail and admin message delete with `message_deleted` admin audit logging.
- Implemented admin report list/detail and resolve flow with status persistence.
- Implemented admin feedback list/detail and status update flow with normalized admin statuses `submitted`, `reviewing`, and `resolved`.
- Implemented admin file list/detail over `message_attachments`.
- Implemented admin audit log listing.
- Added Postgres-backed loading and query/update helpers so in-memory and SQL-backed paths return the same shapes.
- Added the two required Task 3 tests and kept existing backend tests green.

What I tested and test results
- `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DeleteMessageWritesAuditLog|ResolveReportUpdatesStatus)' -count=1`
  - Result: PASS
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS

TDD Evidence
- RED command/output
  - Command: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DeleteMessageWritesAuditLog|ResolveReportUpdatesStatus)' -count=1`
  - Output:
    ```text
    # chatclone/apps/api/cmd/server [chatclone/apps/api/cmd/server.test]
    cmd/server/main_test.go:142:89: unknown field TargetType in struct literal of type Report
    cmd/server/main_test.go:154:22: store.reports[0].Status undefined (type Report has no field or method Status)
    cmd/server/main_test.go:154:63: store.reports[0].Resolution undefined (type Report has no field or method Resolution)
    FAIL    chatclone/apps/api/cmd/server [build failed]
    FAIL
    ```
- GREEN command/output
  - Command: `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DeleteMessageWritesAuditLog|ResolveReportUpdatesStatus)' -count=1`
  - Output:
    ```text
    ok      chatclone/apps/api/cmd/server    1.075s
    ```

Files changed
- `apps/api/cmd/server/main.go`
- `apps/api/cmd/server/db.go`
- `apps/api/cmd/server/main_test.go`

Self-review findings
- Admin mutation endpoints now write admin audit records for group mute/unmute, message delete, report resolve, and feedback status updates.
- User-facing feedback creation still returns the existing Chinese status `已提交`; admin status updates persist normalized English statuses as required by the brief.
- Message delete for admins reuses the shared delete pipeline through a forced-delete helper, so conversation preview refresh and SQL deletion stay aligned with existing behavior.

Any issues or concerns
- I did not add extra endpoint-specific coverage beyond the two tests required by the brief; the full backend suite passed, but the new list/detail endpoints rely mostly on integration through existing helpers rather than dedicated new assertions.

## Review Fixes After `ff3d757..504f6c8`

What changed
- Moved Task 3 admin mutation audit handling into store mutation paths so success now requires both the state change and admin audit persistence for `mute-all`/`unmute-all`, admin message delete, report resolve/reopen, and feedback status updates.
- Added transactional Postgres writes for those Task 3 admin mutations so the data change and `admin_audit_logs` insert commit together.
- Added in-memory rollback-safe behavior using the existing audit hook seam so Task 3 mutations do not mutate state when audit logging fails.
- Normalized admin feedback read responses to stable statuses `submitted`, `reviewing`, and `resolved` for both `/api/admin/feedback` and `/api/admin/feedback/{id}` while leaving user-facing feedback creation unchanged.
- Fixed dashboard counting to use normalized feedback semantics and to treat blank report statuses as open consistently with the in-memory path.
- Added focused tests for feedback status normalization, dashboard open-feedback count after resolution, and Task 3 audit-failure rollback on group mute-all.

Exact test results
- `./scripts/go-test.sh ./cmd/server -run 'TestAdmin(DeleteMessageWritesAuditLog|ResolveReportUpdatesStatus|FeedbackRoutesNormalizeStatusAndDashboardCounts|MuteAllRollsBackWhenAuditFails)' -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	1.170s`)
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	9.294s`)

## Review Fixes After `55528f1`

What changed
- Kept admin feedback APIs normalized by returning `submitted` / `reviewing` / `resolved` from admin list, detail, and status-update responses.
- Restored user-facing feedback history semantics by persisting admin-updated feedback statuses in the existing Chinese values `已提交` / `处理中` / `已解决`, and by mapping any legacy normalized values back to Chinese in `/api/feedback`.
- Normalized `GET /api/admin/reports?status=open` SQL filtering so blank legacy report statuses are treated as `open`, matching the in-memory path.
- Added focused regression coverage proving admin updates do not leak English feedback statuses into the user-facing feedback history.

Exact test results
- `./scripts/go-test.sh ./cmd/server -run 'Test(AdminDeleteMessageWritesAuditLog|AdminResolveReportUpdatesStatus|AdminFeedbackRoutesNormalizeStatusAndDashboardCounts|UserFeedbackHistoryKeepsChineseStatusAfterAdminUpdate|AdminReportsTreatBlankStatusAsOpen|AdminMuteAllRollsBackWhenAuditFails)' -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	0.960s`)
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	9.945s`)

## Review Fixes After `fbbedfa`

What changed
- Fixed `inferReportTargetType` so `group-*` ids infer `group` instead of `message`, matching report storage and admin filtering expectations.
- Tightened `POST /api/reports` validation to reject unsupported `targetType` values before persistence, and moved the in-memory append to after successful persistence so failed writes do not leave phantom reports behind.
- Added shared live-state update helpers for admin `mute-all` and admin message delete, then used them from the Postgres-backed paths after commit so `s.groups`, `s.discoverGroups`, `s.messages`, and conversation previews stay in sync with SQL changes in-process.
- Kept the live group update narrow to `AllMuted` only, so Postgres admin mute/unmute does not accidentally overwrite existing in-memory member lists or other cached group fields.

Exact test results
- `./scripts/go-test.sh ./cmd/server -run 'Test(AdminDeleteMessageWritesAuditLog|AdminResolveReportUpdatesStatus|InferReportTargetTypeUsesGroupForGroupIDs|ReportsRejectInvalidTargetTypeWithoutAppending|ApplyAdminGroupAllMutedUpdatesLiveState|ApplyAdminDeleteMessageUpdatesLiveStateAndPreview)' -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	1.026s`)
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	9.522s`)

Notes
- I did not add a true Postgres integration test because this workspace does not provide an external test database in the current harness; the new focused tests instead cover the shared live-state helpers that the Postgres branches now call after commit.

## Review Fixes After `3525e8f`

What changed
- Split the user-facing `/api/feedback` response shape from the internal `Feedback` model so public feedback create/list responses now omit admin-only fields.
- Kept admin feedback endpoints unchanged so `/api/admin/feedback` and `/api/admin/feedback/{id}` still expose moderation metadata when needed.
- Extended `TestUserFeedbackHistoryKeepsChineseStatusAfterAdminUpdate` to verify the user-facing history still shows the Chinese status and does not leak `adminNote`, `resolvedByAdminId`, or `resolvedAt`.

Exact test results
- `./scripts/go-test.sh ./cmd/server -run 'TestUserFeedbackHistoryKeepsChineseStatusAfterAdminUpdate|TestFeedbackCanBeSubmittedAndListed' -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	0.905s`)
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	9.532s`)

## Review Fixes After `f4f20a9`

What changed
- Hardened admin feedback status validation so `/api/admin/feedback/{id}/status` only accepts `submitted`, `reviewing`, or `resolved` after normalizing legacy Chinese inputs.
- Unknown values such as `closed` or `foo` now return a 400-style error and do not mutate feedback state or write audit logs.
- Added regression coverage for rejecting an invalid status and for accepting the legacy Chinese `已解决` input while still normalizing the admin response to `resolved`.

Exact test results
- `./scripts/go-test.sh ./cmd/server -run 'TestAdminFeedbackStatusRejectsUnknownAndAcceptsLegacyChinese|TestAdminFeedbackRoutesNormalizeStatusAndDashboardCounts|TestUserFeedbackHistoryKeepsChineseStatusAfterAdminUpdate' -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	1.309s`)
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	10.122s`)

## Review Fixes After `58417b2`

What changed
- Fixed `GET /api/admin/reports?targetType=group` on the Postgres path so legacy rows with blank `target_type` are filtered using the same normalized semantics as the in-memory path.
- Kept the existing exact-match behavior for non-legacy rows while adding legacy fallback matching for blank `target_type` values based on the inferred report target type.
- Added a focused unit test for the SQL filter builder to lock in the legacy blank `target_type` normalization rule without requiring an external Postgres database.

Exact test results
- `./scripts/go-test.sh ./cmd/server -run 'TestAdminReportTargetTypeConditionIncludesLegacyBlankGroupTargetType|TestAdminReportsTreatBlankStatusAsOpen|TestInferReportTargetTypeUsesGroupForGroupIDs' -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	1.063s`)
- `./scripts/go-test.sh ./cmd/server -count=1`
  - Result: PASS (`ok  	chatclone/apps/api/cmd/server	10.203s`)
