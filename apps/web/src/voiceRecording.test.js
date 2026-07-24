import assert from "node:assert/strict";
import test from "node:test";

import { shouldSendVoiceMessage, voicePadEventAction } from "./voiceRecording.js";

test("routes a held pointer leaving the voice pad to stop recording", () => {
  assert.equal(voicePadEventAction({ type: "pointerdown" }), "start");
  assert.equal(voicePadEventAction({ type: "pointerleave", isRecording: true }), "stop");
  assert.equal(voicePadEventAction({ type: "pointerleave", isRecording: false }), "none");
  assert.equal(voicePadEventAction({ type: "pointerup", isPending: true }), "cancel-pending");
});

test("routes keyboard activation to an instruction instead of a voice send", () => {
  assert.equal(voicePadEventAction({ type: "click", detail: 0 }), "instruction");
  assert.equal(voicePadEventAction({ type: "click", detail: 1 }), "suppress-click");
});

test("never permits a send for short recordings or failed uploads", () => {
  assert.equal(shouldSendVoiceMessage({
    isRecordable: false,
    hasAudio: true,
    hasAttachment: true,
    isCurrentConversation: true
  }), false);
  assert.equal(shouldSendVoiceMessage({
    isRecordable: true,
    hasAudio: true,
    hasAttachment: false,
    isCurrentConversation: true
  }), false);
  assert.equal(shouldSendVoiceMessage({
    isRecordable: true,
    hasAudio: true,
    hasAttachment: true,
    isCurrentConversation: false
  }), false);
});

test("permits a completed recording in its original conversation", () => {
  assert.equal(shouldSendVoiceMessage({
    isRecordable: true,
    hasAudio: true,
    hasAttachment: true,
    isCurrentConversation: true
  }), true);
});
