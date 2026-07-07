import assert from "node:assert/strict";
import test from "node:test";

import { auditLogSentence, sortAuditLogs } from "./auditLogDisplay.js";

test("dedicated invite audit log shows inviter and target", () => {
  assert.equal(
    auditLogSentence({
      action: "member_invited",
      actorName: "chenshao",
      targetName: "小花朵接待号",
      detail: "chenshao 邀请 小花朵接待号 入群"
    }),
    "chenshao 邀请 小花朵接待号 入群"
  );
});

test("legacy member added invite log still shows inviter and target", () => {
  assert.equal(
    auditLogSentence({
      action: "member_added",
      actorName: "chenshao",
      targetName: "小花朵接待号",
      detail: "邀请成员入群"
    }),
    "chenshao 邀请 小花朵接待号 入群"
  );
});

test("member left audit log shows target leaving", () => {
  assert.equal(
    auditLogSentence({
      action: "member_left",
      actorName: "恋情客",
      targetName: "恋情客",
      detail: "成员主动退出群聊"
    }),
    "恋情客 退出群聊"
  );
});

test("message delete audit log uses backend detail", () => {
  assert.equal(
    auditLogSentence({
      action: "messages_deleted",
      actorName: "chenshao",
      detail: "批量删除 2 条消息：chenshao：hello；苏雅：[图片]"
    }),
    "批量删除 2 条消息：chenshao：hello；苏雅：[图片]"
  );
});

test("blacklist audit logs show explicit action", () => {
  assert.equal(
    auditLogSentence({
      action: "member_blacklisted",
      actorName: "chenshao",
      targetName: "风险用户",
      detail: "广告刷屏"
    }),
    "chenshao 将 风险用户 加入群黑名单：广告刷屏"
  );
  assert.equal(
    auditLogSentence({
      action: "member_unblacklisted",
      actorName: "chenshao",
      targetName: "风险用户"
    }),
    "chenshao 将 风险用户 移出群黑名单"
  );
});

test("management setting audit logs are readable", () => {
  assert.equal(
    auditLogSentence({ action: "qrcode_refreshed", actorName: "chenshao", targetName: "test" }),
    "chenshao 刷新群二维码"
  );
  assert.equal(
    auditLogSentence({ action: "rate_limit_updated", actorName: "chenshao", detail: "开启发言频率限制：10 秒最多 3 条" }),
    "开启发言频率限制：10 秒最多 3 条"
  );
  assert.equal(
    auditLogSentence({ action: "auto_mute_new_members_updated", actorName: "chenshao", detail: "开启新成员入群自动禁言" }),
    "开启新成员入群自动禁言"
  );
});

test("bot audit logs are readable", () => {
  assert.equal(
    auditLogSentence({ action: "bot_enabled", actorName: "chenshao", targetName: "公告机器人" }),
    "chenshao 启用 公告机器人"
  );
  assert.equal(
    auditLogSentence({ action: "bot_plan_updated", actorName: "chenshao", targetName: "公告机器人" }),
    "chenshao 更新 公告机器人 自动发送计划"
  );
  assert.equal(
    auditLogSentence({ action: "bot_created", actorName: "chenshao", targetName: "早报机器人" }),
    "chenshao 新增 早报机器人"
  );
  assert.equal(
    auditLogSentence({ action: "bot_deleted", actorName: "chenshao", targetName: "早报机器人" }),
    "chenshao 删除 早报机器人"
  );
  assert.equal(
    auditLogSentence({ action: "bot_keyword_rules_updated", actorName: "chenshao", targetName: "公告机器人" }),
    "chenshao 更新 公告机器人 关键词回复"
  );
  assert.equal(
    auditLogSentence({ action: "bot_auto_sent", targetName: "公告机器人", detail: "自动发送：请查看最新群公告" }),
    "公告机器人 自动发送：请查看最新群公告"
  );
});

test("sorts audit logs newest first", () => {
  const logs = sortAuditLogs([
    { id: "old", createdAt: "2026-07-06T01:00:00Z" },
    { id: "new", createdAt: "2026-07-06T03:00:00Z" }
  ]);

  assert.deepEqual(logs.map(log => log.id), ["new", "old"]);
});
