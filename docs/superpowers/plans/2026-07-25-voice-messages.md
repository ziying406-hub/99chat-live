# Voice Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build browser-recorded voice messages that can be uploaded, played, and automatically played for new messages when the setting is enabled.

**Architecture:** MediaRecorder lifecycle remains in `app.js`, alongside the existing composer. A small pure module owns duration formatting and automatic-play eligibility. The audio blob uses the existing signed upload and message attachment flow.

**Tech Stack:** Vanilla JavaScript, MediaRecorder, HTMLAudioElement, existing Go API, Node test runner.

## Global Constraints

- Keep the existing `voice` message type and signed upload API.
- Do not create an outgoing message when microphone access, recording, or upload fails.
- Automatically play only incoming voice messages in the visible, selected conversation.
- Keep legacy voice messages without an attachment readable as duration text.

---

### Task 1: Add pure voice rules

**Files:**
- Create: `apps/web/src/voiceMessage.js`
- Create: `apps/web/src/voiceMessage.test.js`

**Interfaces:**
- `formatVoiceDuration(seconds: number): string`
- `isRecordableVoiceDuration(milliseconds: number): boolean`
- `shouldAutoPlayIncomingVoice(input): boolean`

- [ ] **Step 1: Write failing tests**

```js
assert.equal(formatVoiceDuration(65), "01:05");
assert.equal(isRecordableVoiceDuration(999), false);
assert.equal(isRecordableVoiceDuration(1000), true);
assert.equal(shouldAutoPlayIncomingVoice({
  message: { type: "voice", attachment: { url: "/uploads/a.webm" } },
  isCurrentConversation: true,
  isVisible: true,
  enabled: true
}), true);
```

- [ ] **Step 2: Verify test failure**

Run: `node --test apps/web/src/voiceMessage.test.js`

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the rule module**

```js
export function formatVoiceDuration(seconds = 0) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function isRecordableVoiceDuration(milliseconds = 0) { return Number(milliseconds) >= 1000; }
export function shouldAutoPlayIncomingVoice({ message, isCurrentConversation, isVisible, enabled }) {
  return Boolean(enabled && isCurrentConversation && isVisible && message?.type === "voice" && message?.attachment?.url);
}
```

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/web/src/voiceMessage.test.js`

Run: `git add apps/web/src/voiceMessage.js apps/web/src/voiceMessage.test.js && git commit -m "feat: add voice message rules"`

### Task 2: Record and send audio

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/voiceMessage.test.js`

**Interfaces:**
- Consumes: `isRecordableVoiceDuration` and `formatVoiceDuration`.
- Produces: `{ type: "voice", body: "08", attachment }` through `sendMessage`.

- [ ] **Step 1: Add recorder state**

```js
voiceRecorder: null,
voiceStream: null,
voiceStartedAt: 0,
voiceRecording: false,
```

- [ ] **Step 2: Add recording lifecycle**

```js
async function startVoiceRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener("stop", () => finishVoiceRecording(recorder, chunks));
  state.voiceStream = stream;
  state.voiceRecorder = recorder;
  state.voiceStartedAt = Date.now();
  state.voiceRecording = true;
  recorder.start();
  render();
}
```

- [ ] **Step 3: Finish safely and upload**

```js
async function finishVoiceRecording(recorder, chunks) {
  const elapsed = Date.now() - state.voiceStartedAt;
  stopVoiceTracks();
  if (!isRecordableVoiceDuration(elapsed)) return toast("录音时间至少 1 秒");
  const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
  const attachment = await uploadFile(file);
  await sendMessage({ type: "voice", body: String(Math.round(elapsed / 1000)), attachment });
}
```

- [ ] **Step 4: Bind pointer events and render state**

The voice pad starts on `pointerdown`; it stops on `pointerup`, `pointercancel`, or `pointerleave` only when recording. Render `按住录音` normally and `松开发送` while active. Cancel tracks on conversation change and page unload.

- [ ] **Step 5: Verify and commit**

Run: `node --test apps/web/src/voiceMessage.test.js apps/web/src/composerActions.test.js`

Manual: authorize the microphone, hold for at least one second, release, and confirm an attached `voice` message is sent.

Run: `git add apps/web/src/app.js apps/web/src/styles.css apps/web/src/voiceMessage.test.js && git commit -m "feat: record and send voice messages"`

### Task 3: Add playback and auto-play

**Files:**
- Modify: `apps/web/src/app.js`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/voiceMessage.test.js`

**Interfaces:**
- Consumes: `formatVoiceDuration` and `shouldAutoPlayIncomingVoice`.
- Produces: `playVoiceMessage(message)` and `data-play-voice` controls.

- [ ] **Step 1: Render a voice control**

```js
if (message.type === "voice") {
  const source = message.attachment?.url;
  if (!source) return `${quote}<div>🎙 语音消息 ${formatVoiceDuration(message.body)}</div>`;
  return `${quote}<button class="voice-message" type="button" data-play-voice="${escapeAttr(message.id)}">▶ ${formatVoiceDuration(message.body)}</button>`;
}
```

- [ ] **Step 2: Add one active audio player**

```js
function playVoiceMessage(message) {
  state.activeVoiceAudio?.pause();
  const audio = new Audio(message.attachment.url);
  state.activeVoiceAudio = audio;
  state.activeVoiceMessageId = message.id;
  audio.addEventListener("ended", () => { state.activeVoiceMessageId = null; render(); });
  audio.play().catch(() => toast("语音播放失败"));
  render();
}
```

- [ ] **Step 3: Apply eligibility to realtime incoming messages**

```js
if (shouldAutoPlayIncomingVoice({
  message,
  isCurrentConversation: message.conversationId === state.selectedConversationId,
  isVisible: document.visibilityState === "visible",
  enabled: ensureUserSettings().autoPlayVoice
})) playVoiceMessage(message);
```

- [ ] **Step 4: Verify and commit**

Run: `node --test apps/web/src/voiceMessage.test.js`

Manual: confirm setting-off does not start playback; setting-on starts one new, visible incoming voice message only.

Run: `git add apps/web/src/app.js apps/web/src/styles.css apps/web/src/voiceMessage.test.js && git commit -m "feat: play incoming voice messages"`

### Task 4: Full validation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-25-voice-messages-design.md` only if implementation changes the approved behavior.

- [ ] **Step 1: Run the targeted suite**

Run: `node --test apps/web/src/voiceMessage.test.js apps/web/src/composerActions.test.js apps/web/src/chatPreferenceBehavior.test.js apps/web/src/editorKeyAction.test.js apps/web/src/messagePreview.test.js`

Expected: all tests pass.

- [ ] **Step 2: Run static validation**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 3: Deploy and verify in v2**

Verify recording, refresh-and-play, automatic playback on/off, a denied microphone request, and a recording shorter than one second.
