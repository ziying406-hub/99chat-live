import assert from "node:assert/strict";
import test from "node:test";

import { composerVoiceRecordAction } from "./composerActions.js";

test("voice mode record button uses the real send voice action", () => {
  assert.equal(composerVoiceRecordAction(), "send-voice");
});
