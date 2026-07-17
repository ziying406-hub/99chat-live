import assert from "node:assert/strict";
import test from "node:test";

import { groupAnnouncementText } from "./groupAnnouncement.js";

test("group announcement trims display text", () => {
  assert.equal(groupAnnouncementText({ announcement: "  请先阅读群规则  " }), "请先阅读群规则");
});

test("group announcement is empty when no announcement was published", () => {
  assert.equal(groupAnnouncementText({ announcement: "   " }), "");
  assert.equal(groupAnnouncementText(null), "");
});
