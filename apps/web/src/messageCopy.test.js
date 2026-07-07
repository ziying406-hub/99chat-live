import assert from "node:assert/strict";
import test from "node:test";

import { formatMessageForCopy } from "./messageCopy.js";

test("collection card messages copy as readable card text", () => {
  assert.equal(
    formatMessageForCopy({ type: "collection", body: "客户资料卡片" }),
    "[收藏] 客户资料卡片"
  );
});

test("quoted media messages keep quote context when copied", () => {
  assert.equal(
    formatMessageForCopy({
      type: "file",
      body: "合同.pdf",
      quote: { senderName: "苏雅", preview: "请看这个" }
    }),
    "引用 苏雅：请看这个\n[文件] 合同.pdf"
  );
});

test("video messages copy with their file name", () => {
  assert.equal(
    formatMessageForCopy({
      type: "video",
      body: "[视频]",
      attachment: { name: "入群教程.mp4" }
    }),
    "[视频] 入群教程.mp4"
  );
});

test("media copy falls back when attachment name is blank", () => {
  assert.equal(
    formatMessageForCopy({ type: "file", body: "", attachment: { name: "   " } }),
    "[文件]"
  );
});

test("unknown empty messages copy with a generic fallback", () => {
  assert.equal(formatMessageForCopy({ type: "unknown", body: "" }), "[消息]");
});
