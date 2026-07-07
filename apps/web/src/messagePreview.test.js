import assert from "node:assert/strict";
import test from "node:test";
import { messagePreviewText, messageTypeLabel, quotePreviewText, searchPreviewText } from "./messagePreview.js";

test("message type labels include video and collection cards", () => {
  assert.equal(messageTypeLabel("video"), "视频");
  assert.equal(messageTypeLabel("collection"), "收藏");
});

test("conversation preview shows readable labels for video and collection messages", () => {
  assert.equal(messagePreviewText({ type: "video", body: "[视频]" }), "[视频]");
  assert.equal(messagePreviewText({ type: "collection", body: "客户资料卡片" }), "[收藏]");
});

test("quote preview keeps useful body text for non-text messages", () => {
  assert.equal(quotePreviewText({ type: "collection", body: "客户资料卡片" }), "[收藏] 客户资料卡片");
  assert.equal(quotePreviewText({ type: "video", attachment: { name: "入群教程.mp4" } }), "[视频] 入群教程.mp4");
});

test("search preview uses readable media labels and file names", () => {
  assert.equal(searchPreviewText({ type: "video", body: "[视频]", attachment: { name: "入群教程.mp4" } }), "[视频] 入群教程.mp4");
  assert.equal(searchPreviewText({ type: "file", body: "合同.pdf", attachment: { name: "合同.pdf" } }), "[文件] 合同.pdf");
});

test("preview falls back when attachment name is blank", () => {
  assert.equal(quotePreviewText({ type: "file", body: "", attachment: { name: "   " } }), "[文件]");
});
