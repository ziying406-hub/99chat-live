export function clearStaleScrollRestore(pendingRestore, conversationId, options = {}) {
  const shouldDiscard = options.skip || options.scrollToBottom;
  if (shouldDiscard && pendingRestore?.conversationId === conversationId) {
    return null;
  }
  return pendingRestore || null;
}

export function nextScrollFocusGeneration(generation = 0) {
  return generation + 1;
}

export function canApplyScrollFocus(expectedGeneration, activeGeneration, expectedConversationId, selectedConversationId) {
  if (expectedGeneration !== activeGeneration) return false;
  if (expectedConversationId === undefined) return true;
  return expectedConversationId === selectedConversationId;
}

export function canRestoreConversationScroll(expectedConversationId, selectedConversationId) {
  return expectedConversationId === selectedConversationId;
}
