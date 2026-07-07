import assert from "node:assert/strict";
import test from "node:test";

import { groupJoinReviewErrorMessage } from "./groupJoinReviewErrors.js";

test("translates blacklisted join review errors", () => {
  assert.equal(
    groupJoinReviewErrorMessage(new Error("group blacklist blocks join")),
    "该用户已在群黑名单，不能同意入群"
  );
});

test("falls back for unknown join review errors", () => {
  assert.equal(groupJoinReviewErrorMessage(new Error("network failed")), "入群审核失败");
});
