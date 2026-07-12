import assert from "node:assert/strict";
import test from "node:test";
import { friendRealtimeUpdate } from "./friendRealtime.js";

test("incoming friend request refreshes only the recipient", () => {
  const event = {
    type: "friend.requested",
    payload: { fromUserId: "sender", toUserId: "recipient", user: { nickname: "发送方" } }
  };

  assert.deepEqual(friendRealtimeUpdate(event, "recipient"), {
    refresh: true,
    toast: "收到来自 发送方 的好友申请"
  });
  assert.deepEqual(friendRealtimeUpdate(event, "someone-else"), { refresh: false, toast: "" });
});

test("accepted and rejected friend reviews refresh both participants", () => {
  const accepted = {
    type: "friend.accepted",
    payload: {
      fromUserId: "sender",
      toUserId: "recipient",
      status: "accepted",
      user: { nickname: "发送方" },
      reviewer: { nickname: "接收方" }
    }
  };
  const rejected = { type: "friend.rejected", payload: { ...accepted.payload, status: "rejected" } };

  assert.deepEqual(friendRealtimeUpdate(accepted, "sender"), {
    refresh: true,
    toast: "接收方 已通过你的好友申请"
  });
  assert.deepEqual(friendRealtimeUpdate(accepted, "recipient"), {
    refresh: true,
    toast: "你已通过 发送方 的好友申请"
  });
  assert.deepEqual(friendRealtimeUpdate(rejected, "sender"), {
    refresh: true,
    toast: "接收方 拒绝了你的好友申请"
  });
});
