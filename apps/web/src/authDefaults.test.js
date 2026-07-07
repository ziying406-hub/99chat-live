import assert from "node:assert/strict";
import test from "node:test";

import { emptyAuthDefaults } from "./authDefaults.js";

test("auth form does not prefill demo phone or password", () => {
  assert.deepEqual(emptyAuthDefaults(), {
    country: "+60",
    phone: "",
    password: ""
  });
});
