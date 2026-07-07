import assert from "node:assert/strict";
import test from "node:test";

import { clearLocalCacheState } from "./localCache.js";

test("clear local cache removes transient drafts without logging out", () => {
  const state = {
    query: "test",
    toast: "hello",
    networkLine: "线路 B",
    draftTextByConversation: { a: "draft" },
    replyDraftByConversation: { a: { preview: "quote" } },
    user: { feedbackStore: { draft: "feedback", history: [{ id: "1" }] } },
    authed: true
  };

  clearLocalCacheState(state);

  assert.equal(state.query, "");
  assert.equal(state.toast, "");
  assert.equal(state.networkLine, "线路 A");
  assert.deepEqual(state.draftTextByConversation, {});
  assert.deepEqual(state.replyDraftByConversation, {});
  assert.equal(state.user.feedbackStore.draft, "");
  assert.equal(state.authed, true);
});
