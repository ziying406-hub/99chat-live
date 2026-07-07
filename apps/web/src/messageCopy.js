export function formatMessageForCopy(message) {
  const base = summarizeMessageForCopy(message);
  if (!base) return "";
  if (!message.quote) return base;
  return `引用 ${message.quote.senderName || "消息"}：${message.quote.preview || ""}\n${base}`;
}

function summarizeMessageForCopy(message) {
  if (!message) return "";
  if (message.type === "text") return message.body || "";
  if (message.type === "contact") return `名片：${message.body || message.senderName || ""}`;
  if (message.type === "image") return `[图片] ${message.attachment?.name || message.body || ""}`.trim();
  if (message.type === "video") return `[视频] ${message.attachment?.name || message.body || ""}`.trim();
  if (message.type === "file") return `[文件] ${message.attachment?.name || message.body || ""}`.trim();
  if (message.type === "voice") return `[语音] 00:${String(message.body || "08").padStart(2, "0")}`;
  if (message.type === "collection") return `[收藏] ${message.body || message.attachment?.name || ""}`.trim();
  return message.body || "[消息]";
}
