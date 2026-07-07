export const LOCAL_CACHE_KEYS = ["chatlite-network-line", "chatlite-drafts", "chatlite-reply-drafts", "chatlite-mock-group-nicknames", "chatlite-mock-group-titles", "chatlite-mock-user-preferences", "chatlite-mock-registered-account"];
export const SESSION_CACHE_KEYS = ["chatlite-splash-seen"];

export function clearLocalCacheState(state) {
  state.query = "";
  state.toast = "";
  state.networkLine = "线路 A";
  state.draftTextByConversation = {};
  state.replyDraftByConversation = {};
  if (state.user?.feedbackStore) {
    state.user.feedbackStore.draft = "";
  }
  return state;
}
