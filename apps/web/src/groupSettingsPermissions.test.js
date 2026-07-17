import assert from "node:assert/strict";
import test from "node:test";

import { adminGroupSettingKeys, canManageGroupSettings, canOpenGroupSidePage, regularGroupMemberSettingKeys } from "./groupSettingsPermissions.js";

test("regular members cannot open group management pages", () => {
  const member = { userId: "u4", role: "member" };

  assert.equal(canManageGroupSettings(member), false);
  assert.equal(canOpenGroupSidePage("admin", member), false);
  assert.equal(canOpenGroupSidePage("applications", member), false);
  assert.equal(canOpenGroupSidePage("join-mode", member), false);
  assert.equal(canOpenGroupSidePage("rename", member), false);
});

test("regular members can read announcements but cannot open protected group pages", () => {
  const member = { userId: "u4", role: "member" };

  assert.equal(canOpenGroupSidePage("members", member), false);
  assert.equal(canOpenGroupSidePage("announcement", member), true);
  assert.equal(canOpenGroupSidePage("qrcode", member), false);
  assert.equal(canOpenGroupSidePage("nickname", member), false);
  assert.equal(canOpenGroupSidePage("media", member), true);
  assert.equal(canOpenGroupSidePage("search", member), true);
  assert.equal(canOpenGroupSidePage("report", member), true);
});

test("owners can open every group management page", () => {
  assert.equal(canManageGroupSettings({ role: "owner" }), true);
  assert.equal(canOpenGroupSidePage("applications", { role: "owner" }), true);
  assert.equal(canOpenGroupSidePage("transfer-owner", { role: "owner" }), true);
  assert.equal(canOpenGroupSidePage("group-bots", { role: "owner" }), true);
});

test("admins can use their listed group controls but not owner-only pages", () => {
  assert.equal(canManageGroupSettings({ role: "admin" }), true);
  assert.equal(canOpenGroupSidePage("admin", { role: "admin" }), true);
  assert.equal(canOpenGroupSidePage("applications", { role: "admin" }), true);
  assert.equal(canOpenGroupSidePage("qrcode", { role: "admin" }), true);
  assert.equal(canOpenGroupSidePage("group-bots", { role: "admin" }), false);
  assert.equal(canOpenGroupSidePage("rate-limit", { role: "admin" }), false);
  assert.equal(canOpenGroupSidePage("transfer-owner", { role: "admin" }), false);
  assert.equal(canOpenGroupSidePage("rename", { role: "admin" }), false);
});

test("admin settings match the supported management menu", () => {
  assert.deepEqual(adminGroupSettingKeys(), [
    "admin",
    "applications",
    "join-mode",
    "announcement",
    "qrcode",
    "nickname",
    "media",
    "search",
    "clear-chat",
    "mute",
    "pin",
    "report"
  ]);
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
