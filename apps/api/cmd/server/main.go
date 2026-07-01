package main

import (
	"bufio"
	"context"
	cryptorand "crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type User struct {
	ID        string `json:"id"`
	Phone     string `json:"phone"`
	Country   string `json:"country"`
	ChatID    string `json:"chatId"`
	Nickname  string `json:"nickname"`
	Signature string `json:"signature"`
	Avatar    string `json:"avatar"`
}

type Contact struct {
	ID        string `json:"id"`
	Nickname  string `json:"nickname"`
	Signature string `json:"signature"`
	ChatID    string `json:"chatId"`
	Avatar    string `json:"avatar"`
}

type Conversation struct {
	ID       string    `json:"id"`
	Kind     string    `json:"kind"`
	Title    string    `json:"title"`
	Avatar   string    `json:"avatar"`
	Unread   int       `json:"unread"`
	LastText string    `json:"lastText"`
	LastAt   time.Time `json:"lastAt"`
}

type Message struct {
	ID             string      `json:"id"`
	ConversationID string      `json:"conversationId"`
	SenderID       string      `json:"senderId"`
	SenderName     string      `json:"senderName"`
	Type           string      `json:"type"`
	Body           string      `json:"body"`
	Attachment     *Attachment `json:"attachment,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"`
}

type Attachment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type Group struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Avatar       string    `json:"avatar"`
	ChatID       string    `json:"chatId"`
	Announcement string    `json:"announcement"`
	JoinMode     string    `json:"joinMode"`
	MyNickname   string    `json:"myNickname"`
	CreatedAt    time.Time `json:"createdAt"`
	Members      []Member  `json:"members"`
}

type Member struct {
	UserID   string `json:"userId"`
	Nickname string `json:"nickname"`
	Role     string `json:"role"`
	Muted    bool   `json:"muted"`
}

type FriendRequest struct {
	ID        string    `json:"id"`
	User      Contact   `json:"user"`
	Greeting  string    `json:"greeting"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type Collection struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Title     string    `json:"title"`
	Preview   string    `json:"preview"`
	CreatedAt time.Time `json:"createdAt"`
}

type Report struct {
	ID        string    `json:"id"`
	TargetID  string    `json:"targetId"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	mu            sync.RWMutex
	user          User
	contacts      []Contact
	conversations []Conversation
	messages      map[string][]Message
	groups        map[string]Group
	requests      []FriendRequest
	collections   []Collection
	reports       []Report
	hub           *Hub
	pg            *PostgresStore
	sessions      map[string]string
	uploadDir     string
}

type Hub struct {
	mu      sync.Mutex
	clients map[*WSConn]bool
}

type WSConn struct {
	conn net.Conn
	rw   *bufio.ReadWriter
}

func main() {
	store := seedStore()
	store.uploadDir = defaultString(os.Getenv("UPLOAD_DIR"), "uploads")
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		ctx := context.Background()
		pg, err := openPostgresStore(ctx, databaseURL)
		if err != nil {
			log.Fatalf("postgres: %v", err)
		}
		store.pg = pg
		if err := store.syncFromPostgres(ctx); err != nil {
			log.Fatalf("postgres sync: %v", err)
		}
		log.Printf("postgres persistence enabled")
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	addr := ":" + defaultString(os.Getenv("PORT"), "8080")
	log.Printf("chat api listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func registerRoutes(mux *http.ServeMux, s *Store) {
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "time": time.Now()})
	})
	mux.HandleFunc("/api/auth/login", s.login)
	mux.HandleFunc("/api/auth/register", s.register)
	mux.HandleFunc("/api/me", s.me)
	mux.HandleFunc("/api/conversations", s.conversationsRoute)
	mux.HandleFunc("/api/conversations/", s.conversationRoute)
	mux.HandleFunc("/api/contacts", s.contactsRoute)
	mux.HandleFunc("/api/friend-requests", s.friendRequestsRoute)
	mux.HandleFunc("/api/friend-requests/", s.friendRequestRoute)
	mux.HandleFunc("/api/groups", s.groupsRoute)
	mux.HandleFunc("/api/groups/", s.groupRoute)
	mux.HandleFunc("/api/files/sign", s.signFile)
	mux.HandleFunc("/api/files/upload/", s.uploadFile)
	mux.HandleFunc("/uploads/", s.serveUpload)
	mux.HandleFunc("/api/collections", s.collectionsRoute)
	mux.HandleFunc("/api/reports", s.reportsRoute)
	mux.HandleFunc("/ws", s.websocket)
}

func (s *Store) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Country  string `json:"country"`
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	user, ok, err := s.authenticate(r.Context(), req.Country, req.Phone, req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token := s.issueToken(user.ID)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

func (s *Store) issueToken(userID string) string {
	var bytes [24]byte
	if _, err := cryptorand.Read(bytes[:]); err != nil {
		return "demo-token-" + userID + "-" + newID("session")
	}
	token := hex.EncodeToString(bytes[:])
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sessions == nil {
		s.sessions = map[string]string{}
	}
	s.sessions[token] = userID
	return token
}

func (s *Store) currentUser(r *http.Request) User {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token != "" {
		s.mu.RLock()
		userID := s.sessions[token]
		s.mu.RUnlock()
		if userID != "" {
			if user, ok, err := s.userByID(r.Context(), userID); err == nil && ok {
				return user
			}
		}
	}
	return s.user
}

func (u User) AsContact() Contact {
	return Contact{
		ID:        u.ID,
		Nickname:  u.Nickname,
		Signature: u.Signature,
		ChatID:    u.ChatID,
		Avatar:    u.Avatar,
	}
}

func (s *Store) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Country  string `json:"country"`
		Phone    string `json:"phone"`
		Password string `json:"password"`
		Nickname string `json:"nickname"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Country = defaultString(req.Country, "+60")
	req.Phone = strings.TrimSpace(req.Phone)
	req.Password = strings.TrimSpace(req.Password)
	req.Nickname = defaultString(req.Nickname, "新用户"+req.Phone)
	if req.Phone == "" || len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "phone and password with at least 6 chars are required")
		return
	}
	user, err := s.createUser(r.Context(), req.Country, req.Phone, req.Password, req.Nickname)
	if err != nil {
		if errors.Is(err, errAlreadyExists) {
			writeError(w, http.StatusConflict, "user already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "registration failed")
		return
	}
	token := s.issueToken(user.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": user})
}

func (s *Store) me(w http.ResponseWriter, r *http.Request) {
	current := s.currentUser(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, current)
	case http.MethodPatch:
		var patch map[string]string
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if v := strings.TrimSpace(patch["nickname"]); v != "" {
			current.Nickname = v
		}
		if v, ok := patch["signature"]; ok {
			current.Signature = strings.TrimSpace(v)
		}
		if v := strings.TrimSpace(patch["avatar"]); v != "" {
			current.Avatar = v
		}
		if err := s.persistUser(r.Context(), current); err != nil {
			writeError(w, http.StatusInternalServerError, "profile update failed")
			return
		}
		if current.ID == s.user.ID {
			s.user = current
		}
		writeJSON(w, http.StatusOK, current)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) conversationsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	filter := r.URL.Query().Get("filter")
	s.mu.RLock()
	items := append([]Conversation(nil), s.conversations...)
	s.mu.RUnlock()
	sort.Slice(items, func(i, j int) bool { return items[i].LastAt.After(items[j].LastAt) })
	if filter == "unread" || filter == "group" {
		out := items[:0]
		for _, c := range items {
			if filter == "unread" && c.Unread > 0 {
				out = append(out, c)
			}
			if filter == "group" && c.Kind == "group" {
				out = append(out, c)
			}
		}
		items = out
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) conversationRoute(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/conversations/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 2 || parts[1] != "messages" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	conversationID := parts[0]
	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		messages := append([]Message(nil), s.messages[conversationID]...)
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, messages)
	case http.MethodPost:
		current := s.currentUser(r)
		var req struct {
			Type       string      `json:"type"`
			Body       string      `json:"body"`
			Attachment *Attachment `json:"attachment"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		msg := Message{
			ID:             newID("msg"),
			ConversationID: conversationID,
			SenderID:       current.ID,
			SenderName:     current.Nickname,
			Type:           req.Type,
			Body:           strings.TrimSpace(req.Body),
			Attachment:     req.Attachment,
			CreatedAt:      time.Now(),
		}
		s.mu.Lock()
		s.messages[conversationID] = append(s.messages[conversationID], msg)
		for i := range s.conversations {
			if s.conversations[i].ID == conversationID {
				s.conversations[i].LastText = displayMessage(msg)
				s.conversations[i].LastAt = msg.CreatedAt
				s.conversations[i].Unread = 0
			}
		}
		s.mu.Unlock()
		if err := s.persistMessage(r.Context(), msg); err != nil {
			writeError(w, http.StatusInternalServerError, "message persistence failed")
			return
		}
		s.hub.Broadcast(map[string]any{"type": "message.created", "conversationId": conversationID, "payload": msg})
		writeJSON(w, http.StatusCreated, msg)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) contactsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	query := strings.ToLower(r.URL.Query().Get("q"))
	s.mu.RLock()
	items := append([]Contact(nil), s.contacts...)
	s.mu.RUnlock()
	if query != "" {
		filtered := items[:0]
		for _, c := range items {
			if strings.Contains(strings.ToLower(c.Nickname+c.ChatID+c.Phoneish()), query) {
				filtered = append(filtered, c)
			}
		}
		items = filtered
	}
	writeJSON(w, http.StatusOK, items)
}

func (c Contact) Phoneish() string {
	return strings.ReplaceAll(c.ChatID, "-", "")
}

func (s *Store) friendRequestsRoute(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		items := append([]FriendRequest(nil), s.requests...)
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, items)
	case http.MethodPost:
		var req struct {
			ChatID   string `json:"chatId"`
			Greeting string `json:"greeting"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		current := s.currentUser(r)
		target, err := s.findContactByChatID(r.Context(), strings.TrimSpace(req.ChatID))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "friend lookup failed")
			return
		}
		if target.ID == "" {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		fr := FriendRequest{
			ID:        newID("fr"),
			User:      current.AsContact(),
			Greeting:  defaultString(req.Greeting, "你好，我想加你为好友"),
			Status:    "pending",
			CreatedAt: time.Now(),
		}
		s.mu.Lock()
		s.requests = append([]FriendRequest{fr}, s.requests...)
		s.mu.Unlock()
		if err := s.persistFriendRequestFor(r.Context(), target.ID, fr); err != nil {
			writeError(w, http.StatusInternalServerError, "friend request persistence failed")
			return
		}
		s.hub.Broadcast(map[string]any{"type": "friend.requested", "payload": fr})
		writeJSON(w, http.StatusCreated, fr)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) friendRequestRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	requestID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/friend-requests/"), "/")
	if requestID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Status != "accepted" && req.Status != "rejected" {
		writeError(w, http.StatusBadRequest, "status must be accepted or rejected")
		return
	}
	current := s.currentUser(r)
	updated, err := s.updateFriendRequest(r.Context(), current.ID, requestID, req.Status)
	if err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "request not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "friend request update failed")
		return
	}
	if req.Status == "accepted" {
		s.mu.Lock()
		already := false
		for _, contact := range s.contacts {
			if contact.ID == updated.User.ID {
				already = true
				break
			}
		}
		if !already {
			s.contacts = append(s.contacts, updated.User)
		}
		s.mu.Unlock()
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Store) groupsRoute(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		groups := make([]Group, 0, len(s.groups))
		for _, g := range s.groups {
			groups = append(groups, g)
		}
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, groups)
	case http.MethodPost:
		current := s.currentUser(r)
		var req struct {
			Title     string   `json:"title"`
			MemberIDs []string `json:"memberIds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		gid := newID("group")
		group := Group{
			ID:         gid,
			Title:      defaultString(req.Title, "新的群聊"),
			Avatar:     avatar("群"),
			ChatID:     fmt.Sprintf("%06d", rand.Intn(900000)+100000),
			JoinMode:   "public_qr",
			MyNickname: current.Nickname,
			CreatedAt:  time.Now(),
			Members:    []Member{{UserID: current.ID, Nickname: current.Nickname, Role: "owner"}},
		}
		for _, id := range req.MemberIDs {
			group.Members = append(group.Members, Member{UserID: id, Nickname: id, Role: "member"})
		}
		convID := "group-" + gid
		s.mu.Lock()
		s.groups[gid] = group
		s.conversations = append(s.conversations, Conversation{ID: convID, Kind: "group", Title: group.Title, Avatar: group.Avatar, LastText: "群聊已创建", LastAt: time.Now()})
		s.messages[convID] = []Message{}
		s.mu.Unlock()
		if err := s.persistGroupFor(r.Context(), current.ID, group, convID); err != nil {
			writeError(w, http.StatusInternalServerError, "group persistence failed")
			return
		}
		s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": convID, "payload": group})
		writeJSON(w, http.StatusCreated, group)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) groupRoute(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/groups/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	id := parts[0]
	if len(parts) >= 2 && parts[1] == "members" {
		s.groupMembersRoute(w, r, id, parts)
		return
	}
	if len(parts) == 2 && parts[1] == "members" {
		s.mu.RLock()
		group, ok := s.groups[id]
		s.mu.RUnlock()
		if !ok {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeJSON(w, http.StatusOK, group.Members)
		return
	}
	current := s.currentUser(r)
	s.mu.Lock()
	defer s.mu.Unlock()
	group, ok := s.groups[id]
	if !ok {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, group)
	case http.MethodPatch:
		var patch map[string]string
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if v := strings.TrimSpace(patch["title"]); v != "" {
			group.Title = v
		}
		if v, ok := patch["announcement"]; ok {
			group.Announcement = strings.TrimSpace(v)
		}
		if v, ok := patch["myNickname"]; ok {
			group.MyNickname = strings.TrimSpace(v)
		}
		if v, ok := patch["joinMode"]; ok {
			group.JoinMode = v
		}
		s.groups[id] = group
		if err := s.persistGroupFor(r.Context(), current.ID, group, "group-"+group.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "group update failed")
			return
		}
		writeJSON(w, http.StatusOK, group)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) groupMembersRoute(w http.ResponseWriter, r *http.Request, groupID string, parts []string) {
	if len(parts) == 2 && r.Method == http.MethodGet {
		s.mu.RLock()
		group, ok := s.groups[groupID]
		s.mu.RUnlock()
		if !ok {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeJSON(w, http.StatusOK, group.Members)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost {
		var req struct {
			UserID string `json:"userId"`
			ChatID string `json:"chatId"`
			Role   string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		member, err := s.addGroupMember(r.Context(), groupID, req.UserID, req.ChatID, defaultString(req.Role, "member"))
		if err != nil {
			if errors.Is(err, errNotFound) {
				writeError(w, http.StatusNotFound, "group or user not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "member add failed")
			return
		}
		s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": "group-" + groupID, "payload": member})
		writeJSON(w, http.StatusCreated, member)
		return
	}
	if len(parts) == 3 && (r.Method == http.MethodPatch || r.Method == http.MethodDelete) {
		userID := parts[2]
		if r.Method == http.MethodDelete {
			if err := s.removeGroupMember(r.Context(), groupID, userID); err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "member not found")
					return
				}
				writeError(w, http.StatusInternalServerError, "member remove failed")
				return
			}
			s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": "group-" + groupID, "payload": map[string]any{"removed": userID}})
			writeJSON(w, http.StatusOK, map[string]any{"removed": userID})
			return
		}
		var req struct {
			Muted *bool  `json:"muted"`
			Role  string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		member, err := s.updateGroupMember(r.Context(), groupID, userID, req.Role, req.Muted)
		if err != nil {
			if errors.Is(err, errNotFound) {
				writeError(w, http.StatusNotFound, "member not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "member update failed")
			return
		}
		s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": "group-" + groupID, "payload": member})
		writeJSON(w, http.StatusOK, member)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Store) signFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Name     string `json:"name"`
		MimeType string `json:"mimeType"`
		Size     int64  `json:"size"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	id := newID("file")
	safeName := safeFileName(req.Name)
	writeJSON(w, http.StatusOK, map[string]any{
		"id":        id,
		"uploadUrl": "/api/files/upload/" + id + "/" + safeName,
		"publicUrl": "/uploads/" + id + "/" + safeName,
	})
}

func (s *Store) uploadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/files/upload/"), "/"), "/")
	if len(parts) < 2 {
		writeError(w, http.StatusBadRequest, "missing file id or name")
		return
	}
	fileID := safeFileName(parts[0])
	fileName := safeFileName(parts[len(parts)-1])
	if fileID == "" || fileName == "" {
		writeError(w, http.StatusBadRequest, "invalid file path")
		return
	}
	dir := filepath.Join(s.uploadDir, fileID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "upload directory failed")
		return
	}
	target := filepath.Join(dir, fileName)
	file, err := os.Create(target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "file create failed")
		return
	}
	defer file.Close()
	size, err := io.Copy(file, http.MaxBytesReader(w, r.Body, 64<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "file upload failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        fileID,
		"name":      fileName,
		"size":      size,
		"publicUrl": "/uploads/" + fileID + "/" + fileName,
	})
}

func (s *Store) serveUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/uploads/"), "/"), "/")
	if len(parts) < 2 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	fileID := safeFileName(parts[0])
	fileName := safeFileName(parts[len(parts)-1])
	if fileID == "" || fileName == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	http.ServeFile(w, r, filepath.Join(s.uploadDir, fileID, fileName))
}

func (s *Store) collectionsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	kind := r.URL.Query().Get("kind")
	s.mu.RLock()
	items := append([]Collection(nil), s.collections...)
	s.mu.RUnlock()
	if kind != "" && kind != "all" {
		filtered := items[:0]
		for _, c := range items {
			if c.Kind == kind {
				filtered = append(filtered, c)
			}
		}
		items = filtered
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) reportsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req Report
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.ID = newID("report")
	req.CreatedAt = time.Now()
	s.mu.Lock()
	s.reports = append(s.reports, req)
	s.mu.Unlock()
	if err := s.persistReportFor(r.Context(), s.currentUser(r).ID, req); err != nil {
		writeError(w, http.StatusInternalServerError, "report persistence failed")
		return
	}
	writeJSON(w, http.StatusCreated, req)
}

func (s *Store) websocket(w http.ResponseWriter, r *http.Request) {
	if strings.ToLower(r.Header.Get("Upgrade")) != "websocket" {
		writeError(w, http.StatusBadRequest, "expected websocket upgrade")
		return
	}
	c, err := acceptWebSocket(w, r)
	if err != nil {
		log.Printf("websocket accept: %v", err)
		return
	}
	s.hub.Add(c)
	defer s.hub.Remove(c)
	c.WriteJSON(map[string]any{"type": "connected", "payload": map[string]any{"serverTime": time.Now()}})
	for {
		msg, err := c.ReadText()
		if err != nil {
			return
		}
		var envelope map[string]any
		if json.Unmarshal([]byte(msg), &envelope) == nil && envelope["type"] == "typing" {
			s.hub.Broadcast(envelope)
		}
	}
}

func seedStore() *Store {
	now := time.Now()
	contacts := []Contact{
		{ID: "388770", Nickname: "陈刀仔（日进斗金）", Signature: "愿你每天都好运", ChatID: "cdz888", Avatar: avatar("陈")},
		{ID: "388769", Nickname: "苏雅", Signature: "在线接待", ChatID: "suya66", Avatar: avatar("苏")},
		{ID: "388754", Nickname: "恋情客", Signature: "忙碌中", ChatID: "love66", Avatar: avatar("恋")},
		{ID: "388786", Nickname: "^魚. 𝙯ᙆ", Signature: "保持联系", ChatID: "fish66", Avatar: avatar("魚")},
		{ID: "1278382", Nickname: "小花朵接待号", Signature: "会员接待", ChatID: "flower", Avatar: avatar("花")},
	}
	group := Group{
		ID:           "21444",
		Title:        "test",
		Avatar:       avatar("群"),
		ChatID:       "128847",
		Announcement: "欢迎来到测试群。",
		JoinMode:     "public_qr",
		MyNickname:   "chenshao",
		CreatedAt:    now.Add(-24 * time.Hour),
		Members: []Member{
			{UserID: "u1", Nickname: "chenshao", Role: "owner"},
			{UserID: "388786", Nickname: "^魚. 𝙯ᙆ", Role: "member"},
			{UserID: "388754", Nickname: "恋情客", Role: "member"},
			{UserID: "388769", Nickname: "苏雅", Role: "admin"},
			{UserID: "388770", Nickname: "陈刀仔（日进斗金）", Role: "member"},
		},
	}
	conversations := []Conversation{
		{ID: "group-19146", Kind: "group", Title: "VIP 会员讨论 08群", Avatar: avatar("V"), Unread: 0, LastText: "万顺下分专员1：[图片]", LastAt: now.Add(-2 * time.Hour)},
		{ID: "group-19144", Kind: "group", Title: "财富密码资料群", Avatar: avatar("财"), Unread: 99, LastText: "[有人@你] 苏洋：1111", LastAt: now.Add(-3 * time.Hour)},
		{ID: "session-1278382", Kind: "session", Title: "小花朵接待号", Avatar: avatar("花"), LastText: "[图片]", LastAt: now.Add(-26 * time.Hour)},
		{ID: "group-21444", Kind: "group", Title: "test", Avatar: avatar("群"), LastText: "我：@^魚. 𝙯ᙆ test", LastAt: now.Add(-23 * time.Hour)},
		{ID: "session-388770", Kind: "session", Title: "陈刀仔（日进斗金）", Avatar: avatar("陈"), LastText: "你们已是好友，可以开始聊天了!", LastAt: now.Add(-24 * time.Hour)},
	}
	messages := map[string][]Message{
		"group-21444": {
			{ID: "m1", ConversationID: "group-21444", SenderID: "388786", SenderName: "^魚. 𝙯ᙆ", Type: "text", Body: "test", CreatedAt: now.Add(-23*time.Hour - 3*time.Minute)},
			{ID: "m2", ConversationID: "group-21444", SenderID: "u1", SenderName: "chenshao", Type: "text", Body: "@^魚. 𝙯ᙆ test", CreatedAt: now.Add(-23 * time.Hour)},
		},
		"session-1278382": {
			{ID: "m3", ConversationID: "session-1278382", SenderID: "1278382", SenderName: "小花朵接待号", Type: "image", Body: "[图片]", Attachment: &Attachment{ID: "a1", Name: "welcome.png", URL: "/images/demo-photo.svg", MimeType: "image/svg+xml", Size: 2048}, CreatedAt: now.Add(-26 * time.Hour)},
		},
	}
	return &Store{
		user:          User{ID: "u1", Country: "+60", Phone: "174319676", ChatID: "o8tew3", Nickname: "chenshao", Signature: "保持专注，保持联系。", Avatar: avatar("陈")},
		contacts:      contacts,
		conversations: conversations,
		messages:      messages,
		groups:        map[string]Group{"21444": group},
		requests: []FriendRequest{
			{ID: "fr1", User: contacts[0], Greeting: "你好，我是 陈刀仔（日进斗金）", Status: "pending", CreatedAt: now.Add(-25 * time.Hour)},
			{ID: "fr2", User: contacts[1], Greeting: "你好，我是 苏雅", Status: "pending", CreatedAt: now.Add(-25 * time.Hour)},
		},
		collections: []Collection{
			{ID: "col1", Kind: "text", Title: "群聊摘录", Preview: "@^魚. 𝙯ᙆ test", CreatedAt: now.Add(-22 * time.Hour)},
			{ID: "col2", Kind: "file", Title: "说明文档.pdf", Preview: "PDF 文件", CreatedAt: now.Add(-48 * time.Hour)},
		},
		hub:      &Hub{clients: map[*WSConn]bool{}},
		sessions: map[string]string{},
	}
}

func (h *Hub) Add(c *WSConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
}

func (h *Hub) Remove(c *WSConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
	_ = c.conn.Close()
}

func (h *Hub) Broadcast(v any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		_ = c.WriteJSON(v)
	}
}

func acceptWebSocket(w http.ResponseWriter, r *http.Request) (*WSConn, error) {
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, errors.New("missing websocket key")
	}
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("hijacking unsupported")
	}
	conn, rw, err := hijacker.Hijack()
	if err != nil {
		return nil, err
	}
	accept := websocketAccept(key)
	fmt.Fprintf(rw, "HTTP/1.1 101 Switching Protocols\r\n")
	fmt.Fprintf(rw, "Upgrade: websocket\r\n")
	fmt.Fprintf(rw, "Connection: Upgrade\r\n")
	fmt.Fprintf(rw, "Sec-WebSocket-Accept: %s\r\n\r\n", accept)
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &WSConn{conn: conn, rw: rw}, nil
}

func websocketAccept(key string) string {
	h := sha1.New()
	h.Write([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func (c *WSConn) ReadText() (string, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(c.rw, header); err != nil {
		return "", err
	}
	opcode := header[0] & 0x0f
	if opcode == 0x8 {
		return "", io.EOF
	}
	masked := header[1]&0x80 != 0
	length := int64(header[1] & 0x7f)
	switch length {
	case 126:
		var b [2]byte
		if _, err := io.ReadFull(c.rw, b[:]); err != nil {
			return "", err
		}
		length = int64(binary.BigEndian.Uint16(b[:]))
	case 127:
		var b [8]byte
		if _, err := io.ReadFull(c.rw, b[:]); err != nil {
			return "", err
		}
		length = int64(binary.BigEndian.Uint64(b[:]))
	}
	var mask [4]byte
	if masked {
		if _, err := io.ReadFull(c.rw, mask[:]); err != nil {
			return "", err
		}
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(c.rw, payload); err != nil {
		return "", err
	}
	if masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}
	return string(payload), nil
}

func (c *WSConn) WriteJSON(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	frame := []byte{0x81}
	n := len(b)
	if n < 126 {
		frame = append(frame, byte(n))
	} else if n <= 65535 {
		frame = append(frame, 126, byte(n>>8), byte(n))
	} else {
		frame = append(frame, 127, 0, 0, 0, 0, byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
	frame = append(frame, b...)
	if _, err := c.rw.Write(frame); err != nil {
		return err
	}
	return c.rw.Flush()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func newID(prefix string) string {
	return fmt.Sprintf("%s-%d-%04d", prefix, time.Now().UnixNano(), rand.Intn(10000))
}

func avatar(label string) string {
	return "data:image/svg+xml;utf8," + url.QueryEscape(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#0a2fc0"/><text x="48" y="58" font-family="Arial,sans-serif" font-size="34" text-anchor="middle" fill="white">%s</text></svg>`, label))
}

func defaultString(v, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	return v
}

func safeFileName(value string) string {
	value = filepath.Base(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, string(filepath.Separator), "_")
	value = strings.Map(func(r rune) rune {
		if r == '-' || r == '_' || r == '.' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return r
		}
		if r > 127 {
			return r
		}
		return '_'
	}, value)
	value = strings.Trim(value, ".")
	if value == "" {
		return "file"
	}
	return value
}

func displayMessage(m Message) string {
	if m.Body != "" {
		return m.Body
	}
	switch m.Type {
	case "image":
		return "[图片]"
	case "video":
		return "[视频]"
	case "file":
		return "[文件]"
	case "voice":
		return "[语音]"
	case "contact":
		return "[名片]"
	default:
		return "[消息]"
	}
}
