import assert from "node:assert/strict";
import test from "node:test";

import { nextNetworkLine } from "./networkLine.js";

test("network line cycles to the next available line", () => {
  assert.equal(nextNetworkLine("线路 A"), "线路 B");
  assert.equal(nextNetworkLine("线路 B"), "线路 C");
  assert.equal(nextNetworkLine("线路 C"), "线路 A");
});

test("unknown network line falls back to the first line", () => {
  assert.equal(nextNetworkLine("未知线路"), "线路 A");
});
