import assert from "node:assert/strict";
import test from "node:test";

import { canManageGroupSettings, canOpenGroupSidePage, regularGroupMemberSettingKeys } from "./groupSettingsPermissions.js";

test("regular members cannot open group management pages", () => {
  const member = { userId: "u4", role: "member" };

  assert.equal(canManageGroupSettings(member), false);
  assert.equal(canOpenGroupSidePage("admin", member), false);
  assert.equal(canOpenGroupSidePage("applications", member), false);
  assert.equal(canOpenGroupSidePage("join-mode", member), false);
  assert.equal(canOpenGroupSidePage("rename", member), false);
});

test("regular members cannot open group profile or management pages", () => {
  const member = { userId: "u4", role: "member" };

  assert.equal(canOpenGroupSidePage("members", member), false);
  assert.equal(canOpenGroupSidePage("announcement", member), false);
  assert.equal(canOpenGroupSidePage("qrcode", member), false);
  assert.equal(canOpenGroupSidePage("nickname", member), false);
  assert.equal(canOpenGroupSidePage("media", member), true);
  assert.equal(canOpenGroupSidePage("search", member), true);
  assert.equal(canOpenGroupSidePage("report", member), true);
});

test("owners and admins can open group management pages", () => {
  assert.equal(canManageGroupSettings({ role: "owner" }), true);
  assert.equal(canOpenGroupSidePage("applications", { role: "owner" }), true);
  assert.equal(canManageGroupSettings({ role: "admin" }), true);
  assert.equal(canOpenGroupSidePage("admin", { role: "admin" }), true);
});

test("regular group members only receive the member-safe conversation settings", () => {
  assert.deepEqual(regularGroupMemberSettingKeys(), [
    "media",
    "burn-after-read",
    "mute",
    "pin",
    "search",
    "clear-chat",
    "report"
  ]);
});
