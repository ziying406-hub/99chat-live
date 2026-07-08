import assert from "node:assert/strict";
import test from "node:test";

import { adminRoutes } from "./adminStatus.js";
import { adminNavButtonAttrs, deriveSection, renderAdminNavMarkup, resolveSectionAccess, shouldIgnoreAdminClick } from "./admin.js";

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

test("sidebar nav markup renders button type and route for every admin section", () => {
  const markup = renderAdminNavMarkup("users");

  for (const route of adminRoutes) {
    assert.match(markup, new RegExp(`type="button"[\\s\\S]*data-route="${route.path.replaceAll("/", "\\/")}"`));
  }

  assert.match(markup, /class="admin-nav-link active"/);
});

test("delegated click guard only ignores routed submit buttons", () => {
  assert.equal(shouldIgnoreAdminClick({ dataset: { route: "/admin/users" }, type: "submit" }), true);
  assert.equal(shouldIgnoreAdminClick({ dataset: { route: "/admin/users" }, type: "button" }), false);
  assert.equal(shouldIgnoreAdminClick({ dataset: {}, type: "submit" }), false);
});
