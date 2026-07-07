import assert from "node:assert/strict";
import test from "node:test";

import { buildPendingMessage, markMessageFailed, replacePendingMessage } from "./pendingMessages.js";

test("pending message starts with sending status", () => {
  const message = buildPendingMessage({
    conversationId: "group-1",
    user: { id: "u1", nickname: "陈少" },
    payload: { type: "text", body: "hello" },
    now: new Date("2026-07-06T10:00:00Z")
  });

  assert.equal(message.sendStatus, "sending");
  assert.equal(message.senderId, "u1");
  assert.equal(message.body, "hello");
  assert.match(message.id, /^pending-/);
});

test("failed pending message keeps retry payload and readable error", () => {
  const message = buildPendingMessage({
    conversationId: "group-1",
    user: { id: "u1", nickname: "陈少" },
    payload: { type: "text", body: "hello" },
    now: new Date("2026-07-06T10:00:00Z")
  });
  const failed = markMessageFailed(message, new Error("group rate limit exceeded"));

  assert.equal(failed.sendStatus, "failed");
  assert.equal(failed.sendError, "发言太频繁，请稍后再试");
  assert.deepEqual(failed.retryPayload, { type: "text", body: "hello" });
});

test("successful send replaces pending message", () => {
  const pending = buildPendingMessage({
    conversationId: "group-1",
    user: { id: "u1", nickname: "陈少" },
    payload: { type: "text", body: "hello" },
    now: new Date("2026-07-06T10:00:00Z")
  });
  const messages = [{ id: "old" }, pending];
  const saved = { id: "m1", conversationId: "group-1", senderId: "u1", senderName: "陈少", type: "text", body: "hello" };

  assert.deepEqual(replacePendingMessage(messages, pending.id, saved), [{ id: "old" }, saved]);
});

test("successful send removes websocket duplicate when replacing pending message", () => {
  const pending = buildPendingMessage({
    conversationId: "group-1",
    user: { id: "u1", nickname: "陈少" },
    payload: { type: "text", body: "hello" },
    now: new Date("2026-07-06T10:00:00Z")
  });
  const saved = { id: "m1", conversationId: "group-1", senderId: "u1", senderName: "陈少", type: "text", body: "hello" };
  const messages = [{ id: "old" }, pending, saved];

  assert.deepEqual(replacePendingMessage(messages, pending.id, saved), [{ id: "old" }, saved]);
});
