import assert from "node:assert/strict";
import test from "node:test";

import { clearStaleScrollRestore } from "./messageScrollRestore.js";

test("discards a saved position when the same conversation intentionally scrolls to the latest message", () => {
  assert.equal(clearStaleScrollRestore(
    { conversationId: "group-130011", scrollTop: 24 },
    "group-130011",
    { scrollToBottom: true }
  ), null);
});

test("keeps a saved position for another conversation", () => {
  const pending = { conversationId: "session-a", scrollTop: 24 };
  assert.equal(clearStaleScrollRestore(pending, "group-130011", { skip: true }), pending);
});
