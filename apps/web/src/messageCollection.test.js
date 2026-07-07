import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionFromMessage } from "./messageCollection.js";

test("video messages are saved as video collections", () => {
  assert.deepEqual(
    buildCollectionFromMessage({
      id: "m-video",
      type: "video",
      senderName: "chenshao",
      attachment: { name: "入群教程.mp4" }
    }),
    {
      kind: "video",
      title: "chenshao 的消息",
      preview: "入群教程.mp4",
      messageId: "m-video"
    }
  );
});

test("plain text messages keep their body as collection preview", () => {
  assert.deepEqual(
    buildCollectionFromMessage({ id: "m-text", type: "text", senderName: "苏雅", body: "会议安排" }),
    {
      kind: "text",
      title: "苏雅 的消息",
      preview: "会议安排",
      messageId: "m-text"
    }
  );
});

test("collection preview falls back when attachment name is blank", () => {
  assert.deepEqual(
    buildCollectionFromMessage({ id: "m-file", type: "file", senderName: "苏雅", body: "", attachment: { name: "   " } }),
    {
      kind: "file",
      title: "苏雅 的消息",
      preview: "",
      messageId: "m-file"
    }
  );
});
