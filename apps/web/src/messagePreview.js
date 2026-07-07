const messageLabels = {
  text: "文字",
  image: "图片",
  video: "视频",
  file: "文件",
  voice: "语音",
  contact: "名片",
  collection: "收藏",
  system: "系统"
};

export function messageTypeLabel(type) {
  return messageLabels[type || "text"] || "消息";
}

export function messagePreviewText(message) {
  if (!message) return "";
  if (["text", "system"].includes(message.type || "text")) return message.body || "";
  return `[${messageTypeLabel(message.type)}]`;
}

export function quotePreviewText(message) {
  if (!message) return "";
  const type = message.type || "text";
  if (type === "text") return message.body || "";
  if (type === "voice") return `[语音] 00:${String(message.body || "08").padStart(2, "0")}`;
  const detail = message.attachment?.name || message.body || message.senderName || "";
  if (type === "contact") return `名片：${detail}`;
  return `[${messageTypeLabel(type)}] ${detail}`.trim();
}

export function searchPreviewText(message) {
  return quotePreviewText(message) || messagePreviewText(message);
}
