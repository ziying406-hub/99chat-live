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

export function canManageGroupSettings(member) {
  return member?.role === "owner" || member?.role === "admin";
}

export function canOpenGroupSidePage(sidePage, member) {
  return !MANAGER_GROUP_SIDE_PAGES.has(sidePage) || canManageGroupSettings(member);
}
