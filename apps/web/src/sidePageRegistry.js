const KNOWN_SIDE_PAGES = new Set([
  "friend-requests", "tags", "groups",
  "profile", "profile-avatar", "profile-nickname", "profile-signature", "qrcode", "account",
  "collections", "notifications", "messaging", "messaging-batch", "messaging-batch-history", "messaging-batch-draft", "messaging-batch-targets",
  "stickers", "stickers-manage", "privacy", "blacklist", "blacklist-add", "security", "security-devices", "security-password-step2",
  "general", "general-language", "general-display", "general-feedback", "feedback-history", "general-about", "general-about-version", "general-debug", "switch-user",
  "members", "settings", "join-mode", "applications", "admin", "rename", "announcement", "qrcode", "nickname", "media", "search", "report",
  "group-blacklist", "invite-members", "audit-logs", "group-bots", "rate-limit", "group-admins", "admin-add", "transfer-owner"
]);

export function isKnownSidePage(sidePage) {
  return KNOWN_SIDE_PAGES.has(sidePage);
}
