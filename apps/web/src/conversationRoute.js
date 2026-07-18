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

export function conversationPathFor(conversationId) {
  const value = String(conversationId || "");
  if (value.startsWith("group-")) {
    return `/messages/groups/${encodeURIComponent(value.slice("group-".length))}`;
  }
  if (value.startsWith("session-")) {
    return `/messages/sessions/${encodeURIComponent(value.slice("session-".length))}`;
  }
  return "/";
}
