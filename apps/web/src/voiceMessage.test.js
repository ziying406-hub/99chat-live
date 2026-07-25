import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  formatVoiceDuration,
  isRecordableVoiceDuration,
  shouldAutoPlayIncomingVoice
} from "./voiceMessage.js";

async function loadAppFunction(name, dependencies) {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in app.js`);
  const nextFunctionOffset = appSource.slice(start + 1).search(/\n\n(?:async )?function /);
  const end = nextFunctionOffset === -1 ? -1 : start + 1 + nextFunctionOffset;
  const source = appSource.slice(start, end === -1 ? undefined : end);
  return new Function(...Object.keys(dependencies), `${source}; return ${name};`)(...Object.values(dependencies));
}

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

test("renders attached voice messages as playback controls while retaining the legacy fallback", async () => {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(appSource, /data-play-voice/);
  assert.match(appSource, /voice-message-progress/);
  assert.match(appSource, /formatVoiceDuration\(progressSeconds\)/);
  assert.match(appSource, /🎙 语音消息 \$\{duration\}/);
});

test("renders a received persisted voice attachment as a player", async () => {
  const state = {
    activeVoiceMessageId: null,
    activeVoiceDuration: 0,
    activeVoiceProgress: 0,
    activeVoicePlaying: false
  };
  const renderMessageBody = await loadAppFunction("renderMessageBody", {
    renderQuotedMessage: () => "",
    mediaURL: value => `https://api.example.test${value}`,
    formatVoiceDuration: () => "00:02",
    state,
    escapeAttr: value => value
  });

  const html = renderMessageBody({
    id: "voice-1",
    type: "voice",
    body: "2",
    attachment: { url: "/uploads/voice.webm" }
  });

  assert.match(html, /data-play-voice="voice-1"/);
  assert.match(html, /data-voice-source="https:\/\/api\.example\.test\/uploads\/voice\.webm"/);
  assert.doesNotMatch(html, /🎙 语音消息/);
});

test("passes the derived incoming flag into realtime voice autoplay", async () => {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(appSource, /const incoming = String\(message\.senderId \|\| ""\) !== String\(state\.user\?\.id \|\| ""\)/);
  assert.match(appSource, /shouldAutoPlayIncomingVoice\(\{[\s\S]*isIncoming: incoming/);
});

test("requires the chat conversation to be visibly open before autoplay", async () => {
  const state = { section: "messages", sidePage: null, selectedConversationId: "c1" };
  const isVoiceAutoplayConversationOpen = await loadAppFunction("isVoiceAutoplayConversationOpen", { state });

  assert.equal(isVoiceAutoplayConversationOpen("c1"), true);
  state.section = "contact";
  assert.equal(isVoiceAutoplayConversationOpen("c1"), false, "contacts hides the chat conversation");
  state.section = "me";
  assert.equal(isVoiceAutoplayConversationOpen("c1"), false, "profile hides the chat conversation");
  state.section = "messages";
  state.sidePage = "settings";
  assert.equal(isVoiceAutoplayConversationOpen("c1"), false, "a chat side page hides the conversation");
  state.sidePage = null;
  assert.equal(isVoiceAutoplayConversationOpen("c2"), false, "another conversation is not open");
});

test("clears and rerenders after voice playback is rejected", async () => {
  const state = { activeVoiceAudio: null, activeVoiceMessageId: null };
  const rendered = [];
  const toasts = [];
  let rejectPlay;
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.listeners = {};
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    pause() {}

    play() {
      return new Promise((_, reject) => {
        rejectPlay = reject;
      });
    }
  }
  const playVoiceMessage = await loadAppFunction("playVoiceMessage", {
    state,
    Audio: FakeAudio,
    mediaURL: value => value,
    render: () => rendered.push("render"),
    toast: message => toasts.push(message)
  });

  playVoiceMessage({ id: "voice-1", attachment: { url: "/uploads/voice-1.webm" } });
  rejectPlay(new Error("autoplay blocked"));
  await Promise.resolve();

  assert.equal(state.activeVoiceAudio, null);
  assert.equal(state.activeVoiceMessageId, null);
  assert.equal(rendered.length, 2, "renders once to start and once to clear the failed state");
  assert.deepEqual(toasts, ["语音播放失败"]);
});

test("keeps only the newest voice player active through its lifecycle", async () => {
  const state = { activeVoiceAudio: null, activeVoiceMessageId: null };
  const players = [];
  class FakeAudio {
    constructor() {
      this.listeners = {};
      this.paused = false;
      players.push(this);
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    pause() {
      this.paused = true;
    }

    play() {
      return Promise.resolve();
    }
  }
  const playVoiceMessage = await loadAppFunction("playVoiceMessage", {
    state,
    Audio: FakeAudio,
    mediaURL: value => value,
    render: () => {},
    toast: () => {}
  });

  playVoiceMessage({ id: "voice-1", attachment: { url: "/uploads/voice-1.webm" } });
  playVoiceMessage({ id: "voice-2", attachment: { url: "/uploads/voice-2.webm" } });

  assert.equal(players[0].paused, true);
  assert.equal(state.activeVoiceAudio, players[1]);
  assert.equal(state.activeVoiceMessageId, "voice-2");
  players[0].listeners.ended();
  assert.equal(state.activeVoiceMessageId, "voice-2", "a paused old player cannot clear the current player");
  players[1].listeners.ended();
  assert.equal(state.activeVoiceAudio, null);
  assert.equal(state.activeVoiceMessageId, null);
});

test("pauses and resumes the same voice message while retaining playback progress", async () => {
  const state = {
    activeVoiceAudio: null,
    activeVoiceMessageId: null,
    activeVoicePlaying: false,
    activeVoiceProgress: 0,
    activeVoiceDuration: 0
  };
  const players = [];
  class FakeAudio {
    constructor() {
      this.listeners = {};
      this.currentTime = 0;
      this.duration = 12;
      players.push(this);
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    pause() {
      this.listeners.pause();
    }

    play() {
      this.listeners.play();
      return Promise.resolve();
    }
  }
  const playVoiceMessage = await loadAppFunction("playVoiceMessage", {
    state,
    Audio: FakeAudio,
    mediaURL: value => value,
    render: () => {},
    toast: () => {}
  });

  const message = { id: "voice-1", attachment: { url: "/uploads/voice-1.webm" } };
  playVoiceMessage(message);
  players[0].currentTime = 4.5;
  players[0].listeners.timeupdate();
  playVoiceMessage(message);

  assert.equal(players.length, 1, "pausing must retain the existing audio instance");
  assert.equal(state.activeVoiceMessageId, "voice-1");
  assert.equal(state.activeVoicePlaying, false);
  assert.equal(state.activeVoiceProgress, 4.5);
  assert.equal(state.activeVoiceDuration, 12);

  playVoiceMessage(message);

  assert.equal(players.length, 1, "resuming must not restart playback from a new audio instance");
  assert.equal(players[0].currentTime, 4.5);
  assert.equal(state.activeVoicePlaying, true);
});

test("cleans up playback state when a voice player emits an error", async () => {
  const state = {
    activeVoiceAudio: null,
    activeVoiceMessageId: null,
    activeVoicePlaying: false,
    activeVoiceProgress: 0,
    activeVoiceDuration: 0
  };
  class FakeAudio {
    constructor() {
      this.listeners = {};
      this.currentTime = 3;
      this.duration = 9;
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    pause() {}

    play() {
      return Promise.resolve();
    }
  }
  const toasts = [];
  const playVoiceMessage = await loadAppFunction("playVoiceMessage", {
    state,
    Audio: FakeAudio,
    mediaURL: value => value,
    render: () => {},
    toast: message => toasts.push(message)
  });

  playVoiceMessage({ id: "voice-1", attachment: { url: "/uploads/voice-1.webm" } });
  state.activeVoiceAudio.listeners.error();

  assert.equal(state.activeVoiceAudio, null);
  assert.equal(state.activeVoiceMessageId, null);
  assert.equal(state.activeVoicePlaying, false);
  assert.equal(state.activeVoiceProgress, 0);
  assert.equal(state.activeVoiceDuration, 0);
  assert.deepEqual(toasts, ["语音播放失败"]);
});
