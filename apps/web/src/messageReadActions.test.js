import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMessageReadReceipt,
  canShowReadDetailAction,
  readStateControl,
  shouldAcknowledgeRealtimeMessage
} from "./messageReadActions.js";

test("own group messages can open read detail from action menu", () => {
  assert.equal(
    canShowReadDetailAction({ senderId: "u1" }, { id: "u1" }, { kind: "group" }),
    true
  );
});

test("received group messages cannot open read detail from action menu", () => {
  assert.equal(
    canShowReadDetailAction({ senderId: "u2" }, { id: "u1" }, { kind: "group" }),
    false
  );
});

test("one-to-one messages do not show group read detail action", () => {
  assert.equal(
    canShowReadDetailAction({ senderId: "u1" }, { id: "u1" }, { kind: "session" }),
    false
  );
});

test("pending or failed messages do not show group read detail action", () => {
  assert.equal(
    canShowReadDetailAction({ senderId: "u1", sendStatus: "failed" }, { id: "u1" }, { kind: "group" }),
    false
  );
});

test("own group read state is clickable with member counts", () => {
  assert.deepEqual(
    readStateControl({ senderId: "u1", readCount: 2, readTotal: 5 }, { id: "u1" }, { kind: "group" }),
    { clickable: true, label: "已读 2/5" }
  );
});

test("own session read state is not clickable", () => {
  assert.deepEqual(
    readStateControl({ senderId: "u1", readCount: 1 }, { id: "u1" }, { kind: "session" }),
    { clickable: false, label: "已读" }
  );
});

test("read receipt uses server counts for matching cached messages", () => {
  const messages = [
    { id: "m1", readCount: 0, readTotal: 1 },
    { id: "m2", readCount: 0, readTotal: 3 }
  ];

  assert.deepEqual(
    applyMessageReadReceipt(messages, {
      messages: [{ messageId: "m1", readCount: 1, readTotal: 1 }]
    }),
    [
      { id: "m1", readCount: 1, readTotal: 1 },
      { id: "m2", readCount: 0, readTotal: 3 }
    ]
  );
});

test("an incoming message in the open conversation is acknowledged immediately", () => {
  assert.equal(
    shouldAcknowledgeRealtimeMessage({
      conversationId: "session-u1--u2",
      selectedConversationId: "session-u1--u2",
      incoming: true
    }),
    true
  );
});

test("outgoing or background realtime messages are not acknowledged again", () => {
  assert.equal(
    shouldAcknowledgeRealtimeMessage({
      conversationId: "session-u1--u2",
      selectedConversationId: "session-u1--u2",
      incoming: false
    }),
    false
  );
  assert.equal(
    shouldAcknowledgeRealtimeMessage({
      conversationId: "session-u1--u2",
      selectedConversationId: "group-1",
      incoming: true
    }),
    false
  );
});
