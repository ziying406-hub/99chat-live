export function isConversationPreviewEnabled(settings = {}) {
  return settings.messagePreview !== false;
}

export function shouldCollapseComposerToolsAfterSend(settings = {}) {
  return settings.collapseToolsAfterSend !== false;
}
