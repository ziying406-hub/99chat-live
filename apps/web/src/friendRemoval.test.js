import assert from "node:assert/strict";
import test from "node:test";
import { isFormerFriendSession } from "./friendRemoval.js";

test("private session becomes non-sendable when peer is absent from contacts", () => {
  const conversation = { kind: "session", id: "session-u1--u2" };
  assert.equal(isFormerFriendSession(conversation, "u1", []), true);
  assert.equal(isFormerFriendSession(conversation, "u1", [{ id: "u2" }]), false);
});

test("groups are never treated as former friend sessions", () => {
  assert.equal(isFormerFriendSession({ kind: "group", id: "group-g1" }, "u1", []), false);
});
