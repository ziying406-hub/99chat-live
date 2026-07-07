import assert from "node:assert/strict";
import test from "node:test";
import { createAddFriendDraft, updateAddFriendDraft } from "./addFriendDraft.js";

test("add friend draft starts with an empty chat id and default greeting", () => {
  assert.deepEqual(createAddFriendDraft(), {
    chatId: "",
    greeting: "你好，我想加你为好友"
  });
});

test("add friend draft preserves chat id when only greeting changes", () => {
  const draft = createAddFriendDraft({ chatId: "abc123", greeting: "hello" });

  assert.deepEqual(updateAddFriendDraft(draft, { greeting: "你好" }), {
    chatId: "abc123",
    greeting: "你好"
  });
});

test("add friend draft preserves greeting when only chat id changes", () => {
  const draft = createAddFriendDraft({ chatId: "old", greeting: "验证一下" });

  assert.deepEqual(updateAddFriendDraft(draft, { chatId: "new456" }), {
    chatId: "new456",
    greeting: "验证一下"
  });
});

