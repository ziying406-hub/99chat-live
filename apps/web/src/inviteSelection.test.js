import assert from "node:assert/strict";
import test from "node:test";
import {
  areAllInviteCandidatesSelected,
  updateInviteSelection,
  updateInviteSelectionForCandidates
} from "./inviteSelection.js";

test("invite selection keeps a checked member independently of the DOM", () => {
  const selected = updateInviteSelection(new Set(), "u1", true);
  assert.deepEqual([...selected], ["u1"]);
  assert.deepEqual([...updateInviteSelection(selected, "u1", false)], []);
});

test("invite selection toggles all available candidates without dropping unrelated selections", () => {
  const selected = updateInviteSelectionForCandidates(new Set(["u1"]), ["u2", "u3"], true);
  assert.deepEqual([...selected], ["u1", "u2", "u3"]);
  assert.deepEqual([...updateInviteSelectionForCandidates(selected, ["u2", "u3"], false)], ["u1"]);
});

test("all-selected status only applies when every available candidate is selected", () => {
  assert.equal(areAllInviteCandidatesSelected(new Set(["u1", "u2"]), ["u1", "u2"]), true);
  assert.equal(areAllInviteCandidatesSelected(new Set(["u1"]), ["u1", "u2"]), false);
  assert.equal(areAllInviteCandidatesSelected(new Set(["u1"]), []), false);
});
