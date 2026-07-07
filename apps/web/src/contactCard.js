export function buildContactCardPayload(contacts, contactId) {
  const contact = (contacts || []).find(item => item.id === contactId);
  if (!contact) {
    return { ok: false, message: "未找到该联系人" };
  }
  return {
    ok: true,
    payload: { type: "contact", body: contact.nickname }
  };
}
