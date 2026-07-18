import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalConversationIdForRoute,
  conversationIdFromLocation,
  conversationPathFor
} from "./conversationRoute.js";

test("builds shareable paths for group and private conversations", () => {
  const groups = [{ id: "group-1784100148172833039-7002", chatId: "405213" }];
  assert.equal(conversationPathFor("group-group-1784100148172833039-7002", groups), "/messages/groups/405213");
  assert.equal(conversationPathFor("session-user-a--user-b"), "/messages/sessions/user-a--user-b");
});

test("restores a conversation from a shareable path or legacy hash", () => {
  assert.equal(conversationIdFromLocation({ pathname: "/messages/groups/405213" }), "group-405213");
  assert.equal(conversationIdFromLocation({ pathname: "/messages/sessions/user-a--user-b" }), "session-user-a--user-b");
  assert.equal(conversationIdFromLocation({ pathname: "/", hash: "#group-405213" }), "group-405213");
  assert.equal(conversationIdFromLocation({ pathname: "/" }), null);
});

test("resolves numeric group links and preserves legacy internal group links", () => {
  const groups = [{ id: "group-1784100148172833039-7002", chatId: "405213" }];

  assert.equal(
    canonicalConversationIdForRoute("group-405213", groups),
    "group-group-1784100148172833039-7002"
  );
  assert.equal(
    canonicalConversationIdForRoute("group-group-1784100148172833039-7002", groups),
    "group-group-1784100148172833039-7002"
  );
});
