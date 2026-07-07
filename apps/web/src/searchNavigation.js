export function prepareSearchResultNavigation(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return null;
  return {
    sidePage: null,
    highlightedMessageId: id,
    query: "",
    searchResults: []
  };
}
