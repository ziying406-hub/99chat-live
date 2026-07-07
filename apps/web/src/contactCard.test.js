import assert from "node:assert/strict";
import test from "node:test";

import { buildContactCardPayload } from "./contactCard.js";

test("contact card payload uses the selected contact nickname", () => {
  assert.deepEqual(buildContactCardPayload([{ id: "u1", nickname: "苏雅" }], "u1"), {
    ok: true,
    payload: { type: "contact", body: "苏雅" }
  });
});

test("contact card payload rejects a missing contact", () => {
  assert.deepEqual(buildContactCardPayload([{ id: "u1", nickname: "苏雅" }], "u2"), {
    ok: false,
    message: "未找到该联系人"
  });
});
