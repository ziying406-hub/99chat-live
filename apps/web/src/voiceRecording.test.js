import assert from "node:assert/strict";
import test from "node:test";

import {
  recordedVoiceExtension,
  shouldCancelVoiceRecording,
  shouldSendVoiceMessage,
  voicePadEventAction,
  voicePadReleaseAction
} from "./voiceRecording.js";
import { buildPendingMessage, replacePendingMessage } from "./pendingMessages.js";
import { readFile } from "node:fs/promises";

function findDeliveredVoiceForFailure(messages, conversationId, candidate) {
  const attachment = candidate?.attachment || {};
  return (messages || []).find(message =>
    message.id !== candidate?.id &&
    message.type === "voice" &&
    message.conversationId === conversationId &&
    String(message.senderId || "") === String(candidate?.senderId || "") &&
    ((attachment.id && message.attachment?.id === attachment.id) ||
      (attachment.url && message.attachment?.url === attachment.url))
  );
}

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

async function loadAppSource() {
  return readFile(new URL("./app.js", import.meta.url), "utf8");
}

test("captures the active pointer before starting voice recording", async () => {
  const appSource = await loadAppSource();

  assert.match(appSource, /pointerdown[\s\S]*?pad\.setPointerCapture\(event\.pointerId\)[\s\S]*?startVoiceRecording\(event\.pointerId\)/);
});

test("tracks cancellation gestures while recording or microphone permission is pending", async () => {
  const appSource = await loadAppSource();

  assert.match(appSource, /state\.voicePointerId !== event\.pointerId \|\| \(!state\.voiceRecording && !state\.voiceRecordingPending\)/);
});

test("shows an armed cancellation label before the pending-permission label", async () => {
  const appSource = await loadAppSource();
  const cancelLabelOffset = appSource.indexOf('if (state.voiceRecordingCancelArmed) return "松开取消";');
  const pendingLabelOffset = appSource.indexOf('if (state.voiceRecordingPending) return "正在请求麦克风权限…";');

  assert.notEqual(cancelLabelOffset, -1, "the cancellation label check should exist");
  assert.notEqual(pendingLabelOffset, -1, "the pending-permission label check should exist");
  assert.ok(cancelLabelOffset < pendingLabelOffset, "the cancellation label must take priority");
});

test("ignores a second pointerdown before voice pad pointer capture or state writes", async () => {
  const appSource = await loadAppSource();
  const pointerdownStart = appSource.indexOf('pad.addEventListener("pointerdown", event => {');
  const pointerdownEnd = appSource.indexOf('    pad.addEventListener("pointermove"', pointerdownStart);
  const pointerdownSource = appSource.slice(pointerdownStart, pointerdownEnd);

  assert.notEqual(pointerdownStart, -1, "the voice pad pointerdown handler should exist");
  assert.match(pointerdownSource, /if \(state\.voicePointerId !== null \|\| state\.voiceRecording \|\| state\.voiceRecordingPending\) return;/);
  assert.ok(
    pointerdownSource.indexOf('if (state.voicePointerId !== null || state.voiceRecording || state.voiceRecordingPending) return;') < pointerdownSource.indexOf('pad.setPointerCapture(event.pointerId)'),
    "the active-operation guard must run before pointer capture"
  );
});

test("ignores pointercancel events from non-active voice pad pointers", async () => {
  const appSource = await loadAppSource();
  const pointercancelStart = appSource.indexOf('["pointercancel"].forEach(type => {');
  const pointercancelEnd = appSource.indexOf('    pad.addEventListener("click"', pointercancelStart);
  const pointercancelSource = appSource.slice(pointercancelStart, pointercancelEnd);

  assert.notEqual(pointercancelStart, -1, "the voice pad pointercancel handler should exist");
  assert.match(pointercancelSource, /if \(event\.pointerId !== state\.voicePointerId\) return;/);
});

test("uses upward-slide wording for the normal voice recording instruction", async () => {
  const appSource = await loadAppSource();

  assert.match(appSource, /松开发送，上滑取消/);
  assert.doesNotMatch(appSource, /松开发送，移出取消/);
});

test("does not include pointerleave in the voice pad immediate-cancellation list", async () => {
  const appSource = await loadAppSource();

  assert.doesNotMatch(appSource, /\["pointercancel", "pointerleave"\]\.forEach/);
});

test("keeps pointercancel in the voice pad immediate-cancellation list", async () => {
  const appSource = await loadAppSource();

  assert.match(appSource, /\["pointercancel"\]\.forEach/);
});

test("shows the cancellation instruction while an upward gesture is armed", async () => {
  const voiceRecordingLabel = await loadAppFunction("voiceRecordingLabel", {
    state: {
      voiceRecordingCancelArmed: true,
      voiceRecordingPending: false,
      voiceRecording: false
    }
  });

  assert.equal(voiceRecordingLabel(), "松开取消");
});

test("routes pointer movement and an armed release through voice cancellation helpers", async () => {
  const appSource = await loadAppSource();

  assert.match(appSource, /pointermove[\s\S]*shouldCancelVoiceRecording/);
  assert.match(appSource, /voicePadReleaseAction\(\{[\s\S]*isCancelArmed:[\s\S]*\}\)/);
  assert.match(appSource, /action === "cancel"\) cancelVoiceRecording\(\)/);
});

test("cancels active voice operations when Escape is pressed", async () => {
  const appSource = await loadAppSource();

  assert.match(appSource, /event\.key === "Escape"[\s\S]*voiceRecording[\s\S]*voiceRecordingPending[\s\S]*cancelVoiceRecording\(\)/);
});

test("continues tracking after pointerleave but cancels on pointercancel", () => {
  assert.equal(voicePadEventAction({ type: "pointerdown" }), "start");
  assert.equal(voicePadEventAction({ type: "pointerleave", isRecording: true }), "none");
  assert.equal(voicePadEventAction({ type: "pointercancel", isRecording: true }), "cancel");
  assert.equal(voicePadEventAction({ type: "pointerleave", isRecording: false, isPending: true }), "none");
  assert.equal(voicePadEventAction({ type: "pointercancel", isRecording: false, isPending: true }), "cancel-pending");
  assert.equal(voicePadEventAction({ type: "pointerup", isPending: true }), "cancel-pending");
});

test("arms voice cancellation only after an upward gesture crosses the threshold", () => {
  assert.equal(shouldCancelVoiceRecording({ startY: 300, currentY: 253 }), false);
  assert.equal(shouldCancelVoiceRecording({ startY: 300, currentY: 252 }), true);
  assert.equal(shouldCancelVoiceRecording({ startY: 300, currentY: 360 }), false);
});

test("releasing an armed voice recording cancels instead of sending", () => {
  assert.equal(voicePadReleaseAction({ isCancelArmed: true, isRecording: true }), "cancel");
  assert.equal(voicePadReleaseAction({ isCancelArmed: false, isRecording: true }), "stop");
  assert.equal(voicePadReleaseAction({ isCancelArmed: false, isPending: true }), "cancel-pending");
});

test("uses an m4a extension for Safari audio/mp4 recordings", () => {
  assert.equal(recordedVoiceExtension("audio/mp4"), "m4a");
  assert.equal(recordedVoiceExtension("audio/webm;codecs=opus"), "webm");
});

test("does not start recording when microphone permission resolves after cancellation", async () => {
  const state = {
    selectedConversationId: "conversation-a",
    voiceRecording: false,
    voiceRecordingPending: false,
    voicePointerId: null
  };
  let resolvePermission;
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks };
  let recorderCreated = false;
  const startVoiceRecording = await loadAppFunction("startVoiceRecording", {
    state,
    navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolvePermission = resolve; }) } },
    MediaRecorder: class { constructor() { recorderCreated = true; } },
    refreshVoiceRecordingLabel: () => {},
    resetVoiceRecordingState: () => {
      state.voiceRecording = false;
      state.voiceRecordingPending = false;
      state.voicePointerId = null;
    },
    Date,
    finishVoiceRecording: () => {},
    window: { setInterval: () => 1 },
    toast: () => {}
  });

  const start = startVoiceRecording(7);
  state.voicePointerId = null;
  state.voiceRecordingPending = false;
  resolvePermission(stream);
  await start;

  assert.equal(recorderCreated, false);
  assert.equal(tracks[0].stopped, true);
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

test("keeps a completed recording with its original conversation after the user switches chats", async () => {
  const state = {
    voiceRecorder: null,
    voiceStartedAt: 1_000,
    selectedConversationId: "conversation-b",
    data: { messages: { "conversation-a": [], "conversation-b": [] } }
  };
  const recorder = { mimeType: "audio/webm" };
  state.voiceRecorder = recorder;
  const persisted = [];
  const finishVoiceRecording = await loadAppFunction("finishVoiceRecording", {
    state,
    Date: { now: () => 3_000 },
    Blob: class { constructor() { this.size = 8; this.type = "audio/webm"; } },
    File: class { constructor() { return { name: "voice.webm", size: 8, type: "audio/webm" }; } },
    recordedVoiceExtension: () => "webm",
    resetVoiceRecordingState: () => { state.voiceRecorder = null; },
    stopVoiceTracks: () => {},
    render: () => {},
    isRecordableVoiceDuration: () => true,
    toast: () => {},
    uploadFile: async () => ({ url: "/uploads/voice.webm" }),
    shouldSendVoiceMessage: () => true,
    buildPendingMessage,
    replacePendingMessage,
    persistOutgoingMessage: async (conversationId, payload) => {
      persisted.push([conversationId, payload]);
      return { id: "voice-1", conversationId, ...payload };
    },
    upsertConversationPreview: () => {},
    scheduleScrollToBottom: () => {},
    queueFailedVoiceUpload: () => assert.fail("a successful upload and send must not become a retry")
  });

  await finishVoiceRecording(recorder, ["audio"], "conversation-a");

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0][0], "conversation-a");
  assert.deepEqual(persisted[0][1], {
    type: "voice",
    body: "2",
    attachment: { url: "/uploads/voice.webm" },
    operationId: persisted[0][1].operationId
  });
  assert.match(persisted[0][1].operationId, /^voice-operation-/);
  assert.deepEqual(state.data.messages["conversation-a"], [{
    id: "voice-1",
    conversationId: "conversation-a",
    type: "voice",
    body: "2",
    operationId: persisted[0][1].operationId,
    attachment: { url: "/uploads/voice.webm" }
  }]);
  assert.deepEqual(state.data.messages["conversation-b"], []);
});

test("replaces the pending voice message when realtime delivery arrives before persistence resolves", async () => {
  const state = {
    voiceRecorder: null,
    voiceStartedAt: 1_000,
    selectedConversationId: "conversation-a",
    user: { id: "u1", nickname: "陈少" },
    data: { messages: { "conversation-a": [] } }
  };
  const recorder = { mimeType: "audio/webm" };
  state.voiceRecorder = recorder;
  let beginPersistence;
  let resolvePersistence;
  const persistenceStarted = new Promise(resolve => { beginPersistence = resolve; });
  const finishVoiceRecording = await loadAppFunction("finishVoiceRecording", {
    state,
    Date: { now: () => 3_000 },
    Blob: class { constructor() { this.size = 8; this.type = "audio/webm"; } },
    File: class { constructor() { return { name: "voice.webm", size: 8, type: "audio/webm" }; } },
    recordedVoiceExtension: () => "webm",
    resetVoiceRecordingState: () => { state.voiceRecorder = null; },
    stopVoiceTracks: () => {},
    render: () => {},
    isRecordableVoiceDuration: () => true,
    toast: () => {},
    uploadFile: async () => ({ url: "/uploads/voice.webm" }),
    shouldSendVoiceMessage: () => true,
    buildPendingMessage,
    replacePendingMessage,
    findDeliveredVoiceForFailure,
    persistOutgoingMessage: async () => {
      beginPersistence();
      return new Promise(resolve => { resolvePersistence = resolve; });
    },
    upsertConversationPreview: () => {},
    scheduleScrollToBottom: () => {},
    queueFailedVoiceUpload: () => assert.fail("a successful voice send must not enter the retry path")
  });
  const saved = {
    id: "voice-1",
    conversationId: "conversation-a",
    senderId: "u1",
    type: "voice",
    body: "2",
    attachment: { url: "/uploads/voice.webm" }
  };

  const completion = finishVoiceRecording(recorder, ["audio"], "conversation-a");
  await persistenceStarted;
  state.data.messages["conversation-a"] = [...state.data.messages["conversation-a"], saved];
  resolvePersistence(saved);
  await completion;

  assert.deepEqual(state.data.messages["conversation-a"], [saved]);
});

test("does not queue a retry when realtime delivery arrives before voice persistence rejects", async () => {
  const state = {
    voiceRecorder: null,
    voiceStartedAt: 1_000,
    selectedConversationId: "conversation-a",
    user: { id: "u1", nickname: "陈少" },
    data: { messages: { "conversation-a": [] } },
    failedVoiceUploads: new Map()
  };
  const recorder = { mimeType: "audio/webm" };
  state.voiceRecorder = recorder;
  let beginPersistence;
  let rejectPersistence;
  const persistenceStarted = new Promise(resolve => { beginPersistence = resolve; });
  const finishVoiceRecording = await loadAppFunction("finishVoiceRecording", {
    state,
    Date: { now: () => 3_000 },
    Blob: class { constructor() { this.size = 8; this.type = "audio/webm"; } },
    File: class { constructor() { return { name: "voice.webm", size: 8, type: "audio/webm" }; } },
    recordedVoiceExtension: () => "webm",
    resetVoiceRecordingState: () => { state.voiceRecorder = null; },
    stopVoiceTracks: () => {},
    render: () => {},
    isRecordableVoiceDuration: () => true,
    toast: () => {},
    uploadFile: async () => ({ url: "/uploads/voice.webm" }),
    shouldSendVoiceMessage: () => true,
    buildPendingMessage,
    replacePendingMessage,
    findDeliveredVoiceForFailure,
    persistOutgoingMessage: async () => {
      beginPersistence();
      return new Promise((resolve, reject) => { rejectPersistence = reject; });
    },
    upsertConversationPreview: () => {},
    scheduleScrollToBottom: () => {},
    queueFailedVoiceUpload: ({ file, duration, conversationId }) => {
      const failed = { id: "failed-voice-1", conversationId, type: "voice", body: duration, sendStatus: "failed" };
      state.data.messages[conversationId] = [...state.data.messages[conversationId], failed];
      state.failedVoiceUploads.set(failed.id, { file, conversationId });
    }
  });
  const saved = {
    id: "voice-1",
    conversationId: "conversation-a",
    senderId: "u1",
    type: "voice",
    body: "2",
    attachment: { url: "/uploads/voice.webm" }
  };

  const completion = finishVoiceRecording(recorder, ["audio"], "conversation-a");
  await persistenceStarted;
  state.data.messages["conversation-a"] = [...state.data.messages["conversation-a"], saved];
  rejectPersistence(new Error("request failed after save"));
  await completion;

  assert.deepEqual(state.data.messages["conversation-a"], [saved]);
  assert.equal(state.failedVoiceUploads.size, 0);
});

test("cancelling an active recording stops every microphone track without producing a message", async () => {
  const state = {
    voiceRecorder: { state: "recording", stopCalls: 0, stop() { this.stopCalls++; } },
    voiceRecording: true,
    voiceRecordingPending: false,
    voiceStream: { getTracks: () => [{ stopped: false, stop() { this.stopped = true; } }, { stopped: false, stop() { this.stopped = true; } }] }
  };
  const tracks = state.voiceStream.getTracks();
  state.voiceStream.getTracks = () => tracks;
  const cancelVoiceRecording = await loadAppFunction("cancelVoiceRecording", {
    state,
    resetVoiceRecordingState: () => {
      state.voiceRecorder = null;
      state.voiceRecording = false;
      state.voiceRecordingPending = false;
    },
    stopVoiceTracks: () => {
      state.voiceStream.getTracks().forEach(track => track.stop());
      state.voiceStream = null;
    },
    refreshVoiceRecordingLabel: () => {}
  });
  const recorder = state.voiceRecorder;

  cancelVoiceRecording();

  assert.equal(recorder.stopCalls, 1);
  assert.equal(tracks.every(track => track.stopped), true);
  assert.equal(state.voiceStream, null);
});

test("page leave invokes the same microphone cancellation path", async () => {
  const listeners = new Map();
  const bindVoiceRecordingLifecycle = await loadAppFunction("bindVoiceRecordingLifecycle", {
    window: { addEventListener: (type, listener) => listeners.set(type, listener) },
    cancelVoiceRecording: () => listeners.set("cancelled", true)
  });

  bindVoiceRecordingLifecycle();
  listeners.get("pagehide")();

  assert.equal(typeof listeners.get("beforeunload"), "function");
  assert.equal(listeners.get("cancelled"), true);
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
    recordedVoiceExtension: () => "webm",
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
  assert.match(failures[0].operationId, /^voice-/);
});

test("retries a failed voice upload with the same file without duplicating or changing conversations", async () => {
  const file = { name: "voice.webm", size: 8, type: "audio/webm" };
  const failed = {
    id: "pending-voice-1",
    conversationId: "conversation-a",
    type: "voice",
    body: "2",
    sendStatus: "failed",
    retryPayload: { type: "voice", body: "2", operationId: "voice-retry-1" }
  };
  const state = {
    selectedConversationId: "conversation-b",
    data: { messages: { "conversation-a": [failed], "conversation-b": [] } },
    failedVoiceUploads: new Map([[failed.id, { file, conversationId: "conversation-a", operationId: "voice-retry-1" }]])
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
    scheduleScrollToBottom: () => {},
    removeFailedVoiceUpload: async id => state.failedVoiceUploads.delete(id)
  });

  await retryFailedVoiceUpload(failed.id, state.failedVoiceUploads.get(failed.id));

  assert.deepEqual(calls.find(([kind]) => kind === "persist"), [
    "persist",
    "conversation-a",
    { type: "voice", body: "2", operationId: "voice-retry-1", attachment: { url: "/uploads/voice.webm" } }
  ]);
  assert.deepEqual(state.data.messages["conversation-a"], [{
    id: "voice-1",
    conversationId: "conversation-a",
    type: "voice",
    body: "2",
    operationId: "voice-retry-1",
    attachment: { url: "/uploads/voice.webm" }
  }]);
  assert.deepEqual(state.data.messages["conversation-b"], []);
  assert.equal(state.failedVoiceUploads.has(failed.id), false);
});

test("does not recreate a failed retry when realtime delivery wins its persistence race", async () => {
  const file = { name: "voice.webm", size: 8, type: "audio/webm" };
  const failed = {
    id: "pending-voice-1",
    conversationId: "conversation-a",
    senderId: "u1",
    type: "voice",
    body: "2",
    sendStatus: "failed",
    retryPayload: { type: "voice", body: "2" }
  };
  const state = {
    user: { id: "u1" },
    selectedConversationId: "conversation-b",
    data: { messages: { "conversation-a": [failed], "conversation-b": [] } },
    failedVoiceUploads: new Map([[failed.id, { file, conversationId: "conversation-a" }]])
  };
  let beginPersistence;
  let rejectPersistence;
  const persistenceStarted = new Promise(resolve => { beginPersistence = resolve; });
  const retryFailedVoiceUpload = await loadAppFunction("retryFailedVoiceUpload", {
    state,
    replacePendingMessage,
    findDeliveredVoiceForFailure,
    upsertConversationPreview: () => {},
    render: () => {},
    uploadFile: async () => ({ id: "file-1", url: "/uploads/voice.webm" }),
    persistOutgoingMessage: async () => {
      beginPersistence();
      return new Promise((resolve, reject) => { rejectPersistence = reject; });
    },
    toast: () => {},
    markMessageFailed: message => message,
    uploadErrorMessage: () => "上传失败",
    scheduleScrollToBottom: () => {},
    removeFailedVoiceUpload: async id => state.failedVoiceUploads.delete(id)
  });
  const delivered = {
    id: "voice-1",
    conversationId: "conversation-a",
    senderId: "u1",
    type: "voice",
    body: "2",
    attachment: { id: "file-1", url: "/uploads/voice.webm" }
  };

  const completion = retryFailedVoiceUpload(failed.id, state.failedVoiceUploads.get(failed.id));
  await persistenceStarted;
  state.data.messages["conversation-a"] = [
    ...state.data.messages["conversation-a"].filter(message => message.id !== failed.id),
    delivered
  ];
  rejectPersistence(new Error("request failed after save"));
  await completion;

  assert.deepEqual(state.data.messages["conversation-a"], [delivered]);
  assert.equal(state.failedVoiceUploads.size, 0);
});

test("restores a failed voice retry only for its original existing conversation", async () => {
  const state = { data: {}, failedVoiceUploads: new Map() };
  const restoreFailedVoiceUploads = await loadAppFunction("restoreFailedVoiceUploads", {
    state,
    failedVoiceUploadStorage: {
      getAll: async () => [
        { id: "voice-a", conversationId: "conversation-a", file: { size: 8 }, message: { type: "voice", sendStatus: "failed" } },
        { id: "voice-missing", conversationId: "missing", file: { size: 8 }, message: { type: "voice", sendStatus: "failed" } }
      ]
    },
    getConversation: conversationId => conversationId === "conversation-a"
  });

  await restoreFailedVoiceUploads();

  assert.deepEqual([...state.failedVoiceUploads.keys()], ["voice-a"]);
  assert.equal(state.failedVoiceUploads.get("voice-a").conversationId, "conversation-a");
});
