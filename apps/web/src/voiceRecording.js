export function voicePadEventAction({ type, detail = 1, isRecording = false, isPending = false }) {
  if (type === "pointerdown") return "start";
  if (type === "click") return detail === 0 ? "instruction" : "suppress-click";
  if (type === "pointerleave" || type === "pointercancel") return isRecording ? "cancel" : "none";
  if (type === "pointerup") {
    if (isRecording) return "stop";
    return isPending ? "cancel-pending" : "none";
  }
  return "none";
}

export function shouldSendVoiceMessage({ isRecordable, hasAudio, hasAttachment, isCurrentConversation }) {
  return Boolean(isRecordable && hasAudio && hasAttachment && isCurrentConversation);
}
