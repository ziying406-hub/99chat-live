import assert from "node:assert/strict";
import test from "node:test";

import {
  canApplyScrollFocus,
  canRestoreConversationScroll,
  clearStaleScrollRestore,
  nextScrollFocusGeneration
} from "./messageScrollRestore.js";

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

test("invalidates an already queued unread-boundary focus when the user navigates away", () => {
  const queuedGeneration = nextScrollFocusGeneration(4);
  const activeGeneration = nextScrollFocusGeneration(queuedGeneration);

  assert.equal(canApplyScrollFocus(queuedGeneration, activeGeneration), false);
  assert.equal(canApplyScrollFocus(activeGeneration, activeGeneration), true);
});

test("does not apply a queued scroll after the user changes conversations", () => {
  assert.equal(canApplyScrollFocus(3, 3, "group-130011", "session-6"), false);
  assert.equal(canApplyScrollFocus(3, 3, "group-130011", "group-130011"), true);
  assert.equal(canRestoreConversationScroll("group-130011", "session-6"), false);
  assert.equal(canRestoreConversationScroll("group-130011", "group-130011"), true);
});
