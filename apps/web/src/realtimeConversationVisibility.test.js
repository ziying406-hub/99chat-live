import assert from "node:assert/strict";
import test from "node:test";

import { canReceiveRealtimeConversation } from "./realtimeConversationVisibility.js";

test("private realtime messages are visible to a canonical conversation participant", () => {
  assert.equal(
    canReceiveRealtimeConversation({
      conversationId: "session-user-a--user-b",
      currentUserId: "user-a",
      contactIds: []
    }),
    true
  );
});

test("private realtime messages for other accounts are ignored", () => {
  assert.equal(
    canReceiveRealtimeConversation({
      conversationId: "session-user-a--user-b",
      currentUserId: "user-c",
      contactIds: ["user-a"]
    }),
    false
  );
});

test("legacy private conversation ids require an existing contact", () => {
  assert.equal(
    canReceiveRealtimeConversation({ conversationId: "session-user-b", currentUserId: "user-a", contactIds: ["user-b"] }),
    true
  );
  assert.equal(
    canReceiveRealtimeConversation({ conversationId: "session-user-b", currentUserId: "user-a", contactIds: [] }),
    false
  );
});
