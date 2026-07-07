import assert from "node:assert/strict";
import test from "node:test";

import { buildAboutInfo } from "./aboutInfo.js";

test("about info includes demo version for mock mode", () => {
  assert.deepEqual(buildAboutInfo({ useMock: true, networkLine: "线路 B", conversationCount: 8 }), {
    version: "v0.1 Demo",
    mode: "本地演示",
    networkLine: "线路 B",
    conversationCount: 8
  });
});

test("about info includes beta version for online mode", () => {
  assert.deepEqual(buildAboutInfo({ useMock: false, networkLine: "线路 A", conversationCount: 12 }), {
    version: "v0.1 Beta",
    mode: "在线接口",
    networkLine: "线路 A",
    conversationCount: 12
  });
});
