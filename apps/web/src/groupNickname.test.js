import assert from "node:assert/strict";
import test from "node:test";

import { groupNicknameForMember } from "./groupNickname.js";

test("uses the current member nickname instead of a shared group nickname", () => {
  const nickname = groupNicknameForMember({
    myNickname: "原群主昵称",
    members: [
      { userId: "owner", nickname: "原群主昵称", role: "admin" },
      { userId: "new-owner", nickname: "新群主昵称", role: "owner" }
    ]
  }, "new-owner", "账号昵称");

  assert.equal(nickname, "新群主昵称");
});
