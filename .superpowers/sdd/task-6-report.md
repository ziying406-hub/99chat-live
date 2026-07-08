# Task 6 Report: Full Verification And Smoke Test

## Status

DONE_WITH_CONCERNS

## Baseline

- Working directory: `/Users/ying/a/66chat`
- Starting commit: `d92d2c9`
- Branch: `codex-group-settings-parity`

## Commands Run And Exact Results

1. Required backend verification

```sh
./scripts/go-test.sh ./...
```

Result:

```text
ok  	chatclone/apps/api/cmd/server	9.816s
```

Re-run after fix:

```text
ok  	chatclone/apps/api/cmd/server	(cached)
```

2. Required frontend verification

```sh
./scripts/web-test.sh
```

Initial result before fixes:

```text
ℹ tests 203
ℹ pass 203
ℹ fail 0
```

Red test added for the verified regression:

```text
SyntaxError: The requested module './admin.js' does not provide an export named 'adminNavButtonAttrs'
✖ apps/web/src/adminApp.test.js
ℹ tests 202
ℹ pass 201
ℹ fail 1
```

Final result after fix:

```text
ℹ tests 206
ℹ pass 206
ℹ fail 0
```

3. Local API startup attempts

Attempt:

```sh
cd apps/api && go run ./cmd/server
```

Sandbox-blocked result:

```text
open /Users/ying/Library/Caches/go-build/...: operation not permitted
```

Successful startup used for smoke:

```sh
cd apps/api
source ../../scripts/dev-env.sh
export SEED_DEMO_DATA=true
go run ./cmd/server
```

Result:

```text
2026/07/08 20:27:19 chat api listening on http://localhost:8080
```

4. Static web startup attempts

Attempt:

```sh
python3 -m http.server 5173 -d apps/web
```

Sandbox-blocked result:

```text
PermissionError: [Errno 1] Operation not permitted
```

Retried with approval on `5173`:

```text
OSError: [Errno 48] Address already in use
```

Confirmed existing listener on `5173`:

```text
COMMAND   PID USER   FD   TYPE ... NAME
Python  16043 ying    5u  IPv6 ... TCP *:5173 (LISTEN)
```

Health check against that existing `5173` service:

```sh
curl -I http://127.0.0.1:5173/admin.html
```

Result:

```text
curl: (52) Empty reply from server
```

Successful startup used for smoke:

```sh
python3 -m http.server 5174 -d apps/web
```

Result:

```text
Serving HTTP on :: port 5174 (http://[::]:5174/) ...
```

Why `5174` was used:

- `5173` could not be reused for a trustworthy smoke because it was already occupied by an unrelated Python listener that returned `curl: (52) Empty reply from server` for `/admin.html`.
- Using `5174` let the static asset smoke run against a known-good local server for the exact same `apps/web` directory contents, isolating frontend behavior from that stale `5173` process.
- This port change did not alter the routing conclusion: plain `python3 -m http.server` serves files only and still has no history fallback for deep links such as `/admin/users`.

5. Local HTTP verification

```sh
curl -i http://127.0.0.1:8080/api/health
```

Result:

```text
HTTP/1.1 200 OK
{"ok":true,"time":"2026-07-08T20:24:40.251076+08:00"}
```

6. Admin login API verification

Before seeding:

```sh
curl -i -X POST http://127.0.0.1:8080/api/admin/auth/login -H 'Content-Type: application/json' --data '{"username":"admin","password":"admin123"}'
```

Result:

```text
HTTP/1.1 401 Unauthorized
{"error":"invalid credentials"}
```

After restarting with `SEED_DEMO_DATA=true`:

```text
HTTP/1.1 200 OK
{"token":"21ea79e6c23f099bf0ecd6f7bef4e08e8506339c6914b616","admin":{"id":"admin-1","username":"admin","role":"super_admin",...}}
```

7. Demo user login verification while banned

```sh
curl -i -X POST http://127.0.0.1:8080/api/auth/login -H 'Content-Type: application/json' --data '{"country":"+60","phone":"174319676","password":"demo123456"}'
```

While banned:

```text
HTTP/1.1 403 Forbidden
{"error":"account banned"}
```

After unban:

```text
HTTP/1.1 200 OK
{"token":"9853ca72854cc76d406b7a899de99e8c721c229415c54924","user":{"id":"u1",...}}
```

8. Audit log API spot check

```sh
curl -s http://127.0.0.1:8080/api/admin/audit-logs -H 'Authorization: Bearer 21ea79e6c23f099bf0ecd6f7bef4e08e8506339c6914b616'
```

Observed result after ban:

```text
[{"id":"admin-audit-1783513835872297000-1249","adminUserId":"admin-1","adminUsername":"admin","action":"user_banned","targetType":"user","targetId":"u1","detail":"spam","createdAt":"2026-07-08T20:30:35.872307+08:00"}]
```

## Smoke Steps And Results

1. Opened `http://127.0.0.1:5174/admin.html`
   - Login page rendered successfully.

2. Signed in with `admin / admin123`
   - Passed after restarting API with `SEED_DEMO_DATA=true`.
   - Dashboard rendered with nonzero counts:
     - `总用户 2`
     - `群组 3`
     - `消息 3`
     - `附件数 1`

3. Verified users screen
   - Initially failed because sidebar route buttons were rendered without explicit `type="button"`.
   - Root cause: route buttons defaulted to submit buttons, and the delegated click handler intentionally ignored `data-route` buttons whose computed type was `submit`.
   - After fix, `/admin/users` loaded and displayed 2 rows.

4. Banned demo user `u1` from the users screen with reason `spam`
   - UI updated to `已封禁`.
   - API login for demo user returned `403 {"error":"account banned"}`.

5. Verified messages screen
   - `/admin/messages` loaded with 3 rows.
   - Deleted message `m1` through the confirmation flow.
   - Table updated to 2 rows.

6. Verified reports screen
   - `/admin/reports` loaded successfully.
   - Empty state shown: `当前没有举报记录。`

7. Verified feedback screen
   - `/admin/feedback` loaded successfully.
   - Empty state shown: `当前没有反馈记录。`

8. Unbanned demo user `u1`
   - Users table returned to `正常`.
   - Demo user login succeeded again with `200 OK`.

9. Verified audit logs screen
   - `/admin/audit-logs` loaded successfully with 3 rows.
   - Confirmed presence of:
     - `user_banned`
     - `message_deleted`
     - `user_unbanned`

## Static Hosting And Fallback Reconciliation

- The manual browser smoke used `http://127.0.0.1:5174/admin.html` because `5173` was occupied by a broken pre-existing listener, not because Task 6 required a different app build.
- The frontend regression fix remained valid under a plain static host: loading `admin.html` and then navigating with the sidebar worked once the nav buttons rendered as `type="button"`.
- Separately, the Go server verification already proved the production-facing fallback path for `/admin/*`: when the admin SPA is served by the Go app, backend routing can hand admin deep links back to the SPA entry instead of returning a raw 404.
- What remains true is that `python3 -m http.server` does not provide that history fallback. Deep-link requests like `/admin/users` still depend on the Go server fallback (or another SPA-aware static host), while `admin.html` works as a direct entry file under plain static hosting.

## Files Changed

- `apps/web/src/admin.js`
- `apps/web/src/adminApp.test.js`
- `apps/web/src/adminApp.test.js`

## Commits Created

- `cecc018` - `fix: restore admin console navigation`

## PIDs And Cleanup

- API listener used for smoke: PID `15630` on `:8080`
- Static server used for smoke: PID `14240` on `:5174`
- Both processes were stopped before finishing.

## Issues And Concerns

1. The required smoke path did not work with a plain `go run ./cmd/server` in this environment.
   - Without `SEED_DEMO_DATA=true`, admin login returned `401 invalid credentials` because runtime startup defaulted to an empty store.
   - Smoke expectations in the brief depend on seeded admin/demo data.

2. Port `5173` was already occupied by another Python process (`PID 16043`) that returned `curl: (52) Empty reply from server`.
   - Smoke used `5174` instead.

3. Static `python3 -m http.server` does not provide SPA history fallback.
   - After client-side navigation to `/admin` or `/admin/users`, a full page reload returns `404 File not found`.
   - In-app navigation works after the button fix, so this did not block the smoke flow itself, but it remains a deployment/verification concern for static serving.
