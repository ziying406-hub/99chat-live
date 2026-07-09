# Admin Settings And Admins Implementation Spec

## Goal

Turn the `系统设置` and `管理员与权限` admin pages from second-phase placeholders into small, usable management screens.

## Scope

- `系统设置` becomes an editable system configuration page.
- `管理员与权限` becomes an admin account management page.
- Only `super_admin` can update settings or manage admin accounts.
- All mutating actions create admin audit logs.

## System Settings

The first editable settings set is intentionally small:

- `registrationEnabled`: whether user registration is open.
- `maxUploadBytes`: upload size limit in bytes.
- `maxGroupMembers`: group member limit.
- `sensitiveWords`: comma/newline editable sensitive word list.
- `spamDetectionEnabled`: whether basic spam detection is enabled.

Validation:

- `maxUploadBytes` must be between `1024` and `104857600`.
- `maxGroupMembers` must be between `2` and `5000`.
- `sensitiveWords` are trimmed, empty entries are removed, and duplicates are collapsed case-insensitively.

## Admin Accounts

The first admin management screen supports:

- List admins with username, role, status, created time, and permission count.
- Create an admin with username, password, and role.
- Disable and enable non-self admin accounts.
- Change a non-self admin account role.

Roles:

- `super_admin`
- `support`
- `moderator`
- `operator`

Safety rules:

- Admins cannot disable themselves.
- Admins cannot change their own role.
- Usernames must be unique and use letters, numbers, `_`, or `-`.
- New passwords must be at least 8 characters.

## API

Add these admin API routes:

- `GET /api/admin/settings`
- `POST /api/admin/settings`
- `GET /api/admin/admins`
- `POST /api/admin/admins`
- `POST /api/admin/admins/{id}/status`
- `POST /api/admin/admins/{id}/role`

Permission mapping:

- Settings read: `settings.view`
- Settings update: `settings.update`
- Admin list: `admins.view`
- Admin create: `admins.invite`
- Admin status update: `admins.disable`
- Admin role update: `admins.role_update`

## Frontend

The admin app should:

- Load settings data on `/admin/settings`.
- Render editable controls when `settings.update` is present.
- Render read-only settings values when update permission is missing.
- Load admin accounts on `/admin/admins`.
- Render create, status, and role controls only when the matching permissions are present.
- Keep the `二期` nav label for both menus until the broader second-phase feature set is complete.

## Testing

Backend tests cover:

- Settings can be read and updated by `super_admin`.
- Invalid settings are rejected.
- Settings updates create audit logs.
- Admins can be listed and created.
- Self disable and self role change are rejected.
- Support cannot update settings or manage admins.

Frontend tests cover:

- Settings page renders a real form instead of placeholder copy.
- Admins page renders a real admin table and create form instead of placeholder copy.
- Read-only permissions hide mutating controls.
