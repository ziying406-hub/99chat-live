export function persistentProfileAvatarUrl(upload = {}) {
  const url = String(upload.url || "").trim();
  if (!url || url.startsWith("blob:")) {
    throw new Error("uploaded avatar must have a persistent URL");
  }
  return url;
}
