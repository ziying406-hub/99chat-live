import assert from "node:assert/strict";
import test from "node:test";

import { composerVoiceRecordAction } from "./composerActions.js";

test("voice mode record button uses the accessible voice instruction action", () => {
  assert.equal(composerVoiceRecordAction(), "voice-record-instruction");
});
