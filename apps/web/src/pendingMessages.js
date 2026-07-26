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
  const savedOperationId = normalizeOperationId(savedMessage);
  const savedType = String(savedMessage?.type || "");
  const senderId = String(savedMessage?.senderId || "");
  const attachment = savedMessage?.attachment || {};
  const savedAttachmentUrl = String(attachment.url || "").trim();
  const savedAttachmentId = String(attachment.id || "").trim();
  const savedBody = String(savedMessage?.body || "").trim();
  const savedCreatedAt = String(savedMessage?.createdAt || "").trim();
  let inserted = false;

  const next = messages.reduce((items, message) => {
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
    if (!inserted && isLikelyPendingMatch(message, savedMessage, savedOperationId, {
      savedType,
      senderId,
      savedAttachmentUrl,
      savedAttachmentId,
      savedBody,
      savedCreatedAt
    })) {
      items.push(savedMessage);
      inserted = true;
      return items;
    }
    items.push(message);
    return items;
  }, []);

  if (!inserted) {
    const savedMessageId = String(savedId || "");
    if (!savedMessageId || next.every(message => String(message?.id || "") !== savedMessageId)) {
      next.push(savedMessage);
    }
  }

  return next;
}

export function appendMessageOnce(messages, message) {
  const items = Array.isArray(messages) ? messages : [];
  const messageId = String(message?.id || "").trim();
  if (!messageId) return [...items, message];
  if (items.some(item => String(item?.id || "") === messageId)) return items;
  const incomingOpId = normalizeOperationId(message);
  if (incomingOpId && items.some(item => normalizeOperationId(item) === incomingOpId)) return items;
  return [...items, message];
}

export function isOwnRealtimeEcho(messages, message, currentUserId) {
  const senderId = String(message?.senderId || "").trim();
  const userId = String(currentUserId || "").trim();
  if (!userId) return false;
  if (senderId) return senderId === userId;

  const messageOperationId = normalizeOperationId(message);
  const messageAttachment = message?.attachment || {};
  const messageAttachmentId = String(messageAttachment.id || "").trim();
  const messageAttachmentUrl = String(messageAttachment.url || "").trim();

  return (Array.isArray(messages) ? messages : []).some(candidate => {
    if (candidate?.sendStatus !== "sending" && candidate?.sendStatus !== "failed") return false;
    if (!sameConversation(candidate, message)) return false;
    if (String(candidate?.senderId || "").trim() !== userId) return false;

    const candidateOperationId = normalizeOperationId(candidate);
    if (messageOperationId && candidateOperationId === messageOperationId) return true;
    if (message?.type !== "voice" || candidate?.type !== "voice") return false;

    const candidateAttachment = candidate?.attachment || {};
    const candidateAttachmentId = String(candidateAttachment.id || "").trim();
    const candidateAttachmentUrl = String(candidateAttachment.url || "").trim();
    return Boolean(
      (messageAttachmentId && candidateAttachmentId && messageAttachmentId === candidateAttachmentId) ||
      (messageAttachmentUrl && candidateAttachmentUrl && messageAttachmentUrl === candidateAttachmentUrl)
    );
  });
}

function normalizeOperationId(message) {
  return String(message?.operationId || message?.retryPayload?.operationId || "").trim();
}

function sameConversation(a, b) {
  return String(a?.conversationId || "") === String(b?.conversationId || "");
}

function isLikelyPendingMatch(message, savedMessage, savedOperationId, opts = {}) {
  if (opts.senderId && String(message?.senderId || "") !== opts.senderId) return false;
  if (message.sendStatus !== "sending" && message.sendStatus !== "failed") return false;
  if (!sameConversation(message, savedMessage)) return false;
  if (message.type !== savedMessage?.type) return false;

  const messageOperationId = normalizeOperationId(message);
  if (savedOperationId) {
    if (messageOperationId && messageOperationId !== savedOperationId) return false;
  } else {
    const withinTimeWindow = withinDeliveryWindow(message, savedMessage, opts);
    if (!withinTimeWindow) return false;
  }

  if (opts.savedType === "voice") {
    const messageAttachment = message?.attachment || {};
    const savedAttachment = savedMessage?.attachment || {};
    const messageAttachmentId = String(messageAttachment.id || "").trim();
    const messageAttachmentUrl = String(messageAttachment.url || "").trim();
    const savedAttachmentUrl = opts.savedAttachmentUrl || "";
    const savedAttachmentId = opts.savedAttachmentId || "";
    const savedBody = opts.savedBody || "";

    if (messageAttachmentId && savedAttachmentId && messageAttachmentId === savedAttachmentId) return true;
    if (messageAttachmentUrl && savedAttachmentUrl && messageAttachmentUrl === savedAttachmentUrl) return true;

    const pendingBody = String(message.body || "").trim();
    if (!messageAttachmentId && !messageAttachmentUrl && !savedAttachmentId && !savedAttachmentUrl) {
      if (!pendingBody || !savedBody || pendingBody !== savedBody) return false;
      return withinDeliveryWindow(message, savedMessage, opts, 15000);
    }

    return false;
  }
  return true;
}

function withinDeliveryWindow(pendingCandidate, savedMessage, opts = {}, maxWindowMs = 120000) {
  if (!pendingCandidate || !savedMessage) return false;
  const pendingCreatedAt = Date.parse(String(pendingCandidate.createdAt || "").trim());
  const savedCreatedAt = Date.parse(String(opts.savedCreatedAt || "").trim());
  if (!Number.isFinite(pendingCreatedAt) || !Number.isFinite(savedCreatedAt)) return false;
  return Math.abs(savedCreatedAt - pendingCreatedAt) <= maxWindowMs;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
