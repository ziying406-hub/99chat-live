const defaultGreeting = "你好，我想加你为好友";

export function createAddFriendDraft(overrides = {}) {
  return {
    chatId: String(overrides.chatId || ""),
    greeting: String(overrides.greeting || defaultGreeting)
  };
}

export function updateAddFriendDraft(draft, patch = {}) {
  const base = createAddFriendDraft(draft);
  return {
    chatId: Object.hasOwn(patch, "chatId") ? String(patch.chatId || "") : base.chatId,
    greeting: Object.hasOwn(patch, "greeting") ? String(patch.greeting || "") : base.greeting
  };
}

