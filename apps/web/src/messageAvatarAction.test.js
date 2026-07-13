import assert from "node:assert/strict";
import test from "node:test";

import { messageAvatarContactKey } from "./messageAvatarAction.js";

test("opens the private-message peer when the received message avatar is selected", () => {
  assert.equal(messageAvatarContactKey({ senderId: "friend-1" }, { kind: "session" }, "me"), "friend-1");
});

test("does not make the current user's message avatar open a contact", () => {
  assert.equal(messageAvatarContactKey({ senderId: "me" }, { kind: "session" }, "me"), "");
});

test("uses the group sender when that member is already a contact", () => {
  assert.equal(messageAvatarContactKey({ senderId: "friend-2" }, { kind: "group" }, "me"), "friend-2");
});
