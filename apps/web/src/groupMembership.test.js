import assert from "node:assert/strict";
import test from "node:test";

import { canLeaveGroup } from "./groupMembership.js";

test("group owner cannot leave before transferring ownership", () => {
  assert.equal(canLeaveGroup({ userId: "u1", role: "owner" }), false);
});

test("non-owner members can leave the group", () => {
  assert.equal(canLeaveGroup({ userId: "u2", role: "member" }), true);
  assert.equal(canLeaveGroup({ userId: "u3", role: "admin" }), true);
});
