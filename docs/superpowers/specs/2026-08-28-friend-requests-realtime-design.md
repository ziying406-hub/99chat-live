# 好友申请与实时同步（产品验收规范）

## 目标

提供“添加好友 → 对方审核 → 双方好友关系建立/拒绝/解除”的完整体验，并保证在以下情况下状态一致：

- 同账号多端在线（WebSocket 实时推送）。
- 页面后台/断线后恢复（定时同步兜底）。

## 概念与范围

- **好友申请（Friend Request）**：一方发起的添加好友请求，状态包含 `pending / accepted / rejected`。
- **好友关系（Contact）**：双方互为联系人，且允许发送私聊。
- **实时事件（Realtime Event）**：通过 WebSocket 推送到所有在线端的 JSON 消息信封。

本规范聚焦“用户可感知的行为与验收”，不新增额外页面。

## 用户故事

1. 作为用户 A，我可以通过对方的 ChatID 发起好友申请，并附带招呼语。
2. 作为用户 B，我能在“新的朋友”里看到 A 的申请，并选择同意或拒绝。
3. 作为 A，我能立即看到申请被同意/拒绝，并同步更新通讯录与会话状态。
4. 作为任一方，我能解除好友关系，双方都应立即同步到“已解除”，且私聊不可再发送。

## 交互与行为（验收口径）

### 1) 发起好友申请

- 入口：在“添加好友”表单输入对方 `chatId`，可选填写 `greeting`。
- 成功：
  - 发起方的“好友申请列表”出现一条 `direction=outgoing`、`status=pending` 的记录。
  - 接收方的“好友申请列表”出现一条 `direction=incoming`、`status=pending` 的记录。
  - 接收方在线时应立即收到 toast：`收到来自 <昵称> 的好友申请`。

#### 失败条件（前端提示需明确）

- 不能添加自己（用自己的 chatId/phone/id）。
- 目标不存在。
- 目标已拉黑/禁用好友申请（含群设置阻止成员互加）。
- 已经是好友。
- 已存在一条待处理申请（重复发送）。

#### 接口与错误提示（用于验收对齐）

- `POST /api/friend-requests` 成功返回 `201`，失败时返回 JSON：`{"error":"..."}`。
- 常见错误（服务端错误关键字 → 前端提示语）：
  - `cannot add yourself` → `不能添加自己`
  - `user not found` → `未找到这个聊天号`
  - `target blocked friend requests` → `对方无法收到你的好友申请`
  - `group blocks member friend requests: <groupTitle>` → `<groupTitle> 已禁止成员互加好友`
  - `already friends` → `你们已经是好友了`
  - `friend request already pending` → `好友申请已发送，等待对方验证`

### 2) 审核好友申请（同意/拒绝）

- 入口：在“新的朋友”列表对某条 `incoming + pending` 记录点击“同意”或“拒绝”。
- 同意（accepted）：
  - 双方通讯录立即出现对方。
  - 双方会话列表出现对应的私聊会话（若此前不存在）。
  - 发起方 toast：`<审核人昵称> 已通过你的好友申请`。
  - 接收方 toast：`你已通过 <申请人昵称> 的好友申请`。
- 拒绝（rejected）：
  - 通讯录不增加对方。
  - 双方申请记录状态变为 `rejected`。
  - 发起方 toast：`<审核人昵称> 拒绝了你的好友申请`。
  - 接收方 toast：`你已拒绝 <申请人昵称> 的好友申请`。

#### 接口与错误提示（用于验收对齐）

- `PATCH /api/friend-requests/{id}` 成功返回 `200`，失败时返回 JSON：`{"error":"..."}`。
- 常见错误：
  - `request not found`（404）→ `这条申请已失效，请刷新后重试`

### 3) 自动通过（对方关闭验证）

当目标用户关闭“好友验证”时：

- A 发起申请后，系统直接建立好友关系。
- A 端应立即看到“已通过”（无需等待 B 操作）。
- B 端应立即同步为已成为好友（通讯录与会话可用）。

### 4) 解除好友关系

- 入口：私聊会话设置中的“删除好友”（需二次确认）。
- 行为：
  - 双方通讯录移除对方。
  - 历史私聊可继续查看，但双方都不可再发送私聊消息。
  - 双方在线时 toast：`你们已解除好友关系`。

## 实时同步规则（用户可见）

### 推送优先，轮询兜底

- WebSocket 在线时：好友事件应实时推送，页面不需要手动刷新。
- 若 WebSocket 不在线/页面后台：
  - 页面会每 5 秒同步一次好友相关状态（申请 + 通讯录 + 会话）。
  - 从后台回到前台时应立即同步一次，保证状态更新。

## 服务端流程（用于排查，不作为 UI 约束）

```mermaid
flowchart TD
  A[POST /api/friend-requests] --> B{校验与 guards}
  B -->|cannot add yourself| E400[400]
  B -->|user not found| E404[404]
  B -->|blocked/group blocked| E403[403]
  B -->|already friends| E400
  B -->|duplicate pending| E409[409]
  B -->|target friendVerification=false| C1[createAutomaticFriendship]
  C1 --> D1[Broadcast friend.accepted]
  B -->|needs verification| C2[persistFriendRequestFor]
  C2 --> D2[Broadcast friend.requested]

  P[PATCH /api/friend-requests/{id}] --> Q{accepted/rejected}
  Q --> R[updateFriendRequest]
  R --> S[Broadcast friend.accepted/rejected]
```

### 刷新范围

每次好友实时事件触发刷新时，客户端需要同步更新：

- 好友申请列表
- 通讯录
- 会话列表（用于私聊可发送状态、会话存在性与预览）

## 验收用例（必须全过）

1. **申请创建**：A 发起申请后，A 看到 outgoing pending，B 看到 incoming pending；B 在线时立即 toast。
2. **重复申请**：A 对同一 B 重复提交 pending 申请时返回冲突，前端提示明确。
3. **同意成功**：B 同意后，双方通讯录都出现对方；双方 toast 文案符合规则；私聊可发送。
4. **拒绝成功**：B 拒绝后，双方通讯录不变化；双方申请状态变更；双方 toast 文案符合规则。
5. **自动通过**：B 关闭验证时，A 发起后无需 B 操作就成为好友；双方通讯录同步。
6. **多端一致**：A 或 B 任一方在两台设备同时在线时，任一端操作应使另一端在 1 秒内同步（WebSocket）。
7. **断线兜底**：关闭 WebSocket（或模拟断线）时，另一端在 5 秒内通过同步机制看到状态变化。
8. **解除好友**：任一方删除好友后，双方 toast、通讯录、私聊发送权限都同步；历史消息仍可读取。

## 已验证（沉淀为可复现的回归步骤）

以下验收项已通过现有测试覆盖并在本地跑通；后续改动好友/实时相关逻辑时应作为回归集。

### A) 添加好友失败条件（guards）

- 覆盖测试：
  - `apps/api/cmd/server/main_test.go`：`TestFriendRequestCreateRejectsSelfExistingAndDuplicatePending`
  - `apps/api/cmd/server/main_test.go`：`TestFriendRequestBlockedWhenGroupDisablesMemberAddFriend`
  - `apps/api/cmd/server/main_test.go`：`TestFriendRequestBlockedWhenTargetBlacklistsSender`
- 回归命令：
  - `cd apps/api && go test ./cmd/server -run 'TestFriendRequest(CreateRejectsSelfExistingAndDuplicatePending|BlockedWhenGroupDisablesMemberAddFriend|BlockedWhenTargetBlacklistsSender)$' -count=1`

### B) 多端一致（WebSocket 推送）

- 覆盖测试：
  - `apps/api/cmd/server/main_test.go`：`TestHubBroadcastDeliversToAllClients`
  - `apps/web/src/friendRealtime.test.js`：覆盖 `friend.*` 事件的 `refresh` 与 toast 文案
- 回归命令：
  - `cd apps/api && go test ./cmd/server -run 'TestHubBroadcastDeliversToAllClients$' -count=1`
  - `node --test apps/web/src/friendRealtime.test.js`

### C) 删除好友后禁止私聊发送（以及历史可读）

- 覆盖测试：
  - `docs/superpowers/plans/2026-07-26-remove-friend-implementation.md` 中定义的两条用例（服务端）：
    - `TestDeleteContactRemovesBothUsersAndPreservesMessages`
    - `TestPrivateMessageRequiresCurrentFriendship`
  - 以及前端 `apps/web/src/friendRealtime.test.js` 覆盖 `friend.removed` 的刷新行为

注：若上述两条服务端用例在仓库中名称或位置发生变更，应同步更新本节，确保验收始终“可执行”。

## 自动化测试映射（让验收可执行）

以下用例应至少在单元/集成测试中覆盖；优先使用 Go 端到端路由测试与前端纯函数测试。

- **申请创建** → `apps/api/cmd/server/main_test.go`：`TestRegisteredUsersOnlySeeTheirFriendRequests`
  - 断言点：A 看到 `outgoing`，B 看到 `incoming`，均为 `pending`。
- **重复申请** → `apps/api/cmd/server/main_test.go`：`TestFriendRequestCreateRejectsSelfExistingAndDuplicatePending`
  - 断言点：重复 pending 返回 `409`。
- **同意成功** → `apps/api/cmd/server/main_test.go`：`TestFriendRequestAcceptAddsContactOnce` + `TestReceivedVoiceMessageKeepsAttachmentInHistoryAndRealtime`
  - 断言点：联系人只加一次；私聊会话可建立并可发送消息。
- **拒绝成功** → `apps/api/cmd/server/main_test.go`：`TestFriendRequestRejectDoesNotAddContact`
  - 断言点：请求状态变为 `rejected`；通讯录不增加对方。
- **审核权限**（发起方不能自己审核）→ `apps/api/cmd/server/main_test.go`：`TestFriendRequestSenderCannotReview`
  - 断言点：发起方 PATCH 返回 `404`。
- **自动通过** → `apps/api/cmd/server/main_test.go`：`TestFriendRequestAutomaticallyAcceptsWhenTargetVerificationIsDisabled`
  - 断言点：创建返回 `accepted`；双方联系人/请求记录同步。
- **事件 payload 结构** → `apps/api/cmd/server/main_test.go`：`TestFriendRequestRealtimeEventKeepsBothParticipants` + `TestFriendRequestRealtimeEventOmitsReviewerWhenNil`
  - 断言点：`friend.requested` 不带 `reviewer`；`accepted/rejected` 带 reviewer。
- **多端一致（广播）** → `apps/api/cmd/server/main_test.go`：`TestHubBroadcastDeliversToAllClients`
  - 断言点：同一事件能投递到多个 WS 客户端。
- **前端 toast/refresh** → `apps/web/src/friendRealtime.test.js`
  - 断言点：`friend.accepted/rejected/removed/requested` 的 toast 文案与 `refresh=true/false`。
