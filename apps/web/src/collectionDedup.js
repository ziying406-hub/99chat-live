export function findCollectionByMessageId(collections, messageId) {
  const normalized = String(messageId || "").trim();
  if (!normalized) return null;
  return (collections || []).find(item => item?.messageId === normalized) || null;
}
