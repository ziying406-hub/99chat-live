const MANAGER_GROUP_SIDE_PAGES = new Set([
  "admin",
  "applications",
  "join-mode",
  "group-admins",
  "admin-add",
  "transfer-owner",
  "invite-members",
  "rename",
  "group-bots",
  "rate-limit",
  "group-blacklist",
  "audit-logs"
]);

const MEMBER_BLOCKED_GROUP_SIDE_PAGES = new Set([
  "members",
  "qrcode",
  "nickname",
  "collections"
]);

const REGULAR_GROUP_MEMBER_SETTING_KEYS = [
  "media",
  "burn-after-read",
  "mute",
  "pin",
  "search",
  "clear-chat",
  "report"
];

export function canManageGroupSettings(member) {
  return member?.role === "owner" || member?.role === "admin";
}

export function canOpenGroupSidePage(sidePage, member) {
  if (canManageGroupSettings(member)) return true;
  return !MANAGER_GROUP_SIDE_PAGES.has(sidePage) && !MEMBER_BLOCKED_GROUP_SIDE_PAGES.has(sidePage);
}

export function regularGroupMemberSettingKeys() {
  return [...REGULAR_GROUP_MEMBER_SETTING_KEYS];
}
