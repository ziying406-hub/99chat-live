package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const demoPasswordHash = "demo:demo123456"

var (
	errAlreadyExists    = errors.New("already exists")
	errNotFound         = errors.New("not found")
	errInvalidStatus    = errors.New("invalid status")
	errGroupJoinClosed  = errors.New("group join closed")
	errGroupBlacklisted = errors.New("group blacklisted")
	errForbidden        = errors.New("forbidden")
	errInvalidTarget    = errors.New("invalid target")
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func openPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	pg := &PostgresStore{pool: pool}
	if err := pg.ensureSchema(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pg, nil
}

func (pg *PostgresStore) ensureSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			country_code TEXT NOT NULL,
			phone TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			chat_id TEXT UNIQUE NOT NULL,
			nickname TEXT NOT NULL,
			signature TEXT NOT NULL DEFAULT '',
			avatar_url TEXT NOT NULL DEFAULT '',
			settings JSONB NOT NULL DEFAULT '{}'::jsonb,
			language TEXT NOT NULL DEFAULT '简体中文',
			display_mode TEXT NOT NULL DEFAULT '桌面版',
			blocked_contact_ids TEXT[] NOT NULL DEFAULT '{}',
			sticker_store JSONB NOT NULL DEFAULT '{}'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT '简体中文'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT '桌面版'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_contact_ids TEXT[] NOT NULL DEFAULT '{}'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS sticker_store JSONB NOT NULL DEFAULT '{}'::jsonb`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_country_phone ON users(country_code, phone)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id)`,
		`CREATE TABLE IF NOT EXISTS contacts (
			owner_user_id TEXT NOT NULL REFERENCES users(id),
			contact_user_id TEXT NOT NULL REFERENCES users(id),
			remark TEXT NOT NULL DEFAULT '',
			tags TEXT[] NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (owner_user_id, contact_user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS friend_requests (
			id TEXT PRIMARY KEY,
			from_user_id TEXT NOT NULL REFERENCES users(id),
			to_user_id TEXT NOT NULL REFERENCES users(id),
			greeting TEXT NOT NULL,
			status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS groups (
				id TEXT PRIMARY KEY,
				chat_id TEXT UNIQUE NOT NULL,
				qr_code TEXT NOT NULL DEFAULT '',
				qr_code_expires_at TIMESTAMPTZ,
				title TEXT NOT NULL,
				avatar_url TEXT NOT NULL DEFAULT '',
				announcement TEXT NOT NULL DEFAULT '',
				join_mode TEXT NOT NULL DEFAULT 'public_qr',
				disable_member_add_friend BOOLEAN NOT NULL DEFAULT false,
				all_muted BOOLEAN NOT NULL DEFAULT false,
				rate_limit_enabled BOOLEAN NOT NULL DEFAULT false,
				rate_limit_window_seconds INTEGER NOT NULL DEFAULT 10,
				rate_limit_max_messages INTEGER NOT NULL DEFAULT 3,
				auto_mute_new_members BOOLEAN NOT NULL DEFAULT false,
				owner_user_id TEXT NOT NULL REFERENCES users(id),
				created_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS qr_code TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS disable_member_add_friend BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS all_muted BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS rate_limit_enabled BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS rate_limit_window_seconds INTEGER NOT NULL DEFAULT 10`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS rate_limit_max_messages INTEGER NOT NULL DEFAULT 3`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS auto_mute_new_members BOOLEAN NOT NULL DEFAULT false`,
		`CREATE TABLE IF NOT EXISTS group_members (
			group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
			nickname TEXT NOT NULL DEFAULT '',
			muted_until TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (group_id, user_id)
		)`,
		`ALTER TABLE groups ADD COLUMN IF NOT EXISTS qr_code_expires_at TIMESTAMPTZ`,
		`CREATE TABLE IF NOT EXISTS group_join_requests (
				id TEXT PRIMARY KEY,
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id),
				inviter_user_id TEXT REFERENCES users(id),
				greeting TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
				created_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,
		`ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS inviter_user_id TEXT REFERENCES users(id)`,
		`CREATE TABLE IF NOT EXISTS group_blacklist (
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id),
				reason TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				PRIMARY KEY (group_id, user_id)
			)`,
		`CREATE TABLE IF NOT EXISTS group_audit_logs (
				id TEXT PRIMARY KEY,
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				actor_user_id TEXT NOT NULL,
				actor_name TEXT NOT NULL DEFAULT '',
				action TEXT NOT NULL,
				target_id TEXT NOT NULL DEFAULT '',
				target_name TEXT NOT NULL DEFAULT '',
				detail TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT now()
			)`,
		`CREATE TABLE IF NOT EXISTS group_bots (
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				bot_id TEXT NOT NULL,
				name TEXT NOT NULL,
				enabled BOOLEAN NOT NULL DEFAULT false,
				message TEXT NOT NULL DEFAULT '',
				keyword_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
				schedule_mode TEXT NOT NULL DEFAULT 'interval',
				interval_seconds INTEGER NOT NULL DEFAULT 300,
				daily_time TEXT NOT NULL DEFAULT '',
				next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
				last_run_at TIMESTAMPTZ,
				PRIMARY KEY (group_id, bot_id)
			)`,
		`ALTER TABLE group_bots ADD COLUMN IF NOT EXISTS schedule_mode TEXT NOT NULL DEFAULT 'interval'`,
		`ALTER TABLE group_bots ADD COLUMN IF NOT EXISTS daily_time TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE group_bots ADD COLUMN IF NOT EXISTS keyword_rules JSONB NOT NULL DEFAULT '[]'::jsonb`,
		`CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			kind TEXT NOT NULL CHECK (kind IN ('session', 'group')),
			group_id TEXT REFERENCES groups(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_text TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			sender_user_id TEXT NOT NULL REFERENCES users(id),
			type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'file', 'voice', 'contact', 'collection')),
			body TEXT NOT NULL DEFAULT '',
			mentions TEXT[] NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions TEXT[] NOT NULL DEFAULT '{}'`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quote_message_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quote_conversation_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quote_sender_name TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quote_preview TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quote_type TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS quote_type_label TEXT NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS message_attachments (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			object_key TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			size_bytes BIGINT NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS message_reads (
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (conversation_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS conversation_clears (
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (conversation_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS conversation_hides (
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (conversation_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS collections (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id),
			message_id TEXT REFERENCES messages(id),
			kind TEXT NOT NULL,
			title TEXT NOT NULL,
			preview TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS reports (
			id TEXT PRIMARY KEY,
			reporter_user_id TEXT NOT NULL REFERENCES users(id),
			target_type TEXT NOT NULL CHECK (target_type IN ('user', 'group', 'message')),
			target_id TEXT NOT NULL,
			reason TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS admin_users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			last_login_at TIMESTAMPTZ,
			disabled_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS admin_sessions (
			id TEXT PRIMARY KEY,
			admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
			token_hash TEXT NOT NULL,
			expires_at TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			revoked_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS admin_audit_logs (
			id TEXT PRIMARY KEY,
			admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
			admin_username TEXT NOT NULL DEFAULT '',
			action TEXT NOT NULL,
			target_type TEXT NOT NULL,
			target_id TEXT NOT NULL DEFAULT '',
			detail TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`,
		`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by_admin_id TEXT`,
		`ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
		`CREATE TABLE IF NOT EXISTS feedback (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id),
			type TEXT NOT NULL,
			text TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT '已提交',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_by_admin_id TEXT`,
		`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
		`CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user ON friend_requests(to_user_id, status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_collections_user_kind ON collections(user_id, kind, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash)`,
		`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_reports_status_created_at ON reports(status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_feedback_status_created_at ON feedback(status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_feedback_user_created_at ON feedback(user_id, created_at)`,
		`CREATE TABLE IF NOT EXISTS app_metadata (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
	}
	for _, statement := range statements {
		if _, err := pg.pool.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) syncFromPostgres(ctx context.Context) error {
	if s.pg == nil {
		return nil
	}
	seeded, err := s.pg.hasSeedData(ctx)
	if err != nil {
		return err
	}
	if !seeded {
		if strings.EqualFold(strings.TrimSpace(os.Getenv("SEED_DEMO_DATA")), "true") {
			if err := s.pg.seed(ctx, s); err != nil {
				return err
			}
		} else {
			s.clearRuntimeData()
			return nil
		}
	}
	loaded, err := s.pg.load(ctx, s.hub)
	if err != nil {
		return err
	}
	loaded.pg = s.pg
	*s = *loaded
	return nil
}

func (s *Store) clearRuntimeData() {
	s.user = User{}
	s.users = map[string]User{}
	s.contacts = []Contact{}
	s.conversations = []Conversation{}
	s.messages = map[string][]Message{}
	s.messageReads = map[string]map[string]time.Time{}
	s.messageClears = map[string]map[string]time.Time{}
	s.conversationHides = map[string]map[string]bool{}
	s.groups = map[string]Group{}
	s.discoverGroups = []Group{}
	s.requests = []FriendRequest{}
	s.joinRequests = []GroupJoinRequest{}
	s.blacklists = []GroupBlacklistEntry{}
	s.groupBots = map[string][]GroupBot{}
	s.collections = []Collection{}
	s.reports = []Report{}
	s.feedback = []Feedback{}
	s.auditLogs = []AuditLog{}
	s.adminUsers = map[string]AdminUserRecord{}
	s.adminSessions = map[string]AdminSession{}
	s.adminAuditLogs = []AdminAuditLog{}
	s.passwordHashes = map[string]string{}
	s.sessions = map[string]string{}
	s.sessionCreatedAt = map[string]time.Time{}
	if s.hub == nil {
		s.hub = &Hub{clients: map[*WSConn]bool{}}
	}
}

func (s *Store) resetPostgresOnce(ctx context.Context, marker string) error {
	if s.pg == nil || marker == "" {
		return nil
	}
	applied, err := s.pg.resetMarkerApplied(ctx, marker)
	if err != nil {
		return err
	}
	if applied {
		log.Printf("postgres reset marker %q already applied", marker)
		return nil
	}
	if err := s.pg.resetAllData(ctx); err != nil {
		return err
	}
	if err := s.pg.markResetApplied(ctx, marker); err != nil {
		return err
	}
	s.clearRuntimeData()
	log.Printf("postgres data reset completed for marker %q", marker)
	return nil
}

func (pg *PostgresStore) hasSeedData(ctx context.Context) (bool, error) {
	var count int
	if err := pg.pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (pg *PostgresStore) resetMarkerApplied(ctx context.Context, marker string) (bool, error) {
	var value string
	err := pg.pool.QueryRow(ctx, `SELECT value FROM app_metadata WHERE key = 'reset_database_marker'`).Scan(&value)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return value == marker, nil
}

func (pg *PostgresStore) markResetApplied(ctx context.Context, marker string) error {
	_, err := pg.pool.Exec(ctx, `INSERT INTO app_metadata(key, value, updated_at)
		VALUES ('reset_database_marker', $1, now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`, marker)
	return err
}

func (pg *PostgresStore) resetAllData(ctx context.Context) error {
	_, err := pg.pool.Exec(ctx, `TRUNCATE TABLE
		feedback,
		reports,
		collections,
		conversation_hides,
		conversation_clears,
		message_reads,
		message_attachments,
		messages,
		conversations,
		group_bots,
		group_audit_logs,
		group_blacklist,
		group_join_requests,
		group_members,
		groups,
		friend_requests,
		contacts,
		users
		RESTART IDENTITY CASCADE`)
	return err
}

func (pg *PostgresStore) backfillAcceptedFriendships(ctx context.Context) error {
	tx, err := pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `SELECT from_user_id, to_user_id, created_at
		FROM friend_requests WHERE status = 'accepted'`)
	if err != nil {
		return err
	}
	type acceptedFriendship struct {
		fromUserID string
		toUserID   string
		createdAt  time.Time
	}
	var friendships []acceptedFriendship
	for rows.Next() {
		var item acceptedFriendship
		if err := rows.Scan(&item.fromUserID, &item.toUserID, &item.createdAt); err != nil {
			rows.Close()
			return err
		}
		friendships = append(friendships, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, item := range friendships {
		if _, err := tx.Exec(ctx, `INSERT INTO contacts(owner_user_id, contact_user_id)
			VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`, item.fromUserID, item.toUserID); err != nil {
			return err
		}
		conversationID := canonicalPrivateConversationID(item.fromUserID, item.toUserID)
		if conversationID == "" {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO conversations(id, kind, unread, last_text, last_at)
			VALUES ($1, 'session', 0, '你们已是好友，可以开始聊天了!', $2)
			ON CONFLICT (id) DO NOTHING`, conversationID, item.createdAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (pg *PostgresStore) backfillGroupChatIDs(ctx context.Context) error {
	rows, err := pg.pool.Query(ctx, `SELECT id, chat_id FROM groups`)
	if err != nil {
		return err
	}
	type groupChatID struct {
		id     string
		chatID string
	}
	var groups []groupChatID
	used := map[string]bool{}
	for rows.Next() {
		var group groupChatID
		if err := rows.Scan(&group.id, &group.chatID); err != nil {
			rows.Close()
			return err
		}
		groups = append(groups, group)
		if isNumericGroupChatID(group.chatID) {
			used[group.chatID] = true
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, group := range groups {
		if isNumericGroupChatID(group.chatID) {
			continue
		}
		chatID := ""
		for i := 0; i < 20; i++ {
			candidate := newGroupChatID()
			if !used[candidate] {
				chatID = candidate
				used[candidate] = true
				break
			}
		}
		if chatID == "" {
			return errors.New("could not backfill group chat id")
		}
		if _, err := pg.pool.Exec(ctx, `UPDATE groups SET chat_id = $2 WHERE id = $1`, group.id, chatID); err != nil {
			return err
		}
	}
	return nil
}

func (pg *PostgresStore) seed(ctx context.Context, s *Store) error {
	tx, err := pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := upsertUser(ctx, tx, s.user, demoPasswordHash); err != nil {
		return err
	}
	adminHash, err := hashPassword("admin123")
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO admin_users(id, username, password_hash, role, created_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
		"admin-1", "admin", adminHash, "super_admin", time.Now().Add(-48*time.Hour)); err != nil {
		return err
	}
	for _, contact := range s.contacts {
		user := normalizeUserPreferences(User{ID: contact.ID, Country: "+60", Phone: "000" + contact.ID, ChatID: contact.ChatID, Nickname: contact.Nickname, Signature: contact.Signature, Avatar: contact.Avatar})
		if err := upsertUser(ctx, tx, user, "demo:contact"); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO contacts(owner_user_id, contact_user_id)
			VALUES ($1, $2) ON CONFLICT DO NOTHING`, s.user.ID, contact.ID); err != nil {
			return err
		}
	}
	for _, group := range s.groups {
		if err := upsertGroup(ctx, tx, s.user.ID, group); err != nil {
			return err
		}
	}
	for _, group := range s.discoverGroups {
		if err := upsertGroup(ctx, tx, groupOwnerID(group), group); err != nil {
			return err
		}
	}
	for _, bots := range s.groupBots {
		for _, bot := range bots {
			if err := upsertGroupBot(ctx, tx, bot); err != nil {
				return err
			}
		}
	}
	for _, conv := range s.conversations {
		groupID := ""
		if conv.Kind == "group" {
			candidate := strings.TrimPrefix(conv.ID, "group-")
			if _, ok := s.groups[candidate]; ok {
				groupID = candidate
			}
		}
		if err := upsertConversation(ctx, tx, conv, groupID); err != nil {
			return err
		}
	}
	for _, messages := range s.messages {
		for _, msg := range messages {
			if err := insertMessage(ctx, tx, msg); err != nil {
				return err
			}
		}
	}
	for _, request := range s.requests {
		if err := upsertFriendRequest(ctx, tx, s.user.ID, request); err != nil {
			return err
		}
	}
	for _, collection := range s.collections {
		if _, err := tx.Exec(ctx, `INSERT INTO collections(id, user_id, kind, title, preview, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, preview = EXCLUDED.preview`,
			collection.ID, s.user.ID, collection.Kind, collection.Title, collection.Preview, collection.CreatedAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (pg *PostgresStore) load(ctx context.Context, hub *Hub) (*Store, error) {
	if err := pg.backfillAcceptedFriendships(ctx); err != nil {
		return nil, err
	}
	if err := pg.backfillGroupChatIDs(ctx); err != nil {
		return nil, err
	}

	var user User
	var settingsJSON, stickerStoreJSON []byte
	err := pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store
		FROM users ORDER BY created_at LIMIT 1`).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON)
	if err != nil {
		return nil, err
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	user = normalizeUserPreferences(user)

	contacts, err := pg.loadContacts(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	conversations, err := pg.loadConversations(ctx)
	if err != nil {
		return nil, err
	}
	messages := map[string][]Message{}
	for _, conv := range conversations {
		items, err := pg.loadMessages(ctx, conv.ID)
		if err != nil {
			return nil, err
		}
		messages[conv.ID] = items
	}
	allGroups, err := pg.loadGroups(ctx)
	if err != nil {
		return nil, err
	}
	groups, discoverGroups := splitJoinedAndDiscoverGroups(allGroups, user.ID)
	requests, err := pg.loadFriendRequests(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	joinRequests, err := pg.loadGroupJoinRequests(ctx)
	if err != nil {
		return nil, err
	}
	blacklists, err := pg.loadGroupBlacklist(ctx)
	if err != nil {
		return nil, err
	}
	collections, err := pg.loadCollections(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	auditLogs, err := pg.loadAuditLogs(ctx)
	if err != nil {
		return nil, err
	}
	groupBots, err := pg.loadGroupBots(ctx)
	if err != nil {
		return nil, err
	}
	messageReads, err := pg.loadMessageReads(ctx)
	if err != nil {
		return nil, err
	}
	messageClears, err := pg.loadConversationClears(ctx)
	if err != nil {
		return nil, err
	}
	conversationHides, err := pg.loadConversationHides(ctx)
	if err != nil {
		return nil, err
	}
	return &Store{
		user:              user,
		users:             map[string]User{user.ID: user},
		contacts:          contacts,
		conversations:     conversations,
		messages:          messages,
		messageReads:      messageReads,
		messageClears:     messageClears,
		conversationHides: conversationHides,
		groups:            groups,
		discoverGroups:    discoverGroups,
		requests:          requests,
		joinRequests:      joinRequests,
		blacklists:        blacklists,
		groupBots:         groupBots,
		collections:       collections,
		auditLogs:         auditLogs,
		adminUsers:        map[string]AdminUserRecord{},
		adminSessions:     map[string]AdminSession{},
		adminAuditLogs:    []AdminAuditLog{},
		hub:               hub,
	}, nil
}

func (pg *PostgresStore) loadContacts(ctx context.Context, userID string) ([]Contact, error) {
	rows, err := pg.pool.Query(ctx, `SELECT u.id, u.nickname, u.signature, u.chat_id, u.avatar_url, COALESCE(c.remark, ''), COALESCE(c.tags, '{}')
		FROM contacts c JOIN users u ON u.id = c.contact_user_id
		WHERE c.owner_user_id = $1 ORDER BY c.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var contacts []Contact
	for rows.Next() {
		var contact Contact
		if err := rows.Scan(&contact.ID, &contact.Nickname, &contact.Signature, &contact.ChatID, &contact.Avatar, &contact.Remark, &contact.Tags); err != nil {
			return nil, err
		}
		contacts = append(contacts, contact)
	}
	return contacts, rows.Err()
}

func (pg *PostgresStore) loadConversations(ctx context.Context) ([]Conversation, error) {
	rows, err := pg.pool.Query(ctx, `SELECT id, kind, title, avatar_url, unread, last_text, last_at, pinned, muted
		FROM conversations ORDER BY last_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var conversations []Conversation
	for rows.Next() {
		var conv Conversation
		if err := rows.Scan(&conv.ID, &conv.Kind, &conv.Title, &conv.Avatar, &conv.Unread, &conv.LastText, &conv.LastAt, &conv.Pinned, &conv.Muted); err != nil {
			return nil, err
		}
		conversations = append(conversations, conv)
	}
	return conversations, rows.Err()
}

func (pg *PostgresStore) loadVisibleConversations(ctx context.Context, userID string) ([]Conversation, error) {
	conversations, err := pg.loadConversations(ctx)
	if err != nil {
		return nil, err
	}
	contacts, err := pg.loadContacts(ctx, userID)
	if err != nil {
		return nil, err
	}
	contactsByID := map[string]Contact{}
	for _, contact := range contacts {
		contactsByID[contact.ID] = contact
	}
	allGroups, err := pg.loadGroups(ctx)
	if err != nil {
		return nil, err
	}
	joinedGroups, _ := splitJoinedAndDiscoverGroups(allGroups, userID)
	items := make([]Conversation, 0, len(conversations))
	for _, conversation := range conversations {
		switch conversation.Kind {
		case "session":
			targetID, ok := privateConversationTargetID(conversation.ID, userID)
			if !ok {
				continue
			}
			contact, ok := contactsByID[targetID]
			if !ok {
				continue
			}
			conversation.Title = contact.Nickname
			conversation.Avatar = contact.Avatar
			items = append(items, conversation)
		case "group":
			groupID := groupIDFromConversationID(conversation.ID)
			group, ok := joinedGroups[groupID]
			if !ok {
				continue
			}
			conversation.Title = group.Title
			conversation.Avatar = group.Avatar
			items = append(items, conversation)
		}
	}
	return items, nil
}

func (pg *PostgresStore) loadMessages(ctx context.Context, conversationID string) ([]Message, error) {
	rows, err := pg.pool.Query(ctx, `SELECT m.id, m.conversation_id, m.sender_user_id, u.nickname, m.type, m.body, m.mentions, m.created_at,
			m.quote_message_id, m.quote_conversation_id, m.quote_sender_name, m.quote_preview, m.quote_type, m.quote_type_label,
			a.id, a.name, a.object_key, a.mime_type, a.size_bytes
		FROM messages m
		JOIN users u ON u.id = m.sender_user_id
		LEFT JOIN message_attachments a ON a.message_id = m.id
		WHERE m.conversation_id = $1
		ORDER BY m.created_at`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var messages []Message
	for rows.Next() {
		var msg Message
		var attachment Attachment
		var attachmentID, name, objectKey, mimeType *string
		var size *int64
		var mentions []string
		var quoteMessageID, quoteConversationID, quoteSenderName, quotePreview, quoteType, quoteTypeLabel string
		if err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.SenderName, &msg.Type, &msg.Body, &mentions, &msg.CreatedAt,
			&quoteMessageID, &quoteConversationID, &quoteSenderName, &quotePreview, &quoteType, &quoteTypeLabel,
			&attachmentID, &name, &objectKey, &mimeType, &size); err != nil {
			return nil, err
		}
		msg.Mentions = mentions
		if quoteMessageID != "" || quotePreview != "" || quoteSenderName != "" {
			msg.Quote = &Quote{
				MessageID:      quoteMessageID,
				ConversationID: quoteConversationID,
				SenderName:     quoteSenderName,
				Preview:        quotePreview,
				Type:           quoteType,
				TypeLabel:      quoteTypeLabel,
			}
		}
		if attachmentID != nil {
			attachment.ID = *attachmentID
			attachment.Name = valueString(name)
			attachment.URL = valueString(objectKey)
			attachment.MimeType = valueString(mimeType)
			if size != nil {
				attachment.Size = *size
			}
			msg.Attachment = &attachment
		}
		messages = append(messages, msg)
	}
	return messages, rows.Err()
}

func (pg *PostgresStore) loadGroups(ctx context.Context) (map[string]Group, error) {
	rows, err := pg.pool.Query(ctx, `SELECT id, title, avatar_url, chat_id, qr_code, qr_code_expires_at, announcement, join_mode, disable_member_add_friend, all_muted, rate_limit_enabled, rate_limit_window_seconds, rate_limit_max_messages, auto_mute_new_members, created_at
		FROM groups ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := map[string]Group{}
	for rows.Next() {
		var group Group
		var rateLimit GroupRateLimit
		if err := rows.Scan(&group.ID, &group.Title, &group.Avatar, &group.ChatID, &group.QRCode, &group.QRCodeExpiresAt, &group.Announcement, &group.JoinMode, &group.DisableMemberAddFriend, &group.AllMuted, &rateLimit.Enabled, &rateLimit.WindowSeconds, &rateLimit.MaxMessages, &group.AutoMuteNewMembers, &group.CreatedAt); err != nil {
			return nil, err
		}
		group.QRCode = defaultString(group.QRCode, group.ChatID)
		group.RateLimit = normalizeGroupRateLimit(&rateLimit)
		groups[group.ID] = group
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	memberRows, err := pg.pool.Query(ctx, `SELECT gm.group_id, gm.user_id, COALESCE(NULLIF(gm.nickname, ''), u.nickname), gm.role, gm.muted_until IS NOT NULL
		FROM group_members gm JOIN users u ON u.id = gm.user_id ORDER BY gm.created_at`)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()
	for memberRows.Next() {
		var groupID string
		var member Member
		if err := memberRows.Scan(&groupID, &member.UserID, &member.Nickname, &member.Role, &member.Muted); err != nil {
			return nil, err
		}
		group := groups[groupID]
		group.Members = append(group.Members, member)
		if member.UserID == "u1" {
			group.MyNickname = member.Nickname
		}
		groups[groupID] = group
	}
	return groups, memberRows.Err()
}

func (pg *PostgresStore) loadFriendRequests(ctx context.Context, userID string) ([]FriendRequest, error) {
	rows, err := pg.pool.Query(ctx, `SELECT fr.id, fr.from_user_id, fr.to_user_id,
			CASE WHEN fr.to_user_id = $1 THEN 'incoming' ELSE 'outgoing' END AS direction,
			u.id, u.nickname, u.signature, u.chat_id, u.avatar_url,
			fr.greeting, fr.status, fr.created_at
		FROM friend_requests fr
		JOIN users u ON u.id = CASE WHEN fr.to_user_id = $1 THEN fr.from_user_id ELSE fr.to_user_id END
		WHERE fr.to_user_id = $1 OR fr.from_user_id = $1
		ORDER BY fr.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var requests []FriendRequest
	for rows.Next() {
		var request FriendRequest
		if err := rows.Scan(&request.ID, &request.FromUserID, &request.ToUserID, &request.Direction, &request.User.ID, &request.User.Nickname, &request.User.Signature,
			&request.User.ChatID, &request.User.Avatar, &request.Greeting, &request.Status, &request.CreatedAt); err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func (pg *PostgresStore) loadGroupJoinRequests(ctx context.Context) ([]GroupJoinRequest, error) {
	rows, err := pg.pool.Query(ctx, `SELECT gjr.id, gjr.group_id, u.id, u.nickname, u.signature, u.chat_id, u.avatar_url,
			COALESCE(inviter.id, ''), COALESCE(inviter.nickname, ''), COALESCE(inviter.signature, ''), COALESCE(inviter.chat_id, ''), COALESCE(inviter.avatar_url, ''),
			gjr.greeting, gjr.status, gjr.created_at
		FROM group_join_requests gjr JOIN users u ON u.id = gjr.user_id
		LEFT JOIN users inviter ON inviter.id = gjr.inviter_user_id
		ORDER BY gjr.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var requests []GroupJoinRequest
	for rows.Next() {
		var request GroupJoinRequest
		var inviter Contact
		if err := rows.Scan(&request.ID, &request.GroupID, &request.User.ID, &request.User.Nickname, &request.User.Signature,
			&request.User.ChatID, &request.User.Avatar, &inviter.ID, &inviter.Nickname, &inviter.Signature, &inviter.ChatID, &inviter.Avatar,
			&request.Greeting, &request.Status, &request.CreatedAt); err != nil {
			return nil, err
		}
		if inviter.ID != "" {
			request.Inviter = &inviter
		}
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func (pg *PostgresStore) loadGroupBlacklist(ctx context.Context) ([]GroupBlacklistEntry, error) {
	rows, err := pg.pool.Query(ctx, `SELECT gb.group_id, u.id, u.nickname, u.signature, u.chat_id, u.avatar_url, gb.reason, gb.created_at
		FROM group_blacklist gb JOIN users u ON u.id = gb.user_id
		ORDER BY gb.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []GroupBlacklistEntry
	for rows.Next() {
		var entry GroupBlacklistEntry
		if err := rows.Scan(&entry.GroupID, &entry.User.ID, &entry.User.Nickname, &entry.User.Signature,
			&entry.User.ChatID, &entry.User.Avatar, &entry.Reason, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (pg *PostgresStore) loadCollections(ctx context.Context, userID string) ([]Collection, error) {
	rows, err := pg.pool.Query(ctx, `SELECT id, COALESCE(message_id, ''), kind, title, preview, created_at
		FROM collections WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var collections []Collection
	for rows.Next() {
		var collection Collection
		if err := rows.Scan(&collection.ID, &collection.MessageID, &collection.Kind, &collection.Title, &collection.Preview, &collection.CreatedAt); err != nil {
			return nil, err
		}
		collections = append(collections, collection)
	}
	return collections, rows.Err()
}

func (pg *PostgresStore) loadAuditLogs(ctx context.Context) ([]AuditLog, error) {
	rows, err := pg.pool.Query(ctx, `SELECT id, group_id, actor_user_id, actor_name, action, target_id, target_name, detail, created_at
		FROM group_audit_logs ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []AuditLog
	for rows.Next() {
		var log AuditLog
		if err := rows.Scan(&log.ID, &log.GroupID, &log.ActorID, &log.ActorName, &log.Action, &log.TargetID, &log.TargetName, &log.Detail, &log.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, rows.Err()
}

func (pg *PostgresStore) loadGroupBots(ctx context.Context) (map[string][]GroupBot, error) {
	rows, err := pg.pool.Query(ctx, `SELECT group_id, bot_id, name, enabled, message, keyword_rules, schedule_mode, interval_seconds, daily_time, next_run_at, last_run_at
		FROM group_bots ORDER BY group_id, bot_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	bots := map[string][]GroupBot{}
	for rows.Next() {
		var bot GroupBot
		var lastRunAt *time.Time
		var keywordRulesJSON []byte
		if err := rows.Scan(&bot.GroupID, &bot.ID, &bot.Name, &bot.Enabled, &bot.Message, &keywordRulesJSON, &bot.ScheduleMode, &bot.IntervalSeconds, &bot.DailyTime, &bot.NextRunAt, &lastRunAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(keywordRulesJSON, &bot.KeywordRules)
		bot = normalizeGroupBot(bot, time.Now())
		bot.LastRunAt = lastRunAt
		bots[bot.GroupID] = append(bots[bot.GroupID], bot)
	}
	return bots, rows.Err()
}

func (pg *PostgresStore) loadMessageReads(ctx context.Context) (map[string]map[string]time.Time, error) {
	rows, err := pg.pool.Query(ctx, `SELECT conversation_id, user_id, read_at FROM message_reads`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	reads := map[string]map[string]time.Time{}
	for rows.Next() {
		var conversationID, userID string
		var readAt time.Time
		if err := rows.Scan(&conversationID, &userID, &readAt); err != nil {
			return nil, err
		}
		if reads[conversationID] == nil {
			reads[conversationID] = map[string]time.Time{}
		}
		reads[conversationID][userID] = readAt
	}
	return reads, rows.Err()
}

func (pg *PostgresStore) loadConversationClears(ctx context.Context) (map[string]map[string]time.Time, error) {
	rows, err := pg.pool.Query(ctx, `SELECT conversation_id, user_id, cleared_at FROM conversation_clears`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clears := map[string]map[string]time.Time{}
	for rows.Next() {
		var conversationID, userID string
		var clearedAt time.Time
		if err := rows.Scan(&conversationID, &userID, &clearedAt); err != nil {
			return nil, err
		}
		if clears[conversationID] == nil {
			clears[conversationID] = map[string]time.Time{}
		}
		clears[conversationID][userID] = clearedAt
	}
	return clears, rows.Err()
}

func (pg *PostgresStore) loadConversationHides(ctx context.Context) (map[string]map[string]bool, error) {
	rows, err := pg.pool.Query(ctx, `SELECT conversation_id, user_id FROM conversation_hides`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hides := map[string]map[string]bool{}
	for rows.Next() {
		var conversationID, userID string
		if err := rows.Scan(&conversationID, &userID); err != nil {
			return nil, err
		}
		if hides[userID] == nil {
			hides[userID] = map[string]bool{}
		}
		hides[userID][conversationID] = true
	}
	return hides, rows.Err()
}

func (s *Store) authenticate(ctx context.Context, country, phone, password string) (User, bool, error) {
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		if country == s.user.Country && phone == s.user.Phone && passwordMatches(s.passwordHashes[s.user.ID], password) {
			return s.user, true, nil
		}
		for _, user := range s.users {
			if country == user.Country && phone == user.Phone && passwordMatches(s.passwordHashes[user.ID], password) {
				return user, true, nil
			}
		}
		return User{}, false, nil
	}
	var user User
	var passwordHash string
	var settingsJSON, stickerStoreJSON []byte
	err := s.pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store, password_hash
		FROM users WHERE country_code = $1 AND phone = $2`,
		country, phone).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON, &passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	if !passwordMatches(passwordHash, password) {
		return User{}, false, nil
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	return normalizeUserPreferences(user), true, nil
}

func (s *Store) adminByUsername(ctx context.Context, username string) (AdminUserRecord, bool, error) {
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		for _, admin := range s.adminUsers {
			if admin.Username == username {
				return admin, true, nil
			}
		}
		return AdminUserRecord{}, false, nil
	}
	var admin AdminUserRecord
	err := s.pg.pool.QueryRow(ctx, `SELECT id, username, password_hash, role, created_at, last_login_at, disabled_at
		FROM admin_users WHERE username = $1`, username).
		Scan(&admin.ID, &admin.Username, &admin.PasswordHash, &admin.Role, &admin.CreatedAt, &admin.LastLoginAt, &admin.DisabledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminUserRecord{}, false, nil
	}
	if err != nil {
		return AdminUserRecord{}, false, err
	}
	return admin, true, nil
}

func (s *Store) saveAdminSession(ctx context.Context, session AdminSession) error {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.adminSessions == nil {
			s.adminSessions = map[string]AdminSession{}
		}
		s.adminSessions[session.ID] = session
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO admin_sessions(id, admin_user_id, token_hash, expires_at, created_at, revoked_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		session.ID, session.AdminUserID, session.TokenHash, session.ExpiresAt, session.CreatedAt, session.RevokedAt)
	return err
}

func (s *Store) adminBySessionToken(ctx context.Context, token string) (AdminUser, AdminSession, bool, error) {
	if token == "" {
		return AdminUser{}, AdminSession{}, false, nil
	}
	tokenHash := hashAdminToken(token)
	now := time.Now()
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		for _, session := range s.adminSessions {
			if session.TokenHash != tokenHash || session.RevokedAt != nil || !session.ExpiresAt.After(now) {
				continue
			}
			admin, ok := s.adminUsers[session.AdminUserID]
			if !ok || admin.DisabledAt != nil {
				return AdminUser{}, AdminSession{}, false, nil
			}
			return admin.AdminUser, session, true, nil
		}
		return AdminUser{}, AdminSession{}, false, nil
	}
	var admin AdminUser
	var session AdminSession
	err := s.pg.pool.QueryRow(ctx, `SELECT au.id, au.username, au.role, au.created_at, au.last_login_at, au.disabled_at,
			s.id, s.admin_user_id, s.token_hash, s.expires_at, s.created_at, s.revoked_at
		FROM admin_sessions s
		JOIN admin_users au ON au.id = s.admin_user_id
		WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, tokenHash).
		Scan(&admin.ID, &admin.Username, &admin.Role, &admin.CreatedAt, &admin.LastLoginAt, &admin.DisabledAt,
			&session.ID, &session.AdminUserID, &session.TokenHash, &session.ExpiresAt, &session.CreatedAt, &session.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminUser{}, AdminSession{}, false, nil
	}
	if err != nil {
		return AdminUser{}, AdminSession{}, false, err
	}
	if admin.DisabledAt != nil {
		return AdminUser{}, AdminSession{}, false, nil
	}
	return admin, session, true, nil
}

func (s *Store) revokeAdminSession(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	tokenHash := hashAdminToken(token)
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		now := time.Now()
		for id, session := range s.adminSessions {
			if session.TokenHash != tokenHash || session.RevokedAt != nil {
				continue
			}
			session.RevokedAt = &now
			s.adminSessions[id] = session
		}
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `UPDATE admin_sessions SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash)
	return err
}

func (s *Store) markAdminLogin(ctx context.Context, adminUserID string, loginAt time.Time) error {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		admin, ok := s.adminUsers[adminUserID]
		if !ok {
			return nil
		}
		admin.LastLoginAt = &loginAt
		s.adminUsers[adminUserID] = admin
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `UPDATE admin_users SET last_login_at = $2 WHERE id = $1`, adminUserID, loginAt)
	return err
}

func (s *Store) adminDashboardCounts(ctx context.Context) (adminDashboardResponse, error) {
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		dashboard := adminDashboardResponse{
			TotalUsers:    1 + len(s.users),
			TotalGroups:   len(s.groups) + len(s.discoverGroups),
			OpenReports:   len(s.reports),
			TotalMessages: 0,
		}
		if userIsBanned(s.user) {
			dashboard.BannedUsers++
		}
		for _, user := range s.users {
			if userIsBanned(user) {
				dashboard.BannedUsers++
			}
		}
		for _, item := range s.feedback {
			if item.Status != "已解决" {
				dashboard.OpenFeedback++
			}
		}
		for _, items := range s.messages {
			dashboard.TotalMessages += len(items)
			for _, message := range items {
				if message.Attachment != nil {
					dashboard.AttachmentCount++
					dashboard.AttachmentBytes += int(message.Attachment.Size)
				}
			}
		}
		return dashboard, nil
	}
	var dashboard adminDashboardResponse
	err := s.pg.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM users),
			(SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL),
			(SELECT COUNT(*) FROM groups),
			(SELECT COUNT(*) FROM messages),
			(SELECT COUNT(*) FROM reports WHERE status = 'open'),
			(SELECT COUNT(*) FROM feedback WHERE status <> '已解决'),
			(SELECT COUNT(*) FROM message_attachments),
			COALESCE((SELECT SUM(size_bytes) FROM message_attachments), 0)
	`).Scan(
		&dashboard.TotalUsers,
		&dashboard.BannedUsers,
		&dashboard.TotalGroups,
		&dashboard.TotalMessages,
		&dashboard.OpenReports,
		&dashboard.OpenFeedback,
		&dashboard.AttachmentCount,
		&dashboard.AttachmentBytes,
	)
	return dashboard, err
}

func (s *Store) adminSearchUsers(ctx context.Context, keyword, status, from, to string) ([]adminUserSummary, error) {
	if s.pg == nil {
		s.mu.RLock()
		users := make([]User, 0, 1+len(s.users))
		users = append(users, s.user)
		for _, user := range s.users {
			users = append(users, user)
		}
		s.mu.RUnlock()
		items := make([]adminUserSummary, 0, len(users))
		for _, user := range users {
			if !matchesAdminUserFilters(user, keyword, status, from, to) {
				continue
			}
			items = append(items, adminSummaryFromUser(user))
		}
		sort.Slice(items, func(i, j int) bool {
			if items[i].CreatedAt.Equal(items[j].CreatedAt) {
				return items[i].ID < items[j].ID
			}
			return items[i].CreatedAt.After(items[j].CreatedAt)
		})
		return items, nil
	}
	conditions := []string{"1=1"}
	args := make([]any, 0, 4)
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		pattern := "%" + strings.ToLower(keyword) + "%"
		args = append(args, pattern)
		conditions = append(conditions, fmt.Sprintf("(LOWER(id) LIKE $%d OR LOWER(phone) LIKE $%d OR LOWER(chat_id) LIKE $%d OR LOWER(nickname) LIKE $%d)", len(args), len(args), len(args), len(args)))
	}
	switch strings.TrimSpace(status) {
	case "", "all":
	case "active":
		conditions = append(conditions, "banned_at IS NULL")
	case "banned":
		conditions = append(conditions, "banned_at IS NOT NULL")
	default:
		conditions = append(conditions, "1=0")
	}
	if fromTime, ok := parseAdminDateFilter(from); ok {
		args = append(args, fromTime)
		conditions = append(conditions, fmt.Sprintf("created_at >= $%d", len(args)))
	}
	if toTime, ok := parseAdminDateFilter(to); ok {
		if len(strings.TrimSpace(to)) == len("2006-01-02") {
			toTime = toTime.Add(24 * time.Hour)
			args = append(args, toTime)
			conditions = append(conditions, fmt.Sprintf("created_at < $%d", len(args)))
		} else {
			args = append(args, toTime)
			conditions = append(conditions, fmt.Sprintf("created_at <= $%d", len(args)))
		}
	}
	query := fmt.Sprintf(`SELECT id, phone, country_code, chat_id, nickname, avatar_url, created_at, banned_at, ban_reason
		FROM users
		WHERE %s
		ORDER BY created_at DESC, id ASC`, strings.Join(conditions, " AND "))
	rows, err := s.pg.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]adminUserSummary, 0)
	for rows.Next() {
		var item adminUserSummary
		if err := rows.Scan(&item.ID, &item.Phone, &item.Country, &item.ChatID, &item.Nickname, &item.Avatar, &item.CreatedAt, &item.BannedAt, &item.BanReason); err != nil {
			return nil, err
		}
		item.Status = "active"
		if item.BannedAt != nil {
			item.Status = "banned"
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) adminUserByID(ctx context.Context, userID string) (User, bool, error) {
	userID = s.resolveAdminTargetUserID(userID)
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		if s.user.ID == userID {
			return s.user, true, nil
		}
		user, ok := s.users[userID]
		return user, ok, nil
	}
	var user User
	var settingsJSON, stickerStoreJSON []byte
	err := s.pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store
		FROM users WHERE id = $1`, userID).
		Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	return normalizeUserPreferences(user), true, nil
}

func (s *Store) setUserBanState(ctx context.Context, userID string, bannedAt *time.Time, reason string) (User, bool, error) {
	userID = s.resolveAdminTargetUserID(userID)
	reason = strings.TrimSpace(reason)
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.user.ID == userID {
			s.user.BannedAt = bannedAt
			s.user.BanReason = reason
			return s.user, true, nil
		}
		user, ok := s.users[userID]
		if !ok {
			return User{}, false, nil
		}
		user.BannedAt = bannedAt
		user.BanReason = reason
		s.users[userID] = user
		return user, true, nil
	}
	var user User
	var settingsJSON, stickerStoreJSON []byte
	err := s.pg.pool.QueryRow(ctx, `UPDATE users
		SET banned_at = $2, ban_reason = $3
		WHERE id = $1
		RETURNING id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store`,
		userID, bannedAt, reason).
		Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	return normalizeUserPreferences(user), true, nil
}

func (s *Store) setUserBanStateWithAudit(ctx context.Context, admin AdminUser, userID string, bannedAt *time.Time, reason string, action string, detail string) (User, bool, error) {
	userID = s.resolveAdminTargetUserID(userID)
	reason = strings.TrimSpace(reason)
	detail = strings.TrimSpace(detail)
	log := AdminAuditLog{
		ID:            newID("admin-audit"),
		AdminUserID:   admin.ID,
		AdminUsername: admin.Username,
		Action:        action,
		TargetType:    "user",
		TargetID:      userID,
		Detail:        detail,
		CreatedAt:     time.Now(),
	}
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()

		var user User
		switch {
		case s.user.ID == userID:
			user = s.user
		default:
			var ok bool
			user, ok = s.users[userID]
			if !ok {
				return User{}, false, nil
			}
		}
		log.TargetID = user.ID
		if s.adminAuditLogHook != nil {
			if err := s.adminAuditLogHook(log); err != nil {
				return User{}, false, err
			}
		}
		user.BannedAt = bannedAt
		user.BanReason = reason
		if s.user.ID == userID {
			s.user = user
		} else {
			s.users[userID] = user
		}
		s.adminAuditLogs = append([]AdminAuditLog{log}, s.adminAuditLogs...)
		return user, true, nil
	}

	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return User{}, false, err
	}
	defer tx.Rollback(ctx)

	var user User
	var settingsJSON, stickerStoreJSON []byte
	err = tx.QueryRow(ctx, `UPDATE users
		SET banned_at = $2, ban_reason = $3
		WHERE id = $1
		RETURNING id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store`,
		userID, bannedAt, reason).
		Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	user = normalizeUserPreferences(user)
	log.TargetID = user.ID

	if _, err := tx.Exec(ctx, `INSERT INTO admin_audit_logs(id, admin_user_id, admin_username, action, target_type, target_id, detail, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		log.ID, log.AdminUserID, log.AdminUsername, log.Action, log.TargetType, log.TargetID, log.Detail, log.CreatedAt); err != nil {
		return User{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return User{}, false, err
	}
	s.mu.Lock()
	s.adminAuditLogs = append([]AdminAuditLog{log}, s.adminAuditLogs...)
	s.mu.Unlock()
	return user, true, nil
}

func (s *Store) appendAdminAuditLog(ctx context.Context, admin AdminUser, action string, targetType string, targetID string, detail string) error {
	log := AdminAuditLog{
		ID:            newID("admin-audit"),
		AdminUserID:   admin.ID,
		AdminUsername: admin.Username,
		Action:        action,
		TargetType:    targetType,
		TargetID:      targetID,
		Detail:        detail,
		CreatedAt:     time.Now(),
	}
	s.mu.Lock()
	s.adminAuditLogs = append([]AdminAuditLog{log}, s.adminAuditLogs...)
	s.mu.Unlock()
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO admin_audit_logs(id, admin_user_id, admin_username, action, target_type, target_id, detail, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		log.ID, log.AdminUserID, log.AdminUsername, log.Action, log.TargetType, log.TargetID, log.Detail, log.CreatedAt)
	return err
}

func (s *Store) resolveAdminTargetUserID(userID string) string {
	userID = strings.TrimSpace(userID)
	if userID == "u-demo" {
		return "u1"
	}
	return userID
}

func matchesAdminUserFilters(user User, keyword, status, from, to string) bool {
	keyword = strings.ToLower(strings.TrimSpace(keyword))
	if keyword != "" {
		search := strings.ToLower(strings.Join([]string{user.ID, user.Phone, user.ChatID, user.Nickname}, " "))
		if !strings.Contains(search, keyword) {
			return false
		}
	}
	switch strings.TrimSpace(status) {
	case "", "all":
	case "active":
		if userIsBanned(user) {
			return false
		}
	case "banned":
		if !userIsBanned(user) {
			return false
		}
	default:
		return false
	}
	if fromTime, ok := parseAdminDateFilter(from); ok && user.CreatedAt.Before(fromTime) {
		return false
	}
	if toTime, ok := parseAdminDateFilter(to); ok {
		if len(strings.TrimSpace(to)) == len("2006-01-02") {
			if !user.CreatedAt.Before(toTime.Add(24 * time.Hour)) {
				return false
			}
		} else if user.CreatedAt.After(toTime) {
			return false
		}
	}
	return true
}

func (s *Store) userByPhone(ctx context.Context, country, phone string) (User, bool, error) {
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		if country == s.user.Country && phone == s.user.Phone {
			return normalizeUserPreferences(s.user), true, nil
		}
		for _, user := range s.users {
			if country == user.Country && phone == user.Phone {
				return normalizeUserPreferences(user), true, nil
			}
		}
		return User{}, false, nil
	}
	var user User
	var settingsJSON, stickerStoreJSON []byte
	err := s.pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store
		FROM users WHERE country_code = $1 AND phone = $2`,
		country, phone).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	return normalizeUserPreferences(user), true, nil
}

func (s *Store) createUser(ctx context.Context, country, phone, password, nickname string) (User, error) {
	user := User{
		ID:                newID("user"),
		Country:           country,
		Phone:             phone,
		ChatID:            uniqueChatID(),
		Nickname:          nickname,
		Signature:         "",
		Avatar:            avatar(firstRune(nickname)),
		CreatedAt:         time.Now(),
		Settings:          defaultUserSettings(),
		Language:          "简体中文",
		DisplayMode:       "桌面版",
		BlockedContactIDs: []string{},
		StickerStore: StickerStore{
			Items:     []string{},
			Favorites: []string{},
		},
	}
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.sessions == nil {
			s.sessions = map[string]string{}
		}
		if s.users == nil {
			s.users = map[string]User{s.user.ID: s.user}
		}
		if s.passwordHashes == nil {
			s.passwordHashes = map[string]string{s.user.ID: "demo:demo123456"}
		}
		for _, existing := range s.users {
			if existing.Country == country && existing.Phone == phone {
				return User{}, errAlreadyExists
			}
		}
		s.users[user.ID] = user
		s.passwordHashes[user.ID] = "demo:" + password
		return user, nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	settingsJSON, err := encodeUserSettings(user.Settings)
	if err != nil {
		return User{}, err
	}
	stickerStoreJSON, err := encodeStickerStore(user.StickerStore)
	if err != nil {
		return User{}, err
	}
	_, err = s.pg.pool.Exec(ctx, `INSERT INTO users(id, country_code, phone, password_hash, chat_id, nickname, signature, avatar_url, settings, language, display_mode, blocked_contact_ids, sticker_store, created_at, banned_at, ban_reason)
		VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
		user.ID, user.Country, user.Phone, string(hash), user.ChatID, user.Nickname, user.Avatar, settingsJSON, user.Language, user.DisplayMode, user.BlockedContactIDs, stickerStoreJSON, user.CreatedAt, user.BannedAt, user.BanReason)
	if isUniqueViolation(err) {
		return User{}, errAlreadyExists
	}
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) updatePassword(ctx context.Context, userID, oldPassword, newPassword string) (bool, error) {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.passwordHashes == nil {
			s.passwordHashes = map[string]string{s.user.ID: "demo:demo123456"}
		}
		currentHash := s.passwordHashes[userID]
		if currentHash == "" {
			return false, nil
		}
		if !passwordMatches(currentHash, oldPassword) {
			return false, nil
		}
		s.passwordHashes[userID] = "demo:" + newPassword
		return true, nil
	}
	var currentHash string
	err := s.pg.pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&currentHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !passwordMatches(currentHash, oldPassword) {
		return false, nil
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return false, err
	}
	_, err = s.pg.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, userID, string(newHash))
	return err == nil, err
}

func (s *Store) resetPasswordForPhone(ctx context.Context, country, phone, newPassword string) (bool, error) {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.passwordHashes == nil {
			s.passwordHashes = map[string]string{s.user.ID: "demo:demo123456"}
		}
		if country == s.user.Country && phone == s.user.Phone {
			s.passwordHashes[s.user.ID] = "demo:" + newPassword
			return true, nil
		}
		for _, user := range s.users {
			if country == user.Country && phone == user.Phone {
				s.passwordHashes[user.ID] = "demo:" + newPassword
				return true, nil
			}
		}
		return false, nil
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return false, err
	}
	tag, err := s.pg.pool.Exec(ctx, `UPDATE users SET password_hash = $3 WHERE country_code = $1 AND phone = $2`, country, phone, string(newHash))
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *Store) userByID(ctx context.Context, userID string) (User, bool, error) {
	if userID == s.user.ID {
		return s.user, true, nil
	}
	if s.pg == nil {
		s.mu.RLock()
		if user, ok := s.users[userID]; ok {
			s.mu.RUnlock()
			return normalizeUserPreferences(user), true, nil
		}
		s.mu.RUnlock()
		for _, contact := range s.contacts {
			if contact.ID == userID {
				return normalizeUserPreferences(User{ID: contact.ID, Country: "+60", Phone: "", ChatID: contact.ChatID, Nickname: contact.Nickname, Signature: contact.Signature, Avatar: contact.Avatar}), true, nil
			}
		}
		return User{}, false, nil
	}
	var user User
	var settingsJSON, stickerStoreJSON []byte
	err := s.pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url, created_at, banned_at, ban_reason, settings, language, display_mode, blocked_contact_ids, sticker_store
		FROM users WHERE id = $1`, userID).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &user.CreatedAt, &user.BannedAt, &user.BanReason, &settingsJSON, &user.Language, &user.DisplayMode, &user.BlockedContactIDs, &stickerStoreJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	user.Settings = decodeUserSettings(settingsJSON)
	user.StickerStore = decodeStickerStore(stickerStoreJSON)
	return normalizeUserPreferences(user), true, nil
}

func (s *Store) findContactByChatID(ctx context.Context, chatID string) (Contact, error) {
	if chatID == "" {
		return Contact{}, nil
	}
	if s.user.ChatID == chatID || s.user.Phone == chatID || s.user.ID == chatID {
		return s.user.AsContact(), nil
	}
	for _, contact := range s.contacts {
		if contact.ChatID == chatID || contact.ID == chatID {
			return contact, nil
		}
	}
	for _, user := range s.users {
		if user.ChatID == chatID || user.Phone == chatID || user.ID == chatID {
			return user.AsContact(), nil
		}
	}
	if s.pg == nil {
		return Contact{}, nil
	}
	var contact Contact
	err := s.pg.pool.QueryRow(ctx, `SELECT id, nickname, signature, chat_id, avatar_url
		FROM users WHERE chat_id = $1 OR phone = $1 LIMIT 1`, chatID).Scan(&contact.ID, &contact.Nickname, &contact.Signature, &contact.ChatID, &contact.Avatar)
	if errors.Is(err, pgx.ErrNoRows) {
		return Contact{}, nil
	}
	return contact, err
}

func (s *Store) contactByID(ctx context.Context, id string) (Contact, bool, error) {
	return s.contactByIDForUser(ctx, s.user.ID, id)
}

func (s *Store) contactByIDForUser(ctx context.Context, userID, id string) (Contact, bool, error) {
	s.mu.RLock()
	for _, contact := range s.contacts {
		if contact.ID == id {
			s.mu.RUnlock()
			return contact, true, nil
		}
	}
	s.mu.RUnlock()
	if s.pg == nil {
		return Contact{}, false, nil
	}
	var contact Contact
	err := s.pg.pool.QueryRow(ctx, `SELECT c.contact_user_id, u.nickname, u.signature, u.chat_id, u.avatar_url, COALESCE(c.remark, ''), COALESCE(c.tags, '{}')
		FROM contacts c JOIN users u ON u.id = c.contact_user_id
		WHERE c.owner_user_id = $1 AND c.contact_user_id = $2`,
		userID, id).Scan(&contact.ID, &contact.Nickname, &contact.Signature, &contact.ChatID, &contact.Avatar, &contact.Remark, &contact.Tags)
	if errors.Is(err, pgx.ErrNoRows) {
		return Contact{}, false, nil
	}
	return contact, err == nil, err
}

func (s *Store) persistUser(ctx context.Context, user User) error {
	if s.pg == nil {
		return nil
	}
	settingsJSON, err := encodeUserSettings(user.Settings)
	if err != nil {
		return err
	}
	stickerStoreJSON, err := encodeStickerStore(user.StickerStore)
	if err != nil {
		return err
	}
	_, err = s.pg.pool.Exec(ctx, `UPDATE users SET nickname = $2, signature = $3, avatar_url = $4, settings = $5, language = $6, display_mode = $7, blocked_contact_ids = $8, sticker_store = $9, banned_at = $10, ban_reason = $11 WHERE id = $1`,
		user.ID, user.Nickname, user.Signature, user.Avatar, settingsJSON, user.Language, user.DisplayMode, user.BlockedContactIDs, stickerStoreJSON, user.BannedAt, user.BanReason)
	return err
}

func (s *Store) updateContact(ctx context.Context, userID, contactID, remark string, tags []string) (Contact, error) {
	s.mu.Lock()
	for i := range s.contacts {
		if s.contacts[i].ID == contactID {
			s.contacts[i].Remark = remark
			s.contacts[i].Tags = append([]string(nil), tags...)
			s.mu.Unlock()
			if s.pg != nil {
				if _, err := s.pg.pool.Exec(ctx, `UPDATE contacts SET remark = $3, tags = $4 WHERE owner_user_id = $1 AND contact_user_id = $2`,
					userID, contactID, remark, tags); err != nil {
					return Contact{}, err
				}
			}
			return s.contacts[i], nil
		}
	}
	s.mu.Unlock()
	if s.pg != nil {
		if _, err := s.pg.pool.Exec(ctx, `UPDATE contacts SET remark = $3, tags = $4 WHERE owner_user_id = $1 AND contact_user_id = $2`,
			userID, contactID, remark, tags); err != nil {
			return Contact{}, err
		}
		contact, ok, err := s.contactByIDForUser(ctx, userID, contactID)
		if err != nil {
			return Contact{}, err
		}
		if ok {
			return contact, nil
		}
	}
	return Contact{}, errNotFound
}

func (s *Store) persistMessage(ctx context.Context, msg Message) error {
	if s.pg == nil {
		return nil
	}
	conversation, ok, groupID := s.conversationForPersistence(msg.ConversationID)
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if ok {
		if err := upsertConversation(ctx, tx, conversation, groupID); err != nil {
			return err
		}
	}
	if err := insertMessage(ctx, tx, msg); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_text = $2, last_at = $3, unread = 0 WHERE id = $1`,
		msg.ConversationID, displayMessage(msg), msg.CreatedAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) conversationForPersistence(conversationID string) (Conversation, bool, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, conv := range s.conversations {
		if conv.ID != conversationID {
			continue
		}
		groupID := ""
		if conv.Kind == "group" {
			candidate := strings.TrimPrefix(conv.ID, "group-")
			if _, ok := s.groups[candidate]; ok {
				groupID = candidate
			}
		}
		return conv, true, groupID
	}
	return Conversation{}, false, ""
}

func upsertConversation(ctx context.Context, tx pgx.Tx, conv Conversation, groupID string) error {
	_, err := tx.Exec(ctx, `INSERT INTO conversations(id, kind, group_id, title, avatar_url, unread, last_text, last_at, pinned, muted)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, avatar_url = EXCLUDED.avatar_url,
			unread = EXCLUDED.unread, last_text = EXCLUDED.last_text, last_at = EXCLUDED.last_at,
			pinned = EXCLUDED.pinned, muted = EXCLUDED.muted`,
		conv.ID, conv.Kind, groupID, conv.Title, conv.Avatar, conv.Unread, conv.LastText, conv.LastAt, conv.Pinned, conv.Muted)
	return err
}

func (s *Store) persistConversationRead(ctx context.Context, conversationID, userID string, readAt time.Time) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO message_reads(conversation_id, user_id, read_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (conversation_id, user_id) DO UPDATE SET read_at = GREATEST(message_reads.read_at, EXCLUDED.read_at)`,
		conversationID, userID, readAt)
	return err
}

func (s *Store) persistConversationClear(ctx context.Context, conversationID, userID string, clearedAt time.Time) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO conversation_clears(conversation_id, user_id, cleared_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (conversation_id, user_id) DO UPDATE SET cleared_at = GREATEST(conversation_clears.cleared_at, EXCLUDED.cleared_at)`,
		conversationID, userID, clearedAt)
	return err
}

func (s *Store) updateConversationSettings(ctx context.Context, conversationID string, pinned, muted *bool, unread *int) (Conversation, error) {
	s.mu.Lock()
	for i := range s.conversations {
		if s.conversations[i].ID == conversationID {
			if pinned != nil {
				s.conversations[i].Pinned = *pinned
			}
			if muted != nil {
				s.conversations[i].Muted = *muted
			}
			if unread != nil {
				s.conversations[i].Unread = *unread
				if s.conversations[i].Unread < 0 {
					s.conversations[i].Unread = 0
				}
			}
			conversation := s.conversations[i]
			s.mu.Unlock()
			if s.pg != nil {
				if _, err := s.pg.pool.Exec(ctx, `UPDATE conversations SET pinned = $2, muted = $3, unread = $4 WHERE id = $1`,
					conversation.ID, conversation.Pinned, conversation.Muted, conversation.Unread); err != nil {
					return Conversation{}, err
				}
			}
			return conversation, nil
		}
	}
	s.mu.Unlock()
	return Conversation{}, errNotFound
}

func (s *Store) hideConversationFor(ctx context.Context, userID, conversationID string) error {
	s.mu.Lock()
	exists := false
	for _, conversation := range s.conversations {
		if conversation.ID == conversationID {
			exists = true
			break
		}
	}
	if !exists {
		s.mu.Unlock()
		return errNotFound
	}
	if s.conversationHides == nil {
		s.conversationHides = map[string]map[string]bool{}
	}
	if s.conversationHides[userID] == nil {
		s.conversationHides[userID] = map[string]bool{}
	}
	s.conversationHides[userID][conversationID] = true
	s.mu.Unlock()
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO conversation_hides(conversation_id, user_id, hidden_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (conversation_id, user_id) DO UPDATE SET hidden_at = EXCLUDED.hidden_at`,
		conversationID, userID, time.Now())
	return err
}

func (s *Store) unhideConversationFor(ctx context.Context, userID, conversationID string) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `DELETE FROM conversation_hides WHERE conversation_id = $1 AND user_id = $2`, conversationID, userID)
	return err
}

func (s *Store) persistGroupBot(ctx context.Context, bot GroupBot) error {
	if s.pg == nil {
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := upsertGroupBot(ctx, tx, bot); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) persistGroupBotDelete(ctx context.Context, groupID, botID string) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `DELETE FROM group_bots WHERE group_id = $1 AND bot_id = $2`, groupID, botID)
	return err
}

func (s *Store) deleteMessages(ctx context.Context, conversationID string, messageIDs []string, currentUserID string) error {
	if len(messageIDs) == 0 {
		return nil
	}
	targets := map[string]bool{}
	for _, id := range messageIDs {
		if strings.TrimSpace(id) != "" {
			targets[id] = true
		}
	}
	if len(targets) == 0 {
		return nil
	}

	s.mu.Lock()
	messages := s.messages[conversationID]
	found := 0
	canDeleteAny := s.canDeleteAnyMessageLocked(conversationID, currentUserID)
	for _, message := range messages {
		if !targets[message.ID] {
			continue
		}
		found++
		if message.SenderID != currentUserID && !canDeleteAny {
			s.mu.Unlock()
			return errForbidden
		}
	}
	if found != len(targets) {
		s.mu.Unlock()
		return errNotFound
	}
	filtered := messages[:0]
	for _, message := range messages {
		if !targets[message.ID] {
			filtered = append(filtered, message)
		}
	}
	s.messages[conversationID] = filtered
	s.refreshConversationPreviewLocked(conversationID)
	s.mu.Unlock()

	if s.pg == nil {
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for id := range targets {
		if _, err := tx.Exec(ctx, `DELETE FROM messages WHERE id = $1 AND conversation_id = $2`, id, conversationID); err != nil {
			return err
		}
	}
	var lastText string
	var lastAt time.Time
	s.mu.RLock()
	for _, conv := range s.conversations {
		if conv.ID == conversationID {
			lastText = conv.LastText
			lastAt = conv.LastAt
			break
		}
	}
	s.mu.RUnlock()
	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_text = $2, last_at = $3, unread = 0 WHERE id = $1`,
		conversationID, lastText, lastAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) canDeleteAnyMessageLocked(conversationID, userID string) bool {
	if !strings.HasPrefix(conversationID, "group-") {
		return false
	}
	groupID := strings.TrimPrefix(conversationID, "group-")
	group, ok := s.groups[groupID]
	if !ok {
		return false
	}
	return canManageGroupRole(groupRoleFor(group, userID))
}

func (s *Store) refreshConversationPreviewLocked(conversationID string) {
	messages := s.messages[conversationID]
	lastText := ""
	lastAt := time.Now()
	if len(messages) > 0 {
		last := messages[len(messages)-1]
		lastText = displayMessage(last)
		lastAt = last.CreatedAt
	}
	for i := range s.conversations {
		if s.conversations[i].ID == conversationID {
			s.conversations[i].LastText = lastText
			s.conversations[i].LastAt = lastAt
			s.conversations[i].Unread = 0
			return
		}
	}
}

func (s *Store) persistFriendRequestFor(ctx context.Context, toUserID string, request FriendRequest) error {
	if s.pg == nil {
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := upsertFriendRequest(ctx, tx, toUserID, request); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) persistGroupJoinRequest(ctx context.Context, request GroupJoinRequest) error {
	if s.pg == nil {
		return nil
	}
	var inviterID any
	if request.Inviter != nil && request.Inviter.ID != "" {
		inviterID = request.Inviter.ID
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO group_join_requests(id, group_id, user_id, inviter_user_id, greeting, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (id) DO UPDATE SET inviter_user_id = EXCLUDED.inviter_user_id, greeting = EXCLUDED.greeting, status = EXCLUDED.status`,
		request.ID, request.GroupID, request.User.ID, inviterID, request.Greeting, request.Status, request.CreatedAt)
	return err
}

func (s *Store) persistGroupBlacklistEntry(ctx context.Context, entry GroupBlacklistEntry) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO group_blacklist(group_id, user_id, reason, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (group_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, created_at = EXCLUDED.created_at`,
		entry.GroupID, entry.User.ID, entry.Reason, entry.CreatedAt)
	return err
}

func (s *Store) deleteGroupBlacklistEntry(ctx context.Context, groupID, userID string) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `DELETE FROM group_blacklist WHERE group_id = $1 AND user_id = $2`, groupID, userID)
	return err
}

func (s *Store) appendAuditLog(ctx context.Context, log AuditLog) error {
	if log.ID == "" {
		log.ID = newID("audit")
	}
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now()
	}
	s.mu.Lock()
	s.auditLogs = append([]AuditLog{log}, s.auditLogs...)
	s.mu.Unlock()
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO group_audit_logs(id, group_id, actor_user_id, actor_name, action, target_id, target_name, detail, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		log.ID, log.GroupID, log.ActorID, log.ActorName, log.Action, log.TargetID, log.TargetName, log.Detail, log.CreatedAt)
	return err
}

func (s *Store) persistGroupFor(ctx context.Context, ownerID string, group Group, conversationID string) error {
	if s.pg == nil {
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := upsertGroup(ctx, tx, ownerID, group); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO conversations(id, kind, group_id, title, avatar_url, unread, last_text, last_at)
		VALUES ($1, 'group', $2, $3, $4, 0, '群聊已创建', now())
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, avatar_url = EXCLUDED.avatar_url`,
		conversationID, group.ID, group.Title, group.Avatar); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) persistReportFor(ctx context.Context, reporterID string, report Report) error {
	if s.pg == nil {
		return nil
	}
	targetType := "group"
	if strings.HasPrefix(report.TargetID, "session-") {
		targetType = "user"
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO reports(id, reporter_user_id, target_type, target_id, reason, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		report.ID, reporterID, targetType, report.TargetID, report.Reason, report.CreatedAt)
	return err
}

func (s *Store) saveCollectionFor(ctx context.Context, userID string, collection Collection) error {
	s.mu.Lock()
	s.collections = append([]Collection{collection}, s.collections...)
	s.mu.Unlock()
	if s.pg == nil {
		return nil
	}
	var messageID any
	if collection.MessageID != "" {
		messageID = collection.MessageID
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO collections(id, user_id, message_id, kind, title, preview, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		collection.ID, userID, messageID, collection.Kind, collection.Title, collection.Preview, collection.CreatedAt)
	return err
}

func (s *Store) collectionByMessageFor(userID, messageID string) (Collection, bool) {
	if strings.TrimSpace(messageID) == "" {
		return Collection{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, collection := range s.collections {
		if collection.MessageID == messageID {
			return collection, true
		}
	}
	return Collection{}, false
}

func (s *Store) feedbackFor(ctx context.Context, userID string) ([]Feedback, error) {
	if s.pg == nil {
		s.mu.RLock()
		defer s.mu.RUnlock()
		var items []Feedback
		for _, item := range s.feedback {
			if item.UserID == userID {
				items = append(items, item)
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
		return items, nil
	}
	rows, err := s.pg.pool.Query(ctx, `SELECT id, user_id, type, text, status, created_at
		FROM feedback WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Feedback
	for rows.Next() {
		var item Feedback
		if err := rows.Scan(&item.ID, &item.UserID, &item.Type, &item.Text, &item.Status, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) saveFeedback(ctx context.Context, item Feedback) error {
	s.mu.Lock()
	s.feedback = append([]Feedback{item}, s.feedback...)
	s.mu.Unlock()
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `INSERT INTO feedback(id, user_id, type, text, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		item.ID, item.UserID, item.Type, item.Text, item.Status, item.CreatedAt)
	return err
}

func (s *Store) dissolveGroup(ctx context.Context, groupID string) error {
	conversationID := "group-" + groupID
	s.mu.Lock()
	if _, ok := s.groups[groupID]; !ok {
		s.mu.Unlock()
		return errNotFound
	}
	delete(s.groups, groupID)
	delete(s.messages, conversationID)
	delete(s.messageReads, conversationID)
	delete(s.messageClears, conversationID)
	delete(s.groupBots, groupID)
	s.joinRequests = filterSlice(s.joinRequests, func(request GroupJoinRequest) bool { return request.GroupID != groupID })
	s.blacklists = filterSlice(s.blacklists, func(entry GroupBlacklistEntry) bool { return entry.GroupID != groupID })
	s.auditLogs = filterSlice(s.auditLogs, func(log AuditLog) bool { return log.GroupID != groupID })
	s.conversations = filterSlice(s.conversations, func(conversation Conversation) bool { return conversation.ID != conversationID })
	s.mu.Unlock()

	if s.pg == nil {
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM conversations WHERE id = $1 OR group_id = $2`, conversationID, groupID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM groups WHERE id = $1`, groupID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) updateFriendRequest(ctx context.Context, currentUserID, requestID, status string) (FriendRequest, error) {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		var updated FriendRequest
		var found bool
		for i, request := range s.requests {
			if request.ID != requestID {
				continue
			}
			s.requests[i].Status = status
			if !found && (s.isSeedUser(currentUserID) || s.friendRequestVisibleToUser(request, currentUserID)) {
				s.requests[i].Status = status
				updated = s.requests[i]
				found = true
			}
			if status == "accepted" && !contactExists(s.contacts, request.User.ID) {
				s.contacts = append(s.contacts, request.User)
			}
			if status == "accepted" {
				s.ensureAcceptedFriendConversationLocked(currentUserID, request.User)
			}
		}
		if !found {
			return FriendRequest{}, errNotFound
		}
		return updated, nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return FriendRequest{}, err
	}
	defer tx.Rollback(ctx)
	var request FriendRequest
	var fromUserID string
	err = tx.QueryRow(ctx, `SELECT fr.from_user_id, u.id, u.nickname, u.signature, u.chat_id, u.avatar_url, fr.greeting, fr.status, fr.created_at
		FROM friend_requests fr JOIN users u ON u.id = fr.from_user_id
		WHERE fr.id = $1 AND fr.to_user_id = $2`, requestID, currentUserID).
		Scan(&fromUserID, &request.User.ID, &request.User.Nickname, &request.User.Signature, &request.User.ChatID, &request.User.Avatar, &request.Greeting, &request.Status, &request.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return FriendRequest{}, errNotFound
	}
	if err != nil {
		return FriendRequest{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE friend_requests SET status = $1 WHERE id = $2`, status, requestID); err != nil {
		return FriendRequest{}, err
	}
	if status == "accepted" {
		if _, err := tx.Exec(ctx, `INSERT INTO contacts(owner_user_id, contact_user_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`, currentUserID, fromUserID); err != nil {
			return FriendRequest{}, err
		}
		conversationID := canonicalPrivateConversationID(currentUserID, fromUserID)
		if conversationID != "" {
			if _, err := tx.Exec(ctx, `INSERT INTO conversations(id, kind, title, avatar_url, unread, last_text, last_at)
				VALUES ($1, 'session', $2, $3, 0, '你们已是好友，可以开始聊天了!', now())
				ON CONFLICT (id) DO NOTHING`,
				conversationID, request.User.Nickname, request.User.Avatar); err != nil {
				return FriendRequest{}, err
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return FriendRequest{}, err
	}
	request.ID = requestID
	request.Status = status
	return request, nil
}

func (s *Store) createGroupJoinRequest(ctx context.Context, groupID string, user User, greeting, joinCode string) (GroupJoinRequest, error) {
	group, ok := s.groupForRead(groupID)
	if !ok {
		return GroupJoinRequest{}, errNotFound
	}
	joinCode = strings.TrimSpace(joinCode)
	if joinCode != "" && joinCode != groupJoinCode(group) {
		return GroupJoinRequest{}, errInvalidTarget
	}
	if joinCode != "" && isGroupQRCodeExpired(group, time.Now()) {
		return GroupJoinRequest{}, errInvalidTarget
	}
	if s.isGroupBlacklisted(groupID, user.ID, user.ChatID) {
		return GroupJoinRequest{}, errGroupBlacklisted
	}
	if groupHasUser(group, user.ID) {
		request := GroupJoinRequest{
			ID:        newID("gjr"),
			GroupID:   groupID,
			User:      user.AsContact(),
			Greeting:  strings.TrimSpace(greeting),
			Status:    "accepted",
			CreatedAt: time.Now(),
		}
		return request, nil
	}
	if group.JoinMode == "closed" {
		return GroupJoinRequest{}, errGroupJoinClosed
	}
	if group.JoinMode == "approval" {
		s.mu.RLock()
		for _, request := range s.joinRequests {
			if request.GroupID == groupID && request.User.ID == user.ID && request.Status == "pending" {
				s.mu.RUnlock()
				return request, nil
			}
		}
		s.mu.RUnlock()
	}
	status := "pending"
	if group.JoinMode == "" || group.JoinMode == "public_qr" {
		status = "accepted"
	}
	request := GroupJoinRequest{
		ID:        newID("gjr"),
		GroupID:   groupID,
		User:      user.AsContact(),
		Greeting:  strings.TrimSpace(greeting),
		Status:    status,
		CreatedAt: time.Now(),
	}
	s.mu.Lock()
	s.joinRequests = append([]GroupJoinRequest{request}, s.joinRequests...)
	s.mu.Unlock()
	if err := s.persistGroupJoinRequest(ctx, request); err != nil {
		return GroupJoinRequest{}, err
	}
	if status == "accepted" {
		if _, err := s.addGroupMember(ctx, groupID, user.ID, "", "member"); err != nil {
			return GroupJoinRequest{}, err
		}
	}
	return request, nil
}

func (s *Store) createGroupInviteRequest(ctx context.Context, groupID string, inviter User, user User, greeting string) (GroupJoinRequest, error) {
	group, ok := s.groupForRead(groupID)
	if !ok {
		return GroupJoinRequest{}, errNotFound
	}
	if groupHasUser(group, user.ID) {
		return GroupJoinRequest{
			ID:        newID("gjr"),
			GroupID:   groupID,
			User:      user.AsContact(),
			Inviter:   contactPtr(inviter.AsContact()),
			Greeting:  strings.TrimSpace(greeting),
			Status:    "accepted",
			CreatedAt: time.Now(),
		}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, request := range s.joinRequests {
		if request.GroupID == groupID && request.User.ID == user.ID && request.Status == "pending" {
			return request, nil
		}
	}
	request := GroupJoinRequest{
		ID:        newID("gjr"),
		GroupID:   groupID,
		User:      user.AsContact(),
		Inviter:   contactPtr(inviter.AsContact()),
		Greeting:  defaultString(strings.TrimSpace(greeting), "邀请你加入群聊"),
		Status:    "pending",
		CreatedAt: time.Now(),
	}
	s.joinRequests = append([]GroupJoinRequest{request}, s.joinRequests...)
	if err := s.persistGroupJoinRequest(ctx, request); err != nil {
		return GroupJoinRequest{}, err
	}
	return request, nil
}

func contactPtr(contact Contact) *Contact {
	return &contact
}

func (s *Store) refreshGroupQRCode(ctx context.Context, groupID, ownerID, expiryMode string) (Group, error) {
	expiresAt, err := groupQRCodeExpiry(expiryMode, time.Now())
	if err != nil {
		return Group{}, err
	}
	s.mu.Lock()
	group, ok := s.groups[groupID]
	if !ok {
		s.mu.Unlock()
		return Group{}, errNotFound
	}
	oldCode := groupJoinCode(group)
	for group.QRCode == "" || group.QRCode == oldCode {
		group.QRCode = newQRCode()
	}
	group.QRCodeExpiresAt = expiresAt
	s.groups[groupID] = group
	s.mu.Unlock()
	if err := s.persistGroupFor(ctx, ownerID, group, "group-"+group.ID); err != nil {
		return Group{}, err
	}
	return group, nil
}

func groupQRCodeExpiry(mode string, now time.Time) (*time.Time, error) {
	switch strings.TrimSpace(mode) {
	case "", "7d":
		expiresAt := now.Add(7 * 24 * time.Hour)
		return &expiresAt, nil
	case "1d":
		expiresAt := now.Add(24 * time.Hour)
		return &expiresAt, nil
	case "permanent":
		return nil, nil
	default:
		return nil, errInvalidStatus
	}
}

func (s *Store) updateGroupJoinRequest(ctx context.Context, groupID, requestID, status string) (GroupJoinRequest, error) {
	if status != "accepted" && status != "rejected" {
		return GroupJoinRequest{}, errInvalidStatus
	}
	s.mu.Lock()
	var updated GroupJoinRequest
	found := false
	for _, request := range s.joinRequests {
		if request.GroupID == groupID && request.ID == requestID {
			updated = request
			found = true
			break
		}
	}
	s.mu.Unlock()
	if !found {
		return GroupJoinRequest{}, errNotFound
	}
	if status == "accepted" && s.isGroupBlacklisted(groupID, updated.User.ID, updated.User.ChatID) {
		return GroupJoinRequest{}, errGroupBlacklisted
	}
	updated.Status = status
	s.mu.Lock()
	for i, request := range s.joinRequests {
		if request.GroupID == groupID && request.ID == requestID {
			s.joinRequests[i] = updated
			break
		}
	}
	s.mu.Unlock()
	if err := s.persistGroupJoinRequest(ctx, updated); err != nil {
		return GroupJoinRequest{}, err
	}
	if status == "accepted" {
		if _, err := s.addGroupMember(ctx, groupID, updated.User.ID, "", "member"); err != nil {
			return GroupJoinRequest{}, err
		}
	}
	return updated, nil
}

func (s *Store) groupBlacklist(groupID string) []GroupBlacklistEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entries := make([]GroupBlacklistEntry, 0)
	for _, entry := range s.blacklists {
		if entry.GroupID == groupID {
			entries = append(entries, entry)
		}
	}
	return entries
}

func (s *Store) isGroupBlacklisted(groupID, userID, chatID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, entry := range s.blacklists {
		if entry.GroupID != groupID {
			continue
		}
		if userID != "" && entry.User.ID == userID {
			return true
		}
		if chatID != "" && entry.User.ChatID == chatID {
			return true
		}
	}
	return false
}

func (s *Store) addGroupBlacklistEntry(ctx context.Context, groupID, actorID, userID, chatID, reason string) (GroupBlacklistEntry, error) {
	user, found, err := s.resolveGroupBlacklistUser(ctx, userID, chatID)
	if err != nil {
		return GroupBlacklistEntry{}, err
	}
	if !found {
		return GroupBlacklistEntry{}, errNotFound
	}

	entry := GroupBlacklistEntry{
		GroupID:   groupID,
		User:      user.AsContact(),
		Reason:    reason,
		CreatedAt: time.Now(),
	}
	removedFromGroup := false
	rejectedRequests := []GroupJoinRequest{}
	s.mu.Lock()
	group, ok := s.groups[groupID]
	if !ok {
		s.mu.Unlock()
		return GroupBlacklistEntry{}, errNotFound
	}
	actorRole := groupRoleFor(group, actorID)
	targetRole := groupRoleFor(group, user.ID)
	if !canManageGroupRole(actorRole) {
		s.mu.Unlock()
		return GroupBlacklistEntry{}, errForbidden
	}
	if targetRole == "owner" {
		s.mu.Unlock()
		return GroupBlacklistEntry{}, errInvalidTarget
	}
	if actorRole == "admin" && targetRole != "" && targetRole != "member" {
		s.mu.Unlock()
		return GroupBlacklistEntry{}, errForbidden
	}
	for i := range group.Members {
		if group.Members[i].UserID == user.ID {
			if entry.User.Nickname == "" {
				entry.User.Nickname = group.Members[i].Nickname
			}
			group.Members = append(group.Members[:i], group.Members[i+1:]...)
			removedFromGroup = true
			break
		}
	}
	s.groups[groupID] = group
	replaced := false
	for i := range s.blacklists {
		if s.blacklists[i].GroupID == groupID && s.blacklists[i].User.ID == user.ID {
			s.blacklists[i] = entry
			replaced = true
			break
		}
	}
	if !replaced {
		s.blacklists = append([]GroupBlacklistEntry{entry}, s.blacklists...)
	}
	for i, request := range s.joinRequests {
		if request.GroupID == groupID && request.User.ID == user.ID && request.Status == "pending" {
			s.joinRequests[i].Status = "rejected"
			rejectedRequests = append(rejectedRequests, s.joinRequests[i])
		}
	}
	s.mu.Unlock()

	if err := s.persistGroupBlacklistEntry(ctx, entry); err != nil {
		return GroupBlacklistEntry{}, err
	}
	for _, request := range rejectedRequests {
		if err := s.persistGroupJoinRequest(ctx, request); err != nil {
			return GroupBlacklistEntry{}, err
		}
	}
	if removedFromGroup && s.pg != nil {
		if _, err := s.pg.pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, groupID, user.ID); err != nil {
			return GroupBlacklistEntry{}, err
		}
	}
	return entry, nil
}

func (s *Store) removeGroupBlacklistEntry(ctx context.Context, groupID, userID string) (GroupBlacklistEntry, error) {
	s.mu.Lock()
	var removed GroupBlacklistEntry
	found := false
	for i, entry := range s.blacklists {
		if entry.GroupID == groupID && entry.User.ID == userID {
			removed = entry
			s.blacklists = append(s.blacklists[:i], s.blacklists[i+1:]...)
			found = true
			break
		}
	}
	s.mu.Unlock()
	if !found {
		return GroupBlacklistEntry{}, errNotFound
	}
	if err := s.deleteGroupBlacklistEntry(ctx, groupID, userID); err != nil {
		return GroupBlacklistEntry{}, err
	}
	return removed, nil
}

func (s *Store) resolveGroupBlacklistUser(ctx context.Context, userID, chatID string) (User, bool, error) {
	if userID != "" {
		return s.userByID(ctx, userID)
	}
	contact, err := s.findContactByChatID(ctx, chatID)
	if err != nil {
		return User{}, false, err
	}
	if contact.ID == "" {
		return User{}, false, nil
	}
	return User{ID: contact.ID, Nickname: contact.Nickname, ChatID: contact.ChatID, Signature: contact.Signature, Avatar: contact.Avatar}, true, nil
}

func (s *Store) resolveUserForGroupInvite(ctx context.Context, userID, chatID string) (User, bool, error) {
	if strings.TrimSpace(userID) != "" {
		return s.userByID(ctx, strings.TrimSpace(userID))
	}
	contact, err := s.findContactByChatID(ctx, strings.TrimSpace(chatID))
	if err != nil {
		return User{}, false, err
	}
	if contact.ID == "" {
		return User{}, false, nil
	}
	user, ok, err := s.userByID(ctx, contact.ID)
	if err != nil {
		return User{}, false, err
	}
	if ok {
		return user, true, nil
	}
	return User{ID: contact.ID, Nickname: contact.Nickname, ChatID: contact.ChatID, Signature: contact.Signature, Avatar: contact.Avatar}, true, nil
}

func (s *Store) addGroupMember(ctx context.Context, groupID, userID, chatID, role string) (Member, error) {
	if role == "" {
		role = "member"
	}
	var user User
	var found bool
	var err error
	if userID != "" {
		user, found, err = s.userByID(ctx, userID)
	} else {
		contact, lookupErr := s.findContactByChatID(ctx, chatID)
		err = lookupErr
		if contact.ID != "" {
			user = User{ID: contact.ID, Nickname: contact.Nickname, ChatID: contact.ChatID, Signature: contact.Signature, Avatar: contact.Avatar}
			found = true
		}
	}
	if err != nil {
		return Member{}, err
	}
	if !found {
		return Member{}, errNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	group, ok := s.groups[groupID]
	if !ok {
		for _, discoverGroup := range s.discoverGroups {
			if discoverGroup.ID == groupID {
				group = discoverGroup
				s.groups[groupID] = group
				ok = true
				break
			}
		}
		if !ok {
			return Member{}, errNotFound
		}
	}
	member := Member{UserID: user.ID, Nickname: user.Nickname, Role: role}
	replaced := false
	for i := range group.Members {
		if group.Members[i].UserID == user.ID {
			member.Muted = group.Members[i].Muted
			group.Members[i] = member
			replaced = true
			break
		}
	}
	if !replaced {
		member.Muted = group.AutoMuteNewMembers && role == "member"
		group.Members = append(group.Members, member)
	}
	s.groups[groupID] = group
	conversationID := "group-" + groupID
	conversationExists := false
	for _, conversation := range s.conversations {
		if conversation.ID == conversationID {
			conversationExists = true
			break
		}
	}
	if !conversationExists {
		s.conversations = append([]Conversation{{
			ID:       conversationID,
			Kind:     "group",
			Title:    group.Title,
			Avatar:   group.Avatar,
			LastText: "你已加入群聊",
			LastAt:   time.Now(),
		}}, s.conversations...)
	}
	if s.pg != nil {
		var mutedUntil any
		if member.Muted {
			mutedUntil = time.Now().Add(365 * 24 * time.Hour)
		}
		_, err = s.pg.pool.Exec(ctx, `INSERT INTO group_members(group_id, user_id, role, nickname, muted_until)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, nickname = EXCLUDED.nickname, muted_until = EXCLUDED.muted_until`,
			groupID, member.UserID, member.Role, member.Nickname, mutedUntil)
		if err != nil {
			return Member{}, err
		}
		_, err = s.pg.pool.Exec(ctx, `INSERT INTO conversations(id, kind, group_id, title, avatar_url, unread, last_text, last_at)
			VALUES ($1, 'group', $2, $3, $4, 0, '你已加入群聊', now())
			ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, avatar_url = EXCLUDED.avatar_url`,
			conversationID, groupID, group.Title, group.Avatar)
	}
	return member, err
}

func (s *Store) updateGroupMember(ctx context.Context, groupID, userID, role string, muted *bool) (Member, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	group, ok := s.groups[groupID]
	if !ok {
		return Member{}, errNotFound
	}
	for i := range group.Members {
		if group.Members[i].UserID == userID {
			if role != "" {
				group.Members[i].Role = role
			}
			if muted != nil {
				group.Members[i].Muted = *muted
			}
			member := group.Members[i]
			s.groups[groupID] = group
			if s.pg != nil {
				var mutedUntil any
				if member.Muted {
					mutedUntil = time.Now().Add(365 * 24 * time.Hour)
				}
				_, err := s.pg.pool.Exec(ctx, `UPDATE group_members SET role = $3, nickname = $4, muted_until = $5 WHERE group_id = $1 AND user_id = $2`,
					groupID, userID, member.Role, member.Nickname, mutedUntil)
				return member, err
			}
			return member, nil
		}
	}
	return Member{}, errNotFound
}

func (s *Store) transferGroupOwner(ctx context.Context, groupID, currentOwnerID, newOwnerID string) (Group, error) {
	if newOwnerID == "" || newOwnerID == currentOwnerID {
		return Group{}, errInvalidTarget
	}
	s.mu.Lock()
	group, ok := s.groups[groupID]
	if !ok {
		s.mu.Unlock()
		return Group{}, errNotFound
	}
	foundCurrentOwner := false
	foundNewOwner := false
	for i := range group.Members {
		if group.Members[i].UserID == currentOwnerID && group.Members[i].Role == "owner" {
			group.Members[i].Role = "admin"
			foundCurrentOwner = true
		}
		if group.Members[i].UserID == newOwnerID {
			group.Members[i].Role = "owner"
			foundNewOwner = true
		}
	}
	if !foundCurrentOwner || !foundNewOwner {
		s.mu.Unlock()
		return Group{}, errInvalidTarget
	}
	s.groups[groupID] = group
	s.mu.Unlock()

	if s.pg == nil {
		return group, nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return Group{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE group_members SET role = CASE WHEN user_id = $2 THEN 'owner' WHEN user_id = $3 THEN 'admin' ELSE role END WHERE group_id = $1`,
		groupID, newOwnerID, currentOwnerID); err != nil {
		return Group{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE groups SET owner_user_id = $2 WHERE id = $1`, groupID, newOwnerID); err != nil {
		return Group{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Group{}, err
	}
	return group, nil
}

func (s *Store) removeGroupMember(ctx context.Context, groupID, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	group, ok := s.groups[groupID]
	if !ok {
		return errNotFound
	}
	for i, member := range group.Members {
		if member.UserID == userID {
			if member.Role == "owner" {
				return errors.New("cannot remove owner")
			}
			group.Members = append(group.Members[:i], group.Members[i+1:]...)
			s.groups[groupID] = group
			if s.pg != nil {
				_, err := s.pg.pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, groupID, userID)
				return err
			}
			return nil
		}
	}
	return errNotFound
}

func upsertUser(ctx context.Context, tx pgx.Tx, user User, passwordHash string) error {
	user = normalizeUserPreferences(user)
	settingsJSON, err := encodeUserSettings(user.Settings)
	if err != nil {
		return err
	}
	stickerStoreJSON, err := encodeStickerStore(user.StickerStore)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO users(id, country_code, phone, password_hash, chat_id, nickname, signature, avatar_url, settings, language, display_mode, blocked_contact_ids, sticker_store, created_at, banned_at, ban_reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		ON CONFLICT (id) DO UPDATE SET country_code = EXCLUDED.country_code, phone = EXCLUDED.phone,
			chat_id = EXCLUDED.chat_id, nickname = EXCLUDED.nickname, signature = EXCLUDED.signature, avatar_url = EXCLUDED.avatar_url,
			settings = EXCLUDED.settings, language = EXCLUDED.language, display_mode = EXCLUDED.display_mode, blocked_contact_ids = EXCLUDED.blocked_contact_ids,
			sticker_store = EXCLUDED.sticker_store, banned_at = EXCLUDED.banned_at, ban_reason = EXCLUDED.ban_reason`,
		user.ID, user.Country, user.Phone, passwordHash, user.ChatID, user.Nickname, user.Signature, user.Avatar, settingsJSON, user.Language, user.DisplayMode, user.BlockedContactIDs, stickerStoreJSON, user.CreatedAt, user.BannedAt, user.BanReason)
	return err
}

func upsertGroup(ctx context.Context, tx pgx.Tx, ownerID string, group Group) error {
	rateLimit := normalizeGroupRateLimit(group.RateLimit)
	rateLimitEnabled := false
	rateLimitWindowSeconds := 10
	rateLimitMaxMessages := 3
	if rateLimit != nil {
		rateLimitEnabled = rateLimit.Enabled
		rateLimitWindowSeconds = rateLimit.WindowSeconds
		rateLimitMaxMessages = rateLimit.MaxMessages
	}
	group.QRCode = defaultString(strings.TrimSpace(group.QRCode), group.ChatID)
	if _, err := tx.Exec(ctx, `INSERT INTO groups(id, chat_id, qr_code, qr_code_expires_at, title, avatar_url, announcement, join_mode, disable_member_add_friend, all_muted, rate_limit_enabled, rate_limit_window_seconds, rate_limit_max_messages, auto_mute_new_members, owner_user_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, avatar_url = EXCLUDED.avatar_url,
			qr_code = EXCLUDED.qr_code,
			qr_code_expires_at = EXCLUDED.qr_code_expires_at,
			announcement = EXCLUDED.announcement, join_mode = EXCLUDED.join_mode,
			disable_member_add_friend = EXCLUDED.disable_member_add_friend,
			all_muted = EXCLUDED.all_muted,
			rate_limit_enabled = EXCLUDED.rate_limit_enabled,
			rate_limit_window_seconds = EXCLUDED.rate_limit_window_seconds,
			rate_limit_max_messages = EXCLUDED.rate_limit_max_messages,
			auto_mute_new_members = EXCLUDED.auto_mute_new_members`,
		group.ID, group.ChatID, group.QRCode, group.QRCodeExpiresAt, group.Title, group.Avatar, group.Announcement, group.JoinMode, group.DisableMemberAddFriend, group.AllMuted, rateLimitEnabled, rateLimitWindowSeconds, rateLimitMaxMessages, group.AutoMuteNewMembers, ownerID, group.CreatedAt); err != nil {
		return err
	}
	members := append([]Member(nil), group.Members...)
	sort.SliceStable(members, func(i, j int) bool {
		if members[i].Role == "owner" {
			return true
		}
		if members[j].Role == "owner" {
			return false
		}
		return members[i].Nickname < members[j].Nickname
	})
	for _, member := range members {
		if _, err := tx.Exec(ctx, `INSERT INTO group_members(group_id, user_id, role, nickname)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, nickname = EXCLUDED.nickname`,
			group.ID, member.UserID, member.Role, member.Nickname); err != nil {
			return err
		}
	}
	return nil
}

func upsertGroupBot(ctx context.Context, tx pgx.Tx, bot GroupBot) error {
	bot = normalizeGroupBot(bot, time.Now())
	botUser := User{ID: "bot-" + bot.ID, Country: "+60", Phone: "bot-" + bot.ID, ChatID: "bot_" + bot.ID, Nickname: bot.Name, Avatar: avatar(firstRune(bot.Name))}
	if err := upsertUser(ctx, tx, botUser, "demo:bot"); err != nil {
		return err
	}
	keywordRulesJSON, err := json.Marshal(bot.KeywordRules)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO group_bots(group_id, bot_id, name, enabled, message, keyword_rules, schedule_mode, interval_seconds, daily_time, next_run_at, last_run_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (group_id, bot_id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled,
			message = EXCLUDED.message, keyword_rules = EXCLUDED.keyword_rules, schedule_mode = EXCLUDED.schedule_mode, interval_seconds = EXCLUDED.interval_seconds,
			daily_time = EXCLUDED.daily_time,
			next_run_at = EXCLUDED.next_run_at, last_run_at = EXCLUDED.last_run_at`,
		bot.GroupID, bot.ID, bot.Name, bot.Enabled, bot.Message, keywordRulesJSON, bot.ScheduleMode, bot.IntervalSeconds, bot.DailyTime, bot.NextRunAt, bot.LastRunAt)
	return err
}

func insertMessage(ctx context.Context, tx pgx.Tx, msg Message) error {
	quote := sanitizeQuote(msg.Quote)
	var quoteMessageID, quoteConversationID, quoteSenderName, quotePreview, quoteType, quoteTypeLabel string
	if quote != nil {
		quoteMessageID = quote.MessageID
		quoteConversationID = quote.ConversationID
		quoteSenderName = quote.SenderName
		quotePreview = quote.Preview
		quoteType = quote.Type
		quoteTypeLabel = quote.TypeLabel
	}
	if _, err := tx.Exec(ctx, `INSERT INTO messages(
			id, conversation_id, sender_user_id, type, body, mentions, created_at,
			quote_message_id, quote_conversation_id, quote_sender_name, quote_preview, quote_type, quote_type_label
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
		msg.ID, msg.ConversationID, msg.SenderID, msg.Type, msg.Body, msg.Mentions, msg.CreatedAt,
		quoteMessageID, quoteConversationID, quoteSenderName, quotePreview, quoteType, quoteTypeLabel); err != nil {
		return err
	}
	if msg.Attachment != nil {
		if _, err := tx.Exec(ctx, `INSERT INTO message_attachments(id, message_id, name, object_key, mime_type, size_bytes)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, object_key = EXCLUDED.object_key,
				mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes`,
			msg.Attachment.ID, msg.ID, msg.Attachment.Name, msg.Attachment.URL, msg.Attachment.MimeType, msg.Attachment.Size); err != nil {
			return err
		}
	}
	return nil
}

func upsertFriendRequest(ctx context.Context, tx pgx.Tx, toUserID string, request FriendRequest) error {
	_, err := tx.Exec(ctx, `INSERT INTO friend_requests(id, from_user_id, to_user_id, greeting, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET greeting = EXCLUDED.greeting, status = EXCLUDED.status`,
		request.ID, request.User.ID, toUserID, request.Greeting, request.Status, request.CreatedAt)
	return err
}

func valueString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func passwordMatches(storedHash, password string) bool {
	if strings.HasPrefix(storedHash, "demo:") {
		return strings.TrimPrefix(storedHash, "demo:") == password
	}
	return bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password)) == nil
}

func encodeUserSettings(settings map[string]bool) ([]byte, error) {
	return json.Marshal(mergeUserSettings(nil, settings))
}

func decodeUserSettings(raw []byte) map[string]bool {
	var settings map[string]bool
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &settings)
	}
	return mergeUserSettings(nil, settings)
}

func encodeStickerStore(store StickerStore) ([]byte, error) {
	return json.Marshal(normalizeStickerStore(store))
}

func decodeStickerStore(raw []byte) StickerStore {
	var store StickerStore
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &store)
	}
	return normalizeStickerStore(store)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func uniqueChatID() string {
	return newChatID()
}

func firstRune(value string) string {
	for _, r := range value {
		return string(r)
	}
	return "新"
}

func (pg *PostgresStore) Close() {
	if pg != nil && pg.pool != nil {
		pg.pool.Close()
	}
}

func postgresConfigHelp() string {
	return fmt.Sprintf("set DATABASE_URL=%q to enable postgres", "postgresql://appuser:...@127.0.0.1:5432/appdb")
}
