export function isOpenableMediaUrl(value) {
  const url = String(value || "").trim();
  if (!url || url === "#") return false;
  return true;
}

export function mediaDisplayUrl(value, kind) {
  const url = String(value || "").trim();
  if (url) return url;
  return kind === "image" ? "/public/demo-photo.svg" : "";
}

export function mediaDisplayName(message, kind = "media") {
  const name = String(message?.attachment?.name || "").trim();
  const body = String(message?.body || "").trim();
  if (name) return name;
  if (body && !["[图片]", "[视频]"].includes(body)) return body;
  return {
    image: "图片",
    video: "视频",
    file: "文件"
  }[kind] || "媒体";
}
