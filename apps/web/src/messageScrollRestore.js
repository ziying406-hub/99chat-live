export function clearStaleScrollRestore(pendingRestore, conversationId, options = {}) {
  const shouldDiscard = options.skip || options.scrollToBottom;
  if (shouldDiscard && pendingRestore?.conversationId === conversationId) {
    return null;
  }
  return pendingRestore || null;
}
