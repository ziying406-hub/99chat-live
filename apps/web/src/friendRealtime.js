function nicknameOf(contact, fallback = "对方") {
  return String(contact?.nickname || "").trim() || fallback;
}

export function friendRequestSyncUpdate(previousRequests, nextRequests) {
  const previous = new Map((previousRequests || []).map(request => [request.id, request]));
  for (const request of nextRequests || []) {
    const earlier = previous.get(request.id);
    const nickname = nicknameOf(request.user);
    if (!earlier && request.direction === "incoming" && request.status === "pending") {
      return `收到来自 ${nickname} 的好友申请`;
    }
    if (!earlier || earlier.status === request.status) continue;
    if (request.direction === "outgoing") {
      if (request.status === "accepted") return `${nickname} 已通过你的好友申请`;
      if (request.status === "rejected") return `${nickname} 拒绝了你的好友申请`;
    }
    if (request.direction === "incoming") {
      if (request.status === "accepted") return `你已通过 ${nickname} 的好友申请`;
      if (request.status === "rejected") return `你已拒绝 ${nickname} 的好友申请`;
    }
  }
  return "";
}

export function friendRealtimeUpdate(event, currentUserId) {
  const payload = event?.payload || {};
  const fromUserId = String(payload.fromUserId || "");
  const toUserId = String(payload.toUserId || "");
  const isSender = currentUserId === fromUserId;
  const isRecipient = currentUserId === toUserId;

  if (event?.type === "friend.requested") {
    return isRecipient
      ? { refresh: true, toast: `收到来自 ${nicknameOf(payload.user)} 的好友申请` }
      : { refresh: false, toast: "" };
  }

  if (!isSender && !isRecipient) return { refresh: false, toast: "" };
  if (event?.type === "friend.accepted") {
    return {
      refresh: true,
      toast: isSender
        ? `${nicknameOf(payload.reviewer)} 已通过你的好友申请`
        : `你已通过 ${nicknameOf(payload.user)} 的好友申请`
    };
  }
  if (event?.type === "friend.rejected") {
    return {
      refresh: true,
      toast: isSender
        ? `${nicknameOf(payload.reviewer)} 拒绝了你的好友申请`
        : `你已拒绝 ${nicknameOf(payload.user)} 的好友申请`
    };
  }
  return { refresh: false, toast: "" };
}
