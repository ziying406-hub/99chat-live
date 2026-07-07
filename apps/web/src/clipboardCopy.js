export async function writeClipboardText(text, env = {}) {
  const runtimeNavigator = env.navigator || globalThis.navigator;
  const runtimeDocument = env.document || globalThis.document;
  try {
    if (runtimeNavigator?.clipboard?.writeText) {
      await runtimeNavigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // Fall through to the textarea fallback below.
  }

  if (!runtimeDocument?.execCommand) {
    return false;
  }

  let eventCopied = false;
  const onCopy = event => {
    if (!event.clipboardData?.setData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    eventCopied = true;
  };
  if (runtimeDocument.addEventListener && runtimeDocument.removeEventListener) {
    runtimeDocument.addEventListener("copy", onCopy);
    try {
      if (runtimeDocument.execCommand("copy") && eventCopied) return true;
    } finally {
      runtimeDocument.removeEventListener("copy", onCopy);
    }
  }

  if (!runtimeDocument.body || !runtimeDocument.createElement) {
    return false;
  }

  const textarea = runtimeDocument.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  runtimeDocument.body.appendChild(textarea);
  textarea.focus?.();
  textarea.select();
  let ok = false;
  try {
    ok = Boolean(runtimeDocument.execCommand("copy"));
  } finally {
    runtimeDocument.body.removeChild(textarea);
  }
  return ok;
}
