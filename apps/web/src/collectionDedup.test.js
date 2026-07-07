import assert from "node:assert/strict";
import test from "node:test";

import { findCollectionByMessageId } from "./collectionDedup.js";

test("finds an existing collection by message id", () => {
  assert.deepEqual(
    findCollectionByMessageId([{ id: "col-1", messageId: "m1" }], "m1"),
    { id: "col-1", messageId: "m1" }
  );
});

test("ignores blank message ids when checking duplicates", () => {
  assert.equal(findCollectionByMessageId([{ id: "col-1", messageId: "" }], ""), null);
});
