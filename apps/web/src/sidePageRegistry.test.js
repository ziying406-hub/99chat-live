import assert from "node:assert/strict";
import test from "node:test";

import { isKnownSidePage } from "./sidePageRegistry.js";

test("group administrator pages are routable", () => {
  assert.equal(isKnownSidePage("group-admins"), true);
  assert.equal(isKnownSidePage("admin-add"), true);
  assert.equal(isKnownSidePage("transfer-owner"), true);
});
