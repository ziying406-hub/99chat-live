import assert from "node:assert/strict";
import test from "node:test";

import {
  appendMessageOnce,
  buildPendingMessage,
  isOwnRealtimeEcho,
  markMessageFailed,
  replacePendingMessage
} from "./pendingMessages.js";

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

test("realtime delivery after the send response does not duplicate a saved message", () => {
  const saved = { id: "m1", conversationId: "group-1", type: "text", body: "hello" };

  assert.deepEqual(appendMessageOnce([{ id: "old" }, saved], saved), [{ id: "old" }, saved]);
});

test("replayed realtime delivery keeps the original list reference", () => {
  const saved = { id: "m1", conversationId: "group-1", type: "text", body: "hello" };
  const messages = [{ id: "old" }, saved];

  assert.strictEqual(appendMessageOnce(messages, saved), messages);
});

test("realtime delivery keeps a saved message while its optimistic placeholder is pending", () => {
  const pending = { id: "pending-1", conversationId: "group-1", sendStatus: "sending" };
  const saved = { id: "m1", conversationId: "group-1", type: "text", body: "hello" };

  assert.deepEqual(appendMessageOnce([pending], saved), [pending, saved]);
});

test("replaces voice pending with delivered message when operationId is missing", () => {
  const pending = {
    id: "pending-voice-1",
    conversationId: "group-1",
    senderId: "u1",
    type: "voice",
    body: "4",
    createdAt: new Date("2026-07-24T10:00:10Z").toISOString(),
    sendStatus: "sending",
    attachment: { url: "/uploads/voice.webm", id: "file-1" }
  };
  const saved = {
    id: "m-voice-1",
    conversationId: "group-1",
    senderId: "u1",
    type: "voice",
    body: "4",
    createdAt: new Date("2026-07-24T10:00:11Z").toISOString(),
    attachment: { url: "/uploads/voice.webm", id: "file-1" }
  };

  assert.deepEqual(replacePendingMessage([pending], pending.id, saved), [saved]);
});

test("replaces voice pending when saved message has no operationId but pending has one", () => {
  const pending = {
    id: "pending-voice-2",
    conversationId: "group-1",
    senderId: "u1",
    type: "voice",
    body: "4",
    createdAt: new Date("2026-07-24T10:00:10Z").toISOString(),
    sendStatus: "sending",
    attachment: { url: "/uploads/voice.webm", id: "file-2" },
    operationId: "voice-operation-172183"
  };
  const saved = {
    id: "m-voice-2",
    conversationId: "group-1",
    senderId: "u1",
    type: "voice",
    body: "4",
    createdAt: new Date("2026-07-24T10:00:11Z").toISOString(),
    attachment: { url: "/uploads/voice.webm", id: "file-2" },
    operationId: ""
  };

  assert.deepEqual(replacePendingMessage([pending], pending.id, saved), [saved]);
});

test("does not match voice pending only by body when no attachment and send window is stale", () => {
  const pending = {
    id: "pending-voice-3",
    conversationId: "group-1",
    senderId: "u1",
    type: "voice",
    body: "5",
    createdAt: new Date("2026-07-24T10:00:00Z").toISOString(),
    sendStatus: "sending",
    attachment: {}
  };
  const saved = {
    id: "m-voice-3",
    conversationId: "group-1",
    senderId: "u1",
    type: "voice",
    body: "5",
    createdAt: new Date("2026-07-24T10:00:20Z").toISOString(),
    attachment: {}
  };

  assert.deepEqual(replacePendingMessage([pending], "different-id", saved), [pending, saved]);
});

test("identifies a sender voice echo without senderId from its pending attachment", () => {
  const pending = {
    id: "pending-voice-4",
    conversationId: "session-1",
    senderId: "u1",
    type: "voice",
    body: "3",
    sendStatus: "sending",
    attachment: { id: "file-4", url: "/uploads/voice-4.webm" },
    operationId: "voice-operation-4"
  };
  const realtimeEcho = {
    id: "m-voice-4",
    conversationId: "session-1",
    senderId: "",
    type: "voice",
    body: "3",
    attachment: { id: "file-4", url: "/uploads/voice-4.webm" }
  };

  assert.equal(isOwnRealtimeEcho([pending], realtimeEcho, "u1"), true);
});
