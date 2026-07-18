export function conversationIdFromLocation(location = {}) {
  const pathname = String(location.pathname || "/").replace(/\/+$/, "") || "/";
  const groupMatch = pathname.match(/^\/messages\/groups\/([^/]+)$/);
  if (groupMatch) return `group-${decodeURIComponent(groupMatch[1])}`;

  const sessionMatch = pathname.match(/^\/messages\/sessions\/([^/]+)$/);
  if (sessionMatch) return `session-${decodeURIComponent(sessionMatch[1])}`;

  const hash = String(location.hash || "").replace(/^#/, "");
  return hash.startsWith("group-") || hash.startsWith("session-")
    ? decodeURIComponent(hash)
    : null;
}

export function canonicalConversationIdForRoute(routeConversationId, groups = []) {
  const value = String(routeConversationId || "");
  if (!value.startsWith("group-")) return value;

  const routeToken = value.slice("group-".length);
  const group = groups.find(item => item && (
    `group-${item.id}` === value ||
    String(item.id) === routeToken ||
    String(item.chatId) === routeToken
  ));

  return group ? `group-${group.id}` : value;
}

export function conversationPathFor(conversationId, groups = []) {
  const value = String(conversationId || "");
  if (value.startsWith("group-")) {
    const group = groups.find(item => item && `group-${item.id}` === value);
    const routeToken = group?.chatId || value.slice("group-".length);
    return `/messages/groups/${encodeURIComponent(routeToken)}`;
  }
  if (value.startsWith("session-")) {
    return `/messages/sessions/${encodeURIComponent(value.slice("session-".length))}`;
  }
  return "/";
}
