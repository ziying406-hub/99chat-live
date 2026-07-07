import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarkUnreadPatch,
  effectiveUnreadCount,
  resolveSelectedConversationId,
  shouldShowMentionReminder,
  shouldNotifyConversation,
  sortConversationList,
  unreadBadgeLabel
} from "./conversationState.js";

test("mark unread keeps an existing mention reminder", () => {
  assert.deepEqual(buildMarkUnreadPatch({ unread: 0, mentionedMe: true }), {
    unread: 1,
    mentionedMe: true
  });
});

test("mark unread does not create a mention reminder", () => {
  assert.deepEqual(buildMarkUnreadPatch({ unread: 0, mentionedMe: false }), {
    unread: 1,
    mentionedMe: false
  });
});

test("initial load keeps a visible selected conversation", () => {
  const conversations = [
    { id: "group-a", mentionedMe: true },
    { id: "session-b" }
  ];

  assert.equal(resolveSelectedConversationId("group-a", conversations), "group-a");
});

test("initial load falls back to the first visible conversation", () => {
  const conversations = [
    { id: "group-a", mentionedMe: true },
    { id: "session-b" }
  ];

  assert.equal(resolveSelectedConversationId("missing", conversations), "group-a");
});

test("read conversations do not show mention reminders from old preview text", () => {
  assert.equal(shouldShowMentionReminder({ mentionedMe: false, lastText: "@提醒乙 mention-ui" }), false);
  assert.equal(shouldShowMentionReminder({ mentionedMe: false, lastText: "[有人@你] 苏洋：1111" }), false);
});

test("unread mention state shows mention reminder", () => {
  assert.equal(shouldShowMentionReminder({ mentionedMe: true, lastText: "@提醒乙 mention-ui" }), true);
});

test("conversation sorting puts pinned and attention items first", () => {
  const conversations = [
    { id: "old", lastAt: "2026-07-05T10:00:00Z", unread: 0 },
    { id: "pinned", lastAt: "2026-07-05T08:00:00Z", pinned: true, unread: 0 },
    { id: "mention", lastAt: "2026-07-05T07:00:00Z", mentionedMe: true, unread: 0 },
    { id: "unread", lastAt: "2026-07-05T06:00:00Z", unread: 2 },
    { id: "new", lastAt: "2026-07-05T12:00:00Z", unread: 0 }
  ];

  assert.deepEqual(sortConversationList(conversations).map(item => item.id), [
    "pinned",
    "unread",
    "mention",
    "new",
    "old"
  ]);
});

test("muted conversations do not count toward global unread unless they mention me", () => {
  const conversations = [
    { id: "muted", lastAt: "2026-07-05T13:00:00Z", unread: 99, muted: true },
    { id: "muted-mention", lastAt: "2026-07-05T11:00:00Z", unread: 2, muted: true, mentionedMe: true },
    { id: "normal", lastAt: "2026-07-05T12:00:00Z", unread: 1 },
    { id: "quiet", lastAt: "2026-07-05T14:00:00Z", unread: 0 }
  ];

  assert.equal(effectiveUnreadCount(conversations), 3);
  assert.equal(shouldNotifyConversation(conversations[0]), false);
  assert.equal(shouldNotifyConversation(conversations[2]), true);
  assert.deepEqual(sortConversationList(conversations).map(item => item.id), [
    "muted-mention",
    "normal",
    "muted",
    "quiet"
  ]);
});

test("unread badge label shows real count and caps only above 99", () => {
  assert.equal(unreadBadgeLabel(0), "");
  assert.equal(unreadBadgeLabel(1), "1");
  assert.equal(unreadBadgeLabel(99), "99");
  assert.equal(unreadBadgeLabel(100), "99+");
});
