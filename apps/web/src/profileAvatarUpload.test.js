import assert from "node:assert/strict";
import test from "node:test";

import { persistentProfileAvatarUrl } from "./profileAvatarUpload.js";

test("profile avatar uses the uploaded public URL instead of a temporary blob URL", () => {
  assert.equal(
    persistentProfileAvatarUrl({ url: "/uploads/file-1/avatar.png" }),
    "/uploads/file-1/avatar.png"
  );
});

test("profile avatar rejects a temporary browser URL", () => {
  assert.throws(
    () => persistentProfileAvatarUrl({ url: "blob:https://99.99chat99.com/avatar" }),
    /uploaded avatar/i
  );
});
