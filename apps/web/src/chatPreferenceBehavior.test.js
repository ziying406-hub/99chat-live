import assert from "node:assert/strict";
import test from "node:test";

import {
  isConversationPreviewEnabled,
  shouldCollapseComposerToolsAfterSend
} from "./chatPreferenceBehavior.js";

test("hides conversation summaries when message preview is disabled", () => {
  assert.equal(isConversationPreviewEnabled({ messagePreview: false }), false);
  assert.equal(isConversationPreviewEnabled({ messagePreview: true }), true);
});

test("closes composer tools by default after sending", () => {
  assert.equal(shouldCollapseComposerToolsAfterSend({}), true);
  assert.equal(shouldCollapseComposerToolsAfterSend({ collapseToolsAfterSend: true }), true);
  assert.equal(shouldCollapseComposerToolsAfterSend({ collapseToolsAfterSend: false }), false);
});
