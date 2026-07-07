import assert from "node:assert/strict";
import test from "node:test";

import { buildAttachmentDescriptor, buildAttachmentMessagePayload, uploadMimeType } from "./attachmentPayload.js";

test("image attachment payload requires an image mime type", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("image", { name: "note.txt", mimeType: "text/plain" }),
    { ok: false, message: "请选择图片文件" }
  );
});

test("image attachment payload accepts common image extensions when mime type is empty", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("image", { name: "photo.JPG", mimeType: "" }),
    { ok: true, payload: { type: "image", body: "[图片]" } }
  );
});

test("attachment descriptor keeps empty mime type for extension fallback", () => {
  assert.deepEqual(
    buildAttachmentDescriptor({ name: "photo.JPG", type: "", size: 1024 }),
    { name: "photo.JPG", mimeType: "", size: 1024 }
  );
});

test("upload mime type falls back from common file extensions", () => {
  assert.equal(uploadMimeType({ name: "photo.JPG", type: "" }), "image/jpeg");
  assert.equal(uploadMimeType({ name: "clip.MP4", type: "" }), "video/mp4");
  assert.equal(uploadMimeType({ name: "archive.bin", type: "" }), "application/octet-stream");
});

test("file attachment payload keeps the original file name", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("file", { name: "说明.pdf", mimeType: "application/pdf" }),
    { ok: true, payload: { type: "file", body: "说明.pdf" } }
  );
});

test("file attachment payload falls back when name is blank", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("file", { name: "   ", mimeType: "application/octet-stream" }),
    { ok: true, payload: { type: "file", body: "文件" } }
  );
});

test("video attachment payload requires a video mime type", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("video", { name: "cover.png", mimeType: "image/png" }),
    { ok: false, message: "请选择视频文件" }
  );
});

test("video attachment payload sends a video message", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("video", { name: "入群教程.mp4", mimeType: "video/mp4" }),
    { ok: true, payload: { type: "video", body: "[视频]" } }
  );
});

test("video attachment payload accepts common video extensions when mime type is empty", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("video", { name: "入群教程.MP4", mimeType: "" }),
    { ok: true, payload: { type: "video", body: "[视频]" } }
  );
});

test("attachment payload rejects files larger than 64MB", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("file", { name: "big.zip", mimeType: "application/zip", size: 65 * 1024 * 1024 }),
    { ok: false, message: "文件不能超过 64MB" }
  );
});

test("attachment payload rejects empty files", () => {
  assert.deepEqual(
    buildAttachmentMessagePayload("file", { name: "empty.txt", mimeType: "text/plain", size: 0 }),
    { ok: false, message: "不能发送空文件" }
  );
});
