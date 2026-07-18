import assert from "node:assert/strict";
import test from "node:test";
import { conversationIdFromLocation, conversationPathFor } from "./conversationRoute.js";

test("builds shareable paths for group and private conversations", () => {
  assert.equal(conversationPathFor("group-405213"), "/messages/groups/405213");
  assert.equal(conversationPathFor("session-user-a--user-b"), "/messages/sessions/user-a--user-b");
});

test("restores a conversation from a shareable path or legacy hash", () => {
  assert.equal(conversationIdFromLocation({ pathname: "/messages/groups/405213" }), "group-405213");
  assert.equal(conversationIdFromLocation({ pathname: "/messages/sessions/user-a--user-b" }), "session-user-a--user-b");
  assert.equal(conversationIdFromLocation({ pathname: "/", hash: "#group-405213" }), "group-405213");
  assert.equal(conversationIdFromLocation({ pathname: "/" }), null);
});
