package main

import (
	"context"
	"errors"
	"fmt"
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
	errAlreadyExists = errors.New("already exists")
	errNotFound      = errors.New("not found")
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
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
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
			title TEXT NOT NULL,
			avatar_url TEXT NOT NULL DEFAULT '',
			announcement TEXT NOT NULL DEFAULT '',
			join_mode TEXT NOT NULL DEFAULT 'public_qr',
			owner_user_id TEXT NOT NULL REFERENCES users(id),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS group_members (
			group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
			nickname TEXT NOT NULL DEFAULT '',
			muted_until TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			PRIMARY KEY (group_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS group_join_requests (
			id TEXT PRIMARY KEY,
			group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			greeting TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
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
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			sender_user_id TEXT NOT NULL REFERENCES users(id),
			type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'file', 'voice', 'contact', 'collection')),
			body TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS message_attachments (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			object_key TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			size_bytes BIGINT NOT NULL DEFAULT 0
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
		`CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user ON friend_requests(to_user_id, status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_collections_user_kind ON collections(user_id, kind, created_at)`,
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
		if err := s.pg.seed(ctx, s); err != nil {
			return err
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

func (pg *PostgresStore) hasSeedData(ctx context.Context) (bool, error) {
	var count int
	if err := pg.pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
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
	for _, contact := range s.contacts {
		user := User{ID: contact.ID, Country: "+60", Phone: "000" + contact.ID, ChatID: contact.ChatID, Nickname: contact.Nickname, Signature: contact.Signature, Avatar: contact.Avatar}
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
	for _, conv := range s.conversations {
		groupID := ""
		if conv.Kind == "group" {
			candidate := strings.TrimPrefix(conv.ID, "group-")
			if _, ok := s.groups[candidate]; ok {
				groupID = candidate
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO conversations(id, kind, group_id, title, avatar_url, unread, last_text, last_at)
			VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8)
			ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, avatar_url = EXCLUDED.avatar_url,
				unread = EXCLUDED.unread, last_text = EXCLUDED.last_text, last_at = EXCLUDED.last_at`,
			conv.ID, conv.Kind, groupID, conv.Title, conv.Avatar, conv.Unread, conv.LastText, conv.LastAt); err != nil {
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
	var user User
	err := pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url
		FROM users ORDER BY created_at LIMIT 1`).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar)
	if err != nil {
		return nil, err
	}

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
	groups, err := pg.loadGroups(ctx)
	if err != nil {
		return nil, err
	}
	requests, err := pg.loadFriendRequests(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	collections, err := pg.loadCollections(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	return &Store{
		user:          user,
		contacts:      contacts,
		conversations: conversations,
		messages:      messages,
		groups:        groups,
		requests:      requests,
		collections:   collections,
		hub:           hub,
	}, nil
}

func (pg *PostgresStore) loadContacts(ctx context.Context, userID string) ([]Contact, error) {
	rows, err := pg.pool.Query(ctx, `SELECT u.id, u.nickname, u.signature, u.chat_id, u.avatar_url
		FROM contacts c JOIN users u ON u.id = c.contact_user_id
		WHERE c.owner_user_id = $1 ORDER BY c.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var contacts []Contact
	for rows.Next() {
		var contact Contact
		if err := rows.Scan(&contact.ID, &contact.Nickname, &contact.Signature, &contact.ChatID, &contact.Avatar); err != nil {
			return nil, err
		}
		contacts = append(contacts, contact)
	}
	return contacts, rows.Err()
}

func (pg *PostgresStore) loadConversations(ctx context.Context) ([]Conversation, error) {
	rows, err := pg.pool.Query(ctx, `SELECT id, kind, title, avatar_url, unread, last_text, last_at
		FROM conversations ORDER BY last_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var conversations []Conversation
	for rows.Next() {
		var conv Conversation
		if err := rows.Scan(&conv.ID, &conv.Kind, &conv.Title, &conv.Avatar, &conv.Unread, &conv.LastText, &conv.LastAt); err != nil {
			return nil, err
		}
		conversations = append(conversations, conv)
	}
	return conversations, rows.Err()
}

func (pg *PostgresStore) loadMessages(ctx context.Context, conversationID string) ([]Message, error) {
	rows, err := pg.pool.Query(ctx, `SELECT m.id, m.conversation_id, m.sender_user_id, u.nickname, m.type, m.body, m.created_at,
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
		if err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.SenderName, &msg.Type, &msg.Body, &msg.CreatedAt,
			&attachmentID, &name, &objectKey, &mimeType, &size); err != nil {
			return nil, err
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
	rows, err := pg.pool.Query(ctx, `SELECT id, title, avatar_url, chat_id, announcement, join_mode, created_at
		FROM groups ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := map[string]Group{}
	for rows.Next() {
		var group Group
		if err := rows.Scan(&group.ID, &group.Title, &group.Avatar, &group.ChatID, &group.Announcement, &group.JoinMode, &group.CreatedAt); err != nil {
			return nil, err
		}
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
	rows, err := pg.pool.Query(ctx, `SELECT fr.id, u.id, u.nickname, u.signature, u.chat_id, u.avatar_url, fr.greeting, fr.status, fr.created_at
		FROM friend_requests fr JOIN users u ON u.id = fr.from_user_id
		WHERE fr.to_user_id = $1 ORDER BY fr.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var requests []FriendRequest
	for rows.Next() {
		var request FriendRequest
		if err := rows.Scan(&request.ID, &request.User.ID, &request.User.Nickname, &request.User.Signature,
			&request.User.ChatID, &request.User.Avatar, &request.Greeting, &request.Status, &request.CreatedAt); err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func (pg *PostgresStore) loadCollections(ctx context.Context, userID string) ([]Collection, error) {
	rows, err := pg.pool.Query(ctx, `SELECT id, kind, title, preview, created_at
		FROM collections WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var collections []Collection
	for rows.Next() {
		var collection Collection
		if err := rows.Scan(&collection.ID, &collection.Kind, &collection.Title, &collection.Preview, &collection.CreatedAt); err != nil {
			return nil, err
		}
		collections = append(collections, collection)
	}
	return collections, rows.Err()
}

func (s *Store) authenticate(ctx context.Context, country, phone, password string) (User, bool, error) {
	if s.pg == nil {
		if country == "+60" && phone == "174319676" && password == "demo123456" {
			return s.user, true, nil
		}
		return User{}, false, nil
	}
	var user User
	var passwordHash string
	err := s.pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url, password_hash
		FROM users WHERE country_code = $1 AND phone = $2`,
		country, phone).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar, &passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	if !passwordMatches(passwordHash, password) {
		return User{}, false, nil
	}
	return user, true, nil
}

func (s *Store) createUser(ctx context.Context, country, phone, password, nickname string) (User, error) {
	user := User{
		ID:        newID("user"),
		Country:   country,
		Phone:     phone,
		ChatID:    uniqueChatID(phone),
		Nickname:  nickname,
		Signature: "",
		Avatar:    avatar(firstRune(nickname)),
	}
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.sessions == nil {
			s.sessions = map[string]string{}
		}
		return user, nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	_, err = s.pg.pool.Exec(ctx, `INSERT INTO users(id, country_code, phone, password_hash, chat_id, nickname, signature, avatar_url)
		VALUES ($1, $2, $3, $4, $5, $6, '', $7)`,
		user.ID, user.Country, user.Phone, string(hash), user.ChatID, user.Nickname, user.Avatar)
	if isUniqueViolation(err) {
		return User{}, errAlreadyExists
	}
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) userByID(ctx context.Context, userID string) (User, bool, error) {
	if userID == s.user.ID {
		return s.user, true, nil
	}
	if s.pg == nil {
		for _, contact := range s.contacts {
			if contact.ID == userID {
				return User{ID: contact.ID, Country: "+60", Phone: "", ChatID: contact.ChatID, Nickname: contact.Nickname, Signature: contact.Signature, Avatar: contact.Avatar}, true, nil
			}
		}
		return User{}, false, nil
	}
	var user User
	err := s.pg.pool.QueryRow(ctx, `SELECT id, phone, country_code, chat_id, nickname, signature, avatar_url
		FROM users WHERE id = $1`, userID).Scan(&user.ID, &user.Phone, &user.Country, &user.ChatID, &user.Nickname, &user.Signature, &user.Avatar)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	return user, true, nil
}

func (s *Store) findContactByChatID(ctx context.Context, chatID string) (Contact, error) {
	if chatID == "" {
		return Contact{}, nil
	}
	for _, contact := range s.contacts {
		if contact.ChatID == chatID || contact.ID == chatID {
			return contact, nil
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

func (s *Store) persistUser(ctx context.Context, user User) error {
	if s.pg == nil {
		return nil
	}
	_, err := s.pg.pool.Exec(ctx, `UPDATE users SET nickname = $2, signature = $3, avatar_url = $4 WHERE id = $1`,
		user.ID, user.Nickname, user.Signature, user.Avatar)
	return err
}

func (s *Store) persistMessage(ctx context.Context, msg Message) error {
	if s.pg == nil {
		return nil
	}
	tx, err := s.pg.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := insertMessage(ctx, tx, msg); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_text = $2, last_at = $3, unread = 0 WHERE id = $1`,
		msg.ConversationID, displayMessage(msg), msg.CreatedAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
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

func (s *Store) updateFriendRequest(ctx context.Context, currentUserID, requestID, status string) (FriendRequest, error) {
	if s.pg == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		for i, request := range s.requests {
			if request.ID == requestID {
				s.requests[i].Status = status
				if status == "accepted" {
					s.contacts = append(s.contacts, request.User)
				}
				return s.requests[i], nil
			}
		}
		return FriendRequest{}, errNotFound
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
	}
	if err := tx.Commit(ctx); err != nil {
		return FriendRequest{}, err
	}
	request.ID = requestID
	request.Status = status
	return request, nil
}

func (s *Store) addGroupMember(ctx context.Context, groupID, userID, chatID, role string) (Member, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	group, ok := s.groups[groupID]
	if !ok {
		return Member{}, errNotFound
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
	member := Member{UserID: user.ID, Nickname: user.Nickname, Role: role}
	replaced := false
	for i := range group.Members {
		if group.Members[i].UserID == user.ID {
			group.Members[i] = member
			replaced = true
			break
		}
	}
	if !replaced {
		group.Members = append(group.Members, member)
	}
	s.groups[groupID] = group
	if s.pg != nil {
		_, err = s.pg.pool.Exec(ctx, `INSERT INTO group_members(group_id, user_id, role, nickname)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, nickname = EXCLUDED.nickname`,
			groupID, member.UserID, member.Role, member.Nickname)
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
	_, err := tx.Exec(ctx, `INSERT INTO users(id, country_code, phone, password_hash, chat_id, nickname, signature, avatar_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO UPDATE SET country_code = EXCLUDED.country_code, phone = EXCLUDED.phone,
			chat_id = EXCLUDED.chat_id, nickname = EXCLUDED.nickname, signature = EXCLUDED.signature, avatar_url = EXCLUDED.avatar_url`,
		user.ID, user.Country, user.Phone, passwordHash, user.ChatID, user.Nickname, user.Signature, user.Avatar)
	return err
}

func upsertGroup(ctx context.Context, tx pgx.Tx, ownerID string, group Group) error {
	if _, err := tx.Exec(ctx, `INSERT INTO groups(id, chat_id, title, avatar_url, announcement, join_mode, owner_user_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, avatar_url = EXCLUDED.avatar_url,
			announcement = EXCLUDED.announcement, join_mode = EXCLUDED.join_mode`,
		group.ID, group.ChatID, group.Title, group.Avatar, group.Announcement, group.JoinMode, ownerID, group.CreatedAt); err != nil {
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

func insertMessage(ctx context.Context, tx pgx.Tx, msg Message) error {
	if _, err := tx.Exec(ctx, `INSERT INTO messages(id, conversation_id, sender_user_id, type, body, created_at)
		VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
		msg.ID, msg.ConversationID, msg.SenderID, msg.Type, msg.Body, msg.CreatedAt); err != nil {
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

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func uniqueChatID(phone string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, phone)
	if len(cleaned) > 6 {
		cleaned = cleaned[len(cleaned)-6:]
	}
	return "u" + cleaned + fmt.Sprintf("%04d", time.Now().UnixNano()%10000)
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
