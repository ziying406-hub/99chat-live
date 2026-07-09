import assert from "node:assert/strict";
import test from "node:test";

import { adminRoutes } from "./adminStatus.js";
import { adminNavButtonAttrs, deriveSection, normalizeLoaderFilters, renderAdminFilterFields, renderAdminNavMarkup, renderAdminPlaceholder, resolveSectionAccess, shouldIgnoreAdminClick } from "./admin.js";

test("deriveSection maps admin entry routes", () => {
  assert.equal(deriveSection("/admin/login"), "login");
  assert.equal(deriveSection("/admin.html"), "login");
  assert.equal(deriveSection("/admin/users"), "users");
  assert.equal(deriveSection("/admin/settings"), "settings");
  assert.equal(deriveSection("/admin/admins"), "admins");
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

test("sidebar nav marks planning sections with second-phase badges", () => {
  const markup = renderAdminNavMarkup("settings");
  const navButton = path => markup.match(new RegExp(`data-route="${path.replaceAll("/", "\\/")}"[\\s\\S]*?<\\/button>`))?.[0] || "";

  assert.match(navButton("/admin/settings"), /系统设置[\s\S]*class="admin-nav-stage"[\s\S]*二期/);
  assert.match(navButton("/admin/admins"), /管理员与权限[\s\S]*class="admin-nav-stage"[\s\S]*二期/);
  assert.doesNotMatch(navButton("/admin"), /class="admin-nav-stage"/);
  assert.doesNotMatch(navButton("/admin/users"), /class="admin-nav-stage"/);
});

test("sidebar nav only renders routes visible to the admin permissions", () => {
  const support = {
    role: "support",
    permissions: ["dashboard.view", "users.view", "reports.view", "feedback.view", "feedback.update"]
  };
  const markup = renderAdminNavMarkup("reports", support);

  assert.match(markup, /data-route="\/admin\/reports"/);
  assert.match(markup, /data-route="\/admin\/feedback"/);
  assert.doesNotMatch(markup, /data-route="\/admin\/messages"/);
  assert.doesNotMatch(markup, /data-route="\/admin\/audit-logs"/);
  assert.doesNotMatch(markup, /data-route="\/admin\/admins"/);
});

test("delegated click guard only ignores routed submit buttons", () => {
  assert.equal(shouldIgnoreAdminClick({ dataset: { route: "/admin/users" }, type: "submit" }), true);
  assert.equal(shouldIgnoreAdminClick({ dataset: { route: "/admin/users" }, type: "button" }), false);
  assert.equal(shouldIgnoreAdminClick({ dataset: {}, type: "submit" }), false);
});

test("normalizeLoaderFilters preserves section-specific admin filter params", () => {
  assert.deepEqual(
    normalizeLoaderFilters("messages", {
      keyword: "photo",
      type: "image",
      from: "2026-07-08",
      to: "2026-07-08"
    }),
    { q: "photo", type: "image", from: "2026-07-08", to: "2026-07-08" }
  );

  assert.deepEqual(
    normalizeLoaderFilters("audit-logs", {
      keyword: "cleanup",
      admin: "admin",
      action: "message_deleted",
      target: "message",
      from: "2026-07-01",
      to: "2026-07-08"
    }),
    {
      keyword: "cleanup",
      admin: "admin",
      action: "message_deleted",
      target: "message",
      from: "2026-07-01",
      to: "2026-07-08"
    }
  );
});

test("admin filter fields expose section-specific controls", () => {
  assert.match(renderAdminFilterFields("groups", { joinMode: "approval" }), /name="joinMode"/);
  assert.match(renderAdminFilterFields("messages", { type: "image" }), /name="type"/);
  assert.match(renderAdminFilterFields("messages", { from: "2026-07-08" }), /name="from"/);
  assert.match(renderAdminFilterFields("reports", { target: "user" }), /name="target"/);
  assert.match(renderAdminFilterFields("feedback", { user: "u2" }), /name="user"/);
  assert.match(renderAdminFilterFields("audit-logs", { admin: "admin" }), /name="admin"/);
  assert.match(renderAdminFilterFields("audit-logs", { action: "user_banned" }), /name="action"/);
});

test("admin planning placeholders render second-phase copy", () => {
  assert.match(renderAdminNavMarkup("settings"), /系统设置/);
  assert.match(renderAdminNavMarkup("admins"), /管理员与权限/);

  const settings = renderAdminPlaceholder("settings");
  assert.match(settings, /第二期开放/);
  assert.match(settings, /当前不可操作/);
  assert.match(settings, /第一期先保持后台可观测与可治理/);
  assert.match(settings, /系统配置、注册开关、上传限制/);

  const admins = renderAdminPlaceholder("admins");
  assert.match(admins, /第二期开放/);
  assert.match(admins, /当前不可操作/);
  assert.match(admins, /第一期继续使用单管理员模型/);
  assert.match(admins, /超级管理员、客服、内容审核、运营/);
});
