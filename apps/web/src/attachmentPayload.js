export const MAX_ATTACHMENT_SIZE_BYTES = 64 * 1024 * 1024;

const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"];
const videoExtensions = [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".mpeg", ".mpg"];
const extensionMimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg"
};

export function buildAttachmentDescriptor(file) {
  return {
    name: file?.name || "",
    mimeType: file?.type || "",
    size: file?.size || 0
  };
}

export function uploadMimeType(file) {
  const explicitType = String(file?.type || "").trim();
  if (explicitType) return explicitType;
  const name = String(file?.name || "").toLowerCase();
  const extension = Object.keys(extensionMimeTypes).find(item => name.endsWith(item));
  return extension ? extensionMimeTypes[extension] : "application/octet-stream";
}

export function buildAttachmentMessagePayload(kind, attachment) {
  const attachmentName = String(attachment?.name || "").trim();
  const mimeType = String(attachment?.mimeType || "").toLowerCase();
  if (attachment?.size === 0) {
    return { ok: false, message: "不能发送空文件" };
  }
  if ((attachment?.size || 0) > MAX_ATTACHMENT_SIZE_BYTES) {
    return { ok: false, message: "文件不能超过 64MB" };
  }
  if (kind === "image") {
    if (!isKindFile("image", mimeType, attachmentName)) {
      return { ok: false, message: "请选择图片文件" };
    }
    return { ok: true, payload: { type: "image", body: "[图片]" } };
  }
  if (kind === "video") {
    if (!isKindFile("video", mimeType, attachmentName)) {
      return { ok: false, message: "请选择视频文件" };
    }
    return { ok: true, payload: { type: "video", body: "[视频]" } };
  }
  return {
    ok: true,
    payload: { type: "file", body: attachmentName || "文件" }
  };
}

function isKindFile(kind, mimeType, name) {
  if (mimeType) return mimeType.startsWith(`${kind}/`);
  const lowerName = name.toLowerCase();
  const extensions = kind === "image" ? imageExtensions : videoExtensions;
  return extensions.some(extension => lowerName.endsWith(extension));
}
