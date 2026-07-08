# Admin Management MVP Design

## Goal

Build a first usable admin management console for 66chat so operators can manage users, groups, messages, reports, feedback, and moderation actions from one protected interface.

The first version should favor operational usefulness over broad platform tooling. It should be small enough to implement safely against the current Go API and web app structure, while leaving clear room for roles, exports, realtime monitoring, and advanced risk controls later.

## Product Scope

### Included In MVP

- Admin sign-in and session handling.
- Dashboard with high-level counts for users, groups, messages, reports, feedback, and pending moderation work.
- User management with search, profile inspection, and ban/unban actions.
- Group management with search, group details, members, join mode, mute settings, blacklist, and basic moderation actions.
- Message management with search by user, group/conversation, keyword, and date range.
- Report management for user, group, and message reports.
- Feedback management for user-submitted feedback.
- File inspection for message attachments. File deletion is deferred; MVP removal happens by deleting the related message through moderation.
- Admin audit log for every sensitive action.

### Deferred

- Multi-role permission system beyond a simple admin/super-admin split.
- CSV export.
- Live operational monitoring.
- Automated content risk scoring.
- Bulk moderation.
- Advanced notification workflows.
- Dedicated mobile admin experience.

## Information Architecture

The admin console should use a separate route namespace from the chat product:

- `/admin/login`
- `/admin`
- `/admin/users`
- `/admin/groups`
- `/admin/messages`
- `/admin/reports`
- `/admin/feedback`
- `/admin/files`
- `/admin/audit-logs`

Navigation should be quiet and work-focused: persistent left navigation on desktop, compact top navigation on narrow screens, dense tables, clear filters, and detail drawers or detail pages for inspection.

## Data Model

The existing schema already covers most read surfaces:

- `users`
- `groups`
- `group_members`
- `group_blacklist`
- `group_audit_logs`
- `conversations`
- `messages`
- `message_attachments`
- `reports`
- `feedback`

MVP needs additional admin-specific storage:

### `admin_users`

- `id`
- `username`
- `password_hash`
- `role`, initially `super_admin` or `admin`
- `created_at`
- `last_login_at`
- `disabled_at`

### `admin_sessions`

- `id`
- `admin_user_id`
- `token_hash`
- `expires_at`
- `created_at`
- `revoked_at`

### `admin_audit_logs`

- `id`
- `admin_user_id`
- `action`
- `target_type`
- `target_id`
- `detail`
- `created_at`

### User moderation fields

Add moderation state to `users`:

- `banned_at`
- `ban_reason`

This keeps account status easy to query from both admin and normal auth flows.

### Report and feedback status

Add status fields:

- `reports.status`
- `reports.resolution`
- `reports.resolved_by_admin_id`
- `reports.resolved_at`
- `feedback.status`
- `feedback.admin_note`
- `feedback.resolved_by_admin_id`
- `feedback.resolved_at`

## Admin API

Use `/api/admin/*` endpoints and require admin authentication on every route except login.

### Auth

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/auth/me`

### Dashboard

- `GET /api/admin/dashboard`

Returns aggregate counts and pending work:

- total users
- banned users
- total groups
- total messages
- open reports
- open feedback
- attachment count and total stored size when available

### Users

- `GET /api/admin/users`
- `GET /api/admin/users/{id}`
- `POST /api/admin/users/{id}/ban`
- `POST /api/admin/users/{id}/unban`

Filters:

- keyword
- status
- created date range

### Groups

- `GET /api/admin/groups`
- `GET /api/admin/groups/{id}`
- `GET /api/admin/groups/{id}/members`
- `POST /api/admin/groups/{id}/mute-all`
- `POST /api/admin/groups/{id}/unmute-all`
- `POST /api/admin/groups/{id}/blacklist/{userId}`
- `DELETE /api/admin/groups/{id}/blacklist/{userId}`

Filters:

- keyword
- join mode
- owner
- created date range

### Messages

- `GET /api/admin/messages`
- `GET /api/admin/messages/{id}`
- `DELETE /api/admin/messages/{id}`

Filters:

- keyword
- sender user id
- conversation id
- message type
- created date range

Deleting a message should record an admin audit log and leave enough metadata for later investigation.

### Reports

- `GET /api/admin/reports`
- `GET /api/admin/reports/{id}`
- `POST /api/admin/reports/{id}/resolve`

Statuses:

- `open`
- `reviewing`
- `resolved`
- `rejected`

### Feedback

- `GET /api/admin/feedback`
- `GET /api/admin/feedback/{id}`
- `POST /api/admin/feedback/{id}/status`

Statuses:

- `submitted`
- `reviewing`
- `resolved`

### Files

- `GET /api/admin/files`
- `GET /api/admin/files/{id}`

File deletion should be handled through message moderation in MVP so the action has user-visible context and audit history.

### Audit Logs

- `GET /api/admin/audit-logs`

Filters:

- admin user id
- action
- target type
- target id
- date range

## Frontend Design

The admin UI should be a separate admin shell, not mixed into the existing chat navigation.

Core screens:

- Login screen.
- Dashboard screen.
- Table screens for users, groups, messages, reports, feedback, files, and audit logs.
- Detail pages or right-side detail drawers for inspection and action.
- Confirmation dialogs for destructive actions such as banning users and deleting messages.

The visual language should be operational: compact spacing, clear tables, visible filters, calm colors, and strong status labels. It should not look like a marketing page.

## Security And Permissions

- Store admin passwords as bcrypt hashes.
- Store admin sessions using random tokens and hash tokens at rest.
- Require admin auth middleware for all `/api/admin/*` routes.
- Add authorization checks before sensitive actions.
- Never expose password hashes, session tokens, or internal auth fields to the frontend.
- Block banned normal users from logging in or using authenticated user APIs.
- Log every sensitive admin action.

## Data Flow

1. Admin signs in through `/admin/login`.
2. Frontend stores the admin session token using the same secure pattern as the existing user auth where practical.
3. Admin shell calls `/api/admin/auth/me` on load.
4. Table screens call paginated admin list endpoints.
5. Detail screens call a detail endpoint when opened.
6. Mutating actions call a focused endpoint and then refresh the affected table/detail data.
7. Every mutating endpoint writes an `admin_audit_logs` entry.

## Error Handling

- Invalid admin credentials show a generic login error.
- Expired admin sessions return `401` and redirect to `/admin/login`.
- Unauthorized admin actions return `403`.
- Missing target records return `404`.
- Destructive actions require confirmation and show the server result.
- List endpoints should return empty states rather than errors when filters match no rows.

## Testing Plan

Backend tests:

- Admin login succeeds and fails correctly.
- Admin middleware blocks unauthenticated requests.
- User ban/unban updates state and writes audit logs.
- Banned users cannot use normal auth flows.
- Message delete writes audit logs.
- Report and feedback status updates persist correctly.

Frontend tests:

- Admin login form validates required fields.
- Admin API client attaches admin auth token.
- Table filter helpers build expected query strings.
- Destructive action helpers require confirmation state.
- Status labels render the correct text and tone.

Manual smoke test:

- Start the API.
- Sign in as seeded admin.
- Open dashboard.
- Search a user.
- Ban and unban the user.
- Open reports and mark one resolved.
- Confirm audit logs show both actions.

## Rollout

1. Add admin database migrations and seed a local admin account.
2. Add backend admin auth and dashboard endpoints.
3. Add user, report, feedback, and audit endpoints.
4. Add group, message, and file inspection endpoints.
5. Add the admin frontend shell and login.
6. Add table/detail screens.
7. Add tests and local smoke checks.

## Success Criteria

- An admin can sign in through a dedicated admin route.
- The dashboard shows real aggregate data.
- Admin can search users and ban/unban an account.
- Admin can inspect groups, messages, reports, feedback, files, and audit logs.
- Admin can resolve reports and feedback.
- Admin can delete a message for moderation.
- Every sensitive action writes an admin audit log.
- Existing user-facing chat behavior remains unchanged except that banned users are blocked.
