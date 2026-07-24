export function formatVoiceDuration(seconds = 0) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isRecordableVoiceDuration(milliseconds = 0) {
  return Number(milliseconds) >= 1000;
}

export function shouldAutoPlayIncomingVoice({ message, isCurrentConversation, isVisible, enabled, isIncoming }) {
  return Boolean(isIncoming && enabled && isCurrentConversation && isVisible && message?.type === "voice" && message?.attachment?.url);
}
