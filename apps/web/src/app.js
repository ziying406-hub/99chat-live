const API_BASE = "http://localhost:8080";

const state = {
  authed: Boolean(localStorage.getItem("chatlite-token")),
  authMode: "login",
  user: null,
  section: "messages",
  filter: "all",
  requestFilter: "all",
  query: "",
  selectedConversationId: "group-21444",
  sidePage: null,
  modal: null,
  toast: "",
  toolMenu: null,
  voiceMode: false,
  useMock: false,
  data: null,
  ws: null,
  scrollToBottom: false,
  preview: null,
  mention: null,
  mentionIds: [],
  messageScrollTopByConversation: {},
  pendingMessageScrollRestore: null,
  draftTextByConversation: {},
  replyDraftByConversation: {},
  pendingEditorAutofocus: false,
  highlightedMessageId: null,
  forwardPayload: null,
  forwardSelection: null,
  forwardSearchRefreshTimer: null,
  forwardSearchKeepAliveUntil: 0,
  messageMenu: null,
  conversationMenu: null,
  multiSelect: null,
  suppressPointerUntil: 0
};

const mock = createMockData();

const icons = {
  chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 5.8C4 4.25 5.25 3 6.8 3h10.4C18.75 3 20 4.25 20 5.8v6.4c0 1.55-1.25 2.8-2.8 2.8H11l-5 4v-4.1A2.8 2.8 0 0 1 4 12.2V5.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  contact: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8.5 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 21a5.5 5.5 0 0 1 11 0M13.5 20a4.5 4.5 0 0 1 8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  me: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
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
  if (state.authed) {
    await loadData();
    connectRealtime();
  }
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/src/sw.js").catch(() => {});
  }
}

async function loadData() {
  try {
    const [user, conversations, contacts, groups, requests, collections] = await Promise.all([
      api("/api/me"),
      api("/api/conversations"),
      api("/api/contacts"),
      api("/api/groups"),
      api("/api/friend-requests"),
      api("/api/collections")
    ]);
    state.user = user;
    ensureUserSettings();
    state.data = { conversations, contacts, groups, requests, collections, messages: {} };
    await loadMessages(state.selectedConversationId);
    scheduleScrollToBottom();
  } catch (error) {
    state.useMock = true;
    state.user = structuredClone(mock.user);
    ensureUserSettings();
    state.data = structuredClone(mock);
    scheduleScrollToBottom();
  }
}

async function api(path, options = {}) {
  const token = localStorage.getItem("chatlite-token");
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadMessages(conversationId) {
  if (!state.data.messages[conversationId]) {
    if (state.useMock) {
      state.data.messages[conversationId] = mock.messages[conversationId] || [];
    } else {
      state.data.messages[conversationId] = await api(`/api/conversations/${conversationId}/messages`);
    }
  }
}

function connectRealtime() {
  if (state.useMock || state.ws) return;
  try {
    const ws = new WebSocket("ws://localhost:8080/ws");
    ws.onmessage = event => {
      const envelope = JSON.parse(event.data);
      if (envelope.type === "message.created") {
        const id = envelope.conversationId;
        const message = envelope.payload;
        state.data.messages[id] = [...(state.data.messages[id] || []), envelope.payload];
        const incoming = message.senderId !== state.user?.id;
        const mentionedMe = incoming && Array.isArray(message.mentions) && message.mentions.includes(state.user?.id);
        upsertConversationPreview(id, message, {
          bumpUnread: incoming && id !== state.selectedConversationId,
          mentionMe: mentionedMe
        });
        if (mentionedMe) {
          const conv = getConversation(id);
          toast(`有人 @ 你${conv ? ` · ${conv.title}` : ""}`);
        }
        if (id === state.selectedConversationId) scheduleScrollToBottom();
        render();
      }
    };
    state.ws = ws;
  } catch (_) {}
}

function render() {
  rememberMessageScrollPosition();
  rememberTransientFocus();
  const app = document.querySelector("#app");
  app.innerHTML = state.authed ? renderApp() : renderAuth();
  bindEvents();
  flushScrollToBottom();
  restoreMessageScrollPosition();
  restoreTransientFocus();
  syncHighlightedMessage();
}

function renderAuth() {
  const isRegister = state.authMode === "register";
  return `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand-mark"><img src="/public/icon.svg" alt="ChatLite"></div>
        <div class="tabs">
          <button class="tab ${!isRegister ? "active" : ""}" type="button" data-auth-mode="login">密码登录</button>
          <button class="tab" type="button" data-toast="验证码登录已预留">验证码登录</button>
          <button class="tab ${isRegister ? "active" : ""}" type="button" data-auth-mode="register">注册</button>
        </div>
        <form id="loginForm">
          ${isRegister ? `<input class="input" style="margin-bottom:16px" name="nickname" value="新用户" placeholder="请输入昵称" autocomplete="nickname">` : ""}
          <div class="field-row">
            <select class="select" name="country">
              <option value="+86">+86</option>
              <option value="+852">+852</option>
              <option value="+65">+65</option>
              <option value="+60" selected>+60</option>
              <option value="+84">+84</option>
            </select>
            <input class="input" name="phone" value="174319676" placeholder="请输入手机号码" autocomplete="tel-local">
          </div>
          <input class="input" name="password" value="${isRegister ? "" : "demo123456"}" placeholder="请输入密码" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}">
          <div class="auth-links"><a href="#" data-toast="忘记密码流程已预留">忘记密码</a></div>
          <button class="primary-btn" type="submit">${isRegister ? "注册并登录" : "登录"}</button>
          <a class="auth-register" href="#" data-auth-mode="${isRegister ? "login" : "register"}">${isRegister ? "返回登录" : "立即注册"}</a>
        </form>
      </section>
      ${state.toast ? `<div class="toast">${escapeHTML(state.toast)}</div>` : ""}
    </main>`;
}

function renderApp() {
  const activeConv = getConversation(state.selectedConversationId);
  const unread = state.data.conversations.reduce((sum, item) => sum + item.unread, 0);
  const mobileActive = state.section === "messages" && activeConv ? "mobile-active" : "";
  return `
    <main class="app-shell">
      <nav class="rail">
        <button class="icon-btn" data-section="me" title="个人中心"><img class="avatar" src="${avatarSrc(state.user.avatar)}" alt=""></button>
        <div class="rail-nav">
          ${railLink("contact", "通讯录", icons.contact)}
          ${railLink("messages", "聊天", icons.chat, unread > 0 ? "99+" : "")}
          ${railLink("me", "我的", icons.me)}
        </div>
      </nav>
      ${renderSidebar()}
      <section class="workspace ${state.section !== "messages" || !state.sidePage ? "single" : ""} ${mobileActive}">
        ${renderWorkspace()}
      </section>
      <input class="hidden" id="filePicker" type="file">
      ${renderConversationContextMenu()}
      ${renderMessageContextMenu()}
      ${renderModal()}
      ${state.toast ? `<div class="toast">${escapeHTML(state.toast)}</div>` : ""}
    </main>`;
}

function railLink(section, label, icon, badge = "") {
  return `<a class="rail-link ${state.section === section ? "active" : ""}" href="#" data-section="${section}">
    ${badge ? `<span class="badge">${badge}</span>` : ""}
    ${icon}<span>${label}</span>
  </a>`;
}

function renderSidebar() {
  if (state.section === "contact") return renderContactSidebar();
  if (state.section === "me") return renderProfileSidebar();
  return renderMessageSidebar();
}

function renderMessageSidebar() {
  const items = filteredConversations();
  return `
    <aside class="sidebar">
      <header class="panel-header">
        <h2>聊天</h2>
        <div class="icon-row">
          <button class="icon-btn" title="全部已读" data-action="mark-read">✓</button>
          <button class="icon-btn" title="添加" data-modal="quick-add">${icons.plus}</button>
        </div>
      </header>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="搜索"></div>
      <div class="segmented">
        ${seg("all", "全部")}
        ${seg("unread", "未读")}
        ${seg("group", "群聊")}
      </div>
      <div class="list">
        ${items.map(c => `
          <article class="list-item ${c.id === state.selectedConversationId ? "active" : ""} ${c.pinned ? "conversation-pinned" : ""}" data-conversation="${c.id}">
            <img class="avatar" src="${avatarSrc(c.avatar)}" alt="">
            <div>
              <div class="item-title">${escapeHTML(c.title)}${c.muted ? ` <span class="item-flag">免打扰</span>` : ""}${c.pinned ? ` <span class="item-flag">置顶</span>` : ""}</div>
              <div class="item-preview">${formatPreview(getConversationPreviewText(c))}</div>
            </div>
            <div class="item-meta">
              ${formatTime(c.lastAt)}
              ${c.unread ? `<br><span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}
              ${conversationMentionsCurrentUser(c) ? `<br><span class="mention-badge list">@你</span>` : ""}
            </div>
          </article>`).join("")}
      </div>
    </aside>`;
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
    <article class="list-item ${options.compact ? "profile-side-entry" : ""} ${active ? "active" : ""}" data-sidepage="${page}">
      <div class="side-entry-icon">${escapeHTML(icon)}</div>
      <div>
        <div class="item-title">${title}</div>
        <div class="item-preview">${preview}</div>
      </div>
      ${options.compact ? `<div class="side-entry-arrow">›</div>` : ""}
    </article>`;
}

function renderProfileSidebar() {
  const entries = [
    ["collections", "我的收藏", "", "☆"],
    ["notifications", "通知设置", "", "◔"],
    ["messaging", "聊天设置", "", "✉"],
    ["privacy", "隐私", "", "⌂"],
    ["security", "安全", "", "◍"],
    ["general", "通用", "", "⚙"],
    ["switch-user", "切换使用者", "", "↺"]
  ];
  return `
    <aside class="sidebar">
      <header class="panel-header"><h2>个人中心</h2></header>
      <div class="profile-card">
        <div class="profile-card-top">
          <img class="avatar profile-card-avatar" src="${avatarSrc(state.user.avatar)}" alt="">
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
        ${entries.map(([page, title, preview, icon]) => sideEntry(page, title, preview, { compact: true, icon })).join("")}
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

function renderWorkspace() {
  if (state.section === "contact") return renderContactPage();
  if (state.section === "me") return renderProfilePage();
  const conv = getConversation(state.selectedConversationId);
  return `${renderChatPane(conv)}${renderDetailPane(conv)}`;
}

function renderChatPane(conv) {
  if (!conv) return `<section class="chat-pane"><div class="empty-state">选择一个会话开始聊天</div></section>`;
  const messages = state.data.messages[conv.id] || [];
  const multiSelectActive = state.multiSelect?.conversationId === conv.id;
  return `
    <section class="chat-pane">
      <header class="chat-header">
        <button class="icon-btn" data-mobile-close>${icons.back}</button>
        <a class="chat-title" href="#" data-sidepage="members">${escapeHTML(conv.title)}</a>
        <button class="icon-btn" data-sidepage="settings" title="设置">${icons.settings}</button>
      </header>
      <div class="messages ${multiSelectActive ? "multi-select-active" : ""}">
        <div class="day-divider">昨日下午 4:48</div>
        ${messages.map(renderMessage).join("")}
      </div>
      <div class="composer-shell">
        ${multiSelectActive ? renderMultiSelectBar() : `
          <div id="replyBarHost">${renderReplyComposer()}</div>
          <form class="composer" id="composer">
            <button class="icon-btn" type="button" data-action="voice">${state.voiceMode ? "⌨" : icons.mic}</button>
            ${state.voiceMode ? `<button class="ghost-btn" type="button" data-action="fake-voice">00:00 点击录音</button>` : `<textarea class="editor" id="editor" placeholder="输入消息" ${state.pendingEditorAutofocus ? "autofocus" : ""}>${escapeHTML(getCurrentDraftText())}</textarea>`}
            <button class="icon-btn" type="button" data-action="mention" title="提及成员">@</button>
            <button class="icon-btn" type="button" data-tool="attachments" title="附件">${icons.attach}</button>
            <button class="icon-btn" type="button" data-tool="emoji" title="表情">${icons.smile}</button>
            <button class="primary-btn inline" type="submit">传送</button>
          </form>
          <div class="mention-menu" id="mentionMenu">${renderMentionMenu()}</div>
          ${renderToolMenu()}
        `}
      </div>
    </section>`;
}

function renderMessage(message) {
  const mine = message.senderId === state.user.id;
  const mentionedMe = (message.mentions || []).includes(state.user.id);
  const multiSelectActive = state.multiSelect?.conversationId === state.selectedConversationId;
  const selected = Boolean(state.multiSelect?.selectedIds?.includes(message.id));
  const highlighted = state.highlightedMessageId === message.id;
  return `
    <article class="message ${mine ? "me" : ""} ${multiSelectActive ? "selecting" : ""} ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""}" data-message-id="${escapeAttr(message.id)}">
      <img class="avatar" src="${avatarSrc(mine ? state.user.avatar : avatar(message.senderName[0] || "友"))}" alt="">
      ${multiSelectActive ? `<button class="message-select-toggle ${selected ? "active" : ""}" type="button" data-toggle-message-select="${escapeAttr(message.id)}" aria-label="${selected ? "取消选择" : "选择消息"}">${selected ? "✓" : ""}</button>` : ""}
      <div class="bubble">
        <div class="sender">${escapeHTML(message.senderName)} · ${formatTime(message.createdAt)}${mentionedMe ? ` <span class="mention-badge">@你</span>` : ""}</div>
        ${renderMessageBody(message)}
      </div>
    </article>`;
}

function renderMessageBody(message) {
  const quote = renderQuotedMessage(message.quote);
  if (message.type === "image") {
    const url = mediaURL(message.attachment?.url || "/public/demo-photo.svg");
    const name = escapeHTML(message.attachment?.name || message.body || "图片");
    return `
      ${quote}
      <button class="media-card media-card-button" type="button" data-open-image="${escapeAttr(url)}" data-image-name="${name}">
        <img src="${url}" alt="${name}">
        <span class="media-card-overlay">点按查看大图</span>
      </button>`;
  }
  if (message.type === "file") {
    const url = mediaURL(message.attachment?.url || "");
    const name = escapeHTML(message.attachment?.name || message.body || "文件");
    const openable = url && url !== "#";
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
      <div class="quoted-message-author">${escapeHTML(quote.senderName || "引用消息")}</div>
      <div class="quoted-message-body">${escapeHTML(quote.preview || "")}</div>
    </button>`;
}

function renderReplyComposer() {
  const replyingTo = getCurrentReplyDraft();
  if (!replyingTo) return "";
  return `
    <div class="reply-bar">
      <div class="reply-bar-label">引用 ${escapeHTML(replyingTo.senderName || "")}${replyingTo.typeLabel ? ` · ${escapeHTML(replyingTo.typeLabel)}` : ""}</div>
      <div class="reply-bar-body">${escapeHTML(replyingTo.preview || "")}</div>
      <button class="icon-btn reply-bar-close" type="button" data-clear-reply>×</button>
    </div>`;
}

function renderMultiSelectBar() {
  const active = state.multiSelect?.conversationId === state.selectedConversationId;
  if (!active) return "";
  const count = state.multiSelect?.selectedIds?.length || 0;
  return `
    <div class="multi-select-bar">
      <button class="multi-select-btn multi-select-btn-cancel" type="button" data-multi-action="cancel">取消</button>
      <button class="multi-select-btn multi-select-btn-forward" type="button" data-multi-action="forward" ${count ? "" : "disabled"}>转发${count ? `(${count})` : ""}</button>
      <button class="multi-select-btn multi-select-btn-delete" type="button" data-multi-action="delete" ${count ? "" : "disabled"}>删除${count ? `(${count})` : ""}</button>
    </div>`;
}

function renderToolMenu() {
  if (state.toolMenu === "attachments") {
    return `
      <div class="tool-popover">
        <button data-pick-file="image">🖼<br>照片</button>
        <button data-modal="send-contact">👤<br>名片</button>
        <button data-pick-file="file">📄<br>文件</button>
        <button data-sidepage="collections">⭐<br>收藏</button>
      </div>`;
  }
  if (state.toolMenu === "emoji") {
    const emojis = "😀 😄 😊 😎 😍 👍 🙏 🎉 🔥 ❤️ 💬 📌 ⭐ 🇲🇾 🇸🇬 🇨🇳 🇭🇰 🇹🇼 🇵🇭 🇹🇭 🇻🇳 🇯🇵 🇰🇷".split(" ");
    return `<div class="emoji-popover">${emojis.map(e => `<button data-emoji="${e}">${e}</button>`).join("")}</div>`;
  }
  return "";
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
  const canDelete = state.useMock || message.senderId === state.user?.id;
  const left = Math.max(12, state.messageMenu.x || 0);
  const top = Math.max(12, state.messageMenu.y || 0);
  return `
    <div class="message-context-menu" data-message-menu style="left:${left}px; top:${top}px;">
      <button type="button" data-message-action="forward">转发</button>
      <label data-message-action="quote" for="editor" tabindex="0">引用</label>
      <button type="button" data-message-action="copy">复制</button>
      <button type="button" data-message-action="favorite">收藏</button>
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
      <button type="button" data-conversation-action="delete">删除</button>
    </div>`;
}

function renderDetailPane(conv) {
  if (!conv || !state.sidePage) return "";
  if (state.sidePage === "media") return renderMediaPane();
  if (state.sidePage === "search") return renderSearchPane();
  if (state.sidePage === "report") return renderReportPane();
  if (state.sidePage === "collections") return renderCollectionsPane();
  if (state.sidePage === "members") return renderMembersPane();
  return renderSettingsPane(conv);
}

function renderSettingsPane(conv) {
  const group = currentGroup();
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>聊天设置</h3></header>
      <section class="section">
        <div class="setting-row"><span>入群方式</span><strong>${group ? "公开群（扫码入群）" : "好友会话"}</strong></div>
        <div class="setting-row"><span>消息免打扰</span><span class="switch"></span></div>
        <div class="setting-row"><span>置顶聊天</span><span class="switch"></span></div>
      </section>
      ${group ? `
        <section class="section">
          <h3>群组</h3>
          ${settingLink("members", "群成员", `${group.members.length} 人`)}
          ${settingLink("admin", "群组管理", "管理员与权限")}
          ${settingLink("applications", "入群申请", "近期请求")}
          ${settingLink("rename", "群组名称", group.title)}
          ${settingLink("announcement", "群公告", group.announcement || "未设置")}
          ${settingLink("qrcode", "群二维码", group.chatId)}
          ${settingLink("nickname", "我在本群的昵称", group.myNickname)}
        </section>` : ""}
      <section class="section">
        <h3>内容</h3>
        ${settingLink("media", "图片与视频", "全部 / 图片 / 视频 / 档案")}
        ${settingLink("search", "搜索聊天记录", "关键词查找")}
        ${settingLink("collections", "我的收藏", "文字 / 文件 / 语音")}
      </section>
      <section class="section">
        ${settingButton("clear-chat", "清除聊天记录", "danger-btn inline")}
        ${group ? settingButton("dissolve-group", "解散群", "danger-btn inline") : ""}
        ${settingLink("report", "检举", "提交违规原因")}
      </section>
    </aside>`;
}

function settingLink(page, label, value) {
  return `<a class="setting-row" href="#" data-sidepage="${page}"><span>${label}</span><span class="item-meta">${escapeHTML(value)}</span></a>`;
}

function settingButton(action, label, klass) {
  return `<div class="setting-row"><span>${label}</span><button class="${klass}" data-action="${action}">${label}</button></div>`;
}

function renderMembersPane() {
  const group = currentGroup();
  if (!group) return renderSettingsPane(getConversation(state.selectedConversationId));
  const mentionStats = getGroupMentionStats(group);
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
      <header class="panel-header"><h3>群聊成员</h3><button class="ghost-btn inline" data-modal="invite">新增</button></header>
      <section class="section">
        <div class="setting-row"><span>群聊ID</span><strong>${group.chatId}</strong></div>
      </section>
      <div class="list">
        ${members.map(m => {
          const mentionCount = mentionStats[m.userId] || 0;
          return `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar(m.nickname[0] || "成"))}" alt="">
            <div>
              <div class="item-title">${escapeHTML(m.nickname)}</div>
              <div class="item-preview">${m.role}${m.muted ? " · 已禁言" : ""}${mentionCount ? ` · 被@${mentionCount}次` : ""}</div>
            </div>
            <div class="icon-row">
              ${mentionCount ? `<button class="mention-badge list" type="button" data-search-member="${escapeAttr(m.nickname)}">被@${mentionCount}</button>` : ""}
              <button class="ghost-btn inline" data-member-action="mute" data-member-id="${m.userId}" data-muted="${m.muted ? "false" : "true"}">${m.muted ? "解除禁言" : "禁言"}</button>
              ${m.role === "owner" ? "" : `<button class="danger-btn inline" data-member-action="remove" data-member-id="${m.userId}">移除</button>`}
            </div>
          </article>`;
        }).join("")}
      </div>
    </aside>`;
}

function renderMediaPane() {
  const messages = state.data.messages[state.selectedConversationId] || [];
  const media = messages.filter(m => ["image", "video", "file"].includes(m.type));
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>图片与视频</h3></header>
      <div class="segmented">${["全部", "图片", "视频", "档案"].map((x, i) => `<button class="seg-btn ${i === 0 ? "active" : ""}">${x}</button>`).join("")}</div>
      <section class="section">
        <div class="grid">
          ${(media.length ? media : [{ type: "image", attachment: { url: "/public/demo-photo.svg" }, body: "演示图片" }]).map(m => `
            <div class="card">
              <button class="media-card media-card-button" type="button" data-open-image="${escapeAttr(mediaURL(m.attachment?.url || "/public/demo-photo.svg"))}" data-image-name="${escapeAttr(m.attachment?.name || m.body || "媒体")}">
                <img src="${mediaURL(m.attachment?.url || "/public/demo-photo.svg")}" alt="${escapeAttr(m.attachment?.name || m.body || "媒体")}">
                <span class="media-card-overlay">点按查看大图</span>
              </button>
              <p>${escapeHTML(m.attachment?.name || m.body || "媒体")}</p>
            </div>`).join("")}
        </div>
      </section>
    </aside>`;
}

function renderSearchPane() {
  const q = state.query.toLowerCase();
  const results = (state.data.messages[state.selectedConversationId] || []).filter(m => searchMatchesQuery(m, q));
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>搜索聊天记录</h3></header>
      <div class="search-box"><input data-action="search" value="${escapeAttr(state.query)}" placeholder="请输入关键词"></div>
      <div class="list">
        ${(q ? results : []).map(m => `<article class="list-item"><div><div class="item-title">${escapeHTML(m.senderName)}</div><div class="item-preview">${escapeHTML(m.body)}</div></div></article>`).join("") || `<div class="empty-state">最近搜索</div>`}
      </div>
    </aside>`;
}

function renderCollectionsPane() {
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>我的收藏</h3></header>
      <div class="segmented">${["全部", "文字", "图片与视频", "文件", "语音"].map((x, i) => `<button class="seg-btn ${i === 0 ? "active" : ""}">${x}</button>`).join("")}</div>
      <div class="list">
        ${state.data.collections.map(c => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar(c.kind[0].toUpperCase()))}" alt="">
            <div><div class="item-title">${escapeHTML(c.title)}</div><div class="item-preview">${escapeHTML(c.preview)}</div></div>
          </article>`).join("") || `<div class="empty-state">无收藏</div>`}
      </div>
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

function renderContactPage() {
  if (state.sidePage === "friend-requests") {
    const settings = ensureUserSettings();
    const requestGroups = getFriendRequestGroups();
    return page("好友申请", `
      <section class="section">
        <div class="item-title">演示入口</div>
        <div class="item-preview">用于模拟“别人加我”与“别人拉我进群”，会受隐私设置影响。</div>
        <div class="request-policy-grid">
          <div class="request-policy-card">
            <strong>加我为好友</strong>
            <span>${settings.friendVerification ? "当前需要验证" : "当前直接通过"}</span>
          </div>
          <div class="request-policy-card">
            <strong>拉我进群</strong>
            <span>${settings.inviteGroupVerification ? "当前需要验证" : "当前直接入群"}</span>
          </div>
        </div>
        <div class="item-meta">下方模拟按钮会处理“我发出的”分组里最新一条待处理申请。</div>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-incoming-friend">模拟别人加我</button>
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-incoming-group">模拟别人拉我进群</button>
          <button class="ghost-btn inline" type="button" data-profile-action="reset-incoming-simulations">重置演示入口</button>
        </div>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-outgoing-friend">生成我发出的好友申请</button>
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-outgoing-group">生成我发出的入群邀请</button>
        </div>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-outgoing-friend-accepted">模拟对方通过好友申请</button>
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-outgoing-friend-rejected">模拟对方未通过好友申请</button>
        </div>
        <div class="icon-row">
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-outgoing-group-accepted">模拟对方接受入群邀请</button>
          <button class="ghost-btn inline" type="button" data-profile-action="simulate-outgoing-group-rejected">模拟对方未加入群聊</button>
        </div>
      </section>
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
    return page("通讯录标签", `<p class="item-meta">更快速的搜索和管理联络人</p><button class="primary-btn inline" data-modal="tag">新增</button>`);
  }
  if (state.sidePage === "groups") {
    return page("群聊天", `
      <div class="segmented"><button class="seg-btn active">我建立的</button><button class="seg-btn">我加入的</button></div>
      ${state.data.groups.map(g => `<article class="list-item" data-conversation="group-${g.id}"><img class="avatar" src="${avatarSrc(g.avatar)}"><div><div class="item-title">${escapeHTML(g.title)}</div><div class="item-preview">${g.members.length} 位成员</div></div></article>`).join("")}`);
  }
  return page("通讯录", `<p class="item-meta">从左侧选择联系人、标签或群组。</p>`);
}

function renderProfilePage() {
  if (state.sidePage === "collections") {
    return page("我的收藏", `
      <div class="segmented">${["全部", "文字", "图片与视频", "文件", "语音"].map((x, i) => `<button class="seg-btn ${i === 0 ? "active" : ""}">${x}</button>`).join("")}</div>
      <div class="list">
        ${state.data.collections.map(c => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar(c.kind[0].toUpperCase()))}" alt="">
            <div><div class="item-title">${escapeHTML(c.title)}</div><div class="item-preview">${escapeHTML(c.preview)}</div></div>
          </article>`).join("") || `<div class="empty-state">无收藏</div>`}
      </div>`);
  }
  if (state.sidePage === "notifications") {
    ensureUserSettings();
    return page("通知设置", `
      <section class="section">
        ${settingToggle("消息免打扰", "notificationsEnabled", { offLabel: "已关闭", onLabel: "已开启" })}
        ${settingToggle("新消息通知", "notificationBadge", { description: "应用未打开时" })}
        ${settingToggle("声音", "notificationSound", { description: "应用打开时" })}
        ${settingToggle("震动", "mentionAlerts")}
      </section>`);
  }
  if (state.sidePage === "messaging") {
    return page("聊天设置", `
      <section class="section">
        ${settingLink("messaging-batch", "群发助手", "›")}
        ${settingLink("stickers", "我的表情", "›")}
        <button class="setting-row setting-action-row danger-text-row" type="button" data-profile-action="clear-chat-history">
          <span>清除聊天记录</span>
        </button>
      </section>`);
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
      </section>
      <section class="section">
        <h3>修改密码</h3>
        <div class="security-form">
          <label class="security-field">
            <span>旧密码</span>
            <input class="input" id="securityOldPassword" type="password" placeholder="请输入旧密码">
          </label>
          <button class="ghost-btn inline security-eye" type="button" data-profile-action="toggle-password-visibility">显示</button>
          <button class="primary-btn inline" type="button" data-sidepage="security-password-step2" data-security-next disabled>下一步</button>
        </div>
      </section>`);
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
          <span>重新选线</span>
        </button>
        ${settingLink("general-debug", "调试资讯", "›")}
      </section>`);
  }
  if (state.sidePage === "general-language") {
    const languages = ["简体中文", "English", "Bahasa Melayu"];
    return page("切换语言", `
      <section class="section">
        <div class="item-meta">选择后会立即应用到当前演示界面。</div>
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
        <div class="item-meta">切换后会调整布局展示方式。</div>
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
        `).join("")}
      </div>`);
  }
  if (state.sidePage === "general-about") {
    return page("关于我们", `
      <section class="section">
        <div class="item-title">66 快捷版</div>
        <div class="item-preview">当前为本地演示版，已实现聊天、名片、右键菜单与个人中心主要交互。</div>
      </section>
      <section class="section">
        ${settingAction("版本信息", "about-chatlite", "v0.1 Demo")}
      </section>`);
  }
  if (state.sidePage === "general-debug") {
    return page("调试资讯", `
      <section class="section">
        <div class="setting-row"><span>当前线路</span><strong>线路 A</strong></div>
        <div class="setting-row"><span>运行模式</span><strong>${state.useMock ? "本地演示" : "在线接口"}</strong></div>
        <div class="setting-row"><span>当前会话数</span><strong>${state.data.conversations.length}</strong></div>
      </section>`);
  }
  if (state.sidePage === "switch-user") {
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
        <img class="avatar profile-page-avatar" src="${avatarSrc(state.user.avatar)}" alt="">
        <div class="qrcode-demo">▦</div>
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
        <img class="avatar profile-avatar-large" src="${avatarSrc(state.user.avatar)}" alt="">
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
    return page("注销帐号", `
      <section class="section">
        <p class="item-meta">注销会清理当前账号的本地演示资料，这个操作不可撤销。</p>
        <button class="danger-btn inline" type="button" data-profile-action="deactivate">注销帐号</button>
      </section>`);
  }
  return page("个人资料", `
    <div class="profile-page-head">
      <img class="avatar profile-page-avatar" src="${avatarSrc(state.user.avatar)}" alt="">
      <div>
        <button class="ghost-btn inline" type="button" data-sidepage="profile-avatar">更换头像</button>
        <div class="item-meta profile-avatar-tip">头像将同步显示在聊天与通讯录里</div>
      </div>
    </div>
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
    <section class="section">
      <button class="setting-row setting-action-row danger-text-row" type="button" data-sidepage="account">
        <span>注销帐号</span>
      </button>
    </section>`);
}

function page(title, body) {
  const paneClass = state.section === "me" ? "page-pane profile-page-pane" : "page-pane";
  const headerClass = state.section === "me" ? "panel-header profile-panel-header" : "panel-header";
  return `<section class="${paneClass}"><header class="${headerClass}"><h2>${title}</h2></header><div class="page-content">${body}</div></section>`;
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
            <button class="icon-btn" data-close-modal>×</button>
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
              <div class="setting-row"><span>群号</span><strong>${escapeHTML(group.chatId || request.groupId || "未提供")}</strong></div>
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
      <div class="modal-backdrop">
        <div class="modal image-modal">
          <header class="modal-header">
            <strong>${title}</strong>
            <button class="icon-btn" data-close-modal>×</button>
          </header>
          <div class="modal-body image-modal-body">
            <img class="image-preview" src="${url}" alt="${title}">
          </div>
          <footer class="modal-footer">
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
            <button class="icon-btn" data-close-modal>×</button>
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
            <button class="icon-btn" data-close-modal>×</button>
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
    "quick-add": `<button class="ghost-btn inline" data-modal="add-friend">添加朋友</button><button class="ghost-btn inline" data-modal="create-group">创建群聊</button>`,
    "add-friend": `<input class="input" id="friendChatId" placeholder="搜索电话号码/聊天号"><textarea class="textarea" id="friendGreeting">你好，我想加你为好友</textarea>`,
    "create-group": `<input class="input" id="groupTitle" placeholder="群组名称" value="新的群聊"><p class="item-meta">第一版会把当前联系人加入待选列表。</p>`,
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
        <header class="modal-header"><strong>${titles[state.modal] || "操作"}</strong><button class="icon-btn" data-close-modal>×</button></header>
        <div class="modal-body">${bodies[state.modal] || ""}</div>
        <footer class="modal-footer">
          <button class="ghost-btn inline" data-close-modal>取消</button>
          ${["quick-add", "send-contact", "forward-message"].includes(state.modal) ? "" : `<button class="primary-btn inline" data-confirm-modal="${state.modal}">确認</button>`}
        </footer>
      </div>
    </div>`;
}

function renderForwardModal() {
  const selection = state.forwardSelection || createDefaultForwardSelection();
  return `
    <div class="modal-backdrop">
      <div class="modal forward-modal">
        <header class="forward-header">
          <button class="icon-btn" data-close-modal>‹</button>
          <strong>转发给</strong>
          <button class="forward-send-btn" type="button" data-forward-send ${(selection.selectedTargetIds || []).length ? "" : "disabled"}>发送${(selection.selectedTargetIds || []).length ? `(${(selection.selectedTargetIds || []).length})` : ""}</button>
        </header>
        <div class="modal-body forward-modal-body">
          <div class="forward-search">
            <input class="input" id="forwardSearch" value="${escapeAttr(selection.query || "")}" placeholder="搜索">
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
    ` : ""}
    <div class="forward-tabs">
      ${renderForwardTab("recent", "最近聊天", selection)}
      ${renderForwardTab("contacts", "联系人", selection)}
      ${renderForwardTab("groups", "群组", selection)}
      ${renderForwardTab("tags", "标签", selection)}
    </div>
    <div class="forward-select-all">
      <span>全选</span>
      <button class="forward-check ${allSelected ? "active" : ""} ${someSelected ? "partial" : ""}" type="button" data-forward-toggle-all aria-label="全选">${allSelected ? "✓" : someSelected ? "−" : ""}</button>
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

function refreshForwardModalContent() {
  const content = document.querySelector("#forwardModalContent");
  if (!content) return;
  content.innerHTML = renderForwardModalContent();
  const sendButton = document.querySelector("[data-forward-send]");
  if (sendButton) {
    const count = state.forwardSelection?.selectedTargetIds?.length || 0;
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
  document.querySelectorAll("[data-section]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.section = el.dataset.section;
    state.query = "";
    state.sidePage = state.section === "me" ? "profile" : state.section === "contact" ? "friend-requests" : null;
    render();
  }));
  document.querySelectorAll("[data-conversation]").forEach(el => el.addEventListener("click", async () => {
    state.section = "messages";
    state.selectedConversationId = el.dataset.conversation;
    state.sidePage = null;
    state.mention = null;
    state.mentionIds = [];
    state.conversationMenu = null;
    markConversationRead(state.selectedConversationId);
    await loadMessages(state.selectedConversationId);
    scheduleScrollToBottom();
    render();
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
  document.querySelectorAll("[data-sidepage]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.sidePage = el.dataset.sidepage;
    if (["friend-requests", "tags", "groups"].includes(state.sidePage)) state.section = "contact";
    if (["profile", "profile-avatar", "profile-nickname", "profile-signature", "qrcode", "account", "collections", "notifications", "messaging", "messaging-batch", "messaging-batch-history", "messaging-batch-draft", "messaging-batch-targets", "stickers", "stickers-manage", "privacy", "blacklist", "blacklist-add", "security", "security-password-step2", "general", "general-language", "general-display", "general-feedback", "feedback-history", "general-about", "general-debug", "switch-user"].includes(state.sidePage)) state.section = "me";
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
  document.querySelectorAll("[data-action='search']").forEach(el => el.addEventListener("input", e => {
    state.query = e.target.value;
    render();
  }));
  document.querySelector("#loginForm")?.addEventListener("submit", onLogin);
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
    editor.addEventListener("input", () => {
      setCurrentDraftText(editor.value);
    });
    editor.addEventListener("input", updateMentionSuggestions);
    editor.addEventListener("keyup", updateMentionSuggestions);
    editor.addEventListener("click", updateMentionSuggestions);
    editor.addEventListener("focus", updateMentionSuggestions);
    editor.addEventListener("keydown", handleEditorKeydown);
  }
  document.querySelectorAll("[data-tool]").forEach(el => el.addEventListener("click", () => {
    state.toolMenu = state.toolMenu === el.dataset.tool ? null : el.dataset.tool;
    state.mention = null;
    render();
  }));
  document.querySelectorAll("[data-emoji]").forEach(el => el.addEventListener("click", () => {
    insertIntoEditor(el.dataset.emoji || "");
    state.toolMenu = null;
    syncMentionMenu();
  }));
  document.querySelectorAll("[data-send-type]").forEach(el => el.addEventListener("click", () => sendSynthetic(el.dataset.sendType)));
  document.querySelectorAll("[data-pick-file]").forEach(el => el.addEventListener("click", () => pickAndUpload(el.dataset.pickFile)));
  document.querySelectorAll("[data-profile-action]").forEach(el => el.addEventListener("click", () => handleProfileAction(el.dataset.profileAction)));
  document.querySelectorAll("[data-modal]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.modal = el.dataset.modal;
    if (state.modal !== "contact-detail") state.preview = null;
    render();
  }));
  document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", () => {
    state.modal = null;
    state.preview = null;
    state.forwardPayload = null;
    state.forwardSelection = null;
    clearForwardSearchRefresh();
    state.scrollToBottom = true;
    render();
  }));
  document.querySelectorAll("[data-confirm-modal]").forEach(el => el.addEventListener("click", () => confirmModal(el.dataset.confirmModal)));
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
  document.querySelectorAll("[data-message-action]").forEach(el => el.addEventListener("click", () => handleMessageAction(el.dataset.messageAction)));
  document.querySelectorAll("[data-conversation-action]").forEach(el => el.addEventListener("click", () => handleConversationAction(el.dataset.conversationAction)));
  document.querySelectorAll("[data-setting-toggle]").forEach(el => el.addEventListener("click", () => toggleUserSetting(el.dataset.settingToggle)));
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
  document.querySelectorAll("[data-send-contact]").forEach(el => el.addEventListener("click", () => {
    const contact = state.data.contacts.find(c => c.id === el.dataset.sendContact);
    state.modal = null;
    sendMessage({ type: "contact", body: contact.nickname });
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
    const nextButton = document.querySelector("[data-security-next]");
    if (!(nextButton instanceof HTMLButtonElement)) return;
    nextButton.disabled = !e.target.value.trim();
  });
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const result = await api(state.authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    localStorage.setItem("chatlite-token", result.token);
    state.authed = true;
    await loadData();
    connectRealtime();
  } catch (_) {
    localStorage.setItem("chatlite-token", "demo-token");
    state.authed = true;
    state.useMock = true;
    state.user = structuredClone(mock.user);
    state.data = structuredClone(mock);
    toast("API 未启动，已进入本地演示模式");
  }
  render();
}

async function onSendMessage(event) {
  event.preventDefault();
  const body = document.querySelector("#editor")?.value?.trim() || "";
  if (!body) return;
  const mentions = uniqueMentionIds([
    ...state.mentionIds,
    ...collectMentionIds(body)
  ]);
  state.mentionIds = [];
  state.mention = null;
  setCurrentDraftText("");
  await sendMessage({ type: "text", body, mentions });
}

async function sendSynthetic(type) {
  const payloads = {
    image: { type: "image", body: "[图片]", attachment: { id: "demo-image", name: "photo.png", url: "/public/demo-photo.svg", mimeType: "image/svg+xml", size: 2048 } },
    file: { type: "file", body: "项目说明.pdf", attachment: { id: "demo-file", name: "项目说明.pdf", url: URL.createObjectURL(new Blob(["这是一个可打开的演示文件。"], { type: "text/plain;charset=utf-8" })), mimeType: "text/plain", size: 4096 } },
    voice: { type: "voice", body: "08" }
  };
  state.toolMenu = null;
  await sendMessage(payloads[type]);
}

async function pickAndUpload(kind) {
  const picker = document.querySelector("#filePicker");
  if (!picker) return;
  picker.accept = kind === "image" ? "image/*" : "";
  picker.value = "";
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const attachment = await uploadFile(file);
      await sendMessage({
        type: kind === "image" ? "image" : "file",
        body: kind === "image" ? "[图片]" : file.name,
        attachment
      });
      toast("已上传并发送");
    } catch (error) {
      toast(`上传失败：${error.message || "请确认 API 已启动"}`);
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
    const nextAvatar = URL.createObjectURL(file);
    state.user.avatar = nextAvatar;
    if (!state.useMock) {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ avatar: nextAvatar })
      }).catch(() => {});
    }
    toast("头像已更新");
    render();
  };
  picker.click();
}

async function uploadFile(file) {
  if (state.useMock) {
    return {
      id: id("local-file"),
      name: file.name,
      url: URL.createObjectURL(file),
      mimeType: file.type || "application/octet-stream",
      size: file.size
    };
  }
  const signed = await api("/api/files/sign", {
    method: "POST",
    body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size })
  });
  const token = localStorage.getItem("chatlite-token");
  const res = await fetch(API_BASE + signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: file
  });
  if (!res.ok) throw new Error(await res.text());
  return {
    id: signed.id,
    name: file.name,
    url: signed.publicUrl,
    mimeType: file.type || "application/octet-stream",
    size: file.size
  };
}

async function sendMessage(payload) {
  const replyingTo = getCurrentReplyDraft();
  const finalPayload = replyingTo
    ? {
        ...payload,
        quote: structuredClone(replyingTo)
      }
    : payload;
  let message;
  if (state.useMock) {
    message = {
      id: id("msg"),
      conversationId: state.selectedConversationId,
      senderId: state.user.id,
      senderName: state.user.nickname,
      createdAt: new Date().toISOString(),
      ...finalPayload
    };
    state.data.messages[state.selectedConversationId] = [...(state.data.messages[state.selectedConversationId] || []), message];
  } else {
    message = await api(`/api/conversations/${state.selectedConversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(finalPayload)
    });
  }
  upsertConversationPreview(state.selectedConversationId, message);
  state.toolMenu = null;
  state.mentionIds = [];
  setCurrentReplyDraft(null);
  scheduleScrollToBottom();
  render();
}

function handleAction(event, action) {
  if (action === "mark-read") {
    state.data.conversations.forEach(c => {
      c.unread = 0;
      c.mentionedMe = false;
    });
    toast("全部已读");
    render();
  }
  if (action === "voice") {
    state.voiceMode = !state.voiceMode;
    render();
  }
  if (action === "fake-voice") sendSynthetic("voice");
  if (action === "clear-chat") {
    if (confirm("确定清除当前聊天记录？")) {
      state.data.messages[state.selectedConversationId] = [];
      toast("聊天记录已清除");
      render();
    }
  }
  if (action === "dissolve-group") {
    if (confirm("确定解散该群？")) toast("演示模式不会真的解散群");
  }
  if (action === "logout") {
    localStorage.removeItem("chatlite-token");
    state.authed = false;
    render();
  }
}

function handleProfileAction(action) {
  if (action === "avatar") {
    pickProfileAvatar();
    return;
  }
  if (action === "reset-avatar") {
    state.user.avatar = avatar((state.user.nickname || "我").slice(0, 1));
    toast("已恢复默认头像");
    render();
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
    toast("密码修改流程已预留");
    return;
  }
  if (action === "manage-devices") {
    toast("最近登录设备：当前浏览器");
    return;
  }
  if (action === "clear-local-cache") {
    if (confirm("确定清理本地缓存吗？")) {
      state.query = "";
      state.toast = "";
      toast("本地缓存已清理");
    }
    return;
  }
  if (action === "about-chatlite") {
    toast("ChatLite 演示版 · 个人中心功能已接通");
    return;
  }
  if (action === "clear-chat-history") {
    if (!confirm("确定清除当前账号的本地聊天记录吗？")) return;
    state.data.messages = {};
    state.data.conversations = state.data.conversations.map(conversation => ({
      ...conversation,
      lastText: "",
      unread: 0,
      mentionedMe: false
    }));
    state.selectedConversationId = state.data.conversations[0]?.id || null;
    state.messageMenu = null;
    state.multiSelect = false;
    state.selectedMessageIds = [];
    toast("聊天记录已清除");
    render();
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
    toast("已为你切换到更稳定的线路");
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
    store.type = type;
    store.draft = "";
    store.history.unshift({ type, text, status: "已提交" });
    toast("反馈已提交");
    state.sidePage = "feedback-history";
    render();
    return;
  }
  if (action === "send-batch-message") {
    const batch = getBatchDraft();
    const nextMessage = document.querySelector("#batchMessage")?.value?.trim();
    if (!nextMessage) {
      toast("请输入群发内容");
      return;
    }
    batch.message = nextMessage;
    batch.history.unshift({
      title: "刚刚发送的群发任务",
      body: nextMessage,
      status: "已发送"
    });
    state.sidePage = "messaging-batch-history";
    toast("群发任务已发送");
    render();
    return;
  }
  if (action === "save-password") {
    const nextPassword = document.querySelector("#securityNewPassword")?.value?.trim() || "";
    const confirmPassword = document.querySelector("#securityConfirmPassword")?.value?.trim() || "";
    if (!nextPassword || !confirmPassword) {
      toast("请完整填写新密码与确认密码");
      return;
    }
    if (nextPassword !== confirmPassword) {
      toast("两次输入的新密码不一致");
      return;
    }
    toast("新密码已保存");
    return;
  }
  if (action === "save-profile-nickname") {
    const nextNickname = document.querySelector("#profileNicknameInput")?.value?.trim();
    if (!nextNickname) {
      toast("请输入昵称");
      return;
    }
    state.user.nickname = nextNickname;
    state.sidePage = "profile";
    toast("昵称已保存");
    render();
    return;
  }
  if (action === "save-profile-signature") {
    state.user.signature = document.querySelector("#profileSignatureInput")?.value?.trim() || "";
    state.sidePage = "profile";
    toast("个性签名已保存");
    render();
    return;
  }
  if (action === "save-qrcode") {
    downloadQrCard();
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
    if (!confirm("确定注销当前帐号吗？")) return;
    localStorage.removeItem("chatlite-token");
    state.authed = false;
    render();
  }
}

async function submitReport(reason) {
  if (!state.useMock) {
    await api("/api/reports", {
      method: "POST",
      body: JSON.stringify({ targetId: state.selectedConversationId, reason })
    }).catch(() => {});
  }
  toast("检举已提交");
}

async function confirmModal(kind) {
  let successToast = "已保存";
  if (kind === "add-friend") {
    const chatId = document.querySelector("#friendChatId").value.trim();
    const greeting = document.querySelector("#friendGreeting").value.trim();
    if (!chatId) {
      toast("请输入聊天号");
      return;
    }
    const match = findUserByChatId(chatId);
    if (!match) {
      toast("未找到这个聊天号");
      return;
    }
    if (state.data.contacts.some(contact => contact.id === match.id)) {
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
      await api("/api/friend-requests", { method: "POST", body: JSON.stringify({ chatId, greeting }) });
      state.data.requests = await api("/api/friend-requests");
      successToast = "好友申请已发送";
    }
  }
  if (kind === "create-group") {
    const title = document.querySelector("#groupTitle").value.trim() || "新的群聊";
    const group = state.useMock ? createLocalGroup(title) : await api("/api/groups", { method: "POST", body: JSON.stringify({ title, memberIds: [] }) });
    state.data.groups.push(group);
    const conv = { id: `group-${group.id}`, kind: "group", title: group.title, avatar: group.avatar, unread: 0, lastText: "群聊已创建", lastAt: new Date().toISOString() };
    state.data.conversations.unshift(conv);
    state.selectedConversationId = conv.id;
    state.data.messages[conv.id] = [];
    state.section = "messages";
  }
  if (kind === "edit-profile") {
    state.user.nickname = document.querySelector("#nickname").value.trim() || state.user.nickname;
    state.user.signature = document.querySelector("#signature").value.trim();
    if (!state.useMock) {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ nickname: state.user.nickname, signature: state.user.signature }) }).catch(() => {});
    }
  }
  if (kind === "edit-nickname") {
    state.user.nickname = document.querySelector("#nickname").value.trim() || state.user.nickname;
    if (!state.useMock) {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ nickname: state.user.nickname }) }).catch(() => {});
    }
  }
  if (kind === "edit-signature") {
    state.user.signature = document.querySelector("#signature").value.trim();
    if (!state.useMock) {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ signature: state.user.signature }) }).catch(() => {});
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
            group.members.push({ userId, nickname: contact.nickname, role: "member", muted: false });
            invitedDirectly += 1;
          }
        }
      } else {
        await api(`/api/groups/${group.id}/members`, { method: "POST", body: JSON.stringify({ userId }) });
      }
    }
    if (!state.useMock && group) {
      const updated = await api(`/api/groups/${group.id}`);
      Object.assign(group, updated);
    }
    if (state.useMock) {
      successToast = invitedPending && invitedDirectly
        ? `已直接邀请 ${invitedDirectly} 人，另有 ${invitedPending} 人待验证`
        : invitedPending
          ? `已发送 ${invitedPending} 条入群邀请，等待对方验证`
          : `已直接邀请 ${invitedDirectly} 人入群`;
    }
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
  if (localOnly) {
    request.status = status;
    if (status === "accepted" && request.type === "friend" && !state.data.contacts.some(contact => contact.id === request.user.id)) {
      addContactToRoster(request.user);
      ensureConversationForContact(request.user);
      acceptedConversationId = `session-${request.user.id}`;
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
    const updated = await api(`/api/friend-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    state.data.requests = state.data.requests.map(item => item.id === requestId ? updated : item);
    if (status === "accepted") {
      state.data.contacts = await api("/api/contacts");
    }
  }
  toast(status === "accepted" ? "已处理请求" : "已拒绝请求");
  if (status === "accepted" && acceptedConversationId) {
    state.section = "messages";
    state.selectedConversationId = acceptedConversationId;
    state.sidePage = null;
    await loadMessages(state.selectedConversationId);
    scheduleScrollToBottom();
  }
  render();
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
  toast(action === "remove" ? "成员已移除" : muted ? "成员已禁言" : "已解除禁言");
}

function seg(filter, label) {
  return `<button class="seg-btn ${state.filter === filter ? "active" : ""}" data-filter="${filter}">${label}</button>`;
}

function requestSeg(filter, label) {
  return `<button class="seg-btn ${state.requestFilter === filter ? "active" : ""}" data-request-filter="${filter}">${label}</button>`;
}

function filteredConversations() {
  const q = state.query.toLowerCase();
  return state.data.conversations.filter(c => {
    const matchesQ = !q || `${c.title} ${c.lastText}`.toLowerCase().includes(q);
    const matchesFilter = state.filter === "all" || (state.filter === "unread" && c.unread) || (state.filter === "group" && c.kind === "group");
    return matchesQ && matchesFilter;
  }).sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const attentionA = conversationNeedsAttention(a) ? 1 : 0;
    const attentionB = conversationNeedsAttention(b) ? 1 : 0;
    if (attentionA !== attentionB) return attentionB - attentionA;
    if ((a.unread || 0) !== (b.unread || 0)) return (b.unread || 0) - (a.unread || 0);
    return new Date(b.lastAt) - new Date(a.lastAt);
  });
}

function filteredContacts() {
  const q = state.query.toLowerCase();
  return state.data.contacts.filter(c => !q || `${c.nickname} ${c.chatId} ${c.signature} ${c.remark || ""} ${(c.tags || []).join(" ")}`.toLowerCase().includes(q));
}

function getConversation(id) {
  return state.data.conversations.find(c => c.id === id);
}

function currentGroup() {
  const conv = getConversation(state.selectedConversationId);
  if (!conv || conv.kind !== "group") return null;
  const groupId = conv.id.replace("group-", "");
  return state.data.groups.find(g => g.id === groupId);
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
  if (!conversation || !state.user?.id) return false;
  if (conversation.mentionedMe) return true;
  const messages = state.data.messages?.[conversation.id] || [];
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.senderId && lastMessage.senderId !== state.user.id && Array.isArray(lastMessage.mentions)) {
    return lastMessage.mentions.includes(state.user.id);
  }
  const preview = String(conversation.lastText || "");
  return preview.includes("@你") || preview.includes("[有人@你]");
}

function getMentionCandidates(query = "") {
  const group = currentGroup();
  if (!group) return [];
  const search = String(query || "").toLowerCase();
  const members = (group.members || [])
    .filter(member => member.userId !== state.user?.id)
    .map(member => {
      const contact = state.data.contacts.find(item => item.id === member.userId);
      return {
        id: member.userId,
        nickname: contact?.nickname || member.nickname || "成员",
        avatar: contact?.avatar || avatar((member.nickname || "成").slice(0, 1)),
        subtitle: contact?.remark || contact?.chatId || member.role || "群成员"
      };
    });
  if (!search) return members;
  return members.filter(member => `${member.nickname} ${member.subtitle}`.toLowerCase().includes(search));
}

function commonGroupsForContact(contact) {
  if (!contact) return [];
  return state.data.groups.filter(group =>
    (group.members || []).some(member => member.userId === contact.id || member.nickname === contact.nickname)
  );
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
    friendVerification: user?.privacy?.friendVerification ?? true,
    inviteGroupVerification: user?.privacy?.inviteGroupVerification ?? true
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

function ensureConversationForContact(user) {
  const conversationId = `session-${user.id}`;
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
  toast("演示入口已重置");
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

function ensureStickerStore() {
  state.user.stickerStore ||= {
    items: ["😀", "🥳", "👍", "🔥", "❤️", "😄", "🎉", "🙌"],
    favorites: ["😀", "🎉", "❤️"]
  };
  return state.user.stickerStore;
}

function ensureFeedbackStore() {
  state.user.feedbackStore ||= {
    type: "功能建议",
    draft: "",
    history: [
      { type: "界面问题", text: "聊天窗口右键菜单希望再贴近移动端样式。", status: "已记录" },
      { type: "功能建议", text: "希望群发助手支持草稿保存。", status: "处理中" }
    ]
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
    friendVerification: true,
    inviteGroupVerification: true,
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
  state.user.blockedContactIds ||= state.data?.contacts?.slice(0, 1).map(contact => contact.id) || [];
  return state.user.settings;
}

function toggleUserSetting(key) {
  const settings = ensureUserSettings();
  settings[key] = !settings[key];
  toast(settings[key] ? "已开启" : "已关闭");
  render();
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

function unblockContact(contactId) {
  state.user.blockedContactIds = (state.user.blockedContactIds || []).filter(id => id !== contactId);
  toast("已移出黑名单");
  render();
}

function selectLanguage(language) {
  state.user.language = language;
  toast(`已切换为 ${language}`);
  render();
}

function selectDisplayMode(mode) {
  state.user.displayMode = mode;
  toast(`已切换到${mode}`);
  render();
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

function toggleFavoriteSticker(emoji) {
  const store = ensureStickerStore();
  if (store.favorites.includes(emoji)) {
    store.favorites = store.favorites.filter(item => item !== emoji);
    toast("已移出常用表情");
  } else {
    store.favorites = [...store.favorites, emoji];
    toast("已加入常用表情");
  }
  render();
}

function addStickerToStore(emoji) {
  const store = ensureStickerStore();
  if (!store.items.includes(emoji)) {
    store.items = [...store.items, emoji];
  }
  if (!store.favorites.includes(emoji)) {
    store.favorites = [...store.favorites, emoji];
  }
  toast("表情已加入常用列表");
  render();
}

function blockContact(contactId) {
  const blocked = new Set(state.user.blockedContactIds || []);
  blocked.add(contactId);
  state.user.blockedContactIds = [...blocked];
  state.sidePage = "blacklist";
  toast("已加入黑名单");
  render();
}

function downloadQrCard() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
      <rect width="720" height="960" rx="44" fill="#f4f8ff"/>
      <rect x="60" y="60" width="600" height="840" rx="36" fill="#ffffff" stroke="#d9e4f2"/>
      <rect x="270" y="110" width="180" height="180" rx="40" fill="#1d42c7"/>
      <text x="360" y="222" text-anchor="middle" font-size="86" fill="#ffffff" font-family="Arial, sans-serif">${escapeHTML((state.user.nickname || "我").slice(0, 1))}</text>
      <text x="360" y="340" text-anchor="middle" font-size="40" fill="#172033" font-family="Arial, sans-serif">${escapeHTML(state.user.nickname || "")}</text>
      <text x="360" y="392" text-anchor="middle" font-size="28" fill="#69758a" font-family="Arial, sans-serif">${escapeHTML(state.user.chatId || "")}</text>
      <rect x="160" y="470" width="400" height="400" rx="28" fill="#2450e0"/>
      <rect x="188" y="498" width="344" height="344" rx="20" fill="#ffffff"/>
      <path d="M220 530h80v80h-80zM420 530h80v80h-80zM220 730h80v80h-80zM320 530h20v20h-20zM360 570h20v20h-20zM400 610h20v20h-20zM340 650h20v20h-20zM380 690h20v20h-20zM440 730h20v20h-20zM320 770h20v20h-20zM360 810h20v20h-20z" fill="#101828"/>
      <text x="360" y="904" text-anchor="middle" font-size="26" fill="#69758a" font-family="Arial, sans-serif">${escapeHTML(`${state.user.country || ""} ${state.user.phone || ""}`.trim())}</text>
    </svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.user.chatId || "qrcode"}.svg`;
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
  const caret = editor.selectionStart ?? editor.value.length;
  state.toolMenu = null;
  state.mention = {
    open: true,
    query: "",
    replaceStart: caret,
    replaceEnd: caret,
    activeIndex: 0
  };
  syncMentionMenu();
  editor.focus();
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
  if (!state.mention?.open) return;
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
  }
}

function insertMentionById(contactId) {
  const contact = state.data.contacts.find(item => item.id === contactId);
  if (!contact) return;
  insertMention(contact);
}

function insertMention(contact) {
  const editor = document.querySelector("#editor");
  if (!editor) return;
  const mentionText = `@${contact.nickname} `;
  const value = editor.value;
  const start = Math.max(0, state.mention?.replaceStart ?? editor.selectionStart ?? value.length);
  const end = Math.max(start, state.mention?.replaceEnd ?? editor.selectionEnd ?? value.length);
  editor.value = `${value.slice(0, start)}${mentionText}${value.slice(end)}`;
  const caret = start + mentionText.length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  state.mentionIds = uniqueMentionIds([...state.mentionIds, contact.id]);
  state.mention = null;
  syncMentionMenu();
}

function insertIntoEditor(text) {
  const editor = document.querySelector("#editor");
  if (!editor) return;
  const value = editor.value;
  const start = editor.selectionStart ?? value.length;
  const end = editor.selectionEnd ?? value.length;
  editor.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const caret = start + text.length;
  editor.focus();
  editor.setSelectionRange(caret, caret);
  updateMentionSuggestions();
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
  const sessionId = `session-${contact.id}`;
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
  state.section = "messages";
  state.sidePage = null;
  state.modal = null;
  state.preview = null;
  state.mention = null;
  state.mentionIds = [];
  markConversationRead(sessionId);
  render();
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
  if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) return;
  if (active.id === "forwardSearch") {
    ensureForwardSelection();
    state.forwardSelection.focus = {
      id: "forwardSearch",
      start: active.selectionStart ?? active.value.length,
      end: active.selectionEnd ?? active.value.length
    };
    return;
  }
  if (state.forwardSelection?.focus) {
    state.forwardSelection.focus = null;
  }
}

function restoreTransientFocus() {
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

function restoreMessageScrollPosition() {
  if (!state.authed || state.scrollToBottom) return;
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

function handleConversationAction(action) {
  const menu = state.conversationMenu;
  if (!menu) return;
  const conversation = getConversation(menu.conversationId);
  state.conversationMenu = null;
  if (!conversation) {
    render();
    return;
  }
  if (action === "pin") {
    conversation.pinned = !conversation.pinned;
    toast(conversation.pinned ? "已置顶" : "已取消置顶");
    return;
  }
  if (action === "mute") {
    conversation.muted = !conversation.muted;
    toast(conversation.muted ? "已开启免打扰" : "已取消免打扰");
    return;
  }
  if (action === "unread") {
    conversation.unread = Math.max(1, conversation.unread || 0);
    conversation.mentionedMe = false;
    toast("已标记未读");
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除会话“${conversation.title}”吗？`)) {
      render();
      return;
    }
    state.data.conversations = state.data.conversations.filter(item => item.id !== conversation.id);
    delete state.data.messages[conversation.id];
    if (state.selectedConversationId === conversation.id) {
      const nextConversation = state.data.conversations[0] || null;
      state.selectedConversationId = nextConversation?.id || "";
      state.sidePage = null;
    }
    toast("会话已删除");
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
    focusComposerEditor({ preserveScroll: true, retries: 3 });
    return;
  }
  state.messageMenu = null;
  refreshReplyBarHost();
  window.setTimeout(() => {
    document.querySelector("[data-message-menu]")?.remove();
  }, 0);
}

function focusComposerEditor({ preserveScroll = false, retries = 0 } = {}) {
  const tryFocus = remaining => {
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
    if (preserveScroll) {
      pinCurrentMessageScrollPosition();
      restoreMessageScrollPosition();
    }
    if (document.activeElement === editor || remaining <= 0) return;
    setTimeout(() => tryFocus(remaining - 1), 40);
  };
  tryFocus(retries);
  state.pendingEditorAutofocus = false;
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
    toast("这条消息暂不支持复制");
    return;
  }
  try {
    await navigator.clipboard?.writeText(text);
    toast("已复制");
  } catch (_) {
    toast("复制失败");
  }
}

function favoriteMessage(message) {
  addMessageToCollections(message);
  toast("已收藏");
}

function addMessageToCollections(message) {
  state.data.collections.unshift({
    id: id("col"),
    kind: message.type === "image" ? "image" : message.type === "file" ? "file" : message.type === "voice" ? "voice" : "text",
    title: `${message.senderName} 的消息`,
    preview: message.type === "text" ? message.body : message.attachment?.name || message.body || "",
    createdAt: new Date().toISOString()
  });
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
    deleteSelectedMessages(selectedMessages);
    return;
  }
}

function getSelectedMessages() {
  const messages = state.data.messages?.[state.selectedConversationId] || [];
  const selectedIds = new Set(state.multiSelect?.selectedIds || []);
  return messages.filter(message => selectedIds.has(message.id));
}

function deleteSelectedMessages(selectedMessages) {
  const canDeleteAll = state.useMock || selectedMessages.every(message => message.senderId === state.user?.id);
  if (!canDeleteAll) {
    toast("所选消息包含暂不支持删除的内容");
    return;
  }
  if (!confirm(`确定删除选中的 ${selectedMessages.length} 条消息？`)) return;
  const selectedIds = new Set(selectedMessages.map(message => message.id));
  const conversationId = state.selectedConversationId;
  state.data.messages[conversationId] = (state.data.messages[conversationId] || []).filter(message => !selectedIds.has(message.id));
  refreshConversationPreview(conversationId);
  state.multiSelect = null;
  toast(`已删除 ${selectedMessages.length} 条消息`);
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
  if (message.type === "text") return message.body || "";
  if (message.type === "contact") return `名片：${message.body || message.senderName || ""}`;
  if (message.type === "image") return `[图片] ${message.attachment?.name || message.body || ""}`.trim();
  if (message.type === "file") return `[文件] ${message.attachment?.name || message.body || ""}`.trim();
  if (message.type === "voice") return `[语音] 00:${String(message.body || "08").padStart(2, "0")}`;
  return message.body || "";
}

function getMessageTypeLabel(type) {
  return {
    text: "文字",
    image: "图片",
    file: "文件",
    voice: "语音",
    contact: "名片"
  }[type || "text"] || "消息";
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

function formatMessageForCopy(message) {
  const base = summarizeMessage(message);
  if (!base) return "";
  if (!message.quote) return base;
  return `引用 ${message.quote.senderName || "消息"}：${message.quote.preview || ""}\n${base}`;
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
  return `session-${target.contactId}` === currentConversation.id;
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
      state.sidePage = null;
      markConversationRead(firstConversationId);
      await loadMessages(firstConversationId);
      scheduleScrollToBottom();
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
  const sessionId = `session-${contact.id}`;
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
      senderName: state.user.nickname,
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
  state.draftTextByConversation[state.selectedConversationId] = value || "";
}

function getCurrentReplyDraft() {
  return state.replyDraftByConversation?.[state.selectedConversationId] || null;
}

function setCurrentReplyDraft(value) {
  if (!state.selectedConversationId) return;
  if (!value) {
    delete state.replyDraftByConversation[state.selectedConversationId];
    return;
  }
  state.replyDraftByConversation[state.selectedConversationId] = value;
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

function deleteMessage(message) {
  if (!state.useMock && message.senderId !== state.user?.id) {
    toast("删除接口暂未接入");
    return;
  }
  if (!confirm("确定删除这条消息？")) return;
  const conversationId = state.selectedConversationId;
  const messages = state.data.messages[conversationId] || [];
  state.data.messages[conversationId] = messages.filter(item => item.id !== message.id);
  refreshConversationPreview(conversationId);
  toast("已删除");
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
  conv.lastText = last.type === "text" ? last.body : `[${{ image: "图片", file: "文件", voice: "语音", contact: "名片" }[last.type] || "消息"}]`;
  conv.lastAt = last.createdAt;
  conv.unread = 0;
  conv.mentionedMe = false;
}

function upsertConversationPreview(conversationId, message, options = {}) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  conv.lastText = message.type === "text" ? message.body : `[${{ image: "图片", file: "文件", voice: "语音", contact: "名片" }[message.type] || "消息"}]`;
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

function markConversationRead(conversationId) {
  const conv = getConversation(conversationId);
  if (conv) {
    conv.unread = 0;
    conv.mentionedMe = false;
  }
}

function conversationNeedsAttention(conversation) {
  return Boolean(conversation?.mentionedMe || (conversation?.unread || 0) > 0);
}

function searchMatchesQuery(message, query) {
  if (!query) return false;
  const body = String(message?.body || "").toLowerCase();
  const sender = String(message?.senderName || "").toLowerCase();
  if (body.includes(query) || sender.includes(query)) return true;
  const mentions = Array.isArray(message?.mentions) ? message.mentions : [];
  return mentions.some(userId => {
    const contact = state.data.contacts.find(item => item.id === userId);
    return String(contact?.nickname || "").toLowerCase().includes(query);
  });
}

function createLocalGroup(title) {
  const group = {
    id: id("local"),
    title,
    avatar: avatar("群"),
    chatId: String(Math.floor(Math.random() * 900000 + 100000)),
    announcement: "",
    joinMode: "public_qr",
    myNickname: state.user.nickname,
    createdAt: new Date().toISOString(),
    members: [{ userId: state.user.id, nickname: state.user.nickname, role: "owner", muted: false }]
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
    conversations: [
      { id: "group-19146", kind: "group", title: "VIP 会员讨论 08群", avatar: avatar("V"), unread: 0, lastText: "万顺下分专员1：[图片]", lastAt: addHours(now, -2) },
      { id: "group-19144", kind: "group", title: "财富密码资料群", avatar: avatar("财"), unread: 99, mentionedMe: true, lastText: "[有人@你] 苏洋：1111", lastAt: addHours(now, -3) },
      { id: "session-1278382", kind: "session", title: "小花朵接待号", avatar: avatar("花"), unread: 0, lastText: "[图片]", lastAt: addHours(now, -26) },
      { id: "group-21444", kind: "group", title: "test", avatar: avatar("群"), unread: 0, mentionedMe: false, lastText: "我：@^魚. 𝙯ᙆ test", lastAt: addHours(now, -23) },
      { id: "session-388770", kind: "session", title: "陈刀仔（日进斗金）", avatar: avatar("陈"), unread: 0, lastText: "你们已是好友，可以开始聊天了!", lastAt: addHours(now, -24) }
    ],
    messages: {
      "group-21444": [
        { id: "m1", conversationId: "group-21444", senderId: "388786", senderName: "^魚. 𝙯ᙆ", type: "text", body: "test", createdAt: addHours(now, -23.05) },
        { id: "m2", conversationId: "group-21444", senderId: "u1", senderName: "chenshao", type: "text", body: "@^魚. 𝙯ᙆ test", createdAt: addHours(now, -23) }
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
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#0a2fc0"/><text x="48" y="58" font-family="Arial,sans-serif" font-size="34" text-anchor="middle" fill="white">${label}</text></svg>`)}`;
}

function avatarSrc(value) {
  let src = String(value || avatar("?"));
  if (src.startsWith("data:image/svg+xml;utf8,") && src.includes("<svg")) {
    const prefix = "data:image/svg+xml;utf8,";
    src = prefix + encodeURIComponent(src.slice(prefix.length));
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
    const contact = findContactByName(mention);
    if (!contact) {
      return `<span class="mention">${match}</span>`;
    }
    return `<button class="mention mention-chip" type="button" data-open-contact="${escapeAttr(contact.nickname)}">${match}</button>`;
  });
}

function collectMentionIds(body) {
  const matches = String(body || "").match(/@([^\s@]+)/g) || [];
  const ids = [];
  for (const match of matches) {
    const nickname = match.slice(1);
    const contact = findContactByName(nickname);
    if (contact) ids.push(contact.id);
  }
  return ids;
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
