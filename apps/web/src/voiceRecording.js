export function voicePadEventAction({ type, detail = 1, isRecording = false, isPending = false }) {
  if (type === "pointerdown") return "start";
  if (type === "click") return detail === 0 ? "instruction" : "suppress-click";
  if (type === "pointercancel") return isRecording ? "cancel" : isPending ? "cancel-pending" : "none";
  if (type === "pointerup") {
    if (isRecording) return "stop";
    return isPending ? "cancel-pending" : "none";
  }
  return "none";
}

export function recordedVoiceExtension(mimeType = "") {
  return String(mimeType).toLowerCase().startsWith("audio/mp4") ? "m4a" : "webm";
}

export function shouldSendVoiceMessage({ isRecordable, hasAudio, hasAttachment, isCurrentConversation }) {
  return Boolean(isRecordable && hasAudio && hasAttachment && isCurrentConversation);
}

export function shouldCancelVoiceRecording({ startY, currentY, threshold = 48 }) {
  return Number.isFinite(startY) && Number.isFinite(currentY) && startY - currentY >= threshold;
}

export function voicePadReleaseAction({ isCancelArmed = false, isRecording = false, isPending = false }) {
  if (isCancelArmed && isRecording) return "cancel";
  if (isRecording) return "stop";
  return isPending ? "cancel-pending" : "none";
}
