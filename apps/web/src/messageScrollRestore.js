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

export function canApplyScrollFocus(expectedGeneration, activeGeneration) {
  return expectedGeneration === activeGeneration;
}
