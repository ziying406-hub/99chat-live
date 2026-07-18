import { toSvg as renderQrSvg } from "/public/vendor/qrcode-bundle.js";
import { accountActionCopy, aboutDescription, authCodeHint, generalSettingHint, profileSidebarEntries } from "./accountMode.js";
import { buildAboutInfo } from "./aboutInfo.js";
import { readAuthDefaults, saveAuthDefaults } from "./authDefaults.js";
import { buildAttachmentDescriptor, buildAttachmentMessagePayload, uploadMimeType } from "./attachmentPayload.js";
import { auditLogSentence, sortAuditLogs } from "./auditLogDisplay.js";
import {
  browserNotificationOptions,
  browserNotificationPayload,
  browserNotificationDelivery,
  browserNotificationPermissionView,
  shouldShowBrowserNotification
} from "./browserNotifications.js?v=20260717-notification-tags-v2";
import { DEMO_LOGIN_CODE, codeLoginFailureAction, sendCodeFailureMessage, validateDemoLoginCode } from "./authModes.js";
import { createAddFriendDraft, updateAddFriendDraft } from "./addFriendDraft.js";
import { generateRandomChatId, shouldReplaceChatId, userQrText } from "./chatIdentity.js";
import {
  collectionFilterLabel,
  collectionFilters,
  filterCollections,
  normalizeCollectionFilter
} from "./collectionFilters.js";
import { findCollectionByMessageId } from "./collectionDedup.js";
import { composerVoiceRecordAction } from "./composerActions.js";
import { buildContactCardPayload } from "./contactCard.js";
import { editorKeyAction } from "./editorKeyAction.js";
import { messageAvatarContactKey } from "./messageAvatarAction.js";
import { buildMarkUnreadPatch, effectiveUnreadCount, shouldCommitConversationSelection, shouldNotifyConversation, shouldShowMentionReminder, sortConversationList, unreadBadgeLabel } from "./conversationState.js?v=20260719-conversation-selection-v1";
import { canonicalConversationIdForRoute, conversationIdFromLocation, conversationPathFor } from "./conversationRoute.js?v=20260718-group-chat-id-routes-v1";
import { writeClipboardText } from "./clipboardCopy.js";
import {
  buildCreateGroupPayload,
  createDefaultCreateGroupDraft,
  toggleCreateGroupSelection,
  updateCreateGroupDraft
} from "./createGroupPayload.js";
import { areAllInviteCandidatesSelected, selectedInviteMemberIds, updateInviteSelection, updateInviteSelectionForCandidates } from "./inviteSelection.js";
import { DRAFT_CACHE_KEY, REPLY_DRAFT_CACHE_KEY, parseDraftMap, updateDraftMap } from "./draftStorage.js";
import { clearLocalCacheState, LOCAL_CACHE_KEYS, SESSION_CACHE_KEYS } from "./localCache.js";
import { isOpenableMediaUrl, mediaDisplayName, mediaDisplayUrl } from "./mediaLinks.js";
import { buildCollectionFromMessage } from "./messageCollection.js";
import { formatMessageForCopy } from "./messageCopy.js";
import { canDeleteMessage, deleteBlockedSummary, findUndeletableMessages } from "./messageDeletePermissions.js";
import { messagePreviewText, messageTypeLabel, quotePreviewText, searchPreviewText } from "./messagePreview.js";
import { messageMatchesQuery } from "./messageSearch.js";
import { collectMentionIdsFromText, findMentionTargetByName, mentionCandidatesFromGroup } from "./mentionTargets.js?v=20260708-mention-menu-click";
import { ALL_MEMBERS_MENTION_ID, groupAllMentionCandidate, groupAllMentionIds } from "./groupMentionAll.js";
import { appendMessageOnce, buildPendingMessage, markMessageFailed, replacePendingMessage } from "./pendingMessages.js";
import { nextNetworkLine } from "./networkLine.js";
import { registerErrorMessage } from "./registerErrors.js";
import { friendRequestErrorMessage, friendRequestReviewErrorMessage } from "./friendRequestErrors.js?v=20260708-friend-request-live";
import { friendRealtimeUpdate, friendRequestSyncUpdate } from "./friendRealtime.js?v=20260712-friend-realtime";
import { canReceiveRealtimeConversation } from "./realtimeConversationVisibility.js";
import { shouldReconnectRealtimeHeartbeat, shouldRefreshRealtimeSnapshotOnOpen } from "./realtimeConnection.js";
import { groupJoinReviewErrorMessage } from "./groupJoinReviewErrors.js";
import { findPendingJoinRequest, groupJoinCode, groupJoinErrorMessage, groupJoinLinkState, pendingGroupJoinRequestCount } from "./groupJoinLink.js";
import { groupMemberActionErrorMessage } from "./groupMemberActionErrors.js";
import { canManageMember, memberStatusText } from "./groupMemberPermissions.js";
import { adminGroupSettingKeys, canManageGroupSettings, canOpenGroupSidePage, regularGroupMemberSettingKeys } from "./groupSettingsPermissions.js";
import { isKnownSidePage } from "./sidePageRegistry.js";
import { buildGroupBotPatch, buildNewGroupBotPayload } from "./groupBotSettings.js";
import { canLeaveGroup } from "./groupMembership.js";
import { applyOwnerTransfer, canTransferOwner, ownerTransferConfirmText, ownerTransferErrorMessage, ownerTransferHint } from "./groupOwnerTransfer.js";
import { sendErrorMessage } from "./messageSendErrors.js";
import { applyMessageReadReceipt, canShowReadDetailAction, readStateControl, shouldAcknowledgeRealtimeMessage } from "./messageReadActions.js";
import { selectBatchConversationIds } from "./batchTargets.js";
import { passwordActionTarget, validateForgotPasswordReset, validatePasswordChange } from "./passwordChange.js";
import { chatReturnPath, profileCenterPath } from "./profileNavigation.js";
import { persistentProfileAvatarUrl } from "./profileAvatarUpload.js";
import { prepareSearchResultNavigation } from "./searchNavigation.js";
import { currentDeviceInfo, loginDeviceDisplay } from "./securityDevices.js";
import { groupQrExpiryLabel, isGroupQrExpired } from "./groupQrStatus.js";
import { groupAnnouncementText } from "./groupAnnouncement.js";
import { applyGroupBlacklistEvent, groupBlacklistEntrySummary } from "./groupBlacklistState.js";
import { groupRateLimitExceeded, groupRateLimitKey, groupRateLimitLabel } from "./groupRateLimit.js";
import { uploadErrorMessage, validateSignedUpload } from "./uploadErrors.js";

const API_BASE = resolveApiBase();
const WS_BASE = resolveWebSocketBase(API_BASE);
const APP_VERSION = "20260719-avatar-fallback-v1";
const APP_VERSION_KEY = "chatlite-app-version";
const MOCK_GROUP_NICKNAMES_KEY = "chatlite-mock-group-nicknames";
const MOCK_GROUP_TITLES_KEY = "chatlite-mock-group-titles";
const MOCK_USER_PREFERENCES_KEY = "chatlite-mock-user-preferences";
const MOCK_REGISTERED_ACCOUNT_KEY = "chatlite-mock-registered-account";

installStructuredCloneFallback();

function installStructuredCloneFallback() {
  if (typeof globalThis.structuredClone === "function") return;
  globalThis.structuredClone = value => {
    if (value == null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  };
}

function resolveApiBase() {
  const configured = window.CHAT_API_BASE || "";
  if (configured) return String(configured).replace(/\/$/, "");
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8080";
  }
  return window.location.origin;
}

function resolveWebSocketBase(apiBase) {
  const configured = window.CHAT_WS_BASE || "";
  if (configured) return String(configured).replace(/\/$/, "");
  const url = new URL(apiBase, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}

const state = {
  authed: Boolean(localStorage.getItem("chatlite-token")),
  authMode: "login",
  user: null,
  section: "messages",
  filter: "all",
  requestFilter: "all",
  contactGroupFilter: "owned",
  collectionFilter: "all",
  query: "",
  selectedConversationId: null,
  conversationSelectionToken: 0,
  sidePage: null,
  modal: null,
  createGroupSelection: [],
  createGroupDraft: createDefaultCreateGroupDraft(),
  inviteSelection: new Set(),
  addFriendDraft: createAddFriendDraft(),
  addFriendError: "",
  toast: "",
  toolMenu: null,
  emojiCategory: "frequent",
  editorSelection: null,
  voiceMode: false,
  useMock: false,
  data: null,
  ws: null,
  wsReconnectTimer: null,
  wsHeartbeatTimer: null,
  wsLastHeartbeatAt: 0,
  wsConnectedOnce: false,
  friendSyncTimer: null,
  friendSyncSnapshot: [],
  readReceiptSyncTimers: {},
  scrollToBottom: false,
  preview: null,
  mention: null,
  mentionIds: [],
  notifiedMentionMessageIds: new Set(),
  messageScrollTopByConversation: {},
  pendingMessageScrollRestore: null,
  unreadBoundaryByConversation: {},
  unreadBoundaryFocusConversationId: null,
  draftTextByConversation: parseDraftMap(localStorage.getItem(DRAFT_CACHE_KEY)),
  replyDraftByConversation: parseDraftMap(localStorage.getItem(REPLY_DRAFT_CACHE_KEY)),
  pendingEditorAutofocus: false,
  composerFocusRequestId: 0,
  highlightedMessageId: null,
  forwardPayload: null,
  forwardSelection: null,
  forwardSearchRefreshTimer: null,
  forwardSearchKeepAliveUntil: 0,
  messageMenu: null,
  conversationMenu: null,
  multiSelect: null,
  suppressPointerUntil: 0,
  mediaFilter: "all",
  searchResults: [],
  searchLoading: false,
  searchRequestSeq: 0,
  searchComposing: false,
  readDetailMessageId: null,
  readDetail: null,
  readDetailLoading: false,
  transientFocus: null,
  exploreView: "discover",
  networkLine: localStorage.getItem("chatlite-network-line") || "线路 A",
  showSplash: !sessionStorage.getItem("chatlite-splash-seen"),
  pendingJoin: parseJoinLink(),
  securityOldPassword: ""
};

const mock = createMockData();
let sidePageDelegateBound = false;

const icons = {
  chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 5.8C4 4.25 5.25 3 6.8 3h10.4C18.75 3 20 4.25 20 5.8v6.4c0 1.55-1.25 2.8-2.8 2.8H11l-5 4v-4.1A2.8 2.8 0 0 1 4 12.2V5.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  contact: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8.5 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 21a5.5 5.5 0 0 1 11 0M13.5 20a4.5 4.5 0 0 1 8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  me: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  explore: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" stroke-width="1.8"/><path d="m9.5 14.5 1.2-3.8 3.8-1.2-1.2 3.8-3.8 1.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  plus: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  search: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m20 20-4.5-4.5M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  settings: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/><path d="M19 12a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8.5 8.5 0 0 0-1.8-1L14.4 3h-4.8L9.3 6a8.5 8.5 0 0 0-1.8 1L5.1 6 3 9.5 5.1 11a7.8 7.8 0 0 0 0 2L3 14.5 5.1 18l2.4-1a8.5 8.5 0 0 0 1.8 1l.3 3h4.8l.3-3a8.5 8.5 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 14a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="1.8"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  attach: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m7 12 5.7-5.7a4 4 0 1 1 5.7 5.7l-7.8 7.8a5.5 5.5 0 0 1-7.8-7.8l7.5-7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  smile: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 14.5a5 5 0 0 0 8 0M9 9h.01M15 9h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 18 9 12l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

init();

async function init() {
  if (await recoverStaleAppShell()) return;
  if (state.authed) {
    await loadData();
    await preparePendingJoin();
    connectRealtime();
  }
  window.addEventListener("hashchange", handleSidePageHash);
  window.addEventListener("popstate", handleConversationRouteChange);
  window.addEventListener("focus", acknowledgeVisibleConversationRead);
  document.addEventListener("visibilitychange", acknowledgeVisibleConversationRead);
  render();
  await handleSidePageHash();
  acknowledgeVisibleConversationRead();
  if (state.showSplash) {
    setTimeout(() => {
      sessionStorage.setItem("chatlite-splash-seen", "1");
      state.showSplash = false;
      render();
    }, 900);
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/src/sw.js").catch(() => {});
  }
}

async function recoverStaleAppShell() {
  const previous = localStorage.getItem(APP_VERSION_KEY);
  if (previous === APP_VERSION) return false;
  localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  } catch (_) {}
  if (previous) {
    window.location.reload();
    return true;
  }
  return false;
}

async function handleSidePageHash() {
  const sidePage = window.location.hash?.slice(1);
  if (!sidePage) return;
  if (isKnownConversationHash(sidePage)) {
    await openConversationFromHash(sidePage);
    return;
  }
  if (!isKnownSidePage(sidePage)) return;
  await openSidePage(sidePage);
}

function conversationIdFromCurrentRoute() {
  return canonicalConversationIdForRoute(
    conversationIdFromLocation(window.location),
    state.data?.groups || []
  );
}

async function handleConversationRouteChange() {
  const conversationId = conversationIdFromCurrentRoute();
  if (conversationId && getConversation(conversationId)) {
    await openConversationFromHash(conversationId);
    return;
  }
  if (!conversationId && state.selectedConversationId) {
    state.selectedConversationId = null;
    state.sidePage = null;
    render();
  }
}

function syncConversationPath(conversationId, { push = false } = {}) {
  const nextPath = conversationPathFor(conversationId, state.data?.groups || []);
  const nextUrl = `${nextPath}${window.location.search}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentUrl === nextUrl) return;
  window.history[push ? "pushState" : "replaceState"](null, "", nextUrl);
}

function syncSidePageFromHash() {
  const sidePage = window.location.hash?.slice(1);
  if (isKnownConversationHash(sidePage)) return;
  if (!sidePage || !isKnownSidePage(sidePage) || state.sidePage === sidePage) return;
  state.sidePage = sidePage;
  applySidePageSection(sidePage);
}

function isKnownConversationHash(value) {
  return Boolean(value && (value.startsWith("group-") || value.startsWith("session-")));
}

async function openConversationFromHash(value) {
  const conversationId = canonicalConversationIdForRoute(decodeURIComponent(value || ""), state.data?.groups || []);
  await openConversation(conversationId);
}

function beginConversationSelection(conversationId, { push = false } = {}) {
  const alreadyOpen = Boolean(
    state.section === "messages" &&
    state.selectedConversationId === conversationId &&
    !state.sidePage
  );
  const token = ++state.conversationSelectionToken;
  state.section = "messages";
  state.selectedConversationId = conversationId;
  state.sidePage = null;
  syncConversationPath(conversationId, { push });
  return { alreadyOpen, token };
}

function isCurrentConversationSelection(conversationId, token) {
  return shouldCommitConversationSelection({
    expectedConversationId: conversationId,
    expectedToken: token,
    selectedConversationId: state.selectedConversationId,
    selectionToken: state.conversationSelectionToken,
    section: state.section,
    sidePage: state.sidePage
  });
}

async function openConversation(conversationId, { push = false } = {}) {
  if (!conversationId || !getConversation(conversationId)) return;
  const { alreadyOpen, token } = beginConversationSelection(conversationId, { push });
  if (alreadyOpen) {
    void acknowledgeConversationRead(conversationId);
    return;
  }
  await Promise.all([
    loadMessages(conversationId, { restoreUnreadBoundary: true }),
    loadConversationGroup(conversationId)
  ]);
  if (!isCurrentConversationSelection(conversationId, token)) return;
  render();
  void acknowledgeConversationRead(conversationId);
}

async function loadData() {
  try {
    const [user, conversations, contacts, groups, discoverGroups, requests, collections] = await Promise.all([
      api("/api/me"),
      api("/api/conversations"),
      api("/api/contacts"),
      api("/api/groups"),
      api("/api/groups/discover").catch(() => []),
      api("/api/friend-requests"),
      api("/api/collections")
    ]);
    state.user = user;
    ensureUserSettings();
    state.data = {
      conversations: listOrEmpty(conversations),
      contacts: listOrEmpty(contacts),
      groups: listOrEmpty(groups),
      directoryGroups: listOrEmpty(discoverGroups),
      requests: listOrEmpty(requests),
      collections: listOrEmpty(collections),
      groupJoinRequests: {},
      groupBlacklists: {},
      groupBots: {},
      auditLogs: {},
      loginDevices: [],
      messages: {}
    };
    const routeConversationId = conversationIdFromCurrentRoute();
    state.selectedConversationId = routeConversationId && getConversation(routeConversationId)
      ? routeConversationId
      : null;
    if (routeConversationId && !state.selectedConversationId) syncConversationPath(null);
    if (state.selectedConversationId) {
      syncConversationPath(state.selectedConversationId);
      await Promise.all([
        loadMessages(state.selectedConversationId, { restoreUnreadBoundary: true }),
        loadConversationGroup(state.selectedConversationId)
      ]);
    }
  } catch (error) {
    if (isNetworkFailure(error)) {
      localStorage.removeItem("chatlite-token");
      state.authed = false;
      state.useMock = false;
      state.user = null;
      state.data = null;
      toast("API 未启动，无法加载真实数据");
      return;
    }
    localStorage.removeItem("chatlite-token");
    state.authed = false;
    state.useMock = false;
    state.user = null;
    state.data = null;
    toast("登录已失效，请重新登录");
  }
}

async function api(path, options = {}) {
  const { withResponseMeta = false, ...fetchOptions } = options;
  const token = localStorage.getItem("chatlite-token");
  const res = await fetch(API_BASE + path, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {})
    }
  });
  if (!res.ok) {
    const error = new Error(await res.text());
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  return withResponseMeta ? { data, response: res } : data;
}

function listOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function isNetworkFailure(error) {
  const message = String(error?.message || "");
  return error instanceof TypeError || message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("Load failed");
}

function updateUnreadBoundary(conversationId, messages, previousReadAt, shouldFocus) {
  const previousReadAtMs = Date.parse(previousReadAt || "");
  if (!Number.isFinite(previousReadAtMs)) {
    delete state.unreadBoundaryByConversation[conversationId];
    return false;
  }
  const unreadMessages = (messages || []).filter(message => {
    const createdAtMs = Date.parse(message.createdAt || "");
    return message.senderId !== state.user?.id && Number.isFinite(createdAtMs) && createdAtMs > previousReadAtMs;
  });
  if (!unreadMessages.length) {
    delete state.unreadBoundaryByConversation[conversationId];
    return false;
  }
  state.unreadBoundaryByConversation[conversationId] = {
    firstMessageId: unreadMessages[0].id,
    count: unreadMessages.length
  };
  if (shouldFocus && state.selectedConversationId === conversationId) {
    state.unreadBoundaryFocusConversationId = conversationId;
  }
  return true;
}

function renderConversationMessages(messages, conversationId) {
  const boundary = state.unreadBoundaryByConversation[conversationId];
  return (messages || []).map(message => {
    const divider = boundary?.firstMessageId === message.id
      ? `<div class="unread-message-boundary" role="status"><span>${boundary.count}则未读消息</span></div>`
      : "";
    return `${divider}${renderMessage(message)}`;
  }).join("");
}

async function loadMessages(conversationId, { restoreUnreadBoundary = false } = {}) {
  if (state.useMock) {
    if (!state.data.messages[conversationId]) {
      state.data.messages[conversationId] = mock.messages[conversationId] || [];
    }
    if (restoreUnreadBoundary) {
      delete state.unreadBoundaryByConversation[conversationId];
      scheduleScrollToBottom();
    }
    return;
  }
  // Loading messages is read-only. A separate request confirms that the visible conversation was read.
  const { data: messages, response } = await api(`/api/conversations/${conversationId}/messages`, { withResponseMeta: true });
  state.data.messages[conversationId] = messages;
  if (restoreUnreadBoundary) {
    const hasUnreadBoundary = updateUnreadBoundary(
      conversationId,
      messages,
      response.headers.get("X-Chat-Previous-Read-At"),
      true
    );
    if (!hasUnreadBoundary) scheduleScrollToBottom();
  }
}

function scheduleRealtimeReadReceipt(conversationId, incoming) {
  if (!shouldAcknowledgeRealtimeMessage({
    conversationId,
    selectedConversationId: state.selectedConversationId,
    incoming,
    section: state.section
  })) return;
  if (state.readReceiptSyncTimers[conversationId]) return;

  state.readReceiptSyncTimers[conversationId] = window.setTimeout(async () => {
    delete state.readReceiptSyncTimers[conversationId];
    if (!canAcknowledgeConversationRead(conversationId)) return;
    await acknowledgeConversationRead(conversationId);
    if (canAcknowledgeConversationRead(conversationId)) {
      scheduleScrollToBottom();
      render();
    }
  }, 80);
}

async function loadFriendRequests() {
  if (state.useMock) return;
  state.data.requests = await api("/api/friend-requests");
}

async function loadLoginDevices() {
  if (state.useMock) return;
  state.data.loginDevices = await api("/api/me/devices");
}

async function refreshGroupsAndConversations() {
  if (state.useMock) return;
  const [conversations, groups, discoverGroups] = await Promise.all([
    api("/api/conversations"),
    api("/api/groups"),
    api("/api/groups/discover").catch(() => [])
  ]);
  state.data.conversations = conversations;
  state.data.groups = groups;
  state.data.directoryGroups = discoverGroups;
}

async function refreshFriendRealtimeState() {
  if (state.useMock || !state.data) return;
  const [requests, contacts, conversations] = await Promise.all([
    api("/api/friend-requests"),
    api("/api/contacts"),
    api("/api/conversations")
  ]);
  state.data.requests = listOrEmpty(requests);
  state.data.contacts = listOrEmpty(contacts);
  state.data.conversations = listOrEmpty(conversations);
}

async function syncFriendRealtimeState() {
  if (state.useMock || !state.data || state.ws || document.visibilityState === "hidden") return;
  const previousRequests = state.friendSyncSnapshot;
  const previousState = JSON.stringify({
    requests: state.data.requests,
    contacts: state.data.contacts,
    conversations: state.data.conversations
  });
  await refreshFriendRealtimeState();
  const nextRequests = state.data.requests || [];
  const message = friendRequestSyncUpdate(previousRequests, nextRequests);
  state.friendSyncSnapshot = nextRequests.map(request => ({ ...request }));
  const nextState = JSON.stringify({
    requests: state.data.requests,
    contacts: state.data.contacts,
    conversations: state.data.conversations
  });
  if (message) toast(message);
  if (message || previousState !== nextState) render();
}

function startFriendRealtimeSync() {
  if (state.useMock || state.ws || state.friendSyncTimer) return;
  state.friendSyncSnapshot = (state.data?.requests || []).map(request => ({ ...request }));
  state.friendSyncTimer = window.setInterval(() => {
    syncFriendRealtimeState().catch(() => {});
  }, 5000);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !state.ws) syncFriendRealtimeState().catch(() => {});
  });
}

function stopFriendRealtimeSync() {
  if (!state.friendSyncTimer) return;
  window.clearInterval(state.friendSyncTimer);
  state.friendSyncTimer = null;
}

function scheduleRealtimeReconnect() {
  if (state.useMock || state.wsReconnectTimer) return;
  state.wsReconnectTimer = window.setTimeout(() => {
    state.wsReconnectTimer = null;
    connectRealtime();
  }, 1000);
}

function stopRealtimeHeartbeat() {
  if (!state.wsHeartbeatTimer) return;
  window.clearInterval(state.wsHeartbeatTimer);
  state.wsHeartbeatTimer = null;
}

function startRealtimeHeartbeat(ws) {
  stopRealtimeHeartbeat();
  state.wsLastHeartbeatAt = Date.now();
  state.wsHeartbeatTimer = window.setInterval(() => {
    if (state.ws !== ws) {
      stopRealtimeHeartbeat();
      return;
    }
    if (shouldReconnectRealtimeHeartbeat({
      lastHeartbeatAt: state.wsLastHeartbeatAt,
      now: Date.now()
    })) {
      ws.close();
      return;
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heartbeat" }));
  }, 15000);
}

async function syncRealtimeSnapshot() {
  if (state.useMock || !state.data) return;
  await refreshGroupsAndConversations();
  if (state.selectedConversationId) await loadMessages(state.selectedConversationId);
  scheduleScrollToBottom();
  render();
}

function connectRealtime() {
  if (state.useMock || state.ws) return;
  try {
    const ws = new WebSocket(`${WS_BASE}/ws`);
    ws.onmessage = async event => {
      const envelope = JSON.parse(event.data);
      state.wsLastHeartbeatAt = Date.now();
      const friendUpdate = friendRealtimeUpdate(envelope, state.user?.id);
      if (friendUpdate.refresh) {
        await refreshFriendRealtimeState().catch(() => {});
        if (friendUpdate.toast) toast(friendUpdate.toast);
        render();
        return;
      }
      if (envelope.type === "message.created") {
        const id = envelope.conversationId;
        const message = envelope.payload;
        if (!canReceiveRealtimeConversation({
          conversationId: id,
          currentUserId: state.user?.id,
          contactIds: (state.data.contacts || []).map(contact => contact.id)
        })) return;
        const incoming = message.senderId !== state.user?.id;
        const conv = ensureRealtimeConversation(id, message) || getConversation(id);
        state.data.messages[id] = appendMessageOnce(state.data.messages[id], message);
        const mentionedMe = incoming && messageMentionsCurrentUser(message);
        const shouldNotify = shouldNotifyConversation(conv) || mentionedMe;
        upsertConversationPreview(id, message, {
          bumpUnread: shouldNotify && incoming && !canAcknowledgeConversationRead(id),
          mentionMe: mentionedMe
        });
        if (mentionedMe) {
          rememberMentionNotification(message.id);
          toast(`有人 @ 你${conv ? ` · ${conv.title}` : ""}`);
        }
        playInAppNotificationSound({ incoming, shouldNotify, mentionedMe });
        showBrowserMessageNotification(conv, message, { incoming, mentionedMe });
        scheduleRealtimeReadReceipt(id, incoming);
        if (id === state.selectedConversationId) scheduleScrollToBottom();
        render();
      }
      if (envelope.type === "message.mentioned") {
        const id = envelope.conversationId;
        const recipientId = String(envelope.payload?.recipientId || "");
        const message = envelope.payload?.message;
        if (!message || recipientId !== String(state.user?.id || "") || message.senderId === state.user?.id) return;
        if (hasMentionNotification(message.id)) return;
        const conv = getConversation(id) || ensureRealtimeConversation(id, message);
        rememberMentionNotification(message.id);
        toast(`有人 @ 你${conv ? ` · ${conv.title}` : ""}`);
        showBrowserMessageNotification(conv, message, { incoming: true, mentionedMe: true });
      }
      if (envelope.type === "message.read") {
        const id = envelope.conversationId;
        if (id && state.data.messages[id]) {
          state.data.messages[id] = applyMessageReadReceipt(state.data.messages[id], envelope.payload);
          if (String(envelope.payload?.userId || "") === String(state.user?.id || "")) {
            markConversationRead(id);
            delete state.unreadBoundaryByConversation[id];
          }
          render();
        }
      }
      if (envelope.type === "group.join.requested") {
        const request = envelope.payload;
        if (request?.groupId) {
          state.data.groupJoinRequests ||= {};
          state.data.groupJoinRequests[request.groupId] = [
            request,
            ...(state.data.groupJoinRequests[request.groupId] || []).filter(item => item.id !== request.id)
          ];
          render();
        }
      }
      if (envelope.type === "group.join.reviewed") {
        const request = envelope.payload;
        if (request?.groupId) {
          state.data.groupJoinRequests ||= {};
          state.data.groupJoinRequests[request.groupId] = (state.data.groupJoinRequests[request.groupId] || [])
            .map(item => item.id === request.id ? request : item);
          render();
        }
      }
      if (envelope.type === "group.member.updated") {
        const groupId = envelope.conversationId?.replace("group-", "");
        if (groupId) {
          const payload = envelope.payload;
          if (payload?.members) {
            upsertGroup(payload);
          } else if (payload?.removed) {
            removeGroupMemberFromState(groupId, payload.removed);
          } else if (payload?.userId) {
            upsertGroupMember(groupId, payload);
            if (payload.userId === state.user?.id) {
              refreshGroupsAndConversations().then(render).catch(() => {});
            }
          }
          render();
        }
      }
      if (envelope.type === "group.updated") {
        const group = envelope.payload;
        if (group?.id) {
          upsertGroup(group);
          render();
        }
      }
      if (envelope.type === "group.owner.transferred") {
        const group = envelope.payload;
        if (group?.id) {
          state.data.groups = (state.data.groups || []).map(item => item.id === group.id ? group : item);
          state.data.directoryGroups = (state.data.directoryGroups || []).map(item => item.id === group.id ? group : item);
          if (state.sidePage === "transfer-owner" && !canTransferOwner(group, state.user)) {
            state.sidePage = "group-admins";
          }
          render();
        }
      }
      if (envelope.type === "group.blacklist.updated") {
        const payload = envelope.payload;
        const groupId = payload?.groupId || envelope.conversationId?.replace("group-", "");
        if (groupId) {
          const next = applyGroupBlacklistEvent(
            {
              groupBlacklists: state.data.groupBlacklists,
              groups: state.data.groups
            },
            { ...payload, groupId }
          );
          state.data.groupBlacklists = next.groupBlacklists;
          state.data.groups = next.groups;
          render();
        }
      }
    };
    ws.onclose = () => {
      if (state.ws === ws) state.ws = null;
      stopRealtimeHeartbeat();
      startFriendRealtimeSync();
      scheduleRealtimeReconnect();
    };
    ws.onerror = () => {
      // onclose clears the stale handle and schedules a reconnect.
    };
    ws.onopen = async () => {
      if (state.ws !== ws) return;
      stopFriendRealtimeSync();
      startRealtimeHeartbeat(ws);
      const shouldRefresh = shouldRefreshRealtimeSnapshotOnOpen({ previousConnection: state.wsConnectedOnce });
      state.wsConnectedOnce = true;
      if (shouldRefresh) await syncRealtimeSnapshot().catch(() => {});
    };
    state.ws = ws;
  } catch (_) {}
}

async function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    toast("当前浏览器不支持消息通知");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    toast("浏览器通知已被拒绝，请在浏览器设置里允许通知");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    toast("未开启浏览器通知权限");
    return false;
  }
  return true;
}

let notificationAudioContext = null;
let notificationSoundUnlockInstalled = false;

function notificationAudioContextForPlayback() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!notificationAudioContext) notificationAudioContext = new AudioContextCtor();
  return notificationAudioContext;
}

function unlockNotificationSound() {
  const context = notificationAudioContextForPlayback();
  if (context?.state === "suspended") void context.resume().catch(() => {});
}

function installNotificationSoundUnlock() {
  if (notificationSoundUnlockInstalled) return;
  notificationSoundUnlockInstalled = true;
  document.addEventListener("pointerdown", unlockNotificationSound, { capture: true, passive: true });
  document.addEventListener("keydown", unlockNotificationSound, { capture: true });
}

function playNotificationTone(context, frequency, startAt, duration = 0.16) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.085, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.01);
}

function playInAppNotificationSound({ incoming, shouldNotify, mentionedMe } = {}) {
  const settings = ensureUserSettings();
  if (!incoming || !shouldNotify || !settings.notificationsEnabled || !settings.notificationSound) return;
  const context = notificationAudioContextForPlayback();
  if (!context || context.state !== "running") return;
  const startAt = context.currentTime + 0.02;
  playNotificationTone(context, mentionedMe ? 880 : 660, startAt);
  if (mentionedMe) playNotificationTone(context, 1175, startAt + 0.19);
}

async function showBrowserMessageNotification(conversation, message, { incoming, mentionedMe } = {}) {
  const settings = ensureUserSettings();
  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "denied";
  if (!shouldShowBrowserNotification({
    incoming,
    activeConversationOpen: isConversationOpenForNotification(conversation),
    conversation,
    mentionedMe,
    settings,
    permission,
    supported
  })) return;
  const payload = browserNotificationPayload(conversation, message);
  const notificationIdentity = browserNotificationOptions(payload, message, { mentionedMe });
  const options = {
    body: payload.body,
    ...notificationIdentity,
    icon: "/public/icon.svg",
    silent: !settings.notificationSound,
    data: { conversationId: conversation?.id || message?.conversationId || "" }
  };
  let registration = null;
  try {
    registration = await Promise.race([
      navigator.serviceWorker?.ready,
      new Promise(resolve => setTimeout(() => resolve(null), 1200))
    ]);
  } catch (_) {}
  if (browserNotificationDelivery({ serviceWorkerReady: Boolean(registration?.showNotification) }) === "service-worker") {
    try {
      await registration.showNotification(payload.title, options);
      return;
    } catch (_) {}
  }
  try {
    const notification = new Notification(payload.title, options);
    notification.onclick = () => {
      window.focus();
      if (options.data.conversationId) {
        state.section = "messages";
        state.selectedConversationId = options.data.conversationId;
        syncConversationPath(state.selectedConversationId, { push: true });
        state.sidePage = null;
        render();
      }
      notification.close();
    };
  } catch (_) {}
}

function isConversationOpenForNotification(conversation) {
  return Boolean(
    conversation?.id &&
    conversation.id === state.selectedConversationId &&
    state.section === "messages" &&
    !state.sidePage &&
    document.visibilityState === "visible"
  );
}

function render() {
  const shouldScrollToBottom = state.scrollToBottom;
  const shouldFocusUnreadBoundary = state.unreadBoundaryFocusConversationId === state.selectedConversationId;
  if (shouldFocusUnreadBoundary) state.scrollToBottom = false;
  rememberMessageScrollPosition();
  rememberTransientFocus();
  syncSidePageFromHash();
  const app = document.querySelector("#app");
  app.innerHTML = state.showSplash ? renderSplash() : state.authed ? renderApp() : renderAuth();
  bindAvatarFallbacks();
  bindEvents();
  flushScrollToBottom();
  flushUnreadBoundaryFocus();
  restoreMessageScrollPosition({ skip: shouldScrollToBottom || shouldFocusUnreadBoundary });
  restoreTransientFocus();
  syncHighlightedMessage();
  hydrateQrCodes();
}

function bindAvatarFallbacks() {
  document.querySelectorAll("img.avatar, img.chat-header-avatar").forEach(image => {
    image.addEventListener("error", () => {
      if (image.dataset.avatarFallbackApplied === "true") return;
      image.dataset.avatarFallbackApplied = "true";
      image.src = image.dataset.avatarFallback || avatar("友");
    }, { once: true });
  });
}

function renderSplash() {
  return `
    <main class="splash-shell">
      <section class="splash-card">
        <div class="splash-logo"><img src="/public/icon.svg" alt="99Chat"></div>
        <h1>99Chat</h1>
        <p>群聊、好友、探索，正在连接。</p>
        <div class="splash-loader"><span></span><span></span><span></span></div>
      </section>
    </main>`;
}

function renderAuth() {
  const isRegister = state.authMode === "register";
  const isCodeLogin = state.authMode === "code-login";
  const isForgotPassword = state.authMode === "forgot-password";
  const isPasswordLogin = !isRegister && !isCodeLogin && !isForgotPassword;
  const authDefaults = readAuthDefaults();
  return `
    <main class="auth-shell">
      <section class="auth-stage">
        <aside class="auth-spotlight" aria-hidden="true">
          <div class="auth-spotlight-head">
            <div class="auth-spotlight-mark"><img src="/public/icon.svg" alt=""></div>
            <div class="auth-spotlight-copy">
              <div class="auth-spotlight-kicker">99Chat</div>
              <div class="auth-spotlight-title">群聊、好友、探索，一站连上。</div>
            </div>
          </div>
          <div class="auth-pills auth-pills-dark">
            <span>更清爽</span>
            <span>更安全</span>
            <span>更好聊</span>
          </div>
          <div class="auth-preview-grid">
            <div class="auth-preview-card">
              <strong>群聊</strong>
              <span>会话层次清楚</span>
            </div>
            <div class="auth-preview-card">
              <strong>好友</strong>
              <span>申请与关系同步</span>
            </div>
            <div class="auth-preview-card">
              <strong>探索</strong>
              <span>找人入群更快</span>
            </div>
          </div>
          <div class="auth-spotlight-foot">
            <span>Desktop first</span>
            <span>Responsive UI</span>
          </div>
        </aside>
        <section class="auth-card">
          <div class="brand-mark"><img src="/public/icon.svg" alt="99Chat"></div>
          <div class="auth-hero">
            <h1>99Chat</h1>
            <p>群聊、好友、探索，一站连上。</p>
          </div>
          ${state.pendingJoin ? `<div class="join-login-hint">登录后继续扫码入群</div>` : ""}
          <div class="tabs">
            <button class="tab ${isPasswordLogin ? "active" : ""}" type="button" data-auth-mode="login">密码登录</button>
            <button class="tab ${isCodeLogin ? "active" : ""}" type="button" data-auth-mode="code-login">验证码登录</button>
            <button class="tab ${isRegister ? "active" : ""}" type="button" data-auth-mode="register">注册</button>
          </div>
          ${isForgotPassword ? `<div class="join-login-hint">找回密码 · ${authCodeHint(state.useMock, DEMO_LOGIN_CODE)}</div>` : ""}
          <form id="loginForm">
            ${isRegister ? `<input class="input" style="margin-bottom:16px" name="nickname" value="新用户" placeholder="请输入昵称" autocomplete="nickname">` : ""}
            <div class="field-row">
              <select class="select" name="country">
                <option value="+86" ${authDefaults.country === "+86" ? "selected" : ""}>+86</option>
                <option value="+852" ${authDefaults.country === "+852" ? "selected" : ""}>+852</option>
                <option value="+65" ${authDefaults.country === "+65" ? "selected" : ""}>+65</option>
                <option value="+60" ${authDefaults.country === "+60" ? "selected" : ""}>+60</option>
                <option value="+84" ${authDefaults.country === "+84" ? "selected" : ""}>+84</option>
              </select>
              <input class="input" name="phone" value="${escapeAttr(authDefaults.phone)}" placeholder="请输入手机号码" autocomplete="tel-local">
            </div>
            ${isForgotPassword
              ? `<div class="field-row">
                  <input class="input" name="code" value="" placeholder="请输入验证码" inputmode="numeric" autocomplete="one-time-code">
                  <button class="ghost-btn inline auth-code-btn" type="button" data-send-auth-code>获取验证码</button>
                </div>
                <input class="input" name="newPassword" value="" placeholder="请输入新密码" type="password" autocomplete="new-password">
                <input class="input" name="confirmPassword" value="" placeholder="请再次输入新密码" type="password" autocomplete="new-password">
                <div class="auth-links"><span>${authCodeHint(state.useMock, DEMO_LOGIN_CODE)}</span></div>`
              : isCodeLogin
              ? `<div class="field-row">
                  <input class="input" name="code" value="" placeholder="请输入验证码" inputmode="numeric" autocomplete="one-time-code">
                  <button class="ghost-btn inline auth-code-btn" type="button" data-send-auth-code>获取验证码</button>
                </div>
                <div class="auth-links"><span>${authCodeHint(state.useMock, DEMO_LOGIN_CODE)}</span></div>`
              : `<input class="input" name="password" value="${isRegister ? "" : escapeAttr(authDefaults.password)}" placeholder="请输入密码" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}">
                <div class="auth-links"><a href="#" data-auth-mode="forgot-password">忘记密码</a></div>`}
            <button class="primary-btn" type="submit">${isRegister ? "注册并登录" : isCodeLogin ? "验证码登录" : isForgotPassword ? "重置密码" : "登录"}</button>
            <a class="auth-register" href="#" data-auth-mode="${(isRegister || isForgotPassword) ? "login" : "register"}">${(isRegister || isForgotPassword) ? "返回登录" : "立即注册"}</a>
          </form>
        </section>
      </section>
      ${renderToast()}
    </main>`;
}

function renderApp() {
  const activeConv = getConversation(state.selectedConversationId);
  const unread = effectiveUnreadCount(state.data.conversations);
  const mobileActive = state.section === "messages"
    ? activeConv ? "mobile-active" : ""
    : "mobile-active mobile-page-active";
  return `
    <main class="app-shell">
      <nav class="rail">
        <button class="icon-btn" data-section="me" title="个人中心"><img class="avatar" src="${avatarFor(state.user, "我")}" alt=""></button>
        <div class="rail-nav">
          ${railLink("contact", "通讯录", icons.contact)}
          ${railLink("messages", "聊天", icons.chat, unreadBadgeLabel(unread))}
          ${railLink("explore", "探索", icons.explore)}
          ${railLink("me", "我的", icons.me)}
        </div>
      </nav>
      ${renderSidebar()}
      <section class="workspace ${state.section !== "messages" || !state.sidePage ? "single" : ""} ${state.sidePage ? "with-detail" : ""} ${mobileActive}">
        ${renderWorkspace()}
      </section>
      <input class="hidden" id="filePicker" type="file">
      ${renderConversationContextMenu()}
      ${renderMessageContextMenu()}
      ${renderModal()}
      ${renderToast()}
    </main>`;
}

function renderToast() {
  if (!state.toast) return "";
  return `
    <div class="toast" role="status" aria-live="polite">
      <span class="toast-dot" aria-hidden="true"></span>
      <span class="toast-text">${escapeHTML(state.toast)}</span>
    </div>`;
}

function railLink(section, label, icon, badge = "") {
  return `<a class="rail-link ${state.section === section ? "active" : ""}" href="#" data-section="${section}">
    ${badge ? `<span class="badge">${badge}</span>` : ""}
    ${icon}<span>${label}</span>
  </a>`;
}

function renderSidebar() {
  if (state.section === "contact") return renderContactSidebar();
  if (state.section === "explore") return renderExploreSidebar();
  if (state.section === "me") return renderProfileSidebar();
  return renderMessageSidebar();
}

function renderExploreSidebar() {
  const active = state.exploreView || "discover";
  return `
    <aside class="sidebar">
      <header class="panel-header"><h2>探索</h2></header>
      <div class="list">
        <button class="list-item ${active === "discover" ? "active" : ""}" type="button" data-explore-view="discover">
          <div class="side-entry-icon">⌕</div>
          <div>
            <div class="item-title">发现</div>
            <div class="item-preview">扫一扫、找好友、入群入口</div>
          </div>
        </button>
        <button class="list-item ${active === "groups" ? "active" : ""}" type="button" data-explore-view="groups">
          <div class="side-entry-icon">#</div>
          <div>
            <div class="item-title">群聊广场</div>
            <div class="item-preview">公开群推荐与扫码加入</div>
          </div>
        </button>
      </div>
    </aside>`;
}

function renderMessageSidebar() {
  const items = filteredConversations();
  const unread = effectiveUnreadCount(state.data.conversations);
  const pinned = items.filter(item => item.pinned);
  const recent = items.filter(item => !item.pinned);
  return `
    <aside class="sidebar">
      <header class="panel-header">
        <div class="panel-title-block">
          <h2>聊天</h2>
          <div class="panel-subtitle">${items.length} 个会话${unread ? ` · ${unread} 条未读` : ""}</div>
        </div>
        <div class="icon-row">
          ${unread ? `<button class="icon-btn" title="全部已读" aria-label="全部已读" data-action="mark-read">✓</button>` : ""}
          <button class="icon-btn" title="添加聊天" aria-label="添加聊天" data-modal="quick-add">${icons.plus}</button>
        </div>
      </header>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="搜索"></div>
      <div class="segmented">
        ${seg("all", "全部")}
        ${seg("unread", "未读")}
        ${seg("group", "群聊")}
      </div>
      <div class="list">
        ${pinned.length ? `
          <div class="sidebar-group-title">置顶 (${pinned.length})</div>
          ${pinned.map(renderConversationListItem).join("")}
        ` : ""}
        ${recent.length ? `
          <div class="sidebar-group-title${pinned.length ? " spaced" : ""}">最近 (${recent.length})</div>
          ${recent.map(renderConversationListItem).join("")}
        ` : ""}
        ${!items.length ? renderMessageSidebarEmptyState() : ""}
      </div>
    </aside>`;
}

function renderMessageSidebarEmptyState() {
  return `
    <section class="message-empty-state">
      <div class="message-empty-icon">${icons.chat}</div>
      <h3>还没有聊天</h3>
      <p>先添加好友，或创建群聊开始第一条会话。</p>
      <div class="message-empty-actions">
        <button class="primary-btn inline" type="button" data-modal="add-friend">添加好友</button>
        <button class="ghost-btn inline" type="button" data-modal="create-group">发起群聊</button>
      </div>
    </section>`;
}

function renderConversationListItem(c) {
  const kindLabel = c.kind === "group" ? "群聊" : "私聊";
  const preview = formatPreview(getConversationPreviewText(c));
  const mentioned = conversationMentionsCurrentUser(c);
  const notifyEnabled = shouldNotifyConversation(c) || mentioned;
  const visibleUnread = notifyEnabled ? c.unread : 0;
  const rowClass = [
    "list-item",
    "conversation-row",
    c.kind === "group" ? "conversation-row-group" : "conversation-row-private",
    c.id === state.selectedConversationId ? "active" : "",
    c.pinned ? "conversation-pinned" : "",
    visibleUnread ? "conversation-unread" : "",
    mentioned ? "conversation-mentioned" : ""
  ].filter(Boolean).join(" ");
  return `
    <article class="${rowClass}" data-conversation="${c.id}">
      <span class="conversation-avatar-wrap">
        ${renderEntityAvatar(c, c.kind === "group" ? "群" : "友")}
      </span>
      <div class="conversation-copy">
        <div class="conversation-topline">
          <div class="conversation-title">${escapeHTML(c.title)}</div>
          <div class="conversation-flags">
            <span class="conversation-kind">${kindLabel}</span>
            ${c.muted ? `<span class="conversation-kind muted">免打扰</span>` : ""}
            ${mentioned ? `<span class="conversation-kind mention">@你</span>` : ""}
          </div>
        </div>
        <div class="conversation-bottomline">
          <div class="item-preview">${preview}</div>
          <div class="conversation-meta">
            <span class="conversation-time">${formatTime(c.lastAt)}</span>
            ${visibleUnread ? `<span class="badge">${visibleUnread > 99 ? "99+" : visibleUnread}</span>` : ""}
          </div>
        </div>
      </div>
    </article>`;
}

function renderContactSidebar() {
  const contacts = filteredContacts();
  return `
    <aside class="sidebar">
      <header class="panel-header">
        <h2>通讯录</h2>
        <button class="icon-btn" data-modal="quick-add" title="添加朋友">${icons.plus}</button>
      </header>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="搜索"></div>
      <div class="list">
        ${sideEntry("friend-requests", "新的朋友", "近期好友申请")}
        ${sideEntry("tags", "标签", "更快速地管理联系人")}
        ${sideEntry("groups", "群聊天", `${state.data.groups.length} 个群组`)}
        <div class="section"><h3>联络人 (${contacts.length})</h3></div>
        ${contacts.map(c => `
          <article class="list-item" data-contact="${c.id}">
            <img class="avatar" src="${avatarSrc(c.avatar)}" alt="">
            <div>
              <div class="item-title">${escapeHTML(c.nickname)}</div>
              <div class="item-preview">${escapeHTML(c.signature || c.chatId)}</div>
            </div>
          </article>`).join("")}
      </div>
    </aside>`;
}

function sideEntry(page, title, preview, options = {}) {
  const active = state.sidePage === page;
  const icon = options.icon || title[0];
  return `
    <a class="list-item ${options.compact ? "profile-side-entry" : ""} ${active ? "active" : ""}" href="#${escapeAttr(page)}" data-sidepage="${page}">
      <div class="side-entry-icon">${escapeHTML(icon)}</div>
      <div>
        <div class="item-title">${title}</div>
        <div class="item-preview">${preview}</div>
      </div>
      ${options.compact ? `<div class="side-entry-arrow">›</div>` : ""}
    </a>`;
}

function renderProfileSidebar() {
  const entries = profileSidebarEntries(state.useMock);
  return `
    <aside class="sidebar">
      <header class="panel-header"><h2>个人中心</h2></header>
      <div class="profile-card">
        <div class="profile-card-top">
        <img class="avatar profile-card-avatar" src="${avatarFor(state.user, "我")}" alt="">
          <div class="profile-card-actions">
            <button class="icon-btn" type="button" data-profile-action="avatar" title="更换头像">✎</button>
            <button class="icon-btn" type="button" data-sidepage="qrcode" title="二维码">⌘</button>
          </div>
        </div>
        <div class="profile-card-meta">
          <div class="item-title">${escapeHTML(state.user.nickname)}</div>
          <div class="item-preview">${escapeHTML(state.user.signature || "暂无个性签名")}</div>
        </div>
      </div>
      <div class="list profile-side-list">
        ${entries.map(entry => sideEntry(entry.key, entry.title, entry.preview, { compact: true, icon: entry.icon })).join("")}
      </div>
      <div class="list profile-side-footer">
        <article class="list-item profile-side-entry danger-entry" data-action="logout">
          <div class="side-entry-icon">⇠</div>
          <div>
            <div class="item-title">退出</div>
          </div>
        </article>
      </div>
    </aside>`;
}

function renderMobileProfileCenter() {
  const entries = profileSidebarEntries(state.useMock);
  return `
    <section class="profile-mobile-center" aria-label="个人中心">
      <h3>个人中心</h3>
      <div class="profile-mobile-center-list">
        ${entries.map(entry => `
          <button class="setting-row setting-action-row" type="button" data-sidepage="${escapeAttr(entry.key)}">
            <span class="profile-mobile-center-label"><i aria-hidden="true">${escapeHTML(entry.icon)}</i>${escapeHTML(entry.title)}</span>
            <strong>›</strong>
          </button>`).join("")}
        <button class="setting-row setting-action-row danger-text-row" type="button" data-action="logout">
          <span class="profile-mobile-center-label"><i aria-hidden="true">⇠</i>退出登录</span>
          <strong>›</strong>
        </button>
      </div>
    </section>`;
}

function renderWorkspace() {
  if (state.pendingJoin) return renderJoinGroupPage();
  if (state.section === "contact") return renderContactPage();
  if (state.section === "explore") return renderExplorePage();
  if (state.section === "me") return renderProfilePage();
  const conv = getConversation(state.selectedConversationId);
  return `${renderChatPane(conv)}${renderDetailPane(conv)}`;
}

function renderChatPane(conv) {
  if (!conv) return `<section class="chat-pane">${renderPanelState({
    title: "选择一个会话开始聊天",
    body: "左侧会话会保留上下文，点开任意一条就能继续。",
    icon: "✦",
    action: "去通讯录"
  })}</section>`;
  const messages = state.data.messages[conv.id] || [];
  const multiSelectActive = state.multiSelect?.conversationId === conv.id;
  const blockedReason = getComposerBlockedReason(conv);
  const groupAnnouncement = conv.kind === "group" ? groupAnnouncementText(groupForConversation(conv)) : "";
  return `
    <section class="chat-pane">
      <header class="chat-header">
        <button class="icon-btn" data-mobile-close title="返回" aria-label="返回">${icons.back}</button>
        <img class="chat-header-avatar" src="${avatarSrc(conv.avatar)}" alt="">
        <div class="chat-header-main">
          <div class="chat-header-title-row">
            <a class="chat-title" href="#" data-sidepage="members">${escapeHTML(conv.title)}</a>
            <span class="chat-header-kind">${conv.kind === "group" ? "群聊" : "私聊"}</span>
            ${conv.pinned ? `<span class="chat-header-pill">置顶</span>` : ""}
            ${conv.muted ? `<span class="chat-header-pill muted">免打扰</span>` : ""}
          </div>
          <div class="chat-header-meta"><span class="chat-header-status-dot"></span>${escapeHTML(getConversationHeaderMeta(conv))}</div>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" data-sidepage="search" title="搜索">${icons.search}</button>
          <button class="icon-btn" data-sidepage="settings" title="设置">${icons.settings}</button>
        </div>
      </header>
      ${groupAnnouncement ? `
        <button class="chat-group-announcement" type="button" data-sidepage="announcement" aria-label="查看群公告">
          <span class="chat-group-announcement-icon" aria-hidden="true">公告</span>
          <span class="chat-group-announcement-copy">${escapeHTML(groupAnnouncement)}</span>
          <span class="chat-group-announcement-action">查看</span>
        </button>` : ""}
      <div class="messages ${multiSelectActive ? "multi-select-active" : ""}">
        ${messages.length ? `
          <div class="day-divider">昨日下午 4:48</div>
          ${renderConversationMessages(messages, conv.id)}
        ` : renderChatEmptyState(conv)}
      </div>
      <div class="composer-shell">
        ${multiSelectActive ? renderMultiSelectBar() : `
          <div id="replyBarHost">${renderReplyComposer()}</div>
          ${blockedReason ? `<div class="composer-blocked">${escapeHTML(blockedReason)}</div>` : ""}
          <form class="composer ${state.voiceMode ? "voice-mode" : "text-mode"}" id="composer">
            <button class="icon-btn composer-mode-btn ${state.voiceMode ? "active" : ""}" type="button" data-action="voice" title="${state.voiceMode ? "切换输入" : "语音"}" ${blockedReason ? "disabled" : ""}>${state.voiceMode ? "⌨" : icons.mic}</button>
            <div class="composer-input-stack">
              ${state.voiceMode ? `<button class="ghost-btn composer-voice-pad" type="button" data-action="${composerVoiceRecordAction()}" ${blockedReason ? "disabled" : ""}><span class="voice-dot"></span><span>00:00 点击录音</span></button>` : `<textarea class="editor" id="editor" placeholder="${blockedReason ? escapeAttr(blockedReason) : "输入消息"}" ${blockedReason ? "disabled" : ""} ${state.pendingEditorAutofocus && !blockedReason ? "autofocus" : ""}>${escapeHTML(getCurrentDraftText())}</textarea>`}
            </div>
            <div class="composer-tools">
              <button class="icon-btn composer-tool-btn" type="button" data-action="mention" title="提及成员" ${blockedReason ? "disabled" : ""}>@</button>
              <button class="icon-btn composer-tool-btn ${state.toolMenu === "attachments" ? "active" : ""}" type="button" data-tool="attachments" title="附件" ${blockedReason ? "disabled" : ""}>${icons.attach}</button>
              <button class="icon-btn composer-tool-btn ${state.toolMenu === "emoji" ? "active" : ""}" type="button" data-tool="emoji" title="表情" ${blockedReason ? "disabled" : ""}>${icons.smile}</button>
            </div>
            <button class="primary-btn inline composer-send-btn" type="submit" ${blockedReason ? "disabled" : ""}>传送</button>
          </form>
          <div class="mention-menu" id="mentionMenu">${renderMentionMenu()}</div>
          ${renderToolMenu()}
        `}
      </div>
    </section>`;
}

function renderChatEmptyState(conv) {
  const isGroup = conv?.kind === "group";
  const justJoined = isGroup && conv?.lastText === "你已加入群聊";
  const title = isGroup ? (justJoined ? "已加入群聊，开场吧" : "群聊还没有消息") : "还没有聊天内容";
  const body = isGroup
    ? "发一句欢迎语，或先看看群成员和群设置，让这个群真正热起来。"
    : "先发一句消息，或者从左侧列表继续上一次的对话。";
  return `
    <div class="chat-empty ${isGroup ? "group-empty" : "private-empty"}">
      <div class="chat-empty-art">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(body)}</p>
      <div class="chat-empty-actions">
        ${isGroup ? `
          <button class="ghost-btn inline" type="button" data-sidepage="members">查看成员</button>
          <button class="primary-btn inline" type="button" data-sidepage="settings">群设置</button>
        ` : `
          <button class="ghost-btn inline" type="button" data-sidepage="search">搜索记录</button>
          <button class="primary-btn inline" type="button" data-section="contact">去通讯录</button>
        `}
      </div>
      <div class="chat-empty-meta">${escapeHTML(getConversationHeaderMeta(conv))}</div>
    </div>`;
}

function renderJoinGroupPage() {
  const join = state.pendingJoin;
  const group = join?.group;
  const linkState = groupJoinLinkState(join, state.user);
  const pendingRequest = group ? findPendingJoinRequest(state.data.groupJoinRequests?.[group.id], group.id, state.user) : null;
  const mode = joinModeLabel(group?.joinMode);
  const joinStatus = pendingRequest ? "已申请，请等待管理员审核" : linkState.status || `入群方式：${mode}`;
  const memberCount = group?.members?.length || 0;
  const statusTone = linkState.tone === "danger" ? "danger" : pendingRequest ? "pending" : "ready";
  return `
    <section class="chat-pane join-pane">
      <header class="chat-header">
        <h3>扫码入群</h3>
      </header>
      <div class="join-card">
        <div class="join-card-glow" aria-hidden="true"></div>
        <div class="join-ticket-label">GROUP INVITE</div>
        <div class="join-identity">
          <img class="avatar profile-page-avatar" src="${avatarSrc(group?.avatar || avatar("群"))}" alt="">
          <div>
            <h2>${escapeHTML(group?.title || "正在读取群信息")}</h2>
            <div class="item-meta">群号 ${escapeHTML(group?.chatId || join?.code || "")}</div>
          </div>
        </div>
        <div class="join-status ${statusTone}">${escapeHTML(joinStatus)}</div>
        ${join?.status && join.status !== joinStatus ? `<div class="join-status pending">${escapeHTML(join.status)}</div>` : ""}
        <div class="join-facts">
          <div><span>${memberCount}</span><small>当前成员</small></div>
          <div><span>${escapeHTML(mode)}</span><small>入群方式</small></div>
          <div><span>${pendingRequest ? "待审核" : linkState.canProceed ? "可继续" : "已暂停"}</span><small>当前状态</small></div>
        </div>
        <div class="join-actions">
          <button class="ghost-btn inline" type="button" data-join-link-action="cancel">稍后再说</button>
          ${group && linkState.canProceed && !pendingRequest ? `<button class="primary-btn inline" type="button" data-join-link-action="${escapeAttr(linkState.action)}">${escapeHTML(linkState.actionLabel)}</button>` : ""}
        </div>
      </div>
    </section>`;
}

function renderMessage(message) {
  const conversation = getConversation(message.conversationId || state.selectedConversationId);
  const mine = message.senderId === state.user.id;
  const isGroup = conversation?.kind === "group";
  const roleLabel = mine ? "你" : isGroup ? "群成员" : "对方";
  const senderDisplayName = mine && isGroup ? groupNicknameForConversation(conversation) : mine ? "你" : message.senderName;
  const mentionedMe = !mine && messageMentionsCurrentUser(message);
  const multiSelectActive = state.multiSelect?.conversationId === state.selectedConversationId;
  const selected = Boolean(state.multiSelect?.selectedIds?.includes(message.id));
  const highlighted = state.highlightedMessageId === message.id;
  const group = isGroup ? state.data.groups.find(item => `group-${item.id}` === conversation.id) : null;
  const avatarContactKey = messageAvatarContactKey(message, conversation, state.user.id, groupRoleForCurrentUser(group));
  const senderAvatar = mine ? state.user.avatar : message.senderAvatar;
  const avatarMarkup = `<img class="avatar" src="${avatarSrc(senderAvatar || avatar(message.senderName[0] || "友"))}" alt="">`;
  return `
    <article class="message ${mine ? "me" : "other"} ${isGroup ? "group" : "private"} ${multiSelectActive ? "selecting" : ""} ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""}" data-message-id="${escapeAttr(message.id)}">
      ${avatarContactKey ? `<button class="message-avatar-button" type="button" data-open-contact="${escapeAttr(avatarContactKey)}" aria-label="查看 ${escapeAttr(message.senderName || "联系人")} 的资料">${avatarMarkup}</button>` : avatarMarkup}
      ${multiSelectActive ? `<button class="message-select-toggle ${selected ? "active" : ""}" type="button" data-toggle-message-select="${escapeAttr(message.id)}" aria-label="${selected ? "取消选择" : "选择消息"}">${selected ? "✓" : ""}</button>` : ""}
      <div class="bubble">
        <div class="sender">
          <span class="sender-role">${escapeHTML(roleLabel)}</span>
          <span class="sender-name">${escapeHTML(senderDisplayName)}</span>
          <span class="sender-dot">·</span>
          <span class="sender-time">${formatTime(message.createdAt)}</span>
          ${mentionedMe ? `<span class="mention-badge">@你</span>` : ""}
        </div>
        <div class="message-body">${renderMessageBody(message)}</div>
        ${mine ? renderMessageDeliveryState(message) : ""}
      </div>
    </article>`;
}

function renderMessageDeliveryState(message) {
  if (message.sendStatus === "sending") {
    return `<div class="message-send-state">发送中...</div>`;
  }
  if (message.sendStatus === "failed") {
    return `
      <div class="message-send-state failed">
        <span>${escapeHTML(message.sendError || "发送失败")}</span>
        <button type="button" data-retry-message="${escapeAttr(message.id)}">重试</button>
      </div>`;
  }
  const conversation = getConversation(message.conversationId || state.selectedConversationId);
  const control = readStateControl(message, state.user, conversation);
  if (control.clickable) {
    return `<button class="message-read-state" type="button" data-read-detail="${escapeAttr(message.id)}">${escapeHTML(control.label)}</button>`;
  }
  return `<div class="message-read-state static">${escapeHTML(control.label)}</div>`;
}

function renderMessageBody(message) {
  const quote = renderQuotedMessage(message.quote);
  if (message.type === "image") {
    const url = mediaURL(mediaDisplayUrl(message.attachment?.url, "image"));
    const name = escapeHTML(mediaDisplayName(message, "image"));
    return `
      ${quote}
      <button class="media-card media-card-button" type="button" data-open-image="${escapeAttr(url)}" data-image-name="${name}">
        <img src="${url}" alt="${name}">
        <span class="media-card-overlay">点按查看大图</span>
      </button>`;
  }
  if (message.type === "video") {
    const url = mediaURL(mediaDisplayUrl(message.attachment?.url, "video"));
    const name = escapeAttr(mediaDisplayName(message, "video"));
    if (!isOpenableMediaUrl(url)) {
      return `
          ${quote}
        <div class="media-card file-media-card disabled" aria-disabled="true">
          <span class="file-icon">VIDEO</span>
          <span>${escapeHTML(mediaDisplayName(message, "video"))}</span>
        </div>`;
    }
    return `
      ${quote}
      <video class="media-card" controls src="${escapeAttr(url)}" title="${name}"></video>`;
  }
  if (message.type === "file") {
    const url = mediaURL(message.attachment?.url || "");
    const name = escapeHTML(mediaDisplayName(message, "file"));
    const openable = isOpenableMediaUrl(url);
    if (!openable) {
      return `
        ${quote}
        <div class="message-link message-file disabled" aria-disabled="true">
          <span class="message-link-icon">📄</span>
          <span class="message-link-body">
            <span class="message-link-title">${name}</span>
            <span class="message-link-hint">文件暂不可打开</span>
          </span>
        </div>`;
    }
    return `
      ${quote}
      <a class="message-link message-file" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">
        <span class="message-link-icon">📄</span>
        <span class="message-link-body">
          <span class="message-link-title">${name}</span>
          <span class="message-link-hint">点按打开文件</span>
        </span>
      </a>`;
  }
  if (message.type === "voice") return `${quote}<div>🎙 语音消息 00:${String(message.body || "08").padStart(2, "0")}</div>`;
  if (message.type === "contact") {
    const contact = findContactByName(message.body) || findContactByName(message.senderName);
    const title = escapeHTML(contact?.nickname || message.body || "联系人");
    const subtitle = escapeHTML(contact?.signature || contact?.chatId || "点按查看详情");
    const avatarSrcValue = avatarSrc(contact?.avatar || avatar((contact?.nickname || message.body || "联").slice(0, 1)));
    return `
      ${quote}
      <button class="message-link message-contact" type="button" data-open-contact="${escapeAttr(contact?.nickname || message.body || message.senderName || "")}">
        <img class="message-contact-avatar" src="${avatarSrcValue}" alt="">
        <span class="message-link-body">
          <span class="message-link-title">名片：${title}</span>
          <span class="message-link-hint">${subtitle}</span>
        </span>
      </button>`;
  }
  return `${quote}${renderMessageText(message.body || "")}`;
}

function renderQuotedMessage(quote) {
  if (!quote) return "";
  const clickable = quote.conversationId === state.selectedConversationId && quote.messageId;
  return `
    <button class="quoted-message ${clickable ? "clickable" : ""}" type="button" ${clickable ? `data-jump-quote="${escapeAttr(quote.messageId)}"` : "disabled"}>
      <div class="quoted-message-header">
        <span class="quoted-message-mark">引用</span>
        <span class="quoted-message-author">${escapeHTML(quote.senderName || "引用消息")}</span>
        ${quote.typeLabel ? `<span class="quoted-message-type">${escapeHTML(quote.typeLabel)}</span>` : ""}
      </div>
      <div class="quoted-message-body">${escapeHTML(quote.preview || "")}</div>
    </button>`;
}

function renderReplyComposer() {
  const replyingTo = getCurrentReplyDraft();
  if (!replyingTo) return "";
  return `
    <div class="reply-bar">
      <div class="reply-bar-mark">回复</div>
      <div class="reply-bar-copy">
        <div class="reply-bar-label">${escapeHTML(replyingTo.senderName || "引用消息")}${replyingTo.typeLabel ? ` · ${escapeHTML(replyingTo.typeLabel)}` : ""}</div>
        <div class="reply-bar-body">${escapeHTML(replyingTo.preview || "")}</div>
      </div>
      <button class="icon-btn reply-bar-close" type="button" data-clear-reply title="取消回复" aria-label="取消回复">×</button>
    </div>`;
}

function getConversationHeaderMeta(conv) {
  if (conv.kind === "group") {
    const group = currentGroup();
    const members = group?.members?.length || 0;
    return group?.chatId ? `群号 ${group.chatId} · ${members} 人` : `${members} 人 · 群聊`;
  }
  const updated = conv.lastAt ? formatTime(conv.lastAt) : "";
  return updated ? `最近活跃 ${updated}` : "好友会话";
}

function renderMultiSelectBar() {
  const active = state.multiSelect?.conversationId === state.selectedConversationId;
  if (!active) return "";
  const count = state.multiSelect?.selectedIds?.length || 0;
  return `
    <div class="multi-select-bar">
      <div class="multi-select-summary">
        <span class="multi-select-kicker">批量操作</span>
        <strong>已选 ${count} 条</strong>
      </div>
      <div class="multi-select-actions">
        <button class="multi-select-btn multi-select-btn-cancel" type="button" data-multi-action="cancel">取消</button>
        <button class="multi-select-btn multi-select-btn-forward" type="button" data-multi-action="forward" ${count ? "" : "disabled"}>转发${count ? ` ${count}` : ""}</button>
        <button class="multi-select-btn multi-select-btn-delete" type="button" data-multi-action="delete" ${count ? "" : "disabled"}>删除${count ? ` ${count}` : ""}</button>
      </div>
    </div>`;
}

function renderToolMenu() {
  if (state.toolMenu === "attachments") {
    return `
      <div class="tool-popover">
        <button data-pick-file="image">🖼<br>照片</button>
        <button data-pick-file="video">🎬<br>视频</button>
        <button data-modal="send-contact">👤<br>名片</button>
        <button data-pick-file="file">📄<br>文件</button>
        <button data-sidepage="collections">⭐<br>收藏</button>
      </div>`;
  }
  if (state.toolMenu === "emoji") {
    const categories = emojiCategories();
    const activeCategory = categories.find(category => category.key === state.emojiCategory) || categories[0];
    return `
      <div class="emoji-popover" role="dialog" aria-label="表情">
        <div class="emoji-category-tabs" role="tablist" aria-label="表情分类">
          ${categories.map(category => `
            <button class="emoji-category-tab ${category.key === activeCategory.key ? "active" : ""}" type="button" data-emoji-category="${category.key}" title="${category.label}" aria-label="${category.label}" aria-pressed="${category.key === activeCategory.key}">${category.icon}</button>
          `).join("")}
        </div>
        <div class="emoji-grid" role="list" aria-label="${activeCategory.label}">
          ${activeCategory.items.map(emoji => `<button type="button" data-emoji="${emoji}" aria-label="插入 ${emoji}">${emoji}</button>`).join("")}
        </div>
      </div>`;
  }
  return "";
}

function emojiCategories() {
  const store = ensureStickerStore();
  return [
    { key: "frequent", label: "常用", icon: "🕘", items: uniqueStrings([...store.favorites, ...store.items, "😀", "🥳", "👍", "❤️", "😂", "🙏", "🔥", "🎉", "👏", "😍", "😭", "😎", "🤝", "✅"]) },
    { key: "faces", label: "表情", icon: "😀", items: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😍 🥰 😘 🤔 🤗 🤭 🤫 🤩 😎 🥳 😭 😤 😡 🤯 😴 🤢 🤮 🥺".split(" ") },
    { key: "gestures", label: "手势", icon: "👍", items: "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👏 🙌 🫶 🤝 🙏 💪 👊 ✊ 🤜 🤛 👋 🫡 ✍️ 💅 👀".split(" ") },
    { key: "hearts", label: "心情", icon: "❤️", items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 ❤️‍🩹 💯 💢 💥 💫 ⭐ 🌟 ✨ 🎉 🎊 🔥 ☀️ 🌈".split(" ") },
    { key: "life", label: "生活", icon: "🍀", items: "📌 📣 💬 ✅ ❗ ❓ 💡 🎁 🎂 🍰 ☕ 🍻 🍀 🌹 🌸 🐶 🐱 🐼 🦊 🐯 🚗 ✈️ 📷 🎮".split(" ") }
  ];
}

function renderMentionMenu() {
  if (!currentGroup()) return "";
  if (!state.mention?.open) return "";
  const items = getMentionCandidates(state.mention.query);
  return `
    <div class="mention-menu-title">选择群成员</div>
    <div class="mention-menu-list">
      ${items.length ? items.map((item, index) => `
        <button class="mention-menu-item ${index === (state.mention?.activeIndex || 0) ? "active" : ""}" type="button" data-mention-id="${escapeAttr(item.id)}">
          <img class="avatar" src="${avatarSrc(item.avatar)}" alt="">
          <span class="mention-menu-meta">
            <span class="mention-menu-name">${escapeHTML(item.nickname)}</span>
            <span class="mention-menu-subtitle">${escapeHTML(item.subtitle)}</span>
          </span>
        </button>`).join("") : `<div class="mention-menu-empty">没有匹配的成员</div>`}
    </div>`;
}

function renderMessageContextMenu() {
  if (!state.messageMenu) return "";
  const message = getCurrentMessageById(state.messageMenu.messageId);
  if (!message) return "";
  const canDelete = canDeleteMessage(message, state.user, currentGroup(), { allowMock: state.useMock });
  const canReadDetail = canShowReadDetailAction(message, state.user, getConversation(message.conversationId || state.selectedConversationId));
  const left = Math.max(12, state.messageMenu.x || 0);
  const top = Math.max(12, state.messageMenu.y || 0);
  return `
    <div class="message-context-menu" data-message-menu style="left:${left}px; top:${top}px;">
      <button type="button" data-message-action="forward">转发</button>
      <label data-message-action="quote" for="editor" tabindex="0">引用</label>
      <button type="button" data-message-action="copy">复制</button>
      <button type="button" data-message-action="favorite">收藏</button>
      ${canReadDetail ? `<button type="button" data-message-action="read-detail">已读详情</button>` : ""}
      <button type="button" data-message-action="delete" class="${canDelete ? "" : "disabled"}">删除</button>
      <button type="button" data-message-action="multi">多选</button>
    </div>`;
}

function renderConversationContextMenu() {
  if (!state.conversationMenu) return "";
  const conversation = getConversation(state.conversationMenu.conversationId);
  if (!conversation) return "";
  const left = Math.max(12, state.conversationMenu.x || 0);
  const top = Math.max(12, state.conversationMenu.y || 0);
  return `
    <div class="conversation-context-menu" data-conversation-menu style="left:${left}px; top:${top}px;">
      <button type="button" data-conversation-action="pin">${conversation.pinned ? "取消置顶" : "置顶"}</button>
      <button type="button" data-conversation-action="mute">${conversation.muted ? "取消免打扰" : "免打扰"}</button>
      <button type="button" data-conversation-action="unread">未读</button>
      <button type="button" data-conversation-action="delete">移出列表</button>
    </div>`;
}

function renderDetailPane(conv) {
  if (!conv || !state.sidePage) return "";
  if (!canOpenGroupSidePage(state.sidePage, currentGroupMember())) return renderSettingsPane(conv);
  if (state.sidePage === "settings") return renderSettingsPane(conv);
  if (state.sidePage === "admin") return renderGroupAdminPane();
  if (state.sidePage === "audit-logs") return renderGroupAuditLogsPane();
  if (state.sidePage === "group-blacklist") return renderGroupBlacklistPane();
  if (state.sidePage === "group-bots") return renderGroupBotsPane();
  if (state.sidePage === "rate-limit") return renderGroupRateLimitPane();
  if (state.sidePage === "applications") return renderGroupApplicationsPane();
  if (state.sidePage === "join-mode") return renderGroupJoinModePane();
  if (state.sidePage === "group-admins") return renderGroupAdminsPane();
  if (state.sidePage === "admin-add") return renderAdminAddPane();
  if (state.sidePage === "transfer-owner") return renderTransferOwnerPane();
  if (state.sidePage === "invite-members") return renderInviteMembersPane();
  if (state.sidePage === "announcement") return renderGroupAnnouncementPane();
  if (state.sidePage === "nickname") return renderGroupNicknamePane();
  if (state.sidePage === "rename") return renderGroupNamePane();
  if (state.sidePage === "qrcode") return renderGroupQRCodePane();
  if (state.sidePage === "media") return renderMediaPane();
  if (state.sidePage === "search") return renderSearchPane();
  if (state.sidePage === "read-detail") return renderMessageReadDetailPane();
  if (state.sidePage === "report") return renderReportPane();
  if (state.sidePage === "collections") return renderCollectionsPane();
  if (state.sidePage === "members") return renderMembersPane();
  return renderSettingsPane(conv);
}

function renderSettingsPane(conv) {
  const group = currentGroup();
  const canManage = canManageGroup(group);
  if (group && !canManage) return renderRegularGroupMemberSettingsPane(conv);
  if (group && currentGroupMember(group)?.role === "admin") return renderAdminGroupSettingsPane(conv, group);
  const pendingApplications = pendingGroupJoinRequestCount(state.data.groupJoinRequests?.[group?.id]);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn detail-mobile-back" data-mobile-close title="返回聊天" aria-label="返回聊天">${icons.back}</button><h3>聊天设置</h3></header>
      <section class="section conversation-profile-card">
        <div class="conversation-profile-head">
          <img class="avatar" src="${avatarSrc(conv.avatar)}" alt="">
          <div class="conversation-profile-copy">
            <div class="item-title">${escapeHTML(conv.title)}</div>
            <div class="item-preview">${escapeHTML(getConversationHeaderMeta(conv))}</div>
            ${group ? `<div class="conversation-profile-code">群号 ${escapeHTML(group.chatId)}</div>` : ""}
          </div>
        </div>
        <div class="conversation-profile-stats">
          <span>${group ? `${group.members.length} 人` : "好友会话"}</span>
          <span>${conv.unread ? `${conv.unread > 99 ? "99+" : conv.unread} 未读` : "已读"}</span>
          <span>${conv.muted ? "免打扰" : "通知开启"}</span>
        </div>
        ${group ? `
          <div class="conversation-control-strip">
            <button type="button" data-sidepage="members"><strong>${group.members.length}</strong><small>成员</small></button>
            ${canManage ? `<button type="button" data-sidepage="join-mode"><strong>${escapeHTML(joinModeShortLabel(group.joinMode))}</strong><small>入群</small></button>` : ""}
            ${canManage ? `<button type="button" data-sidepage="applications"><strong>${pendingApplications || "0"}</strong><small>申请</small></button>` : ""}
            <button type="button" data-conversation-quick="mute"><strong>${conv.muted ? "关" : "开"}</strong><small>通知</small></button>
          </div>
        ` : ""}
      </section>
      <section class="section">
        <div class="section-title-row"><h3>会话</h3></div>
        ${group && canManage ? settingLink("join-mode", "入群方式", joinModeLabel(group.joinMode)) : `<div class="setting-row"><span>入群方式</span><strong>${escapeHTML(group ? joinModeLabel(group.joinMode) : "好友会话")}</strong></div>`}
        <button class="setting-row setting-toggle-row" type="button" data-conversation-quick="mute"><span>消息免打扰</span><span class="switch ${conv.muted ? "on" : "off"}"></span></button>
        <button class="setting-row setting-toggle-row" type="button" data-conversation-quick="pin"><span>置顶聊天</span><span class="switch ${conv.pinned ? "on" : "off"}"></span></button>
      </section>
      ${group ? `
        <section class="section">
          <h3>群组</h3>
          ${settingLink("members", "群成员", `${group.members.length} 人`)}
          ${canManage ? settingLink("admin", "群组管理", "管理员与权限") : ""}
          ${canManage ? settingLink("applications", "入群申请", pendingApplications ? `${pendingApplications} 条待处理` : "近期请求") : ""}
          ${canManage ? settingLink("rename", "群组名称", group.title) : ""}
          ${settingLink("announcement", "群公告", group.announcement || "未设置")}
          ${settingLink("qrcode", "群二维码", `群号 ${group.chatId}`)}
          ${settingLink("nickname", "我在本群的昵称", groupNicknameForConversation(conv))}
        </section>` : ""}
      <section class="section">
        <h3>内容</h3>
        ${settingLink("media", "图片与视频", "全部 / 图片 / 视频 / 档案")}
        ${settingLink("search", "搜索聊天记录", "关键词查找")}
        ${settingLink("collections", "我的收藏", "文字 / 文件 / 语音")}
      </section>
      <section class="section">
        ${settingButton("clear-chat", "清除聊天记录", "danger-btn inline")}
        ${group && canLeaveGroup(currentGroupMember(group)) ? settingButton("leave-group", "退出群聊", "danger-btn inline") : ""}
        ${group && isCurrentUserOwner(group) ? settingButton("dissolve-group", "解散群", "danger-btn inline") : ""}
        ${settingLink("report", "检举", "提交违规原因")}
      </section>
    </aside>`;
}

function renderAdminGroupSettingsPane(conv, group) {
  const settingKeys = new Set(adminGroupSettingKeys());
  const pendingApplications = pendingGroupJoinRequestCount(state.data.groupJoinRequests?.[group.id]);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn detail-mobile-back" data-mobile-close title="返回聊天" aria-label="返回聊天">${icons.back}</button><h3>聊天设置</h3></header>
      <section class="section conversation-profile-card">
        <div class="conversation-profile-head">
          <img class="avatar" src="${avatarSrc(conv.avatar)}" alt="">
          <div class="conversation-profile-copy">
            <div class="item-title">${escapeHTML(conv.title)}</div>
            <div class="item-preview">${escapeHTML(getConversationHeaderMeta(conv))}</div>
            <div class="conversation-profile-code">群号 ${escapeHTML(group.chatId)}</div>
          </div>
        </div>
        <div class="conversation-profile-stats">
          <span>${group.members.length} 人</span>
          <span>${conv.unread ? `${conv.unread > 99 ? "99+" : conv.unread} 未读` : "已读"}</span>
          <span>${conv.muted ? "免打扰" : "通知开启"}</span>
        </div>
      </section>
      <section class="section">
        <h3>群组</h3>
        ${settingKeys.has("admin") ? settingLink("admin", "群组管理", "管理员与权限") : ""}
        ${settingKeys.has("applications") ? settingLink("applications", "入群申请", pendingApplications ? `${pendingApplications} 条待处理` : "近期请求") : ""}
        ${settingKeys.has("join-mode") ? settingLink("join-mode", "入群方式", joinModeLabel(group.joinMode)) : ""}
        ${settingKeys.has("announcement") ? settingLink("announcement", "群公告", group.announcement || "未设置") : ""}
        ${settingKeys.has("qrcode") ? settingLink("qrcode", "群二维码", `群号 ${group.chatId}`) : ""}
        ${settingKeys.has("nickname") ? settingLink("nickname", "我在本群的昵称", groupNicknameForConversation(conv)) : ""}
      </section>
      <section class="section">
        <h3>内容</h3>
        ${settingKeys.has("media") ? settingLink("media", "图片与视频", "全部 / 图片 / 视频 / 档案") : ""}
        ${settingKeys.has("search") ? settingLink("search", "搜索聊天记录", "关键词查找") : ""}
      </section>
      <section class="section">
        ${settingKeys.has("clear-chat") ? settingButton("clear-chat", "清除聊天记录", "danger-btn inline") : ""}
        ${settingKeys.has("mute") ? `<button class="setting-row setting-toggle-row" type="button" data-conversation-quick="mute"><span>消息免打扰</span><span class="switch ${conv.muted ? "on" : "off"}"></span></button>` : ""}
        ${settingKeys.has("pin") ? `<button class="setting-row setting-toggle-row" type="button" data-conversation-quick="pin"><span>置顶聊天</span><span class="switch ${conv.pinned ? "on" : "off"}"></span></button>` : ""}
        ${settingKeys.has("report") ? settingLink("report", "检举", "提交违规原因") : ""}
      </section>
    </aside>`;
}

function renderRegularGroupMemberSettingsPane(conv) {
  const settingKeys = new Set(regularGroupMemberSettingKeys());
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn detail-mobile-back" data-mobile-close title="返回聊天" aria-label="返回聊天">${icons.back}</button><h3>聊天设置</h3></header>
      <section class="section">
        ${settingKeys.has("media") ? settingLink("media", "图片与视频", "全部 / 图片 / 视频 / 档案") : ""}
        ${settingKeys.has("burn-after-read") ? `<button class="setting-row setting-toggle-row" type="button" data-conversation-quick="burn-after-read"><span>阅后即焚</span><span class="switch ${conv.burnAfterRead ? "on" : "off"}"></span></button>` : ""}
        ${settingKeys.has("mute") ? `<button class="setting-row setting-toggle-row" type="button" data-conversation-quick="mute"><span>消息免打扰</span><span class="switch ${conv.muted ? "on" : "off"}"></span></button>` : ""}
        ${settingKeys.has("pin") ? `<button class="setting-row setting-toggle-row" type="button" data-conversation-quick="pin"><span>置顶聊天</span><span class="switch ${conv.pinned ? "on" : "off"}"></span></button>` : ""}
      </section>
      <section class="section">
        ${settingKeys.has("search") ? settingLink("search", "搜索聊天记录", "关键词查找") : ""}
        ${settingKeys.has("clear-chat") ? settingButton("clear-chat", "清除聊天记录", "danger-btn inline") : ""}
      </section>
      <section class="section">
        ${settingKeys.has("report") ? settingLink("report", "检举", "提交违规原因") : ""}
      </section>
    </aside>`;
}

function settingLink(page, label, value) {
  return `<a class="setting-row" href="#" data-sidepage="${page}"><span>${label}</span><span class="item-meta">${escapeHTML(value)}</span></a>`;
}

function settingButton(action, label, klass) {
  return `<div class="setting-row"><span>${label}</span><button class="${klass}" data-action="${action}">${label}</button></div>`;
}

function joinModeShortLabel(joinMode) {
  if (joinMode === "approval") return "审核";
  if (joinMode === "closed") return "关闭";
  return "公开";
}

function renderMembersPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const mentionStats = getGroupMentionStats(group);
  const canManage = canManageGroup(group);
  const currentMember = currentGroupMember(group);
  const adminCount = group.members.filter(member => ["owner", "admin"].includes(member.role)).length;
  const mutedCount = group.members.filter(member => member.muted).length;
  const members = [...group.members].sort((a, b) => {
    const countA = mentionStats[a.userId] || 0;
    const countB = mentionStats[b.userId] || 0;
    if (countA !== countB) return countB - countA;
    if (a.role === "owner") return -1;
    if (b.role === "owner") return 1;
    return (a.nickname || "").localeCompare(b.nickname || "", "zh-Hans-CN");
  });
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>群聊成员</h3>${canManage ? `<button class="ghost-btn inline" data-sidepage="invite-members">新增</button>` : ""}</header>
      <section class="section members-overview">
        <div class="members-overview-main">
          <img class="avatar" src="${avatarSrc(group.avatar)}" alt="">
          <div>
            <h3>${escapeHTML(group.title)}</h3>
            <p>群号 ${escapeHTML(group.chatId)} · ${escapeHTML(joinModeLabel(group.joinMode))}</p>
          </div>
        </div>
        <div class="members-stats">
          <span><strong>${members.length}</strong><small>成员</small></span>
          <span><strong>${adminCount}</strong><small>管理</small></span>
          <span><strong>${mutedCount}</strong><small>禁言</small></span>
        </div>
      </section>
      <div class="list members-list">
        ${members.map(m => {
          const mentionCount = mentionStats[m.userId] || 0;
          const manageable = canManage && canManageMember(currentMember, m);
          return `
          <article class="list-item member-card ${m.muted ? "muted" : ""}">
            <img class="avatar" src="${avatarSrc(avatar(m.nickname[0] || "成"))}" alt="">
            <div class="member-copy">
              <div class="member-title-row">
                <div class="item-title">${escapeHTML(m.nickname)}</div>
                <span class="member-role ${escapeAttr(m.role || "member")}">${escapeHTML(memberRoleLabel(m.role))}</span>
              </div>
              <div class="item-preview">${escapeHTML(memberStatusText(m, mentionCount))}</div>
            </div>
            <div class="icon-row member-actions">
              ${mentionCount ? `<button class="mention-badge list" type="button" data-search-member="${escapeAttr(m.nickname)}">被@${mentionCount}</button>` : ""}
              ${manageable ? `<button class="ghost-btn inline" data-member-action="mute" data-member-id="${m.userId}" data-muted="${m.muted ? "false" : "true"}">${m.muted ? "解除禁言" : "禁言"}</button>` : ""}
              ${manageable ? `<button class="danger-btn inline" data-member-action="remove" data-member-id="${m.userId}">移除</button>` : ""}
            </div>
          </article>`;
        }).join("")}
      </div>
    </aside>`;
}

function memberRoleLabel(role) {
  if (role === "owner") return "群主";
  if (role === "admin") return "管理员";
  return "成员";
}

function renderGroupAdminPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>群组管理</h3></header>
      <section class="section">
        ${settingLink("group-admins", "群组管理员", `${group.members.filter(member => ["owner", "admin"].includes(member.role)).length} 人`)}
        <button class="setting-row setting-toggle-row" type="button" data-group-toggle="disableMemberAddFriend" ${canManage ? "" : "disabled"}>
          <span class="setting-copy"><span>禁止群成员互加好友</span><span class="item-meta">开启后，成员名片里不会提供加好友入口。</span></span>
          <span class="switch ${group.disableMemberAddFriend ? "on" : "off"}"></span>
        </button>
        <button class="setting-row setting-toggle-row" type="button" data-group-toggle="allMuted" ${canManage ? "" : "disabled"}>
          <span class="setting-copy"><span>全员禁言</span><span class="item-meta">开启后，普通成员无法在本群发送消息。</span></span>
          <span class="switch ${group.allMuted ? "on" : "off"}"></span>
        </button>
        <button class="setting-row setting-toggle-row" type="button" data-group-toggle="autoMuteNewMembers" ${canManage ? "" : "disabled"}>
          <span class="setting-copy"><span>新成员入群自动禁言</span><span class="item-meta">开启后，新普通成员入群后需管理员解除禁言。</span></span>
          <span class="switch ${group.autoMuteNewMembers ? "on" : "off"}"></span>
        </button>
        ${canManage ? settingLink("rate-limit", "发言频率限制", groupRateLimitLabel(group.rateLimit)) : ""}
        ${canManage ? settingLink("group-bots", "群机器人", groupBotSummary(group)) : ""}
        ${canManage ? settingLink("group-blacklist", "群黑名单", "禁止再次入群") : ""}
        ${canManage ? settingLink("audit-logs", "操作日志", "管理动作记录") : ""}
      </section>
    </aside>`;
}

function renderGroupBotsPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const bots = state.data.groupBots?.[group.id] || [defaultGroupBot(group.id)];
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="admin">${icons.back}</button><h3>群机器人</h3>${canManage ? `<button class="ghost-btn inline" data-bot-create>新增</button>` : ""}</header>
      ${canManage ? `
        <section class="section">
          <div class="item-meta">启用后，机器人会按设定计划在本群发送真实消息。当前先支持公告机器人。</div>
        </section>
        <div class="list">
          ${bots.map(bot => `
            <article class="bot-card">
              <div class="bot-card-head">
                <div class="bot-avatar">公</div>
                <div>
                  <div class="item-title">${escapeHTML(bot.name || "公告机器人")}</div>
                  <div class="item-preview">${bot.enabled ? `已启用 · 下次发送 ${formatTime(bot.nextRunAt)}` : "已停用"}</div>
                </div>
                <button class="setting-toggle-row bot-switch" type="button" data-bot-toggle="${escapeAttr(bot.id)}">
                  <span class="switch ${bot.enabled ? "on" : "off"}"></span>
                </button>
              </div>
              <label class="field-label" for="botName-${escapeAttr(bot.id)}">机器人名称</label>
              <input class="input" id="botName-${escapeAttr(bot.id)}" maxlength="20" value="${escapeAttr(bot.name || "公告机器人")}" placeholder="请输入机器人名称">
              <label class="field-label" for="botMessage-${escapeAttr(bot.id)}">自动发送内容</label>
              <textarea class="textarea" id="botMessage-${escapeAttr(bot.id)}" maxlength="200" placeholder="请输入机器人自动发送内容">${escapeHTML(bot.message || "")}</textarea>
              <div class="bot-rule-list">
                <div class="field-label">关键词回复（最多 3 条）</div>
                ${[0, 1, 2].map(index => {
                  const rule = bot.keywordRules?.[index] || {};
                  return `
                    <div class="bot-rule-row">
                      <input class="input" id="botKeyword-${escapeAttr(bot.id)}-${index}" maxlength="20" value="${escapeAttr(rule.keyword || "")}" placeholder="关键词">
                      <input class="input" id="botReply-${escapeAttr(bot.id)}-${index}" maxlength="100" value="${escapeAttr(rule.reply || "")}" placeholder="自动回复内容">
                    </div>`;
                }).join("")}
              </div>
              <div class="segmented-row" role="group" aria-label="发送计划">
                ${[
                  { mode: "interval", label: "间隔发送" },
                  { mode: "daily", label: "每日固定时间" }
                ].map(option => `
                  <button class="chip ${(bot.scheduleMode || "interval") === option.mode ? "active" : ""}" type="button" data-bot-mode="${escapeAttr(bot.id)}" data-mode="${option.mode}">
                    ${option.label}
                  </button>`).join("")}
              </div>
              ${(bot.scheduleMode || "interval") === "daily" ? `
                <label class="field-label" for="botDailyTime-${escapeAttr(bot.id)}">每日发送时间</label>
                <input class="input" id="botDailyTime-${escapeAttr(bot.id)}" type="time" value="${escapeAttr(bot.dailyTime || "20:00")}">
              ` : `
              <div class="segmented-row" role="group" aria-label="发送间隔">
                ${[60, 300].map(seconds => `
                  <button class="chip ${bot.intervalSeconds === seconds ? "active" : ""}" type="button" data-bot-interval="${escapeAttr(bot.id)}" data-seconds="${seconds}">
                    ${seconds === 60 ? "每 1 分钟" : "每 5 分钟"}
                  </button>`).join("")}
              </div>`}
              <div class="bot-actions">
                <button class="primary-btn inline" type="button" data-bot-save="${escapeAttr(bot.id)}">保存机器人设置</button>
                <button class="ghost-btn inline" type="button" data-bot-run="${escapeAttr(bot.id)}">立即测试发送</button>
                ${bot.id !== "announcement" ? `<button class="danger-btn inline" type="button" data-bot-delete="${escapeAttr(bot.id)}">删除机器人</button>` : ""}
              </div>
            </article>`).join("")}
        </div>
      ` : `<div class="empty-state">只有群主和管理员可以管理群机器人</div>`}
    </aside>`;
}

function renderGroupRateLimitPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const options = [
    { key: "off", title: "关闭限制", desc: "普通成员不限制发言频率。", value: null },
    { key: "fast", title: "每 10 秒最多 3 条", desc: "适合临时防刷屏。", value: { enabled: true, windowSeconds: 10, maxMessages: 3 } },
    { key: "steady", title: "每 60 秒最多 10 条", desc: "适合长期保持群内节奏。", value: { enabled: true, windowSeconds: 60, maxMessages: 10 } }
  ];
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="admin">${icons.back}</button><h3>发言频率限制</h3></header>
      <section class="section">
        <div class="item-meta">只限制普通成员，群主和管理员不受影响。</div>
        ${options.map(option => `
          <button class="setting-row setting-toggle-row" type="button" data-rate-limit="${option.key}" ${canManage ? "" : "disabled"}>
            <span class="setting-copy"><span>${option.title}</span><span class="item-meta">${option.desc}</span></span>
            <span class="switch ${groupRateLimitKey(group.rateLimit) === option.key ? "on" : "off"}"></span>
          </button>`).join("")}
      </section>
    </aside>`;
}

function renderGroupBlacklistPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const entries = state.data.groupBlacklists?.[group.id];
  const blockedIds = new Set((entries || []).map(entry => entry.user.id));
  const candidates = group.members.filter(member => {
    if (member.role === "owner") return false;
    if (blockedIds.has(member.userId)) return false;
    if (!isCurrentUserOwner(group) && member.role !== "member") return false;
    return true;
  });
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="admin">${icons.back}</button><h3>群黑名单</h3></header>
      ${canManage ? `
        <section class="section">
          <div class="item-meta">加入黑名单后，对方会被移出本群，且不能再次申请入群或被邀请入群。</div>
        </section>
        <section class="section">
          <h3>已拉黑</h3>
          <div class="list nested-list">
            ${entries ? entries.map(entry => `
              <article class="list-item">
                <img class="avatar" src="${avatarSrc(entry.user.avatar || avatar((entry.user.nickname || "黑").slice(0, 1)))}" alt="">
                <div>
                  <div class="item-title">${escapeHTML(entry.user.nickname || entry.user.chatId || "黑名单成员")}</div>
                  <div class="item-preview">${escapeHTML(groupBlacklistEntrySummary(entry, formatTime))}</div>
                </div>
                <button class="ghost-btn inline" type="button" data-unblacklist-member="${escapeAttr(entry.user.id)}">解除</button>
              </article>`).join("") || `<div class="empty-state">暂无黑名单成员</div>` : `<div class="empty-state">正在加载黑名单...</div>`}
          </div>
        </section>
        <section class="section">
          <h3>从群成员中加入</h3>
          <div class="list nested-list">
            ${candidates.map(member => `
              <article class="list-item">
                <img class="avatar" src="${avatarSrc(avatar((member.nickname || "成").slice(0, 1)))}" alt="">
                <div><div class="item-title">${escapeHTML(member.nickname)}</div><div class="item-preview">${member.role === "admin" ? "管理员" : "群成员"}</div></div>
                <button class="danger-btn inline" type="button" data-blacklist-member="${escapeAttr(member.userId)}">拉黑</button>
              </article>`).join("") || `<div class="empty-state">暂无可加入黑名单的成员</div>`}
          </div>
        </section>
      ` : `<div class="empty-state">只有群主和管理员可以查看群黑名单</div>`}
    </aside>`;
}

function renderGroupAuditLogsPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const logs = state.data.auditLogs?.[group.id];
  const sortedLogs = sortAuditLogs(logs);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="admin">${icons.back}</button><h3>操作日志</h3></header>
      ${canManage ? `
        <div class="list">
          ${logs ? sortedLogs.map(log => `
            <article class="list-item">
              <div class="audit-dot"></div>
              <div>
                <div class="item-title">${escapeHTML(auditActionLabel(log.action))}</div>
                <div class="item-preview">${escapeHTML(auditLogSentence(log))}</div>
                <div class="item-meta">${escapeHTML(formatTime(log.createdAt))}</div>
              </div>
            </article>`).join("") || `<div class="empty-state">暂无操作日志</div>` : `<div class="empty-state">正在加载操作日志...</div>`}
        </div>
      ` : `<div class="empty-state">只有群主和管理员可以查看操作日志</div>`}
    </aside>`;
}

function renderGroupAdminsPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const admins = group.members.filter(member => ["owner", "admin"].includes(member.role));
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="admin">${icons.back}</button><h3>群组管理员</h3>${isCurrentUserOwner(group) ? `<button class="ghost-btn inline" data-sidepage="admin-add">新增</button>` : ""}</header>
      <div class="list">
        ${admins.map(member => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar((member.nickname || "管").slice(0, 1)))}" alt="">
            <div><div class="item-title">${escapeHTML(member.nickname)}</div><div class="item-preview">${member.role === "owner" ? "群主" : "管理员"}</div></div>
            ${member.role === "admin" && isCurrentUserOwner(group) ? `<button class="ghost-btn inline" data-member-role="${escapeAttr(member.userId)}" data-role="member">移除管理员</button>` : ""}
          </article>`).join("")}
      </div>
      <section class="section">
        <h3>群管理员可以拥有以下能力</h3>
        <div class="item-preview">批准入群申请、禁言/解禁用户、删除群成员、编辑群公告、修改群组名称和群头像。</div>
      </section>
      ${isCurrentUserOwner(group) ? `<section class="section">${settingLink("transfer-owner", "群主转让", "选择新群主")}</section>` : ""}
    </aside>`;
}

function renderAdminAddPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const candidates = group.members.filter(member => member.role === "member");
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="group-admins">${icons.back}</button><h3>新增群组管理员</h3></header>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="搜索"></div>
      <div class="list">
        ${candidates.filter(member => !state.query || member.nickname.toLowerCase().includes(state.query.toLowerCase())).map(member => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar((member.nickname || "成").slice(0, 1)))}" alt="">
            <div><div class="item-title">${escapeHTML(member.nickname)}</div><div class="item-preview">群成员</div></div>
            <button class="primary-btn inline" data-member-role="${escapeAttr(member.userId)}" data-role="admin">设为管理员</button>
          </article>`).join("") || `<div class="empty-state">查无符合条件的成员</div>`}
      </div>
    </aside>`;
}

function renderTransferOwnerPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  if (!isCurrentUserOwner(group)) {
    return `
      <aside class="detail-pane">
        <header class="panel-header"><button class="icon-btn" data-sidepage="group-admins">${icons.back}</button><h3>群主转让</h3></header>
        <div class="empty-state">只有群主可以转让群主身份</div>
      </aside>`;
  }
  const candidates = group.members.filter(member => member.userId !== state.user?.id);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="group-admins">${icons.back}</button><h3>群主转让</h3></header>
      <section class="section">
        <div class="item-meta">${escapeHTML(ownerTransferHint())}</div>
      </section>
      <div class="list">
        ${candidates.map(member => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar((member.nickname || "成").slice(0, 1)))}" alt="">
            <div><div class="item-title">${escapeHTML(member.nickname)}</div><div class="item-preview">${member.role === "admin" ? "管理员" : "群成员"}</div></div>
            <button class="danger-btn inline" type="button" data-transfer-owner="${escapeAttr(member.userId)}">转让</button>
          </article>`).join("") || `<div class="empty-state">暂无可转让成员</div>`}
      </div>
    </aside>`;
}

function renderGroupApplicationsPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const requests = state.data.groupJoinRequests?.[group.id];
  const visible = (requests || []).filter(request => request.status === "pending");
  const pendingCount = visible.length;
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>入群申请</h3></header>
      <section class="section">
        <div class="applications-overview">
          <div class="applications-meter">
            <strong>${requests ? pendingCount : "..."}</strong>
            <span>待处理</span>
          </div>
          <div>
            <span class="applications-kicker">当前入群方式</span>
            <h3>${escapeHTML(joinModeLabel(group.joinMode))}</h3>
            <p>${canManage ? "新的申请会集中在这里，处理后会同步给申请人。" : "你可以查看当前状态，但不能处理申请。"}</p>
          </div>
        </div>
      </section>
      ${canManage ? `
        <div class="applications-list">
          ${requests ? visible.map(request => `
            <article class="join-application-card">
              <img class="avatar" src="${avatarSrc(request.user.avatar || avatar((request.user.nickname || "访").slice(0, 1)))}" alt="">
              <div class="join-application-main">
                <div class="join-application-title">
                  <strong>${escapeHTML(request.user.nickname || "申请人")}</strong>
                  <span>${formatTime(request.createdAt)}</span>
                </div>
                <p>${escapeHTML(request.greeting || "申请加入群聊")}</p>
              </div>
              <div class="join-application-actions">
                <button class="ghost-btn inline" type="button" data-review-join="${escapeAttr(request.id)}" data-status="rejected">拒绝</button>
                <button class="primary-btn inline" type="button" data-review-join="${escapeAttr(request.id)}" data-status="accepted">同意</button>
              </div>
            </article>`).join("") || `<div class="applications-empty"><strong>暂无待处理申请</strong><span>新的入群请求会出现在这里。</span></div>` : `<div class="applications-empty"><strong>正在加载申请</strong><span>稍等一下，审核台马上就绪。</span></div>`}
        </div>
      ` : `<div class="applications-empty locked"><strong>暂无处理权限</strong><span>只有群主和管理员可以处理入群申请。</span></div>`}
    </aside>`;
}

function renderGroupJoinModePane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const activeMode = joinModeLabel(group.joinMode);
  const modes = [
    { value: "public_qr", title: "公开群（扫码入群）", desc: "扫码后直接成为成员，适合公开招募和活动群。", tone: "最快加入" },
    { value: "approval", title: "需要审核", desc: "申请会进入入群申请列表，群主或管理员同意后入群。", tone: "更稳妥" },
    { value: "closed", title: "禁止入群", desc: "关闭新的入群申请，只保留现有成员访问。", tone: "暂停开放" }
  ];
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>入群方式</h3></header>
      <section class="section">
        <div class="join-mode-overview">
          <span class="join-mode-badge">当前策略</span>
          <div>
            <h3>${escapeHTML(activeMode)}</h3>
            <p>${canManage ? "你可以随时切换群聊的开放程度。" : "只有群主和管理员可以调整，当前状态仍可查看。"}</p>
          </div>
        </div>
        <div class="join-mode-options">
        ${modes.map(mode => `
          <button class="join-mode-card ${group.joinMode === mode.value ? "active" : ""}" type="button" data-join-mode="${mode.value}" ${canManage ? "" : "disabled"}>
            <span class="join-mode-card-copy">
              <span class="join-mode-card-title">${mode.title}</span>
              <span class="join-mode-card-desc">${mode.desc}</span>
            </span>
            <span class="join-mode-card-state">
              <small>${mode.tone}</small>
              <span class="switch ${group.joinMode === mode.value ? "on" : "off"}"></span>
            </span>
          </button>`).join("")}
        </div>
        ${canManage ? "" : `<div class="join-mode-note">只有群主和管理员可以修改入群方式。</div>`}
      </section>
    </aside>`;
}

function renderGroupAnnouncementPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  const value = group.announcement || "";
  const preview = value || "还没有公告。可以写下欢迎语、群规则或最近要提醒大家的事情。";
  if (!canManage) {
    return `
      <aside class="detail-pane">
        <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>群公告</h3></header>
        <section class="section announcement-reader ${value ? "" : "empty"}">
          <span class="announcement-kicker">群公告</span>
          <p>${escapeHTML(preview)}</p>
        </section>
      </aside>`;
  }
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>群公告</h3></header>
      <section class="section">
        <div class="announcement-board ${value ? "" : "empty"}">
          <span class="announcement-kicker">群公告预览</span>
          <p>${escapeHTML(preview)}</p>
        </div>
        <div class="announcement-editor">
          <label class="announcement-label" for="groupAnnouncementInput">
            <span>公告内容</span>
            <small>${value.length}/500</small>
          </label>
          <textarea class="textarea announcement-textarea" id="groupAnnouncementInput" maxlength="500" placeholder="写下群规则、欢迎语或近期提醒" ${canManage ? "" : "disabled"}>${escapeHTML(value)}</textarea>
          ${canManage ? `<button class="primary-btn inline announcement-save" type="button" data-group-save="announcement">保存公告</button>` : `<div class="announcement-note">只有群主和管理员可以编辑群公告。</div>`}
        </div>
      </section>
    </aside>`;
}

function renderGroupNicknamePane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const value = groupNicknameForConversation(getConversation(state.selectedConversationId));
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>修改群昵称</h3></header>
      <section class="section">
        <div class="group-nickname-card">
          <img class="avatar profile-page-avatar" src="${avatarSrc(state.user.avatar || avatar((value || "我").slice(0, 1)))}" alt="">
          <div>
            <span class="group-nickname-kicker">群内显示名</span>
            <strong>${escapeHTML(value)}</strong>
            <small>${escapeHTML(group.title)} 中会这样显示你</small>
          </div>
        </div>
        <p class="group-nickname-scope">仅影响当前群聊。私聊会显示账号昵称，其他群聊需要在对应群里分别设置。</p>
        <div class="group-nickname-editor">
          <label class="announcement-label" for="groupNicknameInput">
            <span>群昵称</span>
            <small>${value.length}/15</small>
          </label>
          <input class="input group-nickname-input" id="groupNicknameInput" maxlength="15" value="${escapeAttr(value)}" placeholder="群昵称最多 15 个字">
          <button class="primary-btn inline group-nickname-save" type="button" data-group-save="nickname">保存昵称</button>
        </div>
      </section>
    </aside>`;
}

function renderGroupNamePane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const canManage = canManageGroup(group);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>群组名称</h3></header>
      <section class="section">
        <p class="group-setting-help">修改后会同步到左侧会话列表、聊天顶部和群设置标题。</p>
        <input class="input" id="groupNameInput" value="${escapeAttr(group.title)}" placeholder="群组名称" ${canManage ? "" : "disabled"}>
        ${canManage ? `<button class="primary-btn inline group-name-save" type="button" data-group-save="name">保存群名称</button>` : `<div class="item-meta">只有群主和管理员可以修改群组名称。</div>`}
      </section>
    </aside>`;
}

function renderGroupQRCodePane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const inviteText = groupQrText(group);
  const expired = isGroupQrExpired(group);
  const expiryLabel = groupQrExpiryLabel(group);
  const canManage = canManageGroup(group);
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>群二维码</h3></header>
      <div class="card qrcode-card group-qrcode-card group-invite-ticket">
        <div class="group-invite-head">
          <img class="avatar profile-page-avatar" src="${avatarSrc(group.avatar)}" alt="">
          <div>
            <span class="group-invite-kicker">扫码加入群聊</span>
            <strong>${escapeHTML(group.title)}</strong>
            <small>${escapeHTML(joinModeLabel(group.joinMode))}</small>
          </div>
        </div>
        <div class="group-qr-frame">
          ${qrCodeBox(inviteText, "群二维码")}
        </div>
        <div class="group-qr-facts">
          <span><strong>${escapeHTML(group.chatId)}</strong><small>群号</small></span>
          <span><strong>${escapeHTML(groupJoinCode(group))}</strong><small>入群码</small></span>
          <span class="${expired ? "danger-text-row" : ""}"><strong>${escapeHTML(expiryLabel)}</strong><small>有效期</small></span>
        </div>
        ${canManage ? `
          <label class="group-qr-expiry" for="groupQrExpiryMode">
            <span>二维码有效期</span>
            <select class="select" id="groupQrExpiryMode">
              <option value="7d" ${groupQrExpiryMode(group) === "7d" ? "selected" : ""}>7 天</option>
              <option value="1d" ${groupQrExpiryMode(group) === "1d" ? "selected" : ""}>1 天</option>
              <option value="permanent" ${groupQrExpiryMode(group) === "permanent" ? "selected" : ""}>永久</option>
            </select>
          </label>
        ` : ""}
        <div class="group-qr-actions">
          <button class="ghost-btn inline" type="button" data-copy="${escapeAttr(inviteText)}">分享</button>
          ${canManage ? `<button class="ghost-btn inline" type="button" data-group-save="refresh-qrcode">刷新二维码</button>` : ""}
          <button class="primary-btn inline" type="button" data-group-save="qrcode">保存</button>
        </div>
      </div>
    </aside>`;
}

function groupQrText(group) {
  const origin = window.location.origin || "http://localhost:5174";
  return `${origin}/?joinGroup=${encodeURIComponent(group.id)}&code=${encodeURIComponent(groupJoinCode(group))}`;
}

function groupQrExpiryMode(group) {
  if (!group?.qrCodeExpiresAt) return "permanent";
  const expiresAt = new Date(group.qrCodeExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return "7d";
  const hoursLeft = (expiresAt.getTime() - Date.now()) / (60 * 60 * 1000);
  return hoursLeft <= 36 ? "1d" : "7d";
}

function mockGroupQrExpiry(mode) {
  if (mode === "permanent") return null;
  const days = mode === "1d" ? 1 : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function qrCodeBox(text, label) {
  return `<div class="qrcode-real" data-qr-code data-qr-text="${escapeAttr(text)}" aria-label="${escapeAttr(label)}"><span>正在生成二维码...</span></div>`;
}

function parseJoinLink() {
  const params = new URLSearchParams(window.location.search);
  const groupId = params.get("joinGroup");
  if (!groupId) return null;
  return {
    groupId,
    code: params.get("code") || "",
    status: "",
    group: null
  };
}

function parseJoinInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return { groupId: "", code: "" };
  try {
    const url = new URL(raw, window.location.origin);
    const groupId = url.searchParams.get("joinGroup") || url.searchParams.get("groupId") || "";
    const code = url.searchParams.get("code") || "";
    if (groupId || code) return { groupId: groupId || code, code };
  } catch (_) {
    // Plain group IDs and QR codes are accepted below.
  }
  return { groupId: raw, code: "" };
}

async function preparePendingJoin() {
  if (!state.pendingJoin || !state.data) return;
  const group = await resolveJoinGroup(state.pendingJoin.groupId);
  state.pendingJoin.group = group;
  if (!group) {
    state.pendingJoin.status = "未找到该群聊";
    return;
  }
  if (state.pendingJoin.code && groupJoinCode(group) !== state.pendingJoin.code) {
    state.pendingJoin.status = "二维码已失效或群号不匹配";
    return;
  }
  if (state.pendingJoin.code && isGroupQrExpired(group)) {
    state.pendingJoin.status = "二维码已过期";
    return;
  }
  await loadGroupJoinRequests(group);
}

async function resolveJoinGroup(groupId) {
  const matches = item => item.id === groupId || item.chatId === groupId || groupJoinCode(item) === groupId;
  let group = state.data.groups?.find(matches) || state.data.directoryGroups?.find(matches);
  if (group || state.useMock) return group || null;
  try {
    group = await api(`/api/groups/${groupId}`);
    if (group && !state.data.groups.some(item => item.id === group.id)) {
      state.data.groups.push(group);
    }
    return group;
  } catch (error) {
    return null;
  }
}

function clearPendingJoin() {
  state.pendingJoin = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("joinGroup");
  url.searchParams.delete("code");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function hydrateQrCodes() {
  const boxes = [...document.querySelectorAll("[data-qr-code]")];
  if (!boxes.length) return;
  await Promise.all(boxes.map(async box => {
    const text = box.dataset.qrText || "";
    if (!text || box.dataset.renderedText === text) return;
    try {
      box.innerHTML = await renderQrSvg(text, { width: 320 });
      box.dataset.renderedText = text;
    } catch (error) {
      box.textContent = "二维码生成失败";
    }
  }));
}

function renderInviteMembersPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const memberIds = new Set(group.members.map(member => member.userId));
  const blockedIds = new Set((state.data.groupBlacklists?.[group.id] || []).map(entry => entry.user.id));
  const candidates = state.data.contacts.filter(contact => !memberIds.has(contact.id) && !blockedIds.has(contact.id));
  const candidateIds = candidates.map(contact => contact.id);
  const allSelected = areAllInviteCandidatesSelected(state.inviteSelection, candidateIds);
  const visibleCandidates = candidates.filter(contact => !state.query || `${contact.nickname} ${contact.chatId}`.toLowerCase().includes(state.query.toLowerCase()));
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="members">${icons.back}</button><h3>选择联络人</h3><button class="primary-btn inline" type="button" data-invite-confirm>确認</button></header>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="搜索"></div>
      <section class="section">
        <label class="setting-row"><span>全选</span><input type="checkbox" data-invite-toggle-all ${allSelected ? "checked" : ""}></label>
      </section>
      <div class="list">
        ${visibleCandidates.map(contact => `
          <label class="list-item invite-member-row">
            <img class="avatar" src="${avatarSrc(contact.avatar)}" alt="">
            <div><div class="item-title">${escapeHTML(contact.nickname)}</div><div class="item-preview">${escapeHTML(contact.chatId)}</div></div>
            <input type="checkbox" name="inviteMember" value="${escapeAttr(contact.id)}" data-invite-member="${escapeAttr(contact.id)}" ${state.inviteSelection.has(contact.id) ? "checked" : ""}>
          </label>`).join("") || `<div class="empty-state">没有可邀请的联系人${blockedIds.size ? "，黑名单成员已自动排除" : ""}</div>`}
      </div>
    </aside>`;
}

function renderMediaPane() {
  const messages = state.data.messages[state.selectedConversationId] || [];
  const allMedia = messages.filter(m => mediaFilterMatches(m, "all"));
  const media = messages.filter(m => mediaFilterMatches(m, state.mediaFilter));
  const imageCount = allMedia.filter(m => m.type === "image").length;
  const videoCount = allMedia.filter(m => m.type === "video").length;
  const fileCount = allMedia.filter(m => m.type === "file").length;
  const tabs = [
    { key: "all", label: "全部" },
    { key: "image", label: "图片" },
    { key: "video", label: "视频" },
    { key: "file", label: "档案" }
  ];
  return `
    <aside class="detail-pane media-pane">
      <header class="panel-header"><button class="icon-btn desktop-detail-back" data-sidepage="settings" title="返回设置" aria-label="返回设置">${icons.back}</button><button class="icon-btn detail-mobile-back" data-mobile-close title="返回聊天" aria-label="返回聊天">${icons.back}</button><h3>图片与视频</h3></header>
      <section class="section media-overview-section">
        <div class="media-overview-card">
          <div>
            <span class="media-overview-kicker">会话媒体库</span>
            <h3>${media.length} 个${escapeHTML(mediaFilterLabel(state.mediaFilter))}</h3>
            <p>按类型整理当前聊天里的图片、视频和档案。</p>
          </div>
          <div class="media-overview-stats">
            <span><strong>${allMedia.length}</strong><small>全部</small></span>
            <span><strong>${imageCount}</strong><small>图片</small></span>
            <span><strong>${videoCount}</strong><small>视频</small></span>
            <span><strong>${fileCount}</strong><small>档案</small></span>
          </div>
        </div>
      </section>
      <div class="segmented media-filter-tabs">${tabs.map(tab => `<button class="seg-btn ${state.mediaFilter === tab.key ? "active" : ""}" data-media-filter="${tab.key}">${tab.label}</button>`).join("")}</div>
      <section class="section media-section">
        ${media.length ? `<div class="grid media-results-grid">
          ${media.map(m => `
            <div class="card media-result-card">
              ${renderMediaPreviewCard(m)}
              <p class="media-result-title">${escapeHTML(mediaDisplayName(m, m.type))}</p>
              <span class="item-meta">${escapeHTML(m.senderName || "")} · ${formatTime(m.createdAt)}</span>
            </div>`).join("")}
        </div>` : renderPanelState({
          title: `当前聊天还没有${mediaFilterLabel(state.mediaFilter)}内容`,
          body: "这里会按类型聚合当前会话的媒体内容，方便你快速回看。",
          icon: "◌"
        })}
      </section>
    </aside>`;
}

function renderSearchPane() {
  const q = state.query.trim();
  const results = state.searchResults || [];
  const searchTitle = state.searchLoading ? "正在搜索" : q ? `找到 ${results.length} 条结果` : "准备搜索聊天记录";
  const searchBody = q ? `关键词：${q}` : "输入关键词后，会在当前聊天里定位相关消息。";
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn desktop-detail-back" data-sidepage="settings" title="返回设置" aria-label="返回设置">${icons.back}</button><button class="icon-btn detail-mobile-back" data-mobile-close title="返回聊天" aria-label="返回聊天">${icons.back}</button><h3>搜索聊天记录</h3></header>
      <section class="section search-overview-section">
        <div class="search-overview-card">
          <span class="search-overview-kicker">当前会话</span>
          <h3>${escapeHTML(searchTitle)}</h3>
          <p>${escapeHTML(searchBody)}</p>
        </div>
      </section>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="请输入关键词"></div>
      <div class="list search-results-list">
        ${state.searchLoading ? renderLoadingSkeleton(3) : q ? results.map(m => `
          <button class="list-item search-result-row" type="button" data-search-result="${escapeAttr(m.id)}">
            <div>
              <div class="item-title">${escapeHTML(m.senderName)} · ${formatTime(m.createdAt)}</div>
              <div class="item-preview">${escapeHTML(searchResultPreview(m))}</div>
            </div>
          </button>`).join("") || renderPanelState({
            title: "没有找到相关聊天记录",
            body: "换个更具体的关键词试试，或者直接搜索对方昵称和图片描述。",
            icon: "⌁"
          }) : renderPanelState({
            title: "输入关键词搜索当前聊天记录",
            body: "可以搜昵称、时间、表情、图片描述和你说过的话。",
            icon: "⌕"
          })}
      </div>
    </aside>`;
}

function renderMessageReadDetailPane() {
  const detail = state.readDetail;
  const read = detail?.read || [];
  const unread = detail?.unread || [];
  const renderMember = member => `
    <article class="list-item">
      <img class="avatar" src="${avatarSrc(avatar((member.nickname || "成").slice(0, 1)))}" alt="">
      <div>
        <div class="item-title">${escapeHTML(member.nickname || member.userId || "群成员")}</div>
        <div class="item-preview">${member.readAt ? `已读 · ${formatTime(member.readAt)}` : "未读"}</div>
      </div>
    </article>`;
  return `
    <aside class="detail-pane">
      <header class="panel-header"><button class="icon-btn" data-sidepage="settings">${icons.back}</button><h3>已读详情</h3></header>
      ${state.readDetailLoading ? `<div class="empty-state">正在加载已读详情...</div>` : `
        <section class="section">
          <h3>已读 ${read.length} 人</h3>
          <div class="list nested-list">${read.map(renderMember).join("") || renderPanelState({
            title: "暂无成员已读",
            body: "消息刚发出时会先显示在这里，稍等成员查看后就会更新。",
            icon: "✓"
          })}</div>
        </section>
        <section class="section">
          <h3>未读 ${unread.length} 人</h3>
          <div class="list nested-list">${unread.map(renderMember).join("") || renderPanelState({
            title: "全部成员已读",
            body: "这条消息已经被群里所有可见成员看过了。",
            icon: "◔"
          })}</div>
        </section>`}
    </aside>`;
}

function renderPanelState({ title, body, action, icon }) {
  return `
    <div class="empty-state empty-state-card">
      ${icon ? `<div class="empty-state-icon">${escapeHTML(icon)}</div>` : ""}
      <div class="empty-state-title">${escapeHTML(title)}</div>
      ${body ? `<div class="empty-state-body">${escapeHTML(body)}</div>` : ""}
      ${action ? `<button class="primary-btn inline empty-state-action" type="button">${escapeHTML(action)}</button>` : ""}
    </div>`;
}

function renderLoadingSkeleton(rows = 3) {
  return `
    <div class="skeleton-list">
      ${Array.from({ length: rows }, () => `
        <div class="skeleton-row">
          <span class="skeleton-avatar"></span>
          <div class="skeleton-copy">
            <span class="skeleton-line short"></span>
            <span class="skeleton-line"></span>
          </div>
        </div>`).join("")}
    </div>`;
}

function mediaFilterMatches(message, filter) {
  if (!["image", "video", "file"].includes(message?.type)) return false;
  if (!filter || filter === "all") return true;
  return message.type === filter;
}

function mediaFilterLabel(filter) {
  return { image: "图片", video: "视频", file: "档案" }[filter] || "媒体";
}

function renderMediaPreviewCard(message) {
  const name = escapeAttr(mediaDisplayName(message, message.type));
  const url = mediaURL(mediaDisplayUrl(message.attachment?.url, message.type));
  if (message.type === "image") {
    return `
      <button class="media-card media-card-button" type="button" data-open-image="${escapeAttr(url)}" data-image-name="${name}">
        <img src="${escapeAttr(url)}" alt="${name}">
        <span class="media-card-overlay">点按查看大图</span>
      </button>`;
  }
  if (message.type === "video") {
    if (!isOpenableMediaUrl(url)) {
      return `
        <div class="media-card file-media-card disabled" aria-disabled="true">
          <span class="file-icon">VIDEO</span>
          <span>${escapeHTML(mediaDisplayName(message, "video"))}</span>
        </div>`;
    }
    return `
      <video class="media-card" controls src="${escapeAttr(url)}" title="${name}"></video>`;
  }
  return `
    ${isOpenableMediaUrl(url) ? `
    <a class="media-card file-media-card" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">
      <span class="file-icon">FILE</span>
      <span>${escapeHTML(mediaDisplayName(message, "file"))}</span>
    </a>` : `
    <div class="media-card file-media-card disabled" aria-disabled="true">
      <span class="file-icon">FILE</span>
      <span>${escapeHTML(mediaDisplayName(message, "file"))}</span>
    </div>`}`;
}

function searchResultPreview(message) {
  return searchPreviewText(message);
}

function renderCollectionsPane() {
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>我的收藏</h3></header>
      ${renderCollectionsContent()}
    </aside>`;
}

function renderReportPane() {
  const reasons = ["该群组发布色情,广告等不良信息", "该群组存在诈骗钱财的行为", "该群组发布广告骚扰信息", "其他违规行为"];
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>检举原因</h3></header>
      <div class="list">
        ${reasons.map(reason => `<button class="list-item" data-report="${escapeAttr(reason)}"><div class="item-title">${reason}</div></button>`).join("")}
      </div>
    </aside>`;
}

function renderExplorePage() {
  if (state.exploreView === "groups") return renderExploreGroupSquare();
  const group = currentGroup() || state.data.groups[0];
  return page("探索", `
    ${renderExploreMobileSwitch("discover")}
    <section class="explore-hero">
      <div>
        <span class="eyebrow">DISCOVER</span>
        <h2>把常用入口放在一起</h2>
        <p>找好友、扫码入群、管理申请，先做成可验证的轻量探索页。</p>
      </div>
      <button class="primary-btn inline" type="button" data-modal="add-friend">添加好友</button>
    </section>
    <section class="explore-grid">
      <button class="explore-card" type="button" data-modal="join-group">
        <span class="explore-icon">⌗</span>
        <strong>扫一扫入群</strong>
        <small>粘贴群二维码链接或输入 6 位群号</small>
      </button>
      <button class="explore-card" type="button" data-sidepage="qrcode">
        <span class="explore-icon">▣</span>
        <strong>我的二维码</strong>
        <small>展示个人二维码名片</small>
      </button>
      <button class="explore-card" type="button" data-modal="create-group">
        <span class="explore-icon">＋</span>
        <strong>发起群聊</strong>
        <small>快速创建一个新群</small>
      </button>
      <button class="explore-card" type="button" data-explore-open-group="${escapeAttr(group?.id || "")}">
        <span class="explore-icon">群</span>
        <strong>群设置</strong>
        <small>${escapeHTML(group?.title || "暂无群聊")}</small>
      </button>
    </section>
    <section class="section">
      <h3>最近可用</h3>
      <div class="list nested-list">
        <button class="list-item" type="button" data-section="contact">
          <div class="side-entry-icon">友</div>
          <div><div class="item-title">好友申请</div><div class="item-preview">查看谁加我、谁邀请我入群</div></div>
        </button>
        <button class="list-item" type="button" data-explore-open-applications="${escapeAttr(group?.id || "")}">
          <div class="side-entry-icon">审</div>
          <div><div class="item-title">入群申请</div><div class="item-preview">进入当前群的审核列表</div></div>
        </button>
      </div>
    </section>`);
}

function renderExploreGroupSquare() {
  const groups = getExploreGroups();
  const hasJoinableGroup = groups.some(group => !isGroupJoined(group) && group.joinMode !== "closed");
  return page("群聊广场", `
    ${renderExploreMobileSwitch("groups")}
    <section class="explore-hero explore-square-hero">
      <div>
        <span class="eyebrow">GROUPS</span>
        <h2>发现可以加入的群</h2>
        <p>这里汇总公开群、需要审核的群，以及你已经加入的群，方便测试扫码入群流程。</p>
      </div>
      <button class="primary-btn inline" type="button" data-modal="create-group">发起群聊</button>
    </section>
    ${groups.length && !hasJoinableGroup ? `<section class="section"><div class="item-preview">当前接口数据里暂无未加入的公开群；有新公开群时这里会显示“扫码入群/申请入群”。</div></section>` : ""}
    <section class="explore-group-list">
      ${groups.map(group => renderExploreGroupCard(group)).join("") || `<div class="empty-state">暂无可展示的群聊</div>`}
    </section>`);
}

function renderExploreMobileSwitch(active) {
  return `
    <div class="explore-mobile-switch" aria-label="探索视图切换">
      <button class="${active === "discover" ? "active" : ""}" type="button" data-explore-view="discover">发现</button>
      <button class="${active === "groups" ? "active" : ""}" type="button" data-explore-view="groups">群聊广场</button>
    </div>`;
}

function renderExploreGroupCard(group) {
  const joined = isGroupJoined(group);
  const closed = group.joinMode === "closed";
  const joinLabel = joinModeLabel(group.joinMode);
  const memberCount = (group.members || []).length;
  const cardClass = [
    "explore-group-card",
    joined ? "joined" : "joinable",
    closed ? "closed" : ""
  ].filter(Boolean).join(" ");
  const action = joined
    ? `<button class="primary-btn inline" type="button" data-explore-enter-group="${escapeAttr(group.id)}">进入群聊</button>`
    : closed
      ? `<button class="ghost-btn inline" type="button" disabled>暂不开放</button>`
      : `<button class="primary-btn inline" type="button" data-explore-scan-group="${escapeAttr(group.id)}">${group.joinMode === "approval" ? "申请入群" : "扫码入群"}</button>`;
  return `
    <article class="${cardClass}">
      <div class="explore-group-avatar">
        <img class="avatar" src="${avatarSrc(group.avatar)}" alt="">
      </div>
      <div class="explore-group-main">
        <div class="explore-group-title-row">
          <div class="item-title">${escapeHTML(group.title)}</div>
          <span class="explore-group-mode">${escapeHTML(joinLabel)}</span>
        </div>
        <div class="item-preview">群号 ${escapeHTML(group.chatId || "")}</div>
        <div class="explore-group-tags">
          <span>${joined ? "已加入" : "未加入"}</span>
          <span>${memberCount} 位成员</span>
          <span>${closed ? "仅管理员可开放" : group.joinMode === "approval" ? "需要管理员同意" : "扫码即可进入"}</span>
        </div>
      </div>
      <div class="icon-row">${action}</div>
    </article>`;
}

function renderContactPage() {
  if (state.sidePage === "friend-requests") {
    const settings = ensureUserSettings();
    const requestGroups = getFriendRequestGroups();
    return page("好友申请", `
      ${renderContactMobileSwitch("friend-requests")}
      ${renderFriendRequestTools(settings)}
      <div class="segmented request-segmented">
        ${requestSeg("all", "全部")}
        ${requestSeg("pending", "待处理")}
        ${requestSeg("outgoing", "我发出的")}
        ${requestSeg("processed", "已处理")}
      </div>
      ${requestGroups.map(group => `
        <section class="contact-section">
          <div class="contact-section-heading">
            <h3>${escapeHTML(group.title)}</h3>
            <span class="request-count">${group.items.length}</span>
          </div>
          ${renderFriendRequestBuckets(group.items)}
        </section>`).join("") || `<div class="empty-state">暂无申请记录</div>`}`);
  }
  if (state.sidePage === "tags") {
    return page("通讯录标签", `
      ${renderContactMobileSwitch("tags")}
      ${renderContactTagsPage()}`);
  }
  if (state.sidePage === "groups") {
    const groups = filteredContactGroups();
    const ownedCount = state.data.groups.filter(group => groupRoleForCurrentUser(group) === "owner").length;
    const joinedCount = state.data.groups.filter(group => groupRoleForCurrentUser(group) !== "owner").length;
    return page("群聊天", `
      ${renderContactMobileSwitch("groups")}
      <div class="segmented">
        ${contactGroupSeg("owned", `我建立的 ${ownedCount}`)}
        ${contactGroupSeg("joined", `我加入的 ${joinedCount}`)}
        ${contactGroupSeg("all", `全部 ${state.data.groups.length}`)}
      </div>
      <div class="contact-group-mobile-list">
        ${groups.map(renderContactGroupRow).join("") || `
        <div class="empty-state">
          <div>这里暂时没有群聊</div>
          <button class="primary-btn inline" type="button" data-open-group-square>去群聊广场看看</button>
        </div>`}
      </div>`);
  }
  return page("通讯录", `
    ${renderContactMobileSwitch("contacts")}
    ${renderContactDirectory()}`);
}

function renderContactMobileSwitch(active) {
  return `
    <div class="contact-mobile-switch" aria-label="通讯录视图切换">
      <button class="${active === "friend-requests" ? "active" : ""}" type="button" data-sidepage="friend-requests">申请</button>
      <button class="${active === "contacts" ? "active" : ""}" type="button" data-contact-mobile-view="contacts">联系人</button>
      <button class="${active === "tags" ? "active" : ""}" type="button" data-sidepage="tags">标签</button>
      <button class="${active === "groups" ? "active" : ""}" type="button" data-sidepage="groups">群聊</button>
    </div>`;
}

function renderContactDirectory() {
  const contacts = filteredContacts();
  return `
    <section class="section contact-directory-summary">
      <div>
        <div class="item-title">联络人</div>
        <div class="item-preview">${contacts.length} 位联系人 · 点按查看名片或发起聊天</div>
      </div>
      <button class="primary-btn inline" type="button" data-modal="add-friend">添加好友</button>
    </section>
    <div class="list contact-directory-list">
      ${contacts.map(contact => `
        <button class="list-item contact-directory-row" type="button" data-open-contact="${escapeAttr(contact.id)}">
          <img class="avatar" src="${avatarSrc(contact.avatar)}" alt="">
          <div>
            <div class="item-title">${escapeHTML(contact.nickname)}</div>
            <div class="item-preview">${escapeHTML(contact.signature || contact.chatId)}</div>
          </div>
        </button>`).join("") || `<div class="empty-state">暂无联系人</div>`}
    </div>`;
}

function renderContactGroupRow(group) {
  const role = groupRoleLabel(groupRoleForCurrentUser(group));
  return `
    <article class="list-item contact-group-row" data-conversation="group-${escapeAttr(group.id)}">
      <img class="avatar" src="${avatarSrc(group.avatar)}" alt="">
      <div class="contact-group-main">
        <div class="item-title">${escapeHTML(group.title)}</div>
        <div class="item-preview">${group.members.length} 位成员 · ${escapeHTML(group.joinMode === "approval" ? "审核入群" : group.joinMode === "closed" ? "暂不开放" : "扫码入群")}</div>
      </div>
      <div class="contact-group-side">
        <span class="contact-group-role">${escapeHTML(role)}</span>
        <span class="contact-group-enter">进入</span>
      </div>
    </article>`;
}

function renderContactTagsPage() {
  const tagGroups = getContactTagGroups();
  const taggedCount = new Set(tagGroups.flatMap(group => group.contacts.map(contact => contact.id))).size;
  return `
    <section class="section contact-tags-summary">
      <div>
        <div class="item-title">标签管理</div>
        <div class="item-preview">${tagGroups.length} 个标签 · ${taggedCount} 位联系人已归类</div>
      </div>
      <button class="primary-btn inline" data-modal="tag">新增标签</button>
    </section>
    <div class="contact-tag-list">
      ${tagGroups.map(group => `
        <section class="contact-tag-card">
          <div class="contact-tag-head">
            <span class="contact-tag-name">${escapeHTML(group.tag)}</span>
            <span class="contact-tag-count">${group.contacts.length} 位</span>
          </div>
          <div class="contact-tag-members">
            ${group.contacts.map(contact => `
              <button class="contact-tag-member" type="button" data-open-contact="${escapeAttr(contact.id)}">
                <img class="avatar" src="${avatarSrc(contact.avatar)}" alt="">
                <span>${escapeHTML(contact.nickname)}</span>
              </button>`).join("")}
          </div>
        </section>`).join("") || `
        <div class="empty-state empty-state-card">
          <div class="empty-state-icon">#</div>
          <div class="empty-state-title">还没有标签</div>
          <div class="empty-state-body">给联系人加上标签后，这里会自动汇总。</div>
          <button class="primary-btn inline" type="button" data-modal="tag">新增标签</button>
        </div>`}
    </div>`;
}

function getContactTagGroups() {
  const map = new Map();
  for (const contact of state.data.contacts || []) {
    for (const tag of contact.tags || []) {
      const normalized = String(tag).trim();
      if (!normalized) continue;
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push(contact);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN"))
    .map(([tag, contacts]) => ({ tag, contacts }));
}

function renderFriendRequestTools(settings) {
  const policyGrid = `
    <div class="request-policy-grid">
      <div class="request-policy-card">
        <strong>加我为好友</strong>
        <span>${settings.friendVerification ? "需我确认后通过" : "自动通过好友申请"}</span>
      </div>
      <div class="request-policy-card">
        <strong>拉我进群</strong>
        <span>${settings.inviteGroupVerification ? "需我确认后入群" : "自动加入群聊"}</span>
      </div>
    </div>`;
  return `
    <section class="section request-tools">
      <div class="item-title">好友验证</div>
      <div class="item-preview">这里会显示你收到的好友申请，以及你发出的申请处理状态。</div>
      ${policyGrid}
      <div class="icon-row">
        <button class="primary-btn inline" type="button" data-modal="add-friend">添加好友</button>
        <button class="ghost-btn inline" type="button" data-sidepage="privacy">隐私设置</button>
      </div>
    </section>`;
}

function renderProfilePage() {
  if (state.sidePage === "collections") {
    return page("我的收藏", renderCollectionsContent());
  }
  if (state.sidePage === "notifications") {
    return page("通知设置", renderNotificationsContent());
  }
  if (state.sidePage === "messaging") {
    return page("聊天设置", renderMessagingSettingsContent());
  }
  if (state.sidePage === "messaging-batch") {
    return page("群发助手", `
      <section class="section">
        <div class="item-meta">选择要群发的对象与消息内容，适合活动通知或统一提醒。</div>
      </section>
      <section class="section">
        ${settingLink("messaging-batch-history", "最近一次群发", getBatchDraft().history[0]?.title || "今晚八点活动提醒")}
        ${settingLink("messaging-batch-draft", "新建群发任务", "选择会话并输入内容")}
        ${settingLink("messaging-batch-targets", "群发范围", formatBatchTargetsSummary())}
      </section>`);
  }
  if (state.sidePage === "messaging-batch-history") {
    const batch = getBatchDraft();
    return page("最近一次群发", `
      <section class="section">
        <div class="item-title">${escapeHTML(batch.history[0]?.title || "今晚八点活动提醒")}</div>
        <div class="item-preview">${escapeHTML(batch.history[0]?.body || "今晚八点准时上线，记得查看最新通知。")}</div>
      </section>
      <div class="list">
        ${(batch.history || []).map(item => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar("群"))}" alt="">
            <div>
              <div class="item-title">${escapeHTML(item.title)}</div>
              <div class="item-preview">${escapeHTML(item.body)}</div>
            </div>
          </article>
        `).join("")}
      </div>`);
  }
  if (state.sidePage === "messaging-batch-draft") {
    const batch = getBatchDraft();
    return page("新建群发任务", `
      <section class="section">
        <label class="security-field">
          <span>群发内容</span>
          <textarea class="textarea" id="batchMessage" placeholder="请输入要群发的内容">${escapeHTML(batch.message)}</textarea>
        </label>
      </section>
      <section class="section">
        <div class="item-title">已选范围</div>
        <div class="item-preview">${escapeHTML(formatBatchTargetsSummary())}</div>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-sidepage="messaging-batch-targets">调整范围</button>
          <button class="primary-btn inline" type="button" data-profile-action="send-batch-message">立即群发</button>
        </div>
      </section>`);
  }
  if (state.sidePage === "messaging-batch-targets") {
    const batch = getBatchDraft();
    return page("群发范围", `
      <section class="section">
        <div class="item-meta">至少选择一个范围，群发时会把消息投递到对应会话。</div>
      </section>
      <div class="list">
        ${[
          ["recent", "最近聊天", "发送给最近对话中的对象"],
          ["contacts", "联系人", "发送给已添加的联系人"],
          ["groups", "群组", "发送给群聊会话"]
        ].map(([key, title, preview]) => `
          <button class="list-item option-row" type="button" data-batch-target-toggle="${key}">
            <div>
              <div class="item-title">${title}</div>
              <div class="item-preview">${preview}</div>
            </div>
            <span class="forward-check ${batch.targets.includes(key) ? "active" : ""}">${batch.targets.includes(key) ? "✓" : ""}</span>
          </button>
        `).join("")}
      </div>`);
  }
  if (state.sidePage === "stickers") {
    const stickerStore = ensureStickerStore();
    return page("我的表情", `
      <section class="section">
        <div class="item-meta">这里可以整理常用表情，也可以继续补充新的收藏。</div>
      </section>
      <div class="grid">
        ${stickerStore.items.map(emoji => `
          <button class="card sticker-card ${stickerStore.favorites.includes(emoji) ? "active" : ""}" type="button" data-toggle-sticker="${escapeAttr(emoji)}">${emoji}</button>
        `).join("")}
      </div>
      <section class="section">
        ${settingLink("stickers-manage", "添加到常用表情", "从现有收藏继续补充")}
      </section>`);
  }
  if (state.sidePage === "stickers-manage") {
    const stickerStore = ensureStickerStore();
    return page("添加到常用表情", `
      <section class="section">
        <div class="item-meta">点按表情可加入或移出常用表情。</div>
      </section>
      <div class="grid">
        ${["🤝", "🫡", "✅", "💡", "📌", "📣", "🌟", "😎"].map(emoji => `
          <button class="card sticker-card ${stickerStore.items.includes(emoji) ? "active" : ""}" type="button" data-add-sticker="${escapeAttr(emoji)}">${emoji}</button>
        `).join("")}
      </div>`);
  }
  if (state.sidePage === "privacy") {
    ensureUserSettings();
    return page("隐私", `
      <section class="section">
        ${settingToggle("加我为好友需验证", "friendVerification")}
        ${settingToggle("邀请我加入群聊需验证", "inviteGroupVerification")}
        ${settingLink("blacklist", "黑名单", "›")}
      </section>`);
  }
  if (state.sidePage === "blacklist") {
    return page("黑名单", `
      <section class="section">
        <div class="item-meta">被加入黑名单的人将无法继续向你发消息或发起好友申请。</div>
      </section>
      <section class="section">
        <button class="ghost-btn inline" type="button" data-sidepage="blacklist-add">新增黑名单</button>
      </section>
      <div class="list">
        ${getBlockedContacts().length ? getBlockedContacts().map(contact => `
          <button class="list-item" type="button" data-unblock-contact="${escapeAttr(contact.id)}">
            <img class="avatar" src="${avatarSrc(contact.avatar)}" alt="">
            <div>
              <div class="item-title">${escapeHTML(contact.nickname)}</div>
              <div class="item-preview">${escapeHTML(contact.chatId || "已加入黑名单")}</div>
            </div>
          </button>`).join("") : `<div class="empty-state">当前没有拉黑任何人</div>`}
      </div>`);
  }
  if (state.sidePage === "blacklist-add") {
    const blockedIds = new Set((state.user.blockedContactIds || []));
    return page("新增黑名单", `
      <section class="section">
        <div class="item-meta">把联系人加入黑名单后，对方将无法再打扰你。</div>
      </section>
      <div class="list">
        ${state.data.contacts.filter(contact => !blockedIds.has(contact.id)).map(contact => `
          <button class="list-item" type="button" data-block-contact="${escapeAttr(contact.id)}">
            <img class="avatar" src="${avatarSrc(contact.avatar)}" alt="">
            <div>
              <div class="item-title">${escapeHTML(contact.nickname)}</div>
              <div class="item-preview">${escapeHTML(contact.chatId || "可加入黑名单")}</div>
            </div>
          </button>
        `).join("") || `<div class="empty-state">所有联系人都已经在黑名单里了</div>`}
      </div>`);
  }
  if (state.sidePage === "security") {
    return page("安全", `
      <section class="section">
        <div class="setting-row"><span>手机号码</span><strong>${escapeHTML(state.user.country?.replace("+", "") || "60")} ${escapeHTML(state.user.phone)}</strong></div>
        <button class="setting-row setting-action-row" type="button" data-sidepage="security-devices">
          <span>登录设备</span><strong>当前浏览器 ›</strong>
        </button>
      </section>
      <section class="section">
        <h3>修改密码</h3>
        <div class="security-form">
          <label class="security-field">
            <span>旧密码</span>
            <input class="input" id="securityOldPassword" type="password" value="${escapeAttr(state.securityOldPassword)}" placeholder="请输入旧密码">
          </label>
          <button class="ghost-btn inline security-eye" type="button" data-profile-action="toggle-password-visibility">显示</button>
          <button class="primary-btn inline" type="button" data-sidepage="security-password-step2" data-security-next ${state.securityOldPassword ? "" : "disabled"}>下一步</button>
        </div>
      </section>`);
  }
  if (state.sidePage === "security-devices") {
    const fallbackDevice = { id: "current", ...currentDeviceInfo(navigator.userAgent), current: true };
    const devices = state.useMock ? [fallbackDevice] : (state.data.loginDevices || []);
    return page("登录设备", `
      <section class="section">
        <div class="item-meta">这里显示当前帐号正在登录的设备，可退出其它设备保护帐号安全。</div>
        <button class="ghost-btn inline" type="button" data-profile-action="refresh-login-devices">刷新登录设备</button>
      </section>
      <div class="list">
        ${devices.map(device => {
          const display = loginDeviceDisplay(device, navigator.userAgent);
          return `<article class="list-item">
            <div class="avatar">端</div>
            <div>
              <div class="item-title">${escapeHTML(display.name)}</div>
              <div class="item-preview">${escapeHTML(display.status)} · ${escapeHTML(display.hint)}</div>
            </div>
            ${display.canRevoke ? `<button class="danger-btn inline" type="button" data-revoke-login-device="${escapeAttr(device.id)}">退出</button>` : ""}
          </article>`;
        }).join("") || `<div class="empty-state">正在加载登录设备...</div>`}
      </div>`);
  }
  if (state.sidePage === "security-password-step2") {
    return page("修改密码", `
      <section class="section">
        <label class="security-field">
          <span>新密码</span>
          <input class="input" id="securityNewPassword" type="password" placeholder="请输入新密码">
        </label>
        <label class="security-field">
          <span>确认新密码</span>
          <input class="input" id="securityConfirmPassword" type="password" placeholder="请再次输入新密码">
        </label>
        <button class="primary-btn inline" type="button" data-profile-action="save-password">保存新密码</button>
      </section>`);
  }
  if (state.sidePage === "general") {
    return page("通用", `
      <section class="section">
        ${settingLink("general-language", "切换语言", state.user.language || "简体中文")}
        ${settingLink("general-display", "显示模式", state.user.displayMode || "桌面版")}
        ${settingLink("general-feedback", "意见反馈", "›")}
        ${settingLink("general-about", "关于我们", "›")}
        <button class="setting-row setting-action-row" type="button" data-profile-action="clear-local-cache">
          <span>清除缓存数据</span>
        </button>
        <button class="setting-row setting-action-row" type="button" data-profile-action="reroute-line">
          <span>重新选线</span><strong>${escapeHTML(state.networkLine)}</strong>
        </button>
        ${settingLink("general-debug", "调试资讯", "›")}
      </section>`);
  }
  if (state.sidePage === "general-language") {
    const languages = ["简体中文", "English", "Bahasa Melayu"];
    return page("切换语言", `
      <section class="section">
        <div class="item-meta">${escapeHTML(generalSettingHint(state.useMock))}</div>
      </section>
      <div class="list">
        ${languages.map(language => `
          <button class="list-item option-row" type="button" data-select-language="${escapeAttr(language)}">
            <div>
              <div class="item-title">${escapeHTML(language)}</div>
              <div class="item-preview">${language === state.user.language ? "当前使用中" : "点按切换到该语言"}</div>
            </div>
            <span class="forward-check ${language === state.user.language ? "active" : ""}">${language === state.user.language ? "✓" : ""}</span>
          </button>
        `).join("")}
      </div>`);
  }
  if (state.sidePage === "general-display") {
    const modes = ["桌面版", "移动版"];
    return page("显示模式", `
      <section class="section">
        <div class="item-meta">${escapeHTML(generalSettingHint(state.useMock))}</div>
      </section>
      <div class="list">
        ${modes.map(mode => `
          <button class="list-item option-row" type="button" data-select-display-mode="${escapeAttr(mode)}">
            <div>
              <div class="item-title">${escapeHTML(mode)}</div>
              <div class="item-preview">${mode === state.user.displayMode ? "当前显示模式" : "点按切换到该模式"}</div>
            </div>
            <span class="forward-check ${mode === state.user.displayMode ? "active" : ""}">${mode === state.user.displayMode ? "✓" : ""}</span>
          </button>
        `).join("")}
      </div>`);
  }
  if (state.sidePage === "general-feedback") {
    const feedbackStore = ensureFeedbackStore();
    return page("意见反馈", `
      <section class="section">
        <label class="security-field">
          <span>反馈类型</span>
          <select class="select full-width" id="feedbackType">
            ${["功能建议", "界面问题", "Bug 反馈"].map(type => `<option value="${escapeAttr(type)}" ${feedbackStore.type === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label class="security-field">
          <span>问题或建议</span>
          <textarea class="textarea" id="feedbackText" placeholder="请输入你希望优化的内容">${escapeHTML(feedbackStore.draft)}</textarea>
        </label>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-sidepage="feedback-history">查看提交记录</button>
          <button class="primary-btn inline" type="button" data-profile-action="submit-feedback">提交</button>
        </div>
      </section>`);
  }
  if (state.sidePage === "feedback-history") {
    const feedbackStore = ensureFeedbackStore();
    return page("提交记录", `
      <div class="list">
        ${feedbackStore.history.map(item => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar("反"))}" alt="">
            <div>
              <div class="item-title">${escapeHTML(item.type)}</div>
              <div class="item-preview">${escapeHTML(item.text)}</div>
            </div>
            <div class="item-meta">${escapeHTML(item.status)}</div>
          </article>
        `).join("") || `<div class="empty-state">暂无反馈记录</div>`}
      </div>`);
  }
  if (state.sidePage === "general-about") {
    const about = buildAboutInfo({
      useMock: state.useMock,
      networkLine: state.networkLine,
      conversationCount: state.data.conversations.length
    });
    return page("关于我们", `
      <section class="section">
        <div class="item-title">66 快捷版</div>
        <div class="item-preview">${escapeHTML(aboutDescription(state.useMock))}</div>
      </section>
      <section class="section">
        ${settingLink("general-about-version", "版本信息", about.version)}
      </section>`);
  }
  if (state.sidePage === "general-about-version") {
    const about = buildAboutInfo({
      useMock: state.useMock,
      networkLine: state.networkLine,
      conversationCount: state.data.conversations.length
    });
    return page("版本信息", `
      <section class="section">
        <div class="setting-row"><span>应用版本</span><strong>${escapeHTML(about.version)}</strong></div>
        <div class="setting-row"><span>运行模式</span><strong>${escapeHTML(about.mode)}</strong></div>
        <div class="setting-row"><span>当前线路</span><strong>${escapeHTML(about.networkLine)}</strong></div>
        <div class="setting-row"><span>当前会话数</span><strong>${about.conversationCount}</strong></div>
      </section>`);
  }
  if (state.sidePage === "general-debug") {
    return page("调试资讯", `
      <section class="section">
        <div class="setting-row"><span>当前线路</span><strong>${escapeHTML(state.networkLine)}</strong></div>
        <div class="setting-row"><span>运行模式</span><strong>${state.useMock ? "本地演示" : "在线接口"}</strong></div>
        <div class="setting-row"><span>当前会话数</span><strong>${state.data.conversations.length}</strong></div>
      </section>`);
  }
  if (state.sidePage === "switch-user") {
    if (!state.useMock) {
      state.sidePage = "profile";
      return renderProfilePage();
    }
    return page("切换使用者", `
      <section class="section">
        <div class="item-meta">下面的账号用于本地演示切换，点按后会立即切换资料和展示状态。</div>
      </section>
      <div class="list switch-user-list">
        ${getAvailableAccounts().map(account => `
          <button class="list-item switch-user-btn" type="button" data-switch-user="${escapeAttr(account.id)}">
            <img class="avatar" src="${avatarSrc(account.avatar)}" alt="">
            <div>
              <div class="item-title">${escapeHTML(account.nickname)}${account.id === state.user.id ? ` <span class="item-flag">当前</span>` : ""}</div>
              <div class="item-preview">${escapeHTML(account.country)} ${escapeHTML(account.phone)} · ${escapeHTML(account.chatId)}</div>
              <div class="item-preview">${escapeHTML(account.signature || "这个账号还没有个性签名")}</div>
            </div>
          </button>`).join("")}
      </div>`);
  }
  if (state.sidePage === "qrcode") {
    return page("二维码", `
      <div class="card qrcode-card">
        <img class="avatar profile-page-avatar" src="${avatarFor(state.user, "我")}" alt="">
        ${qrCodeBox(userQrText(state.user), "个人二维码")}
        <strong>${escapeHTML(state.user.chatId)}</strong>
        <div class="item-meta">${escapeHTML(state.user.nickname)}</div>
        <div class="item-meta">${escapeHTML(state.user.country)} ${escapeHTML(state.user.phone)}</div>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-copy="${escapeAttr(state.user.chatId)}">复制聊天号</button>
          <button class="primary-btn inline" type="button" data-profile-action="save-qrcode">保存二维码</button>
        </div>
      </div>`);
  }
  if (state.sidePage === "profile-avatar") {
    return page("更换头像", `
      <section class="section profile-avatar-editor">
        <img class="avatar profile-avatar-large" src="${avatarFor(state.user, "我")}" alt="">
        <div class="item-title">${escapeHTML(state.user.nickname)}</div>
        <div class="item-preview">头像会同步显示在聊天、通讯录和个人资料中。</div>
      </section>
      <section class="section">
        <div class="icon-row">
          <button class="primary-btn inline" type="button" data-profile-action="avatar">上传新头像</button>
          <button class="ghost-btn inline" type="button" data-profile-action="reset-avatar">恢复默认头像</button>
        </div>
      </section>`);
  }
  if (state.sidePage === "profile-nickname") {
    return page("昵称", `
      <section class="section">
        <label class="security-field">
          <span>设置昵称</span>
          <input class="input" id="profileNicknameInput" value="${escapeAttr(state.user.nickname)}" placeholder="请输入昵称">
        </label>
        <button class="primary-btn inline" type="button" data-profile-action="save-profile-nickname">保存昵称</button>
      </section>`);
  }
  if (state.sidePage === "profile-signature") {
    return page("个性签名", `
      <section class="section">
        <label class="security-field">
          <span>编辑个性签名</span>
          <textarea class="textarea" id="profileSignatureInput" placeholder="请输入个性签名">${escapeHTML(state.user.signature || "")}</textarea>
        </label>
        <button class="primary-btn inline" type="button" data-profile-action="save-profile-signature">保存签名</button>
      </section>`);
  }
  if (state.sidePage === "account") {
    const copy = accountActionCopy(state.useMock);
    return page(copy.title, `
      <section class="section">
        <p class="item-meta">${escapeHTML(copy.description)}</p>
        <button class="danger-btn inline" type="button" data-profile-action="deactivate">${escapeHTML(copy.button)}</button>
      </section>`);
  }
  return page("个人资料", `
    <section class="profile-page-hero">
      <div class="profile-page-hero-top">
        <img class="avatar profile-page-avatar" src="${avatarFor(state.user, "我")}" alt="">
        <div class="profile-page-hero-copy">
          <span class="profile-page-kicker">个人名片</span>
          <h2>${escapeHTML(state.user.nickname)}</h2>
          <p>${escapeHTML(state.user.signature || "暂无个性签名")}</p>
        </div>
      </div>
      <div class="profile-page-hero-id">
        <span>聊天号</span>
        <strong>${escapeHTML(state.user.chatId)}</strong>
      </div>
      <div class="profile-page-hero-actions">
        <button class="ghost-btn inline" type="button" data-sidepage="profile-avatar">更换头像</button>
        <button class="primary-btn inline" type="button" data-sidepage="qrcode">查看二维码</button>
      </div>
    </section>
    <section class="section">
      ${settingLink("profile-nickname", "昵称", state.user.nickname)}
      ${settingLink("profile-signature", "个性签名", state.user.signature || "点击填写")}
    </section>
    <section class="section">
      <div class="setting-row"><span>电话号码</span><strong>${escapeHTML(state.user.country)} ${escapeHTML(state.user.phone)}</strong></div>
      <button class="setting-row" type="button" data-copy="${escapeAttr(state.user.chatId)}">
        <span>聊天号</span>
        <strong>${escapeHTML(state.user.chatId)} 复制</strong>
      </button>
      <button class="setting-row" type="button" data-sidepage="qrcode">
        <span>二维码</span>
        <strong>查看</strong>
      </button>
    </section>
    ${renderMobileProfileCenter()}`);
}

function page(title, body) {
  const paneClass = state.section === "me" ? "page-pane profile-page-pane" : "page-pane";
  const headerClass = state.section === "me" ? "panel-header profile-panel-header" : "panel-header";
  const profileBack = state.section === "me" && state.sidePage && state.sidePage !== "profile"
    ? `<button class="icon-btn profile-mobile-back" type="button" data-profile-back title="返回个人中心" aria-label="返回个人中心">${icons.back}</button>`
    : "";
  return `<section class="${paneClass}"><header class="${headerClass}">${profileBack}<h2>${title}</h2></header><div class="page-content">${body}</div></section>`;
}

function renderNotificationsContent() {
  const settings = ensureUserSettings();
  const summary = notificationSummary(settings);
  const permission = currentBrowserNotificationPermissionView();
  return `
    <section class="section notification-overview-section">
      <div class="notification-overview-card ${summary.quiet ? "quiet" : ""}">
        <div class="notification-radar" aria-hidden="true">
          <span></span>
          <span></span>
          <strong>${summary.quiet ? "静" : "醒"}</strong>
        </div>
        <div class="notification-overview-copy">
          <span class="notification-overview-kicker">NOTIFICATION CENTER</span>
          <h3>${escapeHTML(summary.title)}</h3>
          <p>${escapeHTML(summary.description)}</p>
        </div>
        <div class="notification-status-grid" aria-label="通知状态">
          ${notificationStatusPill("角标", settings.notificationBadge)}
          ${notificationStatusPill("声音", settings.notificationSound)}
          ${notificationStatusPill("震动", settings.mentionAlerts)}
        </div>
      </div>
    </section>
    <section class="section notification-settings-section">
      ${settingToggle("接收通知", "notificationsEnabled", { description: "关闭后仅保留应用内消息" })}
      ${settingToggle("新消息角标", "notificationBadge", { description: "应用未打开时提醒你" })}
      ${settingToggle("声音", "notificationSound", { description: "应用打开时播放提示音" })}
      ${settingToggle("震动", "mentionAlerts", { description: "提到你或重要消息时轻触提醒" })}
      <button class="setting-row setting-toggle-row notification-permission-row" type="button" data-notification-permission>
        <span class="setting-copy">
          <span>浏览器通知权限</span>
          <span class="item-meta">${escapeHTML(permission.description)}</span>
        </span>
        <span class="notification-permission-control">
          <span class="switch ${permission.enabled ? "on" : "off"}"></span>
          <strong>${escapeHTML(permission.action)}</strong>
        </span>
      </button>
    </section>`;
}

function notificationSummary(settings) {
  if (!settings.notificationsEnabled) {
    return {
      quiet: true,
      title: "安静模式已开启",
      description: "新消息不会主动打扰你，回来打开应用时仍可查看完整聊天。"
    };
  }
  const enabledCount = [settings.notificationBadge, settings.notificationSound, settings.mentionAlerts].filter(Boolean).length;
  if (enabledCount === 0) {
    return {
      quiet: true,
      title: "只在应用内提醒",
      description: "通知入口保留，但角标、声音和震动都已收起，适合专注时段。"
    };
  }
  if (enabledCount < 3) {
    return {
      quiet: false,
      title: "轻提醒模式",
      description: "保留必要提醒，减少声音或震动带来的干扰。"
    };
  }
  return {
    quiet: false,
    title: "重要消息不会错过",
    description: "角标、声音和震动都已开启，适合需要及时响应的群聊。"
  };
}

function notificationStatusPill(label, enabled) {
  return `<span class="${enabled ? "on" : "off"}"><strong>${escapeHTML(label)}</strong><small>${enabled ? "开启" : "关闭"}</small></span>`;
}

function currentBrowserNotificationPermissionView() {
  const supported = "Notification" in window;
  return browserNotificationPermissionView({
    supported,
    permission: supported ? Notification.permission : "denied"
  });
}

function renderMessagingSettingsContent() {
  const settings = ensureUserSettings();
  const summary = messagingSettingsSummary(settings);
  const batch = getBatchDraft();
  const stickerStore = ensureStickerStore();
  return `
    <section class="section messaging-overview-section">
      <div class="messaging-overview-card">
        <div class="messaging-overview-orb" aria-hidden="true">
          <span></span>
          <strong>${summary.score}</strong>
        </div>
        <div class="messaging-overview-copy">
          <span class="messaging-overview-kicker">CHAT FLOW</span>
          <h3>${escapeHTML(summary.title)}</h3>
          <p>${escapeHTML(summary.description)}</p>
        </div>
        <div class="messaging-overview-stats" aria-label="聊天工具状态">
          <span><strong>${batch.targets.length}</strong><small>群发范围</small></span>
          <span><strong>${stickerStore.favorites.length}</strong><small>常用表情</small></span>
          <span><strong>${settings.messagePreview ? "开" : "关"}</strong><small>消息预览</small></span>
        </div>
      </div>
    </section>
    <section class="section messaging-shortcuts-section">
      <button class="messaging-shortcut-card" type="button" data-sidepage="messaging-batch">
        <span class="messaging-shortcut-icon">群</span>
        <span><strong>群发助手</strong><small>${escapeHTML(batch.history[0]?.title || "新建统一通知")}</small></span>
        <b>›</b>
      </button>
      <button class="messaging-shortcut-card" type="button" data-sidepage="stickers">
        <span class="messaging-shortcut-icon">表</span>
        <span><strong>我的表情</strong><small>${stickerStore.items.length} 个表情 · ${stickerStore.favorites.length} 个常用</small></span>
        <b>›</b>
      </button>
    </section>
    <section class="section messaging-preferences-section">
      ${settingToggle("回车发送", "enterToSend", { description: "适合键盘输入更快的人" })}
      ${settingToggle("消息预览", "messagePreview", { description: "在会话列表显示消息摘要" })}
      ${settingToggle("自动播放语音", "autoPlayVoice", { description: "打开语音消息时自动播放" })}
      ${settingToggle("发送后收起工具栏", "collapseToolsAfterSend", { description: "让输入区保持清爽" })}
    </section>
    <section class="section messaging-danger-section">
      <button class="setting-row setting-action-row danger-text-row" type="button" data-profile-action="clear-chat-history">
        <span class="setting-copy">
          <span>清除聊天记录</span>
          <span class="item-meta">仅清理当前账号的本地聊天记录</span>
        </span>
        <strong>清除</strong>
      </button>
    </section>`;
}

function messagingSettingsSummary(settings) {
  const enabledCount = [
    settings.enterToSend,
    settings.messagePreview,
    settings.autoPlayVoice,
    settings.collapseToolsAfterSend
  ].filter(Boolean).length;
  if (enabledCount >= 3) {
    return {
      score: "快",
      title: "聊天节奏偏高效",
      description: "输入、预览和工具栏都在帮你减少来回操作。"
    };
  }
  if (enabledCount === 2) {
    return {
      score: "稳",
      title: "聊天节奏比较均衡",
      description: "保留必要辅助，不让界面替你做太多决定。"
    };
  }
  return {
    score: "简",
    title: "聊天节奏偏简洁",
    description: "多数自动行为已收起，适合手动掌控每一步。"
  };
}

function settingToggle(label, key, options = {}) {
  const enabled = Boolean(state.user?.settings?.[key]);
  const description = options.description ? `<span class="item-meta">${escapeHTML(options.description)}</span>` : "";
  return `
    <button class="setting-row setting-toggle-row" type="button" data-setting-toggle="${escapeAttr(key)}">
      <span class="setting-copy">
        <span>${label}</span>
        ${description}
      </span>
      <span class="switch ${enabled ? "on" : "off"}"></span>
    </button>`;
}

function settingAction(label, action, value = "") {
  return `
    <button class="setting-row setting-action-row" type="button" data-profile-action="${escapeAttr(action)}">
      <span>${label}</span>
      <strong>${escapeHTML(value || "进入")}</strong>
    </button>`;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal === "forward-message") {
    return renderForwardModal();
  }
  if (state.modal === "confirm-owner-transfer" && state.preview) {
    const target = state.preview;
    return `
      <div class="modal-backdrop">
        <div class="modal contact-modal" role="dialog" aria-modal="true" aria-labelledby="ownerTransferTitle">
          <header class="modal-header">
            <strong id="ownerTransferTitle">确认转让群主</strong>
            <button class="icon-btn" data-close-modal title="关闭" aria-label="关闭">×</button>
          </header>
          <div class="modal-body">
            <div class="contact-summary">
              <img class="avatar contact-avatar" src="${avatarSrc(target.avatar || avatar(target.nickname?.[0] || "成"))}" alt="">
              <div>
                <h3>${escapeHTML(target.nickname || "该成员")}</h3>
                <div class="item-meta">将成为新的群主</div>
              </div>
            </div>
            <p class="item-meta">${escapeHTML(ownerTransferConfirmText(target))}</p>
          </div>
          <footer class="modal-footer">
            <button class="ghost-btn inline" data-close-modal>取消</button>
            <button class="danger-btn inline" type="button" data-confirm-owner-transfer="${escapeAttr(target.userId)}">确认转让</button>
          </footer>
        </div>
      </div>`;
  }
  if (state.modal === "group-invite-review" && state.preview) {
    const request = state.preview;
    const group = request.groupData || {};
    const memberCount = Array.isArray(group.members) ? group.members.length : 0;
    const announcement = group.announcement || "加入后即可查看群内最新消息与成员动态。";
    return `
      <div class="modal-backdrop">
        <div class="modal contact-modal">
          <header class="modal-header">
            <strong>入群邀请</strong>
            <button class="icon-btn" data-close-modal title="关闭" aria-label="关闭">×</button>
          </header>
          <div class="modal-body">
            <div class="contact-summary">
              <img class="avatar contact-avatar" src="${avatarSrc(group.avatar || avatar("群"))}" alt="">
              <div>
                <h3>${escapeHTML(request.groupTitle || "未命名群聊")}</h3>
                <div class="item-meta">${escapeHTML(request.user?.nickname || "对方")} 邀请你加入此群聊</div>
              </div>
            </div>
            <div class="contact-detail-grid">
              <div class="setting-row"><span>邀请人</span><strong>${escapeHTML(request.user?.nickname || "未提供")}</strong></div>
              <div class="setting-row"><span>群成员</span><strong>${memberCount ? `${memberCount} 人` : "等待加入后查看"}</strong></div>
              <div class="setting-row"><span>群号</span><strong>${escapeHTML(group.chatId || request.groupChatId || "未提供")}</strong></div>
            </div>
            <section class="contact-section">
              <div class="contact-section-title">群简介</div>
              <div class="invite-review-note">${escapeHTML(announcement)}</div>
            </section>
          </div>
          <footer class="modal-footer">
            <button class="ghost-btn inline" data-close-modal>稍后处理</button>
            <button class="primary-btn inline" data-confirm-group-invite="${escapeAttr(request.id)}">确认加入</button>
          </footer>
        </div>
      </div>`;
  }
  if (state.modal === "image-preview" && state.preview) {
    const image = state.preview;
    const title = escapeHTML(image.name || "图片预览");
    const url = escapeAttr(image.url || "");
    return `
      <div class="modal-backdrop image-modal-backdrop">
        <div class="modal image-modal" role="dialog" aria-modal="true" aria-labelledby="imagePreviewTitle">
          <header class="modal-header image-modal-header">
            <strong id="imagePreviewTitle">${title}</strong>
            <button class="icon-btn" data-close-modal title="关闭" aria-label="关闭">×</button>
          </header>
          <div class="modal-body image-modal-body">
            <img class="image-preview" src="${url}" alt="${title}">
          </div>
          <footer class="modal-footer image-modal-footer">
            <a class="primary-btn inline" href="${url}" target="_blank" rel="noreferrer">新窗口打开</a>
            <button class="ghost-btn inline" data-close-modal>关闭</button>
          </footer>
        </div>
      </div>`;
  }
  if ((state.modal === "contact-remark" || state.modal === "contact-tags") && state.preview) {
    const contact = state.preview;
    const isRemark = state.modal === "contact-remark";
    const title = isRemark ? "编辑备注" : "管理标签";
    const tagsValue = (contact.tags || []).join(", ");
    return `
      <div class="modal-backdrop">
        <div class="modal contact-modal">
          <header class="modal-header">
            <strong>${title}</strong>
            <button class="icon-btn" data-close-modal title="关闭" aria-label="关闭">×</button>
          </header>
          <div class="modal-body">
            ${isRemark ? `
              <textarea class="textarea" id="contactRemark" placeholder="填写备注">${escapeHTML(contact.remark || "")}</textarea>
              <p class="item-meta">备注只对你可见。</p>
            ` : `
              <input class="input" id="contactTags" value="${escapeAttr(tagsValue)}" placeholder="多个标签请用逗号分隔">
              <p class="item-meta">例如：重要客户, 常联系, 项目组</p>
            `}
          </div>
          <footer class="modal-footer">
            <button class="ghost-btn inline" data-close-modal>取消</button>
            <button class="primary-btn inline" data-confirm-contact-edit="${isRemark ? "remark" : "tags"}">保存</button>
          </footer>
        </div>
      </div>`;
  }
  if (state.modal === "contact-detail" && state.preview) {
    const contact = state.preview;
    const commonGroups = commonGroupsForContact(contact);
    const tagText = (contact.tags && contact.tags.length) ? contact.tags.join(" · ") : "添加标签";
    return `
      <div class="modal-backdrop">
        <div class="modal contact-modal">
          <header class="modal-header">
            <strong>名片详情</strong>
            <button class="icon-btn" data-close-modal title="关闭" aria-label="关闭">×</button>
          </header>
          <div class="modal-body">
            <div class="contact-summary">
              <img class="avatar contact-avatar" src="${avatarSrc(contact.avatar || avatar(contact.nickname?.[0] || "联"))}" alt="">
              <div>
                <h3>${escapeHTML(contact.nickname || "联系人")}</h3>
                <div class="item-meta">${escapeHTML(contact.signature || "暂无个性签名")}</div>
              </div>
            </div>
            <div class="contact-detail-grid">
              <div class="setting-row"><span>聊天号</span><strong>${escapeHTML(contact.chatId || "未提供")}</strong></div>
              <button class="setting-row contact-action" type="button" data-contact-action="remark">
                <span>备注</span>
                <span class="item-meta">${escapeHTML(contact.remark || "点按添加备注")}</span>
              </button>
              <button class="setting-row contact-action" type="button" data-contact-action="tags">
                <span>标签</span>
                <span class="item-meta">${escapeHTML(tagText)}</span>
              </button>
            </div>
            <div class="contact-section">
              <div class="contact-section-title">共同群组 (${commonGroups.length})</div>
              <div class="contact-group-list">
                ${commonGroups.length ? commonGroups.map(group => `
                  <button class="list-item contact-group-item" type="button" data-conversation="group-${group.id}">
                    <img class="avatar" src="${avatarSrc(group.avatar)}" alt="">
                    <div>
                      <div class="item-title">${escapeHTML(group.title)}</div>
                      <div class="item-preview">${group.members.length} 位成员</div>
                    </div>
                  </button>`).join("") : `<div class="empty-state">暂无共同群组</div>`}
              </div>
            </div>
          </div>
          <footer class="modal-footer">
            <button class="ghost-btn inline" data-close-modal>关闭</button>
            <button class="primary-btn inline" data-open-chat="${escapeAttr(contact.id || contact.chatId || contact.nickname || "")}">发消息</button>
          </footer>
        </div>
      </div>`;
  }
  const bodies = {
    "quick-add": `
      <div class="quick-add-grid">
        <button class="quick-add-card" type="button" data-modal="add-friend">
          <span class="quick-add-icon">友</span>
          <strong>添加朋友</strong>
          <small>通过聊天号或手机号查找</small>
        </button>
        <button class="quick-add-card" type="button" data-modal="create-group">
          <span class="quick-add-icon">群</span>
          <strong>创建群聊</strong>
          <small>选择联系人快速建群</small>
        </button>
      </div>`,
    "add-friend": `
      <div class="add-friend-panel">
        <div class="add-friend-hero">
          <span class="quick-add-icon">友</span>
          <div>
            <strong>找到对方后发送申请</strong>
            <span>支持聊天号或电话号码，验证通过后会进入通讯录。</span>
          </div>
        </div>
        <label class="security-field">
          <span>聊天号 / 电话号码</span>
          <input class="input" id="friendChatId" value="${escapeAttr(state.addFriendDraft?.chatId || "")}" placeholder="例如 cdz888 或 +60 号码">
          ${state.addFriendError ? `<span class="add-friend-error" role="status">${escapeHTML(state.addFriendError)}</span>` : ""}
        </label>
        <label class="security-field">
          <span>申请说明</span>
          <textarea class="textarea" id="friendGreeting">${escapeHTML(state.addFriendDraft?.greeting || "你好，我想加你为好友")}</textarea>
        </label>
      </div>`,
    "join-group": `
      <div class="add-friend-panel">
        <div class="add-friend-hero">
          <span class="quick-add-icon">群</span>
          <div>
            <strong>通过二维码或群号入群</strong>
            <span>粘贴群二维码链接，或输入 6 位数字群号。</span>
          </div>
        </div>
        <label class="security-field">
          <span>群二维码链接 / 群号</span>
          <input class="input" id="joinGroupInput" placeholder="例如 http://.../?joinGroup=...&code=...">
        </label>
      </div>`,
    "create-group": renderCreateGroupBody(),
    invite: `<p>选择联络人加入群聊。</p>${state.data.contacts.map(c => `<label class="setting-row"><span>${escapeHTML(c.nickname)}</span><input type="checkbox" name="inviteMember" value="${escapeAttr(c.id)}"></label>`).join("")}`,
    tag: `<input class="input" placeholder="标签名称" value="重要联系人">`,
    "send-contact": `${state.data.contacts.map(c => `<button class="list-item" data-send-contact="${c.id}"><img class="avatar" src="${avatarSrc(c.avatar)}"><div><div class="item-title">${escapeHTML(c.nickname)}</div><div class="item-preview">${c.chatId}</div></div></button>`).join("")}`,
    "edit-profile": `<input class="input" id="nickname" value="${escapeAttr(state.user.nickname)}"><textarea class="textarea" id="signature">${escapeHTML(state.user.signature || "")}</textarea>`,
    "edit-nickname": `<input class="input" id="nickname" value="${escapeAttr(state.user.nickname)}" placeholder="请输入昵称">`,
    "edit-signature": `<textarea class="textarea" id="signature" placeholder="请输入个性签名">${escapeHTML(state.user.signature || "")}</textarea>`
  };
  const titles = {
    "quick-add": "快捷操作",
    "add-friend": "添加朋友",
    "join-group": "扫码入群",
    "create-group": "创建群聊",
    invite: "新增成员",
    tag: "新增标签",
    "send-contact": "发送名片",
    "forward-message": "选择转发到",
    "edit-profile": "编辑资料",
    "edit-nickname": "编辑昵称",
    "edit-signature": "编辑个性签名"
  };
  return `
    <div class="modal-backdrop">
      <div class="modal">
        <header class="modal-header"><strong>${titles[state.modal] || "操作"}</strong><button class="icon-btn" data-close-modal title="关闭" aria-label="关闭">×</button></header>
        <div class="modal-body">${bodies[state.modal] || ""}</div>
        <footer class="modal-footer">
          <button class="ghost-btn inline" data-close-modal>取消</button>
          ${["quick-add", "send-contact", "forward-message"].includes(state.modal) ? "" : `<button class="primary-btn inline" data-confirm-modal="${state.modal}">确认</button>`}
        </footer>
      </div>
    </div>`;
}

function renderCreateGroupBody() {
  const contacts = state.data.contacts || [];
  const selected = new Set(state.createGroupSelection || []);
  const allSelected = contacts.length > 0 && contacts.every(contact => selected.has(contact.id));
  const draft = state.createGroupDraft || createDefaultCreateGroupDraft();
  return `
    <div class="create-group-panel">
      <div class="create-group-hero">
        <span class="quick-add-icon">群</span>
        <div>
          <strong>先选成员，再开始群聊</strong>
          <span>当前账号会自动成为群主，创建后可继续邀请更多联系人。</span>
        </div>
      </div>
      <label class="security-field">
        <span>群组名称</span>
        <input class="input" id="groupTitle" placeholder="群组名称" value="${escapeAttr(draft.title)}">
      </label>
      <div class="create-group-toolbar">
        <div>
          <strong>选择联系人</strong>
          <span data-create-group-selection-summary>已选择 ${selected.size} 位联系人</span>
        </div>
        <label class="create-group-all">
          <span>全选</span>
          <input type="checkbox" data-create-group-member="all" ${allSelected ? "checked" : ""} ${contacts.length ? "" : "disabled"}>
        </label>
      </div>
      <div class="create-group-list">
      ${contacts.map(contact => `
        <label class="create-group-member ${selected.has(contact.id) ? "selected" : ""}">
          <img class="avatar" src="${avatarSrc(contact.avatar)}" alt="">
          <span class="create-group-member-copy">
            <strong>${escapeHTML(contact.nickname || contact.chatId || "联系人")}</strong>
            <small>${escapeHTML(contact.remark || contact.signature || contact.chatId || "可邀请联系人")}</small>
          </span>
          <input type="checkbox" data-create-group-member="${escapeAttr(contact.id)}" ${selected.has(contact.id) ? "checked" : ""}>
        </label>`).join("") || `<div class="empty-state">暂无可邀请联系人</div>`}
      </div>
    </div>`;
}

function renderForwardModal() {
  const selection = state.forwardSelection || createDefaultForwardSelection();
  const selectedCount = (selection.selectedTargetIds || []).length;
  return `
    <div class="modal-backdrop">
      <div class="modal forward-modal" role="dialog" aria-modal="true" aria-labelledby="forwardModalTitle">
        <header class="forward-header">
          <button class="icon-btn" data-close-modal title="返回" aria-label="返回">‹</button>
          <div class="forward-title-stack">
            <strong id="forwardModalTitle">转发给</strong>
            <span class="forward-subtitle">${selectedCount ? `已选择 ${selectedCount} 个收件人` : "选择一个聊天或联系人"}</span>
          </div>
          <button class="forward-send-btn" type="button" data-forward-send ${selectedCount ? "" : "disabled"}>发送${selectedCount ? `(${selectedCount})` : ""}</button>
        </header>
        <div class="modal-body forward-modal-body">
          <div class="forward-search">
            <input class="input" id="forwardSearch" value="${escapeAttr(selection.query || "")}" placeholder="搜索收件人、群聊或标签" aria-label="搜索转发收件人">
          </div>
          <div id="forwardModalContent">${renderForwardModalContent(selection)}</div>
        </div>
      </div>
    </div>`;
}

function renderForwardModalContent(selection = state.forwardSelection || createDefaultForwardSelection()) {
  const targets = getForwardTargets(selection);
  const selectedIds = new Set(selection.selectedTargetIds || []);
  const selectedTargets = getSelectedForwardTargets(selection);
  const selectedVisibleCount = targets.filter(target => selectedIds.has(target.id)).length;
  const allSelected = targets.length > 0 && selectedVisibleCount === targets.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;
  return `
    ${selectedTargets.length ? `
      <div class="forward-selected-list">
        ${selectedTargets.map(target => `
          <button class="forward-selected-chip" type="button" data-forward-target-remove="${escapeAttr(target.id)}">
            <span>${escapeHTML(target.title)}</span>
            <span>×</span>
          </button>`).join("")}
      </div>
    ` : `<div class="forward-empty-hint">先点选收件人，选好后右上角发送。</div>`}
    <div class="forward-tabs">
      ${renderForwardTab("recent", "最近聊天", selection)}
      ${renderForwardTab("contacts", "联系人", selection)}
      ${renderForwardTab("groups", "群组", selection)}
      ${renderForwardTab("tags", "标签", selection)}
    </div>
    <div class="forward-list-toolbar">
      <span>${escapeHTML(getForwardTabLabel(selection.tab))} · ${targets.length} 项</span>
      <button class="forward-select-all" type="button" data-forward-toggle-all>
        <span>全选</span>
        <span class="forward-check ${allSelected ? "active" : ""} ${someSelected ? "partial" : ""}" aria-hidden="true">${allSelected ? "✓" : someSelected ? "−" : ""}</span>
      </button>
    </div>
    <div class="forward-target-list">
      ${targets.length ? targets.map(target => `
        <button class="forward-target ${selectedIds.has(target.id) ? "selected" : ""}" type="button" data-forward-target="${escapeAttr(target.id)}">
          <img class="avatar" src="${avatarSrc(target.avatar)}" alt="">
          <span class="forward-target-meta">
            <span class="forward-target-title">${escapeHTML(target.title)}</span>
            <span class="forward-target-subtitle">${escapeHTML(target.subtitle || "")}</span>
          </span>
          <span class="forward-check ${selectedIds.has(target.id) ? "active" : ""}">${selectedIds.has(target.id) ? "✓" : ""}</span>
        </button>`).join("") : `<div class="empty-state">${escapeHTML(getForwardEmptyState(selection))}</div>`}
    </div>`;
}

function renderForwardTab(id, label, selection) {
  const count = getForwardTargetCount(id);
  return `<button class="forward-tab ${selection.tab === id ? "active" : ""}" type="button" data-forward-tab="${id}">${label}${count ? ` (${count})` : ""}</button>`;
}

function getForwardTabLabel(tab) {
  return {
    recent: "最近聊天",
    contacts: "联系人",
    groups: "群组",
    tags: "标签"
  }[tab] || "收件人";
}

function refreshForwardModalContent() {
  const content = document.querySelector("#forwardModalContent");
  if (!content) return;
  content.innerHTML = renderForwardModalContent();
  const count = state.forwardSelection?.selectedTargetIds?.length || 0;
  const subtitle = document.querySelector(".forward-subtitle");
  if (subtitle) {
    subtitle.textContent = count ? `已选择 ${count} 个收件人` : "选择一个聊天或联系人";
  }
  const sendButton = document.querySelector("[data-forward-send]");
  if (sendButton) {
    sendButton.textContent = count ? `发送(${count})` : "发送";
    sendButton.disabled = count === 0;
  }
  bindForwardModalEvents();
}

function clearForwardSearchRefresh() {
  if (!state.forwardSearchRefreshTimer) return;
  clearTimeout(state.forwardSearchRefreshTimer);
  state.forwardSearchRefreshTimer = null;
}

function scheduleForwardSearchRefresh() {
  clearForwardSearchRefresh();
  state.forwardSearchRefreshTimer = setTimeout(() => {
    state.forwardSearchRefreshTimer = null;
    refreshForwardModalContent();
  }, 120);
}

function scheduleForwardSearchKeepAlive() {
  const keepAliveUntil = state.forwardSearchKeepAliveUntil || 0;
  if (Date.now() > keepAliveUntil) return;
  requestAnimationFrame(() => {
    if (Date.now() > (state.forwardSearchKeepAliveUntil || 0)) return;
    if (state.modal !== "forward-message") return;
    const active = document.activeElement;
    if (active && active.id === "forwardSearch") return;
    const input = document.querySelector("#forwardSearch");
    if (!(input instanceof HTMLInputElement)) return;
    input.focus();
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
  });
}

async function openSidePage(sidePage) {
  const group = currentGroup();
  if (group && !canOpenGroupSidePage(sidePage, currentGroupMember(group))) {
    state.sidePage = "settings";
    syncHashForSidePage("settings");
    toast("此功能仅限群主或管理员使用");
    render();
    return;
  }
  const openingInviteMembers = sidePage === "invite-members" && state.sidePage !== "invite-members";
  state.sidePage = sidePage;
  if (openingInviteMembers) state.inviteSelection = new Set();
  applySidePageSection(sidePage);
  syncHashForSidePage(sidePage);
  if (state.sidePage === "friend-requests") await loadFriendRequests();
  if (state.sidePage === "qrcode" && getConversation(state.selectedConversationId)?.kind === "group") {
    await loadConversationGroup(state.selectedConversationId);
  }
  if (state.sidePage === "applications") await loadGroupJoinRequests();
  if (state.sidePage === "group-blacklist") await loadGroupBlacklist();
  if (state.sidePage === "invite-members") await loadGroupBlacklist();
  if (state.sidePage === "audit-logs") await loadGroupAuditLogs();
  if (state.sidePage === "group-bots") await loadGroupBots();
  if (state.sidePage === "security-devices") await loadLoginDevices();
  if (["general-feedback", "feedback-history"].includes(state.sidePage)) await loadFeedbackHistory();
  if (state.sidePage === "media") await loadMessages(state.selectedConversationId);
  if (state.sidePage === "search") await searchConversationMessages();
  render();
}

function applySidePageSection(sidePage) {
  if (["friend-requests", "tags", "groups"].includes(sidePage)) state.section = "contact";
  if (isProfileOnlySidePage(sidePage)) state.section = "me";
  if (["qrcode", "collections"].includes(sidePage) && state.section !== "messages") state.section = "me";
}

function syncHashForSidePage(sidePage) {
  if (!isKnownSidePage(sidePage) || window.location.hash?.slice(1) === sidePage) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${sidePage}`);
}

function clearKnownSidePageHash() {
  const sidePage = window.location.hash?.slice(1);
  if (!sidePage || !isKnownSidePage(sidePage)) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function isProfileOnlySidePage(sidePage) {
  return [
    "profile", "profile-avatar", "profile-nickname", "profile-signature", "account",
    "notifications", "messaging", "messaging-batch", "messaging-batch-history", "messaging-batch-draft", "messaging-batch-targets",
    "stickers", "stickers-manage", "privacy", "blacklist", "blacklist-add", "security", "security-devices", "security-password-step2",
    "general", "general-language", "general-display", "general-feedback", "feedback-history", "general-about", "general-about-version", "general-debug", "switch-user"
  ].includes(sidePage);
}

function bindForwardModalEvents() {
  document.querySelectorAll("[data-forward-tab]").forEach(el => el.addEventListener("click", () => {
    ensureForwardSelection();
    clearForwardSearchRefresh();
    state.forwardSelection.tab = el.dataset.forwardTab;
    state.forwardSelection.selectedTargetIds = [];
    refreshForwardModalContent();
  }));
  document.querySelectorAll("[data-forward-target]").forEach(el => el.addEventListener("click", () => {
    toggleForwardTarget(el.dataset.forwardTarget);
  }));
  document.querySelectorAll("[data-forward-target-remove]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    toggleForwardTarget(el.dataset.forwardTargetRemove);
  }));
  document.querySelector("[data-forward-toggle-all]")?.addEventListener("click", () => {
    toggleAllForwardTargets();
  });
}

function bindEvents() {
  installNotificationSoundUnlock();
  document.querySelectorAll("[data-section]").forEach(el => el.addEventListener("click", async e => {
    e.preventDefault();
    clearKnownSidePageHash();
    state.section = el.dataset.section;
    if (state.section !== "messages") {
      state.selectedConversationId = null;
      syncConversationPath(null);
    }
    state.query = "";
    state.sidePage = state.section === "me" ? "profile" : null;
    render();
  }));
  document.querySelectorAll("[data-conversation]").forEach(el => el.addEventListener("click", async () => {
    clearKnownSidePageHash();
    state.mention = null;
    state.mentionIds = [];
    state.conversationMenu = null;
    await openConversation(el.dataset.conversation, { push: true });
  }));
  document.querySelector(".sidebar .list")?.addEventListener("contextmenu", e => {
    const item = e.target.closest("[data-conversation]");
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = item.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    state.suppressPointerUntil = Date.now() + 400;
    state.conversationMenu = {
      conversationId: item.dataset.conversation,
      x: Math.min(Math.max(12, rect.left + rect.width - 84), Math.max(12, viewportWidth - 132)),
      y: Math.min(Math.max(12, rect.top + 44), Math.max(12, viewportHeight - 220))
    };
    render();
  });
  if (!sidePageDelegateBound) {
    document.addEventListener("click", async e => {
      const entry = e.target.closest("[data-sidepage]");
      if (!entry) return;
      e.preventDefault();
      e.stopPropagation();
      await openSidePage(entry.dataset.sidepage);
    }, true);
    sidePageDelegateBound = true;
  }
  document.querySelectorAll("[data-sidepage]").forEach(el => el.addEventListener("click", async e => {
    e.preventDefault();
    await openSidePage(el.dataset.sidepage);
  }));
  document.querySelectorAll("[data-mobile-close]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    if (state.sidePage) {
      state.sidePage = null;
      window.history.replaceState(null, "", chatReturnPath(window.location));
    } else {
      state.selectedConversationId = null;
      syncConversationPath(null);
    }
    render();
  }));
  document.querySelectorAll("[data-filter]").forEach(el => el.addEventListener("click", () => {
    state.filter = el.dataset.filter;
    render();
  }));
  document.querySelectorAll("[data-request-filter]").forEach(el => el.addEventListener("click", () => {
    state.requestFilter = el.dataset.requestFilter;
    render();
  }));
  document.querySelectorAll("[data-contact-group-filter]").forEach(el => el.addEventListener("click", () => {
    state.contactGroupFilter = el.dataset.contactGroupFilter || "owned";
    render();
  }));
  document.querySelectorAll("[data-contact-mobile-view]").forEach(el => el.addEventListener("click", () => {
    if (el.dataset.contactMobileView === "contacts") {
      state.section = "contact";
      state.sidePage = null;
      render();
    }
  }));
  document.querySelectorAll("[data-collection-filter]").forEach(el => el.addEventListener("click", () => {
    state.collectionFilter = normalizeCollectionFilter(el.dataset.collectionFilter);
    render();
  }));
  document.querySelectorAll("[data-open-group-square]").forEach(el => el.addEventListener("click", () => {
    state.section = "explore";
    state.sidePage = null;
    state.exploreView = "groups";
    render();
  }));
  document.querySelectorAll("[data-action='search']").forEach(el => {
    el.addEventListener("compositionstart", () => {
      if (state.section === "messages" && state.sidePage === "search") {
        state.searchComposing = true;
      }
    });
    el.addEventListener("compositionend", e => {
      state.query = e.target.value;
      if (state.section === "messages" && state.sidePage === "search") {
        state.searchComposing = false;
        searchConversationMessages();
      }
    });
    el.addEventListener("input", e => {
    state.query = e.target.value;
    if (state.section === "messages" && state.sidePage === "search") {
      if (state.searchComposing || e.isComposing) return;
      searchConversationMessages();
      return;
    }
    render();
    });
  });
  document.querySelector("#loginForm")?.addEventListener("submit", onLogin);
  document.querySelector("[data-send-auth-code]")?.addEventListener("click", sendAuthCode);
  document.querySelectorAll("[data-auth-mode]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.authMode = el.dataset.authMode;
    render();
  }));
  document.querySelector("#composer")?.addEventListener("submit", onSendMessage);
  document.querySelector(".messages")?.addEventListener("contextmenu", e => {
    const item = e.target.closest("[data-message-id]");
    const container = e.currentTarget;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = resolveMessageMenuPosition(e, item, container);
    state.suppressPointerUntil = Date.now() + 400;
    state.messageMenu = {
      x,
      y,
      messageId: item.dataset.messageId
    };
    render();
  });
  const editor = document.querySelector("#editor");
  if (editor) {
    const captureEditorSelection = () => rememberEditorSelection(editor);
    editor.addEventListener("pointerdown", () => {
      if (state.toolMenu !== "emoji") return;
      // Let the browser place the caret first, then close the picker in place.
      requestAnimationFrame(() => {
        rememberEditorSelection(editor);
        dismissEmojiPicker();
      });
    });
    editor.addEventListener("input", () => {
      setCurrentDraftText(editor.value);
    });
    editor.addEventListener("input", updateMentionSuggestions);
    editor.addEventListener("input", captureEditorSelection);
    editor.addEventListener("keyup", () => {
      captureEditorSelection();
      updateMentionSuggestions();
    });
    editor.addEventListener("click", () => {
      captureEditorSelection();
      updateMentionSuggestions();
    });
    editor.addEventListener("select", captureEditorSelection);
    editor.addEventListener("focus", () => {
      captureEditorSelection();
      updateMentionSuggestions();
    });
    editor.addEventListener("keydown", handleEditorKeydown);
  }
  document.querySelectorAll("[data-tool]").forEach(el => {
    if (el.dataset.tool === "emoji") {
      el.addEventListener("pointerdown", event => {
        // Keep the current editor selection while opening or closing the picker.
        event.preventDefault();
        rememberEditorSelection();
      });
    }
    el.addEventListener("click", () => {
      if (el.dataset.tool === "emoji") rememberEditorSelection();
      state.toolMenu = state.toolMenu === el.dataset.tool ? null : el.dataset.tool;
      if (state.toolMenu === "emoji") state.emojiCategory = "frequent";
      state.mention = null;
      render();
    });
  });
  document.querySelectorAll("[data-emoji-category]").forEach(el => {
    el.addEventListener("pointerdown", event => event.preventDefault());
    el.addEventListener("click", () => {
      state.emojiCategory = el.dataset.emojiCategory || "frequent";
      render();
    });
  });
  document.querySelectorAll("[data-emoji]").forEach(el => {
    el.addEventListener("pointerdown", event => event.preventDefault());
    el.addEventListener("click", () => {
      insertIntoEditor(el.dataset.emoji || "");
      state.toolMenu = null;
      syncMentionMenu();
    });
  });
  document.querySelector(".messages")?.addEventListener("pointerdown", event => {
    if (state.toolMenu !== "emoji") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".emoji-popover")) return;
    dismissEmojiPicker();
  });
  document.querySelectorAll("[data-send-type]").forEach(el => el.addEventListener("click", () => sendSynthetic(el.dataset.sendType)));
  document.querySelectorAll("[data-pick-file]").forEach(el => el.addEventListener("click", () => pickAndUpload(el.dataset.pickFile)));
  document.querySelectorAll("[data-profile-action]").forEach(el => el.addEventListener("click", () => handleProfileAction(el.dataset.profileAction)));
  document.querySelectorAll("[data-profile-back]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.section = "me";
    state.sidePage = "profile";
    window.history.replaceState(null, "", profileCenterPath(window.location));
    render();
  }));
  document.querySelectorAll("[data-modal]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.modal = el.dataset.modal;
    if (state.modal === "create-group") {
      state.createGroupSelection = [];
      state.createGroupDraft = createDefaultCreateGroupDraft();
    }
    if (state.modal === "add-friend") {
      state.addFriendDraft = createAddFriendDraft();
      state.addFriendError = "";
    }
    if (state.modal !== "contact-detail") state.preview = null;
    render();
  }));
  document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", () => {
    state.modal = null;
    state.preview = null;
    state.createGroupSelection = [];
    state.createGroupDraft = createDefaultCreateGroupDraft();
    state.addFriendDraft = createAddFriendDraft();
    state.addFriendError = "";
    state.forwardPayload = null;
    state.forwardSelection = null;
    clearForwardSearchRefresh();
    state.scrollToBottom = true;
    render();
  }));
  document.querySelectorAll("[data-confirm-modal]").forEach(el => el.addEventListener("click", () => confirmModal(el.dataset.confirmModal)));
  const friendChatIdInput = document.querySelector("#friendChatId");
  const friendGreetingInput = document.querySelector("#friendGreeting");
  friendChatIdInput?.addEventListener("input", () => {
    state.addFriendDraft = updateAddFriendDraft(state.addFriendDraft, { chatId: friendChatIdInput.value });
    state.addFriendError = "";
  });
  friendGreetingInput?.addEventListener("input", () => {
    state.addFriendDraft = updateAddFriendDraft(state.addFriendDraft, { greeting: friendGreetingInput.value });
  });
  const groupTitleInput = document.querySelector("#groupTitle");
  groupTitleInput?.addEventListener("input", () => {
    state.createGroupDraft = updateCreateGroupDraft(state.createGroupDraft, { title: groupTitleInput.value });
  });
  document.querySelectorAll("[data-toast]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    toast(el.dataset.toast);
  }));
  document.querySelectorAll("[data-report]").forEach(el => el.addEventListener("click", () => submitReport(el.dataset.report)));
  document.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", e => handleAction(e, el.dataset.action)));
  document.querySelectorAll("[data-search-member]").forEach(el => el.addEventListener("click", () => {
    state.sidePage = "search";
    state.query = el.dataset.searchMember || "";
    render();
  }));
  document.querySelectorAll("[data-message-action]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    handleMessageAction(el.dataset.messageAction);
  }));
  document.querySelectorAll("[data-read-detail]").forEach(el => el.addEventListener("click", () => openMessageReadDetail(el.dataset.readDetail)));
  document.querySelectorAll("[data-retry-message]").forEach(el => el.addEventListener("click", () => retryMessage(el.dataset.retryMessage)));
  document.querySelectorAll("[data-conversation-action]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    handleConversationAction(el.dataset.conversationAction);
  }));
  document.querySelectorAll("[data-conversation-quick]").forEach(el => el.addEventListener("click", () => handleConversationQuickAction(el.dataset.conversationQuick)));
  document.querySelectorAll("[data-group-toggle]").forEach(el => el.addEventListener("click", () => toggleGroupSetting(el.dataset.groupToggle)));
  document.querySelectorAll("[data-group-save]").forEach(el => el.addEventListener("click", () => saveGroupSetting(el.dataset.groupSave)));
  document.querySelectorAll("[data-join-mode]").forEach(el => el.addEventListener("click", () => updateGroupJoinMode(el.dataset.joinMode)));
  document.querySelectorAll("[data-rate-limit]").forEach(el => el.addEventListener("click", () => updateGroupRateLimit(el.dataset.rateLimit)));
  document.querySelectorAll("[data-review-join]").forEach(el => el.addEventListener("click", () => reviewGroupJoinRequest(el.dataset.reviewJoin, el.dataset.status)));
  document.querySelectorAll("[data-transfer-owner]").forEach(el => el.addEventListener("click", () => requestGroupOwnerTransfer(el.dataset.transferOwner)));
  document.querySelectorAll("[data-confirm-owner-transfer]").forEach(el => el.addEventListener("click", () => transferGroupOwner(el.dataset.confirmOwnerTransfer)));
  document.querySelectorAll("[data-member-role]").forEach(el => el.addEventListener("click", () => updateGroupMemberRole(el.dataset.memberRole, el.dataset.role)));
  document.querySelectorAll("[data-blacklist-member]").forEach(el => el.addEventListener("click", () => blacklistGroupMember(el.dataset.blacklistMember)));
  document.querySelectorAll("[data-unblacklist-member]").forEach(el => el.addEventListener("click", () => unblacklistGroupMember(el.dataset.unblacklistMember)));
  document.querySelectorAll("[data-bot-toggle]").forEach(el => el.addEventListener("click", () => toggleGroupBot(el.dataset.botToggle)));
  document.querySelectorAll("[data-bot-create]").forEach(el => el.addEventListener("click", () => createGroupBot()));
  document.querySelectorAll("[data-bot-delete]").forEach(el => el.addEventListener("click", () => deleteGroupBot(el.dataset.botDelete)));
  document.querySelectorAll("[data-bot-save]").forEach(el => el.addEventListener("click", () => saveGroupBot(el.dataset.botSave)));
  document.querySelectorAll("[data-bot-interval]").forEach(el => el.addEventListener("click", () => setGroupBotInterval(el.dataset.botInterval, Number(el.dataset.seconds))));
  document.querySelectorAll("[data-bot-mode]").forEach(el => el.addEventListener("click", () => setGroupBotMode(el.dataset.botMode, el.dataset.mode)));
  document.querySelectorAll("[data-bot-run]").forEach(el => el.addEventListener("click", () => runGroupBotNow(el.dataset.botRun)));
  document.querySelectorAll("[data-revoke-login-device]").forEach(el => el.addEventListener("click", () => revokeLoginDevice(el.dataset.revokeLoginDevice)));
  document.querySelectorAll("[data-create-group-member]").forEach(el => el.addEventListener("change", () => toggleCreateGroupMember(el.dataset.createGroupMember)));
  document.querySelectorAll("[data-media-filter]").forEach(el => el.addEventListener("click", () => {
    state.mediaFilter = el.dataset.mediaFilter || "all";
    render();
  }));
  document.querySelectorAll("[data-search-result]").forEach(el => el.addEventListener("click", async () => {
    const navigation = prepareSearchResultNavigation(el.dataset.searchResult);
    if (!navigation) return;
    await loadMessages(state.selectedConversationId);
    state.sidePage = navigation.sidePage;
    state.highlightedMessageId = navigation.highlightedMessageId;
    state.query = navigation.query;
    state.searchResults = navigation.searchResults;
    render();
    requestAnimationFrame(() => jumpToQuotedMessage(navigation.highlightedMessageId));
  }));
  document.querySelector("[data-invite-toggle-all]")?.addEventListener("change", e => {
    const group = currentGroup();
    if (!group) return;
    const memberIds = new Set(group.members.map(member => member.userId));
    const blockedIds = new Set((state.data.groupBlacklists?.[group.id] || []).map(entry => entry.user.id));
    const candidateIds = state.data.contacts
      .filter(contact => !memberIds.has(contact.id) && !blockedIds.has(contact.id))
      .map(contact => contact.id);
    state.inviteSelection = updateInviteSelectionForCandidates(state.inviteSelection, candidateIds, e.target.checked);
    render();
  });
  document.querySelectorAll("[data-invite-member]").forEach(el => el.addEventListener("change", () => {
    state.inviteSelection = updateInviteSelection(state.inviteSelection, el.dataset.inviteMember, el.checked);
    render();
  }));
  document.querySelector("[data-invite-confirm]")?.addEventListener("click", () => inviteSelectedMembers());
  document.querySelectorAll("[data-setting-toggle]").forEach(el => el.addEventListener("click", () => toggleUserSetting(el.dataset.settingToggle)));
  document.querySelector("[data-notification-permission]")?.addEventListener("click", async () => {
    const previousPermission = currentBrowserNotificationPermissionView();
    const allowed = await requestBrowserNotificationPermission();
    if (!allowed) toast(previousPermission.toast);
    render();
  });
  document.querySelectorAll("[data-switch-user]").forEach(el => el.addEventListener("click", () => switchUser(el.dataset.switchUser)));
  document.querySelectorAll("[data-unblock-contact]").forEach(el => el.addEventListener("click", () => unblockContact(el.dataset.unblockContact)));
  document.querySelectorAll("[data-select-language]").forEach(el => el.addEventListener("click", () => selectLanguage(el.dataset.selectLanguage)));
  document.querySelectorAll("[data-select-display-mode]").forEach(el => el.addEventListener("click", () => selectDisplayMode(el.dataset.selectDisplayMode)));
  document.querySelectorAll("[data-batch-target-toggle]").forEach(el => el.addEventListener("click", () => toggleBatchTarget(el.dataset.batchTargetToggle)));
  document.querySelectorAll("[data-toggle-sticker]").forEach(el => el.addEventListener("click", () => toggleFavoriteSticker(el.dataset.toggleSticker)));
  document.querySelectorAll("[data-add-sticker]").forEach(el => el.addEventListener("click", () => addStickerToStore(el.dataset.addSticker)));
  document.querySelectorAll("[data-block-contact]").forEach(el => el.addEventListener("click", () => blockContact(el.dataset.blockContact)));
  document.querySelectorAll("[data-toggle-message-select]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    toggleMessageSelection(el.dataset.toggleMessageSelect);
  }));
  document.querySelectorAll("[data-multi-action]").forEach(el => el.addEventListener("click", () => handleMultiSelectAction(el.dataset.multiAction)));
  document.querySelectorAll("[data-clear-reply]").forEach(el => el.addEventListener("click", () => {
    setCurrentReplyDraft(null);
    render();
  }));
  document.querySelectorAll("[data-jump-quote]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    jumpToQuotedMessage(el.dataset.jumpQuote);
  }));
  document.querySelectorAll("[data-copy]").forEach(el => el.addEventListener("click", () => {
    navigator.clipboard?.writeText(el.dataset.copy);
    toast("已复制");
  }));
  document.querySelectorAll("[data-join-link-action]").forEach(el => el.addEventListener("click", () => handleJoinLinkAction(el.dataset.joinLinkAction)));
  document.querySelectorAll("[data-explore-open-group]").forEach(el => el.addEventListener("click", () => openGroupFromExplore(el.dataset.exploreOpenGroup, "settings")));
  document.querySelectorAll("[data-explore-open-applications]").forEach(el => el.addEventListener("click", () => openGroupFromExplore(el.dataset.exploreOpenApplications, "applications")));
  document.querySelectorAll("[data-explore-enter-group]").forEach(el => el.addEventListener("click", () => openGroupFromExplore(el.dataset.exploreEnterGroup, null)));
  document.querySelectorAll("[data-explore-scan-group]").forEach(el => el.addEventListener("click", () => scanGroupFromExplore(el.dataset.exploreScanGroup)));
  document.querySelectorAll("[data-explore-view]").forEach(el => el.addEventListener("click", () => {
    state.exploreView = el.dataset.exploreView || "discover";
    state.sidePage = null;
    render();
  }));
  document.querySelectorAll("[data-send-contact]").forEach(el => el.addEventListener("click", async () => {
    const result = buildContactCardPayload(state.data.contacts, el.dataset.sendContact);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    state.modal = null;
    try {
      await sendMessage(result.payload);
    } catch (error) {
      toast(sendErrorMessage(error));
    }
  }));
  document.querySelector("#forwardSearch")?.addEventListener("input", e => {
    ensureForwardSelection();
    state.forwardSelection.query = e.target.value;
    state.forwardSearchKeepAliveUntil = Date.now() + 400;
    scheduleForwardSearchRefresh();
  });
  document.querySelector("#forwardSearch")?.addEventListener("focus", () => {
    state.forwardSearchKeepAliveUntil = Date.now() + 400;
  });
  document.querySelector("#forwardSearch")?.addEventListener("focusout", () => {
    scheduleForwardSearchKeepAlive();
  });
  bindForwardModalEvents();
  document.querySelector("[data-forward-send]")?.addEventListener("click", async () => {
    await submitForwardSelection();
  });
  document.querySelectorAll("[data-action='mention']").forEach(el => el.addEventListener("click", () => openMentionPicker()));
  document.querySelector("#mentionMenu")?.addEventListener("click", e => {
    const target = e.target.closest("[data-mention-id]");
    if (!target) return;
    insertMentionById(target.dataset.mentionId);
  });
  document.querySelectorAll("[data-open-contact]").forEach(el => el.addEventListener("click", event => {
    if (shouldSuppressPointerAction(event)) return;
    openContactDetail(el.dataset.openContact);
  }));
  document.querySelectorAll("[data-open-image]").forEach(el => el.addEventListener("click", event => {
    if (shouldSuppressPointerAction(event)) return;
    openImagePreview({
      url: el.dataset.openImage,
      name: el.dataset.imageName || "图片预览"
    });
  }));
  document.querySelectorAll("[data-open-chat]").forEach(el => el.addEventListener("click", event => {
    if (shouldSuppressPointerAction(event)) return;
    openChatFromContactKey(el.dataset.openChat);
  }));
  document.querySelectorAll("[data-contact]").forEach(el => el.addEventListener("click", event => {
    if (shouldSuppressPointerAction(event)) return;
    openChatFromContactKey(el.dataset.contact);
  }));
  document.querySelector("#app")?.addEventListener("click", e => {
    if (!state.messageMenu) return;
    if (e.target.closest("[data-message-menu]")) return;
    state.messageMenu = null;
    render();
  });
  document.querySelector("#app")?.addEventListener("click", e => {
    if (!state.conversationMenu) return;
    if (e.target.closest("[data-conversation-menu]")) return;
    state.conversationMenu = null;
    render();
  });
  document.querySelectorAll("[data-contact-action]").forEach(el => el.addEventListener("click", () => {
    const action = el.dataset.contactAction;
    state.modal = action === "tags" ? "contact-tags" : "contact-remark";
    render();
  }));
  document.querySelectorAll("[data-confirm-contact-edit]").forEach(el => el.addEventListener("click", () => confirmContactEdit(el.dataset.confirmContactEdit)));
  document.querySelectorAll("[data-friend-request]").forEach(el => el.addEventListener("click", () => updateFriendRequest(el.dataset.friendRequest, el.dataset.status)));
  document.querySelectorAll("[data-confirm-group-invite]").forEach(el => el.addEventListener("click", () => confirmIncomingGroupInvite(el.dataset.confirmGroupInvite)));
  document.querySelectorAll("[data-member-action]").forEach(el => el.addEventListener("click", () => updateGroupMember(el.dataset.memberAction, el.dataset.memberId, el.dataset.muted === "true")));
  document.querySelector("#securityOldPassword")?.addEventListener("input", e => {
    state.securityOldPassword = e.target.value;
    const nextButton = document.querySelector("[data-security-next]");
    if (!(nextButton instanceof HTMLButtonElement)) return;
    nextButton.disabled = !state.securityOldPassword.trim();
  });
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  if (state.authMode === "code-login") {
    const validation = validateDemoLoginCode(form.get("code"));
    if (!validation.ok) {
      toast(validation.message);
      render();
      return;
    }
    try {
      const result = await api("/api/auth/code-login", {
        method: "POST",
        body: JSON.stringify({
          country: form.get("country"),
          phone: form.get("phone"),
          code: form.get("code")
        })
      });
      saveAuthDefaults(localStorage, { country: form.get("country") });
      await enterAuthedApp(result.token);
      toast("验证码登录成功");
    } catch (error) {
      const action = codeLoginFailureAction(error);
      toast(action.message);
    }
    render();
    return;
  }
  if (state.authMode === "forgot-password") {
    const codeValidation = validateDemoLoginCode(form.get("code"));
    const resetValidation = validateForgotPasswordReset(form.get("code"), form.get("newPassword"), form.get("confirmPassword"));
    const validation = !resetValidation.ok ? resetValidation : codeValidation;
    if (!validation.ok) {
      toast(validation.message);
      render();
      return;
    }
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          country: form.get("country"),
          phone: form.get("phone"),
          code: form.get("code"),
          newPassword: form.get("newPassword")
        })
      });
      state.authMode = "login";
      toast("密码已重置，请使用新密码登录");
    } catch (error) {
      toast(error?.message?.includes("404") ? "未找到该手机号" : "密码重置失败");
    }
    render();
    return;
  }
  try {
    const result = await api(state.authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    saveAuthDefaults(localStorage, { country: form.get("country") });
    await enterAuthedApp(result.token);
  } catch (error) {
    if (isNetworkFailure(error)) {
      state.useMock = false;
      toast("API 未启动，无法进入真实账号");
    } else {
      toast(state.authMode === "register" ? registerErrorMessage(error) : "手机号或密码不正确");
    }
  }
  render();
}

async function sendAuthCode() {
  const form = document.querySelector("#loginForm");
  if (!(form instanceof HTMLFormElement)) return;
  const data = new FormData(form);
  const phone = String(data.get("phone") || "").trim();
  if (!phone) {
    toast("请输入手机号码");
    render();
    return;
  }
  try {
    const result = await api("/api/auth/send-code", {
      method: "POST",
      body: JSON.stringify({
        country: data.get("country"),
        phone,
        purpose: state.authMode === "forgot-password" ? "reset-password" : "login"
      })
    });
    const codeInput = form.elements.namedItem("code");
    if (result?.code && codeInput instanceof HTMLInputElement) {
      codeInput.value = result.code;
    }
    toast(result?.code ? `验证码已发送：${result.code}` : "验证码已发送");
  } catch (error) {
    if (state.useMock) {
      toast(`本地演示验证码：${DEMO_LOGIN_CODE}`);
    } else {
      toast(sendCodeFailureMessage(error));
    }
  }
  render();
}

async function enterAuthedApp(token, options = {}) {
  localStorage.setItem("chatlite-token", token);
  state.authed = true;
  if (state.useMock) {
    hydrateMockSessionFromStorage(options.mockSession);
  } else {
    await loadData();
  }
  await preparePendingJoin();
  connectRealtime();
}

async function onSendMessage(event) {
  event.preventDefault();
  const blockedReason = getComposerBlockedReason(getConversation(state.selectedConversationId));
  if (blockedReason) {
    toast(blockedReason);
    return;
  }
  const body = document.querySelector("#editor")?.value?.trim() || "";
  if (!body) return;
  const mentions = uniqueMentionIds([
    ...state.mentionIds,
    ...collectMentionIds(body)
  ]);
  state.mentionIds = [];
  state.mention = null;
  setCurrentDraftText("");
  try {
    await sendMessage({ type: "text", body, mentions });
  } catch (error) {
    setCurrentDraftText(body);
    toast(sendErrorMessage(error));
    render();
  }
}

async function sendSynthetic(type) {
  const payloads = {
    image: { type: "image", body: "[图片]", attachment: { id: "demo-image", name: "photo.png", url: "/public/demo-photo.svg", mimeType: "image/svg+xml", size: 2048 } },
    file: { type: "file", body: "项目说明.pdf", attachment: { id: "demo-file", name: "项目说明.pdf", url: URL.createObjectURL(new Blob(["这是一个可打开的演示文件。"], { type: "text/plain;charset=utf-8" })), mimeType: "text/plain", size: 4096 } },
    voice: { type: "voice", body: "08" }
  };
  state.toolMenu = null;
  try {
    await sendMessage(payloads[type]);
  } catch (error) {
    toast(sendErrorMessage(error));
    render();
  }
}

async function pickAndUpload(kind) {
  const picker = document.querySelector("#filePicker");
  if (!picker) return;
  picker.accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "";
  picker.value = "";
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const result = buildAttachmentMessagePayload(kind, buildAttachmentDescriptor(file));
      if (!result.ok) {
        toast(result.message);
        return;
      }
      const attachment = await uploadFile(file);
      await sendMessage({ ...result.payload, attachment });
      toast("已上传并发送");
    } catch (error) {
      toast(uploadErrorMessage(error));
    }
  };
  picker.click();
}

function pickProfileAvatar() {
  const picker = document.querySelector("#filePicker");
  if (!picker) return;
  picker.accept = "image/*";
  picker.value = "";
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    const previous = state.user.avatar;
    try {
      const upload = await uploadFile(file);
      const nextAvatar = persistentProfileAvatarUrl(upload);
      state.user.avatar = nextAvatar;
      await persistUserPreferences({ avatar: nextAvatar });
      toast("头像已更新");
      render();
    } catch (error) {
      state.user.avatar = previous;
      toast("头像保存失败");
      render();
    }
  };
  picker.click();
}

async function uploadFile(file) {
  const mimeType = uploadMimeType(file);
  if (state.useMock) {
    return {
      id: id("local-file"),
      name: file.name,
      url: URL.createObjectURL(file),
      mimeType,
      size: file.size
    };
  }
  const signed = await api("/api/files/sign", {
    method: "POST",
    body: JSON.stringify({ name: file.name, mimeType, size: file.size })
  });
  const signedValidation = validateSignedUpload(signed, mimeType);
  if (!signedValidation.ok) {
    throw new Error(signedValidation.message);
  }
  const finalMimeType = signedValidation.mimeType;
  const token = localStorage.getItem("chatlite-token");
  const res = await fetch(API_BASE + signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": finalMimeType,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: file
  });
  if (!res.ok) throw new Error(await res.text());
  return {
    id: signed.id,
    name: file.name,
    url: signed.publicUrl,
    mimeType: finalMimeType,
    size: file.size
  };
}

async function sendMessage(payload) {
  const conversationId = state.selectedConversationId;
  const replyingTo = getCurrentReplyDraft();
  const finalPayload = replyingTo
    ? {
        ...payload,
        quote: structuredClone(replyingTo)
      }
    : payload;
  const pending = buildPendingMessage({ conversationId, user: state.user, payload: finalPayload });
  state.data.messages[conversationId] = [...(state.data.messages[conversationId] || []), pending];
  upsertConversationPreview(conversationId, pending);
  state.toolMenu = null;
  state.mentionIds = [];
  setCurrentReplyDraft(null);
  scheduleScrollToBottom();
  render();
  focusComposerEditor();

  try {
    const message = await persistOutgoingMessage(conversationId, finalPayload);
    state.data.messages[conversationId] = replacePendingMessage(state.data.messages[conversationId] || [], pending.id, message);
    upsertConversationPreview(conversationId, message);
  } catch (error) {
    const failed = markMessageFailed(pending, error);
    state.data.messages[conversationId] = replacePendingMessage(state.data.messages[conversationId] || [], pending.id, failed);
    upsertConversationPreview(conversationId, failed);
    toast(sendErrorMessage(error));
  }
  scheduleScrollToBottom();
  render();
  focusComposerEditor();
}

async function retryMessage(messageId) {
  const conversationId = state.selectedConversationId;
  const messages = state.data.messages[conversationId] || [];
  const failed = messages.find(message => message.id === messageId && message.sendStatus === "failed");
  if (!failed?.retryPayload) {
    toast("没有可重试的消息");
    return;
  }
  const retrying = { ...failed, sendStatus: "sending", sendError: "" };
  state.data.messages[conversationId] = replacePendingMessage(messages, messageId, retrying);
  upsertConversationPreview(conversationId, retrying);
  render();

  try {
    const message = await persistOutgoingMessage(conversationId, retrying.retryPayload);
    state.data.messages[conversationId] = replacePendingMessage(state.data.messages[conversationId] || [], retrying.id, message);
    upsertConversationPreview(conversationId, message);
    toast("发送成功");
  } catch (error) {
    const failedAgain = markMessageFailed(retrying, error);
    state.data.messages[conversationId] = replacePendingMessage(state.data.messages[conversationId] || [], retrying.id, failedAgain);
    upsertConversationPreview(conversationId, failedAgain);
    toast(sendErrorMessage(error));
  }
  scheduleScrollToBottom();
  render();
}

async function persistOutgoingMessage(conversationId, payload) {
  if (state.useMock) {
    if (mockGroupRateLimitExceeded()) {
      throw new Error("group rate limit exceeded");
    }
    return {
      id: id("msg"),
      conversationId,
      senderId: state.user.id,
      senderName: outgoingSenderName(conversationId),
      createdAt: new Date().toISOString(),
      ...payload
    };
  }
  return api(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function sendBatchMessage(conversationIds, body) {
  let sentCount = 0;
  for (const conversationId of conversationIds) {
    const message = await sendMessageToConversation(conversationId, { type: "text", body });
    upsertConversationPreview(conversationId, message);
    sentCount += 1;
  }
  sortConversations();
  return sentCount;
}

async function sendMessageToConversation(conversationId, payload) {
  if (state.useMock) {
    const message = {
      id: id("msg"),
      conversationId,
      senderId: state.user.id,
      senderName: outgoingSenderName(conversationId),
      createdAt: new Date().toISOString(),
      ...payload
    };
    state.data.messages[conversationId] = [...(state.data.messages[conversationId] || []), message];
    return message;
  }
  return api(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function mockGroupRateLimitExceeded() {
  const group = currentGroup();
  return groupRateLimitExceeded({
    conversation: getConversation(state.selectedConversationId),
    group,
    member: currentGroupMember(group),
    messages: state.data.messages[state.selectedConversationId] || [],
    user: state.user
  });
}

async function handleAction(event, action) {
  if (action === "simulate-scan-group") {
    await simulateScanCurrentGroup();
    return;
  }
  if (action === "mark-read") {
    await markAllConversationsRead();
  }
  if (action === "voice") {
    state.voiceMode = !state.voiceMode;
    render();
  }
  if (action === composerVoiceRecordAction()) sendSynthetic("voice");
  if (action === "clear-chat") {
    if (confirm("确定清除当前聊天记录？")) {
      await clearCurrentConversationMessages();
    }
  }
  if (action === "dissolve-group") {
    if (confirm("确定解散该群？解散后所有成员都不能再进入该群。")) {
      await dissolveCurrentGroup();
    }
  }
  if (action === "leave-group") {
    if (confirm("确定退出该群聊？退出后需要重新扫码或邀请才能加入。")) {
      await leaveCurrentGroup();
    }
  }
  if (action === "logout") {
    localStorage.removeItem("chatlite-token");
    state.authed = false;
    render();
  }
}

async function leaveCurrentGroup() {
  const group = currentGroup();
  const member = currentGroupMember(group);
  const conversationId = state.selectedConversationId;
  if (!group || !member || !canLeaveGroup(member)) {
    toast("群主需要先转让群主后才能退出");
    return;
  }
  try {
    if (!state.useMock) {
      await api(`/api/groups/${group.id}/members/${member.userId}`, { method: "DELETE" });
      // Read the server's current membership view so a stale event cannot
      // restore the group after this account has left it.
      await refreshGroupsAndConversations().catch(() => {});
    }
    removeGroupMemberFromState(group.id, member.userId);
    toast("已退出群聊");
    render();
  } catch (error) {
    toast("退出群聊失败");
    render();
  }
}

async function dissolveCurrentGroup() {
  const group = currentGroup();
  const conversationId = state.selectedConversationId;
  if (!group) return;
  if (!isCurrentUserOwner(group)) {
    toast("只有群主可以解散群");
    return;
  }
  try {
    if (!state.useMock) {
      await api(`/api/groups/${group.id}`, { method: "DELETE" });
    }
    state.data.groups = state.data.groups.filter(item => item.id !== group.id);
    state.data.conversations = state.data.conversations.filter(item => item.id !== conversationId);
    delete state.data.messages[conversationId];
    state.selectedConversationId = null;
    state.sidePage = null;
    syncConversationPath(null);
    toast("群已解散");
    render();
  } catch (error) {
    toast("解散群失败，请确认你仍是群主");
  }
}

async function clearCurrentConversationMessages() {
  const conversationId = state.selectedConversationId;
  if (!conversationId) return;
  try {
    if (!state.useMock) {
      await api(`/api/conversations/${conversationId}/messages/clear`, { method: "POST" });
    }
    state.data.messages[conversationId] = [];
    refreshConversationPreview(conversationId);
    state.searchResults = [];
    state.sidePage = "settings";
    toast("聊天记录已清除");
    render();
  } catch (error) {
    toast("清除聊天记录失败");
  }
}

async function clearAllConversationHistories() {
  const conversationIds = (state.data.conversations || []).map(conversation => conversation.id);
  try {
    if (!state.useMock) {
      await Promise.all(conversationIds.map(conversationId => (
        api(`/api/conversations/${conversationId}/messages/clear`, { method: "POST" })
      )));
    }
    state.data.messages = {};
    state.data.conversations = state.data.conversations.map(conversation => ({
      ...conversation,
      lastText: "",
      unread: 0,
      mentionedMe: false
    }));
    state.messageMenu = null;
    state.multiSelect = false;
    state.selectedMessageIds = [];
    toast("聊天记录已清除");
    render();
  } catch (error) {
    toast("清除聊天记录失败");
  }
}

async function markAllConversationsRead() {
  const conversations = state.data.conversations || [];
  const previous = conversations.map(conversation => ({
    id: conversation.id,
    unread: conversation.unread,
    mentionedMe: conversation.mentionedMe
  }));
  try {
    conversations.forEach(conversation => {
      conversation.unread = 0;
      conversation.mentionedMe = false;
    });
    if (!state.useMock) {
      await Promise.all(previous
        .filter(item => item.unread > 0 || item.mentionedMe)
        .map(item => api(`/api/conversations/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ unread: 0 })
        })));
    }
    toast("全部已读");
    render();
  } catch (error) {
    previous.forEach(item => {
      const conversation = getConversation(item.id);
      if (!conversation) return;
      conversation.unread = item.unread;
      conversation.mentionedMe = item.mentionedMe;
    });
    toast("全部已读保存失败");
    render();
  }
}

async function handleProfileAction(action) {
  if (action === "avatar") {
    pickProfileAvatar();
    return;
  }
  if (action === "reset-avatar") {
    const previous = state.user.avatar;
    const nextAvatar = avatar((state.user.nickname || "我").slice(0, 1));
    state.user.avatar = nextAvatar;
    try {
      await persistUserPreferences({ avatar: nextAvatar });
      toast("已恢复默认头像");
      render();
    } catch (error) {
      state.user.avatar = previous;
      toast("头像保存失败");
      render();
    }
    return;
  }
  if (action === "edit-nickname") {
    state.modal = "edit-nickname";
    render();
    return;
  }
  if (action === "edit-signature") {
    state.modal = "edit-signature";
    render();
    return;
  }
  if (action === "change-password") {
    state.sidePage = passwordActionTarget(action);
    render();
    return;
  }
  if (action === "manage-devices") {
    state.sidePage = "security-devices";
    await loadLoginDevices();
    render();
    return;
  }
  if (action === "refresh-login-devices") {
    await loadLoginDevices();
    toast("登录设备已刷新");
    render();
    return;
  }
  if (action === "clear-local-cache") {
    if (confirm("确定清理本地缓存吗？")) {
      clearLocalCacheState(state);
      LOCAL_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
      SESSION_CACHE_KEYS.forEach(key => sessionStorage.removeItem(key));
      toast("本地缓存已清理");
      render();
    }
    return;
  }
  if (action === "clear-chat-history") {
    if (!confirm("确定清除当前账号的本地聊天记录吗？")) return;
    await clearAllConversationHistories();
    return;
  }
  if (action === "open-last-batch") {
    state.sidePage = "messaging-batch-history";
    render();
    return;
  }
  if (action === "add-sticker") {
    state.sidePage = "stickers-manage";
    render();
    return;
  }
  if (action === "toggle-password-visibility") {
    const input = document.querySelector("#securityOldPassword") || document.querySelector("#securityNewPassword");
    if (!(input instanceof HTMLInputElement)) return;
    input.type = input.type === "password" ? "text" : "password";
    toast(input.type === "text" ? "已显示旧密码" : "已隐藏旧密码");
    return;
  }
  if (action === "reroute-line") {
    state.networkLine = nextNetworkLine(state.networkLine);
    localStorage.setItem("chatlite-network-line", state.networkLine);
    toast(`已切换到${state.networkLine}`);
    render();
    return;
  }
  if (action === "submit-feedback") {
    const text = document.querySelector("#feedbackText")?.value?.trim();
    if (!text) {
      toast("请先填写问题或建议");
      return;
    }
    const store = ensureFeedbackStore();
    const type = document.querySelector("#feedbackType")?.value || store.type;
    try {
      let item = { type, text, status: "已提交", createdAt: new Date().toISOString() };
      if (!state.useMock) {
        item = await api("/api/feedback", {
          method: "POST",
          body: JSON.stringify({ type, text })
        });
      }
      store.type = type;
      store.draft = "";
      store.history = [item, ...store.history.filter(existing => existing.id !== item.id)];
      state.sidePage = "feedback-history";
      toast("反馈已提交");
      render();
    } catch (error) {
      store.draft = text;
      toast("反馈提交失败");
    }
    return;
  }
  if (action === "send-batch-message") {
    const batch = getBatchDraft();
    const nextMessage = document.querySelector("#batchMessage")?.value?.trim();
    if (!nextMessage) {
      toast("请输入群发内容");
      return;
    }
    const targetIds = selectBatchConversationIds(state.data.conversations, batch.targets);
    if (!targetIds.length) {
      toast("没有可群发的目标");
      return;
    }
    try {
      const sentCount = await sendBatchMessage(targetIds, nextMessage);
      batch.message = nextMessage;
      batch.history.unshift({
        title: `刚刚发送到 ${sentCount} 个聊天`,
        body: nextMessage,
        status: "已发送"
      });
      state.sidePage = "messaging-batch-history";
      toast(`群发任务已发送到 ${sentCount} 个聊天`);
      render();
    } catch (error) {
      toast(error?.message || "群发任务发送失败");
    }
    return;
  }
  if (action === "save-password") {
    const nextPassword = document.querySelector("#securityNewPassword")?.value?.trim() || "";
    const confirmPassword = document.querySelector("#securityConfirmPassword")?.value?.trim() || "";
    const validation = validatePasswordChange(state.securityOldPassword, nextPassword, confirmPassword);
    if (!validation.ok) {
      toast(validation.message);
      return;
    }
    try {
      if (!state.useMock) {
        await api("/api/me/password", {
          method: "POST",
          body: JSON.stringify({
            oldPassword: state.securityOldPassword,
            newPassword: nextPassword
          })
        });
      }
      state.securityOldPassword = "";
      state.sidePage = "security";
      toast("新密码已保存，下次登录请使用新密码");
      render();
    } catch (error) {
      toast(error?.message?.includes("401") ? "旧密码不正确" : "密码保存失败");
    }
    return;
  }
  if (action === "save-profile-nickname") {
    const nextNickname = document.querySelector("#profileNicknameInput")?.value?.trim();
    if (!nextNickname) {
      toast("请输入昵称");
      return;
    }
    const previous = state.user.nickname;
    state.user.nickname = nextNickname;
    try {
      await persistUserPreferences({ nickname: nextNickname });
      syncDefaultGroupNicknames(previous, nextNickname);
      state.sidePage = "profile";
      toast("昵称已保存");
      render();
    } catch (error) {
      state.user.nickname = previous;
      toast("昵称保存失败");
      render();
    }
    return;
  }
  if (action === "save-profile-signature") {
    const nextSignature = document.querySelector("#profileSignatureInput")?.value?.trim() || "";
    const previous = state.user.signature;
    state.user.signature = nextSignature;
    try {
      await persistUserPreferences({ signature: nextSignature });
      state.sidePage = "profile";
      toast("个性签名已保存");
      render();
    } catch (error) {
      state.user.signature = previous;
      toast("个性签名保存失败");
      render();
    }
    return;
  }
  if (action === "save-qrcode") {
    await downloadQrCard();
    toast("二维码已保存");
    return;
  }
  if (action === "simulate-incoming-friend") {
    simulateIncomingFriendRequest();
    return;
  }
  if (action === "simulate-incoming-group") {
    simulateIncomingGroupInvite();
    return;
  }
  if (action === "simulate-outgoing-friend") {
    simulateOutgoingFriendRequest();
    return;
  }
  if (action === "simulate-outgoing-group") {
    simulateOutgoingGroupInvite();
    return;
  }
  if (action === "simulate-outgoing-friend-accepted") {
    simulateOutgoingRequestDecision("friend", "accepted");
    return;
  }
  if (action === "simulate-outgoing-friend-rejected") {
    simulateOutgoingRequestDecision("friend", "rejected");
    return;
  }
  if (action === "simulate-outgoing-group-accepted") {
    simulateOutgoingRequestDecision("group-invite", "accepted");
    return;
  }
  if (action === "simulate-outgoing-group-rejected") {
    simulateOutgoingRequestDecision("group-invite", "rejected");
    return;
  }
  if (action === "reset-incoming-simulations") {
    resetIncomingSimulationState();
    return;
  }
  if (action === "deactivate") {
    if (!confirm(accountActionCopy(state.useMock).confirm)) return;
    localStorage.removeItem("chatlite-token");
    state.authed = false;
    render();
  }
}

async function submitReport(reason) {
  const targetId = state.selectedConversationId;
  if (!targetId) {
    toast("请选择要检举的聊天");
    return;
  }
  if (!reason?.trim()) {
    toast("请选择检举原因");
    return;
  }
  if (state.useMock) {
    toast("检举已提交");
    return;
  }
  try {
    await api("/api/reports", {
      method: "POST",
      body: JSON.stringify({ targetId, reason })
    });
    toast("检举已提交");
  } catch (error) {
    toast("检举提交失败");
  }
}

function toggleCreateGroupMember(targetId) {
  const contacts = state.data.contacts || [];
  state.createGroupSelection = toggleCreateGroupSelection(state.createGroupSelection, targetId, contacts);
  refreshCreateGroupSelection(contacts);
}

function refreshCreateGroupSelection(contacts = []) {
  const selected = new Set(state.createGroupSelection || []);
  const allSelected = contacts.length > 0 && contacts.every(contact => selected.has(contact.id));
  const summary = document.querySelector("[data-create-group-selection-summary]");
  if (summary) summary.textContent = `已选择 ${selected.size} 位联系人`;
  document.querySelectorAll("[data-create-group-member]").forEach(input => {
    const isAll = input.dataset.createGroupMember === "all";
    const checked = isAll ? allSelected : selected.has(input.dataset.createGroupMember);
    input.checked = checked;
    input.closest(".create-group-member")?.classList.toggle("selected", checked);
  });
}

async function confirmModal(kind) {
  let successToast = "已保存";
  if (kind === "add-friend") {
    state.addFriendDraft = updateAddFriendDraft(state.addFriendDraft, {
      chatId: document.querySelector("#friendChatId")?.value || "",
      greeting: document.querySelector("#friendGreeting")?.value || ""
    });
    const chatId = state.addFriendDraft.chatId.trim();
    const greeting = state.addFriendDraft.greeting.trim();
    if (!chatId) {
      state.addFriendError = "请输入聊天号";
      toast(state.addFriendError);
      return;
    }
    const match = findUserByChatId(chatId);
    if (!match && state.useMock) {
      toast("未找到这个聊天号");
      return;
    }
    const blockedGroup = match ? findBlockedSharedGroupForUser(match) : null;
    if (blockedGroup) {
      toast(`${blockedGroup.title} 已禁止成员互加好友`);
      return;
    }
    if (match && state.data.contacts.some(contact => contact.id === match.id)) {
      toast("你们已经是好友了");
      return;
    }
    if (state.useMock) {
      const privacy = getUserPrivacy(match);
      if (privacy.friendVerification) {
        state.data.requests.unshift(createLocalFriendRequest(match, greeting, "outgoing"));
        successToast = "已发送好友申请，等待对方验证";
      } else {
        addContactToRoster(match);
        ensureConversationForContact(match);
        successToast = "已直接添加为好友";
      }
    } else {
      try {
        const created = await api("/api/friend-requests", { method: "POST", body: JSON.stringify({ chatId, greeting }) });
        await refreshFriendRealtimeState();
        successToast = created?.status === "accepted" ? "已直接添加为好友" : "好友申请已发送";
      } catch (error) {
        state.addFriendError = friendRequestErrorMessage(error);
        toast(state.addFriendError);
        return;
      }
    }
    state.addFriendDraft = createAddFriendDraft();
    state.addFriendError = "";
  }
  if (kind === "join-group") {
    const raw = document.querySelector("#joinGroupInput")?.value?.trim() || "";
    const parsed = parseJoinInput(raw);
    if (!parsed.groupId) {
      toast("请输入群二维码链接或群号");
      return;
    }
    state.pendingJoin = {
      groupId: parsed.groupId,
      code: parsed.code || "",
      status: "",
      group: null
    };
    await preparePendingJoin();
    state.modal = null;
    state.section = "messages";
    state.sidePage = null;
    render();
    return;
  }
  if (kind === "create-group") {
    const payload = buildCreateGroupPayload(state.createGroupDraft?.title, state.createGroupSelection, state.data.contacts || []);
    const group = state.useMock ? createLocalGroup(payload.title, payload.memberIds) : await api("/api/groups", { method: "POST", body: JSON.stringify(payload) });
    state.data.groups.push(group);
    const conv = { id: `group-${group.id}`, kind: "group", title: group.title, avatar: group.avatar, unread: 0, lastText: "群聊已创建", lastAt: new Date().toISOString() };
    state.data.conversations.unshift(conv);
    state.selectedConversationId = conv.id;
    syncConversationPath(conv.id, { push: true });
    state.data.messages[conv.id] = [];
    state.section = "messages";
    state.createGroupSelection = [];
    state.createGroupDraft = createDefaultCreateGroupDraft();
    persistCurrentRegisteredMockSession();
  }
  if (kind === "edit-profile") {
    const previous = { nickname: state.user.nickname, signature: state.user.signature };
    state.user.nickname = document.querySelector("#nickname").value.trim() || state.user.nickname;
    state.user.signature = document.querySelector("#signature").value.trim();
    try {
      await persistUserPreferences({ nickname: state.user.nickname, signature: state.user.signature });
    } catch (error) {
      state.user.nickname = previous.nickname;
      state.user.signature = previous.signature;
      toast("资料保存失败");
    }
  }
  if (kind === "edit-nickname") {
    const previous = state.user.nickname;
    state.user.nickname = document.querySelector("#nickname").value.trim() || state.user.nickname;
    try {
      await persistUserPreferences({ nickname: state.user.nickname });
    } catch (error) {
      state.user.nickname = previous;
      toast("昵称保存失败");
    }
  }
  if (kind === "edit-signature") {
    const previous = state.user.signature;
    state.user.signature = document.querySelector("#signature").value.trim();
    try {
      await persistUserPreferences({ signature: state.user.signature });
    } catch (error) {
      state.user.signature = previous;
      toast("个性签名保存失败");
    }
  }
  if (kind === "invite") {
    const group = currentGroup();
    const selected = [...document.querySelectorAll('input[name="inviteMember"]:checked')].map(input => input.value);
    if (!selected.length) {
      toast("请先选择要邀请的成员");
      return;
    }
    let invitedDirectly = 0;
    let invitedPending = 0;
    for (const userId of selected) {
      if (state.useMock) {
        const contact = state.data.contacts.find(c => c.id === userId);
        if (contact && !group.members.some(m => m.userId === userId)) {
          const privacy = getUserPrivacy(contact);
          if (privacy.inviteGroupVerification) {
            state.data.requests.unshift(createLocalGroupInviteRequest(contact, group));
            invitedPending += 1;
          } else {
            group.members.push(createGroupMember(group, userId, contact.nickname));
            invitedDirectly += 1;
          }
        }
      } else {
        const result = await api(`/api/groups/${group.id}/members`, { method: "POST", body: JSON.stringify({ userId }) });
        if (result?.status === "pending") {
          invitedPending += 1;
        } else {
          invitedDirectly += 1;
        }
      }
    }
    if (!state.useMock && group) {
      const updated = await api(`/api/groups/${group.id}`);
      Object.assign(group, updated);
    }
    successToast = invitedPending && invitedDirectly
      ? `已直接邀请 ${invitedDirectly} 人，另有 ${invitedPending} 人待验证`
      : invitedPending
        ? `已发送 ${invitedPending} 条入群邀请，等待对方验证`
        : `已直接邀请 ${invitedDirectly} 人入群`;
  }
  state.modal = null;
  toast(successToast);
  render();
}

async function updateFriendRequest(requestId, status, options = {}) {
  let acceptedConversationId = null;
  const request = state.data.requests.find(item => item.id === requestId);
  if (!request) return;
  const direction = getRequestDirection(request);
  const localOnly = state.useMock || Boolean(request.simulated);
  if (status === "accepted" && request.type === "group-invite" && direction === "incoming" && !options.skipReview) {
    state.preview = structuredClone(request);
    state.modal = "group-invite-review";
    render();
    return;
  }
  try {
    if (localOnly) {
      request.status = status;
      if (status === "accepted" && request.type === "friend" && !state.data.contacts.some(contact => contact.id === request.user.id)) {
        addContactToRoster(request.user);
      }
      if (status === "accepted" && request.type === "group-invite" && direction === "outgoing") {
        const group = state.data.groups.find(item => item.id === request.groupId);
        if (group && !group.members.some(member => member.userId === request.user.id)) {
          group.members.push({ userId: request.user.id, nickname: request.user.nickname, role: "member", muted: false });
        }
      }
      if (status === "accepted" && request.type === "group-invite" && direction === "incoming") {
        ensureGroupConversation({
          ...(request.groupData || { id: request.groupId, title: request.groupTitle, avatar: avatar("群"), members: [] }),
          members: [
            ...((request.groupData?.members || []).filter(member => member.userId !== state.user.id)),
            { userId: state.user.id, nickname: state.user.nickname, role: "member", muted: false }
          ]
        });
        acceptedConversationId = `group-${request.groupId}`;
      }
    } else {
      if (request.type === "group-invite") {
        const updated = await api(`/api/groups/${request.groupId}/join-requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        state.data.requests = state.data.requests.map(item => item.id === requestId ? { ...item, ...updated, type: "group-invite" } : item);
        await Promise.all([
          loadFriendRequests(),
          refreshGroupsAndConversations()
        ]);
        if (status === "accepted") {
          acceptedConversationId = `group-${request.groupId}`;
        }
      } else {
        const updated = await api(`/api/friend-requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        state.data.requests = state.data.requests.map(item => item.id === requestId ? { ...item, ...updated } : item);
        await loadFriendRequests();
        if (status === "accepted") {
          state.data.contacts = listOrEmpty(await api("/api/contacts"));
        }
      }
    }
  } catch (error) {
    toast(friendRequestReviewErrorMessage(error));
    await loadFriendRequests().catch(() => {});
    render();
    return;
  }
  toast(status === "accepted" ? "已处理请求" : "已拒绝请求");
  if (status === "accepted" && acceptedConversationId) {
    state.section = "messages";
    state.selectedConversationId = acceptedConversationId;
    syncConversationPath(acceptedConversationId, { push: true });
    state.sidePage = null;
    await loadMessages(state.selectedConversationId);
    scheduleScrollToBottom();
  }
  render();
  if (status === "accepted" && acceptedConversationId) void acknowledgeConversationRead(acceptedConversationId);
}

async function confirmIncomingGroupInvite(requestId) {
  state.modal = null;
  state.preview = null;
  await updateFriendRequest(requestId, "accepted", { skipReview: true });
}

async function simulateOutgoingRequestDecision(type, status) {
  const request = getLatestPendingOutgoingRequest(type);
  if (!request) {
    toast(type === "group-invite" ? "当前没有待处理的入群邀请可模拟" : "当前没有待处理的好友申请可模拟");
    return;
  }
  request.simulated = true;
  await updateFriendRequest(request.id, status, { skipReview: true });
}

async function updateGroupMember(action, userId, muted) {
  const group = currentGroup();
  if (!group) return;
  if (action === "remove" && !confirm("确定移除该成员？")) return;
  try {
    if (state.useMock) {
      if (action === "remove") {
        group.members = group.members.filter(member => member.userId !== userId);
      } else {
        const member = group.members.find(item => item.userId === userId);
        if (member) member.muted = muted;
      }
    } else if (action === "remove") {
      await api(`/api/groups/${group.id}/members/${userId}`, { method: "DELETE" });
      group.members = group.members.filter(member => member.userId !== userId);
    } else {
      const updated = await api(`/api/groups/${group.id}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ muted })
      });
      group.members = group.members.map(member => member.userId === userId ? updated : member);
    }
  } catch (error) {
    toast(groupMemberActionErrorMessage(error));
    render();
    return;
  }
  toast(action === "remove" ? "成员已移除" : muted ? "成员已禁言" : "已解除禁言");
  render();
}

async function blacklistGroupMember(userId) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以管理群黑名单");
    return;
  }
  const member = group.members.find(item => item.userId === userId);
  if (!member || member.role === "owner") {
    toast("不能拉黑该成员");
    return;
  }
  if (!isCurrentUserOwner(group) && member.role !== "member") {
    toast("管理员不能拉黑群主或其他管理员");
    return;
  }
  if (!confirm(`确定将 ${member.nickname} 加入群黑名单？对方会被移出本群。`)) return;
  const reason = "群管理拉黑";
  state.data.groupBlacklists ||= {};
  if (state.useMock) {
    const entries = state.data.groupBlacklists[group.id] || [];
    const avatarValue = avatar((member.nickname || "黑").slice(0, 1));
    state.data.groupBlacklists[group.id] = [
      { groupId: group.id, user: { id: member.userId, nickname: member.nickname, chatId: member.userId, avatar: avatarValue }, reason, createdAt: new Date().toISOString() },
      ...entries.filter(entry => entry.user.id !== member.userId)
    ];
    group.members = group.members.filter(item => item.userId !== member.userId);
  } else {
    await api(`/api/groups/${group.id}/blacklist`, {
      method: "POST",
      body: JSON.stringify({ userId, reason })
    });
    const [entries, updated] = await Promise.all([
      api(`/api/groups/${group.id}/blacklist`),
      api(`/api/groups/${group.id}`)
    ]);
    state.data.groupBlacklists[group.id] = entries;
    Object.assign(group, updated);
  }
  if (state.sidePage === "audit-logs") await loadGroupAuditLogs(group);
  toast("已加入群黑名单");
  render();
}

async function unblacklistGroupMember(userId) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以管理群黑名单");
    return;
  }
  state.data.groupBlacklists ||= {};
  if (state.useMock) {
    state.data.groupBlacklists[group.id] = (state.data.groupBlacklists[group.id] || []).filter(entry => entry.user.id !== userId);
  } else {
    await api(`/api/groups/${group.id}/blacklist/${userId}`, { method: "DELETE" });
    state.data.groupBlacklists[group.id] = await api(`/api/groups/${group.id}/blacklist`);
  }
  if (state.sidePage === "audit-logs") await loadGroupAuditLogs(group);
  toast("已解除群黑名单");
  render();
}

async function updateGroupMemberRole(userId, role) {
  const group = currentGroup();
  if (!group || !isCurrentUserOwner(group)) {
    toast("只有群主可以管理管理员");
    return;
  }
  if (!["admin", "member"].includes(role)) return;
  if (state.useMock) {
    const member = group.members.find(item => item.userId === userId);
    if (member && member.role !== "owner") member.role = role;
  } else {
    const updated = await api(`/api/groups/${group.id}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    });
    group.members = group.members.map(member => member.userId === userId ? updated : member);
  }
  toast(role === "admin" ? "已设为管理员" : "已移除管理员");
  state.sidePage = "group-admins";
  render();
}

function requestGroupOwnerTransfer(userId) {
  const group = currentGroup();
  if (!group || !isCurrentUserOwner(group)) {
    toast("只有群主可以转让群主身份");
    return;
  }
  const target = group.members.find(member => member.userId === userId);
  if (!target || target.userId === state.user?.id) {
    toast("请选择有效的群成员");
    return;
  }
  state.preview = target;
  state.modal = "confirm-owner-transfer";
  render();
}

async function transferGroupOwner(userId) {
  const group = currentGroup();
  if (!group || !isCurrentUserOwner(group)) {
    toast("只有群主可以转让群主身份");
    return;
  }
  const target = group.members.find(member => member.userId === userId);
  if (!target || target.userId === state.user?.id) {
    toast("请选择有效的群成员");
    return;
  }
  if (state.useMock) {
    Object.assign(group, applyOwnerTransfer(group, state.user?.id, userId));
  } else {
    try {
      const updated = await api(`/api/groups/${group.id}/transfer-owner`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      Object.assign(group, updated);
    } catch (error) {
      toast(ownerTransferErrorMessage(error));
      return;
    }
  }
  state.modal = null;
  state.preview = null;
  state.sidePage = "group-admins";
  toast("群主已转让");
  render();
}

async function loadGroupJoinRequests(group = currentGroup()) {
  if (!group) return;
  state.data.groupJoinRequests ||= {};
  if (state.useMock) {
    state.data.groupJoinRequests[group.id] ||= [];
    return;
  }
  try {
    state.data.groupJoinRequests[group.id] = await api(`/api/groups/${group.id}/join-requests`);
  } catch (error) {
    state.data.groupJoinRequests[group.id] = [];
    toast("入群申请加载失败");
  }
}

async function loadGroupAuditLogs(group = currentGroup()) {
  if (!group || !canManageGroup(group)) return;
  state.data.auditLogs ||= {};
  if (state.useMock) {
    state.data.auditLogs[group.id] ||= [];
    return;
  }
  try {
    state.data.auditLogs[group.id] = await api(`/api/groups/${group.id}/audit-logs`);
  } catch (error) {
    state.data.auditLogs[group.id] = [];
    toast("操作日志加载失败");
  }
}

async function loadGroupBlacklist(group = currentGroup()) {
  if (!group || !canManageGroup(group)) return;
  state.data.groupBlacklists ||= {};
  if (state.useMock) {
    state.data.groupBlacklists[group.id] ||= [];
    return;
  }
  try {
    state.data.groupBlacklists[group.id] = await api(`/api/groups/${group.id}/blacklist`);
  } catch (error) {
    state.data.groupBlacklists[group.id] = [];
    toast("群黑名单加载失败");
  }
}

async function loadGroupBots(group = currentGroup()) {
  if (!group || !canManageGroup(group)) return;
  state.data.groupBots ||= {};
  if (state.useMock) {
    state.data.groupBots[group.id] ||= [defaultGroupBot(group.id)];
    return;
  }
  try {
    state.data.groupBots[group.id] = await api(`/api/groups/${group.id}/bots`);
  } catch (error) {
    state.data.groupBots[group.id] = [defaultGroupBot(group.id)];
    toast("群机器人加载失败");
  }
}

async function loadFeedbackHistory() {
  const store = ensureFeedbackStore();
  if (state.useMock) return;
  try {
    store.history = await api("/api/feedback");
  } catch (error) {
    toast("反馈记录加载失败");
  }
}

async function searchConversationMessages() {
  const conversationId = state.selectedConversationId;
  const query = state.query.trim();
  const seq = ++state.searchRequestSeq;
  if (!query) {
    state.searchResults = [];
    state.searchLoading = false;
    render();
    return;
  }
  state.searchLoading = true;
  try {
    const results = state.useMock
      ? (state.data.messages[conversationId] || []).filter(message => messageMatchesQuery(message, query, { contacts: state.data.contacts || [] }))
      : await api(`/api/conversations/${conversationId}/messages/search?q=${encodeURIComponent(query)}`);
    if (seq !== state.searchRequestSeq) return;
    state.searchResults = results;
  } catch (error) {
    if (seq !== state.searchRequestSeq) return;
    state.searchResults = [];
    toast("搜索聊天记录失败");
  } finally {
    if (seq === state.searchRequestSeq) {
      state.searchLoading = false;
      render();
    }
  }
}

async function openMessageReadDetail(messageId) {
  const conversationId = state.selectedConversationId;
  const message = (state.data.messages[conversationId] || []).find(item => item.id === messageId);
  if (!message) return;
  if (!canShowReadDetailAction(message, state.user, getConversation(conversationId))) {
    toast("只有自己发出的群消息可以查看已读详情");
    return;
  }
  state.readDetailMessageId = messageId;
  state.readDetail = null;
  state.readDetailLoading = true;
  state.sidePage = "read-detail";
  render();
  try {
    if (state.useMock) {
      state.readDetail = buildMockReadDetail(message);
    } else {
      state.readDetail = await api(`/api/conversations/${conversationId}/messages/${messageId}/reads`);
    }
  } catch (error) {
    state.readDetail = { messageId, read: [], unread: [] };
    toast(String(error?.message || "").includes("read detail permission required") ? "只有发送者可以查看已读详情" : "已读详情加载失败");
  } finally {
    state.readDetailLoading = false;
    render();
  }
}

function buildMockReadDetail(message) {
  const group = currentGroup();
  const members = (group?.members || []).filter(member => member.userId !== message.senderId);
  const readCount = Math.min(Number(message.readCount || 0), members.length);
  return {
    messageId: message.id,
    read: members.slice(0, readCount).map(member => ({ userId: member.userId, nickname: member.nickname, readAt: message.createdAt })),
    unread: members.slice(readCount).map(member => ({ userId: member.userId, nickname: member.nickname }))
  };
}

function defaultGroupBot(groupId) {
  return {
    groupId,
    id: "announcement",
    name: "公告机器人",
    enabled: false,
    message: "欢迎来到群聊，请留意群公告。",
    keywordRules: [],
    scheduleMode: "interval",
    intervalSeconds: 300,
    dailyTime: "",
    nextRunAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
}

function groupBotSummary(group) {
  const bots = state.data.groupBots?.[group.id] || [];
  const enabledCount = bots.filter(bot => bot.enabled).length;
  return enabledCount ? `已启用 ${enabledCount} 个` : "公告机器人";
}

function groupBotById(group, botId) {
  state.data.groupBots ||= {};
  state.data.groupBots[group.id] ||= [defaultGroupBot(group.id)];
  return state.data.groupBots[group.id].find(bot => bot.id === botId);
}

async function createGroupBot() {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以新增群机器人");
    return;
  }
  state.data.groupBots ||= {};
  const bots = state.data.groupBots[group.id] || [defaultGroupBot(group.id)];
  const payload = buildNewGroupBotPayload(bots.length);
  if (state.useMock) {
    const bot = {
      groupId: group.id,
      id: id("bot"),
      enabled: false,
      nextRunAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      ...payload
    };
    state.data.groupBots[group.id] = [...bots, bot];
  } else {
    const bot = await api(`/api/groups/${group.id}/bots`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.data.groupBots[group.id] = [...bots, bot];
  }
  toast("已新增群机器人");
  render();
}

async function deleteGroupBot(botId) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以删除群机器人");
    return;
  }
  if (!botId || botId === "announcement") {
    toast("默认公告机器人不能删除");
    return;
  }
  const bot = groupBotById(group, botId);
  if (!bot) return;
  if (!confirm(`确定删除“${bot.name || "群机器人"}”吗？`)) return;
  if (!state.useMock) {
    await api(`/api/groups/${group.id}/bots/${botId}`, { method: "DELETE" });
  }
  state.data.groupBots[group.id] = (state.data.groupBots[group.id] || []).filter(item => item.id !== botId);
  toast("已删除群机器人");
  render();
}

async function toggleGroupBot(botId) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以管理群机器人");
    return;
  }
  const bot = groupBotById(group, botId);
  if (!bot) return;
  await persistGroupBot(botId, { enabled: !bot.enabled });
}

async function setGroupBotInterval(botId, intervalSeconds) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) return;
  const bot = groupBotById(group, botId);
  if (!bot) return;
  bot.scheduleMode = "interval";
  bot.intervalSeconds = intervalSeconds;
  render();
}

async function setGroupBotMode(botId, scheduleMode) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) return;
  const bot = groupBotById(group, botId);
  if (!bot) return;
  bot.scheduleMode = scheduleMode === "daily" ? "daily" : "interval";
  if (bot.scheduleMode === "daily") {
    bot.dailyTime ||= "20:00";
  }
  render();
}

async function saveGroupBot(botId) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以管理群机器人");
    return;
  }
  const bot = groupBotById(group, botId);
  if (!bot) return;
  const name = document.querySelector(`#botName-${CSS.escape(botId)}`)?.value?.trim() || bot.name || "";
  const message = document.querySelector(`#botMessage-${CSS.escape(botId)}`)?.value?.trim() || "";
  if (!name) {
    toast("请输入机器人名称");
    return;
  }
  if (!message) {
    toast("请输入机器人自动发送内容");
    return;
  }
  await persistGroupBot(botId, buildGroupBotPatch(bot, {
    name,
    message,
    keywordRules: readBotKeywordRules(botId),
    dailyTime: document.querySelector(`#botDailyTime-${CSS.escape(botId)}`)?.value || bot.dailyTime || "20:00"
  }));
}

function readBotKeywordRules(botId) {
  return [0, 1, 2].map(index => ({
    keyword: document.querySelector(`#botKeyword-${CSS.escape(botId)}-${index}`)?.value || "",
    reply: document.querySelector(`#botReply-${CSS.escape(botId)}-${index}`)?.value || ""
  }));
}

async function persistGroupBot(botId, patch) {
  const group = currentGroup();
  const bot = group ? groupBotById(group, botId) : null;
  if (!group || !bot) return;
  if (state.useMock) {
    Object.assign(bot, patch);
    if (patch.enabled === true) {
      bot.nextRunAt = new Date(Date.now() + (bot.intervalSeconds || 300) * 1000).toISOString();
    }
  } else {
    const updated = await api(`/api/groups/${group.id}/bots/${botId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: patch.name ?? bot.name,
        enabled: patch.enabled,
        message: patch.message ?? bot.message,
        keywordRules: patch.keywordRules ?? bot.keywordRules ?? [],
        scheduleMode: patch.scheduleMode ?? bot.scheduleMode ?? "interval",
        intervalSeconds: patch.intervalSeconds ?? bot.intervalSeconds,
        dailyTime: patch.dailyTime ?? bot.dailyTime
      })
    });
    state.data.groupBots[group.id] = (state.data.groupBots[group.id] || []).map(item => item.id === botId ? updated : item);
  }
  toast("机器人设置已保存");
  render();
}

async function runGroupBotNow(botId) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以测试群机器人");
    return;
  }
  const bot = groupBotById(group, botId);
  if (!bot) return;
  const message = document.querySelector(`#botMessage-${CSS.escape(botId)}`)?.value?.trim() || bot.message || "";
  if (!message) {
    toast("请输入机器人自动发送内容");
    return;
  }
  if (state.useMock) {
    await sendMessage({ type: "text", body: message });
  } else {
    const sent = await api(`/api/groups/${group.id}/bots/${botId}/run`, {
      method: "POST",
      body: JSON.stringify({ message })
    });
    state.data.messages[state.selectedConversationId] = [...(state.data.messages[state.selectedConversationId] || []), sent];
    upsertConversationPreview(state.selectedConversationId, sent);
  }
  toast("机器人测试消息已发送");
  scheduleScrollToBottom();
  render();
}

function auditActionLabel(action) {
  return {
    join_accepted: "同意入群",
    join_rejected: "拒绝入群",
    member_invited: "邀请成员",
    member_added: "邀请成员",
    member_removed: "移除成员",
    member_left: "退出群聊",
    member_muted: "禁言成员",
    member_unmuted: "解除禁言",
    auto_mute_new_members_updated: "修改入群自动禁言",
    admin_added: "设置管理员",
    admin_removed: "移除管理员",
    owner_transferred: "群主转让",
    member_blacklisted: "加入群黑名单",
    member_unblacklisted: "解除群黑名单",
    bot_enabled: "启用群机器人",
    bot_disabled: "停用群机器人",
    bot_plan_updated: "更新机器人计划",
    bot_created: "新增群机器人",
    bot_deleted: "删除群机器人",
    bot_keyword_rules_updated: "更新关键词回复",
    bot_test_sent: "测试机器人发送",
    rate_limit_updated: "修改发言限制",
    qrcode_refreshed: "刷新群二维码",
    messages_deleted: "删除消息"
  }[action] || "群管理操作";
}

async function reviewGroupJoinRequest(requestId, status) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以处理入群申请");
    return;
  }
  if (!["accepted", "rejected"].includes(status)) return;
  state.data.groupJoinRequests ||= {};
  if (state.useMock) {
    const requests = state.data.groupJoinRequests[group.id] || [];
    const request = requests.find(item => item.id === requestId);
    if (!request) return;
    request.status = status;
    if (status === "accepted" && !group.members.some(member => member.userId === request.user.id)) {
      group.members.push(createGroupMember(group, request.user.id, request.user.nickname));
    }
  } else {
    try {
      await api(`/api/groups/${group.id}/join-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await Promise.all([
        loadGroupJoinRequests(group),
        api(`/api/groups/${group.id}`).then(updated => Object.assign(group, updated))
      ]);
    } catch (error) {
      toast(groupJoinReviewErrorMessage(error));
      await loadGroupJoinRequests(group);
      render();
      return;
    }
  }
  toast(status === "accepted" ? "已同意入群" : "已拒绝入群");
  render();
}

async function handleJoinLinkAction(action) {
  const join = state.pendingJoin;
  const group = join?.group;
  if (!join) return;
  if (action === "cancel") {
    clearPendingJoin();
    render();
    return;
  }
  if (action === "open" && group) {
    await openJoinedGroup(group);
    return;
  }
  if (action !== "confirm" || !group) return;
  if (join.code && groupJoinCode(group) !== join.code) {
    toast("二维码已失效或群号不匹配");
    return;
  }
  const existingPending = findPendingJoinRequest(state.data.groupJoinRequests?.[group.id], group.id, state.user);
  if (existingPending) {
    join.status = "已申请，请等待管理员审核";
    toast(join.status);
    render();
    return;
  }
  if (state.useMock) {
    if (group.joinMode === "closed") {
      join.status = "该群暂不允许加入";
      render();
      return;
    }
    if (group.joinMode === "approval") {
      state.data.groupJoinRequests ||= {};
      state.data.groupJoinRequests[group.id] ||= [];
      state.data.groupJoinRequests[group.id].unshift({
        id: id("gjr"),
        groupId: group.id,
        user: state.user,
        greeting: "通过二维码申请入群",
        status: "pending",
        createdAt: new Date().toISOString()
      });
      join.status = "入群申请已提交，等待管理员审核";
      toast("入群申请已提交");
      render();
      return;
    }
    if (!group.members.some(member => member.userId === state.user.id)) {
      group.members.push(createGroupMember(group, state.user.id, state.user.nickname));
    }
    await openJoinedGroup(group);
    return;
  }
  try {
    const request = await api(`/api/groups/${group.id}/join-requests`, {
      method: "POST",
      body: JSON.stringify({ greeting: "通过二维码申请入群", joinCode: join.code || "" })
    });
    if (request.status === "pending") {
      state.data.groupJoinRequests ||= {};
      state.data.groupJoinRequests[group.id] = [
        request,
        ...(state.data.groupJoinRequests[group.id] || []).filter(item => item.id !== request.id)
      ];
    }
    const updated = await api(`/api/groups/${group.id}`);
    Object.assign(group, updated);
    if (request.status === "accepted") {
      await openJoinedGroup(group);
      toast("已加入群聊");
      return;
    }
    join.status = "入群申请已提交，等待管理员审核";
    toast("入群申请已提交");
    render();
  } catch (error) {
    join.status = groupJoinErrorMessage(error);
    toast(join.status);
    render();
  }
}

async function openJoinedGroup(group) {
  await refreshGroupsAndConversations();
  const latestGroup = state.data.groups.find(item => item.id === group.id) || group;
  ensureGroupConversation(latestGroup);
  clearPendingJoin();
  state.section = "messages";
  state.selectedConversationId = `group-${latestGroup.id}`;
  syncConversationPath(state.selectedConversationId, { push: true });
  state.sidePage = null;
  await loadMessages(state.selectedConversationId);
  scheduleScrollToBottom();
  render();
  void acknowledgeConversationRead(state.selectedConversationId);
}

async function simulateScanCurrentGroup() {
  const group = currentGroup() || state.data.groups[0];
  if (!group) {
    toast("暂无可扫码加入的群");
    return;
  }
  const link = new URL(groupQrText(group));
  state.pendingJoin = {
    groupId: link.searchParams.get("joinGroup") || group.id,
    code: link.searchParams.get("code") || "",
    status: "",
    group
  };
  await preparePendingJoin();
  state.section = "messages";
  state.sidePage = null;
  render();
}

async function scanGroupFromExplore(groupId) {
  const group = getExploreGroups().find(item => item.id === groupId) || await resolveJoinGroup(groupId);
  if (!group) {
    toast("未找到该群聊");
    return;
  }
  const link = new URL(groupQrText(group));
  state.pendingJoin = {
    groupId: link.searchParams.get("joinGroup") || group.id,
    code: link.searchParams.get("code") || "",
    status: "",
    group
  };
  await preparePendingJoin();
  state.section = "messages";
  state.sidePage = null;
  render();
}

async function openGroupFromExplore(groupId, sidePage) {
  if (!groupId) {
    toast("暂无可打开的群");
    return;
  }
  const group = await resolveJoinGroup(groupId);
  if (!group) {
    toast("未找到该群聊");
    return;
  }
  ensureGroupConversation(group);
  state.section = "messages";
  state.selectedConversationId = `group-${group.id}`;
  syncConversationPath(state.selectedConversationId, { push: true });
  state.sidePage = sidePage;
  await loadMessages(state.selectedConversationId);
  if (sidePage === "applications") await loadGroupJoinRequests(group);
  render();
}

async function updateGroupJoinMode(joinMode) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以修改入群方式");
    return;
  }
  if (!["public_qr", "approval", "closed"].includes(joinMode)) return;
  await patchCurrentGroup({ joinMode });
  toast(`入群方式已改为${joinModeLabel(joinMode)}`);
  render();
}

async function updateGroupRateLimit(key) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以修改发言频率限制");
    return;
  }
  const options = {
    off: { enabled: false, windowSeconds: 10, maxMessages: 3 },
    fast: { enabled: true, windowSeconds: 10, maxMessages: 3 },
    steady: { enabled: true, windowSeconds: 60, maxMessages: 10 }
  };
  if (!options[key]) return;
  await patchCurrentGroup({ rateLimit: options[key] });
  toast(options[key].enabled ? `已开启${groupRateLimitLabel(options[key])}` : "已关闭发言频率限制");
  render();
}

async function toggleGroupSetting(key) {
  const group = currentGroup();
  if (!group || !canManageGroup(group)) {
    toast("只有群主和管理员可以修改群组管理设置");
    return;
  }
  if (!["disableMemberAddFriend", "allMuted", "autoMuteNewMembers"].includes(key)) return;
  await patchCurrentGroup({ [key]: !group[key] });
  toast(group[key] ? "已开启" : "已关闭");
  render();
}

async function saveGroupSetting(kind) {
  const group = currentGroup();
  if (!group) return;
  if (kind === "qrcode") {
    await downloadGroupQrCard(group);
    toast("群二维码已保存");
    return;
  }
  if (kind === "refresh-qrcode") {
    if (!canManageGroup(group)) {
      toast("只有群主和管理员可以刷新群二维码");
      return;
    }
    if (!confirm("确定刷新群二维码？旧二维码将立即失效。")) return;
    const expiryMode = document.querySelector("#groupQrExpiryMode")?.value || "7d";
    if (state.useMock) {
      group.qrCode = `qr-${Date.now().toString(36)}`;
      group.qrCodeExpiresAt = mockGroupQrExpiry(expiryMode);
    } else {
      const updated = await api(`/api/groups/${group.id}/qrcode/refresh`, {
        method: "POST",
        body: JSON.stringify({ expiryMode })
      });
      Object.assign(group, updated);
    }
    toast(`群二维码已刷新，${groupQrExpiryLabel(group)}，旧二维码已失效`);
    render();
    return;
  }
  if (kind === "announcement") {
    const announcement = document.querySelector("#groupAnnouncementInput")?.value?.trim() || "";
    if (announcement.length > 500) {
      toast("群公告最多 500 个字");
      return;
    }
    await patchCurrentGroup({ announcement });
    toast("群公告已保存");
  }
  if (kind === "nickname") {
    const myNickname = document.querySelector("#groupNicknameInput")?.value?.trim() || "";
    if (!myNickname) {
      toast("请输入群昵称");
      return;
    }
    if (myNickname.length > 15) {
      toast("群昵称最多 15 个字");
      return;
    }
    await patchCurrentGroup({ myNickname });
    toast("群昵称已保存");
  }
  if (kind === "name") {
    const title = document.querySelector("#groupNameInput")?.value?.trim() || "";
    if (!title) {
      toast("请输入群组名称");
      return;
    }
    await patchCurrentGroup({ title });
    toast("群组名称已保存");
  }
  render();
}

async function patchCurrentGroup(patch) {
  const group = currentGroup();
  if (!group) return null;
  const conversationId = `group-${group.id}`;
  let updated;
  if (state.useMock) {
    Object.assign(group, patch);
    if (Object.prototype.hasOwnProperty.call(patch, "myNickname")) {
      syncCurrentUserGroupNickname(group, patch.myNickname, conversationId);
      persistMockGroupNickname(group.id, patch.myNickname);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      syncCurrentGroupTitle(group, patch.title, conversationId);
      persistMockGroupTitle(group.id, patch.title);
    }
    updated = group;
  } else {
    updated = await api(`/api/groups/${group.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    Object.assign(group, updated);
    if (Object.prototype.hasOwnProperty.call(patch, "myNickname")) {
      syncCurrentUserGroupNickname(group, updated.myNickname || patch.myNickname, conversationId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      syncCurrentGroupTitle(group, updated.title || patch.title, conversationId);
    }
  }
  return updated;
}

async function inviteSelectedMembers() {
  const group = currentGroup();
  if (!group) return;
  const restoredCheckedIds = [...document.querySelectorAll("[data-invite-member]:checked")]
    .map(input => input.dataset.inviteMember)
    .filter(Boolean);
  const selected = selectedInviteMemberIds(state.inviteSelection, restoredCheckedIds);
  if (!selected.length) {
    toast("请先选择要邀请的成员");
    return;
  }
  const blockedIds = new Set((state.data.groupBlacklists?.[group.id] || []).map(entry => entry.user.id));
  const blockedSelected = selected.filter(userId => blockedIds.has(userId));
  if (blockedSelected.length) {
    toast("黑名单成员不能被邀请入群");
    return;
  }
  const confirmButton = document.querySelector("[data-invite-confirm]");
  if (confirmButton instanceof HTMLButtonElement) {
    confirmButton.disabled = true;
    confirmButton.textContent = "邀请中...";
  }
  try {
    let invitedDirectly = 0;
    let invitedPending = 0;
    for (const userId of selected) {
      if (state.useMock) {
        const contact = state.data.contacts.find(c => c.id === userId);
        if (contact && !group.members.some(member => member.userId === userId)) {
          const privacy = getUserPrivacy(contact);
          if (privacy.inviteGroupVerification) {
            state.data.requests.unshift(createLocalGroupInviteRequest(contact, group));
            invitedPending += 1;
          } else {
            group.members.push(createGroupMember(group, userId, contact.nickname));
            appendLocalGroupSystemMessage(group, `${contact.nickname} 已加入群聊`);
            invitedDirectly += 1;
          }
        }
      } else {
        const result = await api(`/api/groups/${group.id}/members`, {
          method: "POST",
          body: JSON.stringify({ userId })
        });
        if (result?.status === "pending") {
          invitedPending += 1;
        } else if (result?.userId) {
          upsertGroupMember(group.id, result);
          invitedDirectly += 1;
        }
      }
    }
    if (!state.useMock) {
      const [updated, messages] = await Promise.all([
        api(`/api/groups/${group.id}`),
        api(`/api/conversations/group-${group.id}/messages`)
      ]);
      upsertGroup(updated);
      state.data.messages[`group-${group.id}`] = messages;
    }
    state.inviteSelection = new Set();
    state.sidePage = "members";
    toast(groupInviteToast(invitedDirectly, invitedPending));
    render();
  } catch (error) {
    toast(groupMemberActionErrorMessage(error));
  } finally {
    if (state.sidePage === "invite-members") {
      const button = document.querySelector("[data-invite-confirm]");
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
        button.textContent = "确认";
      }
    }
  }
}

async function handleConversationQuickAction(action) {
  const conversation = getConversation(state.selectedConversationId);
  if (!conversation) return;
  if (action === "pin") {
    await updateConversationSetting(conversation.id, { pinned: !conversation.pinned });
  }
  if (action === "mute") {
    await updateConversationSetting(conversation.id, { muted: !conversation.muted });
  }
  if (action === "burn-after-read") {
    await updateConversationSetting(conversation.id, { burnAfterRead: !conversation.burnAfterRead });
  }
}

async function updateConversationSetting(conversationId, patch) {
  const conversation = getConversation(conversationId);
  if (!conversation) return;
  const previous = { pinned: conversation.pinned, muted: conversation.muted, unread: conversation.unread, burnAfterRead: conversation.burnAfterRead };
  Object.assign(conversation, patch);
  try {
    if (!state.useMock) {
      const updated = await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      Object.assign(conversation, updated);
    }
    if (Object.hasOwn(patch, "pinned")) toast(conversation.pinned ? "已置顶" : "已取消置顶");
    if (Object.hasOwn(patch, "muted")) toast(conversation.muted ? "已开启免打扰" : "已取消免打扰");
    if (Object.hasOwn(patch, "burnAfterRead")) toast(conversation.burnAfterRead ? "已开启阅后即焚" : "已关闭阅后即焚");
  } catch (error) {
    conversation.pinned = previous.pinned;
    conversation.muted = previous.muted;
    conversation.unread = previous.unread;
    conversation.burnAfterRead = previous.burnAfterRead;
    toast("会话设置保存失败");
  }
  sortConversations();
  render();
}

function seg(filter, label) {
  return `<button class="seg-btn ${state.filter === filter ? "active" : ""}" data-filter="${filter}">${label}</button>`;
}

function requestSeg(filter, label) {
  return `<button class="seg-btn ${state.requestFilter === filter ? "active" : ""}" data-request-filter="${filter}">${label}</button>`;
}

function contactGroupSeg(filter, label) {
  return `<button class="seg-btn ${state.contactGroupFilter === filter ? "active" : ""}" data-contact-group-filter="${filter}">${escapeHTML(label)}</button>`;
}

function collectionSeg(filter, label) {
  const activeFilter = normalizeCollectionFilter(state.collectionFilter);
  return `<button class="seg-btn ${activeFilter === filter ? "active" : ""}" data-collection-filter="${filter}">${escapeHTML(label)}</button>`;
}

function renderCollectionsContent() {
  const allCollections = state.data?.collections || [];
  const collections = filteredCollections();
  const emptyLabel = collectionFilterLabel(state.collectionFilter);
  const filterLabel = emptyLabel === "全部" ? "全部收藏" : `${emptyLabel}收藏`;
  const summary = collectionSummary(allCollections, collections);
  return `
    <section class="section collections-overview-section">
      <div class="collections-overview-card">
        <div>
          <span class="collections-overview-kicker">SAVED BOARD</span>
          <h3>把重要消息留在手边</h3>
          <p>${summary.total ? `当前筛选显示 ${summary.filtered} 条，最近保存于 ${escapeHTML(summary.latestLabel)}。` : "保存聊天里的文字、文件、图片和语音后，会在这里形成个人剪贴本。"}</p>
        </div>
        <div class="collections-overview-stats" aria-label="收藏分类统计">
          <span><strong>${summary.total}</strong><small>总收藏</small></span>
          <span><strong>${summary.text}</strong><small>文字</small></span>
          <span><strong>${summary.media}</strong><small>图片视频</small></span>
          <span><strong>${summary.file}</strong><small>文件</small></span>
          <span><strong>${summary.voice}</strong><small>语音</small></span>
        </div>
        <div class="collections-filter-note">
          <span>当前视图</span>
          <strong>${escapeHTML(filterLabel)}</strong>
        </div>
      </div>
    </section>
    <div class="segmented collection-filter-tabs">${collectionFilters.map(item => collectionSeg(item.key, item.label)).join("")}</div>
    <div class="list collections-list">
      ${collections.map(c => `
        <article class="list-item collection-list-item">
          <img class="avatar" src="${avatarSrc(collectionAvatar(c))}" alt="">
          <div class="collection-item-body">
            <div class="item-title">${escapeHTML(c.title)}</div>
            <div class="item-preview">${escapeHTML(c.preview)}</div>
            <div class="collection-item-meta">
              <span>${escapeHTML(collectionKindLabel(c.kind))}</span>
              <span>${escapeHTML(formatCollectionSavedAt(c.createdAt))}</span>
            </div>
          </div>
        </article>`).join("") || `<div class="empty-state collection-empty-state">${emptyLabel === "全部" ? "还没有收藏，长按消息就能把它收入这里。" : `暂无${emptyLabel}收藏，切到全部看看其他内容。`}</div>`}
    </div>`;
}

function filteredCollections() {
  return filterCollections(state.data?.collections || [], state.collectionFilter);
}

function collectionAvatar(item) {
  const labels = {
    text: "文",
    image: "图",
    video: "视",
    file: "文",
    voice: "语"
  };
  return avatar(labels[item?.kind] || "藏");
}

function collectionSummary(allCollections, collections) {
  const counts = { text: 0, media: 0, file: 0, voice: 0 };
  (allCollections || []).forEach(item => {
    if (item?.kind === "image" || item?.kind === "video") counts.media += 1;
    else if (item?.kind === "file") counts.file += 1;
    else if (item?.kind === "voice") counts.voice += 1;
    else counts.text += 1;
  });
  const latest = [...(allCollections || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return {
    ...counts,
    total: (allCollections || []).length,
    filtered: (collections || []).length,
    latestLabel: formatCollectionSavedAt(latest?.createdAt)
  };
}

function collectionKindLabel(kind) {
  const labels = {
    text: "文字摘录",
    image: "图片",
    video: "视频",
    file: "文件",
    voice: "语音"
  };
  return labels[kind] || "收藏";
}

function formatCollectionSavedAt(value) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return `${date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })} ${formatTime(value)}`;
}

function filteredContactGroups() {
  const filter = state.contactGroupFilter || "owned";
  return (state.data.groups || []).filter(group => {
    const role = groupRoleForCurrentUser(group);
    if (filter === "owned") return role === "owner";
    if (filter === "joined") return role && role !== "owner";
    return true;
  });
}

function groupRoleForCurrentUser(group) {
  return (group?.members || []).find(member => member.userId === state.user?.id)?.role || "";
}

function groupRoleLabel(role) {
  if (role === "owner") return "我建立的";
  if (role === "admin") return "管理员";
  return "我加入的";
}

function filteredConversations() {
  const q = state.query.toLowerCase();
  return sortConversationList(listOrEmpty(state.data.conversations).filter(c => {
    const matchesQ = !q || `${c.title} ${c.lastText}`.toLowerCase().includes(q);
    const matchesFilter = state.filter === "all" || (state.filter === "unread" && c.unread) || (state.filter === "group" && c.kind === "group");
    return matchesQ && matchesFilter;
  }));
}

function sortConversations() {
  state.data.conversations = sortConversationList(listOrEmpty(state.data.conversations));
}

function filteredContacts() {
  const q = state.query.toLowerCase();
  return listOrEmpty(state.data.contacts).filter(c => !q || `${c.nickname} ${c.chatId} ${c.signature} ${c.remark || ""} ${(c.tags || []).join(" ")}`.toLowerCase().includes(q));
}

function getConversation(id) {
  return state.data.conversations.find(c => c.id === id);
}

async function loadConversationGroup(conversationId) {
  if (state.useMock || !state.data || !conversationId) return null;
  const conversation = getConversation(conversationId);
  if (conversation?.kind !== "group") return null;

  const groupId = conversation.id.replace("group-", "");
  try {
    const group = await api(`/api/groups/${encodeURIComponent(groupId)}`);
    upsertGroup(group);
    return group;
  } catch (_) {
    // The current list response remains usable if a detail refresh is unavailable.
    return null;
  }
}

function ensureRealtimeConversation(conversationId, message = {}) {
  if (!conversationId) return null;
  const existing = getConversation(conversationId);
  if (existing) return existing;
  if (!conversationId.startsWith("session-")) return null;

  const peerId = message.senderId && message.senderId !== state.user?.id
    ? message.senderId
    : privateConversationPeerId(conversationId);
  const legacyId = peerId ? `session-${peerId}` : "";
  const legacy = legacyId ? getConversation(legacyId) : null;
  if (legacy) {
    legacy.id = conversationId;
    if (state.selectedConversationId === legacyId) {
      state.selectedConversationId = conversationId;
      syncConversationPath(conversationId);
    }
    state.data.messages[conversationId] = [
      ...(state.data.messages[legacyId] || []),
      ...(state.data.messages[conversationId] || [])
    ];
    delete state.data.messages[legacyId];
    return legacy;
  }

  const peer = findPrivateMessagePeer(peerId, message);
  const title = peer.nickname || message.senderName || "私聊";
  const conversation = {
    id: conversationId,
    kind: "session",
    title,
    avatar: peer.avatar || avatar(title.slice(0, 1) || "私"),
    unread: 0,
    lastText: "",
    lastAt: message.createdAt || new Date().toISOString(),
    muted: false
  };
  state.data.conversations.unshift(conversation);
  state.data.messages[conversationId] ||= [];
  return conversation;
}

function findPrivateMessagePeer(peerId, message = {}) {
  const pools = [
    state.data.contacts || [],
    state.data.directory || []
  ];
  for (const pool of pools) {
    const match = pool.find(user => user.id === peerId);
    if (match) return match;
  }
  return {
    id: peerId || message.senderId || "",
    nickname: message.senderName || "",
    avatar: ""
  };
}

function upsertGroup(group) {
  if (!group?.id) return;
  const groups = state.data.groups || [];
  const index = groups.findIndex(item => item.id === group.id);
  if (index >= 0) {
    groups[index] = { ...groups[index], ...group };
  } else {
    // Group broadcasts are delivered to all connected clients. Only a
    // membership refresh may add a group to the current account's list.
    return;
  }
  state.data.groups = groups;
  state.data.directoryGroups = (state.data.directoryGroups || []).map(item => item.id === group.id ? { ...item, ...group } : item);
  const conversation = getConversation(`group-${group.id}`);
  if (conversation) {
    conversation.title = group.title || conversation.title;
    conversation.avatar = group.avatar || conversation.avatar;
  }
}

function removeGroupMemberFromState(groupId, userId) {
  if (!groupId || !userId || !state.data) return;
  const group = (state.data.groups || []).find(item => item.id === groupId);
  if (userId === state.user?.id) {
    const conversationId = `group-${groupId}`;
    state.data.groups = (state.data.groups || []).filter(item => item.id !== groupId);
    state.data.conversations = (state.data.conversations || []).filter(item => item.id !== conversationId);
    delete state.data.messages?.[conversationId];
    if (state.selectedConversationId === conversationId) {
      state.selectedConversationId = null;
      syncConversationPath(null);
    }
    state.sidePage = null;
    return;
  }
  if (group) {
    group.members = (group.members || []).filter(member => member.userId !== userId);
  }
}

function upsertGroupMember(groupId, member) {
  if (!groupId || !member?.userId) return;
  const group = (state.data.groups || []).find(item => item.id === groupId);
  if (!group) return;
  const members = group.members || [];
  const index = members.findIndex(item => item.userId === member.userId);
  if (index >= 0) {
    members[index] = { ...members[index], ...member };
  } else {
    members.push(member);
  }
  group.members = members;
}

function currentGroup() {
  const conv = getConversation(state.selectedConversationId);
  if (!conv || conv.kind !== "group") return null;
  const groupId = conv.id.replace("group-", "");
  return state.data.groups.find(g => g.id === groupId);
}

function groupForConversation(conversation) {
  if (!conversation || conversation.kind !== "group") return null;
  const groupId = conversation.id.replace("group-", "");
  return state.data.groups.find(group => group.id === groupId) || null;
}

function groupNicknameForConversation(conversation) {
  const group = groupForConversation(conversation);
  if (state.useMock && group?.id) {
    const explicitNickname = readStoredMockGroupNicknames()[group.id];
    if (explicitNickname) return explicitNickname;
    return state.user?.nickname || "你";
  }
  const member = group?.members?.find(item => item.userId === state.user?.id);
  return group?.myNickname || member?.nickname || state.user?.nickname || "你";
}

function outgoingSenderName(conversationId = state.selectedConversationId) {
  const conversation = getConversation(conversationId);
  if (conversation?.kind === "group") return groupNicknameForConversation(conversation);
  return state.user?.nickname || "";
}

function syncCurrentUserGroupNickname(group, nickname, conversationId = `group-${group?.id || ""}`) {
  if (!group || !nickname) return;
  group.myNickname = nickname;
  const member = group.members?.find(item => item.userId === state.user?.id);
  if (member) member.nickname = nickname;
  state.data.messages[conversationId] = (state.data.messages[conversationId] || []).map(message => (
    message.senderId === state.user?.id ? { ...message, senderName: nickname } : message
  ));
  refreshConversationPreview(conversationId);
}

function syncDefaultGroupNicknames(previousNickname, nextNickname) {
  if (!nextNickname) return;
  const explicitMockNicknames = state.useMock ? readStoredMockGroupNicknames() : {};
  for (const group of state.data.groups || []) {
    const conversationId = `group-${group.id}`;
    const hasExplicitMockNickname = Boolean(explicitMockNicknames[group.id]);
    const shouldFollowAccountNickname = state.useMock
      ? !hasExplicitMockNickname
      : !group.myNickname || group.myNickname === previousNickname;
    if (!shouldFollowAccountNickname) continue;
    syncCurrentUserGroupNickname(group, nextNickname, conversationId);
  }
}

function syncCurrentGroupTitle(group, title, conversationId = `group-${group?.id || ""}`) {
  if (!group || !title) return;
  group.title = title;
  const conversation = getConversation(conversationId);
  if (conversation) conversation.title = title;
}

function readStoredMockGroupNicknames() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_GROUP_NICKNAMES_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}

function readStoredMockGroupTitles() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_GROUP_TITLES_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}

function persistMockGroupTitle(groupId, title) {
  if (!groupId || !title) return;
  const titles = readStoredMockGroupTitles();
  titles[groupId] = title;
  localStorage.setItem(MOCK_GROUP_TITLES_KEY, JSON.stringify(titles));
}

function applyStoredMockGroupTitles() {
  if (!state.useMock) return;
  const titles = readStoredMockGroupTitles();
  for (const [groupId, title] of Object.entries(titles)) {
    const group = state.data.groups?.find(item => item.id === groupId);
    if (!group || !title) continue;
    group.title = title;
    const conversation = getConversation(`group-${groupId}`);
    if (conversation) conversation.title = title;
  }
}

function persistMockGroupNickname(groupId, nickname) {
  if (!groupId || !nickname) return;
  const nicknames = readStoredMockGroupNicknames();
  nicknames[groupId] = nickname;
  localStorage.setItem(MOCK_GROUP_NICKNAMES_KEY, JSON.stringify(nicknames));
}

function applyStoredMockGroupNicknames() {
  if (!state.useMock) return;
  const nicknames = readStoredMockGroupNicknames();
  for (const [groupId, nickname] of Object.entries(nicknames)) {
    const group = state.data.groups?.find(item => item.id === groupId);
    if (group && nickname) syncCurrentUserGroupNickname(group, nickname, `group-${groupId}`);
  }
}

function getExploreGroups() {
  const byId = new Map();
  for (const group of [...(state.data.groups || []), ...(state.data.directoryGroups || [])]) {
    if (!group?.id || byId.has(group.id)) continue;
    byId.set(group.id, {
      announcement: "",
      joinMode: "public_qr",
      myNickname: "",
      disableMemberAddFriend: false,
      allMuted: false,
      rateLimit: { enabled: false, windowSeconds: 10, maxMessages: 3 },
      autoMuteNewMembers: false,
      members: [],
      ...group
    });
  }
  return [...byId.values()].sort((a, b) => Number(isGroupJoined(b)) - Number(isGroupJoined(a)) || String(a.title).localeCompare(String(b.title), "zh-Hans-CN"));
}

function isGroupJoined(group) {
  if (!group) return false;
  const owned = (state.data.groups || []).find(item => item.id === group.id);
  return Boolean(owned?.members?.some(member => member.userId === state.user?.id));
}

function currentGroupMember(group = currentGroup()) {
  if (!group || !state.user?.id) return null;
  return (group.members || []).find(member => member.userId === state.user.id) || null;
}

function canManageGroup(group = currentGroup()) {
  return canManageGroupSettings(currentGroupMember(group));
}

function isCurrentUserOwner(group = currentGroup()) {
  return canTransferOwner(group, state.user);
}

function joinModeLabel(joinMode) {
  if (joinMode === "approval") return "需要审核";
  if (joinMode === "closed") return "禁止入群";
  return "公开群（扫码入群）";
}

function createGroupMember(group, userId, nickname, role = "member") {
  return {
    userId,
    nickname,
    role,
    muted: role === "member" && Boolean(group?.autoMuteNewMembers)
  };
}

function getComposerBlockedReason(conversation) {
  if (!conversation) return "";
  if (conversation.kind === "session") {
    const contactId = privateConversationPeerId(conversation.id);
    if ((state.user?.blockedContactIds || []).includes(contactId)) {
      return "已加入黑名单，无法发送消息";
    }
    return "";
  }
  if (conversation.kind !== "group") return "";
  const group = state.data?.groups?.find(item => item.id === conversation.id.replace("group-", ""));
  if (!group) return "";
  const member = currentGroupMember(group);
  if (member?.muted) return "你已被禁言，暂时无法在本群发送消息";
  if (group.allMuted && !["owner", "admin"].includes(member?.role)) return "本群已开启全员禁言";
  return "";
}

function getGroupMentionStats(group) {
  const stats = {};
  if (!group) return stats;
  const messages = state.data.messages?.[`group-${group.id}`] || [];
  for (const message of messages) {
    if (!Array.isArray(message.mentions) || message.senderId === state.user?.id) continue;
    for (const userId of message.mentions) {
      stats[userId] = (stats[userId] || 0) + 1;
    }
  }
  return stats;
}

function conversationMentionsCurrentUser(conversation) {
  return shouldShowMentionReminder(conversation);
}

function messageMentionsCurrentUser(message = {}) {
  const mentionIds = Array.isArray(message.mentions) ? message.mentions.map(value => String(value)) : [];
  const currentUserKeys = [state.user?.id, state.user?.chatId, state.user?.phone]
    .filter(Boolean)
    .map(value => String(value));
  if (currentUserKeys.some(key => mentionIds.includes(key))) return true;

  const body = String(message.body || "");
  const nickname = String(state.user?.nickname || "").trim();
  return Boolean(nickname && body.includes(`@${nickname}`));
}

function hasMentionNotification(messageId) {
  return Boolean(messageId && state.notifiedMentionMessageIds.has(messageId));
}

function rememberMentionNotification(messageId) {
  if (!messageId) return;
  state.notifiedMentionMessageIds.add(messageId);
  if (state.notifiedMentionMessageIds.size > 200) {
    state.notifiedMentionMessageIds.delete(state.notifiedMentionMessageIds.values().next().value);
  }
}

function getMentionCandidates(query = "") {
  const group = currentGroup();
  if (!group) return [];
  const search = String(query || "").toLowerCase();
  const allMembers = groupAllMentionCandidate(canManageGroup(group));
  const members = [
    ...(allMembers ? [allMembers] : []),
    ...mentionCandidatesFromGroup(group, state.data.contacts, state.user?.id)
  ]
    .map(member => ({
      ...member,
      avatar: member.avatar || avatar((member.nickname || "成").slice(0, 1))
    }));
  if (!search) return members;
  return members.filter(member => `${member.nickname} ${member.subtitle}`.toLowerCase().includes(search));
}

function commonGroupsForContact(contact) {
  if (!contact) return [];
  return state.data.groups.filter(group =>
    (group.members || []).some(member => member.userId === contact.id || member.nickname === contact.nickname)
  );
}

function findBlockedSharedGroupForUser(user) {
  if (!user) return null;
  return (state.data.groups || []).find(group => {
    if (!group.disableMemberAddFriend) return false;
    const members = group.members || [];
    const hasMe = members.some(member => member.userId === state.user?.id);
    const hasTarget = members.some(member => member.userId === user.id || member.nickname === user.nickname);
    return hasMe && hasTarget;
  }) || null;
}

function findContactByName(name) {
  const query = String(name || "").trim().toLowerCase();
  if (!query) return null;
  return state.data.contacts.find(contact => contact.nickname.toLowerCase() === query) || null;
}

function getBlockedContacts() {
  const blocked = state.user?.blockedContactIds || [];
  return state.data.contacts.filter(contact => blocked.includes(contact.id));
}

function findUserByChatId(chatId) {
  const query = String(chatId || "").trim().toLowerCase();
  if (!query) return null;
  const contacts = state.data.contacts || [];
  const directory = state.data.directory || [];
  return [...contacts, ...directory].find(user => String(user.chatId || "").toLowerCase() === query) || null;
}

function getUserPrivacy(user) {
  return {
    friendVerification: user?.privacy?.friendVerification ?? false,
    inviteGroupVerification: user?.privacy?.inviteGroupVerification ?? false
  };
}

function createLocalFriendRequest(user, greeting, direction = "incoming") {
  return {
    id: id("fr"),
    type: "friend",
    direction,
    simulated: true,
    user: structuredClone(user),
    greeting: greeting || `你好，我是 ${user.nickname}`,
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

function createLocalGroupInviteRequest(user, group) {
  return {
    id: id("gr"),
    type: "group-invite",
    direction: "outgoing",
    simulated: true,
    user: structuredClone(user),
    groupId: group.id,
    groupTitle: group.title,
    greeting: `已邀请加入 ${group.title}`,
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

function createIncomingGroupInviteRequest(inviter, group) {
  return {
    id: id("gr"),
    type: "group-invite",
    direction: "incoming",
    simulated: true,
    user: structuredClone(inviter),
    groupId: group.id,
    groupTitle: group.title,
    groupData: structuredClone(group),
    greeting: `${inviter.nickname} 邀请你加入 ${group.title}`,
    status: "pending",
    createdAt: new Date().toISOString()
  };
}

function addContactToRoster(user) {
  if (state.data.contacts.some(contact => contact.id === user.id)) return;
  state.data.contacts.unshift(structuredClone(user));
}

function privateConversationIdFor(contactId, userId = state.user?.id) {
  if (!contactId || !userId) return `session-${contactId || ""}`;
  return String(userId) < String(contactId)
    ? `session-${userId}--${contactId}`
    : `session-${contactId}--${userId}`;
}

function privateConversationPeerId(conversationId, userId = state.user?.id) {
  const raw = String(conversationId || "").replace("session-", "");
  const parts = raw.split("--");
  if (parts.length === 2) {
    return parts[0] === userId ? parts[1] : parts[1] === userId ? parts[0] : "";
  }
  return raw;
}

function ensureConversationForContact(user) {
  const conversationId = privateConversationIdFor(user.id);
  if (state.data.conversations.some(conversation => conversation.id === conversationId)) return;
  state.data.conversations.unshift({
    id: conversationId,
    kind: "session",
    title: user.nickname,
    avatar: user.avatar,
    unread: 0,
    lastText: "你们已是好友，可以开始聊天了!",
    lastAt: new Date().toISOString()
  });
  state.data.messages[conversationId] ||= [];
}

function ensureGroupConversation(group) {
  if (!state.data.groups.some(item => item.id === group.id)) {
    state.data.groups.unshift(structuredClone(group));
  }
  const conversationId = `group-${group.id}`;
  if (!state.data.conversations.some(conversation => conversation.id === conversationId)) {
    state.data.conversations.unshift({
      id: conversationId,
      kind: "group",
      title: group.title,
      avatar: group.avatar,
      unread: 0,
      lastText: "你已加入群聊",
      lastAt: new Date().toISOString()
    });
  }
  state.data.messages[conversationId] ||= [];
}

function getNextIncomingFriendCandidate() {
  const directory = state.data.directory?.length ? state.data.directory : (mock.directory || []);
  return directory.find(user =>
    !state.data.contacts.some(contact => contact.id === user.id) &&
    !state.data.requests.some(request => request.type === "friend" && request.user?.id === user.id && request.status === "pending")
  ) || null;
}

function getNextIncomingGroupCandidate() {
  const directoryGroups = state.data.directoryGroups?.length ? state.data.directoryGroups : (mock.directoryGroups || []);
  return directoryGroups.find(group =>
    !state.data.groups.some(item => item.id === group.id) &&
    !state.data.requests.some(request => request.type === "group-invite" && request.groupId === group.id && request.status === "pending")
  ) || null;
}

function getNextOutgoingFriendCandidate() {
  const directory = state.data.directory?.length ? state.data.directory : (mock.directory || []);
  return directory.find(user =>
    getUserPrivacy(user).friendVerification &&
    !state.data.contacts.some(contact => contact.id === user.id) &&
    !state.data.requests.some(request =>
      request.type === "friend" &&
      request.user?.id === user.id &&
      getRequestDirection(request) === "outgoing" &&
      request.status === "pending"
    )
  ) || null;
}

function getNextOutgoingGroupInviteCandidate() {
  const groups = state.data.groups?.length ? state.data.groups : (mock.groups || []);
  const contacts = state.data.contacts?.length ? state.data.contacts : (mock.contacts || []);
  for (const group of groups) {
    const contact = contacts.find(user =>
      getUserPrivacy(user).inviteGroupVerification &&
      !group.members.some(member => member.userId === user.id) &&
      !state.data.requests.some(request =>
        request.type === "group-invite" &&
        request.user?.id === user.id &&
        request.groupId === group.id &&
        getRequestDirection(request) === "outgoing" &&
        request.status === "pending"
      )
    );
    if (contact) return { contact, group };
  }
  return null;
}

function getLatestPendingOutgoingRequest(type) {
  return getSortedRequests().find(request =>
    request.type === type &&
    getRequestDirection(request) === "outgoing" &&
    request.status === "pending"
  ) || null;
}

function shouldShowRequestActions(request) {
  return request.status === "pending" && request.direction !== "outgoing";
}

function getSortedRequests() {
  return [...(state.data.requests || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function getFriendRequestGroups() {
  const requests = getSortedRequests();
  const pending = requests.filter(request => request.status === "pending" && request.direction !== "outgoing");
  const outgoing = requests.filter(request => request.status === "pending" && request.direction === "outgoing");
  const processed = requests.filter(request => request.status !== "pending");
  const groups = [
    { key: "pending", title: "待处理", items: pending },
    { key: "outgoing", title: "我发出的", items: outgoing },
    { key: "processed", title: "已处理", items: processed }
  ];
  if (state.requestFilter === "pending") return groups.filter(group => group.key === "pending" && group.items.length > 0);
  if (state.requestFilter === "outgoing") return groups.filter(group => group.key === "outgoing" && group.items.length > 0);
  if (state.requestFilter === "processed") return groups.filter(group => group.key === "processed" && group.items.length > 0);
  return groups.filter(group => group.items.length > 0);
}

function renderFriendRequestBuckets(items) {
  return bucketRequestsByDate(items).map(bucket => `
    <div class="request-bucket">
      <div class="request-bucket-title">${escapeHTML(bucket.label)}</div>
      <div class="request-list">
        ${bucket.items.map(renderFriendRequestCard).join("")}
      </div>
    </div>`).join("");
}

function bucketRequestsByDate(items) {
  const map = new Map();
  for (const item of items) {
    const label = formatRequestDateLabel(item.createdAt);
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(item);
  }
  return [...map.entries()].map(([label, bucketItems]) => ({ label, items: bucketItems }));
}

function renderFriendRequestCard(request) {
  return `
    <article class="list-item request-card request-card-${escapeAttr(request.status)}">
      <img class="avatar" src="${avatarSrc(request.user.avatar)}" alt="">
      <div class="request-main">
        <div class="request-title-row">
          <div class="item-title">${escapeHTML(getRequestTitle(request))}</div>
          <span class="request-status request-status-${escapeAttr(getRequestStatusTone(request))}">${escapeHTML(getRequestStatusLabel(request))}</span>
        </div>
        <div class="item-preview">${escapeHTML(getRequestPreview(request))}</div>
        ${renderFriendRequestContext(request)}
        ${renderFriendRequestOutcome(request)}
        <div class="item-meta">${escapeHTML(getRequestMeta(request))}</div>
      </div>
      <div class="icon-row">
        ${shouldShowRequestActions(request)
          ? `<button class="primary-btn inline" data-friend-request="${request.id}" data-status="accepted">同意</button><button class="ghost-btn inline" data-friend-request="${request.id}" data-status="rejected">拒绝</button>`
          : ``}
      </div>
    </article>`;
}

function renderFriendRequestOutcome(request) {
  const text = getFriendRequestOutcomeText(request);
  return text ? `<div class="request-outcome">${escapeHTML(text)}</div>` : "";
}

function renderFriendRequestContext(request) {
  if (request.type !== "group-invite") return "";
  const inviter = request.user?.nickname || "对方";
  const groupTitle = request.groupTitle || "未命名群聊";
  return `
    <div class="request-context">
      <span class="request-context-pill">邀请人：${escapeHTML(inviter)}</span>
      <span class="request-context-pill">群聊：${escapeHTML(groupTitle)}</span>
    </div>`;
}

function getRequestTitle(request) {
  if (request.type === "group-invite") {
    return `${request.user.nickname} · ${request.groupTitle}`;
  }
  return request.user.nickname;
}

function getRequestPreview(request) {
  if (request.type === "group-invite") {
    return request.direction === "outgoing"
      ? `已邀请加入群聊：${request.groupTitle}`
      : `${request.user.nickname} 邀请你加入群聊：${request.groupTitle}`;
  }
  return request.direction === "outgoing"
    ? `已发送好友申请：${request.greeting}`
    : request.greeting;
}

function getFriendRequestOutcomeText(request) {
  if (request.status === "pending") return "";
  const direction = getRequestDirection(request);
  if (request.type === "group-invite") {
    if (request.status === "accepted") {
      return direction === "outgoing"
        ? `${request.user.nickname} 已加入你邀请的群聊`
        : `你已加入 ${request.groupTitle}`;
    }
    return direction === "outgoing"
      ? `${request.user.nickname} 暂未加入 ${request.groupTitle}`
      : `你已拒绝加入 ${request.groupTitle}`;
  }
  if (request.status === "accepted") {
    return direction === "outgoing"
      ? `${request.user.nickname} 已通过你的好友申请`
      : `你已通过 ${request.user.nickname} 的好友申请`;
  }
  return direction === "outgoing"
    ? `${request.user.nickname} 暂未通过你的好友申请`
    : `你已拒绝 ${request.user.nickname} 的好友申请`;
}

function getRequestStatusLabel(request) {
  const direction = getRequestDirection(request);
  if (request.status === "pending" && direction === "outgoing") return request.type === "group-invite" ? "待对方入群验证" : "待对方好友验证";
  if (request.status === "pending") return request.type === "group-invite" ? "等待你处理" : "等待你验证";
  if (request.status === "accepted") return request.type === "group-invite" ? "已加入" : "已通过";
  if (request.status === "rejected") {
    if (request.type === "group-invite") return direction === "outgoing" ? "对方未加入" : "已拒绝加入";
    return direction === "outgoing" ? "对方未通过" : "已拒绝";
  }
  return request.status || "处理中";
}

function getRequestStatusTone(request) {
  if (request.status === "accepted") return "success";
  if (request.status === "rejected") return "muted";
  return getRequestDirection(request) === "outgoing" ? "info" : "warning";
}

function getRequestMeta(request) {
  const direction = getRequestDirection(request);
  const source = request.type === "group-invite"
    ? direction === "incoming" ? "来自群邀请" : "你发出的群邀请"
    : direction === "incoming" ? "来自好友申请" : "你发出的好友申请";
  return `${source} · ${formatTime(request.createdAt)}`;
}

function getRequestDirection(request) {
  return request?.direction === "outgoing" ? "outgoing" : "incoming";
}

function simulateIncomingFriendRequest() {
  const candidate = getNextIncomingFriendCandidate();
  if (!candidate) {
    toast("当前没有可模拟的陌生人了");
    return;
  }
  if (ensureUserSettings().friendVerification) {
    state.data.requests.unshift(createLocalFriendRequest(candidate, `你好，我是 ${candidate.nickname}`, "incoming"));
    state.section = "contact";
    state.sidePage = "friend-requests";
    toast("已生成一条待处理好友申请");
    render();
    return;
  }
  addContactToRoster(candidate);
  ensureConversationForContact(candidate);
  toast(`${candidate.nickname} 已直接成为你的好友`);
  render();
}

function simulateIncomingGroupInvite() {
  const group = getNextIncomingGroupCandidate();
  if (!group) {
    toast("当前没有可模拟的群邀请了");
    return;
  }
  const inviter = state.data.contacts.find(contact => contact.id === group.inviterId) || state.data.directory?.[0];
  if (ensureUserSettings().inviteGroupVerification) {
    state.data.requests.unshift(createIncomingGroupInviteRequest(inviter, group));
    state.section = "contact";
    state.sidePage = "friend-requests";
    toast("已生成一条待处理入群邀请");
    render();
    return;
  }
  ensureGroupConversation({
    ...group,
    members: [...(group.members || []), { userId: state.user.id, nickname: state.user.nickname, role: "member", muted: false }]
  });
  state.section = "messages";
  state.selectedConversationId = `group-${group.id}`;
  syncConversationPath(state.selectedConversationId, { push: true });
  state.sidePage = null;
  toast(`你已被直接加入 ${group.title}`);
  render();
}

function simulateOutgoingFriendRequest() {
  const candidate = getNextOutgoingFriendCandidate();
  if (!candidate) {
    toast("当前没有可模拟的好友申请对象了");
    return;
  }
  state.data.requests.unshift(createLocalFriendRequest(candidate, `你好，我是 ${state.user.nickname}`, "outgoing"));
  state.section = "contact";
  state.sidePage = "friend-requests";
  state.requestFilter = "outgoing";
  toast(`已生成发给 ${candidate.nickname} 的好友申请`);
  render();
}

function simulateOutgoingGroupInvite() {
  const nextInvite = getNextOutgoingGroupInviteCandidate();
  if (!nextInvite) {
    toast("当前没有可模拟的入群邀请对象了");
    return;
  }
  state.data.requests.unshift(createLocalGroupInviteRequest(nextInvite.contact, nextInvite.group));
  state.section = "contact";
  state.sidePage = "friend-requests";
  state.requestFilter = "outgoing";
  toast(`已生成发给 ${nextInvite.contact.nickname} 的入群邀请`);
  render();
}

function resetIncomingSimulationState() {
  const baseDirectory = structuredClone(mock.directory || []);
  const baseDirectoryGroups = structuredClone(mock.directoryGroups || []);
  const directoryUserIds = new Set(baseDirectory.map(user => user.id));
  const directoryGroupIds = new Set(baseDirectoryGroups.map(group => group.id));

  state.data.directory = baseDirectory;
  state.data.directoryGroups = baseDirectoryGroups;
  state.data.requests = structuredClone(mock.requests || []);
  state.data.contacts = state.data.contacts.filter(contact => !directoryUserIds.has(contact.id));
  state.data.groups = state.data.groups.filter(group => !directoryGroupIds.has(group.id));
  state.data.conversations = state.data.conversations.filter(conversation => {
    if (conversation.id.startsWith("session-")) {
      return !directoryUserIds.has(conversation.id.replace("session-", ""));
    }
    if (conversation.id.startsWith("group-")) {
      return !directoryGroupIds.has(conversation.id.replace("group-", ""));
    }
    return true;
  });
  for (const groupId of directoryGroupIds) {
    delete state.data.messages[`group-${groupId}`];
  }
  for (const userId of directoryUserIds) {
    delete state.data.messages[`session-${userId}`];
  }
  toast("申请状态已重置");
  render();
}

function getBatchDraft() {
  state.user.batchDraft ||= {
    message: "今晚八点准时上线，记得查看最新通知。",
    targets: ["recent", "groups"],
    history: [
      { title: "今晚八点活动提醒", body: "今晚八点准时上线，记得查看最新通知。", status: "已发送" },
      { title: "系统维护通知", body: "明早 06:00 - 07:00 将进行短时维护。", status: "已发送" }
    ]
  };
  return state.user.batchDraft;
}

function uniqueStrings(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function ensureStickerStore() {
  state.user.stickerStore ||= structuredClone(defaultStickerStore());
  state.user.stickerStore.items = uniqueStrings([...(state.user.stickerStore.items || []), ...defaultStickerStore().items]);
  state.user.stickerStore.favorites = uniqueStrings(state.user.stickerStore.favorites || []);
  state.user.stickerStore.favorites.forEach(emoji => {
    if (!state.user.stickerStore.items.includes(emoji)) state.user.stickerStore.items.push(emoji);
  });
  return state.user.stickerStore;
}

function defaultStickerStore() {
  return {
    items: ["😀", "🥳", "👍", "🔥", "❤️", "😄", "🎉", "🙌", "😂", "🙏", "😍", "🤝", "✅", "📌"],
    favorites: ["😀", "🎉", "❤️", "👍", "😂", "🙏"]
  };
}

function ensureFeedbackStore() {
  state.user.feedbackStore ||= {
    type: "功能建议",
    draft: "",
    history: state.useMock ? [
      { type: "界面问题", text: "聊天窗口右键菜单希望再贴近移动端样式。", status: "已记录" },
      { type: "功能建议", text: "希望群发助手支持草稿保存。", status: "处理中" }
    ] : []
  };
  return state.user.feedbackStore;
}

function ensureUserSettings() {
  if (!state.user) return {};
  state.user.settings = {
    notificationsEnabled: true,
    notificationSound: true,
    notificationBadge: true,
    mentionAlerts: true,
    enterToSend: false,
    messagePreview: true,
    autoPlayVoice: false,
    collapseToolsAfterSend: true,
    friendVerification: false,
    inviteGroupVerification: false,
    discoverByChatId: true,
    discoverByPhone: false,
    showSignatureToStrangers: false,
    loginAlerts: true,
    confirmDeletes: true,
    darkMode: false,
    showRecentMessage: true,
    ...(state.user.settings || {})
  };
  state.user.language ||= "简体中文";
  state.user.displayMode ||= "桌面版";
  // A missing blacklist means no contacts are blocked. Never infer a blocked
  // contact from the contact list: doing so can silently disable private chats.
  state.user.blockedContactIds ||= [];
  return state.user.settings;
}

async function persistUserPreferences(patch) {
  if (state.useMock) {
    state.user = mergeUserPreferences(state.user, patch);
    ensureUserSettings();
    persistMockUserPreferences(patch);
    return state.user;
  }
  const updated = await api("/api/me", {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  state.user = {
    ...state.user,
    ...updated
  };
  ensureUserSettings();
  return state.user;
}

function mergeUserPreferences(user, patch) {
  const next = { ...(user || {}), ...(patch || {}) };
  if (patch?.settings) {
    next.settings = { ...(user?.settings || {}), ...patch.settings };
  }
  return next;
}

function readStoredMockUserPreferences() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_USER_PREFERENCES_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}

function persistMockUserPreferences(patch) {
  const stored = readStoredMockUserPreferences();
  const next = mergeUserPreferences(stored, patch);
  localStorage.setItem(MOCK_USER_PREFERENCES_KEY, JSON.stringify(next));
}

function applyStoredMockUserPreferences() {
  if (!state.useMock) return;
  const stored = readStoredMockUserPreferences();
  if (!Object.keys(stored).length) return;
  state.user = mergeUserPreferences(state.user, stored);
  ensureUserSettings();
}

function hydrateMockSessionFromStorage(session = null) {
  const token = localStorage.getItem("chatlite-token") || "";
  const registeredSession = session || (token === "demo-register-token" ? readRegisteredMockSession() : null);
  if (registeredSession?.user && registeredSession?.data) {
    migrateRegisteredMockChatId(registeredSession);
    state.user = structuredClone(registeredSession.user);
    ensureUserSettings();
    state.data = structuredClone(registeredSession.data);
    const routeConversationId = conversationIdFromCurrentRoute();
    state.selectedConversationId = routeConversationId && getConversation(routeConversationId)
      ? routeConversationId
      : null;
    state.sidePage = null;
    return;
  }
  state.user = structuredClone(mock.user);
  ensureUserSettings();
  applyStoredMockUserPreferences();
  state.data = structuredClone(mock);
  applyStoredMockGroupTitles();
  applyStoredMockGroupNicknames();
  const routeConversationId = conversationIdFromCurrentRoute();
  state.selectedConversationId = routeConversationId && getConversation(routeConversationId)
    ? routeConversationId
    : null;
}

function migrateRegisteredMockChatId(session) {
  if (!shouldReplaceChatId(session.user)) return;
  const chatId = generateRandomChatId();
  session.user.chatId = chatId;
  if (session.data?.user) {
    session.data.user.chatId = chatId;
  }
  persistRegisteredMockSession(session);
}

function createEmptyRegisteredMockSession(formData = {}) {
  const nickname = String(formData.nickname || "").trim() || "新用户";
  const country = String(formData.country || "+60");
  const phone = String(formData.phone || "").trim() || String(Date.now()).slice(-8);
  const user = {
    id: `local-${phone}`,
    country,
    phone,
    chatId: generateRandomChatId(),
    nickname,
    signature: "",
    avatar: avatar(nickname.slice(0, 1) || "我")
  };
  const data = {
    user,
    contacts: [],
    directory: structuredClone(mock.directory || []),
    directoryGroups: structuredClone(mock.directoryGroups || []),
    groups: [],
    requests: [],
    groupJoinRequests: {},
    groupBlacklists: {},
    groupBots: {},
    auditLogs: {},
    conversations: [],
    messages: {},
    collections: [],
    loginDevices: []
  };
  return { user, data };
}

function readRegisteredMockSession() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_REGISTERED_ACCOUNT_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function persistRegisteredMockSession(session) {
  localStorage.setItem(MOCK_REGISTERED_ACCOUNT_KEY, JSON.stringify(session));
}

function persistCurrentRegisteredMockSession() {
  if (!state.useMock || localStorage.getItem("chatlite-token") !== "demo-register-token") return;
  persistRegisteredMockSession({
    user: structuredClone(state.user),
    data: structuredClone(state.data)
  });
}

async function toggleUserSetting(key) {
  const settings = ensureUserSettings();
  const previous = settings[key];
  settings[key] = !settings[key];
  if (key === "notificationsEnabled" && settings[key]) {
    const allowed = await requestBrowserNotificationPermission();
    if (!allowed) {
      settings[key] = previous;
      render();
      return;
    }
  }
  try {
    await persistUserPreferences({ settings: { [key]: settings[key] } });
    toast(settings[key] ? "已开启" : "已关闭");
    render();
  } catch (error) {
    settings[key] = previous;
    toast("设置保存失败");
    render();
  }
}

async function revokeLoginDevice(deviceId) {
  if (!deviceId || state.useMock) return;
  if (!confirm("确定退出这台设备吗？")) return;
  try {
    await api(`/api/me/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
    await loadLoginDevices();
    toast("已退出该设备");
    render();
  } catch (error) {
    toast("设备退出失败");
    render();
  }
}

function getAvailableAccounts() {
  return [
    {
      id: state.user?.id || "u1",
      nickname: state.user?.nickname || "当前账号",
      signature: state.user?.signature || "",
      country: state.user?.country || "+60",
      phone: state.user?.phone || "",
      chatId: state.user?.chatId || "",
      avatar: state.user?.avatar || avatar("我")
    },
    { id: "demo-a", nickname: "阿泽", signature: "欢迎交流。", country: "+60", phone: "1880000001", chatId: "aze66", avatar: avatar("泽") },
    { id: "demo-b", nickname: "小橙", signature: "在线中", country: "+65", phone: "98880002", chatId: "orange8", avatar: avatar("橙") }
  ];
}

function switchUser(accountId) {
  const account = getAvailableAccounts().find(item => item.id === accountId);
  if (!account) return;
  const currentSettings = structuredClone(ensureUserSettings());
  state.user = {
    ...state.user,
    ...account,
    settings: currentSettings
  };
  state.sidePage = "profile";
  toast(`已切换到 ${account.nickname}`);
  render();
}

async function unblockContact(contactId) {
  const previous = [...(state.user.blockedContactIds || [])];
  state.user.blockedContactIds = (state.user.blockedContactIds || []).filter(id => id !== contactId);
  try {
    await persistUserPreferences({ blockedContactIds: state.user.blockedContactIds });
    toast("已移出黑名单");
    render();
  } catch (error) {
    state.user.blockedContactIds = previous;
    toast("黑名单保存失败");
    render();
  }
}

async function selectLanguage(language) {
  const previous = state.user.language;
  state.user.language = language;
  try {
    await persistUserPreferences({ language });
    toast(`已切换为 ${language}`);
    render();
  } catch (error) {
    state.user.language = previous;
    toast("语言保存失败");
    render();
  }
}

async function selectDisplayMode(mode) {
  const previous = state.user.displayMode;
  state.user.displayMode = mode;
  try {
    await persistUserPreferences({ displayMode: mode });
    toast(`已切换到${mode}`);
    render();
  } catch (error) {
    state.user.displayMode = previous;
    toast("显示模式保存失败");
    render();
  }
}

function toggleBatchTarget(key) {
  const batch = getBatchDraft();
  if (batch.targets.includes(key)) {
    if (batch.targets.length === 1) {
      toast("至少保留一个群发范围");
      return;
    }
    batch.targets = batch.targets.filter(item => item !== key);
  } else {
    batch.targets = [...batch.targets, key];
  }
  render();
}

function formatBatchTargetsSummary() {
  const batch = getBatchDraft();
  const labels = {
    recent: "最近聊天",
    contacts: "联系人",
    groups: "群组"
  };
  return batch.targets.map(key => labels[key]).join(" / ");
}

async function toggleFavoriteSticker(emoji) {
  const store = ensureStickerStore();
  const previous = structuredClone(store);
  if (store.favorites.includes(emoji)) {
    store.favorites = store.favorites.filter(item => item !== emoji);
  } else {
    store.favorites = [...store.favorites, emoji];
  }
  try {
    await persistUserPreferences({ stickerStore: store });
    toast(store.favorites.includes(emoji) ? "已加入常用表情" : "已移出常用表情");
    render();
  } catch (error) {
    state.user.stickerStore = previous;
    toast("表情保存失败");
    render();
  }
}

async function addStickerToStore(emoji) {
  const store = ensureStickerStore();
  const previous = structuredClone(store);
  if (!store.items.includes(emoji)) {
    store.items = [...store.items, emoji];
  }
  if (!store.favorites.includes(emoji)) {
    store.favorites = [...store.favorites, emoji];
  }
  try {
    await persistUserPreferences({ stickerStore: store });
    toast("表情已加入常用列表");
    render();
  } catch (error) {
    state.user.stickerStore = previous;
    toast("表情保存失败");
    render();
  }
}

async function blockContact(contactId) {
  const previous = [...(state.user.blockedContactIds || [])];
  const blocked = new Set(state.user.blockedContactIds || []);
  blocked.add(contactId);
  state.user.blockedContactIds = [...blocked];
  try {
    await persistUserPreferences({ blockedContactIds: state.user.blockedContactIds });
    state.sidePage = "blacklist";
    toast("已加入黑名单");
    render();
  } catch (error) {
    state.user.blockedContactIds = previous;
    toast("黑名单保存失败");
    render();
  }
}

async function downloadQrCard() {
  const qr = await renderQrSvg(userQrText(state.user), { width: 400, margin: 2 });
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
      <rect width="720" height="960" rx="44" fill="#f4f8ff"/>
      <rect x="60" y="60" width="600" height="840" rx="36" fill="#ffffff" stroke="#d9e4f2"/>
      <rect x="270" y="110" width="180" height="180" rx="40" fill="#1d42c7"/>
      <text x="360" y="222" text-anchor="middle" font-size="86" fill="#ffffff" font-family="Arial, sans-serif">${escapeHTML((state.user.nickname || "我").slice(0, 1))}</text>
      <text x="360" y="340" text-anchor="middle" font-size="40" fill="#172033" font-family="Arial, sans-serif">${escapeHTML(state.user.nickname || "")}</text>
      <text x="360" y="392" text-anchor="middle" font-size="28" fill="#69758a" font-family="Arial, sans-serif">${escapeHTML(state.user.chatId || "")}</text>
      ${positionQrSvg(qr, 160, 470, 400)}
      <text x="360" y="904" text-anchor="middle" font-size="26" fill="#69758a" font-family="Arial, sans-serif">${escapeHTML(`${state.user.country || ""} ${state.user.phone || ""}`.trim())}</text>
    </svg>`;
  downloadSvgFile(svg, `${state.user.chatId || "qrcode"}.svg`);
}

async function downloadGroupQrCard(group) {
  const qr = await renderQrSvg(groupQrText(group), { width: 400, margin: 2 });
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
      <rect width="720" height="960" rx="44" fill="#f4f8ff"/>
      <rect x="60" y="60" width="600" height="840" rx="36" fill="#ffffff" stroke="#d9e4f2"/>
      <rect x="270" y="110" width="180" height="180" rx="40" fill="#1d42c7"/>
      <text x="360" y="222" text-anchor="middle" font-size="86" fill="#ffffff" font-family="Arial, sans-serif">${escapeHTML((group.title || "群").slice(0, 1))}</text>
      <text x="360" y="340" text-anchor="middle" font-size="40" fill="#172033" font-family="Arial, sans-serif">${escapeHTML(group.title || "")}</text>
      <text x="360" y="392" text-anchor="middle" font-size="28" fill="#69758a" font-family="Arial, sans-serif">群号 ${escapeHTML(group.chatId || "")}</text>
      ${positionQrSvg(qr, 160, 470, 400)}
      <text x="360" y="904" text-anchor="middle" font-size="26" fill="#69758a" font-family="Arial, sans-serif">扫码进群</text>
    </svg>`;
  downloadSvgFile(svg, `group-${group.chatId || group.id || "qrcode"}.svg`);
}

function positionQrSvg(svg, x, y, size) {
  return svg
    .replace(/^<svg\s/, `<svg x="${x}" y="${y}" `)
    .replace(/\swidth="[^"]*"/, ` width="${size}"`)
    .replace(/\sheight="[^"]*"/, ` height="${size}"`);
}

function downloadSvgFile(svg, filename) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function openContactDetail(key) {
  const contact = state.data.contacts.find(item =>
    item.id === key ||
    item.chatId === key ||
    item.nickname === key
  ) || findContactByName(key);
  if (!contact) {
    toast("未找到该名片的详情");
    return;
  }
  state.preview = contact;
  state.modal = "contact-detail";
  render();
}

function openImagePreview(image) {
  if (!image?.url) {
    toast("图片地址无效");
    return;
  }
  state.preview = image;
  state.modal = "image-preview";
  render();
}

function openMentionPicker() {
  const group = currentGroup();
  if (!group) {
    toast("只有群聊里才能提及成员");
    return;
  }
  const editor = document.querySelector("#editor");
  if (!editor) return;
  state.toolMenu = null;
  insertIntoEditor("@");
}

function updateMentionSuggestions() {
  const editor = document.querySelector("#editor");
  if (!editor) return;
  const group = currentGroup();
  if (!group) {
    state.mention = null;
    syncMentionMenu();
    return;
  }
  const value = editor.value;
  const cursor = editor.selectionStart ?? value.length;
  const before = value.slice(0, cursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0 || /[\s@]/.test(before.slice(atIndex + 1))) {
    state.mention = null;
    syncMentionMenu();
    return;
  }
  const query = before.slice(atIndex + 1);
  state.toolMenu = null;
  state.mention = {
    open: true,
    query,
    replaceStart: atIndex,
    replaceEnd: cursor,
    activeIndex: 0
  };
  syncMentionMenu();
}

function handleEditorKeydown(event) {
  if (state.mention?.open) {
    if (event.key === "Escape") {
      state.mention = null;
      syncMentionMenu();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = getMentionCandidates(state.mention.query);
      if (!items.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const current = state.mention.activeIndex ?? 0;
      const next = (current + direction + items.length) % items.length;
      state.mention = { ...state.mention, activeIndex: next };
      syncMentionMenu();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const items = getMentionCandidates(state.mention.query);
      const selected = items[state.mention.activeIndex ?? 0] || items[0];
      if (selected) insertMention(selected);
      return;
    }
  }

  if (editorKeyAction(event, ensureUserSettings().enterToSend) === "send") {
    event.preventDefault();
    document.querySelector("#composer")?.requestSubmit();
  }
}

function insertMentionById(contactId) {
  const target = getMentionCandidates(state.mention?.query)
    .find(item => item.id === contactId);
  if (!target) return;
  insertMention(target);
}

function insertMention(contact) {
  const editor = document.querySelector("#editor");
  if (!editor) return;
  const isAllMembers = contact.id === ALL_MEMBERS_MENTION_ID;
  const mentionText = isAllMembers ? "@所有人 " : `@${contact.nickname} `;
  const value = editor.value;
  const start = Math.max(0, state.mention?.replaceStart ?? editor.selectionStart ?? value.length);
  const end = Math.max(start, state.mention?.replaceEnd ?? editor.selectionEnd ?? value.length);
  editor.value = `${value.slice(0, start)}${mentionText}${value.slice(end)}`;
  const caret = start + mentionText.length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  const mentionIDs = isAllMembers
    ? groupAllMentionIds(currentGroup(), state.user?.id)
    : [contact.id];
  state.mentionIds = uniqueMentionIds([...state.mentionIds, ...mentionIDs]);
  state.mention = null;
  syncMentionMenu();
}

function insertIntoEditor(text) {
  const editor = document.querySelector("#editor");
  if (!editor) return;
  const value = editor.value;
  const selection = state.editorSelection || {};
  const start = Math.max(0, Math.min(value.length, selection.start ?? editor.selectionStart ?? value.length));
  const end = Math.max(start, Math.min(value.length, selection.end ?? editor.selectionEnd ?? value.length));
  editor.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const caret = start + text.length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  state.editorSelection = { start: caret, end: caret };
  setCurrentDraftText(editor.value);
  updateMentionSuggestions();
}

function rememberEditorSelection(editor = document.querySelector("#editor")) {
  if (!(editor instanceof HTMLTextAreaElement)) return;
  const length = editor.value.length;
  const start = Math.max(0, Math.min(length, editor.selectionStart ?? length));
  const end = Math.max(start, Math.min(length, editor.selectionEnd ?? length));
  state.editorSelection = { start, end };
}

function dismissEmojiPicker() {
  if (state.toolMenu !== "emoji") return false;
  state.toolMenu = null;
  state.mention = null;
  document.querySelector(".emoji-popover")?.remove();
  document.querySelector("[data-tool='emoji']")?.classList.remove("active");
  return true;
}

function syncMentionMenu() {
  const menu = document.querySelector("#mentionMenu");
  if (!menu) return;
  if (!state.mention?.open) {
    menu.innerHTML = "";
    return;
  }
  menu.innerHTML = renderMentionMenu();
}

async function confirmContactEdit(kind) {
  const contact = state.preview;
  if (!contact) return;
  const patch = {};
  if (kind === "remark") {
    patch.remark = document.querySelector("#contactRemark")?.value?.trim() || "";
  } else {
    patch.tags = (document.querySelector("#contactTags")?.value || "")
      .split(/[,，\n]/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  try {
    let updated = contact;
    if (state.useMock) {
      Object.assign(contact, patch);
      updated = contact;
    } else {
      updated = await api(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      state.data.contacts = state.data.contacts.map(item => item.id === updated.id ? updated : item);
    }
    state.preview = updated;
    state.modal = "contact-detail";
    toast(kind === "remark" ? "备注已保存" : "标签已保存");
    render();
  } catch (error) {
    toast(error?.message || "保存失败");
  }
}

function openChatFromContactKey(key) {
  const contact = state.data.contacts.find(item =>
    item.id === key ||
    item.chatId === key ||
    item.nickname === key
  ) || findContactByName(key);
  if (!contact) {
    toast("未找到可聊天的联系人");
    return;
  }
  const sessionId = privateConversationIdFor(contact.id);
  let conversation = getConversation(sessionId);
  if (!conversation) {
    conversation = {
      id: sessionId,
      kind: "session",
      title: contact.nickname,
      avatar: contact.avatar,
      unread: 0,
      lastText: "",
      lastAt: new Date().toISOString()
    };
    state.data.conversations.unshift(conversation);
    state.data.messages[sessionId] = state.data.messages[sessionId] || [];
  }
  state.selectedConversationId = sessionId;
  syncConversationPath(sessionId, { push: true });
  state.section = "messages";
  state.sidePage = null;
  state.modal = null;
  state.preview = null;
  state.mention = null;
  state.mentionIds = [];
  render();
  void acknowledgeConversationRead(sessionId);
}

function rememberMessageScrollPosition() {
  if (!state.authed) return;
  const conversationId = state.selectedConversationId;
  if (!conversationId) return;
  if (state.pendingMessageScrollRestore?.conversationId === conversationId) {
    state.messageScrollTopByConversation[conversationId] = state.pendingMessageScrollRestore.scrollTop;
    return;
  }
  const messages = document.querySelector(".messages");
  if (!messages) return;
  state.messageScrollTopByConversation[conversationId] = messages.scrollTop;
}

function pinCurrentMessageScrollPosition() {
  const conversationId = state.selectedConversationId;
  const messages = document.querySelector(".messages");
  if (!conversationId || !messages) return;
  state.pendingMessageScrollRestore = {
    conversationId,
    scrollTop: messages.scrollTop
  };
  state.messageScrollTopByConversation[conversationId] = messages.scrollTop;
}

function rememberTransientFocus() {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) {
    state.transientFocus = null;
    return;
  }
  if (active.id === "editor") {
    state.transientFocus = {
      selector: "#editor",
      start: active.selectionStart ?? active.value.length,
      end: active.selectionEnd ?? active.value.length
    };
    return;
  }
  if (state.section === "messages" && state.sidePage === "search" && active.matches('[data-action="search"]')) {
    state.transientFocus = {
      selector: 'aside.detail-pane [data-action="search"]',
      start: active.selectionStart ?? active.value.length,
      end: active.selectionEnd ?? active.value.length
    };
    return;
  }
  if (active.id === "forwardSearch") {
    ensureForwardSelection();
    state.forwardSelection.focus = {
      id: "forwardSearch",
      start: active.selectionStart ?? active.value.length,
      end: active.selectionEnd ?? active.value.length
    };
    return;
  }
  state.transientFocus = null;
  if (state.forwardSelection?.focus) {
    state.forwardSelection.focus = null;
  }
}

function restoreTransientFocus() {
  const transientFocus = state.transientFocus;
  if (transientFocus?.selector) {
    requestAnimationFrame(() => {
      const input = document.querySelector(transientFocus.selector);
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
      input.focus({ preventScroll: true });
      const start = typeof transientFocus.start === "number" ? transientFocus.start : input.value.length;
      const end = typeof transientFocus.end === "number" ? transientFocus.end : start;
      input.setSelectionRange(start, end);
    });
  }
  const focus = state.forwardSelection?.focus;
  if (!focus?.id) return;
  requestAnimationFrame(() => {
    const input = document.querySelector(`#${focus.id}`);
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
    input.focus();
    const start = typeof focus.start === "number" ? focus.start : input.value.length;
    const end = typeof focus.end === "number" ? focus.end : start;
    input.setSelectionRange(start, end);
  });
}

function restoreMessageScrollPosition({ skip = false } = {}) {
  if (!state.authed || skip || state.scrollToBottom) return;
  const conversationId = state.selectedConversationId;
  if (!conversationId) return;
  const pending = state.pendingMessageScrollRestore?.conversationId === conversationId
    ? state.pendingMessageScrollRestore.scrollTop
    : undefined;
  const scrollTop = typeof pending === "number" ? pending : state.messageScrollTopByConversation[conversationId];
  if (typeof scrollTop !== "number") return;
  const applyScroll = () => {
    const messages = document.querySelector(".messages");
    if (!messages) return;
    messages.scrollTop = scrollTop;
  };
  requestAnimationFrame(() => {
    applyScroll();
    requestAnimationFrame(applyScroll);
  });
  state.pendingMessageScrollRestore = null;
}

function shouldSuppressPointerAction(event) {
  if (event?.button === 2) return true;
  return Date.now() < (state.suppressPointerUntil || 0);
}

function resolveMessageMenuPosition(event, item, container) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const itemRect = item.getBoundingClientRect();
  const rawX = Number(event.clientX);
  const rawY = Number(event.clientY);
  const safeX = Number.isFinite(rawX) ? rawX : itemRect.left + itemRect.width - 24;
  const safeY = Number.isFinite(rawY) ? rawY : itemRect.top + 40;
  const menuWidth = 160;
  const menuHeight = 128;
  return {
    x: Math.min(Math.max(12, safeX), Math.max(12, viewportWidth - menuWidth - 12)),
    y: Math.min(Math.max(12, safeY), Math.max(12, viewportHeight - menuHeight - 12))
  };
}

function getCurrentMessageById(messageId) {
  const messages = state.data.messages?.[state.selectedConversationId] || [];
  return messages.find(message => message.id === messageId) || null;
}

function handleMessageAction(action) {
  const menu = state.messageMenu;
  if (!menu) return;
  const message = getCurrentMessageById(menu.messageId);
  if (!message) {
    state.messageMenu = null;
    render();
    return;
  }
  pinCurrentMessageScrollPosition();
  if (action === "quote") {
    quoteMessage(message);
    return;
  }
  state.messageMenu = null;
  if (action === "forward") {
    state.forwardPayload = { messages: [message] };
    state.forwardSelection = createDefaultForwardSelection();
    state.modal = "forward-message";
    render();
    return;
  }
  if (action === "copy") {
    copyMessage(message);
    return;
  }
  if (action === "favorite") {
    favoriteMessage(message);
    return;
  }
  if (action === "read-detail") {
    openMessageReadDetail(message.id);
    return;
  }
  if (action === "delete") {
    deleteMessage(message);
    return;
  }
  if (action === "multi") {
    state.multiSelect = {
      conversationId: state.selectedConversationId,
      selectedIds: uniqueMentionIds([...(state.multiSelect?.selectedIds || []), message.id])
    };
    toast("已进入多选");
    return;
  }
}

async function handleConversationAction(action) {
  const menu = state.conversationMenu;
  if (!menu) return;
  const conversation = getConversation(menu.conversationId);
  state.conversationMenu = null;
  if (!conversation) {
    render();
    return;
  }
  if (action === "pin") {
    await updateConversationSetting(conversation.id, { pinned: !conversation.pinned });
    return;
  }
  if (action === "mute") {
    await updateConversationSetting(conversation.id, { muted: !conversation.muted });
    return;
  }
  if (action === "unread") {
    const patch = buildMarkUnreadPatch(conversation);
    await updateConversationSetting(conversation.id, { unread: patch.unread });
    conversation.mentionedMe = patch.mentionedMe;
    toast("已标记未读");
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定将“${conversation.title}”移出聊天列表吗？聊天记录不会被删除，收到新消息后会重新出现。`)) {
      render();
      return;
    }
    try {
      if (!state.useMock) {
        await api(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      }
      state.data.conversations = state.data.conversations.filter(item => item.id !== conversation.id);
      delete state.data.messages[conversation.id];
      if (state.selectedConversationId === conversation.id) {
        state.selectedConversationId = null;
        state.sidePage = null;
        syncConversationPath(null);
      }
      toast("已移出聊天列表");
      render();
    } catch (error) {
      toast("会话删除失败");
      render();
    }
  }
}

function quoteMessage(message) {
  pinCurrentMessageScrollPosition();
  setCurrentReplyDraft(buildQuotePayload(message));
  if (state.voiceMode) {
    state.messageMenu = null;
    state.voiceMode = false;
    state.pendingEditorAutofocus = true;
    render();
    focusComposerEditor({ preserveScroll: true });
    return;
  }
  state.messageMenu = null;
  refreshReplyBarHost();
  document.querySelector("[data-message-menu]")?.remove();
  focusComposerEditor({ preserveScroll: true });
}

function focusComposerEditor({ preserveScroll = false } = {}) {
  const requestId = ++state.composerFocusRequestId;
  state.pendingEditorAutofocus = true;
  requestAnimationFrame(() => {
    if (requestId !== state.composerFocusRequestId) return;
    const editor = document.querySelector("#editor");
    if (!(editor instanceof HTMLTextAreaElement)) return;
    if (preserveScroll) pinCurrentMessageScrollPosition();
    try {
      editor.focus({ preventScroll: true });
    } catch (_) {
      editor.focus();
    }
    const caret = editor.value.length;
    editor.setSelectionRange(caret, caret);
    state.pendingEditorAutofocus = false;
    if (preserveScroll) {
      pinCurrentMessageScrollPosition();
      restoreMessageScrollPosition();
    }
  });
}

function refreshReplyBarHost() {
  const host = document.querySelector("#replyBarHost");
  if (!host) return;
  host.innerHTML = renderReplyComposer();
  host.querySelectorAll("[data-clear-reply]").forEach(el => el.addEventListener("click", () => {
    setCurrentReplyDraft(null);
    refreshReplyBarHost();
  }));
}

async function copyMessage(message) {
  const text = formatMessageForCopy(message);
  if (!text) {
    toast("没有可复制内容");
    return;
  }
  if (await writeClipboardText(text)) {
    toast("已复制");
    return;
  }
  toast("复制失败");
}

async function favoriteMessage(message) {
  try {
    const result = await addMessageToCollections(message);
    toast(result.duplicate ? "已收藏过" : "已收藏");
  } catch (error) {
    toast("收藏失败");
  }
}

async function addMessageToCollections(message) {
  const collection = {
    ...buildCollectionFromMessage(message),
    createdAt: new Date().toISOString()
  };
  const existing = findCollectionByMessageId(state.data.collections, collection.messageId);
  if (existing) {
    return { collection: existing, duplicate: true };
  }
  const saved = state.useMock ? { id: id("col"), ...collection } : await api("/api/collections", {
    method: "POST",
    body: JSON.stringify(collection)
  });
  state.data.collections = [saved, ...(state.data.collections || []).filter(item => item.id !== saved.id)];
  return { collection: saved, duplicate: false };
}

function toggleMessageSelection(messageId) {
  if (!messageId) return;
  if (!state.multiSelect || state.multiSelect.conversationId !== state.selectedConversationId) {
    state.multiSelect = { conversationId: state.selectedConversationId, selectedIds: [messageId] };
    render();
    return;
  }
  const selectedIds = new Set(state.multiSelect.selectedIds || []);
  if (selectedIds.has(messageId)) {
    selectedIds.delete(messageId);
  } else {
    selectedIds.add(messageId);
  }
  state.multiSelect = {
    ...state.multiSelect,
    selectedIds: [...selectedIds]
  };
  render();
}

async function handleMultiSelectAction(action) {
  const active = state.multiSelect?.conversationId === state.selectedConversationId;
  if (!active) return;
  const selectedMessages = getSelectedMessages();
  if (action === "cancel") {
    state.multiSelect = null;
    render();
    return;
  }
  if (!selectedMessages.length) {
    toast("请先选择消息");
    return;
  }
  if (action === "forward") {
    state.forwardPayload = { messages: selectedMessages };
    state.forwardSelection = createDefaultForwardSelection();
    state.modal = "forward-message";
    render();
    return;
  }
  if (action === "delete") {
    await deleteSelectedMessages(selectedMessages);
    return;
  }
}

function getSelectedMessages() {
  const messages = state.data.messages?.[state.selectedConversationId] || [];
  const selectedIds = new Set(state.multiSelect?.selectedIds || []);
  return messages.filter(message => selectedIds.has(message.id));
}

async function deleteSelectedMessages(selectedMessages) {
  const blocked = findUndeletableMessages(selectedMessages, state.user, currentGroup(), { allowMock: state.useMock });
  if (blocked.length) {
    toast(deleteBlockedSummary(blocked));
    return;
  }
  if (!confirm(`确定删除选中的 ${selectedMessages.length} 条消息？`)) return;
  const selectedIds = new Set(selectedMessages.map(message => message.id));
  const conversationId = state.selectedConversationId;
  try {
    if (!state.useMock) {
      await api(`/api/conversations/${conversationId}/messages/batch-delete`, {
        method: "POST",
        body: JSON.stringify({ messageIds: [...selectedIds] })
      });
    }
    state.data.messages[conversationId] = (state.data.messages[conversationId] || []).filter(message => !selectedIds.has(message.id));
    refreshConversationPreview(conversationId);
    if (state.sidePage === "audit-logs") await loadGroupAuditLogs();
    state.multiSelect = null;
    toast(`已删除 ${selectedMessages.length} 条消息`);
    render();
  } catch (error) {
    toast(error?.message?.includes("403") || error?.message?.includes("permission") ? "没有权限删除所选消息" : "删除失败");
  }
}

function buildQuotePayload(message) {
  return {
    messageId: message.id,
    conversationId: message.conversationId || state.selectedConversationId,
    senderName: message.senderName,
    preview: summarizeMessage(message),
    type: message.type || "text",
    typeLabel: getMessageTypeLabel(message.type)
  };
}

function summarizeMessage(message) {
  return quotePreviewText(message);
}

function getMessageTypeLabel(type) {
  return messageTypeLabel(type);
}

function getConversationPreviewText(conversation) {
  if (conversation.id === state.selectedConversationId) {
    const draft = String(getCurrentDraftText() || "").trim();
    const replyDraft = getCurrentReplyDraft();
    if (replyDraft && draft) {
      return `[草稿] (引用 ${replyDraft.preview || replyDraft.senderName || "消息"}) ${draft}`;
    }
    if (replyDraft) {
      return `[草稿] (引用 ${replyDraft.preview || replyDraft.senderName || "消息"})`;
    }
    if (draft) {
      return `[草稿] ${draft}`;
    }
  }
  return conversation.lastText || "";
}

async function forwardMessagesToConversation(conversationId) {
  const messages = state.forwardPayload?.messages || [];
  if (!conversationId || !messages.length) {
    toast("没有可转发的消息");
    return;
  }
  try {
    await forwardMessageBatch(messages, conversationId);
    toast(`已转发 ${messages.length} 条消息`);
  } catch (error) {
    toast(error?.message || "转发失败");
  }
}

async function forwardMessageBatch(messages, conversationId) {
  for (const message of messages) {
    await deliverMessageToConversation(conversationId, buildForwardPayload(message));
  }
}

function createDefaultForwardSelection() {
  return {
    tab: "recent",
    query: "",
    selectedTargetIds: []
  };
}

function ensureForwardSelection() {
  if (!state.forwardSelection) state.forwardSelection = createDefaultForwardSelection();
}

function getForwardTargets(selection = state.forwardSelection || createDefaultForwardSelection()) {
  const query = String(selection.query || "").trim().toLowerCase();
  const filterByQuery = item => !query || `${item.title} ${item.subtitle || ""}`.toLowerCase().includes(query);
  if (selection.tab === "contacts") {
    return state.data.contacts
      .map(contact => ({
        id: `contact:${contact.id}`,
        type: "contact",
        contactId: contact.id,
        title: contact.nickname,
        subtitle: contact.chatId || contact.signature || "",
        avatar: contact.avatar
      }))
      .filter(target => !isCurrentForwardTarget(target))
      .filter(filterByQuery);
  }
  if (selection.tab === "groups") {
    return state.data.groups
      .map(group => ({
        id: `group:${group.id}`,
        type: "conversation",
        conversationId: `group-${group.id}`,
        title: group.title,
        subtitle: `${group.members.length} 位成员`,
        avatar: group.avatar
      }))
      .filter(target => !isCurrentForwardTarget(target))
      .filter(filterByQuery);
  }
  if (selection.tab === "tags") {
    return state.data.contacts
      .filter(contact => Array.isArray(contact.tags) && contact.tags.length)
      .map(contact => ({
        id: `tag-contact:${contact.id}`,
        type: "contact",
        contactId: contact.id,
        title: contact.nickname,
        subtitle: (contact.tags || []).join(" · "),
        avatar: contact.avatar
      }))
      .filter(target => !isCurrentForwardTarget(target))
      .filter(filterByQuery);
  }
  return [...state.data.conversations]
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
    .map(conversation => ({
      id: `conversation:${conversation.id}`,
      type: "conversation",
      conversationId: conversation.id,
      title: conversation.title,
      subtitle: conversation.lastText || "最近聊天",
      avatar: conversation.avatar
    }))
    .filter(target => !isCurrentForwardTarget(target))
    .filter(filterByQuery);
}

function getForwardTargetCount(tab) {
  return getForwardTargets({ ...(state.forwardSelection || createDefaultForwardSelection()), tab, query: "" }).length;
}

function getForwardEmptyState(selection = state.forwardSelection || createDefaultForwardSelection()) {
  if (selection.query) return "没有找到匹配的聊天";
  if (selection.tab === "contacts") return "暂无可转发的联系人";
  if (selection.tab === "groups") return "暂无可转发的群组";
  if (selection.tab === "tags") return "暂无带标签的联系人";
  return "最近没有可转发的聊天";
}

function isCurrentForwardTarget(target) {
  if (!target) return false;
  if (target.type === "conversation") {
    return target.conversationId === state.selectedConversationId;
  }
  const currentConversation = getConversation(state.selectedConversationId);
  if (!currentConversation || currentConversation.kind !== "session") return false;
  return privateConversationIdFor(target.contactId) === currentConversation.id;
}

function getSelectedForwardTargets(selection = state.forwardSelection || createDefaultForwardSelection()) {
  return (selection.selectedTargetIds || [])
    .map(findForwardTargetById)
    .filter(Boolean);
}

function findForwardTargetById(targetId) {
  if (!targetId) return null;
  for (const tab of ["recent", "contacts", "groups", "tags"]) {
    const target = getForwardTargets({ ...(state.forwardSelection || createDefaultForwardSelection()), tab, query: "" })
      .find(item => item.id === targetId);
    if (target) return target;
  }
  return null;
}

function toggleForwardTarget(targetId) {
  ensureForwardSelection();
  const selected = new Set(state.forwardSelection.selectedTargetIds || []);
  if (selected.has(targetId)) {
    selected.delete(targetId);
  } else {
    selected.add(targetId);
  }
  state.forwardSelection.selectedTargetIds = [...selected];
  refreshForwardModalContent();
}

function toggleAllForwardTargets() {
  ensureForwardSelection();
  const targets = getForwardTargets(state.forwardSelection);
  const selected = new Set(state.forwardSelection.selectedTargetIds || []);
  const allSelected = targets.length > 0 && targets.every(target => selected.has(target.id));
  if (allSelected) {
    targets.forEach(target => selected.delete(target.id));
  } else {
    targets.forEach(target => selected.add(target.id));
  }
  state.forwardSelection.selectedTargetIds = [...selected];
  refreshForwardModalContent();
}

async function submitForwardSelection() {
  ensureForwardSelection();
  clearForwardSearchRefresh();
  const selectedIds = state.forwardSelection.selectedTargetIds || [];
  if (!selectedIds.length) {
    toast("请选择转发目标");
    return;
  }
  const targets = getForwardTargets(state.forwardSelection).filter(target => selectedIds.includes(target.id));
  if (!targets.length) {
    toast("请选择有效的转发目标");
    return;
  }
  try {
    const deliveredConversationIds = [];
    for (const target of targets) {
      const conversationId = ensureConversationIdForForwardTarget(target);
      await forwardMessageBatch(state.forwardPayload?.messages || [], conversationId);
      deliveredConversationIds.push(conversationId);
    }
    const firstConversationId = deliveredConversationIds[0];
    state.modal = null;
    state.forwardPayload = null;
    state.forwardSelection = null;
    state.multiSelect = null;
    if (firstConversationId) {
      state.section = "messages";
      state.selectedConversationId = firstConversationId;
      syncConversationPath(firstConversationId, { push: true });
      state.sidePage = null;
      await loadMessages(firstConversationId);
      scheduleScrollToBottom();
      void acknowledgeConversationRead(firstConversationId);
    }
    toast(`已转发到 ${targets.length} 个聊天`);
    render();
  } catch (error) {
    toast(error?.message || "转发失败");
  }
}

function ensureConversationIdForForwardTarget(target) {
  if (target.type === "conversation" && target.conversationId) {
    state.data.messages[target.conversationId] = state.data.messages[target.conversationId] || [];
    return target.conversationId;
  }
  const contact = state.data.contacts.find(item => item.id === target.contactId);
  if (!contact) throw new Error("未找到联系人");
  const sessionId = privateConversationIdFor(contact.id);
  let conversation = getConversation(sessionId);
  if (!conversation) {
    conversation = {
      id: sessionId,
      kind: "session",
      title: contact.nickname,
      avatar: contact.avatar,
      unread: 0,
      lastText: "",
      lastAt: new Date().toISOString()
    };
    state.data.conversations.unshift(conversation);
  }
  state.data.messages[sessionId] = state.data.messages[sessionId] || [];
  return sessionId;
}

function buildForwardPayload(message) {
  return {
    type: message.type,
    body: message.body,
    attachment: message.attachment ? structuredClone(message.attachment) : undefined,
    mentions: Array.isArray(message.mentions) ? [...message.mentions] : [],
    quote: message.quote ? structuredClone(message.quote) : undefined
  };
}

async function deliverMessageToConversation(conversationId, payload) {
  let message;
  if (state.useMock) {
    message = {
      id: id("msg"),
      conversationId,
      senderId: state.user.id,
      senderName: outgoingSenderName(conversationId),
      createdAt: new Date().toISOString(),
      ...payload
    };
    state.data.messages[conversationId] = [...(state.data.messages[conversationId] || []), message];
  } else {
    message = await api(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  upsertConversationPreview(conversationId, message);
  return message;
}

function getCurrentDraftText() {
  return state.draftTextByConversation?.[state.selectedConversationId] || "";
}

function setCurrentDraftText(value) {
  if (!state.selectedConversationId) return;
  state.draftTextByConversation = updateDraftMap(state.draftTextByConversation, state.selectedConversationId, value);
  if (Object.keys(state.draftTextByConversation).length) {
    localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(state.draftTextByConversation));
  } else {
    localStorage.removeItem(DRAFT_CACHE_KEY);
  }
}

function getCurrentReplyDraft() {
  return state.replyDraftByConversation?.[state.selectedConversationId] || null;
}

function setCurrentReplyDraft(value) {
  if (!state.selectedConversationId) return;
  state.replyDraftByConversation = updateDraftMap(state.replyDraftByConversation, state.selectedConversationId, value);
  if (Object.keys(state.replyDraftByConversation).length) {
    localStorage.setItem(REPLY_DRAFT_CACHE_KEY, JSON.stringify(state.replyDraftByConversation));
  } else {
    localStorage.removeItem(REPLY_DRAFT_CACHE_KEY);
  }
}

function syncHighlightedMessage() {
  document.querySelectorAll(".message.highlighted").forEach(item => item.classList.remove("highlighted"));
  if (!state.highlightedMessageId) return;
  const selector = `[data-message-id="${CSS.escape(String(state.highlightedMessageId))}"]`;
  document.querySelector(selector)?.classList.add("highlighted");
}

function jumpToQuotedMessage(messageId) {
  if (!messageId) return;
  const item = document.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  if (!item) return;
  state.highlightedMessageId = messageId;
  syncHighlightedMessage();
  item.scrollIntoView({ block: "center", behavior: "smooth" });
  setTimeout(() => {
    if (state.highlightedMessageId !== messageId) return;
    state.highlightedMessageId = null;
    syncHighlightedMessage();
  }, 1400);
}

async function deleteMessage(message) {
  if (!canDeleteMessage(message, state.user, currentGroup(), { allowMock: state.useMock })) {
    toast(`没有权限删除这条消息：${summarizeMessage(message) || "消息"}`);
    return;
  }
  if (!confirm("确定删除这条消息？")) return;
  const conversationId = state.selectedConversationId;
  try {
    if (!state.useMock) {
      await api(`/api/conversations/${conversationId}/messages/${message.id}`, { method: "DELETE" });
    }
    const messages = state.data.messages[conversationId] || [];
    state.data.messages[conversationId] = messages.filter(item => item.id !== message.id);
    refreshConversationPreview(conversationId);
    if (state.sidePage === "audit-logs") await loadGroupAuditLogs();
    toast("已删除");
    render();
  } catch (error) {
    toast(error?.message?.includes("403") || error?.message?.includes("permission") ? "没有权限删除这条消息" : "删除失败");
  }
}

function refreshConversationPreview(conversationId) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  const messages = state.data.messages[conversationId] || [];
  const last = messages[messages.length - 1];
  if (!last) {
    conv.lastText = "";
    conv.lastAt = new Date().toISOString();
    conv.unread = 0;
    return;
  }
  conv.lastText = conversationLastText(conv, last);
  conv.lastAt = last.createdAt;
  conv.unread = 0;
  conv.mentionedMe = false;
}

function upsertConversationPreview(conversationId, message, options = {}) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  conv.lastText = conversationLastText(conv, message);
  conv.lastAt = message.createdAt;
  if (options.mentionMe) {
    conv.mentionedMe = true;
  }
  if (options.bumpUnread) {
    conv.unread = (conv.unread || 0) + 1;
  } else {
    conv.unread = 0;
  }
}

function conversationLastText(conversation, message) {
  const preview = messagePreviewText(message);
  if (!message || !preview) return preview || "";
  if (message.senderId === state.user?.id) {
    const sender = conversation?.kind === "group" ? groupNicknameForConversation(conversation) : "我";
    return `${sender}：${preview}`;
  }
  if (conversation?.kind === "group" && message.senderName) {
    return `${message.senderName}：${preview}`;
  }
  return preview;
}

function markConversationRead(conversationId) {
  const conv = getConversation(conversationId);
  if (conv) {
    conv.unread = 0;
    conv.mentionedMe = false;
  }
}

function canAcknowledgeConversationRead(conversationId) {
  return Boolean(
    conversationId &&
    state.section === "messages" &&
    state.selectedConversationId === conversationId &&
    !state.sidePage &&
    document.visibilityState === "visible" &&
    (typeof document.hasFocus !== "function" || document.hasFocus())
  );
}

async function acknowledgeConversationRead(conversationId) {
  if (!canAcknowledgeConversationRead(conversationId)) return false;
  markConversationRead(conversationId);
  delete state.unreadBoundaryByConversation[conversationId];
  if (state.useMock) return true;
  try {
    await api(`/api/conversations/${conversationId}/messages/read`, { method: "POST" });
    return true;
  } catch (_) {
    return false;
  }
}

function acknowledgeVisibleConversationRead() {
  if (document.visibilityState !== "visible") return;
  const conversationId = state.selectedConversationId;
  if (!canAcknowledgeConversationRead(conversationId)) return;
  void acknowledgeConversationRead(conversationId).then((acknowledged) => {
    if (acknowledged && canAcknowledgeConversationRead(conversationId)) render();
  });
}

function conversationNeedsAttention(conversation) {
  return Boolean(conversation?.mentionedMe || (conversation?.unread || 0) > 0);
}

function groupInviteToast(invitedDirectly, invitedPending) {
  if (invitedDirectly && invitedPending) {
    return `已邀请 ${invitedDirectly} 人入群，另有 ${invitedPending} 人等待对方同意`;
  }
  if (invitedPending) {
    return `已发送 ${invitedPending} 条入群邀请，等待对方同意`;
  }
  return invitedDirectly ? `已邀请 ${invitedDirectly} 人入群` : "没有新的成员被邀请";
}

function appendLocalGroupSystemMessage(group, body) {
  if (!group?.id || !body) return;
  const conversationId = `group-${group.id}`;
  const message = {
    id: id("system"),
    conversationId,
    senderId: "system",
    senderName: "系统",
    type: "system",
    body,
    createdAt: new Date().toISOString()
  };
  state.data.messages[conversationId] = [...(state.data.messages[conversationId] || []), message];
  upsertConversationPreview(conversationId, message);
}

function createLocalGroup(title, memberIds = []) {
  const invitedMembers = memberIds.map(userId => {
    const contact = state.data.contacts.find(item => item.id === userId);
    return { userId, nickname: contact?.nickname || userId, role: "member", muted: false };
  });
  const group = {
    id: id("local"),
    title,
    avatar: avatar("群"),
    chatId: String(Math.floor(Math.random() * 900000 + 100000)),
    announcement: "",
    joinMode: "public_qr",
    myNickname: state.user.nickname,
    disableMemberAddFriend: false,
    allMuted: false,
    rateLimit: { enabled: false, windowSeconds: 10, maxMessages: 3 },
    autoMuteNewMembers: false,
    createdAt: new Date().toISOString(),
    members: [{ userId: state.user.id, nickname: state.user.nickname, role: "owner", muted: false }, ...invitedMembers]
  };
  return group;
}

function createMockData() {
  const now = new Date();
  const user = { id: "u1", country: "+60", phone: "174319676", chatId: "o8tew3", nickname: "chenshao", signature: "保持专注，保持联系。", avatar: avatar("陈") };
  const contacts = [
    { id: "388770", nickname: "陈刀仔（日进斗金）", signature: "愿你每天都好运", chatId: "cdz888", avatar: avatar("陈"), remark: "老朋友", tags: ["优先", "线下"], privacy: { friendVerification: true, inviteGroupVerification: true } },
    { id: "388769", nickname: "苏雅", signature: "在线接待", chatId: "suya66", avatar: avatar("苏"), tags: ["客服"], privacy: { friendVerification: false, inviteGroupVerification: false } },
    { id: "388754", nickname: "恋情客", signature: "忙碌中", chatId: "love66", avatar: avatar("恋"), privacy: { friendVerification: true, inviteGroupVerification: true } },
    { id: "388786", nickname: "^魚. 𝙯ᙆ", signature: "保持联系", chatId: "fish66", avatar: avatar("魚"), remark: "常联系", tags: ["重点"], privacy: { friendVerification: true, inviteGroupVerification: false } },
    { id: "1278382", nickname: "小花朵接待号", signature: "会员接待", chatId: "flower", avatar: avatar("花"), privacy: { friendVerification: false, inviteGroupVerification: true } }
  ];
  const directory = [
    { id: "500101", nickname: "阿明", signature: "新朋友", chatId: "aming1", avatar: avatar("明"), privacy: { friendVerification: false, inviteGroupVerification: false } },
    { id: "500102", nickname: "小鹿", signature: "需要验证", chatId: "deer77", avatar: avatar("鹿"), privacy: { friendVerification: true, inviteGroupVerification: true } }
  ];
  const directoryGroups = [
    {
      id: "61001",
      title: "新朋友交流 1 群",
      avatar: avatar("新"),
      chatId: "61001",
      inviterId: "388769",
      members: [{ userId: "388769", nickname: "苏雅", role: "owner", muted: false }]
    },
    {
      id: "61002",
      title: "效率协作 2 群",
      avatar: avatar("效"),
      chatId: "61002",
      inviterId: "388770",
      members: [{ userId: "388770", nickname: "陈刀仔（日进斗金）", role: "owner", muted: false }]
    }
  ];
  const groups = [{
    id: "21444",
    title: "test",
    avatar: avatar("群"),
    chatId: "128847",
    announcement: "欢迎来到测试群。",
    joinMode: "public_qr",
    myNickname: "chenshao",
    disableMemberAddFriend: true,
    allMuted: false,
    rateLimit: { enabled: false, windowSeconds: 10, maxMessages: 3 },
    autoMuteNewMembers: false,
    createdAt: addHours(now, -24),
    members: [
      { userId: "u1", nickname: "chenshao", role: "owner", muted: false },
      { userId: "388786", nickname: "^魚. 𝙯ᙆ", role: "member", muted: false },
      { userId: "388754", nickname: "恋情客", role: "member", muted: false },
      { userId: "388769", nickname: "苏雅", role: "admin", muted: false },
      { userId: "388770", nickname: "陈刀仔（日进斗金）", role: "member", muted: false }
    ]
  }];
  return {
    user,
    contacts,
    directory,
    directoryGroups,
    groups,
    requests: [
      { id: "fr1", type: "friend", direction: "incoming", user: contacts[0], greeting: "你好，我是 陈刀仔（日进斗金）", status: "pending", createdAt: addHours(now, -25) },
      { id: "fr2", type: "friend", direction: "incoming", user: contacts[1], greeting: "你好，我是 苏雅", status: "pending", createdAt: addHours(now, -25) }
	    ],
	    groupJoinRequests: {},
	    groupBlacklists: {
	      "21444": []
	    },
	    groupBots: {
	      "21444": [defaultGroupBot("21444")]
	    },
	    auditLogs: {
	      "21444": [
	        { id: "audit0", groupId: "21444", actorId: "u1", actorName: "chenshao", action: "member_invited", targetId: "1278382", targetName: "小花朵接待号", detail: "chenshao 邀请 小花朵接待号 入群", createdAt: addHours(now, -1) },
	        { id: "audit_leave", groupId: "21444", actorId: "388754", actorName: "恋情客", action: "member_left", targetId: "388754", targetName: "恋情客", detail: "成员主动退出群聊", createdAt: addHours(now, -2) },
	        { id: "audit1", groupId: "21444", actorId: "u1", actorName: "chenshao", action: "member_muted", targetId: "388754", targetName: "恋情客", detail: "禁言成员", createdAt: addHours(now, -3) },
	        { id: "audit2", groupId: "21444", actorId: "388769", actorName: "苏雅", action: "join_accepted", targetId: "500101", targetName: "阿明", detail: "同意入群申请", createdAt: addHours(now, -5) }
	      ]
	    },
	    conversations: [
      { id: "group-19146", kind: "group", title: "VIP 会员讨论 08群", avatar: avatar("V"), unread: 0, lastText: "万顺下分专员1：[图片]", lastAt: addHours(now, -2) },
      { id: "group-19144", kind: "group", title: "财富密码资料群", avatar: avatar("财"), unread: 99, mentionedMe: true, lastText: "[有人@你] 苏洋：1111", lastAt: addHours(now, -3) },
      { id: "session-1278382", kind: "session", title: "小花朵接待号", avatar: avatar("花"), unread: 0, lastText: "[图片]", lastAt: addHours(now, -26) },
      { id: "group-21444", kind: "group", title: "test", avatar: avatar("群"), unread: 0, mentionedMe: false, lastText: "我：@^魚. 𝙯ᙆ test", lastAt: addHours(now, -23) },
      { id: "session-388770", kind: "session", title: "陈刀仔（日进斗金）", avatar: avatar("陈"), unread: 0, lastText: "你们已是好友，可以开始聊天了!", lastAt: addHours(now, -24) }
    ],
    messages: {
      "group-21444": [
        { id: "m1", conversationId: "group-21444", senderId: "388786", senderName: "^魚. 𝙯ᙆ", type: "text", body: "test", readCount: 1, readTotal: 4, createdAt: addHours(now, -23.05) },
        { id: "m2", conversationId: "group-21444", senderId: "u1", senderName: "chenshao", type: "text", body: "@^魚. 𝙯ᙆ test", readCount: 2, readTotal: 4, createdAt: addHours(now, -23) }
      ],
      "session-1278382": [
        { id: "m3", conversationId: "session-1278382", senderId: "1278382", senderName: "小花朵接待号", type: "image", body: "[图片]", attachment: { id: "a1", name: "welcome.png", url: "/public/demo-photo.svg", mimeType: "image/svg+xml", size: 2048 }, createdAt: addHours(now, -26) }
      ],
      "group-19146": [],
      "group-19144": [],
      "session-388770": []
    },
    collections: [
      { id: "col1", kind: "text", title: "群聊摘录", preview: "@^魚. 𝙯ᙆ test", createdAt: addHours(now, -22) },
      { id: "col2", kind: "file", title: "说明文档.pdf", preview: "PDF 文件", createdAt: addHours(now, -48) }
    ]
  };
}

function avatar(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#0a2fc0"/><text x="48" y="58" font-family="Arial,sans-serif" font-size="34" text-anchor="middle" fill="white">${escapeHTML(label)}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function avatarFor(entity, fallback = "我") {
  const rawAvatar = String(entity?.avatar || "").trim();
  if (rawAvatar && rawAvatar !== "undefined" && rawAvatar !== "null") {
    return avatarSrc(rawAvatar);
  }
  return avatarSrc(avatar(firstAvatarGlyph(entity?.nickname || entity?.title || entity?.name || fallback)));
}

function avatarFallbackFor(entity, fallback = "我") {
  const label = firstAvatarGlyph(entity?.nickname || entity?.title || entity?.name || fallback);
  return avatarSrc(avatar(label));
}

function renderEntityAvatar(entity, fallback = "我", className = "avatar") {
  return `<img class="${className}" src="${avatarFor(entity, fallback)}" data-avatar-fallback="${avatarFallbackFor(entity, fallback)}" alt="">`;
}

function firstAvatarGlyph(value) {
  const text = String(value || "").trim();
  return Array.from(text)[0] || "我";
}

function avatarSrc(value) {
  let src = String(value || avatar("?"));
  if (src.startsWith("data:image/svg+xml;utf8,")) {
    const prefix = "data:image/svg+xml;utf8,";
    const raw = src.slice(prefix.length).replace(/\+/g, " ");
    let svg = raw;
    try {
      svg = decodeURIComponent(raw);
    } catch (_) {}
    src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }
  return escapeAttr(src);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600 * 1000).toISOString();
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatRequestDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更早";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - target) / (24 * 3600 * 1000));
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return "近 7 天";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function formatPreview(value) {
  return escapeHTML(value || "");
}

function renderMessageText(value) {
  const text = escapeHTML(value || "");
  return text.replace(/@([^\s@]+)/g, (match, mention) => {
    const target = findMentionTargetByName(mention, mentionContext());
    if (!target) {
      return `<span class="mention">${match}</span>`;
    }
    return `<button class="mention mention-chip" type="button" data-open-contact="${escapeAttr(target.nickname)}">${match}</button>`;
  });
}

function collectMentionIds(body) {
  return collectMentionIdsFromText(body, mentionContext());
}

function mentionContext() {
  return {
    group: currentGroup(),
    contacts: state.data.contacts,
    currentUserId: state.user?.id
  };
}

function uniqueMentionIds(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function mediaURL(value) {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:") || value.startsWith("http")) return value;
  if (value.startsWith("/uploads/")) return API_BASE + value;
  return value;
}

function scheduleScrollToBottom() {
  state.scrollToBottom = true;
}

function flushScrollToBottom() {
  if (!state.scrollToBottom) return;
  state.scrollToBottom = false;
  const scroll = () => {
    const messages = document.querySelector(".messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  };
  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
    setTimeout(scroll, 120);
  });
}

function flushUnreadBoundaryFocus() {
  const conversationId = state.unreadBoundaryFocusConversationId;
  if (!conversationId || conversationId !== state.selectedConversationId) return;
  state.unreadBoundaryFocusConversationId = null;
  const focusBoundary = () => {
    document.querySelector(".unread-message-boundary")?.scrollIntoView({ block: "center", behavior: "auto" });
  };
  requestAnimationFrame(() => {
    focusBoundary();
    requestAnimationFrame(focusBoundary);
  });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, "&#096;");
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function toast(message) {
  state.toast = message;
  render();
  window.setTimeout(() => {
    state.toast = "";
    render();
  }, 1800);
}
