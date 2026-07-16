import assert from "node:assert/strict";
import test from "node:test";

import { editorKeyAction } from "./editorKeyAction.js";

test("sends with Enter when enter-to-send is enabled", () => {
  assert.equal(editorKeyAction({ key: "Enter" }, true), "send");
});

test("keeps a newline for Shift+Enter", () => {
  assert.equal(editorKeyAction({ key: "Enter", shiftKey: true }, true), "newline");
});

test("keeps a newline when enter-to-send is disabled", () => {
  assert.equal(editorKeyAction({ key: "Enter" }, false), "newline");
});

test("sends with Ctrl+Enter when enter-to-send is disabled", () => {
  assert.equal(editorKeyAction({ key: "Enter", ctrlKey: true }, false), "send");
});

test("sends with Command+Enter when enter-to-send is disabled", () => {
  assert.equal(editorKeyAction({ key: "Enter", metaKey: true }, false), "send");
});

test("keeps a newline for Shift+Ctrl+Enter", () => {
  assert.equal(editorKeyAction({ key: "Enter", ctrlKey: true, shiftKey: true }, false), "newline");
});
