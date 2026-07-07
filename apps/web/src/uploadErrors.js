const uploadErrorLabels = [
  ["file exceeds 64mb", "文件不能超过 64MB"],
  ["cannot upload empty file", "不能发送空文件"],
  ["missing file id or name", "文件地址不完整"],
  ["invalid file path", "文件地址无效"],
  ["upload directory failed", "上传目录创建失败"],
  ["file create failed", "文件保存失败"],
  ["file already exists", "文件已存在，请重新选择"],
  ["method not allowed", "请求方式不支持"],
  ["invalid json", "请求数据格式错误"],
  ["not found", "文件不存在或已失效"],
  ["file upload failed", "文件上传失败"]
];

export function uploadErrorMessage(error) {
  const raw = String(error?.message || "");
  const parsed = parseErrorBody(raw);
  const message = parsed || raw;
  const lower = message.toLowerCase();
  const label = uploadErrorLabels.find(([key]) => lower.includes(key))?.[1];
  return `上传失败：${label || message || "请确认 API 已启动"}`;
}

export function validateSignedUpload(signed, fallbackMimeType = "application/octet-stream") {
  if (!signed?.id || !signed?.uploadUrl || !signed?.publicUrl) {
    return { ok: false, message: "文件上传准备失败" };
  }
  if (!isPlainSignedPath(signed.uploadUrl, "/api/files/upload/") || !isPlainSignedPath(signed.publicUrl, "/uploads/")) {
    return { ok: false, message: "文件上传准备失败" };
  }
  const uploadParts = signedPathParts(signed.uploadUrl, "/api/files/upload/");
  const publicParts = signedPathParts(signed.publicUrl, "/uploads/");
  if (!isExpectedSignedPath(uploadParts, signed.id) || !isExpectedSignedPath(publicParts, signed.id) || uploadParts[1] !== publicParts[1]) {
    return { ok: false, message: "文件上传准备失败" };
  }
  return { ok: true, mimeType: String(signed.mimeType || fallbackMimeType || "application/octet-stream") };
}

function isPlainSignedPath(value, prefix) {
  const path = String(value || "");
  return path.startsWith(prefix) && !path.includes("?") && !path.includes("#");
}

function isExpectedSignedPath(parts, id) {
  return parts.length === 2 && parts[0] === id && isSignedFileID(parts[0]) && isSafeSignedPathPart(parts[0]) && isSafeSignedPathPart(parts[1]);
}

function isSignedFileID(value) {
  return String(value || "").startsWith("file-") && String(value || "").length > "file-".length;
}

function isSafeSignedPathPart(value) {
  const text = String(value || "");
  if (!text || text.startsWith(".") || text.endsWith(".")) return false;
  return Array.from(text).every((char) => char === "-" || char === "_" || char === "." || /[0-9A-Za-z]/.test(char) || char.charCodeAt(0) > 127);
}

function signedPathParts(value, prefix) {
  return String(value || "").slice(prefix.length).split("/");
}

function parseErrorBody(value) {
  try {
    const data = JSON.parse(value);
    return data?.error || data?.message || "";
  } catch (_) {
    return "";
  }
}
