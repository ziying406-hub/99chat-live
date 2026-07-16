export function editorKeyAction(event, enterToSend) {
  if (event?.key !== "Enter" || event?.isComposing) return "none";
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    return "send";
  }
  if (enterToSend && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return "send";
  }
  return "newline";
}
