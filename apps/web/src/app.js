const API_BASE = "http://localhost:8080";

const state = {
  authed: Boolean(localStorage.getItem("chatlite-token")),
  authMode: "login",
  user: null,
  section: "messages",
  filter: "all",
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
    state.data = { conversations, contacts, groups, requests, collections, messages: {} };
    await loadMessages(state.selectedConversationId);
    scheduleScrollToBottom();
  } catch (error) {
    state.useMock = true;
    state.user = structuredClone(mock.user);
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
          <article class="list-item ${c.id === state.selectedConversationId ? "active" : ""}" data-conversation="${c.id}">
            <img class="avatar" src="${avatarSrc(c.avatar)}" alt="">
            <div>
              <div class="item-title">${escapeHTML(c.title)}</div>
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

function sideEntry(page, title, preview) {
  return `
    <article class="list-item" data-sidepage="${page}">
      <img class="avatar" src="${avatarSrc(avatar(title[0]))}" alt="">
      <div>
        <div class="item-title">${title}</div>
        <div class="item-preview">${preview}</div>
      </div>
    </article>`;
}

function renderProfileSidebar() {
  return `
    <aside class="sidebar">
      <header class="panel-header"><h2>个人中心</h2></header>
      <div class="section" style="text-align:center">
        <img class="avatar" style="width:92px;height:92px;border-radius:24px" src="${avatarSrc(state.user.avatar)}" alt="">
        <h2>${escapeHTML(state.user.nickname)}</h2>
        <p class="item-meta">${escapeHTML(state.user.signature || "暂无个性签名")}</p>
      </div>
      <div class="list">
        ${sideEntry("profile", "个人资料", state.user.phone)}
        ${sideEntry("qrcode", "二维码", state.user.chatId)}
        ${sideEntry("account", "注销帐号", "危险操作需要确认")}
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
    return page("好友申请", `
      <h3>近期请求</h3>
      ${state.data.requests.map(r => `
        <article class="list-item">
          <img class="avatar" src="${avatarSrc(r.user.avatar)}" alt="">
          <div><div class="item-title">${escapeHTML(r.user.nickname)}</div><div class="item-preview">${escapeHTML(r.greeting)}</div></div>
          <div class="icon-row">
            ${r.status === "pending" ? `<button class="primary-btn inline" data-friend-request="${r.id}" data-status="accepted">同意</button><button class="ghost-btn inline" data-friend-request="${r.id}" data-status="rejected">拒绝</button>` : `<span class="item-meta">${r.status}</span>`}
          </div>
        </article>`).join("")}`);
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
  if (state.sidePage === "qrcode") {
    return page("二维码", `<div class="card" style="width:260px;text-align:center"><div style="font-size:120px;line-height:1">▦</div><strong>${state.user.chatId}</strong></div>`);
  }
  if (state.sidePage === "account") {
    return page("注销帐号", `<p>注销会清理当前账号数据。</p><button class="danger-btn inline" data-action="logout">退出登录</button>`);
  }
  return page("个人资料", `
    <div class="card">
      <img class="avatar" style="width:96px;height:96px;border-radius:24px" src="${avatarSrc(state.user.avatar)}" alt="">
      <div class="setting-row"><span>昵称</span><button class="ghost-btn inline" data-modal="edit-profile">${escapeHTML(state.user.nickname)}</button></div>
      <div class="setting-row"><span>个性签名</span><span>${escapeHTML(state.user.signature || "")}</span></div>
      <div class="setting-row"><span>电话号码</span><strong>${state.user.country} ${state.user.phone}</strong></div>
      <div class="setting-row"><span>聊天号</span><button class="ghost-btn inline" data-copy="${state.user.chatId}">${state.user.chatId} 复制</button></div>
    </div>`);
}

function page(title, body) {
  return `<section class="page-pane"><header class="panel-header"><h2>${title}</h2></header><div class="page-content">${body}</div></section>`;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal === "forward-message") {
    return renderForwardModal();
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
    "edit-profile": `<input class="input" id="nickname" value="${escapeAttr(state.user.nickname)}"><textarea class="textarea" id="signature">${escapeHTML(state.user.signature || "")}</textarea>`
  };
  const titles = {
    "quick-add": "快捷操作",
    "add-friend": "添加朋友",
    "create-group": "创建群聊",
    invite: "新增成员",
    tag: "新增标签",
    "send-contact": "发送名片",
    "forward-message": "选择转发到",
    "edit-profile": "编辑资料"
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
    markConversationRead(state.selectedConversationId);
    await loadMessages(state.selectedConversationId);
    scheduleScrollToBottom();
    render();
  }));
  document.querySelectorAll("[data-sidepage]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.sidePage = el.dataset.sidepage;
    if (["friend-requests", "tags", "groups"].includes(state.sidePage)) state.section = "contact";
    if (["profile", "qrcode", "account"].includes(state.sidePage)) state.section = "me";
    render();
  }));
  document.querySelectorAll("[data-filter]").forEach(el => el.addEventListener("click", () => {
    state.filter = el.dataset.filter;
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
  document.querySelectorAll("[data-contact-action]").forEach(el => el.addEventListener("click", () => {
    const action = el.dataset.contactAction;
    state.modal = action === "tags" ? "contact-tags" : "contact-remark";
    render();
  }));
  document.querySelectorAll("[data-confirm-contact-edit]").forEach(el => el.addEventListener("click", () => confirmContactEdit(el.dataset.confirmContactEdit)));
  document.querySelectorAll("[data-friend-request]").forEach(el => el.addEventListener("click", () => updateFriendRequest(el.dataset.friendRequest, el.dataset.status)));
  document.querySelectorAll("[data-member-action]").forEach(el => el.addEventListener("click", () => updateGroupMember(el.dataset.memberAction, el.dataset.memberId, el.dataset.muted === "true")));
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
  if (kind === "add-friend") {
    const chatId = document.querySelector("#friendChatId").value.trim();
    const greeting = document.querySelector("#friendGreeting").value.trim();
    if (!chatId) {
      toast("请输入聊天号");
      return;
    }
    if (state.useMock) {
      toast("本地演示模式已发送好友申请");
    } else {
      await api("/api/friend-requests", { method: "POST", body: JSON.stringify({ chatId, greeting }) });
      state.data.requests = await api("/api/friend-requests");
      toast("好友申请已发送");
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
  if (kind === "invite") {
    const group = currentGroup();
    const selected = [...document.querySelectorAll('input[name="inviteMember"]:checked')].map(input => input.value);
    for (const userId of selected) {
      if (state.useMock) {
        const contact = state.data.contacts.find(c => c.id === userId);
        if (contact && !group.members.some(m => m.userId === userId)) {
          group.members.push({ userId, nickname: contact.nickname, role: "member", muted: false });
        }
      } else {
        await api(`/api/groups/${group.id}/members`, { method: "POST", body: JSON.stringify({ userId }) });
      }
    }
    if (!state.useMock && group) {
      const updated = await api(`/api/groups/${group.id}`);
      Object.assign(group, updated);
    }
  }
  state.modal = null;
  toast("已保存");
  render();
}

async function updateFriendRequest(requestId, status) {
  if (state.useMock) {
    const request = state.data.requests.find(item => item.id === requestId);
    if (request) {
      request.status = status;
      if (status === "accepted" && !state.data.contacts.some(contact => contact.id === request.user.id)) {
        state.data.contacts.push(request.user);
      }
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
  toast(status === "accepted" ? "已同意好友申请" : "已拒绝好友申请");
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

function filteredConversations() {
  const q = state.query.toLowerCase();
  return state.data.conversations.filter(c => {
    const matchesQ = !q || `${c.title} ${c.lastText}`.toLowerCase().includes(q);
    const matchesFilter = state.filter === "all" || (state.filter === "unread" && c.unread) || (state.filter === "group" && c.kind === "group");
    return matchesQ && matchesFilter;
  }).sort((a, b) => {
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
    { id: "388770", nickname: "陈刀仔（日进斗金）", signature: "愿你每天都好运", chatId: "cdz888", avatar: avatar("陈"), remark: "老朋友", tags: ["优先", "线下"] },
    { id: "388769", nickname: "苏雅", signature: "在线接待", chatId: "suya66", avatar: avatar("苏"), tags: ["客服"] },
    { id: "388754", nickname: "恋情客", signature: "忙碌中", chatId: "love66", avatar: avatar("恋") },
    { id: "388786", nickname: "^魚. 𝙯ᙆ", signature: "保持联系", chatId: "fish66", avatar: avatar("魚"), remark: "常联系", tags: ["重点"] },
    { id: "1278382", nickname: "小花朵接待号", signature: "会员接待", chatId: "flower", avatar: avatar("花") }
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
    groups,
    requests: [
      { id: "fr1", user: contacts[0], greeting: "你好，我是 陈刀仔（日进斗金）", status: "pending", createdAt: addHours(now, -25) },
      { id: "fr2", user: contacts[1], greeting: "你好，我是 苏雅", status: "pending", createdAt: addHours(now, -25) }
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
