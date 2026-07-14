import assert from "node:assert/strict";
import test from "node:test";

import { emptyAuthDefaults, readAuthDefaults, saveAuthDefaults } from "./authDefaults.js";

test("auth form does not prefill demo phone or password", () => {
  assert.deepEqual(emptyAuthDefaults(), {
    country: "+60",
    phone: "",
    password: ""
  });
});

test("auth form restores the last successfully used country code", () => {
  const store = new Map();
  const storage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, value)
  };

  saveAuthDefaults(storage, { country: "+65" });

  assert.deepEqual(readAuthDefaults(storage), {
    country: "+65",
    phone: "",
    password: ""
  });
});
