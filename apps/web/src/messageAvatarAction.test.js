import assert from "node:assert/strict";
import test from "node:test";

import { messageAvatarContactKey } from "./messageAvatarAction.js";

test("opens the private-message peer when the received message avatar is selected", () => {
  assert.equal(messageAvatarContactKey({ senderId: "friend-1" }, { kind: "session" }, "me"), "friend-1");
});

test("does not make the current user's message avatar open a contact", () => {
  assert.equal(messageAvatarContactKey({ senderId: "me" }, { kind: "session" }, "me"), "");
});

test("allows a group owner or admin to view a member profile", () => {
  assert.equal(messageAvatarContactKey({ senderId: "friend-2" }, { kind: "group" }, "me", "admin"), "friend-2");
});

test("does not expose group member profiles to ordinary members", () => {
  assert.equal(messageAvatarContactKey({ senderId: "friend-2" }, { kind: "group" }, "me", "member"), "");
});
