export function editorKeyAction(event, enterToSend) {
  if (event?.key !== "Enter" || event?.isComposing) return "none";
  if (enterToSend && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return "send";
  }
  return "newline";
}
