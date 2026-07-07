import assert from "node:assert/strict";
import test from "node:test";
import { isOpenableMediaUrl, mediaDisplayName, mediaDisplayUrl } from "./mediaLinks.js";

test("empty media urls are not openable", () => {
  assert.equal(isOpenableMediaUrl(""), false);
  assert.equal(isOpenableMediaUrl(null), false);
});

test("uploaded and browser media urls are openable", () => {
  assert.equal(isOpenableMediaUrl("/uploads/file.pdf"), true);
  assert.equal(isOpenableMediaUrl("blob:http://localhost/demo"), true);
  assert.equal(isOpenableMediaUrl("https://example.com/file.pdf"), true);
});

test("image display urls fall back to the demo image", () => {
  assert.equal(mediaDisplayUrl("", "image"), "/public/demo-photo.svg");
  assert.equal(mediaDisplayUrl("/uploads/photo.png", "image"), "/uploads/photo.png");
});

test("video display urls stay empty when no playable url exists", () => {
  assert.equal(mediaDisplayUrl("", "video"), "");
});

test("media display names trim blank attachment names", () => {
  assert.equal(mediaDisplayName({ attachment: { name: "   " }, body: "" }, "file"), "文件");
  assert.equal(mediaDisplayName({ attachment: { name: "  入群教程.mp4  " }, body: "" }, "video"), "入群教程.mp4");
  assert.equal(mediaDisplayName({ body: "   " }, "image"), "图片");
});
