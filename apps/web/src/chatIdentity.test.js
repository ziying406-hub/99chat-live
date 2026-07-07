import assert from "node:assert/strict";
import test from "node:test";
import { generateRandomChatId, shouldReplaceChatId, userQrText } from "./chatIdentity.js";

test("chat id is mixed lowercase letters and digits", () => {
  const id = generateRandomChatId(6, () => 0.1);

  assert.match(id, /^[a-z][0-9][a-z0-9]{4}$/);
});

test("user qr text carries the same chat id", () => {
  const qrText = userQrText({ id: "u1", chatId: "o8tew3" });

  assert.equal(qrText, "66chat://users/u1?chatId=o8tew3");
});

test("old phone-derived chat ids are replaced", () => {
  assert.equal(shouldReplaceChatId({ phone: "174319676", chatId: "174319676" }), true);
  assert.equal(shouldReplaceChatId({ phone: "174319676", chatId: "u174319676" }), true);
  assert.equal(shouldReplaceChatId({ phone: "174319676", chatId: "o8tew3" }), false);
});
