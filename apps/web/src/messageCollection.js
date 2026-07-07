const collectionKinds = {
  image: "image",
  video: "video",
  file: "file",
  voice: "voice"
};

export function buildCollectionFromMessage(message) {
  const kind = collectionKinds[message?.type] || "text";
  const body = String(message?.body || "").trim();
  const attachmentName = String(message?.attachment?.name || "").trim();
  return {
    kind,
    title: `${message?.senderName || "消息"} 的消息`,
    preview: message?.type === "text" ? body : attachmentName || body,
    messageId: message?.id
  };
}
