import assert from "node:assert/strict";
import test from "node:test";
import { buildCreateGroupPayload, toggleCreateGroupSelection } from "./createGroupPayload.js";

const contacts = [
  { id: "u1", nickname: "阿一" },
  { id: "u2", nickname: "阿二" },
  { id: "u3", nickname: "阿三" }
];

test("create group payload trims title and keeps selected member ids", () => {
  assert.deepEqual(buildCreateGroupPayload("  项目群  ", ["u2", "u1", "u2"], contacts), {
    title: "项目群",
    memberIds: ["u2", "u1"]
  });
});

test("create group payload falls back to default title", () => {
  assert.deepEqual(buildCreateGroupPayload("", [], contacts), {
    title: "新的群聊",
    memberIds: []
  });
});

test("create group selection supports single toggle and select all", () => {
  assert.deepEqual(toggleCreateGroupSelection(["u1"], "u2", contacts), ["u1", "u2"]);
  assert.deepEqual(toggleCreateGroupSelection(["u1", "u2"], "u1", contacts), ["u2"]);
  assert.deepEqual(toggleCreateGroupSelection(["u1"], "all", contacts), ["u1", "u2", "u3"]);
  assert.deepEqual(toggleCreateGroupSelection(["u1", "u2", "u3"], "all", contacts), []);
});
