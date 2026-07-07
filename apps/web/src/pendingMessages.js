import { sendErrorMessage } from "./messageSendErrors.js";

export function buildPendingMessage({ conversationId, user, payload, now = new Date() }) {
  return {
    id: `pending-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    senderId: user?.id || "",
    senderName: user?.nickname || "",
    createdAt: now.toISOString(),
    ...payload,
    sendStatus: "sending",
    retryPayload: structuredCloneSafe(payload)
  };
}

export function markMessageFailed(message, error) {
  return {
    ...message,
    sendStatus: "failed",
    sendError: sendErrorMessage(error),
    retryPayload: structuredCloneSafe(message.retryPayload || {
      type: message.type,
      body: message.body,
      attachment: message.attachment,
      quote: message.quote,
      mentions: message.mentions
    })
  };
}

export function replacePendingMessage(messages, pendingId, savedMessage) {
  const savedId = savedMessage?.id;
  let inserted = false;
  return messages.reduce((items, message) => {
    if (message.id === pendingId) {
      if (!inserted) {
        items.push(savedMessage);
        inserted = true;
      }
      return items;
    }
    if (savedId && message.id === savedId) {
      if (!inserted) {
        items.push(message);
        inserted = true;
      }
      return items;
    }
    items.push(message);
    return items;
  }, []);
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
