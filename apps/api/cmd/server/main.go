package main

import (
	"bufio"
	"context"
	cryptorand "crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const (
	demoLoginCode            = "123456"
	maxUploadSizeBytes int64 = 64 << 20
	chatIDLetters            = "abcdefghijklmnopqrstuvwxyz"
	chatIDDigits             = "0123456789"
	chatIDAlphabet           = chatIDLetters + chatIDDigits
)

var adminLoginDummyPasswordHash = func() string {
	hash, err := bcrypt.GenerateFromPassword([]byte("invalid-admin-password"), bcrypt.DefaultCost)
	if err != nil {
		return ""
	}
	return string(hash)
}()

type User struct {
	ID                string          `json:"id"`
	Phone             string          `json:"phone"`
	Country           string          `json:"country"`
	ChatID            string          `json:"chatId"`
	Nickname          string          `json:"nickname"`
	Signature         string          `json:"signature"`
	Avatar            string          `json:"avatar"`
	CreatedAt         time.Time       `json:"createdAt,omitempty"`
	BannedAt          *time.Time      `json:"bannedAt,omitempty"`
	BanReason         string          `json:"banReason,omitempty"`
	Settings          map[string]bool `json:"settings,omitempty"`
	Language          string          `json:"language,omitempty"`
	DisplayMode       string          `json:"displayMode,omitempty"`
	BlockedContactIDs []string        `json:"blockedContactIds,omitempty"`
	StickerStore      StickerStore    `json:"stickerStore,omitempty"`
}

type StickerStore struct {
	Items     []string `json:"items"`
	Favorites []string `json:"favorites"`
}

type Contact struct {
	ID        string   `json:"id"`
	Nickname  string   `json:"nickname"`
	Signature string   `json:"signature"`
	ChatID    string   `json:"chatId"`
	Avatar    string   `json:"avatar"`
	Remark    string   `json:"remark,omitempty"`
	Tags      []string `json:"tags,omitempty"`
}

type Conversation struct {
	ID            string    `json:"id"`
	Kind          string    `json:"kind"`
	Title         string    `json:"title"`
	Avatar        string    `json:"avatar"`
	Unread        int       `json:"unread"`
	LastText      string    `json:"lastText"`
	LastAt        time.Time `json:"lastAt"`
	Pinned        bool      `json:"pinned"`
	Muted         bool      `json:"muted"`
	BurnAfterRead bool      `json:"burnAfterRead"`
	MentionedMe   bool      `json:"mentionedMe,omitempty"`
}

type Message struct {
	ID             string      `json:"id"`
	ConversationID string      `json:"conversationId"`
	SenderID       string      `json:"senderId"`
	SenderName     string      `json:"senderName"`
	SenderAvatar   string      `json:"senderAvatar,omitempty"`
	Type           string      `json:"type"`
	Body           string      `json:"body"`
	Attachment     *Attachment `json:"attachment,omitempty"`
	Quote          *Quote      `json:"quote,omitempty"`
	Mentions       []string    `json:"mentions,omitempty"`
	BurnAfterRead  bool        `json:"burnAfterRead,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"`
	ReadCount      int         `json:"readCount"`
	ReadTotal      int         `json:"readTotal"`
}

type MessageReadReceiptUpdate struct {
	MessageID string `json:"messageId"`
	ReadCount int    `json:"readCount"`
	ReadTotal int    `json:"readTotal"`
}

type MessageReadReceiptEvent struct {
	Type           string                    `json:"type"`
	ConversationID string                    `json:"conversationId"`
	Payload        MessageReadReceiptPayload `json:"payload"`
}

type MessageReadReceiptPayload struct {
	UserID   string                     `json:"userId"`
	ReadAt   time.Time                  `json:"readAt"`
	Messages []MessageReadReceiptUpdate `json:"messages"`
}

type Quote struct {
	MessageID      string `json:"messageId"`
	ConversationID string `json:"conversationId"`
	SenderName     string `json:"senderName"`
	Preview        string `json:"preview"`
	Type           string `json:"type,omitempty"`
	TypeLabel      string `json:"typeLabel,omitempty"`
}

type Attachment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type Group struct {
	ID                     string          `json:"id"`
	OwnerUserID            string          `json:"-"`
	Title                  string          `json:"title"`
	Avatar                 string          `json:"avatar"`
	ChatID                 string          `json:"chatId"`
	QRCode                 string          `json:"qrCode"`
	QRCodeExpiresAt        *time.Time      `json:"qrCodeExpiresAt,omitempty"`
	Announcement           string          `json:"announcement"`
	JoinMode               string          `json:"joinMode"`
	MyNickname             string          `json:"myNickname"`
	DisableMemberAddFriend bool            `json:"disableMemberAddFriend"`
	AllMuted               bool            `json:"allMuted"`
	RateLimit              *GroupRateLimit `json:"rateLimit,omitempty"`
	AutoMuteNewMembers     bool            `json:"autoMuteNewMembers"`
	CreatedAt              time.Time       `json:"createdAt"`
	Members                []Member        `json:"members"`
}

type GroupRateLimit struct {
	Enabled       bool `json:"enabled"`
	WindowSeconds int  `json:"windowSeconds"`
	MaxMessages   int  `json:"maxMessages"`
}

type Member struct {
	UserID   string `json:"userId"`
	Nickname string `json:"nickname"`
	Role     string `json:"role"`
	Muted    bool   `json:"muted"`
}

type FriendRequest struct {
	ID          string    `json:"id"`
	Type        string    `json:"type,omitempty"`
	User        Contact   `json:"user"`
	Greeting    string    `json:"greeting"`
	Status      string    `json:"status"`
	Direction   string    `json:"direction"`
	GroupID     string    `json:"groupId,omitempty"`
	GroupTitle  string    `json:"groupTitle,omitempty"`
	GroupChatID string    `json:"groupChatId,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	FromUserID  string    `json:"-"`
	ToUserID    string    `json:"-"`
}

func friendRequestRealtimeEvent(eventType string, request FriendRequest, reviewer *Contact) map[string]any {
	payload := map[string]any{
		"id":         request.ID,
		"fromUserId": request.FromUserID,
		"toUserId":   request.ToUserID,
		"status":     request.Status,
		"user":       request.User,
	}
	if reviewer != nil {
		payload["reviewer"] = *reviewer
	}
	return map[string]any{"type": eventType, "payload": payload}
}

type GroupJoinRequest struct {
	ID        string    `json:"id"`
	GroupID   string    `json:"groupId"`
	User      Contact   `json:"user"`
	Inviter   *Contact  `json:"inviter,omitempty"`
	Greeting  string    `json:"greeting"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type GroupBlacklistEntry struct {
	GroupID   string    `json:"groupId"`
	User      Contact   `json:"user"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}

type GroupBot struct {
	GroupID         string           `json:"groupId"`
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	Enabled         bool             `json:"enabled"`
	Message         string           `json:"message"`
	KeywordRules    []BotKeywordRule `json:"keywordRules"`
	ScheduleMode    string           `json:"scheduleMode"`
	IntervalSeconds int              `json:"intervalSeconds"`
	DailyTime       string           `json:"dailyTime"`
	NextRunAt       time.Time        `json:"nextRunAt"`
	LastRunAt       *time.Time       `json:"lastRunAt,omitempty"`
}

type BotKeywordRule struct {
	Keyword string `json:"keyword"`
	Reply   string `json:"reply"`
}

type Collection struct {
	ID        string    `json:"id"`
	MessageID string    `json:"messageId,omitempty"`
	Kind      string    `json:"kind"`
	Title     string    `json:"title"`
	Preview   string    `json:"preview"`
	CreatedAt time.Time `json:"createdAt"`
}

type Report struct {
	ID                string     `json:"id"`
	TargetID          string     `json:"targetId"`
	TargetType        string     `json:"targetType"`
	Reason            string     `json:"reason"`
	Status            string     `json:"status"`
	Resolution        string     `json:"resolution"`
	ResolvedByAdminID string     `json:"resolvedByAdminId"`
	ResolvedAt        *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
}

type AuditLog struct {
	ID         string    `json:"id"`
	GroupID    string    `json:"groupId"`
	ActorID    string    `json:"actorId"`
	ActorName  string    `json:"actorName"`
	Action     string    `json:"action"`
	TargetID   string    `json:"targetId"`
	TargetName string    `json:"targetName"`
	Detail     string    `json:"detail"`
	CreatedAt  time.Time `json:"createdAt"`
}

type MessageReadMember struct {
	UserID   string     `json:"userId"`
	Nickname string     `json:"nickname"`
	ReadAt   *time.Time `json:"readAt,omitempty"`
}

type MessageReadDetail struct {
	MessageID string              `json:"messageId"`
	Read      []MessageReadMember `json:"read"`
	Unread    []MessageReadMember `json:"unread"`
}

type Feedback struct {
	ID                string     `json:"id"`
	UserID            string     `json:"userId"`
	Type              string     `json:"type"`
	Text              string     `json:"text"`
	Status            string     `json:"status"`
	AdminNote         string     `json:"adminNote"`
	ResolvedByAdminID string     `json:"resolvedByAdminId"`
	ResolvedAt        *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
}

type userFeedback struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Type      string    `json:"type"`
	Text      string    `json:"text"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type adminMessageRecord struct {
	Message
	ConversationTitle string `json:"conversationTitle,omitempty"`
}

type adminFileRecord struct {
	ID             string    `json:"id"`
	MessageID      string    `json:"messageId"`
	ConversationID string    `json:"conversationId"`
	SenderID       string    `json:"senderId"`
	Name           string    `json:"name"`
	MimeType       string    `json:"mimeType"`
	Size           int64     `json:"size"`
	PublicURL      string    `json:"publicUrl"`
	CreatedAt      time.Time `json:"createdAt"`
}

type AdminUser struct {
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	Role        string     `json:"role"`
	Permissions []string   `json:"permissions,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	DisabledAt  *time.Time `json:"disabledAt,omitempty"`
}

type AdminSession struct {
	ID          string     `json:"id"`
	AdminUserID string     `json:"adminUserId"`
	TokenHash   string     `json:"-"`
	ExpiresAt   time.Time  `json:"expiresAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty"`
}

type AdminAuditLog struct {
	ID            string    `json:"id"`
	AdminUserID   string    `json:"adminUserId"`
	AdminUsername string    `json:"adminUsername"`
	Action        string    `json:"action"`
	TargetType    string    `json:"targetType"`
	TargetID      string    `json:"targetId"`
	Detail        string    `json:"detail"`
	CreatedAt     time.Time `json:"createdAt"`
}

type AdminUserRecord struct {
	AdminUser
	PasswordHash string `json:"-"`
}

type AdminSystemSettings struct {
	RegistrationEnabled  bool     `json:"registrationEnabled"`
	MaxUploadBytes       int64    `json:"maxUploadBytes"`
	MaxGroupMembers      int      `json:"maxGroupMembers"`
	SensitiveWords       []string `json:"sensitiveWords"`
	SpamDetectionEnabled bool     `json:"spamDetectionEnabled"`
}

type adminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type adminLoginResponse struct {
	Token string    `json:"token"`
	Admin AdminUser `json:"admin"`
}

type adminDashboardResponse struct {
	TotalUsers      int `json:"totalUsers"`
	BannedUsers     int `json:"bannedUsers"`
	TotalGroups     int `json:"totalGroups"`
	TotalMessages   int `json:"totalMessages"`
	OpenReports     int `json:"openReports"`
	OpenFeedback    int `json:"openFeedback"`
	AttachmentCount int `json:"attachmentCount"`
	AttachmentBytes int `json:"attachmentBytes"`
}

func defaultAdminSystemSettings() AdminSystemSettings {
	return AdminSystemSettings{
		RegistrationEnabled:  true,
		MaxUploadBytes:       maxUploadSizeBytes,
		MaxGroupMembers:      500,
		SensitiveWords:       []string{},
		SpamDetectionEnabled: false,
	}
}

var (
	errInvalidAdminSettings = errors.New("invalid admin settings")
	errInvalidAdminAccount  = errors.New("invalid admin account")
	errAdminUsernameExists  = errors.New("admin username exists")
	errAdminSelfMutation    = errors.New("admin cannot modify own account")
	errAdminNotFound        = errors.New("admin not found")
)

var adminPermissionKeys = []string{
	"dashboard.view",
	"users.view",
	"users.ban",
	"groups.view",
	"groups.mute",
	"groups.blacklist",
	"messages.view",
	"messages.delete",
	"reports.view",
	"reports.resolve",
	"feedback.view",
	"feedback.update",
	"files.view",
	"audit_logs.view",
	"settings.view",
	"settings.update",
	"admins.view",
	"admins.invite",
	"admins.disable",
	"admins.role_update",
}

var adminRolePermissions = map[string][]string{
	"super_admin": adminPermissionKeys,
	"support": {
		"dashboard.view",
		"users.view",
		"reports.view",
		"feedback.view",
		"feedback.update",
	},
	"moderator": {
		"dashboard.view",
		"users.view",
		"users.ban",
		"groups.view",
		"groups.mute",
		"groups.blacklist",
		"messages.view",
		"messages.delete",
		"reports.view",
		"reports.resolve",
		"files.view",
		"audit_logs.view",
	},
	"operator": {
		"dashboard.view",
		"users.view",
		"groups.view",
		"messages.view",
		"reports.view",
		"feedback.view",
		"feedback.update",
		"files.view",
	},
}

type adminUserSummary struct {
	ID        string     `json:"id"`
	Phone     string     `json:"phone"`
	Country   string     `json:"country"`
	ChatID    string     `json:"chatId"`
	Nickname  string     `json:"nickname"`
	Avatar    string     `json:"avatar"`
	CreatedAt time.Time  `json:"createdAt,omitempty"`
	Status    string     `json:"status"`
	BannedAt  *time.Time `json:"bannedAt,omitempty"`
	BanReason string     `json:"banReason,omitempty"`
}

type adminUserBanRequest struct {
	Reason string `json:"reason"`
}

type LoginDevice struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Current   bool      `json:"current"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	mu                sync.RWMutex
	user              User
	users             map[string]User
	contacts          []Contact
	conversations     []Conversation
	messages          map[string][]Message
	messageReads      map[string]map[string]time.Time
	conversationBurns map[string]map[string]bool
	messageClears     map[string]map[string]time.Time
	conversationHides map[string]map[string]bool
	groups            map[string]Group
	discoverGroups    []Group
	requests          []FriendRequest
	joinRequests      []GroupJoinRequest
	blacklists        []GroupBlacklistEntry
	groupBots         map[string][]GroupBot
	collections       []Collection
	reports           []Report
	feedback          []Feedback
	auditLogs         []AuditLog
	adminUsers        map[string]AdminUserRecord
	adminSessions     map[string]AdminSession
	adminAuditLogs    []AdminAuditLog
	systemSettings    AdminSystemSettings
	adminAuditLogHook func(AdminAuditLog) error
	passwordHashes    map[string]string
	hub               *Hub
	pg                *PostgresStore
	sessions          map[string]string
	sessionCreatedAt  map[string]time.Time
	uploadDir         string
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
	store := runtimeStore()
	store.uploadDir = defaultString(os.Getenv("UPLOAD_DIR"), "uploads")
	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		ctx := context.Background()
		pg, err := openPostgresStore(ctx, databaseURL)
		if err != nil {
			log.Fatalf("postgres: %v", err)
		}
		store.pg = pg
		if marker := strings.TrimSpace(os.Getenv("RESET_DATABASE_MARKER")); marker != "" {
			if err := store.resetPostgresOnce(ctx, marker); err != nil {
				log.Fatalf("postgres reset: %v", err)
			}
		}
		if err := store.syncFromPostgres(ctx); err != nil {
			log.Fatalf("postgres sync: %v", err)
		}
		log.Printf("postgres persistence enabled")
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)
	store.startGroupBotScheduler(context.Background())

	addr := ":" + defaultString(os.Getenv("PORT"), "8080")
	log.Printf("chat api listening on http://localhost%s", addr)
	server := &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func runtimeStore() *Store {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("SEED_DEMO_DATA")), "true") {
		return seedStore()
	}
	return emptyDemoStore()
}

func emptyDemoStore() *Store {
	admin := bootstrapAdminRecord()
	return &Store{
		user:              demoUser(),
		users:             map[string]User{},
		adminUsers:        map[string]AdminUserRecord{admin.ID: admin},
		adminSessions:     map[string]AdminSession{},
		adminAuditLogs:    []AdminAuditLog{},
		systemSettings:    defaultAdminSystemSettings(),
		passwordHashes:    map[string]string{"u1": "demo:demo123456"},
		contacts:          []Contact{},
		conversations:     []Conversation{},
		messages:          map[string][]Message{},
		messageReads:      map[string]map[string]time.Time{},
		conversationBurns: map[string]map[string]bool{},
		messageClears:     map[string]map[string]time.Time{},
		conversationHides: map[string]map[string]bool{},
		groups:            map[string]Group{},
		discoverGroups:    []Group{},
		joinRequests:      []GroupJoinRequest{},
		blacklists:        []GroupBlacklistEntry{},
		groupBots:         map[string][]GroupBot{},
		requests:          []FriendRequest{},
		collections:       []Collection{},
		reports:           []Report{},
		feedback:          []Feedback{},
		auditLogs:         []AuditLog{},
		hub:               &Hub{clients: map[*WSConn]bool{}},
		sessions:          map[string]string{},
		sessionCreatedAt:  map[string]time.Time{},
	}
}

func demoUser() User {
	return normalizeUserPreferences(User{
		ID:        "u1",
		Country:   "+60",
		Phone:     "174319676",
		ChatID:    "o8tew3",
		Nickname:  "chenshao",
		Signature: "保持专注，保持联系。",
		Avatar:    avatar("陈"),
		CreatedAt: time.Now().Add(-72 * time.Hour),
	})
}

func registerRoutes(mux *http.ServeMux, s *Store) {
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if s.pg != nil && s.pg.pool != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			if err := s.pg.pool.Ping(ctx); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "database": false, "time": time.Now()})
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "database": true, "time": time.Now()})
	})
	mux.HandleFunc("/api/admin/auth/login", s.adminLogin)
	mux.HandleFunc("/api/admin/auth/logout", s.requireAdmin(s.adminLogout))
	mux.HandleFunc("/api/admin/auth/me", s.requireAdmin(s.adminMe))
	mux.HandleFunc("/api/admin/dashboard", s.requireAdminPermission("dashboard.view", s.adminDashboard))
	mux.HandleFunc("/api/admin/users", s.requireAdminPermission("users.view", s.adminUsersRoute))
	mux.HandleFunc("/api/admin/users/", s.requireAdminDynamicPermission(adminUserPermissionForRequest, s.adminUserRoute))
	mux.HandleFunc("/api/admin/groups", s.requireAdminPermission("groups.view", s.adminGroupsRoute))
	mux.HandleFunc("/api/admin/groups/", s.requireAdminDynamicPermission(adminGroupPermissionForRequest, s.adminGroupRoute))
	mux.HandleFunc("/api/admin/messages", s.requireAdminPermission("messages.view", s.adminMessagesRoute))
	mux.HandleFunc("/api/admin/messages/", s.requireAdminDynamicPermission(adminMessagePermissionForRequest, s.adminMessageRoute))
	mux.HandleFunc("/api/admin/reports", s.requireAdminPermission("reports.view", s.adminReportsRoute))
	mux.HandleFunc("/api/admin/reports/", s.requireAdminDynamicPermission(adminReportPermissionForRequest, s.adminReportRoute))
	mux.HandleFunc("/api/admin/feedback", s.requireAdminPermission("feedback.view", s.adminFeedbackRoute))
	mux.HandleFunc("/api/admin/feedback/", s.requireAdminDynamicPermission(adminFeedbackPermissionForRequest, s.adminFeedbackItemRoute))
	mux.HandleFunc("/api/admin/files", s.requireAdminPermission("files.view", s.adminFilesRoute))
	mux.HandleFunc("/api/admin/files/", s.requireAdminPermission("files.view", s.adminFileRoute))
	mux.HandleFunc("/api/admin/audit-logs", s.requireAdminPermission("audit_logs.view", s.adminAuditLogsRoute))
	mux.HandleFunc("/api/admin/settings", s.requireAdminDynamicPermission(adminSettingsPermissionForRequest, s.adminSettingsRoute))
	mux.HandleFunc("/api/admin/admins", s.requireAdminDynamicPermission(adminAdminsPermissionForRequest, s.adminAdminsRoute))
	mux.HandleFunc("/api/admin/admins/", s.requireAdminDynamicPermission(adminAdminPermissionForRequest, s.adminAdminRoute))
	mux.HandleFunc("/api/auth/login", s.login)
	mux.HandleFunc("/api/auth/send-code", s.sendAuthCode)
	mux.HandleFunc("/api/auth/code-login", s.codeLogin)
	mux.HandleFunc("/api/auth/register", s.register)
	mux.HandleFunc("/api/auth/reset-password", s.resetPassword)
	mux.HandleFunc("/api/me/devices", s.requireAuth(s.loginDevicesRoute))
	mux.HandleFunc("/api/me/devices/", s.requireAuth(s.loginDeviceRoute))
	mux.HandleFunc("/api/me", s.requireAuth(s.me))
	mux.HandleFunc("/api/me/password", s.requireAuth(s.changePassword))
	mux.HandleFunc("/api/conversations", s.requireAuth(s.conversationsRoute))
	mux.HandleFunc("/api/conversations/", s.requireAuth(s.conversationRoute))
	mux.HandleFunc("/api/contacts", s.requireAuth(s.contactsRoute))
	mux.HandleFunc("/api/contacts/", s.requireAuth(s.contactRoute))
	mux.HandleFunc("/api/friend-requests", s.requireAuth(s.friendRequestsRoute))
	mux.HandleFunc("/api/friend-requests/", s.requireAuth(s.friendRequestRoute))
	mux.HandleFunc("/api/groups/discover", s.requireAuth(s.discoverGroupsRoute))
	mux.HandleFunc("/api/groups", s.requireAuth(s.groupsRoute))
	mux.HandleFunc("/api/groups/", s.requireAuth(s.groupRoute))
	mux.HandleFunc("/api/files/sign", s.requireAuth(s.signFile))
	mux.HandleFunc("/api/files/upload/", s.requireAuth(s.uploadFile))
	mux.HandleFunc("/uploads/", s.serveUpload)
	mux.HandleFunc("/api/collections", s.requireAuth(s.collectionsRoute))
	mux.HandleFunc("/api/feedback", s.requireAuth(s.feedbackRoute))
	mux.HandleFunc("/api/reports", s.requireAuth(s.reportsRoute))
	mux.HandleFunc("/ws", s.websocket)
	if webDir := strings.TrimSpace(os.Getenv("WEB_DIR")); webDir != "" {
		mux.HandleFunc("/", staticWebRoute(webDir))
	}
}

func (s *Store) routes(_ string) *http.ServeMux {
	mux := http.NewServeMux()
	registerRoutes(mux, s)
	return mux
}

func staticWebRoute(webDir string) http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(webDir))
	return func(w http.ResponseWriter, r *http.Request) {
		setStaticWebCacheHeaders(w)
		if r.URL.Path == "/" {
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
			return
		}
		path := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if path == "." || strings.HasPrefix(path, "..") {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(filepath.Join(webDir, path)); err != nil {
			http.ServeFile(w, r, filepath.Join(webDir, staticWebFallback(path)))
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

func staticWebFallback(path string) string {
	if path == "admin" || strings.HasPrefix(path, "admin/") {
		return "admin.html"
	}
	return "index.html"
}

func setStaticWebCacheHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.Header().Set("Pragma", "no-cache")
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
	req.Country, req.Phone = normalizeAuthIdentity(req.Country, req.Phone)
	req.Password = strings.TrimSpace(req.Password)
	user, ok, err := s.authenticate(r.Context(), req.Country, req.Phone, req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if userIsBanned(user) {
		writeError(w, http.StatusForbidden, "account banned")
		return
	}
	token := s.issueToken(user.ID)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": publicUserResponse(user)})
}

func (s *Store) sendAuthCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Country string `json:"country"`
		Phone   string `json:"phone"`
		Purpose string `json:"purpose"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Country = defaultString(req.Country, "+60")
	req.Phone = strings.TrimSpace(req.Phone)
	req.Purpose = defaultString(strings.TrimSpace(req.Purpose), "login")
	if req.Phone == "" {
		writeError(w, http.StatusBadRequest, "phone is required")
		return
	}
	if _, ok, err := s.userByPhone(r.Context(), req.Country, req.Phone); err != nil {
		writeError(w, http.StatusInternalServerError, "send code failed")
		return
	} else if !ok {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "code": demoLoginCode, "purpose": req.Purpose})
}

func (s *Store) adminLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req adminLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	admin, ok, err := s.adminByUsername(r.Context(), req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "admin login failed")
		return
	}
	passwordHash := admin.PasswordHash
	if !ok {
		passwordHash = adminLoginDummyPasswordHash
	}
	if passwordHash == "" || !passwordMatches(passwordHash, req.Password) || !ok {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if admin.DisabledAt != nil {
		writeError(w, http.StatusForbidden, "admin account disabled")
		return
	}
	now := time.Now()
	admin.LastLoginAt = &now
	if err := s.markAdminLogin(r.Context(), admin.ID, now); err != nil {
		writeError(w, http.StatusInternalServerError, "admin login failed")
		return
	}
	token := s.newAdminToken(admin.ID)
	session := AdminSession{
		ID:          newID("admin-session"),
		AdminUserID: admin.ID,
		TokenHash:   hashAdminToken(token),
		ExpiresAt:   now.Add(24 * time.Hour),
		CreatedAt:   now,
	}
	if err := s.saveAdminSession(r.Context(), session); err != nil {
		writeError(w, http.StatusInternalServerError, "admin login failed")
		return
	}
	writeJSON(w, http.StatusOK, adminLoginResponse{
		Token: token,
		Admin: adminWithPermissions(admin.AdminUser),
	})
}

func (s *Store) codeLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Country string `json:"country"`
		Phone   string `json:"phone"`
		Code    string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Country = defaultString(req.Country, "+60")
	req.Phone = strings.TrimSpace(req.Phone)
	req.Code = strings.TrimSpace(req.Code)
	if req.Phone == "" {
		writeError(w, http.StatusBadRequest, "phone is required")
		return
	}
	if req.Code != demoLoginCode {
		writeError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	user, ok, err := s.userByPhone(r.Context(), req.Country, req.Phone)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "code login failed")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if userIsBanned(user) {
		writeError(w, http.StatusForbidden, "account banned")
		return
	}
	token := s.issueToken(user.ID)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": publicUserResponse(user)})
}

func (s *Store) resetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Country     string `json:"country"`
		Phone       string `json:"phone"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Country = defaultString(req.Country, "+60")
	req.Phone = strings.TrimSpace(req.Phone)
	req.Code = strings.TrimSpace(req.Code)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	if req.Phone == "" || len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "phone and new password with at least 6 chars are required")
		return
	}
	if req.Code != demoLoginCode {
		writeError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	ok, err := s.resetPasswordForPhone(r.Context(), req.Country, req.Phone, req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password reset failed")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Store) adminLogout(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := s.revokeAdminSession(r.Context(), s.currentToken(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "admin logout failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Store) adminMe(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, admin)
}

func (s *Store) adminDashboard(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	dashboard, err := s.adminDashboardCounts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dashboard load failed")
		return
	}
	writeJSON(w, http.StatusOK, dashboard)
}

func (s *Store) adminUsersRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	items, err := s.adminSearchUsers(r.Context(), strings.TrimSpace(r.URL.Query().Get("keyword")), strings.TrimSpace(r.URL.Query().Get("status")), strings.TrimSpace(r.URL.Query().Get("from")), strings.TrimSpace(r.URL.Query().Get("to")))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "user list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminUserRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin/users/")
	path = strings.Trim(path, "/")
	if path == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	parts := strings.Split(path, "/")
	userID := strings.TrimSpace(parts[0])
	if userID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		user, ok, err := s.adminUserByID(r.Context(), userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "user detail failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeJSON(w, http.StatusOK, adminSummaryFromUser(user))
		return
	}
	if len(parts) != 2 || r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	switch parts[1] {
	case "ban":
		var req adminUserBanRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Reason = strings.TrimSpace(req.Reason)
		if req.Reason == "" {
			writeError(w, http.StatusBadRequest, "ban reason required")
			return
		}
		now := time.Now()
		user, ok, err := s.setUserBanStateWithAudit(r.Context(), admin, userID, &now, req.Reason, "user_banned", req.Reason)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "ban user failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeJSON(w, http.StatusOK, adminSummaryFromUser(user))
	case "unban":
		user, ok, err := s.setUserBanStateWithAudit(r.Context(), admin, userID, nil, "", "user_unbanned", "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "unban user failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeJSON(w, http.StatusOK, adminSummaryFromUser(user))
	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

func (s *Store) adminGroupsRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	items, err := s.adminGroups(r.Context(), strings.TrimSpace(r.URL.Query().Get("keyword")), strings.TrimSpace(r.URL.Query().Get("joinMode")))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "group list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminGroupRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/groups/"), "/")
	if path == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	parts := strings.Split(path, "/")
	groupID := strings.TrimSpace(parts[0])
	if groupID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		group, ok, err := s.adminGroupByID(r.Context(), groupID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "group detail failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeJSON(w, http.StatusOK, group)
		return
	}
	if len(parts) == 3 && parts[1] == "blacklist" {
		userID := strings.TrimSpace(parts[2])
		if userID == "" {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		switch r.Method {
		case http.MethodPost:
			var req struct {
				Reason string `json:"reason"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid json")
				return
			}
			entry, err := s.adminAddGroupBlacklistEntryWithAudit(r.Context(), admin, groupID, userID, "", strings.TrimSpace(req.Reason))
			if err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "group or user not found")
					return
				}
				writeError(w, http.StatusInternalServerError, "blacklist add failed")
				return
			}
			writeJSON(w, http.StatusCreated, entry)
		case http.MethodDelete:
			entry, err := s.removeGroupBlacklistEntryWithAdminAudit(r.Context(), admin, groupID, userID)
			if err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "blacklist entry not found")
					return
				}
				writeError(w, http.StatusInternalServerError, "blacklist remove failed")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"removed": entry.User.ID})
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	if len(parts) != 2 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	switch parts[1] {
	case "members":
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		group, ok, err := s.adminGroupByID(r.Context(), groupID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "group members failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeJSON(w, http.StatusOK, group.Members)
	case "mute-all", "unmute-all":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		allMuted := parts[1] == "mute-all"
		group, ok, err := s.setAdminGroupAllMuted(r.Context(), admin, groupID, allMuted)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "group update failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeJSON(w, http.StatusOK, group)
	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

func (s *Store) adminMessagesRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	items, err := s.adminMessages(
		r.Context(),
		strings.TrimSpace(r.URL.Query().Get("q")),
		strings.TrimSpace(r.URL.Query().Get("conversationId")),
		strings.TrimSpace(r.URL.Query().Get("senderId")),
		strings.TrimSpace(r.URL.Query().Get("type")),
		strings.TrimSpace(r.URL.Query().Get("from")),
		strings.TrimSpace(r.URL.Query().Get("to")),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "message list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminMessageRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	messageID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/messages/"), "/")
	if messageID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		message, ok, err := s.adminMessageByID(r.Context(), messageID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "message detail failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		writeJSON(w, http.StatusOK, message)
	case http.MethodDelete:
		_, ok, err := s.adminDeleteMessage(r.Context(), admin, messageID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "message delete failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": []string{messageID}})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) adminReportsRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	targetType := strings.TrimSpace(r.URL.Query().Get("targetType"))
	if targetType == "" {
		targetType = strings.TrimSpace(r.URL.Query().Get("target"))
	}
	items, err := s.adminReports(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")), targetType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "report list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminReportRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/reports/"), "/")
	if path == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	parts := strings.Split(path, "/")
	reportID := strings.TrimSpace(parts[0])
	if reportID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		report, ok, err := s.adminReportByID(r.Context(), reportID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "report detail failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "report not found")
			return
		}
		writeJSON(w, http.StatusOK, report)
		return
	}
	if len(parts) != 2 || parts[1] != "resolve" || r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Status     string `json:"status"`
		Resolution string `json:"resolution"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	report, ok, err := s.adminResolveReport(r.Context(), admin, reportID, req.Status, req.Resolution)
	if errors.Is(err, errInvalidStatus) {
		writeError(w, http.StatusBadRequest, "invalid report status")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "report resolve failed")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "report not found")
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (s *Store) adminFeedbackRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID := strings.TrimSpace(r.URL.Query().Get("userId"))
	if userID == "" {
		userID = strings.TrimSpace(r.URL.Query().Get("user"))
	}
	items, err := s.adminFeedback(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "feedback list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminFeedbackItemRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/feedback/"), "/")
	if path == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	parts := strings.Split(path, "/")
	feedbackID := strings.TrimSpace(parts[0])
	if feedbackID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		item, ok, err := s.adminFeedbackByID(r.Context(), feedbackID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "feedback detail failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "feedback not found")
			return
		}
		writeJSON(w, http.StatusOK, item)
		return
	}
	if len(parts) != 2 || parts[1] != "status" || r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Status    string `json:"status"`
		AdminNote string `json:"adminNote"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	item, ok, err := s.adminUpdateFeedbackStatus(r.Context(), admin, feedbackID, req.Status, req.AdminNote)
	if errors.Is(err, errInvalidStatus) {
		writeError(w, http.StatusBadRequest, "invalid feedback status")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "feedback update failed")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "feedback not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Store) adminFilesRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	items, err := s.adminFiles(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "file list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminFileRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	fileID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/files/"), "/")
	if fileID == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	item, ok, err := s.adminFileByID(r.Context(), fileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "file detail failed")
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Store) adminAuditLogsRoute(w http.ResponseWriter, r *http.Request, _ AdminUser) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	targetType := strings.TrimSpace(r.URL.Query().Get("targetType"))
	if targetType == "" {
		targetType = strings.TrimSpace(r.URL.Query().Get("target"))
	}
	items, err := s.adminAuditLogsFor(
		r.Context(),
		strings.TrimSpace(r.URL.Query().Get("admin")),
		strings.TrimSpace(r.URL.Query().Get("action")),
		targetType,
		strings.TrimSpace(r.URL.Query().Get("from")),
		strings.TrimSpace(r.URL.Query().Get("to")),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "audit log list failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) adminSettingsRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	switch r.Method {
	case http.MethodGet:
		settings, err := s.adminSystemSettings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "settings load failed")
			return
		}
		writeJSON(w, http.StatusOK, settings)
	case http.MethodPost:
		var req AdminSystemSettings
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		settings, err := s.updateAdminSystemSettings(r.Context(), admin, req)
		if err != nil {
			if errors.Is(err, errInvalidAdminSettings) {
				writeError(w, http.StatusBadRequest, "invalid settings")
				return
			}
			writeError(w, http.StatusInternalServerError, "settings update failed")
			return
		}
		writeJSON(w, http.StatusOK, settings)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) adminAdminsRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	switch r.Method {
	case http.MethodGet:
		admins, err := s.adminAccounts(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "admin list failed")
			return
		}
		writeJSON(w, http.StatusOK, admins)
	case http.MethodPost:
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		created, err := s.createAdminAccount(r.Context(), admin, req.Username, req.Password, req.Role)
		if err != nil {
			if errors.Is(err, errInvalidAdminAccount) {
				writeError(w, http.StatusBadRequest, "invalid admin account")
				return
			}
			if errors.Is(err, errAdminUsernameExists) {
				writeError(w, http.StatusConflict, "admin username exists")
				return
			}
			writeError(w, http.StatusInternalServerError, "admin create failed")
			return
		}
		writeJSON(w, http.StatusCreated, created)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) adminAdminRoute(w http.ResponseWriter, r *http.Request, admin AdminUser) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/admins/"), "/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" {
		writeError(w, http.StatusNotFound, "admin not found")
		return
	}
	adminID := strings.TrimSpace(parts[0])
	switch parts[1] {
	case "status":
		var req struct {
			Disabled bool `json:"disabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		updated, err := s.setAdminAccountDisabled(r.Context(), admin, adminID, req.Disabled)
		if err != nil {
			writeAdminAccountError(w, err, "admin status update failed")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	case "role":
		var req struct {
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		updated, err := s.setAdminAccountRole(r.Context(), admin, adminID, req.Role)
		if err != nil {
			writeAdminAccountError(w, err, "admin role update failed")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	default:
		writeError(w, http.StatusNotFound, "admin not found")
	}
}

func writeAdminAccountError(w http.ResponseWriter, err error, fallback string) {
	if errors.Is(err, errInvalidAdminAccount) || errors.Is(err, errAdminSelfMutation) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, errAdminNotFound) {
		writeError(w, http.StatusNotFound, "admin not found")
		return
	}
	writeError(w, http.StatusInternalServerError, fallback)
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
	if s.sessionCreatedAt == nil {
		s.sessionCreatedAt = map[string]time.Time{}
	}
	s.sessions[token] = userID
	createdAt := time.Now()
	s.sessionCreatedAt[token] = createdAt
	if s.pg != nil {
		if err := s.saveUserSession(context.Background(), token, userID, createdAt); err != nil {
			log.Printf("persist user session: %v", err)
		}
	}
	return token
}

func (s *Store) newAdminToken(adminUserID string) string {
	var bytes [24]byte
	if _, err := cryptorand.Read(bytes[:]); err != nil {
		return "admin-token-" + adminUserID + "-" + newID("session")
	}
	return hex.EncodeToString(bytes[:])
}

func (s *Store) currentToken(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func (s *Store) userFromToken(ctx context.Context, token string) (User, bool) {
	if token == "" {
		return User{}, false
	}
	if s.pg == nil && token == "demo-token" {
		return s.user, true
	}
	if s.pg != nil {
		user, ok, err := s.userBySessionToken(ctx, token)
		if err != nil || !ok {
			return User{}, false
		}
		return user, true
	}
	s.mu.RLock()
	userID := s.sessions[token]
	s.mu.RUnlock()
	if userID == "" {
		return User{}, false
	}
	user, ok, err := s.userByID(ctx, userID)
	if err != nil || !ok {
		return User{}, false
	}
	return user, true
}

func (s *Store) currentUser(r *http.Request) User {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if user, ok := s.userFromToken(r.Context(), token); ok {
		return user
	}
	return s.user
}

func (s *Store) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.pg == nil && strings.TrimSpace(r.Header.Get("Authorization")) == "" {
			if userIsBanned(s.user) {
				writeError(w, http.StatusForbidden, "account banned")
				return
			}
			next(w, r)
			return
		}
		token := s.currentToken(r)
		user, ok := s.userFromToken(r.Context(), token)
		if !ok {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if userIsBanned(user) {
			writeError(w, http.StatusForbidden, "account banned")
			return
		}
		next(w, r)
	}
}

func (s *Store) requireAdmin(next func(http.ResponseWriter, *http.Request, AdminUser)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := s.currentToken(r)
		admin, _, ok, err := s.adminBySessionToken(r.Context(), token)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "admin authentication failed")
			return
		}
		if !ok {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next(w, r, adminWithPermissions(admin))
	}
}

func (s *Store) requireAdminPermission(permission string, next func(http.ResponseWriter, *http.Request, AdminUser)) http.HandlerFunc {
	return s.requireAdmin(func(w http.ResponseWriter, r *http.Request, admin AdminUser) {
		if !adminHasPermission(admin, permission) {
			writeError(w, http.StatusForbidden, "permission denied")
			return
		}
		next(w, r, admin)
	})
}

func (s *Store) requireAdminDynamicPermission(permissionForRequest func(*http.Request) string, next func(http.ResponseWriter, *http.Request, AdminUser)) http.HandlerFunc {
	return s.requireAdmin(func(w http.ResponseWriter, r *http.Request, admin AdminUser) {
		permission := permissionForRequest(r)
		if permission == "" || !adminHasPermission(admin, permission) {
			writeError(w, http.StatusForbidden, "permission denied")
			return
		}
		next(w, r, admin)
	})
}

func adminWithPermissions(admin AdminUser) AdminUser {
	admin.Permissions = adminPermissionsForRole(admin.Role)
	return admin
}

func adminPermissionsForRole(role string) []string {
	permissions, ok := adminRolePermissions[role]
	if !ok {
		return []string{}
	}
	return append([]string{}, permissions...)
}

func adminHasPermission(admin AdminUser, permission string) bool {
	if permission == "" {
		return false
	}
	for _, allowed := range adminPermissionsForRole(admin.Role) {
		if allowed == permission {
			return true
		}
	}
	return false
}

func adminUserPermissionForRequest(r *http.Request) string {
	if r.Method == http.MethodGet {
		return "users.view"
	}
	if r.Method == http.MethodPost {
		return "users.ban"
	}
	return "users.view"
}

func adminGroupPermissionForRequest(r *http.Request) string {
	if strings.Contains(r.URL.Path, "/blacklist/") {
		return "groups.blacklist"
	}
	if r.Method == http.MethodPost {
		return "groups.mute"
	}
	if r.Method == http.MethodGet {
		return "groups.view"
	}
	return "groups.view"
}

func adminMessagePermissionForRequest(r *http.Request) string {
	if r.Method == http.MethodDelete {
		return "messages.delete"
	}
	return "messages.view"
}

func adminReportPermissionForRequest(r *http.Request) string {
	if r.Method == http.MethodPost {
		return "reports.resolve"
	}
	return "reports.view"
}

func adminFeedbackPermissionForRequest(r *http.Request) string {
	if r.Method == http.MethodPost {
		return "feedback.update"
	}
	return "feedback.view"
}

func adminSettingsPermissionForRequest(r *http.Request) string {
	if r.Method == http.MethodPost {
		return "settings.update"
	}
	return "settings.view"
}

func adminAdminsPermissionForRequest(r *http.Request) string {
	if r.Method == http.MethodPost {
		return "admins.invite"
	}
	return "admins.view"
}

func adminAdminPermissionForRequest(r *http.Request) string {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/admins/"), "/")
	parts := strings.Split(path, "/")
	if len(parts) == 2 && r.Method == http.MethodPost {
		if parts[1] == "status" {
			return "admins.disable"
		}
		if parts[1] == "role" {
			return "admins.role_update"
		}
	}
	return ""
}

func (s *Store) isSeedUser(userID string) bool {
	return userID == "" || userID == s.user.ID
}

func (s *Store) conversationVisibleToUserLocked(conversation Conversation, userID string) bool {
	if s.isSeedUser(userID) {
		return true
	}
	if conversation.Kind == "group" {
		groupID := groupIDFromConversationID(conversation.ID)
		group, ok := s.groups[groupID]
		return ok && groupHasUser(group, userID)
	}
	if conversation.Kind == "session" {
		if a, b, ok := privateConversationParticipants(conversation.ID); ok {
			return userID == a || userID == b
		}
		for _, message := range s.messages[conversation.ID] {
			if message.SenderID == userID {
				return true
			}
		}
	}
	return false
}

func (s *Store) contactVisibleToUserLocked(contact Contact, userID string) bool {
	if s.isSeedUser(userID) {
		return true
	}
	for _, request := range s.requests {
		if request.Status != "accepted" || request.User.ID != contact.ID {
			continue
		}
		if request.Direction == "outgoing" && request.FromUserID == userID {
			return true
		}
		if request.Direction == "incoming" && request.ToUserID == userID {
			return true
		}
	}
	return false
}

func (s *Store) friendRequestVisibleToUser(request FriendRequest, userID string) bool {
	if s.isSeedUser(userID) {
		return true
	}
	if request.Direction == "outgoing" {
		return request.FromUserID == userID
	}
	if request.Direction == "incoming" {
		return request.ToUserID == userID
	}
	return false
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

func defaultUserSettings() map[string]bool {
	return map[string]bool{
		"notificationsEnabled":     true,
		"notificationSound":        true,
		"notificationBadge":        true,
		"mentionAlerts":            true,
		"enterToSend":              false,
		"messagePreview":           true,
		"autoPlayVoice":            false,
		"collapseToolsAfterSend":   true,
		"friendVerification":       false,
		"inviteGroupVerification":  false,
		"discoverByChatId":         true,
		"discoverByPhone":          false,
		"showSignatureToStrangers": false,
		"loginAlerts":              true,
		"confirmDeletes":           true,
		"darkMode":                 false,
		"showRecentMessage":        true,
	}
}

func userIsBanned(user User) bool {
	return user.BannedAt != nil
}

func adminSummaryFromUser(user User) adminUserSummary {
	return adminUserSummary{
		ID:        user.ID,
		Phone:     user.Phone,
		Country:   user.Country,
		ChatID:    user.ChatID,
		Nickname:  user.Nickname,
		Avatar:    user.Avatar,
		CreatedAt: user.CreatedAt,
		Status:    adminUserStatus(user),
		BannedAt:  user.BannedAt,
		BanReason: user.BanReason,
	}
}

func adminUserStatus(user User) string {
	if userIsBanned(user) {
		return "banned"
	}
	return "active"
}

func parseAdminDateFilter(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	if ts, err := time.Parse(time.RFC3339, value); err == nil {
		return ts, true
	}
	if day, err := time.Parse("2006-01-02", value); err == nil {
		return day, true
	}
	return time.Time{}, false
}

func mergeUserSettings(base map[string]bool, patch map[string]bool) map[string]bool {
	merged := defaultUserSettings()
	for key, value := range base {
		merged[key] = value
	}
	for key, value := range patch {
		merged[key] = value
	}
	return merged
}

func normalizeUserPreferences(user User) User {
	user.Settings = mergeUserSettings(user.Settings, nil)
	if user.Language == "" {
		user.Language = "简体中文"
	}
	if user.DisplayMode == "" {
		user.DisplayMode = "桌面版"
	}
	user.BlockedContactIDs = uniqueStrings(user.BlockedContactIDs)
	user.StickerStore = normalizeStickerStore(user.StickerStore)
	return user
}

func publicUserResponse(user User) User {
	user = normalizeUserPreferences(user)
	user.BannedAt = nil
	user.BanReason = ""
	return user
}

func defaultStickerStore() StickerStore {
	return StickerStore{
		Items:     []string{"😀", "🥳", "👍", "🔥", "❤️", "😄", "🎉", "🙌"},
		Favorites: []string{"😀", "🎉", "❤️"},
	}
}

func normalizeStickerStore(store StickerStore) StickerStore {
	defaults := defaultStickerStore()
	if len(store.Items) == 0 {
		store.Items = defaults.Items
	}
	if len(store.Favorites) == 0 {
		store.Favorites = defaults.Favorites
	}
	store.Items = uniqueStrings(store.Items)
	store.Favorites = uniqueStrings(store.Favorites)
	itemSet := map[string]bool{}
	for _, item := range store.Items {
		itemSet[item] = true
	}
	for _, favorite := range store.Favorites {
		if !itemSet[favorite] {
			store.Items = append(store.Items, favorite)
			itemSet[favorite] = true
		}
	}
	return store
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
	req.Country, req.Phone = normalizeAuthIdentity(req.Country, req.Phone)
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
		log.Printf("register failed for %s %s: %v", req.Country, req.Phone, err)
		writeError(w, http.StatusInternalServerError, "registration failed")
		return
	}
	token := s.issueToken(user.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": publicUserResponse(user)})
}

func normalizeAuthIdentity(country, phone string) (string, string) {
	country = strings.TrimSpace(country)
	if country == "" {
		country = "+60"
	} else if !strings.HasPrefix(country, "+") {
		country = "+" + country
	}
	phone = strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, phone)
	return country, phone
}

func (s *Store) me(w http.ResponseWriter, r *http.Request) {
	token := s.currentToken(r)
	if token != "" {
		if current, ok := s.userFromToken(r.Context(), token); ok {
			s.meForUser(w, r, current)
			return
		}
		writeError(w, http.StatusUnauthorized, "invalid token")
		return
	}
	current := s.currentUser(r)
	s.meForUser(w, r, current)
}

func (s *Store) meForUser(w http.ResponseWriter, r *http.Request, current User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, publicUserResponse(current))
	case http.MethodPatch:
		var patch struct {
			Nickname          *string         `json:"nickname"`
			Signature         *string         `json:"signature"`
			Avatar            *string         `json:"avatar"`
			Settings          map[string]bool `json:"settings"`
			Language          *string         `json:"language"`
			DisplayMode       *string         `json:"displayMode"`
			BlockedContactIDs []string        `json:"blockedContactIds"`
			StickerStore      *StickerStore   `json:"stickerStore"`
		}
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		current = normalizeUserPreferences(current)
		if patch.Nickname != nil {
			v := strings.TrimSpace(*patch.Nickname)
			if v == "" {
				writeError(w, http.StatusBadRequest, "nickname required")
				return
			}
			current.Nickname = v
		}
		if patch.Signature != nil {
			current.Signature = strings.TrimSpace(*patch.Signature)
		}
		if patch.Avatar != nil {
			v := strings.TrimSpace(*patch.Avatar)
			if v == "" {
				writeError(w, http.StatusBadRequest, "avatar required")
				return
			}
			current.Avatar = v
		}
		if patch.Settings != nil {
			current.Settings = mergeUserSettings(current.Settings, patch.Settings)
		}
		if patch.Language != nil {
			current.Language = strings.TrimSpace(*patch.Language)
		}
		if patch.DisplayMode != nil {
			current.DisplayMode = strings.TrimSpace(*patch.DisplayMode)
		}
		if patch.BlockedContactIDs != nil {
			current.BlockedContactIDs = uniqueStrings(patch.BlockedContactIDs)
		}
		if patch.StickerStore != nil {
			current.StickerStore = normalizeStickerStore(*patch.StickerStore)
		}
		current = normalizeUserPreferences(current)
		if err := s.persistUser(r.Context(), current); err != nil {
			writeError(w, http.StatusInternalServerError, "profile update failed")
			return
		}
		if current.ID == s.user.ID {
			s.user = current
		}
		if s.users != nil {
			s.users[current.ID] = current
		}
		if patch.Avatar != nil {
			for _, group := range s.syncOwnedGroupAvatarsLocked(current.ID, current.Avatar) {
				if err := s.persistGroupFor(r.Context(), current.ID, group, "group-"+group.ID); err != nil {
					writeError(w, http.StatusInternalServerError, "group avatar update failed")
					return
				}
			}
		}
		writeJSON(w, http.StatusOK, publicUserResponse(current))
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) syncOwnedGroupAvatarsLocked(ownerID, avatarURL string) []Group {
	if strings.TrimSpace(ownerID) == "" || strings.TrimSpace(avatarURL) == "" {
		return nil
	}
	updated := make([]Group, 0)
	for groupID, group := range s.groups {
		// The caller holds s.mu. Calling groupMemberRole here would try to take
		// the same lock again and block the profile update forever.
		if group.OwnerUserID != ownerID && groupRoleFor(group, ownerID) != "owner" {
			continue
		}
		if group.Avatar == avatarURL {
			continue
		}
		group.Avatar = avatarURL
		s.groups[groupID] = group
		for i := range s.conversations {
			if s.conversations[i].ID == "group-"+group.ID {
				s.conversations[i].Avatar = avatarURL
			}
		}
		updated = append(updated, group)
	}
	return updated
}

func (s *Store) changePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	var req struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.OldPassword = strings.TrimSpace(req.OldPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	if req.OldPassword == "" || len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "old password and new password with at least 6 chars are required")
		return
	}
	ok, err := s.updatePassword(r.Context(), current.ID, req.OldPassword, req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password update failed")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Store) loginDevicesRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	currentToken := s.currentToken(r)
	now := time.Now()
	s.mu.RLock()
	devices := make([]LoginDevice, 0)
	for token, userID := range s.sessions {
		if userID != current.ID {
			continue
		}
		createdAt := s.sessionCreatedAt[token]
		if createdAt.IsZero() {
			createdAt = now
		}
		devices = append(devices, LoginDevice{
			ID:        token,
			Name:      loginDeviceName(r.UserAgent(), token == currentToken),
			Current:   token == currentToken,
			CreatedAt: createdAt,
		})
	}
	s.mu.RUnlock()
	sort.Slice(devices, func(i, j int) bool {
		if devices[i].Current != devices[j].Current {
			return devices[i].Current
		}
		return devices[i].CreatedAt.After(devices[j].CreatedAt)
	})
	writeJSON(w, http.StatusOK, devices)
}

func (s *Store) loginDeviceRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	deviceID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/me/devices/"), "/")
	if deviceID == "" {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	current := s.currentUser(r)
	currentToken := s.currentToken(r)
	if deviceID == currentToken {
		writeError(w, http.StatusBadRequest, "cannot revoke current device")
		return
	}
	s.mu.Lock()
	userID, ok := s.sessions[deviceID]
	if !ok || userID != current.ID {
		s.mu.Unlock()
		writeError(w, http.StatusNotFound, "device not found")
		return
	}
	delete(s.sessions, deviceID)
	delete(s.sessionCreatedAt, deviceID)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func loginDeviceName(userAgent string, current bool) string {
	if !current {
		return "已登录设备"
	}
	ua := string(userAgent)
	if strings.Contains(ua, "Edg/") {
		return "Edge 浏览器"
	}
	if strings.Contains(ua, "Chrome/") {
		return "Chrome 浏览器"
	}
	if strings.Contains(ua, "Safari/") {
		return "Safari 浏览器"
	}
	if strings.Contains(ua, "Firefox/") {
		return "Firefox 浏览器"
	}
	return "当前浏览器"
}

func (s *Store) conversationsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	filter := r.URL.Query().Get("filter")
	current := s.currentUser(r)
	var items []Conversation
	hidden := map[string]bool{}
	if s.pg != nil {
		var err error
		items, err = s.pg.loadVisibleConversations(r.Context(), current.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "conversation lookup failed")
			return
		}
		hides, err := s.pg.loadConversationHides(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "conversation lookup failed")
			return
		}
		for conversationID, isHidden := range hides[current.ID] {
			hidden[conversationID] = isHidden
		}
	} else {
		s.mu.RLock()
		items = make([]Conversation, 0, len(s.conversations))
		for _, conversation := range s.conversations {
			if s.conversationVisibleToUserLocked(conversation, current.ID) {
				items = append(items, s.conversationForUserLocked(conversation, current.ID))
			}
		}
		if s.conversationHides != nil {
			for conversationID, isHidden := range s.conversationHides[current.ID] {
				hidden[conversationID] = isHidden
			}
		}
		s.mu.RUnlock()
	}
	s.mu.RLock()
	for i := range items {
		items[i] = s.conversationForUserLocked(items[i], current.ID)
	}
	s.mu.RUnlock()
	items = filterSlice(items, func(item Conversation) bool { return !hidden[item.ID] })
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
	if len(parts) == 1 && parts[0] != "" {
		if r.Method == http.MethodDelete {
			s.deleteConversationRoute(w, r, parts[0])
			return
		}
		s.conversationSettingsRoute(w, r, parts[0])
		return
	}
	if len(parts) < 2 || parts[1] != "messages" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	conversationID := parts[0]
	if len(parts) == 3 && parts[2] == "batch-delete" {
		s.batchDeleteMessagesRoute(w, r, conversationID)
		return
	}
	if len(parts) == 3 && parts[2] == "clear" {
		s.clearConversationMessagesRoute(w, r, conversationID)
		return
	}
	if len(parts) == 3 && parts[2] == "search" {
		s.searchConversationMessagesRoute(w, r, conversationID)
		return
	}
	if len(parts) == 4 && parts[3] == "reads" {
		s.messageReadReceiptsRoute(w, r, conversationID, parts[2])
		return
	}
	if len(parts) == 3 {
		s.deleteMessageRoute(w, r, conversationID, parts[2])
		return
	}
	if len(parts) != 2 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		current := s.currentUser(r)
		conversationID = s.canonicalConversationIDForUser(r.Context(), conversationID, current.ID)
		messages, readAt := s.readConversationMessages(r.Context(), conversationID, current.ID)
		writeJSON(w, http.StatusOK, messages)
		if event := messageReadReceiptEvent(conversationID, current.ID, readAt, messages); len(event.Payload.Messages) > 0 {
			s.hub.Broadcast(event)
		}
	case http.MethodPost:
		current := s.currentUser(r)
		conversationID = s.canonicalConversationIDForUser(r.Context(), conversationID, current.ID)
		if blocked, reason := s.blocksGroupMessage(conversationID, current.ID); blocked {
			if reason == "group rate limit exceeded" {
				writeError(w, http.StatusTooManyRequests, reason)
				return
			}
			writeError(w, http.StatusForbidden, reason)
			return
		}
		blocked, err := s.blocksPrivateMessage(r.Context(), conversationID, current.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "blacklist check failed")
			return
		}
		if blocked {
			writeError(w, http.StatusForbidden, "target blocked messages")
			return
		}
		var req struct {
			Type       string      `json:"type"`
			Body       string      `json:"body"`
			Attachment *Attachment `json:"attachment"`
			Quote      *Quote      `json:"quote"`
			Mentions   []string    `json:"mentions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		body := strings.TrimSpace(req.Body)
		mentions, err := s.normalizedMentionsForMessage(conversationID, current.ID, body, req.Mentions)
		if err != nil {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		msg := Message{
			ID:             newID("msg"),
			ConversationID: conversationID,
			SenderID:       current.ID,
			SenderName:     current.Nickname,
			SenderAvatar:   current.Avatar,
			Type:           req.Type,
			Body:           body,
			Attachment:     req.Attachment,
			Quote:          sanitizeQuote(req.Quote),
			Mentions:       mentions,
			CreatedAt:      time.Now(),
		}
		privateContact, ensurePrivateConversation, err := s.privateConversationContact(r.Context(), conversationID, current.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "conversation lookup failed")
			return
		}
		if ensurePrivateConversation && privateContact.ID == "" {
			writeError(w, http.StatusNotFound, "conversation target not found")
			return
		}
		s.mu.Lock()
		if ensurePrivateConversation {
			s.ensurePrivateConversationLocked(conversationID, privateContact, msg)
		}
		if s.messageReads == nil {
			s.messageReads = map[string]map[string]time.Time{}
		}
		if s.messageReads[conversationID] == nil {
			s.messageReads[conversationID] = map[string]time.Time{}
		}
		msg.BurnAfterRead = s.conversationBurnEnabledLocked(conversationID, current.ID)
		s.messageReads[conversationID][current.ID] = msg.CreatedAt
		s.messages[conversationID] = append(s.messages[conversationID], msg)
		if s.conversationHides != nil && s.conversationHides[current.ID] != nil {
			delete(s.conversationHides[current.ID], conversationID)
		}
		for i := range s.conversations {
			if s.conversations[i].ID == conversationID {
				s.conversations[i].LastText = displayMessage(msg)
				s.conversations[i].LastAt = msg.CreatedAt
				s.conversations[i].Unread = 0
			}
		}
		msg = s.withReadStatsLocked(msg)
		s.mu.Unlock()
		_ = s.persistConversationRead(r.Context(), conversationID, current.ID, msg.CreatedAt)
		_ = s.unhideConversationFor(r.Context(), current.ID, conversationID)
		if err := s.persistMessage(r.Context(), msg); err != nil {
			writeError(w, http.StatusInternalServerError, "message persistence failed")
			return
		}
		s.broadcastMessageCreated(msg)
		_ = s.sendKeywordBotReplies(r.Context(), msg)
		writeJSON(w, http.StatusCreated, msg)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) clearConversationMessagesRoute(w http.ResponseWriter, r *http.Request, conversationID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	clearedAt := time.Now()
	s.mu.Lock()
	if s.messageClears == nil {
		s.messageClears = map[string]map[string]time.Time{}
	}
	if s.messageClears[conversationID] == nil {
		s.messageClears[conversationID] = map[string]time.Time{}
	}
	s.messageClears[conversationID][current.ID] = clearedAt
	for i := range s.conversations {
		if s.conversations[i].ID == conversationID {
			s.conversations[i].Unread = 0
			s.conversations[i].LastText = ""
		}
	}
	s.mu.Unlock()
	if err := s.persistConversationClear(r.Context(), conversationID, current.ID, clearedAt); err != nil {
		writeError(w, http.StatusInternalServerError, "conversation clear failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"clearedAt": clearedAt})
}

func (s *Store) searchConversationMessagesRoute(w http.ResponseWriter, r *http.Request, conversationID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if query == "" {
		writeJSON(w, http.StatusOK, []Message{})
		return
	}
	s.mu.RLock()
	messages := append([]Message(nil), s.messages[conversationID]...)
	results := make([]Message, 0)
	clearedAt := s.messageClears[conversationID][current.ID]
	for _, message := range messages {
		if !clearedAt.IsZero() && !message.CreatedAt.After(clearedAt) {
			continue
		}
		if messageMatchesSearch(message, query) {
			results = append(results, s.withReadStatsLocked(message))
		}
	}
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, results)
}

func (s *Store) messageReadReceiptsRoute(w http.ResponseWriter, r *http.Request, conversationID, messageID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	detail, err := s.messageReadDetail(conversationID, messageID, current.ID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "read detail permission required")
			return
		}
		writeError(w, http.StatusInternalServerError, "read detail failed")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Store) messageReadDetail(conversationID, messageID, currentUserID string) (MessageReadDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var target Message
	for _, message := range s.messages[conversationID] {
		if message.ID == messageID {
			target = message
			break
		}
	}
	if target.ID == "" {
		return MessageReadDetail{}, errNotFound
	}
	if target.SenderID != currentUserID {
		return MessageReadDetail{}, errForbidden
	}
	detail := MessageReadDetail{MessageID: target.ID, Read: []MessageReadMember{}, Unread: []MessageReadMember{}}
	if !strings.HasPrefix(conversationID, "group-") {
		return detail, nil
	}
	groupID := strings.TrimPrefix(conversationID, "group-")
	group, ok := s.groups[groupID]
	if !ok {
		return detail, nil
	}
	readAtByUser := s.messageReads[conversationID]
	for _, member := range group.Members {
		if member.UserID == target.SenderID {
			continue
		}
		item := MessageReadMember{UserID: member.UserID, Nickname: member.Nickname}
		if readAt, ok := readAtByUser[member.UserID]; ok && !readAt.Before(target.CreatedAt) {
			readAtCopy := readAt
			item.ReadAt = &readAtCopy
			detail.Read = append(detail.Read, item)
			continue
		}
		detail.Unread = append(detail.Unread, item)
	}
	return detail, nil
}

func (s *Store) readConversationMessages(ctx context.Context, conversationID, userID string) ([]Message, time.Time) {
	now := time.Now()
	s.mu.Lock()
	if s.messageReads == nil {
		s.messageReads = map[string]map[string]time.Time{}
	}
	if s.messageReads[conversationID] == nil {
		s.messageReads[conversationID] = map[string]time.Time{}
	}
	previousReadAt := s.messageReads[conversationID][userID]
	messages := append([]Message(nil), s.messages[conversationID]...)
	if messages == nil {
		messages = []Message{}
	}
	clearedAt := s.messageClears[conversationID][userID]
	if !clearedAt.IsZero() {
		filtered := messages[:0]
		for _, message := range messages {
			if message.CreatedAt.After(clearedAt) {
				filtered = append(filtered, message)
			}
		}
		messages = filtered
	}
	if !previousReadAt.IsZero() {
		filtered := messages[:0]
		for _, message := range messages {
			if message.BurnAfterRead && message.SenderID != userID && !message.CreatedAt.After(previousReadAt) {
				continue
			}
			filtered = append(filtered, message)
		}
		messages = filtered
	}
	s.messageReads[conversationID][userID] = now
	for i := range messages {
		if sender, ok := s.users[messages[i].SenderID]; ok {
			messages[i].SenderName = sender.Nickname
			messages[i].SenderAvatar = sender.Avatar
		}
		messages[i] = s.withReadStatsLocked(messages[i])
	}
	s.mu.Unlock()
	_ = s.persistConversationRead(ctx, conversationID, userID, now)
	return messages, now
}

func messageReadReceiptEvent(conversationID, userID string, readAt time.Time, messages []Message) MessageReadReceiptEvent {
	updates := make([]MessageReadReceiptUpdate, 0, len(messages))
	for _, message := range messages {
		if message.SenderID == userID {
			continue
		}
		updates = append(updates, MessageReadReceiptUpdate{
			MessageID: message.ID,
			ReadCount: message.ReadCount,
			ReadTotal: message.ReadTotal,
		})
	}
	return MessageReadReceiptEvent{
		Type:           "message.read",
		ConversationID: conversationID,
		Payload: MessageReadReceiptPayload{
			UserID:   userID,
			ReadAt:   readAt,
			Messages: updates,
		},
	}
}

func (s *Store) conversationSettingsRoute(w http.ResponseWriter, r *http.Request, conversationID string) {
	if r.Method != http.MethodPatch {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var patch struct {
		Pinned        *bool `json:"pinned"`
		Muted         *bool `json:"muted"`
		Unread        *int  `json:"unread"`
		BurnAfterRead *bool `json:"burnAfterRead"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	current := s.currentUser(r)
	conversationID = s.canonicalConversationIDForUser(r.Context(), conversationID, current.ID)
	conversation, err := s.updateConversationSettings(r.Context(), current.ID, conversationID, patch.Pinned, patch.Muted, patch.Unread, patch.BurnAfterRead)
	if err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "conversation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "conversation update failed")
		return
	}
	writeJSON(w, http.StatusOK, conversation)
}

func (s *Store) deleteConversationRoute(w http.ResponseWriter, r *http.Request, conversationID string) {
	current := s.currentUser(r)
	if err := s.hideConversationFor(r.Context(), current.ID, conversationID); err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "conversation not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "conversation delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func messageMatchesSearch(message Message, query string) bool {
	if strings.Contains(strings.ToLower(message.Body), query) {
		return true
	}
	if strings.Contains(strings.ToLower(message.SenderName), query) {
		return true
	}
	if message.Attachment != nil && strings.Contains(strings.ToLower(message.Attachment.Name), query) {
		return true
	}
	return false
}

func adminMessageAuditDetail(message adminMessageRecord) string {
	summary := strings.TrimSpace(message.Body)
	if summary == "" && message.Attachment != nil {
		summary = message.Attachment.Name
	}
	if summary == "" {
		summary = message.Type
	}
	return fmt.Sprintf("%s in %s by %s", summary, defaultString(message.ConversationTitle, message.ConversationID), defaultString(message.SenderName, message.SenderID))
}

func (s *Store) deleteMessageRoute(w http.ResponseWriter, r *http.Request, conversationID, messageID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	auditDetail := s.deletedMessagesAuditDetail(conversationID, []string{messageID}, "删除 1 条消息")
	if err := s.deleteMessages(r.Context(), conversationID, []string{messageID}, current.ID); err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "delete permission required")
			return
		}
		writeError(w, http.StatusInternalServerError, "message delete failed")
		return
	}
	if groupID := groupIDFromConversationID(conversationID); groupID != "" {
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "messages_deleted", messageID, "", auditDetail))
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": []string{messageID}})
}

func (s *Store) batchDeleteMessagesRoute(w http.ResponseWriter, r *http.Request, conversationID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		MessageIDs []string `json:"messageIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	current := s.currentUser(r)
	count := len(req.MessageIDs)
	auditDetail := s.deletedMessagesAuditDetail(conversationID, req.MessageIDs, fmt.Sprintf("批量删除 %d 条消息", count))
	if err := s.deleteMessages(r.Context(), conversationID, req.MessageIDs, current.ID); err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "message not found")
			return
		}
		if errors.Is(err, errForbidden) {
			writeError(w, http.StatusForbidden, "delete permission required")
			return
		}
		writeError(w, http.StatusInternalServerError, "message delete failed")
		return
	}
	if groupID := groupIDFromConversationID(conversationID); groupID != "" {
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "messages_deleted", fmt.Sprintf("%d messages", count), "", auditDetail))
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": req.MessageIDs})
}

func (s *Store) deletedMessagesAuditDetail(conversationID string, messageIDs []string, prefix string) string {
	targets := map[string]bool{}
	for _, id := range messageIDs {
		if strings.TrimSpace(id) != "" {
			targets[id] = true
		}
	}
	if len(targets) == 0 {
		return prefix
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	summaries := make([]string, 0, len(targets))
	for _, message := range s.messages[conversationID] {
		if !targets[message.ID] {
			continue
		}
		summary := strings.TrimSpace(displayMessage(message))
		if summary == "" {
			summary = "空消息"
		}
		summaries = append(summaries, fmt.Sprintf("%s：%s", defaultString(message.SenderName, message.SenderID), truncateAuditDetail(summary, 32)))
		if len(summaries) >= 3 {
			break
		}
	}
	if len(summaries) == 0 {
		return prefix
	}
	return fmt.Sprintf("%s：%s", prefix, strings.Join(summaries, "；"))
}

func truncateAuditDetail(value string, maxRunes int) string {
	runes := []rune(value)
	if len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes]) + "..."
}

func (s *Store) contactsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	query := strings.ToLower(r.URL.Query().Get("q"))
	current := s.currentUser(r)
	var items []Contact
	if s.pg != nil {
		var err error
		items, err = s.pg.loadContacts(r.Context(), current.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "contact lookup failed")
			return
		}
	} else {
		s.mu.RLock()
		items = make([]Contact, 0, len(s.contacts))
		for _, contact := range s.contacts {
			if s.contactVisibleToUserLocked(contact, current.ID) {
				items = append(items, contact)
			}
		}
		s.mu.RUnlock()
	}
	if query != "" {
		filtered := items[:0]
		for _, c := range items {
			haystack := strings.ToLower(strings.Join(append([]string{c.Nickname, c.ChatID, c.Phoneish(), c.Remark}, c.Tags...), " "))
			if strings.Contains(haystack, query) {
				filtered = append(filtered, c)
			}
		}
		items = filtered
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Store) contactRoute(w http.ResponseWriter, r *http.Request) {
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/contacts/"), "/")
	if id == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	switch r.Method {
	case http.MethodGet:
		current := s.currentUser(r)
		contact, ok, err := s.contactByIDForUser(r.Context(), current.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "contact lookup failed")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "contact not found")
			return
		}
		writeJSON(w, http.StatusOK, contact)
	case http.MethodPatch:
		var patch struct {
			Remark string   `json:"remark"`
			Tags   []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		current := s.currentUser(r)
		contact, err := s.updateContact(r.Context(), current.ID, id, strings.TrimSpace(patch.Remark), patch.Tags)
		if err != nil {
			if errors.Is(err, errNotFound) {
				writeError(w, http.StatusNotFound, "contact not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "contact update failed")
			return
		}
		writeJSON(w, http.StatusOK, contact)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (c Contact) Phoneish() string {
	return strings.ReplaceAll(c.ChatID, "-", "")
}

func (s *Store) friendRequestsRoute(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		current := s.currentUser(r)
		var items []FriendRequest
		if s.pg != nil {
			var err error
			items, err = s.pg.loadFriendRequests(r.Context(), current.ID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "friend request lookup failed")
				return
			}
		} else {
			s.mu.RLock()
			items = make([]FriendRequest, 0, len(s.requests))
			for _, request := range s.requests {
				if s.friendRequestVisibleToUser(request, current.ID) {
					items = append(items, request)
				}
			}
			s.mu.RUnlock()
		}
		s.mu.RLock()
		items = append(items, s.groupInviteInboxItemsLocked(current.ID)...)
		s.mu.RUnlock()
		for i := range items {
			if items[i].Type == "" {
				items[i].Type = "friend"
			}
			if items[i].Direction == "" {
				items[i].Direction = "incoming"
			}
		}
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
		chatID := strings.TrimSpace(req.ChatID)
		if chatID == current.ChatID || chatID == current.Phone || chatID == current.ID {
			writeError(w, http.StatusBadRequest, "cannot add yourself")
			return
		}
		target, err := s.findContactByChatID(r.Context(), chatID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "friend lookup failed")
			return
		}
		if target.ID == "" {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		targetUser, found, err := s.userByID(r.Context(), target.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "friend settings lookup failed")
			return
		}
		if !found {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		targetUser = normalizeUserPreferences(targetUser)
		blocked, err := s.userBlocksContact(r.Context(), target.ID, current.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "blacklist check failed")
			return
		}
		if blocked {
			writeError(w, http.StatusForbidden, "target blocked friend requests")
			return
		}
		if blocked, groupTitle := s.blocksMemberAddFriend(current.ID, target.ID); blocked {
			writeError(w, http.StatusForbidden, "group blocks member friend requests: "+groupTitle)
			return
		}
		s.mu.RLock()
		alreadyContact := false
		for _, contact := range s.contacts {
			if contact.ID == target.ID && s.contactVisibleToUserLocked(contact, current.ID) {
				alreadyContact = true
				break
			}
		}
		duplicatePending := pendingFriendRequestExists(s.requests, current.ID, target.ID)
		s.mu.RUnlock()
		if alreadyContact {
			writeError(w, http.StatusBadRequest, "already friends")
			return
		}
		if duplicatePending {
			writeError(w, http.StatusConflict, "friend request already pending")
			return
		}
		if !targetUser.Settings["friendVerification"] {
			accepted := FriendRequest{
				ID:         newID("fr"),
				User:       current.AsContact(),
				Greeting:   defaultString(req.Greeting, "你好，我想加你为好友"),
				Status:     "accepted",
				Direction:  "incoming",
				CreatedAt:  time.Now(),
				FromUserID: current.ID,
				ToUserID:   target.ID,
			}
			if err := s.createAutomaticFriendship(r.Context(), current, targetUser, accepted); err != nil {
				writeError(w, http.StatusInternalServerError, "friendship creation failed")
				return
			}
			s.hub.Broadcast(friendRequestRealtimeEvent("friend.accepted", accepted, contactPointer(targetUser.AsContact())))
			accepted.User = targetUser.AsContact()
			accepted.Direction = "outgoing"
			writeJSON(w, http.StatusCreated, accepted)
			return
		}
		incoming := FriendRequest{
			ID:         newID("fr"),
			User:       current.AsContact(),
			Greeting:   defaultString(req.Greeting, "你好，我想加你为好友"),
			Status:     "pending",
			Direction:  "incoming",
			CreatedAt:  time.Now(),
			FromUserID: current.ID,
			ToUserID:   target.ID,
		}
		outgoing := incoming
		outgoing.User = target
		outgoing.Direction = "outgoing"
		s.mu.Lock()
		s.requests = append([]FriendRequest{outgoing, incoming}, s.requests...)
		s.mu.Unlock()
		if err := s.persistFriendRequestFor(r.Context(), target.ID, incoming); err != nil {
			writeError(w, http.StatusInternalServerError, "friend request persistence failed")
			return
		}
		s.hub.Broadcast(friendRequestRealtimeEvent("friend.requested", incoming, nil))
		writeJSON(w, http.StatusCreated, outgoing)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func contactPointer(contact Contact) *Contact {
	return &contact
}

func (s *Store) createAutomaticFriendship(ctx context.Context, from, target User, accepted FriendRequest) error {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		outgoing := accepted
		outgoing.User = target.AsContact()
		outgoing.Direction = "outgoing"
		s.requests = append([]FriendRequest{outgoing, accepted}, s.requests...)
		if !contactExists(s.contacts, target.ID) {
			s.contacts = append(s.contacts, target.AsContact())
		}
		if !contactExists(s.contacts, from.ID) {
			s.contacts = append(s.contacts, from.AsContact())
		}
		s.ensureAcceptedFriendConversationLocked(from.ID, target.AsContact())
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := upsertFriendRequest(ctx, tx, target.ID, accepted); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO contacts(owner_user_id, contact_user_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`, from.ID, target.ID); err != nil {
		return err
	}
	conversationID := canonicalPrivateConversationID(from.ID, target.ID)
	if conversationID != "" {
		if _, err := tx.Exec(ctx, `INSERT INTO conversations(id, kind, title, avatar_url, unread, last_text, last_at)
			VALUES ($1, 'session', $2, $3, 0, '你们已是好友，可以开始聊天了!', now())
			ON CONFLICT (id) DO NOTHING`, conversationID, target.Nickname, target.Avatar); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
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
	reviewer := current.AsContact()
	eventType := "friend.rejected"
	if req.Status == "accepted" {
		eventType = "friend.accepted"
	}
	s.hub.Broadcast(friendRequestRealtimeEvent(eventType, updated, &reviewer))
	writeJSON(w, http.StatusOK, updated)
}

func contactExists(contacts []Contact, userID string) bool {
	for _, contact := range contacts {
		if contact.ID == userID {
			return true
		}
	}
	return false
}

func pendingFriendRequestExists(requests []FriendRequest, fromUserID, targetUserID string) bool {
	for _, request := range requests {
		if request.Status != "pending" {
			continue
		}
		if request.Direction == "outgoing" && request.FromUserID == fromUserID && request.User.ID == targetUserID {
			return true
		}
		if request.Direction == "incoming" && request.FromUserID == fromUserID && request.ToUserID == targetUserID {
			return true
		}
	}
	return false
}

func (s *Store) groupInviteInboxItemsLocked(userID string) []FriendRequest {
	items := make([]FriendRequest, 0)
	for _, request := range s.joinRequests {
		if request.Inviter == nil || request.Inviter.ID == "" {
			continue
		}
		group, ok := s.groups[request.GroupID]
		if !ok {
			continue
		}
		if request.User.ID == userID {
			items = append(items, FriendRequest{
				ID:          request.ID,
				Type:        "group-invite",
				User:        *request.Inviter,
				Greeting:    request.Greeting,
				Status:      request.Status,
				Direction:   "incoming",
				GroupID:     request.GroupID,
				GroupTitle:  group.Title,
				GroupChatID: group.ChatID,
				CreatedAt:   request.CreatedAt,
				FromUserID:  request.Inviter.ID,
				ToUserID:    request.User.ID,
			})
		}
		if request.Inviter.ID == userID {
			items = append(items, FriendRequest{
				ID:          request.ID,
				Type:        "group-invite",
				User:        request.User,
				Greeting:    request.Greeting,
				Status:      request.Status,
				Direction:   "outgoing",
				GroupID:     request.GroupID,
				GroupTitle:  group.Title,
				GroupChatID: group.ChatID,
				CreatedAt:   request.CreatedAt,
				FromUserID:  request.Inviter.ID,
				ToUserID:    request.User.ID,
			})
		}
	}
	return items
}

func (s *Store) groupsRoute(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		current := s.currentUser(r)
		s.mu.RLock()
		groups := make([]Group, 0, len(s.groups))
		for _, g := range s.groups {
			if groupHasUser(g, current.ID) {
				groups = append(groups, g)
			}
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
		chatID, err := s.uniqueGroupChatID(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "group id generation failed")
			return
		}
		group := Group{
			ID:          gid,
			OwnerUserID: current.ID,
			Title:       defaultString(req.Title, "新的群聊"),
			Avatar:      avatar("群"),
			ChatID:      chatID,
			JoinMode:    "public_qr",
			MyNickname:  current.Nickname,
			CreatedAt:   time.Now(),
			Members:     []Member{{UserID: current.ID, Nickname: current.Nickname, Role: "owner"}},
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
		for _, id := range req.MemberIDs {
			target, found, err := s.resolveUserForGroupInvite(r.Context(), id, "")
			if err != nil {
				writeError(w, http.StatusInternalServerError, "member lookup failed")
				return
			}
			if !found {
				continue
			}
			target = normalizeUserPreferences(target)
			if target.Settings["inviteGroupVerification"] {
				if _, err := s.createGroupInviteRequest(r.Context(), gid, current, target, fmt.Sprintf("%s 邀请你加入群聊", current.Nickname)); err != nil {
					writeError(w, http.StatusInternalServerError, "group invite request failed")
					return
				}
				continue
			}
			if _, err := s.addGroupMember(r.Context(), gid, target.ID, "", "member"); err != nil {
				writeError(w, http.StatusInternalServerError, "member add failed")
				return
			}
		}
		if updated, ok := s.groupForRead(gid); ok {
			group = updated
		}
		s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": convID, "payload": group})
		writeJSON(w, http.StatusCreated, group)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) discoverGroupsRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	s.mu.RLock()
	groups := make([]Group, 0, len(s.discoverGroups)+len(s.groups))
	seen := map[string]bool{}
	for _, group := range s.groups {
		groups = append(groups, group)
		seen[group.ID] = true
	}
	for _, group := range s.discoverGroups {
		if !seen[group.ID] {
			groups = append(groups, group)
		}
	}
	s.mu.RUnlock()
	sort.SliceStable(groups, func(i, j int) bool {
		return groups[i].CreatedAt.After(groups[j].CreatedAt)
	})
	writeJSON(w, http.StatusOK, groups)
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
	if len(parts) >= 2 && parts[1] == "join-requests" {
		s.groupJoinRequestsRoute(w, r, id, parts)
		return
	}
	if len(parts) >= 2 && parts[1] == "blacklist" {
		s.groupBlacklistRoute(w, r, id, parts)
		return
	}
	if len(parts) >= 2 && parts[1] == "bots" {
		s.groupBotsRoute(w, r, id, parts)
		return
	}
	if len(parts) == 3 && parts[1] == "qrcode" && parts[2] == "refresh" {
		s.refreshGroupQRCodeRoute(w, r, id)
		return
	}
	if len(parts) == 2 && parts[1] == "audit-logs" {
		s.groupAuditLogsRoute(w, r, id)
		return
	}
	if len(parts) == 2 && parts[1] == "transfer-owner" {
		s.transferGroupOwnerRoute(w, r, id)
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		s.dissolveGroupRoute(w, r, id)
		return
	}
	if len(parts) == 1 && r.Method == http.MethodGet {
		group, ok := s.groupForRead(id)
		if !ok {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeJSON(w, http.StatusOK, group)
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
	group, ok := s.groups[id]
	s.mu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "group not found")
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var patch struct {
			Title                  *string         `json:"title"`
			Announcement           *string         `json:"announcement"`
			MyNickname             *string         `json:"myNickname"`
			JoinMode               *string         `json:"joinMode"`
			DisableMemberAddFriend *bool           `json:"disableMemberAddFriend"`
			AllMuted               *bool           `json:"allMuted"`
			RateLimit              *GroupRateLimit `json:"rateLimit"`
			AutoMuteNewMembers     *bool           `json:"autoMuteNewMembers"`
		}
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		role := groupRoleFor(group, current.ID)
		managementPatch := patch.Title != nil || patch.Announcement != nil || patch.JoinMode != nil || patch.DisableMemberAddFriend != nil || patch.AllMuted != nil || patch.RateLimit != nil || patch.AutoMuteNewMembers != nil
		if managementPatch && !canManageGroupRole(role) {
			writeError(w, http.StatusForbidden, "admin permission required")
			return
		}
		if patch.Title != nil {
			v := strings.TrimSpace(*patch.Title)
			if v == "" {
				writeError(w, http.StatusBadRequest, "title required")
				return
			}
			group.Title = v
		}
		if patch.Announcement != nil {
			group.Announcement = strings.TrimSpace(*patch.Announcement)
		}
		if patch.MyNickname != nil {
			group.MyNickname = strings.TrimSpace(*patch.MyNickname)
			for i := range group.Members {
				if group.Members[i].UserID == current.ID {
					group.Members[i].Nickname = group.MyNickname
				}
			}
		}
		if patch.JoinMode != nil {
			group.JoinMode = strings.TrimSpace(*patch.JoinMode)
		}
		if patch.DisableMemberAddFriend != nil {
			group.DisableMemberAddFriend = *patch.DisableMemberAddFriend
		}
		if patch.AllMuted != nil {
			group.AllMuted = *patch.AllMuted
		}
		if patch.RateLimit != nil {
			group.RateLimit = normalizeGroupRateLimit(patch.RateLimit)
		}
		if patch.AutoMuteNewMembers != nil {
			group.AutoMuteNewMembers = *patch.AutoMuteNewMembers
		}
		s.mu.Lock()
		s.groups[id] = group
		s.mu.Unlock()
		if err := s.persistGroupFor(r.Context(), current.ID, group, "group-"+group.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "group update failed")
			return
		}
		if patch.RateLimit != nil {
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(group.ID, current, "rate_limit_updated", group.ID, group.Title, groupRateLimitAuditDetail(group.RateLimit)))
		}
		if patch.AutoMuteNewMembers != nil {
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(group.ID, current, "auto_mute_new_members_updated", group.ID, group.Title, autoMuteNewMembersAuditDetail(group.AutoMuteNewMembers)))
		}
		if managementPatch {
			s.hub.Broadcast(map[string]any{
				"type":           "group.updated",
				"conversationId": "group-" + group.ID,
				"payload": map[string]any{
					"id":                     group.ID,
					"title":                  group.Title,
					"announcement":           group.Announcement,
					"joinMode":               group.JoinMode,
					"disableMemberAddFriend": group.DisableMemberAddFriend,
					"allMuted":               group.AllMuted,
					"rateLimit":              group.RateLimit,
					"autoMuteNewMembers":     group.AutoMuteNewMembers,
				},
			})
		}
		writeJSON(w, http.StatusOK, group)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) dissolveGroupRoute(w http.ResponseWriter, r *http.Request, groupID string) {
	current := s.currentUser(r)
	if !s.isGroupOwner(groupID, current.ID) {
		writeError(w, http.StatusForbidden, "owner permission required")
		return
	}
	if err := s.dissolveGroup(r.Context(), groupID); err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "group dissolve failed")
		return
	}
	s.hub.Broadcast(map[string]any{"type": "group.dissolved", "conversationId": "group-" + groupID, "payload": map[string]any{"groupId": groupID}})
	writeJSON(w, http.StatusOK, map[string]any{"deleted": groupID})
}

func (s *Store) refreshGroupQRCodeRoute(w http.ResponseWriter, r *http.Request, groupID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		ExpiryMode string `json:"expiryMode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	current := s.currentUser(r)
	if !s.canManageGroup(groupID, current.ID) {
		writeError(w, http.StatusForbidden, "admin permission required")
		return
	}
	group, err := s.refreshGroupQRCode(r.Context(), groupID, current.ID, req.ExpiryMode)
	if err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		if errors.Is(err, errInvalidStatus) {
			writeError(w, http.StatusBadRequest, "invalid qr expiry mode")
			return
		}
		writeError(w, http.StatusInternalServerError, "qr code refresh failed")
		return
	}
	_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "qrcode_refreshed", groupID, group.Title, "刷新群二维码"))
	writeJSON(w, http.StatusOK, group)
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
		current := s.currentUser(r)
		if !s.canManageGroup(groupID, current.ID) {
			writeError(w, http.StatusForbidden, "admin permission required")
			return
		}
		var req struct {
			UserID string `json:"userId"`
			ChatID string `json:"chatId"`
			Role   string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if s.isGroupBlacklisted(groupID, strings.TrimSpace(req.UserID), strings.TrimSpace(req.ChatID)) {
			writeError(w, http.StatusForbidden, "group blacklist blocks invite")
			return
		}
		role := defaultString(req.Role, "member")
		target, found, err := s.resolveUserForGroupInvite(r.Context(), req.UserID, req.ChatID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "member lookup failed")
			return
		}
		if !found {
			writeError(w, http.StatusNotFound, "group or user not found")
			return
		}
		group, ok := s.groupForRead(groupID)
		if !ok {
			writeError(w, http.StatusNotFound, "group or user not found")
			return
		}
		target = normalizeUserPreferences(target)
		if role == "member" && !groupHasUser(group, target.ID) && target.Settings["inviteGroupVerification"] {
			request, err := s.createGroupInviteRequest(r.Context(), groupID, current, target, fmt.Sprintf("%s 邀请你加入群聊", current.Nickname))
			if err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "group or user not found")
					return
				}
				writeError(w, http.StatusInternalServerError, "group invite request failed")
				return
			}
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "member_invited", target.ID, target.Nickname, fmt.Sprintf("%s 邀请 %s 入群，等待对方验证", current.Nickname, target.Nickname)))
			s.hub.Broadcast(map[string]any{"type": "group.join.requested", "conversationId": "group-" + groupID, "payload": request})
			writeJSON(w, http.StatusAccepted, request)
			return
		}
		member, err := s.addGroupMember(r.Context(), groupID, target.ID, "", role)
		if err != nil {
			if errors.Is(err, errNotFound) {
				writeError(w, http.StatusNotFound, "group or user not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "member add failed")
			return
		}
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "member_invited", member.UserID, member.Nickname, fmt.Sprintf("%s 邀请 %s 入群", current.Nickname, member.Nickname)))
		_ = s.appendGroupSystemMessage(r.Context(), groupID, fmt.Sprintf("%s 已加入群聊", member.Nickname))
		s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": "group-" + groupID, "payload": member})
		writeJSON(w, http.StatusCreated, member)
		return
	}
	if len(parts) == 3 && (r.Method == http.MethodPatch || r.Method == http.MethodDelete) {
		current := s.currentUser(r)
		userID := parts[2]
		if r.Method == http.MethodDelete {
			isSelfLeave := userID == current.ID
			if !isSelfLeave && !s.canManageGroup(groupID, current.ID) {
				writeError(w, http.StatusForbidden, "admin permission required")
				return
			}
			if targetRole := s.groupMemberRole(groupID, userID); !isSelfLeave && !s.isGroupOwner(groupID, current.ID) && targetRole != "" && targetRole != "member" {
				writeError(w, http.StatusForbidden, "owner permission required")
				return
			}
			targetName := s.groupMemberName(groupID, userID)
			if err := s.removeGroupMember(r.Context(), groupID, userID); err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "member not found")
					return
				}
				if strings.Contains(err.Error(), "cannot remove owner") {
					writeError(w, http.StatusForbidden, "owner cannot leave before transfer")
					return
				}
				writeError(w, http.StatusInternalServerError, "member remove failed")
				return
			}
			action := "member_removed"
			detail := "移除群成员"
			if isSelfLeave {
				action = "member_left"
				detail = "成员主动退出群聊"
			}
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, action, userID, targetName, detail))
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
		if req.Role != "" && !s.isGroupOwner(groupID, current.ID) {
			writeError(w, http.StatusForbidden, "owner permission required")
			return
		}
		if req.Role != "" && !validMutableGroupRole(req.Role) {
			writeError(w, http.StatusBadRequest, "invalid role")
			return
		}
		if req.Muted != nil && !s.canManageGroup(groupID, current.ID) {
			writeError(w, http.StatusForbidden, "admin permission required")
			return
		}
		if targetRole := s.groupMemberRole(groupID, userID); req.Muted != nil && !s.isGroupOwner(groupID, current.ID) && targetRole != "" && targetRole != "member" {
			writeError(w, http.StatusForbidden, "owner permission required")
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
		if req.Role != "" {
			action := "admin_added"
			detail := "设置管理员"
			if req.Role == "member" {
				action = "admin_removed"
				detail = "移除管理员"
			}
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, action, member.UserID, member.Nickname, detail))
		}
		if req.Muted != nil {
			action := "member_unmuted"
			detail := "解除成员禁言"
			if *req.Muted {
				action = "member_muted"
				detail = "禁言成员"
			}
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, action, member.UserID, member.Nickname, detail))
		}
		s.hub.Broadcast(map[string]any{"type": "group.member.updated", "conversationId": "group-" + groupID, "payload": member})
		writeJSON(w, http.StatusOK, member)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Store) groupJoinRequestsRoute(w http.ResponseWriter, r *http.Request, groupID string, parts []string) {
	current := s.currentUser(r)
	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			canManage := s.canManageGroup(groupID, current.ID)
			s.mu.RLock()
			items := make([]GroupJoinRequest, 0)
			for _, request := range s.joinRequests {
				if request.GroupID == groupID && (canManage || request.User.ID == current.ID) {
					items = append(items, request)
				}
			}
			s.mu.RUnlock()
			writeJSON(w, http.StatusOK, items)
		case http.MethodPost:
			var req struct {
				Greeting string `json:"greeting"`
				JoinCode string `json:"joinCode"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid json")
				return
			}
			joinRequest, err := s.createGroupJoinRequest(r.Context(), groupID, current, req.Greeting, req.JoinCode)
			if err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "group not found")
					return
				}
				if errors.Is(err, errInvalidTarget) {
					writeError(w, http.StatusBadRequest, "invalid join code")
					return
				}
				if errors.Is(err, errGroupJoinClosed) {
					writeError(w, http.StatusForbidden, "group is closed")
					return
				}
				if errors.Is(err, errGroupBlacklisted) {
					writeError(w, http.StatusForbidden, "group blacklist blocks join")
					return
				}
				writeError(w, http.StatusInternalServerError, "join request failed")
				return
			}
			s.hub.Broadcast(map[string]any{"type": "group.join.requested", "conversationId": "group-" + groupID, "payload": joinRequest})
			writeJSON(w, http.StatusCreated, joinRequest)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	if len(parts) == 3 && r.Method == http.MethodPatch {
		canManage := s.canManageGroup(groupID, current.ID)
		canReviewOwnInvite := false
		s.mu.RLock()
		for _, request := range s.joinRequests {
			if request.GroupID == groupID && request.ID == parts[2] && request.Inviter != nil && request.User.ID == current.ID {
				canReviewOwnInvite = true
				break
			}
		}
		s.mu.RUnlock()
		if !canManage && !canReviewOwnInvite {
			writeError(w, http.StatusForbidden, "admin permission required")
			return
		}
		var req struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		updated, err := s.updateGroupJoinRequest(r.Context(), groupID, parts[2], req.Status)
		if err != nil {
			if errors.Is(err, errNotFound) {
				writeError(w, http.StatusNotFound, "join request not found")
				return
			}
			if errors.Is(err, errInvalidStatus) {
				writeError(w, http.StatusBadRequest, "invalid status")
				return
			}
			if errors.Is(err, errGroupBlacklisted) {
				writeError(w, http.StatusForbidden, "group blacklist blocks join")
				return
			}
			writeError(w, http.StatusInternalServerError, "join request update failed")
			return
		}
		action := "join_rejected"
		detail := "拒绝入群申请"
		if updated.Status == "accepted" {
			action = "join_accepted"
			detail = "同意入群申请"
			_ = s.appendGroupSystemMessage(r.Context(), groupID, fmt.Sprintf("%s 已加入群聊", updated.User.Nickname))
		}
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, action, updated.User.ID, updated.User.Nickname, detail))
		s.hub.Broadcast(map[string]any{"type": "group.join.reviewed", "conversationId": "group-" + groupID, "payload": updated})
		writeJSON(w, http.StatusOK, updated)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Store) groupBlacklistRoute(w http.ResponseWriter, r *http.Request, groupID string, parts []string) {
	current := s.currentUser(r)
	if !s.canManageGroup(groupID, current.ID) {
		writeError(w, http.StatusForbidden, "admin permission required")
		return
	}
	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, s.groupBlacklist(groupID))
		case http.MethodPost:
			var req struct {
				UserID string `json:"userId"`
				ChatID string `json:"chatId"`
				Reason string `json:"reason"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid json")
				return
			}
			entry, err := s.addGroupBlacklistEntry(r.Context(), groupID, current.ID, strings.TrimSpace(req.UserID), strings.TrimSpace(req.ChatID), strings.TrimSpace(req.Reason))
			if err != nil {
				if errors.Is(err, errNotFound) {
					writeError(w, http.StatusNotFound, "group or user not found")
					return
				}
				if errors.Is(err, errForbidden) {
					writeError(w, http.StatusForbidden, "blacklist permission denied")
					return
				}
				if errors.Is(err, errInvalidTarget) {
					writeError(w, http.StatusBadRequest, "invalid blacklist target")
					return
				}
				writeError(w, http.StatusInternalServerError, "blacklist add failed")
				return
			}
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "member_blacklisted", entry.User.ID, entry.User.Nickname, defaultString(entry.Reason, "加入群黑名单")))
			s.hub.Broadcast(map[string]any{"type": "group.blacklist.updated", "conversationId": "group-" + groupID, "payload": entry})
			writeJSON(w, http.StatusCreated, entry)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	if len(parts) == 3 && r.Method == http.MethodDelete {
		userID := parts[2]
		entry, err := s.removeGroupBlacklistEntry(r.Context(), groupID, userID)
		if err != nil {
			if errors.Is(err, errNotFound) {
				writeError(w, http.StatusNotFound, "blacklist entry not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "blacklist remove failed")
			return
		}
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "member_unblacklisted", entry.User.ID, entry.User.Nickname, "移出群黑名单"))
		s.hub.Broadcast(map[string]any{"type": "group.blacklist.updated", "conversationId": "group-" + groupID, "payload": map[string]any{"removed": userID}})
		writeJSON(w, http.StatusOK, map[string]any{"removed": userID})
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Store) groupBotsRoute(w http.ResponseWriter, r *http.Request, groupID string, parts []string) {
	current := s.currentUser(r)
	if !s.canManageGroup(groupID, current.ID) {
		writeError(w, http.StatusForbidden, "admin permission required")
		return
	}
	if len(parts) == 2 && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, s.groupBotsFor(groupID))
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost {
		var req struct {
			Name            string           `json:"name"`
			Message         string           `json:"message"`
			KeywordRules    []BotKeywordRule `json:"keywordRules"`
			ScheduleMode    string           `json:"scheduleMode"`
			IntervalSeconds int              `json:"intervalSeconds"`
			DailyTime       string           `json:"dailyTime"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		bot := normalizeGroupBot(GroupBot{
			GroupID:         groupID,
			ID:              newID("bot"),
			Name:            defaultString(req.Name, "公告机器人"),
			Enabled:         false,
			Message:         defaultString(req.Message, "欢迎来到群聊，请留意群公告。"),
			KeywordRules:    normalizeBotKeywordRules(req.KeywordRules),
			ScheduleMode:    req.ScheduleMode,
			IntervalSeconds: req.IntervalSeconds,
			DailyTime:       req.DailyTime,
		}, time.Now())
		if err := s.upsertGroupBot(r.Context(), groupID, bot); err != nil {
			writeError(w, http.StatusInternalServerError, "bot create failed")
			return
		}
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_created", bot.ID, bot.Name, "新增群机器人"))
		writeJSON(w, http.StatusCreated, bot)
		return
	}
	if len(parts) == 4 && parts[3] == "run" && r.Method == http.MethodPost {
		var req struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		bot := s.groupBotByID(groupID, parts[2])
		if bot.ID == "" {
			writeError(w, http.StatusNotFound, "bot not found")
			return
		}
		if strings.TrimSpace(req.Message) != "" {
			bot.Message = strings.TrimSpace(req.Message)
		}
		if bot.Message == "" {
			writeError(w, http.StatusBadRequest, "message required")
			return
		}
		msg, err := s.sendGroupBotMessage(r.Context(), bot, time.Now())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "bot send failed")
			return
		}
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_test_sent", bot.ID, bot.Name, "立即测试发送机器人消息"))
		writeJSON(w, http.StatusCreated, msg)
		return
	}
	if len(parts) == 3 && r.Method == http.MethodPatch {
		var req struct {
			Name            *string          `json:"name"`
			Enabled         *bool            `json:"enabled"`
			Message         *string          `json:"message"`
			KeywordRules    []BotKeywordRule `json:"keywordRules"`
			ScheduleMode    *string          `json:"scheduleMode"`
			IntervalSeconds *int             `json:"intervalSeconds"`
			DailyTime       *string          `json:"dailyTime"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		bot := s.groupBotByID(groupID, parts[2])
		if bot.ID == "" {
			writeError(w, http.StatusNotFound, "bot not found")
			return
		}
		wasEnabled := bot.Enabled
		oldName := bot.Name
		oldMessage := bot.Message
		oldKeywordRules := keywordRulesKey(bot.KeywordRules)
		oldInterval := bot.IntervalSeconds
		oldScheduleMode := bot.ScheduleMode
		oldDailyTime := bot.DailyTime
		if req.Name != nil {
			bot.Name = strings.TrimSpace(*req.Name)
			if bot.Name == "" {
				writeError(w, http.StatusBadRequest, "bot name required")
				return
			}
		}
		if req.Enabled != nil {
			bot.Enabled = *req.Enabled
		}
		if req.Message != nil {
			bot.Message = strings.TrimSpace(*req.Message)
		}
		if req.KeywordRules != nil {
			bot.KeywordRules = normalizeBotKeywordRules(req.KeywordRules)
		}
		if req.ScheduleMode != nil {
			bot.ScheduleMode = normalizeGroupBotScheduleMode(*req.ScheduleMode)
		}
		if req.IntervalSeconds != nil {
			bot.IntervalSeconds = normalizeGroupBotInterval(*req.IntervalSeconds)
		}
		if req.DailyTime != nil {
			bot.DailyTime = normalizeDailyTime(*req.DailyTime)
			if bot.DailyTime == "" && bot.ScheduleMode == "daily" {
				writeError(w, http.StatusBadRequest, "daily time required")
				return
			}
		}
		bot = normalizeGroupBot(bot, time.Now())
		if bot.Message == "" {
			writeError(w, http.StatusBadRequest, "message required")
			return
		}
		planChanged := bot.IntervalSeconds != oldInterval || bot.ScheduleMode != oldScheduleMode || bot.DailyTime != oldDailyTime
		if planChanged || (bot.Enabled && !wasEnabled) {
			bot.NextRunAt = nextGroupBotRunAt(bot, time.Now())
		}
		if err := s.upsertGroupBot(r.Context(), groupID, bot); err != nil {
			writeError(w, http.StatusInternalServerError, "bot update failed")
			return
		}
		if req.Enabled != nil && bot.Enabled != wasEnabled && bot.Enabled {
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_enabled", bot.ID, bot.Name, "启用群机器人"))
		} else if req.Enabled != nil && bot.Enabled != wasEnabled && !bot.Enabled {
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_disabled", bot.ID, bot.Name, "停用群机器人"))
		}
		if keywordRulesKey(bot.KeywordRules) != oldKeywordRules {
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_keyword_rules_updated", bot.ID, bot.Name, "更新机器人关键词回复"))
		} else if bot.Name != oldName || bot.Message != oldMessage || planChanged {
			_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_plan_updated", bot.ID, bot.Name, "更新机器人自动发送计划"))
		}
		writeJSON(w, http.StatusOK, bot)
		return
	}
	if len(parts) == 3 && r.Method == http.MethodDelete {
		bot := s.groupBotByID(groupID, parts[2])
		if bot.ID == "" {
			writeError(w, http.StatusNotFound, "bot not found")
			return
		}
		if bot.ID == "announcement" {
			writeError(w, http.StatusForbidden, "default bot cannot be deleted")
			return
		}
		if err := s.deleteGroupBot(r.Context(), groupID, bot.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "bot delete failed")
			return
		}
		_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "bot_deleted", bot.ID, bot.Name, "删除群机器人"))
		writeJSON(w, http.StatusOK, map[string]any{"deleted": bot.ID})
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Store) transferGroupOwnerRoute(w http.ResponseWriter, r *http.Request, groupID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	if !s.isGroupOwner(groupID, current.ID) {
		writeError(w, http.StatusForbidden, "owner permission required")
		return
	}
	var req struct {
		UserID string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	group, err := s.transferGroupOwner(r.Context(), groupID, current.ID, strings.TrimSpace(req.UserID))
	if err != nil {
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusNotFound, "group not found")
			return
		}
		if errors.Is(err, errInvalidTarget) {
			writeError(w, http.StatusBadRequest, "invalid transfer target")
			return
		}
		writeError(w, http.StatusInternalServerError, "owner transfer failed")
		return
	}
	_ = s.appendAuditLog(r.Context(), s.newAuditLog(groupID, current, "owner_transferred", req.UserID, s.groupMemberName(groupID, req.UserID), "转让群主"))
	s.hub.Broadcast(map[string]any{"type": "group.owner.transferred", "conversationId": "group-" + groupID, "payload": group})
	writeJSON(w, http.StatusOK, group)
}

func (s *Store) groupAuditLogsRoute(w http.ResponseWriter, r *http.Request, groupID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	current := s.currentUser(r)
	if !s.canManageGroup(groupID, current.ID) {
		writeError(w, http.StatusForbidden, "admin permission required")
		return
	}
	s.mu.RLock()
	logs := make([]AuditLog, 0)
	for _, log := range s.auditLogs {
		if log.GroupID == groupID {
			logs = append(logs, log)
		}
	}
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, logs)
}

func (s *Store) canManageGroup(groupID, userID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	group, ok := s.groups[groupID]
	if !ok {
		return false
	}
	if group.OwnerUserID != "" && group.OwnerUserID == userID {
		return true
	}
	return canManageGroupRole(groupRoleFor(group, userID))
}

func (s *Store) groupForRead(groupID string) (Group, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if group, ok := s.groups[groupID]; ok {
		return group, true
	}
	for _, group := range s.discoverGroups {
		if group.ID == groupID {
			return group, true
		}
	}
	return Group{}, false
}

func (s *Store) isGroupOwner(groupID, userID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	group, ok := s.groups[groupID]
	if !ok {
		return false
	}
	if group.OwnerUserID != "" {
		return group.OwnerUserID == userID
	}
	return groupRoleFor(group, userID) == "owner"
}

func (s *Store) blocksMemberAddFriend(currentUserID, targetUserID string) (bool, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, group := range s.groups {
		if !group.DisableMemberAddFriend {
			continue
		}
		hasCurrent := false
		hasTarget := false
		for _, member := range group.Members {
			if member.UserID == currentUserID {
				hasCurrent = true
			}
			if member.UserID == targetUserID {
				hasTarget = true
			}
		}
		if hasCurrent && hasTarget {
			return true, group.Title
		}
	}
	return false, ""
}

func (s *Store) blocksGroupMessage(conversationID, userID string) (bool, string) {
	if !strings.HasPrefix(conversationID, "group-") {
		return false, ""
	}
	groupID := strings.TrimPrefix(conversationID, "group-")
	s.mu.RLock()
	defer s.mu.RUnlock()
	group, ok := s.groups[groupID]
	if !ok {
		return false, ""
	}
	role := ""
	muted := false
	for _, member := range group.Members {
		if member.UserID == userID {
			role = member.Role
			muted = member.Muted
			break
		}
	}
	if role == "" {
		return true, "group member required"
	}
	if muted {
		return true, "member is muted"
	}
	if group.AllMuted && !canManageGroupRole(role) {
		return true, "group is all muted"
	}
	if groupRateLimitExceeded(group.RateLimit, role, s.messages[conversationID], userID, time.Now()) {
		return true, "group rate limit exceeded"
	}
	return false, ""
}

func (s *Store) blocksPrivateMessage(ctx context.Context, conversationID, senderID string) (bool, error) {
	targetID, ok := privateConversationTargetID(conversationID, senderID)
	if !ok {
		return false, nil
	}
	return s.userBlocksContact(ctx, targetID, senderID)
}

func privateConversationTargetID(conversationID, senderID string) (string, bool) {
	if !strings.HasPrefix(conversationID, "session-") {
		return "", false
	}
	if a, b, ok := privateConversationParticipants(conversationID); ok {
		if senderID == a {
			return b, true
		}
		if senderID == b {
			return a, true
		}
		return "", false
	}
	targetID := strings.TrimPrefix(conversationID, "session-")
	if targetID == "" || targetID == senderID {
		return "", false
	}
	return targetID, true
}

func canonicalPrivateConversationID(userID, contactID string) string {
	if userID == "" || contactID == "" {
		return ""
	}
	if userID < contactID {
		return "session-" + userID + "--" + contactID
	}
	return "session-" + contactID + "--" + userID
}

func privateConversationParticipants(conversationID string) (string, string, bool) {
	if !strings.HasPrefix(conversationID, "session-") {
		return "", "", false
	}
	parts := strings.Split(strings.TrimPrefix(conversationID, "session-"), "--")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func (s *Store) canonicalConversationIDForUser(ctx context.Context, conversationID, userID string) string {
	targetID, ok := privateConversationTargetID(conversationID, userID)
	if !ok {
		return conversationID
	}
	if _, found, err := s.contactByIDForUser(ctx, userID, targetID); err != nil || !found {
		return conversationID
	}
	if canonical := canonicalPrivateConversationID(userID, targetID); canonical != "" {
		return canonical
	}
	return conversationID
}

func (s *Store) privateConversationContact(ctx context.Context, conversationID, senderID string) (Contact, bool, error) {
	targetID, ok := privateConversationTargetID(conversationID, senderID)
	if !ok {
		return Contact{}, false, nil
	}
	contact, found, err := s.contactByIDForUser(ctx, senderID, targetID)
	if err != nil || !found {
		return Contact{}, true, err
	}
	return contact, true, nil
}

func (s *Store) conversationForUserLocked(conversation Conversation, userID string) Conversation {
	conversation.MentionedMe = s.conversationMentionsUserLocked(conversation.ID, userID)
	conversation.BurnAfterRead = s.conversationBurnEnabledLocked(conversation.ID, userID)
	if conversation.Kind != "session" {
		return conversation
	}
	targetID, ok := privateConversationTargetID(conversation.ID, userID)
	if !ok {
		return conversation
	}
	for _, contact := range s.contacts {
		if contact.ID == targetID {
			conversation.Title = contact.Nickname
			conversation.Avatar = contact.Avatar
			return conversation
		}
	}
	if user, ok := s.users[targetID]; ok {
		conversation.Title = user.Nickname
		conversation.Avatar = user.Avatar
	}
	return conversation
}

func (s *Store) conversationBurnEnabledLocked(conversationID, userID string) bool {
	return s.conversationBurns != nil && s.conversationBurns[conversationID] != nil && s.conversationBurns[conversationID][userID]
}

func (s *Store) conversationMentionsUserLocked(conversationID, userID string) bool {
	if userID == "" {
		return false
	}
	readAt := time.Time{}
	if s.messageReads != nil && s.messageReads[conversationID] != nil {
		readAt = s.messageReads[conversationID][userID]
	}
	for _, message := range s.messages[conversationID] {
		if message.SenderID == userID || !hasString(message.Mentions, userID) {
			continue
		}
		if readAt.IsZero() || message.CreatedAt.After(readAt) {
			return true
		}
	}
	return false
}

func (s *Store) ensurePrivateConversationLocked(conversationID string, contact Contact, msg Message) {
	for i := range s.conversations {
		if s.conversations[i].ID == conversationID {
			return
		}
	}
	s.conversations = append(s.conversations, Conversation{
		ID:       conversationID,
		Kind:     "session",
		Title:    contact.Nickname,
		Avatar:   contact.Avatar,
		LastText: displayMessage(msg),
		LastAt:   msg.CreatedAt,
	})
}

func (s *Store) ensureAcceptedFriendConversationLocked(currentUserID string, contact Contact) {
	conversationID := canonicalPrivateConversationID(currentUserID, contact.ID)
	if conversationID == "" {
		return
	}
	for i := range s.conversations {
		if s.conversations[i].ID == conversationID {
			return
		}
	}
	s.conversations = append([]Conversation{{
		ID:       conversationID,
		Kind:     "session",
		Title:    contact.Nickname,
		Avatar:   contact.Avatar,
		LastText: "你们已是好友，可以开始聊天了!",
		LastAt:   time.Now(),
	}}, s.conversations...)
}

func (s *Store) userBlocksContact(ctx context.Context, userID, contactID string) (bool, error) {
	user, ok, err := s.userByID(ctx, userID)
	if err != nil || !ok {
		return false, err
	}
	return hasString(user.BlockedContactIDs, contactID), nil
}

func (s *Store) withReadStatsLocked(message Message) Message {
	readAtByUser := s.messageReads[message.ConversationID]
	total := s.readReceiptTotalLocked(message.ConversationID, message.SenderID)
	count := 0
	for userID, readAt := range readAtByUser {
		if userID == message.SenderID {
			continue
		}
		if !readAt.Before(message.CreatedAt) {
			count += 1
		}
	}
	message.ReadCount = count
	message.ReadTotal = total
	return message
}

func (s *Store) readReceiptTotalLocked(conversationID, senderID string) int {
	if strings.HasPrefix(conversationID, "group-") {
		groupID := strings.TrimPrefix(conversationID, "group-")
		group, ok := s.groups[groupID]
		if !ok {
			return 0
		}
		total := 0
		for _, member := range group.Members {
			if member.UserID != senderID {
				total += 1
			}
		}
		return total
	}
	return 1
}

func groupRateLimitExceeded(limit *GroupRateLimit, role string, messages []Message, userID string, now time.Time) bool {
	if limit == nil || !limit.Enabled || canManageGroupRole(role) {
		return false
	}
	normalized := normalizeGroupRateLimit(limit)
	if normalized == nil || !normalized.Enabled {
		return false
	}
	since := now.Add(-time.Duration(normalized.WindowSeconds) * time.Second)
	count := 0
	for _, message := range messages {
		if message.SenderID == userID && !message.CreatedAt.Before(since) {
			count += 1
		}
	}
	return count >= normalized.MaxMessages
}

func normalizeGroupRateLimit(limit *GroupRateLimit) *GroupRateLimit {
	if limit == nil || !limit.Enabled {
		return nil
	}
	windowSeconds := limit.WindowSeconds
	maxMessages := limit.MaxMessages
	if windowSeconds <= 0 {
		windowSeconds = 10
	}
	if maxMessages <= 0 {
		maxMessages = 3
	}
	return &GroupRateLimit{Enabled: true, WindowSeconds: windowSeconds, MaxMessages: maxMessages}
}

func groupRateLimitAuditDetail(limit *GroupRateLimit) string {
	normalized := normalizeGroupRateLimit(limit)
	if normalized == nil || !normalized.Enabled {
		return "关闭发言频率限制"
	}
	return fmt.Sprintf("开启发言频率限制：%d 秒最多 %d 条", normalized.WindowSeconds, normalized.MaxMessages)
}

func autoMuteNewMembersAuditDetail(enabled bool) string {
	if enabled {
		return "开启新成员入群自动禁言"
	}
	return "关闭新成员入群自动禁言"
}

func normalizeGroupBotInterval(seconds int) int {
	switch seconds {
	case 60, 300:
		return seconds
	default:
		if seconds < 60 {
			return 60
		}
		return 300
	}
}

func normalizeGroupBotScheduleMode(mode string) string {
	if strings.TrimSpace(mode) == "daily" {
		return "daily"
	}
	return "interval"
}

func normalizeDailyTime(value string) string {
	parsed, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	return parsed.Format("15:04")
}

func normalizeGroupBot(bot GroupBot, now time.Time) GroupBot {
	bot.ScheduleMode = normalizeGroupBotScheduleMode(bot.ScheduleMode)
	bot.KeywordRules = normalizeBotKeywordRules(bot.KeywordRules)
	if bot.ScheduleMode == "daily" {
		bot.IntervalSeconds = 0
		if bot.DailyTime == "" {
			bot.DailyTime = "20:00"
		}
		bot.DailyTime = normalizeDailyTime(bot.DailyTime)
	} else {
		bot.IntervalSeconds = normalizeGroupBotInterval(bot.IntervalSeconds)
		bot.DailyTime = ""
	}
	if bot.NextRunAt.IsZero() {
		bot.NextRunAt = nextGroupBotRunAt(bot, now)
	}
	return bot
}

func normalizeBotKeywordRules(rules []BotKeywordRule) []BotKeywordRule {
	normalized := make([]BotKeywordRule, 0, 3)
	for _, rule := range rules {
		keyword := strings.TrimSpace(rule.Keyword)
		reply := strings.TrimSpace(rule.Reply)
		if keyword == "" || reply == "" {
			continue
		}
		normalized = append(normalized, BotKeywordRule{Keyword: keyword, Reply: reply})
		if len(normalized) == 3 {
			break
		}
	}
	return normalized
}

func keywordRulesKey(rules []BotKeywordRule) string {
	normalized := normalizeBotKeywordRules(rules)
	bytes, _ := json.Marshal(normalized)
	return string(bytes)
}

func nextGroupBotRunAt(bot GroupBot, now time.Time) time.Time {
	if bot.ScheduleMode != "daily" {
		return now.Add(time.Duration(normalizeGroupBotInterval(bot.IntervalSeconds)) * time.Second)
	}
	parsed, err := time.Parse("15:04", defaultString(bot.DailyTime, "20:00"))
	if err != nil {
		parsed, _ = time.Parse("15:04", "20:00")
	}
	next := time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

func defaultGroupBot(groupID string) GroupBot {
	return normalizeGroupBot(GroupBot{
		GroupID:         groupID,
		ID:              "announcement",
		Name:            "公告机器人",
		Enabled:         false,
		Message:         "欢迎来到群聊，请留意群公告。",
		ScheduleMode:    "interval",
		IntervalSeconds: 300,
	}, time.Now())
}

func (s *Store) groupBotsFor(groupID string) []GroupBot {
	s.mu.RLock()
	bots := append([]GroupBot(nil), s.groupBots[groupID]...)
	s.mu.RUnlock()
	if len(bots) == 0 {
		return []GroupBot{defaultGroupBot(groupID)}
	}
	return bots
}

func (s *Store) groupBotByID(groupID, botID string) GroupBot {
	for _, bot := range s.groupBotsFor(groupID) {
		if bot.ID == botID {
			return bot
		}
	}
	return GroupBot{}
}

func (s *Store) upsertGroupBot(ctx context.Context, groupID string, bot GroupBot) error {
	bot.GroupID = groupID
	bot = normalizeGroupBot(bot, time.Now())
	s.mu.Lock()
	if s.groupBots == nil {
		s.groupBots = map[string][]GroupBot{}
	}
	bots := s.groupBots[groupID]
	replaced := false
	for i := range bots {
		if bots[i].ID == bot.ID {
			bots[i] = bot
			replaced = true
			break
		}
	}
	if !replaced {
		bots = append(bots, bot)
	}
	s.groupBots[groupID] = bots
	s.mu.Unlock()
	return s.persistGroupBot(ctx, bot)
}

func (s *Store) deleteGroupBot(ctx context.Context, groupID, botID string) error {
	s.mu.Lock()
	bots := s.groupBots[groupID]
	filtered := bots[:0]
	for _, bot := range bots {
		if bot.ID != botID {
			filtered = append(filtered, bot)
		}
	}
	if len(filtered) == 0 {
		delete(s.groupBots, groupID)
	} else {
		s.groupBots[groupID] = filtered
	}
	s.mu.Unlock()
	return s.persistGroupBotDelete(ctx, groupID, botID)
}

func (s *Store) runDueGroupBots(ctx context.Context, now time.Time) (int, error) {
	var due []GroupBot
	s.mu.Lock()
	for groupID, bots := range s.groupBots {
		for i := range bots {
			bot := bots[i]
			if !bot.Enabled || bot.Message == "" || bot.NextRunAt.After(now) {
				continue
			}
			lastRunAt := now
			bot.LastRunAt = &lastRunAt
			bot.NextRunAt = nextGroupBotRunAt(bot, now)
			bots[i] = bot
			due = append(due, bot)
		}
		s.groupBots[groupID] = bots
	}
	s.mu.Unlock()

	for _, bot := range due {
		if err := s.persistGroupBot(ctx, bot); err != nil {
			return len(due), err
		}
		msg, err := s.sendGroupBotMessage(ctx, bot, now)
		if err != nil {
			return len(due), err
		}
		_ = s.appendAuditLog(ctx, AuditLog{
			GroupID:    bot.GroupID,
			ActorID:    "bot-" + bot.ID,
			ActorName:  bot.Name,
			Action:     "bot_auto_sent",
			TargetID:   bot.ID,
			TargetName: bot.Name,
			Detail:     "自动发送：" + msg.Body,
			CreatedAt:  now,
		})
	}
	return len(due), nil
}

func (s *Store) sendGroupBotMessage(ctx context.Context, bot GroupBot, now time.Time) (Message, error) {
	msg := Message{
		ID:             newID("msg"),
		ConversationID: "group-" + bot.GroupID,
		SenderID:       "bot-" + bot.ID,
		SenderName:     bot.Name,
		Type:           "text",
		Body:           bot.Message,
		CreatedAt:      now,
	}
	s.mu.Lock()
	s.messages[msg.ConversationID] = append(s.messages[msg.ConversationID], msg)
	for i := range s.conversations {
		if s.conversations[i].ID == msg.ConversationID {
			s.conversations[i].LastText = displayMessage(msg)
			s.conversations[i].LastAt = msg.CreatedAt
		}
	}
	msg = s.withReadStatsLocked(msg)
	s.mu.Unlock()
	if err := s.persistMessage(ctx, msg); err != nil {
		return Message{}, err
	}
	s.hub.Broadcast(map[string]any{"type": "message.created", "conversationId": msg.ConversationID, "payload": msg})
	return msg, nil
}

func (s *Store) appendGroupSystemMessage(ctx context.Context, groupID, body string) error {
	body = strings.TrimSpace(body)
	if groupID == "" || body == "" {
		return nil
	}
	msg := Message{
		ID:             newID("msg"),
		ConversationID: "group-" + groupID,
		SenderID:       "system",
		SenderName:     "系统",
		Type:           "system",
		Body:           body,
		CreatedAt:      time.Now(),
	}
	s.mu.Lock()
	s.messages[msg.ConversationID] = append(s.messages[msg.ConversationID], msg)
	for i := range s.conversations {
		if s.conversations[i].ID == msg.ConversationID {
			s.conversations[i].LastText = displayMessage(msg)
			s.conversations[i].LastAt = msg.CreatedAt
		}
	}
	msg = s.withReadStatsLocked(msg)
	s.mu.Unlock()
	if err := s.persistMessage(ctx, msg); err != nil {
		return err
	}
	s.hub.Broadcast(map[string]any{"type": "message.created", "conversationId": msg.ConversationID, "payload": msg})
	return nil
}

func (s *Store) sendKeywordBotReplies(ctx context.Context, incoming Message) error {
	if incoming.Type != "text" || incoming.Body == "" || strings.HasPrefix(incoming.SenderID, "bot-") || !strings.HasPrefix(incoming.ConversationID, "group-") {
		return nil
	}
	groupID := strings.TrimPrefix(incoming.ConversationID, "group-")
	body := strings.ToLower(incoming.Body)
	var replies []GroupBot
	s.mu.RLock()
	for _, bot := range s.groupBots[groupID] {
		if !bot.Enabled {
			continue
		}
		for _, rule := range normalizeBotKeywordRules(bot.KeywordRules) {
			if strings.Contains(body, strings.ToLower(rule.Keyword)) {
				replyBot := bot
				replyBot.Message = rule.Reply
				replies = append(replies, replyBot)
				break
			}
		}
	}
	s.mu.RUnlock()
	for _, bot := range replies {
		if _, err := s.sendGroupBotMessage(ctx, bot, time.Now()); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) startGroupBotScheduler(ctx context.Context) {
	if strings.EqualFold(os.Getenv("DISABLE_BOT_SCHEDULER"), "true") {
		return
	}
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if _, err := s.runDueGroupBots(context.Background(), now); err != nil {
					log.Printf("group bot scheduler: %v", err)
				}
			}
		}
	}()
}

func groupRoleFor(group Group, userID string) string {
	for _, member := range group.Members {
		if member.UserID == userID {
			return member.Role
		}
	}
	return ""
}

func (s *Store) normalizedMentionsForMessage(conversationID, senderID, body string, mentions []string) ([]string, error) {
	if !strings.HasPrefix(conversationID, "group-") {
		return uniqueStrings(mentions), nil
	}

	groupID := strings.TrimPrefix(conversationID, "group-")
	s.mu.RLock()
	group, ok := s.groups[groupID]
	s.mu.RUnlock()
	if !ok {
		return nil, errors.New("group not found")
	}

	if strings.Contains(body, "@所有人") {
		if !canManageGroupRole(groupRoleFor(group, senderID)) {
			return nil, errors.New("only group owners or administrators can mention everyone")
		}
		memberIDs := make([]string, 0, len(group.Members))
		for _, member := range group.Members {
			if member.UserID != "" && member.UserID != senderID {
				memberIDs = append(memberIDs, member.UserID)
			}
		}
		return uniqueStrings(memberIDs), nil
	}

	allowed := make(map[string]bool, len(group.Members))
	for _, member := range group.Members {
		allowed[member.UserID] = true
	}
	clean := make([]string, 0, len(mentions)+len(group.Members))
	for _, userID := range uniqueStrings(mentions) {
		if userID != senderID && allowed[userID] {
			clean = append(clean, userID)
		}
	}
	// Keep @ notifications reliable even when a client typed a member name instead
	// of selecting it from the mention picker.
	for _, member := range group.Members {
		name := strings.TrimSpace(member.Nickname)
		if member.UserID == "" || member.UserID == senderID || name == "" {
			continue
		}
		if strings.Contains(body, "@"+name) {
			clean = append(clean, member.UserID)
		}
	}
	return uniqueStrings(clean), nil
}

func (s *Store) broadcastMessageCreated(msg Message) {
	s.hub.Broadcast(map[string]any{"type": "message.created", "conversationId": msg.ConversationID, "payload": msg})
	for _, recipientID := range uniqueStrings(msg.Mentions) {
		if recipientID == "" || recipientID == msg.SenderID {
			continue
		}
		s.hub.Broadcast(map[string]any{
			"type":           "message.mentioned",
			"conversationId": msg.ConversationID,
			"payload": map[string]any{
				"recipientId": recipientID,
				"message":     msg,
			},
		})
	}
}

func groupHasUser(group Group, userID string) bool {
	return groupRoleFor(group, userID) != ""
}

func splitJoinedAndDiscoverGroups(allGroups map[string]Group, userID string) (map[string]Group, []Group) {
	joined := map[string]Group{}
	discover := make([]Group, 0)
	for id, group := range allGroups {
		if groupHasUser(group, userID) {
			joined[id] = group
			continue
		}
		discover = append(discover, group)
	}
	sort.SliceStable(discover, func(i, j int) bool {
		return discover[i].CreatedAt.After(discover[j].CreatedAt)
	})
	return joined, discover
}

func groupOwnerID(group Group) string {
	for _, member := range group.Members {
		if member.Role == "owner" {
			return member.UserID
		}
	}
	if len(group.Members) > 0 {
		return group.Members[0].UserID
	}
	return "u1"
}

func (s *Store) newAuditLog(groupID string, actor User, action, targetID, targetName, detail string) AuditLog {
	return AuditLog{
		ID:         newID("audit"),
		GroupID:    groupID,
		ActorID:    actor.ID,
		ActorName:  actor.Nickname,
		Action:     action,
		TargetID:   targetID,
		TargetName: targetName,
		Detail:     detail,
		CreatedAt:  time.Now(),
	}
}

func (s *Store) groupMemberName(groupID, userID string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	group, ok := s.groups[groupID]
	if !ok {
		return ""
	}
	for _, member := range group.Members {
		if member.UserID == userID {
			return member.Nickname
		}
	}
	return ""
}

func (s *Store) groupMemberRole(groupID, userID string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	group, ok := s.groups[groupID]
	if !ok {
		return ""
	}
	return groupRoleFor(group, userID)
}

func (s *Store) displayNameForUserID(userID string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if userID == s.user.ID {
		return s.user.Nickname
	}
	for _, contact := range s.contacts {
		if contact.ID == userID {
			return contact.Nickname
		}
	}
	if user, ok := s.users[userID]; ok {
		return user.Nickname
	}
	return userID
}

func groupIDFromConversationID(conversationID string) string {
	if !strings.HasPrefix(conversationID, "group-") {
		return ""
	}
	return strings.TrimPrefix(conversationID, "group-")
}

func groupJoinCode(group Group) string {
	return defaultString(strings.TrimSpace(group.QRCode), group.ChatID)
}

func isGroupQRCodeExpired(group Group, now time.Time) bool {
	return group.QRCodeExpiresAt != nil && !group.QRCodeExpiresAt.After(now)
}

func newQRCode() string {
	return "qr-" + newID("code")
}

func (s *Store) uniqueGroupChatID(ctx context.Context) (string, error) {
	for i := 0; i < 20; i++ {
		chatID := newGroupChatID()
		exists, err := s.groupChatIDExists(ctx, chatID)
		if err != nil {
			return "", err
		}
		if !exists {
			return chatID, nil
		}
	}
	return "", errors.New("could not generate unique group chat id")
}

func (s *Store) groupChatIDExists(ctx context.Context, chatID string) (bool, error) {
	s.mu.RLock()
	for _, group := range s.groups {
		if group.ChatID == chatID {
			s.mu.RUnlock()
			return true, nil
		}
	}
	s.mu.RUnlock()
	if s.pg == nil {
		return false, nil
	}
	var exists bool
	err := s.pg.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM groups WHERE chat_id = $1)`, chatID).Scan(&exists)
	return exists, err
}

func newGroupChatID() string {
	return fmt.Sprintf("%06d", rand.Intn(900000)+100000)
}

func isNumericGroupChatID(chatID string) bool {
	if len(chatID) != 6 {
		return false
	}
	for _, r := range chatID {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func newChatID() string {
	return randomFromAlphabet(chatIDLetters, 1) + randomFromAlphabet(chatIDDigits, 1) + randomFromAlphabet(chatIDAlphabet, 4)
}

func randomFromAlphabet(alphabet string, length int) string {
	if length <= 0 || alphabet == "" {
		return ""
	}
	buf := make([]byte, length)
	if _, err := cryptorand.Read(buf); err != nil {
		for i := range buf {
			buf[i] = alphabet[rand.Intn(len(alphabet))]
		}
		return string(buf)
	}
	for i, b := range buf {
		buf[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(buf)
}

func canManageGroupRole(role string) bool {
	return role == "owner" || role == "admin"
}

func validMutableGroupRole(role string) bool {
	return role == "admin" || role == "member"
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
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Size <= 0 {
		writeError(w, http.StatusBadRequest, "cannot upload empty file")
		return
	}
	if req.Size > maxUploadSizeBytes {
		writeError(w, http.StatusBadRequest, "file exceeds 64MB")
		return
	}
	id := newID("file")
	safeName := safeFileName(req.Name)
	mimeType := uploadMimeType(req.MimeType, safeName)
	writeJSON(w, http.StatusOK, map[string]any{
		"id":        id,
		"uploadUrl": "/api/files/upload/" + id + "/" + safeName,
		"publicUrl": "/uploads/" + id + "/" + safeName,
		"mimeType":  mimeType,
	})
}

func (s *Store) uploadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/files/upload/"), "/"), "/")
	if len(parts) != 2 {
		writeError(w, http.StatusBadRequest, "missing file id or name")
		return
	}
	fileID, fileName, ok := validatedUploadPathParts(parts)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid file path")
		return
	}
	dir := filepath.Join(s.uploadDir, fileID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, "upload directory failed")
		return
	}
	target := filepath.Join(dir, fileName)
	file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			writeError(w, http.StatusBadRequest, "file already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "file create failed")
		return
	}
	defer file.Close()
	size, err := io.Copy(file, http.MaxBytesReader(w, r.Body, maxUploadSizeBytes))
	if err != nil {
		_ = file.Close()
		cleanupFailedUpload(target, dir)
		writeError(w, http.StatusBadRequest, "file upload failed")
		return
	}
	if size <= 0 {
		_ = file.Close()
		cleanupFailedUpload(target, dir)
		writeError(w, http.StatusBadRequest, "cannot upload empty file")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        fileID,
		"name":      fileName,
		"size":      size,
		"publicUrl": "/uploads/" + fileID + "/" + fileName,
	})
}

func cleanupFailedUpload(target, dir string) {
	_ = os.Remove(target)
	_ = os.Remove(dir)
}

func (s *Store) serveUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/uploads/"), "/"), "/")
	if len(parts) != 2 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	fileID, fileName, ok := validatedUploadPathParts(parts)
	if !ok {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	http.ServeFile(w, r, filepath.Join(s.uploadDir, fileID, fileName))
}

func validatedUploadPathParts(parts []string) (string, string, bool) {
	if len(parts) != 2 {
		return "", "", false
	}
	fileID := safeFileName(parts[0])
	fileName := safeFileName(parts[1])
	if !validUploadFileID(fileID) || fileName == "" || parts[0] != fileID || parts[1] != fileName {
		return "", "", false
	}
	return fileID, fileName, true
}

func validUploadFileID(value string) bool {
	return strings.HasPrefix(value, "file-") && len(value) > len("file-")
}

func (s *Store) collectionsRoute(w http.ResponseWriter, r *http.Request) {
	current := s.currentUser(r)
	switch r.Method {
	case http.MethodGet:
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
	case http.MethodPost:
		var req Collection
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Kind = normalizeCollectionKind(req.Kind)
		req.Title = strings.TrimSpace(req.Title)
		req.Preview = strings.TrimSpace(req.Preview)
		req.MessageID = strings.TrimSpace(req.MessageID)
		if req.Title == "" {
			writeError(w, http.StatusBadRequest, "collection title required")
			return
		}
		if existing, ok := s.collectionByMessageFor(current.ID, req.MessageID); ok {
			writeJSON(w, http.StatusOK, existing)
			return
		}
		req.ID = newID("col")
		req.CreatedAt = time.Now()
		if err := s.saveCollectionFor(r.Context(), current.ID, req); err != nil {
			writeError(w, http.StatusInternalServerError, "collection save failed")
			return
		}
		writeJSON(w, http.StatusCreated, req)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Store) feedbackRoute(w http.ResponseWriter, r *http.Request) {
	current := s.currentUser(r)
	switch r.Method {
	case http.MethodGet:
		items, err := s.feedbackFor(r.Context(), current.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "feedback load failed")
			return
		}
		writeJSON(w, http.StatusOK, publicFeedbackItems(items))
	case http.MethodPost:
		var req struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		req.Type = defaultString(strings.TrimSpace(req.Type), "功能建议")
		req.Text = strings.TrimSpace(req.Text)
		if req.Text == "" {
			writeError(w, http.StatusBadRequest, "feedback text required")
			return
		}
		item := Feedback{
			ID:        newID("feedback"),
			UserID:    current.ID,
			Type:      req.Type,
			Text:      req.Text,
			Status:    "已提交",
			CreatedAt: time.Now(),
		}
		if err := s.saveFeedback(r.Context(), item); err != nil {
			writeError(w, http.StatusInternalServerError, "feedback save failed")
			return
		}
		writeJSON(w, http.StatusCreated, publicFeedback(item))
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func publicFeedback(item Feedback) userFeedback {
	return userFeedback{
		ID:        item.ID,
		UserID:    item.UserID,
		Type:      item.Type,
		Text:      item.Text,
		Status:    item.Status,
		CreatedAt: item.CreatedAt,
	}
}

func publicFeedbackItems(items []Feedback) []userFeedback {
	public := make([]userFeedback, 0, len(items))
	for _, item := range items {
		public = append(public, publicFeedback(item))
	}
	return public
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
	req.TargetID = strings.TrimSpace(req.TargetID)
	req.TargetType = strings.TrimSpace(req.TargetType)
	req.Reason = strings.TrimSpace(req.Reason)
	if req.TargetID == "" {
		writeError(w, http.StatusBadRequest, "report target required")
		return
	}
	if req.Reason == "" {
		writeError(w, http.StatusBadRequest, "report reason required")
		return
	}
	req.ID = newID("report")
	if req.TargetType == "" {
		req.TargetType = inferReportTargetType(req.TargetID)
	}
	if !isValidReportTargetType(req.TargetType) {
		writeError(w, http.StatusBadRequest, "invalid report target type")
		return
	}
	req.Status = "open"
	req.CreatedAt = time.Now()
	if err := s.persistReportFor(r.Context(), s.currentUser(r).ID, req); err != nil {
		writeError(w, http.StatusInternalServerError, "report persistence failed")
		return
	}
	s.mu.Lock()
	s.reports = append(s.reports, req)
	s.mu.Unlock()
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
	admin := bootstrapAdminRecord()
	admin.CreatedAt = now.Add(-48 * time.Hour)
	contacts := []Contact{
		{ID: "388770", Nickname: "陈刀仔（日进斗金）", Signature: "愿你每天都好运", ChatID: "cdz888", Avatar: avatar("陈"), Remark: "老朋友", Tags: []string{"优先", "线下"}},
		{ID: "388769", Nickname: "苏雅", Signature: "在线接待", ChatID: "suya66", Avatar: avatar("苏"), Tags: []string{"客服"}},
		{ID: "388754", Nickname: "恋情客", Signature: "忙碌中", ChatID: "love66", Avatar: avatar("恋")},
		{ID: "388786", Nickname: "^魚. 𝙯ᙆ", Signature: "保持联系", ChatID: "fish66", Avatar: avatar("魚"), Remark: "常联系", Tags: []string{"重点"}},
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
	discoverGroups := []Group{
		{
			ID:        "61001",
			Title:     "新朋友交流 1 群",
			Avatar:    avatar("新"),
			ChatID:    "61001",
			JoinMode:  "public_qr",
			CreatedAt: now.Add(-6 * time.Hour),
			Members:   []Member{{UserID: "388769", Nickname: "苏雅", Role: "owner"}},
		},
		{
			ID:        "61002",
			Title:     "效率协作 2 群",
			Avatar:    avatar("效"),
			ChatID:    "61002",
			JoinMode:  "approval",
			CreatedAt: now.Add(-8 * time.Hour),
			Members:   []Member{{UserID: "388770", Nickname: "陈刀仔（日进斗金）", Role: "owner"}},
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
		user:              mergeSeedUserPreferences(demoUser()),
		users:             map[string]User{"bot-announcement": {ID: "bot-announcement", Country: "+60", Phone: "bot-announcement", ChatID: "bot_announcement", Nickname: "公告机器人", Avatar: avatar("公"), CreatedAt: now.Add(-12 * time.Hour)}},
		adminUsers:        map[string]AdminUserRecord{admin.ID: admin},
		adminSessions:     map[string]AdminSession{},
		adminAuditLogs:    []AdminAuditLog{},
		systemSettings:    defaultAdminSystemSettings(),
		passwordHashes:    map[string]string{"u1": "demo:demo123456"},
		contacts:          contacts,
		conversations:     conversations,
		messages:          messages,
		messageReads:      map[string]map[string]time.Time{},
		conversationBurns: map[string]map[string]bool{},
		messageClears:     map[string]map[string]time.Time{},
		groups:            map[string]Group{"21444": group},
		discoverGroups:    discoverGroups,
		groupBots:         map[string][]GroupBot{"21444": {defaultGroupBot("21444")}},
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

func bootstrapAdminRecord() AdminUserRecord {
	username := strings.TrimSpace(os.Getenv("ADMIN_USERNAME"))
	if username == "" {
		username = "admin"
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		password = "admin123"
	}
	adminHash, _ := hashPassword(password)
	return AdminUserRecord{
		AdminUser: AdminUser{
			ID:        "admin-1",
			Username:  username,
			Role:      "super_admin",
			CreatedAt: time.Now().Add(-48 * time.Hour),
		},
		PasswordHash: adminHash,
	}
}

func mergeSeedUserPreferences(user User) User {
	user.BlockedContactIDs = []string{"388770"}
	return normalizeUserPreferences(user)
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func checkPasswordHash(password, hash string) bool {
	return passwordMatches(hash, password)
}

func hashAdminToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func hashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
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

func uploadMimeType(value, name string) string {
	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}
	if inferred := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); inferred != "" {
		return inferred
	}
	return "application/octet-stream"
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

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func hasString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func normalizeCollectionKind(kind string) string {
	kind = strings.TrimSpace(kind)
	switch kind {
	case "text", "image", "video", "file", "voice":
		return kind
	default:
		return "text"
	}
}

func filterSlice[T any](items []T, keep func(T) bool) []T {
	filtered := items[:0]
	for _, item := range items {
		if keep(item) {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func sanitizeQuote(quote *Quote) *Quote {
	if quote == nil {
		return nil
	}
	clean := &Quote{
		MessageID:      strings.TrimSpace(quote.MessageID),
		ConversationID: strings.TrimSpace(quote.ConversationID),
		SenderName:     strings.TrimSpace(quote.SenderName),
		Preview:        strings.TrimSpace(quote.Preview),
		Type:           strings.TrimSpace(quote.Type),
		TypeLabel:      strings.TrimSpace(quote.TypeLabel),
	}
	if clean.MessageID == "" && clean.Preview == "" && clean.SenderName == "" {
		return nil
	}
	return clean
}
