import test from "node:test";
import assert from "node:assert/strict";

import {
  collectionFilters,
  collectionFilterLabel,
  collectionFilterMatches,
  filterCollections
} from "./collectionFilters.js";

const items = [
  { id: "c1", kind: "text", title: "文字收藏" },
  { id: "c2", kind: "image", title: "图片收藏" },
  { id: "c3", kind: "video", title: "视频收藏" },
  { id: "c4", kind: "file", title: "文件收藏" },
  { id: "c5", kind: "voice", title: "语音收藏" }
];

test("collection filters expose the visible tabs in order", () => {
  assert.deepEqual(collectionFilters.map(item => item.label), ["全部", "文字", "图片与视频", "文件", "语音"]);
});

test("media filter includes image and video collections", () => {
  assert.deepEqual(filterCollections(items, "media").map(item => item.id), ["c2", "c3"]);
});

test("specific filters only include matching collection kind", () => {
  assert.equal(collectionFilterMatches(items[0], "text"), true);
  assert.deepEqual(filterCollections(items, "file").map(item => item.id), ["c4"]);
  assert.deepEqual(filterCollections(items, "voice").map(item => item.id), ["c5"]);
});

test("unknown or empty filters fall back to all collections and label", () => {
  assert.deepEqual(filterCollections(items, "unknown").map(item => item.id), items.map(item => item.id));
  assert.equal(collectionFilterLabel("unknown"), "全部");
});
