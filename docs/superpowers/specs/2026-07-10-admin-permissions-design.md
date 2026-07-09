# Admin Permissions System Design

## Goal

Design the second-phase admin permission system for 66chat without implementing it yet. The system should let the product move from one seeded super administrator to multiple administrator roles with clear access boundaries, visible accountability, and safe rollout steps.

This design extends the current admin MVP. It does not replace the existing admin shell, admin session model, audit logs, or moderation endpoints.

## Non-Goals

- Do not implement database migrations in this design step.
- Do not add or modify admin API routes in this design step.
- Do not change current production admin authorization behavior in this design step.
- Do not add real role-management UI in this design step.
- Do not merge permission-system functionality into the current placeholder-page work.

## Current Baseline

The current admin MVP already has:

- A dedicated `/admin` frontend shell.
- Admin login and admin session handling.
- `admin_users` with a simple `role` field.
- `admin_sessions`.
- `admin_audit_logs`.
- Admin API routes under `/api/admin/*`.
- Sensitive operations such as user ban, message delete, report resolution, feedback updates, group mute, and group blacklist actions.
- Placeholder pages for `系统设置` and `管理员与权限`, both marked as second-phase features.

The current authorization model is intentionally simple: authenticated admins can reach the admin API. The next phase should introduce more precise permissions.

## Recommended Model

Use role-based access control with named permission keys.

Each admin has one role. Each role maps to a fixed set of permission keys. Backend authorization checks permission keys, not role names directly. This keeps the system flexible: future roles can be added by changing the role-permission matrix instead of rewriting each endpoint.

## Roles

### `super_admin`

Full access. Owns admin account management, role changes, system settings, and all moderation tools.

### `support`

Customer support role. Can inspect users, view reports, and handle feedback, but cannot delete content, alter system settings, or manage other admins.

### `moderator`

Content moderation role. Can inspect and act on users, groups, messages, reports, files, and related moderation workflows.

### `operator`

Operations role. Can view operational surfaces and update non-sensitive workflow statuses, but cannot perform destructive moderation or security-sensitive actions.

## Permission Keys

Use lowercase dot-separated keys:

- `dashboard.view`
- `users.view`
- `users.ban`
- `groups.view`
- `groups.mute`
- `groups.blacklist`
- `messages.view`
- `messages.delete`
- `reports.view`
- `reports.resolve`
- `feedback.view`
- `feedback.update`
- `files.view`
- `audit_logs.view`
- `settings.view`
- `settings.update`
- `admins.view`
- `admins.invite`
- `admins.disable`
- `admins.role_update`

Permission keys should be stable API contracts. Display names can change, but keys should not change casually once shipped.

## Permission Matrix

| Permission | Super Admin | Support | Moderator | Operator |
| --- | --- | --- | --- | --- |
| `dashboard.view` | Yes | Yes | Yes | Yes |
| `users.view` | Yes | Yes | Yes | Yes |
| `users.ban` | Yes | No | Yes | No |
| `groups.view` | Yes | No | Yes | Yes |
| `groups.mute` | Yes | No | Yes | No |
| `groups.blacklist` | Yes | No | Yes | No |
| `messages.view` | Yes | No | Yes | Yes |
| `messages.delete` | Yes | No | Yes | No |
| `reports.view` | Yes | Yes | Yes | Yes |
| `reports.resolve` | Yes | No | Yes | No |
| `feedback.view` | Yes | Yes | No | Yes |
| `feedback.update` | Yes | Yes | No | Yes |
| `files.view` | Yes | No | Yes | Yes |
| `audit_logs.view` | Yes | No | Yes | No |
| `settings.view` | Yes | No | No | No |
| `settings.update` | Yes | No | No | No |
| `admins.view` | Yes | No | No | No |
| `admins.invite` | Yes | No | No | No |
| `admins.disable` | Yes | No | No | No |
| `admins.role_update` | Yes | No | No | No |

## Data Model

Keep the first implementation simple by using a fixed role catalog in code and one role field on each admin user.

### Extend `admin_users`

The existing `role` field should move from the MVP values toward the second-phase role set:

- `super_admin`
- `support`
- `moderator`
- `operator`

Recommended additions:

- `display_name`
- `created_by_admin_id`
- `updated_at`
- `disabled_reason`

### Optional Future Table: `admin_role_assignments`

If role history becomes important, add a separate history table later:

- `id`
- `admin_user_id`
- `old_role`
- `new_role`
- `changed_by_admin_id`
- `reason`
- `created_at`

Do not add custom per-admin permission overrides in the first permission release. Overrides make audits harder and increase support burden.

## Backend Authorization Design

Add a small authorization layer after admin session validation.

Conceptual flow:

1. `requireAdmin` validates the admin session and loads the admin profile.
2. Route handlers declare the permission they need.
3. A helper checks whether the admin role has that permission.
4. Missing permission returns `403`.
5. Sensitive denied attempts are optionally written to audit logs.

Design rules:

- Login and logout need only session handling.
- Read endpoints require a `*.view` permission.
- Mutating endpoints require their specific action permission.
- Super admin should pass all checks.
- Unknown role should fail closed.
- Unknown permission key should fail closed.

## API Permission Mapping

| Endpoint | Required Permission |
| --- | --- |
| `GET /api/admin/dashboard` | `dashboard.view` |
| `GET /api/admin/users` | `users.view` |
| `GET /api/admin/users/{id}` | `users.view` |
| `POST /api/admin/users/{id}/ban` | `users.ban` |
| `POST /api/admin/users/{id}/unban` | `users.ban` |
| `GET /api/admin/groups` | `groups.view` |
| `GET /api/admin/groups/{id}` | `groups.view` |
| `GET /api/admin/groups/{id}/members` | `groups.view` |
| `POST /api/admin/groups/{id}/mute-all` | `groups.mute` |
| `POST /api/admin/groups/{id}/unmute-all` | `groups.mute` |
| `POST /api/admin/groups/{id}/blacklist/{userId}` | `groups.blacklist` |
| `DELETE /api/admin/groups/{id}/blacklist/{userId}` | `groups.blacklist` |
| `GET /api/admin/messages` | `messages.view` |
| `GET /api/admin/messages/{id}` | `messages.view` |
| `DELETE /api/admin/messages/{id}` | `messages.delete` |
| `GET /api/admin/reports` | `reports.view` |
| `GET /api/admin/reports/{id}` | `reports.view` |
| `POST /api/admin/reports/{id}/resolve` | `reports.resolve` |
| `GET /api/admin/feedback` | `feedback.view` |
| `GET /api/admin/feedback/{id}` | `feedback.view` |
| `POST /api/admin/feedback/{id}/status` | `feedback.update` |
| `GET /api/admin/files` | `files.view` |
| `GET /api/admin/files/{id}` | `files.view` |
| `GET /api/admin/audit-logs` | `audit_logs.view` |
| `GET /api/admin/settings` | `settings.view` |
| `POST /api/admin/settings` | `settings.update` |
| `GET /api/admin/admins` | `admins.view` |
| `POST /api/admin/admins/invite` | `admins.invite` |
| `POST /api/admin/admins/{id}/disable` | `admins.disable` |
| `POST /api/admin/admins/{id}/role` | `admins.role_update` |

## Frontend Design

The frontend should treat permissions as display and safety hints, not as the source of truth.

Frontend responsibilities:

- Hide nav items when the admin lacks the matching `*.view` permission.
- Hide or disable action buttons when the admin lacks action permissions.
- Show a clear empty or no-access state when a route is inaccessible.
- Redirect unauthorized deep links to a safe admin landing page.
- Keep all backend `403` errors readable.

Backend remains the authority. A hidden button is not enough.

## Admins And Permissions Page

When implemented later, `/admin/admins` should become the control surface for:

- Listing admins.
- Seeing username, display name, role, status, created time, last login time.
- Inviting or creating a new admin.
- Disabling an admin.
- Changing an admin role.
- Viewing recent admin security events.

First release should avoid custom permissions and only support assigning one of the fixed roles.

## System Settings Page

`/admin/settings` should remain separate from role management.

Settings should only be editable by `super_admin` with `settings.update`. Operators, support, and moderators should not see editable controls.

## Audit Logging

Every sensitive permission-system action must write an admin audit log:

- Admin invited.
- Admin disabled.
- Admin role changed.
- Admin password reset.
- Admin session revoked.
- System setting changed.

Denied attempts can be logged for sensitive actions, especially:

- Role updates.
- Admin disable attempts.
- System setting updates.
- Message delete attempts.

Audit detail should include old value, new value, target admin id, target username, and reason when available.

## Security Rules

- Only `super_admin` can create, disable, or change roles for other admins.
- A super admin cannot disable their own account.
- A super admin cannot demote the last active super admin.
- Disabled admins cannot log in.
- Existing sessions for a disabled admin should be revoked.
- Role changes should take effect on the next request, not only next login.
- Unknown roles and unknown permissions fail closed.
- Permission checks must happen on the server for every protected endpoint.
- Frontend route visibility is convenience only.

## Rollout Plan

### Phase 1: Backend Permission Helper Only

- Add fixed role-permission matrix in backend code.
- Add permission helper tests.
- Wire read-only checks for a small set of endpoints.
- Keep one seeded `super_admin`.

### Phase 2: Enforce Permissions On All Admin Endpoints

- Map every `/api/admin/*` route to a permission key.
- Add `403` tests per role.
- Add frontend handling for `403`.

### Phase 3: Admin List And Role Assignment

- Implement `/admin/admins` as a real page.
- Add admin list endpoint.
- Add role update endpoint.
- Add disable endpoint.
- Audit every change.

### Phase 4: Admin Invite And Security Center

- Add admin invite or password setup flow.
- Add admin session list and session revoke.
- Add password reset and password change flows.
- Add suspicious admin login audit events.

### Phase 5: System Settings

- Implement `/admin/settings`.
- Add settings read and update APIs.
- Audit settings changes.
- Add safe defaults and validation.

## Testing Plan

Backend tests:

- `super_admin` has every permission.
- Each role receives the expected permission set.
- Unknown role has no permissions.
- Unknown permission key is denied.
- Every admin endpoint rejects a role without the required permission.
- Sensitive permission-system mutations write audit logs.
- Last active super admin cannot be disabled or demoted.

Frontend tests:

- Nav hides modules without view permissions.
- Action buttons hide or disable without action permissions.
- Deep linked unauthorized pages show a no-access state or redirect.
- `403` API responses show readable copy.
- `super_admin` still sees every admin menu.

Manual smoke tests:

- Login as each role.
- Confirm visible menus match the permission matrix.
- Confirm blocked actions return `403`.
- Confirm allowed actions still work.
- Confirm audit logs capture sensitive actions.

## Open Decisions For Implementation

- Whether new admins are invited by username/password setup or created directly by super admin.
- Whether two-factor authentication is required before admin management goes live.
- Whether denied attempts should always be logged or only for sensitive modules.
- Whether `support` should be allowed to add internal notes to reports without resolving them.

These decisions do not block the design. They should be resolved before implementation planning.

## Success Criteria

- The system can express common operational roles without code duplication.
- Admin API authorization is enforced server-side.
- Frontend menus match the admin role.
- No non-super-admin can manage admins, roles, or system settings.
- Every sensitive admin-management action is auditable.
- The rollout can happen in phases without exposing half-built permissions to production users.
