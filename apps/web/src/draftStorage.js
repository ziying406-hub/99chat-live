export const DRAFT_CACHE_KEY = "chatlite-drafts";
export const REPLY_DRAFT_CACHE_KEY = "chatlite-reply-drafts";

export function parseDraftMap(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function updateDraftMap(drafts, conversationId, value) {
  const next = { ...(drafts || {}) };
  if (!conversationId) return next;
  if (typeof value === "string") {
    if (value) next[conversationId] = value;
    else delete next[conversationId];
    return next;
  }
  if (value && typeof value === "object") next[conversationId] = value;
  else delete next[conversationId];
  return next;
}
