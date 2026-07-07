const baseProfileEntries = [
  { key: "collections", title: "我的收藏", preview: "", icon: "☆" },
  { key: "notifications", title: "通知设置", preview: "", icon: "◔" },
  { key: "messaging", title: "聊天设置", preview: "", icon: "✉" },
  { key: "privacy", title: "隐私", preview: "", icon: "⌂" },
  { key: "security", title: "安全", preview: "", icon: "◍" },
  { key: "general", title: "通用", preview: "", icon: "⚙" }
];

export function profileSidebarEntries(useMock) {
  const entries = [...baseProfileEntries];
  if (useMock) {
    entries.push({ key: "switch-user", title: "切换使用者", preview: "", icon: "↺" });
  }
  return entries;
}

export function aboutDescription(useMock) {
  return useMock
    ? "当前为本地演示模式，可体验聊天、群组和个人中心主要交互。"
    : "当前为在线接口模式，已接入聊天、群组、好友申请与个人中心主要功能。";
}

export function accountActionCopy(useMock) {
  return useMock
    ? {
        title: "注销帐号",
        description: "注销会清理当前账号的本地演示资料，这个操作不可撤销。",
        button: "注销帐号",
        confirm: "确定注销当前帐号吗？"
      }
    : {
        title: "退出登录",
        description: "退出后会回到登录页，当前账号数据会继续保留。",
        button: "退出登录",
        confirm: "确定退出当前帐号吗？"
      };
}

export function generalSettingHint(useMock) {
  return useMock ? "选择后会立即应用到当前演示界面。" : "选择后会同步到当前账号。";
}

export function authCodeHint(useMock, code = "123456") {
  return useMock ? `本地演示验证码：${code}` : "获取验证码后输入";
}
