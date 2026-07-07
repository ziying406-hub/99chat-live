import assert from "node:assert/strict";
import test from "node:test";
import { messageMatchesQuery } from "./messageSearch.js";

test("message search matches attachment file names", () => {
  assert.equal(
    messageMatchesQuery(
      {
        type: "video",
        body: "[视频]",
        senderName: "chenshao",
        attachment: { name: "入群教程.mp4" }
      },
      "教程"
    ),
    true
  );
});

test("message search matches body and sender names", () => {
  assert.equal(messageMatchesQuery({ body: "今晚发红包", senderName: "恋情客" }, "红包"), true);
  assert.equal(messageMatchesQuery({ body: "收到", senderName: "苏雅" }, "苏雅"), true);
});
