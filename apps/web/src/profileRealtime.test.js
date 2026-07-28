import assert from "node:assert/strict";
import test from "node:test";

import { applyProfileRealtimeUpdate } from "./profileRealtime.js";

test("profile realtime updates refresh private conversation avatars outside the chat view", () => {
  const data = {
    contacts: [{ id: "u2", nickname: "大帅", signature: "旧签名", avatar: "/old.png" }],
    directory: [],
    conversations: [{ id: "session-u1--u2", kind: "session", title: "大帅", avatar: "/old.png" }],
    messages: {
      "session-u1--u2": [{ id: "m1", senderId: "u2", senderAvatar: "/old.png" }]
    }
  };

  const changed = applyProfileRealtimeUpdate(data, { id: "u1" }, {
    id: "u2",
    nickname: "大帅",
    signature: "新签名",
    avatar: "/new.png"
  });

  assert.equal(changed, true);
  assert.equal(data.contacts[0].avatar, "/new.png");
  assert.equal(data.contacts[0].signature, "新签名");
  assert.equal(data.conversations[0].avatar, "/new.png");
  assert.equal(data.messages["session-u1--u2"][0].senderAvatar, "/new.png");
});
