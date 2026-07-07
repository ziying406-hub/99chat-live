import assert from "node:assert/strict";
import test from "node:test";

import { updateDraftMap } from "./draftStorage.js";

test("draft map stores non-empty conversation drafts", () => {
  assert.deepEqual(updateDraftMap({}, "group-1", "hello"), { "group-1": "hello" });
});

test("draft map removes empty conversation drafts", () => {
  assert.deepEqual(updateDraftMap({ "group-1": "hello", "group-2": "keep" }, "group-1", ""), { "group-2": "keep" });
});

test("draft map stores reply draft objects", () => {
  assert.deepEqual(updateDraftMap({}, "group-1", { messageId: "m1", preview: "hello" }), {
    "group-1": { messageId: "m1", preview: "hello" }
  });
});
