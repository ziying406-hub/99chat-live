import assert from "node:assert/strict";
import test from "node:test";

import { groupRateLimitExceeded, groupRateLimitKey, groupRateLimitLabel } from "./groupRateLimit.js";

test("rate limit label and key describe current setting", () => {
  assert.equal(groupRateLimitKey(null), "off");
  assert.equal(groupRateLimitLabel(null), "未开启");
  assert.equal(groupRateLimitKey({ enabled: true, windowSeconds: 10, maxMessages: 3 }), "fast");
  assert.equal(groupRateLimitLabel({ enabled: true, windowSeconds: 10, maxMessages: 3 }), "10 秒最多 3 条");
  assert.equal(groupRateLimitKey({ enabled: true, windowSeconds: 60, maxMessages: 10 }), "steady");
});

test("rate limit only blocks regular group members", () => {
  const now = new Date("2026-07-06T00:00:10Z").getTime();
  const args = {
    conversation: { kind: "group" },
    group: { rateLimit: { enabled: true, windowSeconds: 10, maxMessages: 2 } },
    messages: [
      { senderId: "u1", createdAt: "2026-07-06T00:00:01Z" },
      { senderId: "u1", createdAt: "2026-07-06T00:00:05Z" },
      { senderId: "u2", createdAt: "2026-07-06T00:00:06Z" }
    ],
    user: { id: "u1" },
    now
  };

  assert.equal(groupRateLimitExceeded({ ...args, member: { role: "member" } }), true);
  assert.equal(groupRateLimitExceeded({ ...args, member: { role: "admin" } }), false);
  assert.equal(groupRateLimitExceeded({ ...args, member: { role: "owner" } }), false);
});

test("disabled rate limit does not block messages", () => {
  assert.equal(
    groupRateLimitExceeded({
      conversation: { kind: "group" },
      group: { rateLimit: { enabled: false, windowSeconds: 10, maxMessages: 1 } },
      member: { role: "member" },
      messages: [{ senderId: "u1", createdAt: "2026-07-06T00:00:00Z" }],
      user: { id: "u1" },
      now: new Date("2026-07-06T00:00:01Z").getTime()
    }),
    false
  );
});
