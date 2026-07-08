# Chat PWA Functional Clone

This repository implements a legal, functionally equivalent chat PWA inspired by the inspected product scope. It does not reuse the original site's brand assets, private code, endpoints, keys, or protocols.

## What Is Included

- `apps/web`: a responsive installable PWA with auth, chats, contacts, groups, media, collections, reports, and profile screens.
- `apps/api`: a Go HTTP API with seeded chat data, auth/profile/contact/group/message/file/collection/report endpoints, and a lightweight WebSocket channel.
- `packages/contracts`: shared API and realtime event documentation.

## Run Locally

The web app can run without installing dependencies:

```sh
python3 -m http.server 5173 -d apps/web
```

Then open `http://localhost:5173`.

The Go API is dependency-free, but requires Go to be installed:

```sh
cd apps/api
go run ./cmd/server
```

The API listens on `http://localhost:8080`.

To enable PostgreSQL persistence:

```sh
cd apps/api
DATABASE_URL='postgresql://appuser:change-me@127.0.0.1:5432/appdb' go run ./cmd/server
```

Use `PORT=18080` or another port if `8080` is already running.

## Local Test Environment

This repo includes small helper scripts that set up stable local caches and the bundled Node runtime used in this environment:

```sh
./scripts/go-test.sh ./...
./scripts/web-test.sh
```

They avoid the two common setup issues on this machine:

- Go's default build cache permission errors
- `pnpm exec` missing `node` when the shell PATH is incomplete

If the bundled Node path changes, run the web test helper with `CODEX_NODE_BIN=/path/to/node/bin ./scripts/web-test.sh`.

## File Uploads

The API includes a local object-store compatible flow for first-version attachments:

- Set `UPLOAD_DIR=/path/to/uploads` to choose where files are stored. The default is `apps/api/uploads` when running from `apps/api`.
- Call `POST /api/files/sign` with `{ "name": "photo.png", "mimeType": "image/png", "size": 12345 }`.
- Upload the raw bytes with `PUT` to the returned `uploadUrl`.
- Store the returned `publicUrl` on the message attachment. Files are served from `/uploads/{id}/{name}`.

The web app's photo and file buttons now use this flow when the API is running, and fall back to local preview URLs in demo mode.

## Demo Account

- Country code: `+60`
- Phone: `174319676`
- Password: `demo123456`

The frontend also supports a local demo mode when the API is not running.

## Real Features Added

- Password registration with bcrypt hashes.
- Login tokens returned by `/api/auth/login` and `/api/auth/register`.
- Authenticated API calls via `Authorization: Bearer <token>`.
- Friend requests can be created, accepted, and rejected.
- Accepting a friend request creates contact rows in both directions.
- Group members can be invited, muted/unmuted, and removed.
- Profile edits, messages, groups, friend requests, member updates, and reports persist to PostgreSQL when `DATABASE_URL` is set.
