const sendErrorLabels = [
  ["group rate limit exceeded", "发言太频繁，请稍后再试"],
  ["group is all muted", "本群已开启全员禁言"],
  ["member is muted", "你已被禁言，暂时无法在本群发送消息"],
  ["target blocked messages", "对方已开启黑名单限制，消息无法送达"]
];

export function sendErrorMessage(error) {
  const raw = String(error?.message || "");
  const message = parseErrorBody(raw) || raw;
  const lower = message.toLowerCase();
  const label = sendErrorLabels.find(([key]) => lower.includes(key))?.[1];
  return label || "消息发送失败，请稍后再试";
}

function parseErrorBody(value) {
  try {
    const data = JSON.parse(value);
    return data?.error || data?.message || "";
  } catch (_) {
    return "";
  }
}
