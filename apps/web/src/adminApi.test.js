import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_TOKEN_KEY, buildAdminQuery, createAdminApi } from "./adminApi.js";

test("buildAdminQuery omits empty values and encodes filters", () => {
  assert.equal(
    buildAdminQuery({ keyword: "Alice Chen", status: "", page: 2 }),
    "?keyword=Alice+Chen&page=2"
  );
});

test("admin API attaches bearer token", async () => {
  const calls = [];
  const storage = new Map([[ADMIN_TOKEN_KEY, "admin-token"]]);
  const api = createAdminApi({
    apiBase: "http://api.test",
    storage: {
      getItem: key => storage.get(key) || "",
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  });

  await api.getDashboard();
  assert.equal(calls[0].url, "http://api.test/api/admin/dashboard");
  assert.equal(calls[0].options.headers.Authorization, "Bearer admin-token");
});
