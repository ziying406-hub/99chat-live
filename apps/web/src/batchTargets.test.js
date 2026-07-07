import test from "node:test";
import assert from "node:assert/strict";

import { selectBatchConversationIds } from "./batchTargets.js";

const conversations = [
  { id: "group-1", kind: "group", lastAt: "2026-07-05T12:00:00Z" },
  { id: "session-1", kind: "session", lastAt: "2026-07-05T11:00:00Z" },
  { id: "group-2", kind: "group", lastAt: "2026-07-05T10:00:00Z" },
  { id: "session-2", kind: "session", lastAt: "2026-07-05T09:00:00Z" }
];

test("contacts target selects one-to-one conversations", () => {
  assert.deepEqual(selectBatchConversationIds(conversations, ["contacts"]), ["session-1", "session-2"]);
});

test("groups target selects group conversations", () => {
  assert.deepEqual(selectBatchConversationIds(conversations, ["groups"]), ["group-1", "group-2"]);
});

test("recent target selects current conversations in recent order", () => {
  assert.deepEqual(selectBatchConversationIds(conversations, ["recent"]), ["group-1", "session-1", "group-2", "session-2"]);
});

test("combined targets remove duplicates while preserving first match order", () => {
  assert.deepEqual(selectBatchConversationIds(conversations, ["recent", "groups"]), ["group-1", "session-1", "group-2", "session-2"]);
});
