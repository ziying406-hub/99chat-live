# 双方删除好友 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持双方解除好友关系，同时保留历史私聊并阻止后续私聊发送。

**Architecture:** 后端在 `contacts` 中原子删除双方方向的联系人记录，并广播好友实时状态更新。私聊发送前确认仍存在好友关系；前端在私聊设置提供确认操作，并同步清除已解除的会话选择。

**Tech Stack:** Go `net/http` 与 PostgreSQL，原生浏览器 JavaScript，Node 与 Go 测试。

## Global Constraints

- 不删除既有会话或消息。
- 解除后双方不可发送私聊，服务端必须拒绝。
- 保持现有 `/api/contacts/{id}` 路由和好友实时同步机制。

---

### Task 1: 服务端解除好友关系与私聊授权

**Files:**
- Modify: `apps/api/cmd/server/main.go:2388-2412,2981-3030,4335-4343`
- Modify: `apps/api/cmd/server/main_test.go`

**Interfaces:**
- Produces: `DELETE /api/contacts/{id}` returning `204 No Content`.
- Produces: private-message rejection `403` with body `not friends` when the sender and recipient no longer have a contact relationship.

- [ ] **Step 1: Write the failing tests**

Add `TestDeleteContactRemovesBothUsersAndPreservesMessages` to create accepted friends, issue `DELETE` as one user, assert each `GET /api/contacts` is empty, and assert `GET /api/conversations/{id}/messages` retains the original message. Add `TestPrivateMessageRequiresCurrentFriendship` to delete an accepted friendship, post to the previous session messages endpoint, and expect `403` with `not friends`.

- [ ] **Step 2: Run test to verify it fails**

Run `go test ./apps/api/cmd/server -run 'Test(DeleteContactRemovesBothUsersAndPreservesMessages|PrivateMessageRequiresCurrentFriendship)' -count=1`. Expected failure: `DELETE` is unsupported and former friends may post.

- [ ] **Step 3: Write minimal implementation**

Handle `DELETE` in `contactRoute`, delete both contact rows through a `removeContact` helper, broadcast contact-refresh events for both users, and return `204`. Require the intended private-message recipient to remain a current contact before accepting a post.

- [ ] **Step 4: Run test to verify it passes**

Run the Task 1 command again. Expected: PASS.

- [ ] **Step 5: Commit**

Commit only `apps/api/cmd/server/main.go` and `apps/api/cmd/server/main_test.go` as `feat: remove friends bilaterally`.

### Task 2: 私聊删除好友入口与同步表现

**Files:**
- Modify: `apps/web/src/app.js:2113-2174,4570-4930`
- Create: `apps/web/src/friendRemoval.js`
- Create: `apps/web/src/friendRemoval.test.js`

**Interfaces:**
- Consumes: `DELETE /api/contacts/{id}`.
- Produces: `removeFriendFromConversation(conversationId)` and a `删除好友` settings action for private chats only.

- [ ] **Step 1: Write the failing test**

Create a pure helper test verifying a private session whose peer is absent from contacts is non-sendable, while a group or current friend session is unaffected.

- [ ] **Step 2: Run test to verify it fails**

Run `node --test apps/web/src/friendRemoval.test.js`. Expected failure: module missing.

- [ ] **Step 3: Write minimal implementation**

Add the settings action for `conv.kind === "session"`, confirm before deletion, call the delete endpoint, refresh contacts and conversations, clear selected conversation, and render. Make the composer show `你们已不是好友，无法发送消息` when its session peer is absent from current contacts.

- [ ] **Step 4: Run test to verify it passes**

Run `node --test apps/web/src/friendRemoval.test.js apps/web/src/friendRealtime.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

Commit only the Task 2 files as `feat: add private chat friend removal`.

### Task 3: Integration verification and live deployment

- [ ] **Step 1: Run project verification**

Run `go test ./apps/api/cmd/server` and `node --test apps/web/src/friendRemoval.test.js apps/web/src/friendRealtime.test.js apps/web/src/messageReadActions.test.js`. Expected: PASS.

- [ ] **Step 2: Push and deploy**

Push `live main`, then use the VPS terminal to pull and rebuild with `docker compose -f deploy/docker-compose.live.yml up -d --build --force-recreate`.

- [ ] **Step 3: Verify with two real accounts**

Add friends and send a private message. Delete from one account and verify both contact lists update. Verify old chat is readable but each account cannot send. Re-add, block, unblock, send again, and verify unread plus read receipt sync.
