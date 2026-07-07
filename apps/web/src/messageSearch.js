export function messageMatchesQuery(message, query, options = {}) {
  const search = String(query || "").trim().toLowerCase();
  if (!search) return false;
  const haystacks = [
    message?.body,
    message?.senderName,
    message?.attachment?.name,
    message?.attachment?.mimeType
  ];
  if (haystacks.some(value => String(value || "").toLowerCase().includes(search))) {
    return true;
  }
  const contacts = options.contacts || [];
  const mentions = Array.isArray(message?.mentions) ? message.mentions : [];
  return mentions.some(userId => {
    const contact = contacts.find(item => item.id === userId);
    return String(contact?.nickname || "").toLowerCase().includes(search);
  });
}
