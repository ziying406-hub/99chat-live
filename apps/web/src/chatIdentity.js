const CHAT_ID_LETTERS = "abcdefghijklmnopqrstuvwxyz";
const CHAT_ID_DIGITS = "0123456789";
const CHAT_ID_ALPHABET = `${CHAT_ID_LETTERS}${CHAT_ID_DIGITS}`;

function pickFrom(pool, random) {
  return pool[Math.floor(random() * pool.length) % pool.length];
}

export function generateRandomChatId(length = 6, random = Math.random) {
  const size = Math.max(4, Math.floor(length));
  const chars = [
    pickFrom(CHAT_ID_LETTERS, random),
    pickFrom(CHAT_ID_DIGITS, random)
  ];
  for (let i = chars.length; i < size; i += 1) {
    chars.push(pickFrom(CHAT_ID_ALPHABET, random));
  }
  return chars.join("");
}

export function isRandomChatId(value) {
  return /^[a-z][0-9][a-z0-9]{4}$/.test(String(value || ""));
}

export function shouldReplaceChatId(user = {}) {
  const chatId = String(user.chatId || "").trim().toLowerCase();
  const phoneDigits = String(user.phone || "").replace(/\D/g, "");
  if (!isRandomChatId(chatId)) return true;
  return Boolean(phoneDigits) && (chatId === phoneDigits || chatId === `u${phoneDigits}`);
}

export function userQrText(user = {}) {
  return `66chat://users/${user.id || ""}?chatId=${encodeURIComponent(user.chatId || "")}`;
}
