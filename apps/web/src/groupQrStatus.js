export function isGroupQrExpired(group, now = new Date()) {
  const expiresAt = parseGroupQrExpiry(group);
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

export function groupQrExpiryLabel(group, now = new Date()) {
  const expiresAt = parseGroupQrExpiry(group);
  if (!expiresAt) return "永久有效";
  if (expiresAt.getTime() <= now.getTime()) return "已过期，请刷新二维码";
  return `有效至 ${formatGroupQrExpiry(expiresAt)}`;
}

function parseGroupQrExpiry(group) {
  if (!group?.qrCodeExpiresAt) return null;
  const expiresAt = new Date(group.qrCodeExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return null;
  return expiresAt;
}

function formatGroupQrExpiry(date) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
