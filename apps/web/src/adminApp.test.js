import assert from "node:assert/strict";
import test from "node:test";

import { adminNavButtonAttrs, deriveSection, resolveSectionAccess } from "./admin.js";

test("deriveSection maps admin entry routes", () => {
  assert.equal(deriveSection("/admin/login"), "login");
  assert.equal(deriveSection("/admin.html"), "login");
  assert.equal(deriveSection("/admin/users"), "users");
  assert.equal(deriveSection("/admin"), "dashboard");
});

test("resolveSectionAccess redirects persisted admins from login and loads dashboard", () => {
  assert.deepEqual(resolveSectionAccess({ admin: { id: "admin-1" }, section: "login" }), {
    allowed: false,
    redirectTo: "/admin",
    load: true
  });
});

test("admin nav buttons render as non-submit controls", () => {
  assert.deepEqual(adminNavButtonAttrs({ path: "/admin/users" }), {
    type: "button",
    route: "/admin/users"
  });
});
