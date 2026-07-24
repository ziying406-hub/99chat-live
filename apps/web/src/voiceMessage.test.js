import assert from "node:assert/strict";
import test from "node:test";

import {
  formatVoiceDuration,
  isRecordableVoiceDuration,
  shouldAutoPlayIncomingVoice
} from "./voiceMessage.js";

test("formats a voice duration as minutes and seconds", () => {
  assert.equal(formatVoiceDuration(65), "01:05");
});

test("requires at least one second to record a voice message", () => {
  assert.equal(isRecordableVoiceDuration(999), false);
  assert.equal(isRecordableVoiceDuration(1000), true);
});

test("autoplays an eligible incoming voice message", () => {
  assert.equal(shouldAutoPlayIncomingVoice({
    message: { type: "voice", attachment: { url: "/uploads/a.webm" } },
    isCurrentConversation: true,
    isVisible: true,
    enabled: true,
    isIncoming: true
  }), true);
});

test("does not autoplay an ineligible voice message", () => {
  const eligibleInput = {
    message: { type: "voice", attachment: { url: "/uploads/a.webm" } },
    isCurrentConversation: true,
    isVisible: true,
    enabled: true,
    isIncoming: true
  };

  const cases = [
    ["outgoing", { isIncoming: false }],
    ["disabled", { enabled: false }],
    ["non-current conversation", { isCurrentConversation: false }],
    ["hidden document", { isVisible: false }],
    ["missing attachment", { message: { type: "voice" } }],
    ["non-voice message", { message: { type: "text", attachment: { url: "/uploads/a.webm" } } }]
  ];

  for (const [description, overrides] of cases) {
    assert.equal(shouldAutoPlayIncomingVoice({ ...eligibleInput, ...overrides }), false, description);
  }
});
