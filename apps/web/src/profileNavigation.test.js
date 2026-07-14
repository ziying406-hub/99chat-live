import assert from "node:assert/strict";
import test from "node:test";

import { profileCenterPath } from "./profileNavigation.js";

test("returns to the profile center without retaining the settings hash", () => {
  assert.equal(profileCenterPath({ pathname: "/", search: "?fresh=1" }), "/?fresh=1");
});
