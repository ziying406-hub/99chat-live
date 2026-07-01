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
  scrollToBottom: false
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
        state.data.messages[id] = [...(state.data.messages[id] || []), envelope.payload];
        upsertConversationPreview(id, envelope.payload);
        if (id === state.selectedConversationId) scheduleScrollToBottom();
        render();
      }
    };
    state.ws = ws;
  } catch (_) {}
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = state.authed ? renderApp() : renderAuth();
  bindEvents();
  flushScrollToBottom();
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
              <div class="item-preview">${formatPreview(c.lastText)}</div>
            </div>
            <div class="item-meta">${formatTime(c.lastAt)}${c.unread ? `<br><span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}</div>
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
  return `
    <section class="chat-pane">
      <header class="chat-header">
        <button class="icon-btn" data-mobile-close>${icons.back}</button>
        <a class="chat-title" href="#" data-sidepage="members">${escapeHTML(conv.title)}</a>
        <button class="icon-btn" data-sidepage="settings" title="设置">${icons.settings}</button>
      </header>
      <div class="messages">
        <div class="day-divider">昨日下午 4:48</div>
        ${messages.map(renderMessage).join("")}
      </div>
      <form class="composer" id="composer">
        <button class="icon-btn" type="button" data-action="voice">${state.voiceMode ? "⌨" : icons.mic}</button>
        ${state.voiceMode ? `<button class="ghost-btn" type="button" data-action="fake-voice">00:00 点击录音</button>` : `<div class="editor" id="editor" contenteditable="true"></div>`}
        <button class="icon-btn" type="button" data-tool="attachments" title="附件">${icons.attach}</button>
        <button class="icon-btn" type="button" data-tool="emoji" title="表情">${icons.smile}</button>
        <button class="primary-btn inline" type="submit">传送</button>
      </form>
      ${renderToolMenu()}
    </section>`;
}

function renderMessage(message) {
  const mine = message.senderId === state.user.id;
  return `
    <article class="message ${mine ? "me" : ""}">
      <img class="avatar" src="${avatarSrc(mine ? state.user.avatar : avatar(message.senderName[0] || "友"))}" alt="">
      <div class="bubble">
        <div class="sender">${escapeHTML(message.senderName)} · ${formatTime(message.createdAt)}</div>
        ${renderMessageBody(message)}
      </div>
    </article>`;
}

function renderMessageBody(message) {
  if (message.type === "image") return `<div class="media-card"><img src="${mediaURL(message.attachment?.url || "/public/demo-photo.svg")}" alt=""></div>`;
  if (message.type === "file") return `📄 ${escapeHTML(message.attachment?.name || message.body || "文件")}`;
  if (message.type === "voice") return `🎙 语音消息 00:${String(message.body || "08").padStart(2, "0")}`;
  if (message.type === "contact") return `👤 名片：${escapeHTML(message.body || "联系人")}`;
  return linkMentions(escapeHTML(message.body || ""));
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
  return `
    <aside class="detail-pane">
      <header class="panel-header"><h3>群聊成员</h3><button class="ghost-btn inline" data-modal="invite">新增</button></header>
      <section class="section">
        <div class="setting-row"><span>群聊ID</span><strong>${group.chatId}</strong></div>
      </section>
      <div class="list">
        ${group.members.map(m => `
          <article class="list-item">
            <img class="avatar" src="${avatarSrc(avatar(m.nickname[0] || "成"))}" alt="">
            <div>
              <div class="item-title">${escapeHTML(m.nickname)}</div>
              <div class="item-preview">${m.role}${m.muted ? " · 已禁言" : ""}</div>
            </div>
            <div class="icon-row">
              <button class="ghost-btn inline" data-member-action="mute" data-member-id="${m.userId}" data-muted="${m.muted ? "false" : "true"}">${m.muted ? "解除禁言" : "禁言"}</button>
              ${m.role === "owner" ? "" : `<button class="danger-btn inline" data-member-action="remove" data-member-id="${m.userId}">移除</button>`}
            </div>
          </article>`).join("")}
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
              <div class="media-card"><img src="${mediaURL(m.attachment?.url || "/public/demo-photo.svg")}" alt=""></div>
              <p>${escapeHTML(m.attachment?.name || m.body || "媒体")}</p>
            </div>`).join("")}
        </div>
      </section>
    </aside>`;
}

function renderSearchPane() {
  const q = state.query.toLowerCase();
  const results = (state.data.messages[state.selectedConversationId] || []).filter(m => m.body.toLowerCase().includes(q));
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
    "edit-profile": "编辑资料"
  };
  return `
    <div class="modal-backdrop">
      <div class="modal">
        <header class="modal-header"><strong>${titles[state.modal] || "操作"}</strong><button class="icon-btn" data-close-modal>×</button></header>
        <div class="modal-body">${bodies[state.modal] || ""}</div>
        <footer class="modal-footer">
          <button class="ghost-btn inline" data-close-modal>取消</button>
          ${state.modal === "quick-add" || state.modal === "send-contact" ? "" : `<button class="primary-btn inline" data-confirm-modal="${state.modal}">确認</button>`}
        </footer>
      </div>
    </div>`;
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
  document.querySelectorAll("[data-tool]").forEach(el => el.addEventListener("click", () => {
    state.toolMenu = state.toolMenu === el.dataset.tool ? null : el.dataset.tool;
    render();
  }));
  document.querySelectorAll("[data-emoji]").forEach(el => el.addEventListener("click", () => {
    const editor = document.querySelector("#editor");
    if (editor) editor.textContent += el.dataset.emoji;
    state.toolMenu = null;
    syncEditor(editor?.textContent || "");
  }));
  document.querySelectorAll("[data-send-type]").forEach(el => el.addEventListener("click", () => sendSynthetic(el.dataset.sendType)));
  document.querySelectorAll("[data-pick-file]").forEach(el => el.addEventListener("click", () => pickAndUpload(el.dataset.pickFile)));
  document.querySelectorAll("[data-modal]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    state.modal = el.dataset.modal;
    render();
  }));
  document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", () => {
    state.modal = null;
    render();
  }));
  document.querySelectorAll("[data-confirm-modal]").forEach(el => el.addEventListener("click", () => confirmModal(el.dataset.confirmModal)));
  document.querySelectorAll("[data-toast]").forEach(el => el.addEventListener("click", e => {
    e.preventDefault();
    toast(el.dataset.toast);
  }));
  document.querySelectorAll("[data-report]").forEach(el => el.addEventListener("click", () => submitReport(el.dataset.report)));
  document.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", e => handleAction(e, el.dataset.action)));
  document.querySelectorAll("[data-copy]").forEach(el => el.addEventListener("click", () => {
    navigator.clipboard?.writeText(el.dataset.copy);
    toast("已复制");
  }));
  document.querySelectorAll("[data-send-contact]").forEach(el => el.addEventListener("click", () => {
    const contact = state.data.contacts.find(c => c.id === el.dataset.sendContact);
    state.modal = null;
    sendMessage({ type: "contact", body: contact.nickname });
  }));
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
  const body = document.querySelector("#editor")?.textContent?.trim() || "";
  if (!body) return;
  await sendMessage({ type: "text", body });
}

async function sendSynthetic(type) {
  const payloads = {
    image: { type: "image", body: "[图片]", attachment: { id: "demo-image", name: "photo.png", url: "/public/demo-photo.svg", mimeType: "image/svg+xml", size: 2048 } },
    file: { type: "file", body: "项目说明.pdf", attachment: { id: "demo-file", name: "项目说明.pdf", url: "#", mimeType: "application/pdf", size: 4096 } },
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
  let message;
  if (state.useMock) {
    message = {
      id: id("msg"),
      conversationId: state.selectedConversationId,
      senderId: state.user.id,
      senderName: state.user.nickname,
      createdAt: new Date().toISOString(),
      ...payload
    };
    state.data.messages[state.selectedConversationId] = [...(state.data.messages[state.selectedConversationId] || []), message];
  } else {
    message = await api(`/api/conversations/${state.selectedConversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  upsertConversationPreview(state.selectedConversationId, message);
  state.toolMenu = null;
  scheduleScrollToBottom();
  render();
}

function handleAction(event, action) {
  if (action === "mark-read") {
    state.data.conversations.forEach(c => c.unread = 0);
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
  }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

function filteredContacts() {
  const q = state.query.toLowerCase();
  return state.data.contacts.filter(c => !q || `${c.nickname} ${c.chatId} ${c.signature}`.toLowerCase().includes(q));
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

function upsertConversationPreview(conversationId, message) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  conv.lastText = message.type === "text" ? message.body : `[${{ image: "图片", file: "文件", voice: "语音", contact: "名片" }[message.type] || "消息"}]`;
  conv.lastAt = message.createdAt;
  conv.unread = 0;
}

function syncEditor(text) {
  const editor = document.querySelector("#editor");
  if (editor) editor.textContent = text;
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
    { id: "388770", nickname: "陈刀仔（日进斗金）", signature: "愿你每天都好运", chatId: "cdz888", avatar: avatar("陈") },
    { id: "388769", nickname: "苏雅", signature: "在线接待", chatId: "suya66", avatar: avatar("苏") },
    { id: "388754", nickname: "恋情客", signature: "忙碌中", chatId: "love66", avatar: avatar("恋") },
    { id: "388786", nickname: "^魚. 𝙯ᙆ", signature: "保持联系", chatId: "fish66", avatar: avatar("魚") },
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
      { id: "group-19144", kind: "group", title: "财富密码资料群", avatar: avatar("财"), unread: 99, lastText: "[有人@你] 苏洋：1111", lastAt: addHours(now, -3) },
      { id: "session-1278382", kind: "session", title: "小花朵接待号", avatar: avatar("花"), unread: 0, lastText: "[图片]", lastAt: addHours(now, -26) },
      { id: "group-21444", kind: "group", title: "test", avatar: avatar("群"), unread: 0, lastText: "我：@^魚. 𝙯ᙆ test", lastAt: addHours(now, -23) },
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
  return linkMentions(escapeHTML(value || ""));
}

function linkMentions(value) {
  return value.replace(/(@[^ ]+)/g, `<span class="mention">$1</span>`);
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
