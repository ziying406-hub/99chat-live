import assert from "node:assert/strict";
import test from "node:test";
import { prepareSearchResultNavigation } from "./searchNavigation.js";

test("search result navigation closes the detail pane and highlights the message", () => {
  assert.deepEqual(
    prepareSearchResultNavigation("m-video"),
    { sidePage: null, highlightedMessageId: "m-video", query: "", searchResults: [] }
  );
});

test("search result navigation ignores empty message ids", () => {
  assert.equal(prepareSearchResultNavigation(""), null);
});
