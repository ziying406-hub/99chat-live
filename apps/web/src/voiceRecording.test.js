import assert from "node:assert/strict";
import test from "node:test";

import { shouldSendVoiceMessage, voicePadEventAction } from "./voiceRecording.js";
import { readFile } from "node:fs/promises";

async function loadAppFunction(name, dependencies) {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const start = appSource.indexOf(`async function ${name}(`) >= 0
    ? appSource.indexOf(`async function ${name}(`)
    : appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in app.js`);
  const nextFunctionOffset = appSource.slice(start + 1).search(/\n\n(?:async )?function /);
  const end = nextFunctionOffset === -1 ? -1 : start + 1 + nextFunctionOffset;
  const source = appSource.slice(start, end === -1 ? undefined : end);
  return new Function(...Object.keys(dependencies), `${source}; return ${name};`)(...Object.values(dependencies));
}

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

test("retains a failed voice upload for retry in its original conversation", async () => {
  const state = {
    voiceRecorder: null,
    voiceStartedAt: 1_000,
    selectedConversationId: "conversation-a"
  };
  const recorder = { mimeType: "audio/webm" };
  state.voiceRecorder = recorder;
  const file = { name: "voice.webm", size: 8, type: "audio/webm" };
  const failures = [];
  const finishVoiceRecording = await loadAppFunction("finishVoiceRecording", {
    state,
    Date: { now: () => 3_000 },
    Blob: class { constructor() { this.size = 8; this.type = "audio/webm"; } },
    File: class { constructor() { return file; } },
    resetVoiceRecordingState: () => { state.voiceRecorder = null; },
    stopVoiceTracks: () => {},
    render: () => {},
    isRecordableVoiceDuration: () => true,
    toast: () => {},
    uploadFile: async () => { throw new Error("network failed"); },
    shouldSendVoiceMessage: () => true,
    sendMessage: async () => assert.fail("failed upload must not create a new message"),
    queueFailedVoiceUpload: payload => failures.push(payload)
  });

  await finishVoiceRecording(recorder, ["audio"], "conversation-a");

  assert.equal(failures.length, 1);
  assert.equal(failures[0].conversationId, "conversation-a");
  assert.strictEqual(failures[0].file, file, "the original file remains available for retry");
  assert.equal(failures[0].duration, "2");
});

test("retries a failed voice upload with the same file without duplicating or changing conversations", async () => {
  const file = { name: "voice.webm", size: 8, type: "audio/webm" };
  const failed = {
    id: "pending-voice-1",
    conversationId: "conversation-a",
    type: "voice",
    body: "2",
    sendStatus: "failed",
    retryPayload: { type: "voice", body: "2" }
  };
  const state = {
    selectedConversationId: "conversation-b",
    data: { messages: { "conversation-a": [failed], "conversation-b": [] } },
    failedVoiceUploads: new Map([[failed.id, { file, conversationId: "conversation-a" }]])
  };
  const calls = [];
  const retryFailedVoiceUpload = await loadAppFunction("retryFailedVoiceUpload", {
    state,
    replacePendingMessage: (messages, pendingId, replacement) => messages.map(message => message.id === pendingId ? replacement : message),
    upsertConversationPreview: (conversationId, message) => calls.push(["preview", conversationId, message]),
    render: () => {},
    uploadFile: async uploadedFile => {
      assert.strictEqual(uploadedFile, file);
      return { url: "/uploads/voice.webm" };
    },
    persistOutgoingMessage: async (conversationId, payload) => {
      calls.push(["persist", conversationId, payload]);
      return { id: "voice-1", conversationId, ...payload };
    },
    toast: message => calls.push(["toast", message]),
    markMessageFailed: message => message,
    uploadErrorMessage: () => "上传失败",
    scheduleScrollToBottom: () => {}
  });

  await retryFailedVoiceUpload(failed.id, state.failedVoiceUploads.get(failed.id));

  assert.deepEqual(calls.find(([kind]) => kind === "persist"), [
    "persist",
    "conversation-a",
    { type: "voice", body: "2", attachment: { url: "/uploads/voice.webm" } }
  ]);
  assert.deepEqual(state.data.messages["conversation-a"], [{
    id: "voice-1",
    conversationId: "conversation-a",
    type: "voice",
    body: "2",
    attachment: { url: "/uploads/voice.webm" }
  }]);
  assert.deepEqual(state.data.messages["conversation-b"], []);
  assert.equal(state.failedVoiceUploads.has(failed.id), false);
});
