import assert from "node:assert/strict";
import test from "node:test";
import { accountActionCopy, aboutDescription, authCodeHint, generalSettingHint, profileSidebarEntries } from "./accountMode.js";

test("profile sidebar hides demo switch user entry in online mode", () => {
  assert.equal(profileSidebarEntries(false).some(entry => entry.key === "switch-user"), false);
  assert.equal(profileSidebarEntries(true).some(entry => entry.key === "switch-user"), true);
});

test("about description matches runtime mode", () => {
  assert.equal(aboutDescription(false), "当前为在线接口模式，已接入聊天、群组、好友申请与个人中心主要功能。");
  assert.equal(aboutDescription(true), "当前为本地演示模式，可体验聊天、群组和个人中心主要交互。");
});

test("account action copy avoids destructive wording in online mode", () => {
  assert.deepEqual(accountActionCopy(false), {
    title: "退出登录",
    description: "退出后会回到登录页，当前账号数据会继续保留。",
    button: "退出登录",
    confirm: "确定退出当前帐号吗？"
  });
  assert.deepEqual(accountActionCopy(true), {
    title: "注销帐号",
    description: "注销会清理当前账号的本地演示资料，这个操作不可撤销。",
    button: "注销帐号",
    confirm: "确定注销当前帐号吗？"
  });
});

test("general setting hint matches runtime mode", () => {
  assert.equal(generalSettingHint(false), "选择后会同步到当前账号。");
  assert.equal(generalSettingHint(true), "选择后会立即应用到当前演示界面。");
});

test("auth code hint is only explicit demo copy in mock mode", () => {
  assert.equal(authCodeHint(false), "获取验证码后输入");
  assert.equal(authCodeHint(true), "本地演示验证码：123456");
});
