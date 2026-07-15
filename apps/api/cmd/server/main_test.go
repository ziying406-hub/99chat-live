package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestSignFileRejectsInvalidSizes(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	emptyReq := httptest.NewRequest(http.MethodPost, "/api/files/sign", bytes.NewBufferString(`{"name":"empty.txt","mimeType":"text/plain","size":0}`))
	emptyRec := httptest.NewRecorder()
	mux.ServeHTTP(emptyRec, emptyReq)
	if emptyRec.Code != http.StatusBadRequest {
		t.Fatalf("expected empty file 400, got %d: %s", emptyRec.Code, emptyRec.Body.String())
	}

	largeReq := httptest.NewRequest(http.MethodPost, "/api/files/sign", bytes.NewBufferString(`{"name":"big.zip","mimeType":"application/zip","size":68157440}`))
	largeRec := httptest.NewRecorder()
	mux.ServeHTTP(largeRec, largeReq)
	if largeRec.Code != http.StatusBadRequest {
		t.Fatalf("expected large file 400, got %d: %s", largeRec.Code, largeRec.Body.String())
	}
}

func TestAdminLoginReturnsTokenAndProfile(t *testing.T) {
	store := seedStore()
	mux := store.routes("")

	req := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(`{"username":"admin","password":"admin123"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected admin login 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var response struct {
		Token string    `json:"token"`
		Admin AdminUser `json:"admin"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode admin login response: %v", err)
	}
	if response.Token == "" {
		t.Fatal("expected admin token")
	}
	if response.Admin.Username != "admin" || response.Admin.Role != "super_admin" {
		t.Fatalf("unexpected admin profile: %+v", response.Admin)
	}
	if !containsString(response.Admin.Permissions, "admins.role_update") || !containsString(response.Admin.Permissions, "reports.view") {
		t.Fatalf("expected admin permissions in login response, got %+v", response.Admin.Permissions)
	}
}

func TestAdminRoutesRequireAdminToken(t *testing.T) {
	store := seedStore()
	mux := store.routes("")

	req := httptest.NewRequest(http.MethodGet, "/api/admin/auth/me", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without admin token, got %d: %s", rec.Code, rec.Body.String())
	}
}

func adminTokenForTest(t *testing.T, mux http.Handler) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(`{"username":"admin","password":"admin123"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin login failed: %d %s", rec.Code, rec.Body.String())
	}
	var response struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode admin token: %v", err)
	}
	return response.Token
}

func adminTokenForRoleForTest(t *testing.T, store *Store, mux http.Handler, role string) string {
	t.Helper()
	password := "role-pass-123"
	admin := AdminUserRecord{
		AdminUser: AdminUser{
			ID:        "admin-" + role,
			Username:  role,
			Role:      role,
			CreatedAt: time.Now().Add(-time.Hour),
		},
		PasswordHash: mustHashPasswordForTest(t, password),
	}
	store.adminUsers[admin.ID] = admin

	req := httptest.NewRequest(http.MethodPost, "/api/admin/auth/login", bytes.NewBufferString(fmt.Sprintf(`{"username":%q,"password":%q}`, role, password)))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin login for role %s failed: %d %s", role, rec.Code, rec.Body.String())
	}
	var response struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode admin token for role %s: %v", role, err)
	}
	return response.Token
}

func mustHashPasswordForTest(t *testing.T, password string) string {
	t.Helper()
	hash, err := hashPassword(password)
	if err != nil {
		t.Fatalf("hash test password: %v", err)
	}
	return hash
}

func TestAdminRolePermissionsAllowSupportToViewReportsOnly(t *testing.T) {
	store := seedStore()
	store.reports = []Report{{ID: "report-support-view", TargetID: "u1", TargetType: "user", Reason: "needs help", CreatedAt: time.Now()}}
	mux := store.routes("")
	token := adminTokenForRoleForTest(t, store, mux, "support")

	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/reports", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected support reports view 200, got %d: %s", listRec.Code, listRec.Body.String())
	}

	resolveReq := httptest.NewRequest(http.MethodPost, "/api/admin/reports/report-support-view/resolve", bytes.NewBufferString(`{"status":"resolved","resolution":"handled"}`))
	resolveReq.Header.Set("Authorization", "Bearer "+token)
	resolveRec := httptest.NewRecorder()
	mux.ServeHTTP(resolveRec, resolveReq)
	if resolveRec.Code != http.StatusForbidden {
		t.Fatalf("expected support report resolve 403, got %d: %s", resolveRec.Code, resolveRec.Body.String())
	}
}

func TestAdminRolePermissionsDenyUnknownRoles(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForRoleForTest(t, store, mux, "unknown_role")

	req := httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected unknown role 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAdminSystemSettingsCanBeReadAndUpdated(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	getReq := httptest.NewRequest(http.MethodGet, "/api/admin/settings", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected settings read 200, got %d: %s", getRec.Code, getRec.Body.String())
	}

	var settings AdminSystemSettings
	if err := json.NewDecoder(getRec.Body).Decode(&settings); err != nil {
		t.Fatalf("decode settings: %v", err)
	}
	if !settings.RegistrationEnabled || settings.MaxUploadBytes == 0 || settings.MaxGroupMembers == 0 {
		t.Fatalf("unexpected default settings: %+v", settings)
	}

	updateBody := `{"registrationEnabled":false,"maxUploadBytes":2048,"maxGroupMembers":88,"sensitiveWords":[" spam ","Spam","广告"],"spamDetectionEnabled":true}`
	updateReq := httptest.NewRequest(http.MethodPost, "/api/admin/settings", bytes.NewBufferString(updateBody))
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateRec := httptest.NewRecorder()
	mux.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected settings update 200, got %d: %s", updateRec.Code, updateRec.Body.String())
	}

	var updated AdminSystemSettings
	if err := json.NewDecoder(updateRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated settings: %v", err)
	}
	if updated.RegistrationEnabled || updated.MaxUploadBytes != 2048 || updated.MaxGroupMembers != 88 || !updated.SpamDetectionEnabled {
		t.Fatalf("unexpected updated settings: %+v", updated)
	}
	if fmt.Sprint(updated.SensitiveWords) != "[spam 广告]" {
		t.Fatalf("expected trimmed deduped sensitive words, got %+v", updated.SensitiveWords)
	}
	if len(store.adminAuditLogs) == 0 || store.adminAuditLogs[0].Action != "system_settings_updated" {
		t.Fatalf("expected system settings audit log, got %+v", store.adminAuditLogs)
	}
}

func TestAdminSystemSettingsRejectInvalidValues(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/settings", bytes.NewBufferString(`{"registrationEnabled":true,"maxUploadBytes":99,"maxGroupMembers":1}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid settings 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(store.adminAuditLogs) != 0 {
		t.Fatalf("expected no audit log for invalid settings, got %+v", store.adminAuditLogs)
	}
}

func TestAdminSystemSettingsRequireUpdatePermission(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForRoleForTest(t, store, mux, "support")

	req := httptest.NewRequest(http.MethodPost, "/api/admin/settings", bytes.NewBufferString(`{"registrationEnabled":true,"maxUploadBytes":2048,"maxGroupMembers":20}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected support settings update 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAdminAccountManagementListCreateDisableAndRoleUpdate(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	createReq := httptest.NewRequest(http.MethodPost, "/api/admin/admins", bytes.NewBufferString(`{"username":"support-one","password":"support-pass-123","role":"support"}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected admin create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	var created AdminUser
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created admin: %v", err)
	}
	if created.ID == "" || created.Username != "support-one" || created.Role != "support" || len(created.Permissions) == 0 {
		t.Fatalf("unexpected created admin: %+v", created)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/admins", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected admin list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var admins []AdminUser
	if err := json.NewDecoder(listRec.Body).Decode(&admins); err != nil {
		t.Fatalf("decode admin list: %v", err)
	}
	if len(admins) != 2 {
		t.Fatalf("expected 2 admins, got %+v", admins)
	}

	statusReq := httptest.NewRequest(http.MethodPost, "/api/admin/admins/"+created.ID+"/status", bytes.NewBufferString(`{"disabled":true}`))
	statusReq.Header.Set("Authorization", "Bearer "+token)
	statusRec := httptest.NewRecorder()
	mux.ServeHTTP(statusRec, statusReq)
	if statusRec.Code != http.StatusOK {
		t.Fatalf("expected disable admin 200, got %d: %s", statusRec.Code, statusRec.Body.String())
	}
	if store.adminUsers[created.ID].DisabledAt == nil {
		t.Fatalf("expected created admin disabled, got %+v", store.adminUsers[created.ID].AdminUser)
	}

	roleReq := httptest.NewRequest(http.MethodPost, "/api/admin/admins/"+created.ID+"/role", bytes.NewBufferString(`{"role":"moderator"}`))
	roleReq.Header.Set("Authorization", "Bearer "+token)
	roleRec := httptest.NewRecorder()
	mux.ServeHTTP(roleRec, roleReq)
	if roleRec.Code != http.StatusOK {
		t.Fatalf("expected role update 200, got %d: %s", roleRec.Code, roleRec.Body.String())
	}
	if store.adminUsers[created.ID].Role != "moderator" {
		t.Fatalf("expected moderator role, got %+v", store.adminUsers[created.ID].AdminUser)
	}
	if len(store.adminAuditLogs) < 3 {
		t.Fatalf("expected audit logs for create, disable, and role update, got %+v", store.adminAuditLogs)
	}
}

func TestAdminAccountManagementProtectsSelfAndPermissions(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	selfStatusReq := httptest.NewRequest(http.MethodPost, "/api/admin/admins/admin-1/status", bytes.NewBufferString(`{"disabled":true}`))
	selfStatusReq.Header.Set("Authorization", "Bearer "+token)
	selfStatusRec := httptest.NewRecorder()
	mux.ServeHTTP(selfStatusRec, selfStatusReq)
	if selfStatusRec.Code != http.StatusBadRequest {
		t.Fatalf("expected self disable 400, got %d: %s", selfStatusRec.Code, selfStatusRec.Body.String())
	}

	selfRoleReq := httptest.NewRequest(http.MethodPost, "/api/admin/admins/admin-1/role", bytes.NewBufferString(`{"role":"support"}`))
	selfRoleReq.Header.Set("Authorization", "Bearer "+token)
	selfRoleRec := httptest.NewRecorder()
	mux.ServeHTTP(selfRoleRec, selfRoleReq)
	if selfRoleRec.Code != http.StatusBadRequest {
		t.Fatalf("expected self role update 400, got %d: %s", selfRoleRec.Code, selfRoleRec.Body.String())
	}

	supportToken := adminTokenForRoleForTest(t, store, mux, "support")
	createReq := httptest.NewRequest(http.MethodPost, "/api/admin/admins", bytes.NewBufferString(`{"username":"blocked","password":"blocked-pass-123","role":"support"}`))
	createReq.Header.Set("Authorization", "Bearer "+supportToken)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusForbidden {
		t.Fatalf("expected support admin create 403, got %d: %s", createRec.Code, createRec.Body.String())
	}
}

func TestAdminDashboardReturnsCounts(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected dashboard 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var response map[string]int
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	if response["totalUsers"] == 0 || response["totalGroups"] == 0 || response["totalMessages"] == 0 {
		t.Fatalf("expected nonzero dashboard counts, got %+v", response)
	}
}

func TestAdminDeleteMessageWritesAuditLog(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	messageID := store.messages["group-21444"][0].ID
	req := httptest.NewRequest(http.MethodDelete, "/api/admin/messages/"+messageID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected delete 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if messageExists(store.messages["group-21444"], messageID) {
		t.Fatal("message still exists after admin delete")
	}
	if len(store.adminAuditLogs) == 0 || store.adminAuditLogs[0].Action != "message_deleted" {
		t.Fatalf("expected message_deleted audit, got %+v", store.adminAuditLogs)
	}
}

func TestAdminResolveReportUpdatesStatus(t *testing.T) {
	store := seedStore()
	store.reports = append(store.reports, Report{ID: "report-admin-1", TargetID: "u-demo", TargetType: "user", Reason: "spam", CreatedAt: time.Now()})
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/reports/report-admin-1/resolve", bytes.NewBufferString(`{"status":"resolved","resolution":"warning sent"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected resolve 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.reports[0].Status != "resolved" || store.reports[0].Resolution != "warning sent" {
		t.Fatalf("unexpected report state: %+v", store.reports[0])
	}
}

func TestAdminResolveReportSupportsReviewingAndRejected(t *testing.T) {
	store := seedStore()
	store.reports = []Report{
		{ID: "report-reviewing", TargetID: "u1", TargetType: "user", Reason: "spam", CreatedAt: time.Now().Add(-time.Minute)},
		{ID: "report-rejected", TargetID: "group-21444", TargetType: "group", Reason: "noise", CreatedAt: time.Now()},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	reviewReq := httptest.NewRequest(http.MethodPost, "/api/admin/reports/report-reviewing/resolve", bytes.NewBufferString(`{"status":"reviewing","resolution":"triaging"}`))
	reviewReq.Header.Set("Authorization", "Bearer "+token)
	reviewRec := httptest.NewRecorder()
	mux.ServeHTTP(reviewRec, reviewReq)
	if reviewRec.Code != http.StatusOK {
		t.Fatalf("expected reviewing update 200, got %d: %s", reviewRec.Code, reviewRec.Body.String())
	}
	var reviewing Report
	if err := json.NewDecoder(reviewRec.Body).Decode(&reviewing); err != nil {
		t.Fatalf("decode reviewing report: %v", err)
	}
	if reviewing.Status != "reviewing" || reviewing.Resolution != "triaging" {
		t.Fatalf("expected reviewing response, got %+v", reviewing)
	}
	if reviewing.ResolvedByAdminID != "" || reviewing.ResolvedAt != nil {
		t.Fatalf("expected reviewing report to stay unresolved, got %+v", reviewing)
	}

	rejectReq := httptest.NewRequest(http.MethodPost, "/api/admin/reports/report-rejected/resolve", bytes.NewBufferString(`{"status":"rejected","resolution":"not actionable"}`))
	rejectReq.Header.Set("Authorization", "Bearer "+token)
	rejectRec := httptest.NewRecorder()
	mux.ServeHTTP(rejectRec, rejectReq)
	if rejectRec.Code != http.StatusOK {
		t.Fatalf("expected rejected update 200, got %d: %s", rejectRec.Code, rejectRec.Body.String())
	}
	var rejected Report
	if err := json.NewDecoder(rejectRec.Body).Decode(&rejected); err != nil {
		t.Fatalf("decode rejected report: %v", err)
	}
	if rejected.Status != "rejected" || rejected.Resolution != "not actionable" {
		t.Fatalf("expected rejected response, got %+v", rejected)
	}
	if rejected.ResolvedByAdminID != "admin-1" || rejected.ResolvedAt == nil {
		t.Fatalf("expected rejected report resolution metadata, got %+v", rejected)
	}
	if len(store.adminAuditLogs) < 2 {
		t.Fatalf("expected audit logs for reviewing and rejected updates, got %+v", store.adminAuditLogs)
	}
	if store.adminAuditLogs[0].Action != "report_rejected" || store.adminAuditLogs[1].Action != "report_reviewing" {
		t.Fatalf("unexpected report audit log actions: %+v", store.adminAuditLogs[:2])
	}
}

func TestAdminFeedbackRoutesNormalizeStatusAndDashboardCounts(t *testing.T) {
	store := seedStore()
	store.feedback = []Feedback{
		{ID: "feedback-old", UserID: "u1", Type: "Bug 反馈", Text: "旧反馈", Status: "已提交", CreatedAt: time.Now().Add(-time.Hour)},
		{ID: "feedback-new", UserID: "u1", Type: "Bug 反馈", Text: "新反馈", Status: "reviewing", CreatedAt: time.Now()},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/feedback", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected feedback list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var items []Feedback
	if err := json.NewDecoder(listRec.Body).Decode(&items); err != nil {
		t.Fatalf("decode feedback list: %v", err)
	}
	if len(items) != 2 || items[1].Status != "submitted" {
		t.Fatalf("expected normalized feedback statuses, got %+v", items)
	}

	detailReq := httptest.NewRequest(http.MethodGet, "/api/admin/feedback/feedback-old", nil)
	detailReq.Header.Set("Authorization", "Bearer "+token)
	detailRec := httptest.NewRecorder()
	mux.ServeHTTP(detailRec, detailReq)
	if detailRec.Code != http.StatusOK {
		t.Fatalf("expected feedback detail 200, got %d: %s", detailRec.Code, detailRec.Body.String())
	}
	var detail Feedback
	if err := json.NewDecoder(detailRec.Body).Decode(&detail); err != nil {
		t.Fatalf("decode feedback detail: %v", err)
	}
	if detail.Status != "submitted" {
		t.Fatalf("expected normalized feedback detail status, got %+v", detail)
	}

	updateReq := httptest.NewRequest(http.MethodPost, "/api/admin/feedback/feedback-old/status", bytes.NewBufferString(`{"status":"resolved","adminNote":"done"}`))
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateRec := httptest.NewRecorder()
	mux.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected feedback update 200, got %d: %s", updateRec.Code, updateRec.Body.String())
	}

	dashboardReq := httptest.NewRequest(http.MethodGet, "/api/admin/dashboard", nil)
	dashboardReq.Header.Set("Authorization", "Bearer "+token)
	dashboardRec := httptest.NewRecorder()
	mux.ServeHTTP(dashboardRec, dashboardReq)
	if dashboardRec.Code != http.StatusOK {
		t.Fatalf("expected dashboard 200, got %d: %s", dashboardRec.Code, dashboardRec.Body.String())
	}
	var dashboard map[string]int
	if err := json.NewDecoder(dashboardRec.Body).Decode(&dashboard); err != nil {
		t.Fatalf("decode dashboard: %v", err)
	}
	if dashboard["openFeedback"] != 1 {
		t.Fatalf("expected 1 open feedback after resolution, got %+v", dashboard)
	}
}

func TestAdminFeedbackStatusRejectsUnknownAndAcceptsLegacyChinese(t *testing.T) {
	store := seedStore()
	store.feedback = []Feedback{
		{ID: "feedback-old", UserID: "u1", Type: "Bug 反馈", Text: "旧反馈", Status: "已提交", CreatedAt: time.Now().Add(-time.Hour)},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	badReq := httptest.NewRequest(http.MethodPost, "/api/admin/feedback/feedback-old/status", bytes.NewBufferString(`{"status":"closed","adminNote":"bad"}`))
	badReq.Header.Set("Authorization", "Bearer "+token)
	badRec := httptest.NewRecorder()
	mux.ServeHTTP(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid feedback status 400, got %d: %s", badRec.Code, badRec.Body.String())
	}
	if store.feedback[0].Status != "已提交" {
		t.Fatalf("expected feedback to remain unchanged after invalid update, got %+v", store.feedback[0])
	}
	if len(store.adminAuditLogs) != 0 {
		t.Fatalf("expected no audit log on invalid update, got %+v", store.adminAuditLogs)
	}

	goodReq := httptest.NewRequest(http.MethodPost, "/api/admin/feedback/feedback-old/status", bytes.NewBufferString(`{"status":"已解决","adminNote":"done"}`))
	goodReq.Header.Set("Authorization", "Bearer "+token)
	goodRec := httptest.NewRecorder()
	mux.ServeHTTP(goodRec, goodReq)
	if goodRec.Code != http.StatusOK {
		t.Fatalf("expected legacy Chinese feedback status 200, got %d: %s", goodRec.Code, goodRec.Body.String())
	}
	var updated Feedback
	if err := json.NewDecoder(goodRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode feedback update: %v", err)
	}
	if updated.Status != "resolved" {
		t.Fatalf("expected admin response to normalize legacy status, got %+v", updated)
	}
	if store.feedback[0].Status != "已解决" {
		t.Fatalf("expected legacy status to persist as Chinese user-facing value, got %+v", store.feedback[0])
	}
}

func TestUserFeedbackHistoryKeepsChineseStatusAfterAdminUpdate(t *testing.T) {
	store := seedStore()
	store.feedback = []Feedback{
		{ID: "feedback-old", UserID: "u1", Type: "Bug 反馈", Text: "旧反馈", Status: "已提交", CreatedAt: time.Now().Add(-time.Hour)},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	updateReq := httptest.NewRequest(http.MethodPost, "/api/admin/feedback/feedback-old/status", bytes.NewBufferString(`{"status":"reviewing","adminNote":"checking"}`))
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateRec := httptest.NewRecorder()
	mux.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("expected feedback update 200, got %d: %s", updateRec.Code, updateRec.Body.String())
	}
	var adminItem Feedback
	if err := json.NewDecoder(updateRec.Body).Decode(&adminItem); err != nil {
		t.Fatalf("decode admin feedback update: %v", err)
	}
	if adminItem.Status != "reviewing" {
		t.Fatalf("expected admin status to stay normalized, got %+v", adminItem)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/feedback", nil)
	listReq.Header.Set("Authorization", "Bearer demo-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected feedback list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var items []map[string]any
	if err := json.NewDecoder(listRec.Body).Decode(&items); err != nil {
		t.Fatalf("decode user feedback list: %v", err)
	}
	if len(items) != 1 || items[0]["status"] != "处理中" {
		t.Fatalf("expected user-facing Chinese status after admin update, got %+v", items)
	}
	if _, ok := items[0]["adminNote"]; ok {
		t.Fatalf("user-facing feedback leaked adminNote: %+v", items[0])
	}
	if _, ok := items[0]["resolvedByAdminId"]; ok {
		t.Fatalf("user-facing feedback leaked resolvedByAdminId: %+v", items[0])
	}
	if _, ok := items[0]["resolvedAt"]; ok {
		t.Fatalf("user-facing feedback leaked resolvedAt: %+v", items[0])
	}
}

func TestAdminReportsTreatBlankStatusAsOpen(t *testing.T) {
	store := seedStore()
	store.reports = []Report{
		{ID: "report-blank", TargetID: "u1", TargetType: "user", Reason: "spam", Status: "", CreatedAt: time.Now()},
		{ID: "report-resolved", TargetID: "u2", TargetType: "user", Reason: "ads", Status: "resolved", CreatedAt: time.Now().Add(-time.Minute)},
	}

	items, err := store.adminReports(context.Background(), "open", "")
	if err != nil {
		t.Fatalf("adminReports failed: %v", err)
	}
	if len(items) != 1 || items[0].ID != "report-blank" || items[0].Status != "open" {
		t.Fatalf("expected blank status to normalize to open, got %+v", items)
	}
}

func TestAdminGroupsRouteFiltersByKeywordAndJoinMode(t *testing.T) {
	store := seedStore()
	store.groups["g-filter-open"] = Group{
		ID:        "g-filter-open",
		Title:     "Review Circle",
		ChatID:    "review-open",
		JoinMode:  "open",
		CreatedAt: time.Now().Add(-2 * time.Hour),
	}
	store.groups["g-filter-invite"] = Group{
		ID:        "g-filter-invite",
		Title:     "Review Invite",
		ChatID:    "review-invite",
		JoinMode:  "invite",
		CreatedAt: time.Now().Add(-time.Hour),
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/groups?keyword=review&joinMode=invite", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected groups 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var groups []Group
	if err := json.NewDecoder(rec.Body).Decode(&groups); err != nil {
		t.Fatalf("decode groups: %v", err)
	}
	if len(groups) != 1 || groups[0].ID != "g-filter-invite" {
		t.Fatalf("expected invite review group only, got %+v", groups)
	}
}

func TestAdminGroupBlacklistEndpointsAddAndRemoveEntriesWithAuditLogs(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	addReq := httptest.NewRequest(http.MethodPost, "/api/admin/groups/21444/blacklist/388754", bytes.NewBufferString(`{"reason":"spam waves"}`))
	addReq.Header.Set("Authorization", "Bearer "+token)
	addRec := httptest.NewRecorder()
	mux.ServeHTTP(addRec, addReq)
	if addRec.Code != http.StatusCreated {
		t.Fatalf("expected admin blacklist add 201, got %d: %s", addRec.Code, addRec.Body.String())
	}
	var added GroupBlacklistEntry
	if err := json.NewDecoder(addRec.Body).Decode(&added); err != nil {
		t.Fatalf("decode admin blacklist add: %v", err)
	}
	if added.User.ID != "388754" || added.Reason != "spam waves" {
		t.Fatalf("unexpected blacklist entry: %+v", added)
	}
	if groupHasMember(store.groups["21444"], "388754") {
		t.Fatal("expected admin blacklist add to remove member from group")
	}
	if len(store.adminAuditLogs) == 0 || store.adminAuditLogs[0].Action != "group_blacklist_added" {
		t.Fatalf("expected admin blacklist add audit log, got %+v", store.adminAuditLogs)
	}

	removeReq := httptest.NewRequest(http.MethodDelete, "/api/admin/groups/21444/blacklist/388754", nil)
	removeReq.Header.Set("Authorization", "Bearer "+token)
	removeRec := httptest.NewRecorder()
	mux.ServeHTTP(removeRec, removeReq)
	if removeRec.Code != http.StatusOK {
		t.Fatalf("expected admin blacklist remove 200, got %d: %s", removeRec.Code, removeRec.Body.String())
	}
	if store.isGroupBlacklisted("21444", "388754", "") {
		t.Fatal("expected admin blacklist remove to delete blacklist entry")
	}
	if len(store.adminAuditLogs) < 2 || store.adminAuditLogs[0].Action != "group_blacklist_removed" {
		t.Fatalf("expected admin blacklist remove audit log, got %+v", store.adminAuditLogs)
	}
}

func TestAdminGroupBlacklistAddRollsBackWhenAuditFails(t *testing.T) {
	store := seedStore()
	store.adminAuditLogHook = func(AdminAuditLog) error {
		return errors.New("audit failed")
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/groups/21444/blacklist/388754", bytes.NewBufferString(`{"reason":"spam waves"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected audit failure 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !groupHasMember(store.groups["21444"], "388754") {
		t.Fatal("member was removed even though admin audit failed")
	}
	if store.isGroupBlacklisted("21444", "388754", "") {
		t.Fatal("blacklist entry was created even though admin audit failed")
	}
	if len(store.adminAuditLogs) != 0 {
		t.Fatalf("expected no admin audit logs recorded on failure, got %+v", store.adminAuditLogs)
	}
}

func TestAdminGroupBlacklistRemoveRollsBackWhenAuditFails(t *testing.T) {
	store := seedStore()
	entry, err := store.adminAddGroupBlacklistEntry(context.Background(), "21444", "388754", "", "spam waves")
	if err != nil {
		t.Fatalf("seed admin blacklist entry: %v", err)
	}
	store.adminAuditLogHook = func(AdminAuditLog) error {
		return errors.New("audit failed")
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/groups/21444/blacklist/"+entry.User.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected audit failure 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !store.isGroupBlacklisted("21444", entry.User.ID, "") {
		t.Fatal("blacklist entry was removed even though admin audit failed")
	}
	if len(store.adminAuditLogs) != 0 {
		t.Fatalf("expected no admin audit logs recorded on failure, got %+v", store.adminAuditLogs)
	}
}

func TestAdminMessagesRouteFiltersByTypeAndDate(t *testing.T) {
	store := seedStore()
	conversationID := "admin-filter-conv"
	store.conversations = append(store.conversations, Conversation{
		ID:       conversationID,
		Kind:     "group",
		Title:    "Admin Filter Conversation",
		LastAt:   time.Now(),
		LastText: "latest",
	})
	store.messages[conversationID] = []Message{
		{
			ID:             "msg-filter-text",
			ConversationID: conversationID,
			SenderID:       "u1",
			SenderName:     "Alice",
			Type:           "text",
			Body:           "earlier text",
			CreatedAt:      time.Date(2026, 7, 7, 8, 0, 0, 0, time.UTC),
		},
		{
			ID:             "msg-filter-image",
			ConversationID: conversationID,
			SenderID:       "u1",
			SenderName:     "Alice",
			Type:           "image",
			Body:           "later image",
			CreatedAt:      time.Date(2026, 7, 8, 8, 0, 0, 0, time.UTC),
		},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/messages?conversationId="+conversationID+"&type=image&from=2026-07-08&to=2026-07-08", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected messages 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var items []adminMessageRecord
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	if len(items) != 1 || items[0].ID != "msg-filter-image" {
		t.Fatalf("expected filtered image message only, got %+v", items)
	}
}

func TestAdminReportsRouteFiltersByStatusAndTarget(t *testing.T) {
	store := seedStore()
	store.reports = []Report{
		{ID: "report-user-open", TargetID: "u1", TargetType: "user", Reason: "spam", Status: "open", CreatedAt: time.Now()},
		{ID: "report-group-open", TargetID: "group-21444", TargetType: "group", Reason: "noise", Status: "open", CreatedAt: time.Now().Add(-time.Minute)},
		{ID: "report-user-resolved", TargetID: "u2", TargetType: "user", Reason: "done", Status: "resolved", CreatedAt: time.Now().Add(-2 * time.Minute)},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/reports?status=open&target=user", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected reports 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var items []Report
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode reports: %v", err)
	}
	if len(items) != 1 || items[0].ID != "report-user-open" {
		t.Fatalf("expected open user report only, got %+v", items)
	}
}

func TestAdminFeedbackRouteFiltersByUserAndStatus(t *testing.T) {
	store := seedStore()
	store.feedback = []Feedback{
		{ID: "feedback-u1-submitted", UserID: "u1", Type: "Bug", Text: "one", Status: "已提交", CreatedAt: time.Now().Add(-time.Hour)},
		{ID: "feedback-u2-reviewing", UserID: "u2", Type: "Idea", Text: "two", Status: "reviewing", CreatedAt: time.Now()},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/feedback?user=u2&status=reviewing", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected feedback 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var items []Feedback
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode feedback: %v", err)
	}
	if len(items) != 1 || items[0].ID != "feedback-u2-reviewing" {
		t.Fatalf("expected reviewing feedback for u2 only, got %+v", items)
	}
}

func TestAdminAuditLogsRouteFiltersByAdminActionTargetAndDate(t *testing.T) {
	store := seedStore()
	store.adminAuditLogs = []AdminAuditLog{
		{
			ID:            "audit-match",
			AdminUserID:   "admin-1",
			AdminUsername: "admin",
			Action:        "user_banned",
			TargetType:    "user",
			TargetID:      "u1",
			Detail:        "spam",
			CreatedAt:     time.Date(2026, 7, 8, 10, 0, 0, 0, time.UTC),
		},
		{
			ID:            "audit-miss",
			AdminUserID:   "ops-2",
			AdminUsername: "ops",
			Action:        "message_deleted",
			TargetType:    "message",
			TargetID:      "msg-1",
			Detail:        "cleanup",
			CreatedAt:     time.Date(2026, 7, 6, 10, 0, 0, 0, time.UTC),
		},
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/audit-logs?admin=admin&action=user_banned&target=user&from=2026-07-08&to=2026-07-08", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected audit logs 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var items []AdminAuditLog
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatalf("decode audit logs: %v", err)
	}
	if len(items) != 1 || items[0].ID != "audit-match" {
		t.Fatalf("expected filtered audit log only, got %+v", items)
	}
}

func TestPublicUserResponsesOmitModerationFields(t *testing.T) {
	store := seedStore()
	store.user.BanReason = "internal only"
	mux := store.routes("")

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","password":"demo123456"}`))
	loginRec := httptest.NewRecorder()
	mux.ServeHTTP(loginRec, loginReq)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected password login 200, got %d: %s", loginRec.Code, loginRec.Body.String())
	}
	var loginResponse map[string]any
	if err := json.NewDecoder(loginRec.Body).Decode(&loginResponse); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	loginUser, ok := loginResponse["user"].(map[string]any)
	if !ok {
		t.Fatalf("expected user object in login response, got %+v", loginResponse)
	}
	if _, exists := loginUser["bannedAt"]; exists {
		t.Fatalf("login response leaked bannedAt: %+v", loginUser)
	}
	if _, exists := loginUser["banReason"]; exists {
		t.Fatalf("login response leaked banReason: %+v", loginUser)
	}

	meReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	meReq.Header.Set("Authorization", "Bearer demo-token")
	meRec := httptest.NewRecorder()
	mux.ServeHTTP(meRec, meReq)
	if meRec.Code != http.StatusOK {
		t.Fatalf("expected /api/me 200, got %d: %s", meRec.Code, meRec.Body.String())
	}
	var meResponse map[string]any
	if err := json.NewDecoder(meRec.Body).Decode(&meResponse); err != nil {
		t.Fatalf("decode /api/me response: %v", err)
	}
	if _, exists := meResponse["bannedAt"]; exists {
		t.Fatalf("/api/me leaked bannedAt: %+v", meResponse)
	}
	if _, exists := meResponse["banReason"]; exists {
		t.Fatalf("/api/me leaked banReason: %+v", meResponse)
	}
}

func TestPostgresResetDataTablesIncludeAdminSessionsAndAuditLogs(t *testing.T) {
	tables := postgresResetDataTables()
	if !containsString(tables, "admin_sessions") {
		t.Fatalf("expected admin_sessions in reset tables, got %+v", tables)
	}
	if !containsString(tables, "admin_audit_logs") {
		t.Fatalf("expected admin_audit_logs in reset tables, got %+v", tables)
	}
	if containsString(tables, "admin_users") {
		t.Fatalf("expected admin_users to be preserved during reset, got %+v", tables)
	}
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func TestAdminMuteAllRollsBackWhenAuditFails(t *testing.T) {
	store := seedStore()
	store.adminAuditLogHook = func(AdminAuditLog) error {
		return errors.New("audit failed")
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/groups/21444/mute-all", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected mute-all failure 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if store.groups["21444"].AllMuted {
		t.Fatalf("expected group to remain unmuted after audit failure, got %+v", store.groups["21444"])
	}
	if len(store.adminAuditLogs) != 0 {
		t.Fatalf("expected no admin audit logs recorded on failure, got %+v", store.adminAuditLogs)
	}
}

func TestInferReportTargetTypeUsesGroupForGroupIDs(t *testing.T) {
	if got := inferReportTargetType("group-21444"); got != "group" {
		t.Fatalf("expected group target type for group id, got %q", got)
	}
}

func TestAdminReportTargetTypeConditionIncludesLegacyBlankGroupTargetType(t *testing.T) {
	clause := adminReportTargetTypeCondition(3)
	if !strings.Contains(clause, "target_type = $3") {
		t.Fatalf("expected raw target_type match in clause, got %q", clause)
	}
	if !strings.Contains(clause, "NULLIF(BTRIM(target_type), '') IS NULL") {
		t.Fatalf("expected blank target_type normalization in clause, got %q", clause)
	}
	if !strings.Contains(clause, "target_id LIKE 'group-%' THEN 'group'") {
		t.Fatalf("expected group legacy normalization in clause, got %q", clause)
	}
}

func TestReportsRejectInvalidTargetTypeWithoutAppending(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)
	before := len(store.reports)

	req := httptest.NewRequest(http.MethodPost, "/api/reports", bytes.NewBufferString(`{"targetId":"group-21444","targetType":"weird","reason":"垃圾广告"}`))
	req.Header.Set("Authorization", "Bearer demo-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid target type 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(store.reports) != before {
		t.Fatalf("expected report list unchanged on invalid target type, got %d -> %d", before, len(store.reports))
	}
}

func TestApplyAdminGroupAllMutedUpdatesLiveState(t *testing.T) {
	store := seedStore()
	if store.groups["21444"].AllMuted {
		t.Fatal("expected seed group to start unmuted")
	}
	group := store.groups["21444"]
	group.AllMuted = true

	if ok := store.applyGroupAllMutedUpdate(group); !ok {
		t.Fatal("expected live group state update to succeed")
	}
	if !store.groups["21444"].AllMuted {
		t.Fatalf("expected live group state to reflect mute-all, got %+v", store.groups["21444"])
	}
}

func TestApplyAdminDeleteMessageUpdatesLiveStateAndPreview(t *testing.T) {
	store := seedStore()
	messages := store.messages["group-21444"]
	if len(messages) < 2 {
		t.Fatalf("expected seeded group conversation to contain messages, got %d", len(messages))
	}
	deleted := messages[len(messages)-1]
	expectedPreview := displayMessage(messages[len(messages)-2])

	if ok := store.applyAdminMessageDelete(adminMessageRecord{Message: deleted}); !ok {
		t.Fatal("expected live admin delete update to succeed")
	}
	if messageExists(store.messages["group-21444"], deleted.ID) {
		t.Fatal("expected deleted message to be removed from live cache")
	}
	for _, conv := range store.conversations {
		if conv.ID != "group-21444" {
			continue
		}
		if conv.LastText != expectedPreview {
			t.Fatalf("expected conversation preview %q after delete, got %q", expectedPreview, conv.LastText)
		}
		return
	}
	t.Fatal("expected seeded conversation to exist")
}

func TestAdminBanUserBlocksLoginAndWritesAudit(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/u-demo/ban", bytes.NewBufferString(`{"reason":"spam"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected ban 200, got %d: %s", rec.Code, rec.Body.String())
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","password":"demo123456"}`))
	loginRec := httptest.NewRecorder()
	mux.ServeHTTP(loginRec, loginReq)
	if loginRec.Code != http.StatusForbidden {
		t.Fatalf("expected banned login 403, got %d: %s", loginRec.Code, loginRec.Body.String())
	}
	if len(store.adminAuditLogs) != 1 || store.adminAuditLogs[0].Action != "user_banned" {
		t.Fatalf("expected user_banned audit log, got %+v", store.adminAuditLogs)
	}
}

func TestAdminBanUserBlocksCodeLogin(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/u-demo/ban", bytes.NewBufferString(`{"reason":"spam"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected ban 200, got %d: %s", rec.Code, rec.Body.String())
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/code-login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","code":"123456"}`))
	loginRec := httptest.NewRecorder()
	mux.ServeHTTP(loginRec, loginReq)
	if loginRec.Code != http.StatusForbidden {
		t.Fatalf("expected banned code login 403, got %d: %s", loginRec.Code, loginRec.Body.String())
	}
}

func TestAdminBanUserBlocksRequireAuthWithoutAuthorization(t *testing.T) {
	store := seedStore()
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/u-demo/ban", bytes.NewBufferString(`{"reason":"spam"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected ban 200, got %d: %s", rec.Code, rec.Body.String())
	}

	protectedReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	protectedRec := httptest.NewRecorder()
	mux.ServeHTTP(protectedRec, protectedReq)
	if protectedRec.Code != http.StatusForbidden {
		t.Fatalf("expected banned requireAuth 403 without authorization, got %d: %s", protectedRec.Code, protectedRec.Body.String())
	}
}

func TestAdminBanUserRollsBackWhenAuditFails(t *testing.T) {
	store := seedStore()
	store.adminAuditLogHook = func(AdminAuditLog) error {
		return errors.New("audit failed")
	}
	mux := store.routes("")
	token := adminTokenForTest(t, mux)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/u-demo/ban", bytes.NewBufferString(`{"reason":"spam"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected ban failure 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if userIsBanned(store.user) {
		t.Fatalf("expected demo user to remain unbanned after audit failure, got %+v", store.user)
	}
	if len(store.adminAuditLogs) != 0 {
		t.Fatalf("expected no audit logs recorded on failure, got %+v", store.adminAuditLogs)
	}
}

func TestAdminAuditLogSchemaIncludesAdminUsername(t *testing.T) {
	migration, err := os.ReadFile(filepath.Join("..", "..", "migrations", "001_initial_schema.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if !strings.Contains(string(migration), "admin_username TEXT NOT NULL DEFAULT ''") {
		t.Fatal("migration missing admin_username column")
	}

	dbGo, err := os.ReadFile("db.go")
	if err != nil {
		t.Fatalf("read db.go: %v", err)
	}
	if !strings.Contains(string(dbGo), "admin_username TEXT NOT NULL DEFAULT ''") {
		t.Fatal("db.go missing admin_username column")
	}
}

func TestSignFileRejectsInvalidJSON(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/files/sign", bytes.NewBufferString(`{"name":`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid json 400, got %d: %s", rec.Code, rec.Body.String())
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["error"] != "invalid json" {
		t.Fatalf("error = %q", body["error"])
	}
}

func TestSignFileRejectsTrailingJSON(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/files/sign", bytes.NewBufferString(`{"name":"a.txt","size":1}{}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected trailing json 400, got %d: %s", rec.Code, rec.Body.String())
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["error"] != "invalid json" {
		t.Fatalf("error = %q", body["error"])
	}
}

func TestSignFileInfersMimeTypeFromName(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/files/sign", bytes.NewBufferString(`{"name":"photo.JPG","mimeType":"","size":1024}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected sign 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var signed map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&signed); err != nil {
		t.Fatalf("decode signed upload: %v", err)
	}
	if signed["mimeType"] != "image/jpeg" {
		t.Fatalf("mimeType = %#v", signed["mimeType"])
	}
}

func TestUploadFileRemovesPartialFileOnFailure(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-over-limit/big.bin", bytes.NewReader(make([]byte, maxUploadSizeBytes+1)))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected upload failure 400, got %d: %s", rec.Code, rec.Body.String())
	}
	target := filepath.Join(store.uploadDir, "file-over-limit", "big.bin")
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("expected partial upload to be removed, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Dir(target)); !os.IsNotExist(err) {
		t.Fatalf("expected failed upload directory to be removed, stat err=%v", err)
	}
}

func TestUploadFileDoesNotOverwriteExistingFileOnFailure(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	if err := os.MkdirAll(filepath.Join(store.uploadDir, "file-existing"), 0o755); err != nil {
		t.Fatalf("create upload dir: %v", err)
	}
	target := filepath.Join(store.uploadDir, "file-existing", "keep.bin")
	if err := os.WriteFile(target, []byte("old"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-existing/keep.bin", bytes.NewReader(make([]byte, maxUploadSizeBytes+1)))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected upload failure 400, got %d: %s", rec.Code, rec.Body.String())
	}
	body, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("expected existing file to remain: %v", err)
	}
	if string(body) != "old" {
		t.Fatalf("existing file body = %q", string(body))
	}
}

func TestUploadFileRejectsEmptyBody(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-empty/empty.txt", http.NoBody)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected empty upload 400, got %d: %s", rec.Code, rec.Body.String())
	}
	target := filepath.Join(store.uploadDir, "file-empty", "empty.txt")
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("expected empty upload to be removed, stat err=%v", err)
	}
}

func TestUploadFileRejectsUnsafePathParts(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-1/bad%20name.txt", bytes.NewBufferString("hello"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected unsafe path 400, got %d: %s", rec.Code, rec.Body.String())
	}
	target := filepath.Join(store.uploadDir, "file-1", "bad_name.txt")
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("expected unsafe upload not to be rewritten and saved, stat err=%v", err)
	}
}

func TestUploadFileRejectsNonFileID(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/avatar-1/a.png", bytes.NewBufferString("hello"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected non file id 400, got %d: %s", rec.Code, rec.Body.String())
	}
	target := filepath.Join(store.uploadDir, "avatar-1", "a.png")
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("expected non file id upload not to be saved, stat err=%v", err)
	}
}

func TestUploadFileRejectsEmptyFileIDSuffix(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-/a.png", bytes.NewBufferString("hello"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected empty file id suffix 400, got %d: %s", rec.Code, rec.Body.String())
	}
	target := filepath.Join(store.uploadDir, "file-", "a.png")
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("expected empty suffix upload not to be saved, stat err=%v", err)
	}
}

func TestUploadFileRejectsUnexpectedPathSegments(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-1/extra/name.txt", bytes.NewBufferString("hello"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected unexpected path 400, got %d: %s", rec.Code, rec.Body.String())
	}
	target := filepath.Join(store.uploadDir, "file-1", "name.txt")
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("expected no file to be written, stat err=%v", err)
	}
}

func TestUploadFileCanBeServed(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	uploadReq := httptest.NewRequest(http.MethodPut, "/api/files/upload/file-ok/a.txt", bytes.NewBufferString("hello"))
	uploadRec := httptest.NewRecorder()
	mux.ServeHTTP(uploadRec, uploadReq)

	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("expected upload 201, got %d: %s", uploadRec.Code, uploadRec.Body.String())
	}

	serveReq := httptest.NewRequest(http.MethodGet, "/uploads/file-ok/a.txt", nil)
	serveRec := httptest.NewRecorder()
	mux.ServeHTTP(serveRec, serveReq)

	if serveRec.Code != http.StatusOK {
		t.Fatalf("expected uploaded file 200, got %d: %s", serveRec.Code, serveRec.Body.String())
	}
	if serveRec.Body.String() != "hello" {
		t.Fatalf("uploaded file body = %q", serveRec.Body.String())
	}
}

func TestServeUploadSupportsHead(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	if err := os.MkdirAll(filepath.Join(store.uploadDir, "file-head"), 0o755); err != nil {
		t.Fatalf("create upload dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.uploadDir, "file-head", "a.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write upload fixture: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodHead, "/uploads/file-head/a.txt", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected uploaded file HEAD 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("expected empty HEAD body, got %q", rec.Body.String())
	}
}

func TestServeUploadRejectsUnsafePathParts(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	if err := os.MkdirAll(filepath.Join(store.uploadDir, "file-1"), 0o755); err != nil {
		t.Fatalf("create upload dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.uploadDir, "file-1", "bad_name.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write upload fixture: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/uploads/file-1/bad%20name.txt", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected unsafe public path 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestServeUploadRejectsNonFileID(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	if err := os.MkdirAll(filepath.Join(store.uploadDir, "avatar-1"), 0o755); err != nil {
		t.Fatalf("create upload dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.uploadDir, "avatar-1", "a.png"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write upload fixture: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/uploads/avatar-1/a.png", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected non file id public path 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestServeUploadRejectsEmptyFileIDSuffix(t *testing.T) {
	store := seedStore()
	store.uploadDir = t.TempDir()
	if err := os.MkdirAll(filepath.Join(store.uploadDir, "file-"), 0o755); err != nil {
		t.Fatalf("create upload dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.uploadDir, "file-", "a.png"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write upload fixture: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/uploads/file-/a.png", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected empty file id suffix public path 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestChangePasswordRequiresCurrentPasswordAndUpdatesLogin(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	badBody := bytes.NewBufferString(`{"oldPassword":"wrong-password","newPassword":"newpass123"}`)
	badReq := httptest.NewRequest(http.MethodPost, "/api/me/password", badBody)
	badReq.Header.Set("Authorization", "Bearer demo-token")
	badRec := httptest.NewRecorder()
	mux.ServeHTTP(badRec, badReq)

	if badRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong current password 401, got %d: %s", badRec.Code, badRec.Body.String())
	}

	goodBody := bytes.NewBufferString(`{"oldPassword":"demo123456","newPassword":"newpass123"}`)
	goodReq := httptest.NewRequest(http.MethodPost, "/api/me/password", goodBody)
	goodReq.Header.Set("Authorization", "Bearer demo-token")
	goodRec := httptest.NewRecorder()
	mux.ServeHTTP(goodRec, goodReq)

	if goodRec.Code != http.StatusOK {
		t.Fatalf("expected password change 200, got %d: %s", goodRec.Code, goodRec.Body.String())
	}

	_, ok, err := store.authenticate(context.Background(), "+60", "174319676", "demo123456")
	if err != nil {
		t.Fatalf("authenticate old password: %v", err)
	}
	if ok {
		t.Fatal("old password still authenticates after password change")
	}

	_, ok, err = store.authenticate(context.Background(), "+60", "174319676", "newpass123")
	if err != nil {
		t.Fatalf("authenticate new password: %v", err)
	}
	if !ok {
		t.Fatal("new password does not authenticate after password change")
	}
}

func TestResetPasswordRequiresDemoCodeAndUpdatesLogin(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	badCodeReq := httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", bytes.NewBufferString(`{"country":"+60","phone":"174319676","code":"000000","newPassword":"resetpass123"}`))
	badCodeRec := httptest.NewRecorder()
	mux.ServeHTTP(badCodeRec, badCodeReq)
	if badCodeRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong reset code 401, got %d: %s", badCodeRec.Code, badCodeRec.Body.String())
	}

	goodReq := httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", bytes.NewBufferString(`{"country":"+60","phone":"174319676","code":"123456","newPassword":"resetpass123"}`))
	goodRec := httptest.NewRecorder()
	mux.ServeHTTP(goodRec, goodReq)
	if goodRec.Code != http.StatusOK {
		t.Fatalf("expected password reset 200, got %d: %s", goodRec.Code, goodRec.Body.String())
	}

	_, ok, err := store.authenticate(context.Background(), "+60", "174319676", "demo123456")
	if err != nil {
		t.Fatalf("authenticate old password: %v", err)
	}
	if ok {
		t.Fatal("old password still authenticates after password reset")
	}

	_, ok, err = store.authenticate(context.Background(), "+60", "174319676", "resetpass123")
	if err != nil {
		t.Fatalf("authenticate reset password: %v", err)
	}
	if !ok {
		t.Fatal("reset password does not authenticate")
	}
}

func TestSendAuthCodeRequiresExistingPhone(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	missingReq := httptest.NewRequest(http.MethodPost, "/api/auth/send-code", bytes.NewBufferString(`{"country":"+60","phone":"000000","purpose":"login"}`))
	missingRec := httptest.NewRecorder()
	mux.ServeHTTP(missingRec, missingReq)
	if missingRec.Code != http.StatusNotFound {
		t.Fatalf("expected missing phone 404, got %d: %s", missingRec.Code, missingRec.Body.String())
	}

	goodReq := httptest.NewRequest(http.MethodPost, "/api/auth/send-code", bytes.NewBufferString(`{"country":"+60","phone":"174319676","purpose":"login"}`))
	goodRec := httptest.NewRecorder()
	mux.ServeHTTP(goodRec, goodReq)
	if goodRec.Code != http.StatusOK {
		t.Fatalf("expected send code 200, got %d: %s", goodRec.Code, goodRec.Body.String())
	}

	var response struct {
		OK      bool   `json:"ok"`
		Code    string `json:"code"`
		Purpose string `json:"purpose"`
	}
	if err := json.NewDecoder(goodRec.Body).Decode(&response); err != nil {
		t.Fatalf("decode send code response: %v", err)
	}
	if !response.OK || response.Code != demoLoginCode || response.Purpose != "login" {
		t.Fatalf("unexpected send code response: %+v", response)
	}
}

func TestCodeLoginRequiresDemoCodeAndReturnsToken(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	badCodeReq := httptest.NewRequest(http.MethodPost, "/api/auth/code-login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","code":"000000"}`))
	badCodeRec := httptest.NewRecorder()
	mux.ServeHTTP(badCodeRec, badCodeReq)
	if badCodeRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected wrong code 401, got %d: %s", badCodeRec.Code, badCodeRec.Body.String())
	}

	missingReq := httptest.NewRequest(http.MethodPost, "/api/auth/code-login", bytes.NewBufferString(`{"country":"+60","phone":"000000","code":"123456"}`))
	missingRec := httptest.NewRecorder()
	mux.ServeHTTP(missingRec, missingReq)
	if missingRec.Code != http.StatusNotFound {
		t.Fatalf("expected missing phone 404, got %d: %s", missingRec.Code, missingRec.Body.String())
	}

	goodReq := httptest.NewRequest(http.MethodPost, "/api/auth/code-login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","code":"123456"}`))
	goodRec := httptest.NewRecorder()
	mux.ServeHTTP(goodRec, goodReq)
	if goodRec.Code != http.StatusOK {
		t.Fatalf("expected code login 200, got %d: %s", goodRec.Code, goodRec.Body.String())
	}

	var response struct {
		Token string `json:"token"`
		User  User   `json:"user"`
	}
	if err := json.NewDecoder(goodRec.Body).Decode(&response); err != nil {
		t.Fatalf("decode code login response: %v", err)
	}
	if response.Token == "" || response.User.ID != "u1" {
		t.Fatalf("unexpected code login response: %+v", response)
	}
	if store.sessions[response.Token] != "u1" {
		t.Fatalf("token was not registered in sessions: %+v", store.sessions)
	}
}

func TestCodeLoginRejectsBannedUser(t *testing.T) {
	store := seedStore()
	now := time.Now()
	store.user.BannedAt = &now
	store.user.BanReason = "spam"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/code-login", bytes.NewBufferString(`{"country":"+60","phone":"174319676","code":"123456"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected banned code login 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRegisterCreatesRandomChatID(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(`{"country":"+60","phone":"174319699","password":"demo123456","nickname":"新用户"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var response struct {
		User User `json:"user"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	if !regexp.MustCompile(`^[a-z][0-9][a-z0-9]{4}$`).MatchString(response.User.ChatID) {
		t.Fatalf("chatId should be random lowercase letters and digits, got %q", response.User.ChatID)
	}
	if strings.Contains(response.User.ChatID, response.User.Phone) {
		t.Fatalf("chatId should not be derived from phone, got %q", response.User.ChatID)
	}
	store.mu.RLock()
	created := store.users[response.User.ID]
	store.mu.RUnlock()
	if created.BlockedContactIDs == nil {
		t.Fatal("blocked contacts should default to an empty list")
	}
	if created.StickerStore.Items == nil || created.StickerStore.Favorites == nil {
		t.Fatalf("sticker store should default to empty lists, got %+v", created.StickerStore)
	}
}

func TestRegisteredUserStartsWithIsolatedData(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	registerReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(`{"country":"+60","phone":"174319699","password":"demo123456","nickname":"新用户"}`))
	registerRec := httptest.NewRecorder()
	mux.ServeHTTP(registerRec, registerReq)
	if registerRec.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d: %s", registerRec.Code, registerRec.Body.String())
	}
	var registerResponse struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(registerRec.Body).Decode(&registerResponse); err != nil {
		t.Fatalf("decode register response: %v", err)
	}

	for _, path := range []string{"/api/conversations", "/api/contacts", "/api/groups"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+registerResponse.Token)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected %s 200, got %d: %s", path, rec.Code, rec.Body.String())
		}
		var items []any
		if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
			t.Fatalf("decode %s response: %v", path, err)
		}
		if len(items) != 0 {
			t.Fatalf("expected %s to be empty for new user, got %+v", path, items)
		}
	}
}

func TestRegisteredUserOnlySeesOwnGroup(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	registerReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(`{"country":"+60","phone":"174319700","password":"demo123456","nickname":"群主"}`))
	registerRec := httptest.NewRecorder()
	mux.ServeHTTP(registerRec, registerReq)
	if registerRec.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d: %s", registerRec.Code, registerRec.Body.String())
	}
	var registerResponse struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(registerRec.Body).Decode(&registerResponse); err != nil {
		t.Fatalf("decode register response: %v", err)
	}

	createReq := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewBufferString(`{"title":"真实流程测试群","memberIds":[]}`))
	createReq.Header.Set("Authorization", "Bearer "+registerResponse.Token)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected group create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	groupsReq := httptest.NewRequest(http.MethodGet, "/api/groups", nil)
	groupsReq.Header.Set("Authorization", "Bearer "+registerResponse.Token)
	groupsRec := httptest.NewRecorder()
	mux.ServeHTTP(groupsRec, groupsReq)
	if groupsRec.Code != http.StatusOK {
		t.Fatalf("expected groups 200, got %d: %s", groupsRec.Code, groupsRec.Body.String())
	}
	var groups []Group
	if err := json.NewDecoder(groupsRec.Body).Decode(&groups); err != nil {
		t.Fatalf("decode groups response: %v", err)
	}
	if len(groups) != 1 || groups[0].Title != "真实流程测试群" {
		t.Fatalf("expected only created group, got %+v", groups)
	}

	conversationsReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	conversationsReq.Header.Set("Authorization", "Bearer "+registerResponse.Token)
	conversationsRec := httptest.NewRecorder()
	mux.ServeHTTP(conversationsRec, conversationsReq)
	if conversationsRec.Code != http.StatusOK {
		t.Fatalf("expected conversations 200, got %d: %s", conversationsRec.Code, conversationsRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(conversationsRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations response: %v", err)
	}
	if len(conversations) != 1 || conversations[0].Title != "真实流程测试群" {
		t.Fatalf("expected only created group conversation, got %+v", conversations)
	}
}

func TestRegisteredUsersOnlySeeTheirFriendRequests(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	firstToken := registerTestUser(t, mux, "+60", "66070001", "Chat66Test1", "测试账号1").Token
	second := registerTestUser(t, mux, "+60", "66070002", "Chat66Test2", "测试账号2")

	createReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"`+second.User.ChatID+`","greeting":"你好，我想加你为好友"}`))
	createReq.Header.Set("Authorization", "Bearer "+firstToken)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected friend request 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	firstRequests := listFriendRequestsForToken(t, mux, firstToken)
	if len(firstRequests) != 1 || firstRequests[0].Direction != "outgoing" || firstRequests[0].User.Nickname != "测试账号2" {
		t.Fatalf("first user requests = %+v", firstRequests)
	}

	secondRequests := listFriendRequestsForToken(t, mux, second.Token)
	if len(secondRequests) != 1 || secondRequests[0].Direction != "incoming" || secondRequests[0].User.Nickname != "测试账号1" {
		t.Fatalf("second user requests = %+v", secondRequests)
	}
}

func TestConversationListMarksMentionedUser(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	first := registerTestUser(t, mux, "+60", "66070301", "Chat66Test1", "测试账号1")
	second := registerTestUser(t, mux, "+60", "66070302", "Chat66Test2", "测试账号2")

	createReq := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewBufferString(`{"title":"提醒测试群","memberIds":["`+second.User.ID+`"]}`))
	createReq.Header.Set("Authorization", "Bearer "+first.Token)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected group create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var group Group
	if err := json.NewDecoder(createRec.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	conversationID := "group-" + group.ID
	store.mu.Lock()
	group.Members = append(group.Members, Member{UserID: second.User.ID, Nickname: second.User.Nickname, Role: "member"})
	store.groups[group.ID] = group
	store.mu.Unlock()

	messageReq := httptest.NewRequest(http.MethodPost, "/api/conversations/"+conversationID+"/messages", bytes.NewBufferString(`{"type":"text","body":"@测试账号2 请看","mentions":["`+second.User.ID+`"]}`))
	messageReq.Header.Set("Authorization", "Bearer "+first.Token)
	messageRec := httptest.NewRecorder()
	mux.ServeHTTP(messageRec, messageReq)
	if messageRec.Code != http.StatusCreated {
		t.Fatalf("expected message 201, got %d: %s", messageRec.Code, messageRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	listReq.Header.Set("Authorization", "Bearer "+second.Token)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected conversations 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(listRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	conversation := conversationByID(conversations, conversationID)
	if !conversation.MentionedMe {
		t.Fatalf("expected mentioned conversation, got %+v", conversation)
	}
}

func TestConversationListClearsMentionAfterRead(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	first := registerTestUser(t, mux, "+60", "66070311", "Chat66Test1", "测试账号1")
	second := registerTestUser(t, mux, "+60", "66070312", "Chat66Test2", "测试账号2")

	createReq := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewBufferString(`{"title":"提醒已读群","memberIds":["`+second.User.ID+`"]}`))
	createReq.Header.Set("Authorization", "Bearer "+first.Token)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected group create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var group Group
	if err := json.NewDecoder(createRec.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	conversationID := "group-" + group.ID
	store.mu.Lock()
	group.Members = append(group.Members, Member{UserID: second.User.ID, Nickname: second.User.Nickname, Role: "member"})
	store.groups[group.ID] = group
	store.mu.Unlock()

	messageReq := httptest.NewRequest(http.MethodPost, "/api/conversations/"+conversationID+"/messages", bytes.NewBufferString(`{"type":"text","body":"@测试账号2 请看","mentions":["`+second.User.ID+`"]}`))
	messageReq.Header.Set("Authorization", "Bearer "+first.Token)
	messageRec := httptest.NewRecorder()
	mux.ServeHTTP(messageRec, messageReq)
	if messageRec.Code != http.StatusCreated {
		t.Fatalf("expected message 201, got %d: %s", messageRec.Code, messageRec.Body.String())
	}

	readReq := httptest.NewRequest(http.MethodGet, "/api/conversations/"+conversationID+"/messages", nil)
	readReq.Header.Set("Authorization", "Bearer "+second.Token)
	readRec := httptest.NewRecorder()
	mux.ServeHTTP(readRec, readReq)
	if readRec.Code != http.StatusOK {
		t.Fatalf("expected messages 200, got %d: %s", readRec.Code, readRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	listReq.Header.Set("Authorization", "Bearer "+second.Token)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected conversations 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(listRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	conversation := conversationByID(conversations, conversationID)
	if conversation.MentionedMe {
		t.Fatalf("expected mention cleared after read, got %+v", conversation)
	}
}

func TestStaticWebRouteServesIndexFallback(t *testing.T) {
	webDir := t.TempDir()
	index := []byte("<!doctype html><title>99Chat</title>")
	if err := os.WriteFile(filepath.Join(webDir, "index.html"), index, 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}

	handler := staticWebRoute(webDir)
	for _, path := range []string{"/", "/settings"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		handler(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, rec.Code)
		}
		if body := rec.Body.String(); !strings.Contains(body, "99Chat") {
			t.Fatalf("%s body = %q, want index fallback", path, body)
		}
	}
}

func TestStaticWebRouteServesAdminFallback(t *testing.T) {
	webDir := t.TempDir()
	index := []byte("<!doctype html><title>99Chat</title>")
	admin := []byte("<!doctype html><title>66chat Admin</title>")
	if err := os.WriteFile(filepath.Join(webDir, "index.html"), index, 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(webDir, "admin.html"), admin, 0o644); err != nil {
		t.Fatalf("write admin: %v", err)
	}

	handler := staticWebRoute(webDir)
	for _, path := range []string{
		"/admin",
		"/admin/login",
		"/admin/users",
		"/admin/groups",
		"/admin/messages",
		"/admin/reports",
		"/admin/feedback",
		"/admin/files",
		"/admin/audit-logs",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		handler(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, rec.Code)
		}
		if body := rec.Body.String(); !strings.Contains(body, "66chat Admin") {
			t.Fatalf("%s body = %q, want admin fallback", path, body)
		}
	}
}

func TestStaticWebRouteDisablesFrontendCaching(t *testing.T) {
	webDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(webDir, "index.html"), []byte("<!doctype html>"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	srcDir := filepath.Join(webDir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatalf("make src dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "app.js"), []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatalf("write app js: %v", err)
	}

	handler := staticWebRoute(webDir)
	for _, path := range []string{"/", "/src/app.js"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		handler(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store, max-age=0" {
			t.Fatalf("%s Cache-Control = %q, want no-store, max-age=0", path, got)
		}
		if got := rec.Header().Get("Pragma"); got != "no-cache" {
			t.Fatalf("%s Pragma = %q, want no-cache", path, got)
		}
	}
}

func TestRuntimeStoreKeepsDemoAccountEmptyByDefault(t *testing.T) {
	t.Setenv("SEED_DEMO_DATA", "")

	store := runtimeStore()

	if store.user.Phone != "174319676" {
		t.Fatalf("demo phone = %q", store.user.Phone)
	}
	if len(store.contacts) != 0 {
		t.Fatalf("expected no contacts, got %d", len(store.contacts))
	}
	if len(store.conversations) != 0 {
		t.Fatalf("expected no conversations, got %d", len(store.conversations))
	}
	if len(store.groups) != 0 {
		t.Fatalf("expected no groups, got %d", len(store.groups))
	}
	if len(store.messages) != 0 {
		t.Fatalf("expected no messages, got %d", len(store.messages))
	}
	admin, ok := store.adminUsers["admin-1"]
	if !ok {
		t.Fatal("expected bootstrap admin to exist when demo data is disabled")
	}
	if admin.Username != "admin" || admin.Role != "super_admin" || !passwordMatches(admin.PasswordHash, "admin123") {
		t.Fatalf("unexpected bootstrap admin: %+v", admin)
	}
}

func TestRuntimeStoreCanSeedDemoDataWhenEnabled(t *testing.T) {
	t.Setenv("SEED_DEMO_DATA", "true")

	store := runtimeStore()

	if len(store.conversations) == 0 {
		t.Fatal("expected seeded conversations when SEED_DEMO_DATA=true")
	}
	if len(store.contacts) == 0 {
		t.Fatal("expected seeded contacts when SEED_DEMO_DATA=true")
	}
}

func TestBootstrapAdminUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("ADMIN_USERNAME", "ops")
	t.Setenv("ADMIN_PASSWORD", "secret-pass")

	admin := bootstrapAdminRecord()

	if admin.Username != "ops" {
		t.Fatalf("username = %q, want ops", admin.Username)
	}
	if !passwordMatches(admin.PasswordHash, "secret-pass") {
		t.Fatal("bootstrap admin password did not use ADMIN_PASSWORD")
	}
}

func TestProductionAPIsRequireAuthentication(t *testing.T) {
	store := emptyDemoStore()
	store.pg = &PostgresStore{}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	for _, path := range []string{"/api/me", "/api/conversations", "/api/contacts", "/api/friend-requests", "/api/groups", "/api/collections"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d, want 401", path, rec.Code)
		}
	}

	healthReq := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	healthRec := httptest.NewRecorder()
	mux.ServeHTTP(healthRec, healthReq)
	if healthRec.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", healthRec.Code)
	}
}

func TestRegisterRejectsDuplicatePhoneInMemoryStore(t *testing.T) {
	store := emptyDemoStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	first := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(`{"country":"+60","phone":"188888888","password":"Chat66Test1","nickname":"账号一"}`))
	firstRec := httptest.NewRecorder()
	mux.ServeHTTP(firstRec, first)
	if firstRec.Code != http.StatusCreated {
		t.Fatalf("expected first register 201, got %d: %s", firstRec.Code, firstRec.Body.String())
	}

	second := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(`{"country":"+60","phone":"188888888","password":"Chat66Test1","nickname":"账号二"}`))
	secondRec := httptest.NewRecorder()
	mux.ServeHTTP(secondRec, second)
	if secondRec.Code != http.StatusConflict {
		t.Fatalf("expected duplicate register 409, got %d: %s", secondRec.Code, secondRec.Body.String())
	}
	if !strings.Contains(secondRec.Body.String(), "user already exists") {
		t.Fatalf("duplicate response = %s", secondRec.Body.String())
	}
}

func TestRegisteredFriendAcceptDoesNotExposeDemoData(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	first := registerTestUser(t, mux, "+60", "66070001", "Chat66Test1", "测试账号1")
	second := registerTestUser(t, mux, "+60", "66070002", "Chat66Test2", "测试账号2")

	createReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"`+second.User.ChatID+`","greeting":"你好，我想加你为好友"}`))
	createReq.Header.Set("Authorization", "Bearer "+first.Token)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected friend request 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created FriendRequest
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	acceptReq := httptest.NewRequest(http.MethodPatch, "/api/friend-requests/"+created.ID, bytes.NewBufferString(`{"status":"accepted"}`))
	acceptReq.Header.Set("Authorization", "Bearer "+second.Token)
	acceptRec := httptest.NewRecorder()
	mux.ServeHTTP(acceptRec, acceptReq)
	if acceptRec.Code != http.StatusOK {
		t.Fatalf("expected accept 200, got %d: %s", acceptRec.Code, acceptRec.Body.String())
	}

	groupsReq := httptest.NewRequest(http.MethodGet, "/api/groups", nil)
	groupsReq.Header.Set("Authorization", "Bearer "+second.Token)
	groupsRec := httptest.NewRecorder()
	mux.ServeHTTP(groupsRec, groupsReq)
	if groupsRec.Code != http.StatusOK {
		t.Fatalf("expected groups 200, got %d: %s", groupsRec.Code, groupsRec.Body.String())
	}
	var groups []any
	if err := json.NewDecoder(groupsRec.Body).Decode(&groups); err != nil {
		t.Fatalf("decode groups response: %v", err)
	}
	if len(groups) != 0 {
		t.Fatalf("expected groups to stay empty after accepting friend request, got %+v", groups)
	}

	conversationsReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	conversationsReq.Header.Set("Authorization", "Bearer "+second.Token)
	conversationsRec := httptest.NewRecorder()
	mux.ServeHTTP(conversationsRec, conversationsReq)
	if conversationsRec.Code != http.StatusOK {
		t.Fatalf("expected conversations 200, got %d: %s", conversationsRec.Code, conversationsRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(conversationsRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations response: %v", err)
	}
	conversationID := canonicalPrivateConversationID(first.User.ID, second.User.ID)
	conversation := conversationByID(conversations, conversationID)
	if conversation.ID == "" || conversation.Title != "测试账号1" {
		t.Fatalf("accepted friend conversation = %+v, all=%+v", conversation, conversations)
	}
	if conversation.LastText != "你们已是好友，可以开始聊天了!" {
		t.Fatalf("conversation lastText = %q", conversation.LastText)
	}

	contactsReq := httptest.NewRequest(http.MethodGet, "/api/contacts", nil)
	contactsReq.Header.Set("Authorization", "Bearer "+second.Token)
	contactsRec := httptest.NewRecorder()
	mux.ServeHTTP(contactsRec, contactsReq)
	if contactsRec.Code != http.StatusOK {
		t.Fatalf("expected contacts 200, got %d: %s", contactsRec.Code, contactsRec.Body.String())
	}
	var contacts []Contact
	if err := json.NewDecoder(contactsRec.Body).Decode(&contacts); err != nil {
		t.Fatalf("decode contacts response: %v", err)
	}
	if len(contacts) != 1 || contacts[0].Nickname != "测试账号1" {
		t.Fatalf("expected only first test account contact, got %+v", contacts)
	}
}

func TestMePatchPersistsUserSettings(t *testing.T) {
	store := seedStore()
	token := store.issueToken(store.user.ID)
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{
		"settings":{"notificationsEnabled":false,"friendVerification":false,"inviteGroupVerification":true},
		"language":"English",
		"displayMode":"移动版",
		"blockedContactIds":["388769","388754"]
	}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/me", body)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected settings patch 200, got %d: %s", rec.Code, rec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	var user User
	if err := json.NewDecoder(getRec.Body).Decode(&user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	if user.Settings["notificationsEnabled"] {
		t.Fatal("notificationsEnabled was not persisted as false")
	}
	if user.Settings["friendVerification"] {
		t.Fatal("friendVerification was not persisted as false")
	}
	if !user.Settings["inviteGroupVerification"] {
		t.Fatal("inviteGroupVerification was not persisted as true")
	}
	if user.Language != "English" {
		t.Fatalf("language = %q", user.Language)
	}
	if user.DisplayMode != "移动版" {
		t.Fatalf("displayMode = %q", user.DisplayMode)
	}
	if len(user.BlockedContactIDs) != 2 || user.BlockedContactIDs[0] != "388769" || user.BlockedContactIDs[1] != "388754" {
		t.Fatalf("blockedContactIds = %+v", user.BlockedContactIDs)
	}
}

func TestMeRejectsInvalidToken(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer expired-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected invalid token 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMePatchPersistsProfileFields(t *testing.T) {
	store := seedStore()
	token := store.issueToken(store.user.ID)
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"nickname":"新昵称","signature":"新的个性签名","avatar":"data:image/svg+xml;utf8,<svg></svg>"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/me", body)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected profile patch 200, got %d: %s", rec.Code, rec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	var user User
	if err := json.NewDecoder(getRec.Body).Decode(&user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	if user.Nickname != "新昵称" {
		t.Fatalf("nickname = %q", user.Nickname)
	}
	if user.Signature != "新的个性签名" {
		t.Fatalf("signature = %q", user.Signature)
	}
	if user.Avatar == "" {
		t.Fatal("avatar was not persisted")
	}
}

func TestReadConversationMessagesUsesLatestSenderAvatar(t *testing.T) {
	store := seedStore()
	store.users["388786"] = User{ID: "388786", Nickname: "^魚. 𝙯ᙆ", Avatar: "https://example.com/latest-avatar.png"}

	messages := store.readConversationMessages(context.Background(), "group-21444", store.user.ID)
	for _, message := range messages {
		if message.ID != "m1" {
			continue
		}
		if message.SenderAvatar != "https://example.com/latest-avatar.png" {
			t.Fatalf("sender avatar = %q", message.SenderAvatar)
		}
		return
	}
	t.Fatal("expected seeded group message")
}

func TestMePatchPersistsStickerStore(t *testing.T) {
	store := seedStore()
	token := store.issueToken(store.user.ID)
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"stickerStore":{"items":["😀","📌","✅"],"favorites":["📌","✅"]}}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/me", body)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected sticker patch 200, got %d: %s", rec.Code, rec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	var user User
	if err := json.NewDecoder(getRec.Body).Decode(&user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	if len(user.StickerStore.Items) != 3 || user.StickerStore.Items[1] != "📌" {
		t.Fatalf("sticker items = %+v", user.StickerStore.Items)
	}
	if len(user.StickerStore.Favorites) != 2 || user.StickerStore.Favorites[0] != "📌" {
		t.Fatalf("sticker favorites = %+v", user.StickerStore.Favorites)
	}
}

func TestLoginDevicesListCurrentAndOtherSessions(t *testing.T) {
	store := seedStore()
	store.sessions["current-token"] = "u1"
	store.sessions["other-token"] = "u1"
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/me/devices", nil)
	req.Header.Set("Authorization", "Bearer current-token")
	req.Header.Set("User-Agent", "Mozilla/5.0 Safari/605.1.15")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected devices 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var devices []LoginDevice
	if err := json.NewDecoder(rec.Body).Decode(&devices); err != nil {
		t.Fatalf("decode devices: %v", err)
	}
	if len(devices) != 2 {
		t.Fatalf("devices length = %d, devices=%+v", len(devices), devices)
	}
	var sawCurrent, sawOther bool
	for _, device := range devices {
		if device.ID == "current-token" && device.Current && device.Name == "Safari 浏览器" {
			sawCurrent = true
		}
		if device.ID == "other-token" && !device.Current {
			sawOther = true
		}
		if device.ID == "member-token" {
			t.Fatalf("device list leaked another user session: %+v", devices)
		}
	}
	if !sawCurrent || !sawOther {
		t.Fatalf("current/other sessions missing: %+v", devices)
	}
}

func TestLoginDeviceRevokeOtherSessionOnly(t *testing.T) {
	store := seedStore()
	store.sessions["current-token"] = "u1"
	store.sessions["other-token"] = "u1"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	currentReq := httptest.NewRequest(http.MethodDelete, "/api/me/devices/current-token", nil)
	currentReq.Header.Set("Authorization", "Bearer current-token")
	currentRec := httptest.NewRecorder()
	mux.ServeHTTP(currentRec, currentReq)
	if currentRec.Code != http.StatusBadRequest {
		t.Fatalf("expected current revoke 400, got %d: %s", currentRec.Code, currentRec.Body.String())
	}

	otherReq := httptest.NewRequest(http.MethodDelete, "/api/me/devices/other-token", nil)
	otherReq.Header.Set("Authorization", "Bearer current-token")
	otherRec := httptest.NewRecorder()
	mux.ServeHTTP(otherRec, otherReq)
	if otherRec.Code != http.StatusOK {
		t.Fatalf("expected other revoke 200, got %d: %s", otherRec.Code, otherRec.Body.String())
	}
	if _, ok := store.sessions["other-token"]; ok {
		t.Fatal("other session was not revoked")
	}
	if _, ok := store.sessions["current-token"]; !ok {
		t.Fatal("current session was revoked")
	}
}

func TestCreateGroupUsesSelectedContactNicknames(t *testing.T) {
	store := seedStore()
	for _, id := range []string{"388770", "388769"} {
		user, ok, err := store.userByID(context.Background(), id)
		if err != nil || !ok {
			t.Fatalf("lookup user %s: ok=%v err=%v", id, ok, err)
		}
		user.Settings = mergeUserSettings(user.Settings, map[string]bool{"inviteGroupVerification": false})
		store.users[id] = user
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewBufferString(`{"title":"项目群","memberIds":["388770","388769"]}`))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected create group 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var group Group
	if err := json.NewDecoder(rec.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	if !regexp.MustCompile(`^[0-9]{6}$`).MatchString(group.ChatID) {
		t.Fatalf("expected group chat id to be a 6-digit number, got %q", group.ChatID)
	}
	names := map[string]string{}
	for _, member := range group.Members {
		names[member.UserID] = member.Nickname
	}
	if names["388770"] != "陈刀仔（日进斗金）" || names["388769"] != "苏雅" {
		t.Fatalf("member nicknames not resolved: %+v", group.Members)
	}
}

func TestCreateGroupCreatesPendingInvitesWhenMembersRequireVerification(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	target := registerTestUser(t, mux, "+60", "66070111", "Chat66Test2", "测试账号2")

	req := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewBufferString(`{"title":"验证群","memberIds":["`+target.User.ID+`"]}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected create group 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var group Group
	if err := json.NewDecoder(rec.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	if groupHasUser(group, target.User.ID) {
		t.Fatalf("target was added before verification: %+v", group.Members)
	}

	requests := groupJoinRequestsForToken(t, mux, group.ID, target.Token)
	if len(requests) != 1 || requests[0].Status != "pending" || requests[0].User.ID != target.User.ID {
		t.Fatalf("target pending requests = %+v", requests)
	}
}

func TestFeedbackCanBeSubmittedAndListed(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	emptyReq := httptest.NewRequest(http.MethodPost, "/api/feedback", bytes.NewBufferString(`{"type":"Bug 反馈","text":""}`))
	emptyReq.Header.Set("Authorization", "Bearer demo-token")
	emptyRec := httptest.NewRecorder()
	mux.ServeHTTP(emptyRec, emptyReq)
	if emptyRec.Code != http.StatusBadRequest {
		t.Fatalf("expected empty feedback 400, got %d: %s", emptyRec.Code, emptyRec.Body.String())
	}

	createReq := httptest.NewRequest(http.MethodPost, "/api/feedback", bytes.NewBufferString(`{"type":"Bug 反馈","text":"搜索输入会失焦"}`))
	createReq.Header.Set("Authorization", "Bearer demo-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected feedback 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/feedback", nil)
	listReq.Header.Set("Authorization", "Bearer demo-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected feedback list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var items []Feedback
	if err := json.NewDecoder(listRec.Body).Decode(&items); err != nil {
		t.Fatalf("decode feedback: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("feedback count = %d", len(items))
	}
	if items[0].Type != "Bug 反馈" || items[0].Text != "搜索输入会失焦" || items[0].Status != "已提交" {
		t.Fatalf("feedback item = %+v", items[0])
	}
	if items[0].UserID != "u1" {
		t.Fatalf("feedback userID = %q", items[0].UserID)
	}
}

func TestReportRequiresTargetAndReason(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	emptyReq := httptest.NewRequest(http.MethodPost, "/api/reports", bytes.NewBufferString(`{"targetId":"21444","reason":""}`))
	emptyReq.Header.Set("Authorization", "Bearer demo-token")
	emptyRec := httptest.NewRecorder()
	mux.ServeHTTP(emptyRec, emptyReq)
	if emptyRec.Code != http.StatusBadRequest {
		t.Fatalf("expected empty reason 400, got %d: %s", emptyRec.Code, emptyRec.Body.String())
	}

	missingTargetReq := httptest.NewRequest(http.MethodPost, "/api/reports", bytes.NewBufferString(`{"targetId":"","reason":"垃圾广告"}`))
	missingTargetReq.Header.Set("Authorization", "Bearer demo-token")
	missingTargetRec := httptest.NewRecorder()
	mux.ServeHTTP(missingTargetRec, missingTargetReq)
	if missingTargetRec.Code != http.StatusBadRequest {
		t.Fatalf("expected missing target 400, got %d: %s", missingTargetRec.Code, missingTargetRec.Body.String())
	}
}

func TestCollectionsCanBeCreatedAndListed(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	emptyReq := httptest.NewRequest(http.MethodPost, "/api/collections", bytes.NewBufferString(`{"kind":"text","title":""}`))
	emptyReq.Header.Set("Authorization", "Bearer demo-token")
	emptyRec := httptest.NewRecorder()
	mux.ServeHTTP(emptyRec, emptyReq)
	if emptyRec.Code != http.StatusBadRequest {
		t.Fatalf("expected empty collection 400, got %d: %s", emptyRec.Code, emptyRec.Body.String())
	}

	createReq := httptest.NewRequest(http.MethodPost, "/api/collections", bytes.NewBufferString(`{"kind":"text","title":"chenshao 的消息","preview":"hello","messageId":"m2"}`))
	createReq.Header.Set("Authorization", "Bearer demo-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected collection 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/collections?kind=text", nil)
	listReq.Header.Set("Authorization", "Bearer demo-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected collections list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var items []Collection
	if err := json.NewDecoder(listRec.Body).Decode(&items); err != nil {
		t.Fatalf("decode collections: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("created collection missing from list")
	}
	if items[0].Title != "chenshao 的消息" || items[0].Preview != "hello" || items[0].Kind != "text" {
		t.Fatalf("first collection = %+v", items[0])
	}
}

func TestCollectionCreateReturnsExistingMessageFavorite(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := `{"kind":"text","title":"chenshao 的消息","preview":"hello","messageId":"m2"}`
	firstReq := httptest.NewRequest(http.MethodPost, "/api/collections", bytes.NewBufferString(body))
	firstReq.Header.Set("Authorization", "Bearer demo-token")
	firstRec := httptest.NewRecorder()
	mux.ServeHTTP(firstRec, firstReq)
	if firstRec.Code != http.StatusCreated {
		t.Fatalf("expected first collection 201, got %d: %s", firstRec.Code, firstRec.Body.String())
	}

	secondReq := httptest.NewRequest(http.MethodPost, "/api/collections", bytes.NewBufferString(body))
	secondReq.Header.Set("Authorization", "Bearer demo-token")
	secondRec := httptest.NewRecorder()
	mux.ServeHTTP(secondRec, secondReq)
	if secondRec.Code != http.StatusOK {
		t.Fatalf("expected duplicate collection 200, got %d: %s", secondRec.Code, secondRec.Body.String())
	}

	var items []Collection
	listReq := httptest.NewRequest(http.MethodGet, "/api/collections?kind=text", nil)
	listReq.Header.Set("Authorization", "Bearer demo-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if err := json.NewDecoder(listRec.Body).Decode(&items); err != nil {
		t.Fatalf("decode collections: %v", err)
	}
	matches := 0
	for _, item := range items {
		if item.MessageID == "m2" {
			matches++
		}
	}
	if matches != 1 {
		t.Fatalf("message m2 collection count = %d, want 1", matches)
	}
}

func TestGroupSettingsPatchPersistsManagementFlags(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"announcement":"Pinned rules","myNickname":"Owner Nick","joinMode":"approval","disableMemberAddFriend":true,"allMuted":true}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444", body)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var group Group
	if err := json.NewDecoder(rec.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	if group.Announcement != "Pinned rules" {
		t.Fatalf("announcement = %q", group.Announcement)
	}
	if group.MyNickname != "Owner Nick" {
		t.Fatalf("myNickname = %q", group.MyNickname)
	}
	if group.JoinMode != "approval" {
		t.Fatalf("joinMode = %q", group.JoinMode)
	}
	if !group.DisableMemberAddFriend {
		t.Fatal("disableMemberAddFriend was not persisted")
	}
	if !group.AllMuted {
		t.Fatal("allMuted was not persisted")
	}
}

func TestGroupMemberPatchCanSetAdminRoleAndMute(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"role":"admin","muted":true}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/members/388754", body)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var member Member
	if err := json.NewDecoder(rec.Body).Decode(&member); err != nil {
		t.Fatalf("decode member: %v", err)
	}
	if member.Role != "admin" {
		t.Fatalf("role = %q", member.Role)
	}
	if !member.Muted {
		t.Fatal("member was not muted")
	}
}

func TestAdminCannotMuteAnotherAdmin(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	if _, err := store.updateGroupMember(nil, "21444", "388770", "admin", nil); err != nil {
		t.Fatalf("make second admin: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"muted":true}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/members/388770", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if groupMemberByID(store.groups["21444"], "388770").Muted {
		t.Fatal("admin was muted by another admin")
	}
}

func TestAdminCannotRemoveAnotherAdmin(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	if _, err := store.updateGroupMember(nil, "21444", "388770", "admin", nil); err != nil {
		t.Fatalf("make second admin: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/groups/21444/members/388770", nil)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if !groupHasMember(store.groups["21444"], "388770") {
		t.Fatal("admin was removed by another admin")
	}
}

func TestSearchConversationMessagesFindsBodyAndSender(t *testing.T) {
	store := seedStore()
	store.messages["group-21444"] = append(store.messages["group-21444"],
		Message{ID: "search-body", ConversationID: "group-21444", SenderID: "388754", SenderName: "恋情客", Type: "text", Body: "今晚发红包", CreatedAt: time.Now()},
		Message{ID: "search-sender", ConversationID: "group-21444", SenderID: "388769", SenderName: "苏雅", Type: "text", Body: "收到", CreatedAt: time.Now()},
	)
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages/search?q=%E7%BA%A2%E5%8C%85", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var bodyResults []Message
	if err := json.NewDecoder(rec.Body).Decode(&bodyResults); err != nil {
		t.Fatalf("decode body results: %v", err)
	}
	if len(bodyResults) != 1 || bodyResults[0].ID != "search-body" {
		t.Fatalf("bodyResults = %+v", bodyResults)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages/search?q=%E8%8B%8F%E9%9B%85", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected sender search 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var senderResults []Message
	if err := json.NewDecoder(rec.Body).Decode(&senderResults); err != nil {
		t.Fatalf("decode sender results: %v", err)
	}
	if len(senderResults) != 1 || senderResults[0].ID != "search-sender" {
		t.Fatalf("senderResults = %+v", senderResults)
	}
}

func TestSearchConversationMessagesEmptyQueryReturnsNoResults(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages/search", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var results []Message
	if err := json.NewDecoder(rec.Body).Decode(&results); err != nil {
		t.Fatalf("decode results: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("results = %+v", results)
	}
}

func TestClearConversationHidesOnlyOldMessagesForCurrentUser(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	oldMessage := Message{ID: "before-clear", ConversationID: "group-21444", SenderID: "388754", SenderName: "恋情客", Type: "text", Body: "清空前消息", CreatedAt: time.Now().Add(-time.Minute)}
	store.messages["group-21444"] = append(store.messages["group-21444"], oldMessage)
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	clearReq := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages/clear", nil)
	clearReq.Header.Set("Authorization", "Bearer member-token")
	clearRec := httptest.NewRecorder()
	mux.ServeHTTP(clearRec, clearReq)

	if clearRec.Code != http.StatusOK {
		t.Fatalf("expected clear 200, got %d: %s", clearRec.Code, clearRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages", nil)
	getReq.Header.Set("Authorization", "Bearer member-token")
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected get 200, got %d: %s", getRec.Code, getRec.Body.String())
	}
	var afterClear []Message
	if err := json.NewDecoder(getRec.Body).Decode(&afterClear); err != nil {
		t.Fatalf("decode after clear: %v", err)
	}
	if messageExists(afterClear, "before-clear") {
		t.Fatalf("old message returned after clear: %+v", afterClear)
	}

	body := bytes.NewBufferString(`{"type":"text","body":"清空后消息"}`)
	postReq := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
	postReq.Header.Set("Authorization", "Bearer member-token")
	postRec := httptest.NewRecorder()
	mux.ServeHTTP(postRec, postReq)

	if postRec.Code != http.StatusCreated {
		t.Fatalf("expected post 201, got %d: %s", postRec.Code, postRec.Body.String())
	}
	var created Message
	if err := json.NewDecoder(postRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created: %v", err)
	}

	getReq = httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages", nil)
	getReq.Header.Set("Authorization", "Bearer member-token")
	getRec = httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	var afterNewMessage []Message
	if err := json.NewDecoder(getRec.Body).Decode(&afterNewMessage); err != nil {
		t.Fatalf("decode after new message: %v", err)
	}
	if !messageExists(afterNewMessage, created.ID) {
		t.Fatalf("new message missing after clear: %+v", afterNewMessage)
	}
}

func TestConversationSettingsPatchPersistsPinnedMutedAndUnread(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"pinned":true,"muted":true,"unread":1}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/conversations/group-21444", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected patch 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var updated Conversation
	if err := json.NewDecoder(rec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode conversation: %v", err)
	}
	if !updated.Pinned || !updated.Muted || updated.Unread != 1 {
		t.Fatalf("updated = %+v", updated)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(listRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	conversation := conversationByID(conversations, "group-21444")
	if !conversation.Pinned || !conversation.Muted || conversation.Unread != 1 {
		t.Fatalf("conversation = %+v", conversation)
	}
}

func TestBurnAfterReadMessageIsVisibleOnceToRecipient(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	first := registerTestUser(t, mux, "+60", "66070301", "Chat66Test1", "阅后发送方")
	second := registerTestUser(t, mux, "+60", "66070302", "Chat66Test2", "阅后接收方")

	requestReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"`+second.User.ChatID+`","greeting":"hi"}`))
	requestReq.Header.Set("Authorization", "Bearer "+first.Token)
	requestRec := httptest.NewRecorder()
	mux.ServeHTTP(requestRec, requestReq)
	if requestRec.Code != http.StatusCreated {
		t.Fatalf("expected friend request 201, got %d: %s", requestRec.Code, requestRec.Body.String())
	}
	var request FriendRequest
	if err := json.NewDecoder(requestRec.Body).Decode(&request); err != nil {
		t.Fatalf("decode friend request: %v", err)
	}
	acceptReq := httptest.NewRequest(http.MethodPatch, "/api/friend-requests/"+request.ID, bytes.NewBufferString(`{"status":"accepted"}`))
	acceptReq.Header.Set("Authorization", "Bearer "+second.Token)
	acceptRec := httptest.NewRecorder()
	mux.ServeHTTP(acceptRec, acceptReq)
	if acceptRec.Code != http.StatusOK {
		t.Fatalf("expected accept 200, got %d: %s", acceptRec.Code, acceptRec.Body.String())
	}

	conversationID := canonicalPrivateConversationID(first.User.ID, second.User.ID)
	settingReq := httptest.NewRequest(http.MethodPatch, "/api/conversations/"+conversationID, bytes.NewBufferString(`{"burnAfterRead":true}`))
	settingReq.Header.Set("Authorization", "Bearer "+first.Token)
	settingRec := httptest.NewRecorder()
	mux.ServeHTTP(settingRec, settingReq)
	if settingRec.Code != http.StatusOK {
		t.Fatalf("expected burn setting 200, got %d: %s", settingRec.Code, settingRec.Body.String())
	}

	sendReq := httptest.NewRequest(http.MethodPost, "/api/conversations/session-"+second.User.ID+"/messages", bytes.NewBufferString(`{"type":"text","body":"read once"}`))
	sendReq.Header.Set("Authorization", "Bearer "+first.Token)
	sendRec := httptest.NewRecorder()
	mux.ServeHTTP(sendRec, sendReq)
	if sendRec.Code != http.StatusCreated {
		t.Fatalf("expected message 201, got %d: %s", sendRec.Code, sendRec.Body.String())
	}
	var sent Message
	if err := json.NewDecoder(sendRec.Body).Decode(&sent); err != nil {
		t.Fatalf("decode sent message: %v", err)
	}
	if !sent.BurnAfterRead {
		t.Fatalf("sent message should be marked burnAfterRead: %+v", sent)
	}

	readOnceReq := httptest.NewRequest(http.MethodGet, "/api/conversations/session-"+first.User.ID+"/messages", nil)
	readOnceReq.Header.Set("Authorization", "Bearer "+second.Token)
	readOnceRec := httptest.NewRecorder()
	mux.ServeHTTP(readOnceRec, readOnceReq)
	var firstRead []Message
	if err := json.NewDecoder(readOnceRec.Body).Decode(&firstRead); err != nil {
		t.Fatalf("decode first recipient read: %v", err)
	}
	if !messageExists(firstRead, sent.ID) {
		t.Fatalf("recipient should receive burn message once: %+v", firstRead)
	}

	readAgainReq := httptest.NewRequest(http.MethodGet, "/api/conversations/session-"+first.User.ID+"/messages", nil)
	readAgainReq.Header.Set("Authorization", "Bearer "+second.Token)
	readAgainRec := httptest.NewRecorder()
	mux.ServeHTTP(readAgainRec, readAgainReq)
	var secondRead []Message
	if err := json.NewDecoder(readAgainRec.Body).Decode(&secondRead); err != nil {
		t.Fatalf("decode second recipient read: %v", err)
	}
	if messageExists(secondRead, sent.ID) {
		t.Fatalf("recipient should not receive burn message after reading it: %+v", secondRead)
	}

	senderReadReq := httptest.NewRequest(http.MethodGet, "/api/conversations/session-"+second.User.ID+"/messages", nil)
	senderReadReq.Header.Set("Authorization", "Bearer "+first.Token)
	senderReadRec := httptest.NewRecorder()
	mux.ServeHTTP(senderReadRec, senderReadReq)
	var senderRead []Message
	if err := json.NewDecoder(senderReadRec.Body).Decode(&senderRead); err != nil {
		t.Fatalf("decode sender read: %v", err)
	}
	if !messageExists(senderRead, sent.ID) {
		t.Fatalf("sender should retain burn message: %+v", senderRead)
	}
}

func TestDeleteConversationHidesItFromCurrentUserList(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/conversations/group-21444", nil)
	req.Header.Set("Authorization", "Bearer demo-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected delete 204, got %d: %s", rec.Code, rec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	listReq.Header.Set("Authorization", "Bearer demo-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(listRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	if conversationByID(conversations, "group-21444").ID != "" {
		t.Fatalf("deleted conversation is still visible: %+v", conversations)
	}
	if len(store.messages["group-21444"]) == 0 {
		t.Fatal("delete conversation removed underlying messages")
	}
}

func TestHiddenConversationReappearsWhenNewMessageArrives(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	hideReq := httptest.NewRequest(http.MethodDelete, "/api/conversations/group-21444", nil)
	hideReq.Header.Set("Authorization", "Bearer demo-token")
	hideRec := httptest.NewRecorder()
	mux.ServeHTTP(hideRec, hideReq)
	if hideRec.Code != http.StatusNoContent {
		t.Fatalf("expected hide 204, got %d: %s", hideRec.Code, hideRec.Body.String())
	}

	body := bytes.NewBufferString(`{"type":"text","body":"新消息让会话回来"}`)
	msgReq := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
	msgReq.Header.Set("Authorization", "Bearer demo-token")
	msgRec := httptest.NewRecorder()
	mux.ServeHTTP(msgRec, msgReq)
	if msgRec.Code != http.StatusCreated {
		t.Fatalf("expected message 201, got %d: %s", msgRec.Code, msgRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	listReq.Header.Set("Authorization", "Bearer demo-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(listRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	if conversationByID(conversations, "group-21444").ID == "" {
		t.Fatalf("hidden conversation did not reappear after new message: %+v", conversations)
	}
}

func TestFriendRequestBlockedWhenGroupDisablesMemberAddFriend(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.DisableMemberAddFriend = true
	store.groups["21444"] = group
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"chatId":"love66","greeting":"你好"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/friend-requests", body)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestFriendRequestBlockedWhenTargetBlacklistsSender(t *testing.T) {
	store := seedStore()
	store.sessions["blocked-token"] = "388770"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"o8tew3","greeting":"你好"}`))
	req.Header.Set("Authorization", "Bearer blocked-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected blacklisted friend request 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPrivateMessageBlockedWhenRecipientBlacklistsSender(t *testing.T) {
	store := seedStore()
	store.sessions["blocked-token"] = "388770"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/conversations/session-u1/messages", bytes.NewBufferString(`{"type":"text","body":"hello"}`))
	req.Header.Set("Authorization", "Bearer blocked-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected blacklisted message 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(store.messages["session-u1"]) != 0 {
		t.Fatalf("blacklisted message was stored: %+v", store.messages["session-u1"])
	}
}

func TestPrivateMessageCreatesMissingContactConversation(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodPost, "/api/conversations/session-388754/messages", bytes.NewBufferString(`{"type":"text","body":"forwarded hello"}`))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	conversationID := canonicalPrivateConversationID(store.user.ID, "388754")
	conv := conversationByID(store.conversations, conversationID)
	if conv.ID == "" {
		t.Fatal("missing private conversation was not created")
	}
	if conv.Title != "恋情客" {
		t.Fatalf("conversation title = %q, want %q", conv.Title, "恋情客")
	}
	if conv.LastText != "forwarded hello" {
		t.Fatalf("lastText = %q, want %q", conv.LastText, "forwarded hello")
	}
}

func TestRegisteredPrivateMessageIsVisibleToReceiver(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	first := registerTestUser(t, mux, "+60", "66070201", "Chat66Test1", "发送方")
	second := registerTestUser(t, mux, "+60", "66070202", "Chat66Test2", "接收方")

	createReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"`+second.User.ChatID+`","greeting":"hi"}`))
	createReq.Header.Set("Authorization", "Bearer "+first.Token)
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected friend request 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created FriendRequest
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode friend request: %v", err)
	}

	acceptReq := httptest.NewRequest(http.MethodPatch, "/api/friend-requests/"+created.ID, bytes.NewBufferString(`{"status":"accepted"}`))
	acceptReq.Header.Set("Authorization", "Bearer "+second.Token)
	acceptRec := httptest.NewRecorder()
	mux.ServeHTTP(acceptRec, acceptReq)
	if acceptRec.Code != http.StatusOK {
		t.Fatalf("expected accept 200, got %d: %s", acceptRec.Code, acceptRec.Body.String())
	}

	sendReq := httptest.NewRequest(http.MethodPost, "/api/conversations/session-"+second.User.ID+"/messages", bytes.NewBufferString(`{"type":"text","body":"hello-real-flow"}`))
	sendReq.Header.Set("Authorization", "Bearer "+first.Token)
	sendRec := httptest.NewRecorder()
	mux.ServeHTTP(sendRec, sendReq)
	if sendRec.Code != http.StatusCreated {
		t.Fatalf("expected message 201, got %d: %s", sendRec.Code, sendRec.Body.String())
	}
	var sent Message
	if err := json.NewDecoder(sendRec.Body).Decode(&sent); err != nil {
		t.Fatalf("decode sent message: %v", err)
	}
	conversationID := canonicalPrivateConversationID(first.User.ID, second.User.ID)
	if sent.ConversationID != conversationID {
		t.Fatalf("sent conversationID = %q, want %q", sent.ConversationID, conversationID)
	}

	receiverListReq := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
	receiverListReq.Header.Set("Authorization", "Bearer "+second.Token)
	receiverListRec := httptest.NewRecorder()
	mux.ServeHTTP(receiverListRec, receiverListReq)
	if receiverListRec.Code != http.StatusOK {
		t.Fatalf("expected receiver conversations 200, got %d: %s", receiverListRec.Code, receiverListRec.Body.String())
	}
	var conversations []Conversation
	if err := json.NewDecoder(receiverListRec.Body).Decode(&conversations); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	receiverConversation := conversationByID(conversations, conversationID)
	if receiverConversation.ID == "" || receiverConversation.Title != "发送方" {
		t.Fatalf("receiver conversation = %+v, all=%+v", receiverConversation, conversations)
	}

	receiverMessagesReq := httptest.NewRequest(http.MethodGet, "/api/conversations/session-"+first.User.ID+"/messages", nil)
	receiverMessagesReq.Header.Set("Authorization", "Bearer "+second.Token)
	receiverMessagesRec := httptest.NewRecorder()
	mux.ServeHTTP(receiverMessagesRec, receiverMessagesReq)
	if receiverMessagesRec.Code != http.StatusOK {
		t.Fatalf("expected receiver messages 200, got %d: %s", receiverMessagesRec.Code, receiverMessagesRec.Body.String())
	}
	var messages []Message
	if err := json.NewDecoder(receiverMessagesRec.Body).Decode(&messages); err != nil {
		t.Fatalf("decode receiver messages: %v", err)
	}
	if len(messages) != 1 || messages[0].Body != "hello-real-flow" || messages[0].SenderID != first.User.ID {
		t.Fatalf("receiver messages = %+v", messages)
	}
}

func TestFriendRequestsListIncludesIncomingAndOutgoingDirections(t *testing.T) {
	store := seedStore()
	store.users["new-target"] = User{ID: "new-target", ChatID: "new66", Nickname: "新朋友", Avatar: avatar("新")}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"chatId":"new66","greeting":"你好"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/friend-requests", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d: %s", rec.Code, rec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/friend-requests", nil)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}

	var requests []FriendRequest
	if err := json.NewDecoder(listRec.Body).Decode(&requests); err != nil {
		t.Fatalf("decode requests: %v", err)
	}
	var sawIncoming, sawOutgoing bool
	for _, request := range requests {
		if request.ID == "fr1" && request.Direction == "incoming" {
			sawIncoming = true
		}
		if request.Direction == "outgoing" && request.User.ChatID == "new66" {
			sawOutgoing = true
		}
	}
	if !sawIncoming || !sawOutgoing {
		t.Fatalf("directions not preserved: %+v", requests)
	}
}

func TestFriendRequestCreateRejectsSelfExistingAndDuplicatePending(t *testing.T) {
	store := seedStore()
	store.users["new-target"] = User{ID: "new-target", ChatID: "new66", Nickname: "新朋友", Avatar: avatar("新")}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	selfReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"o8tew3","greeting":"hi"}`))
	selfRec := httptest.NewRecorder()
	mux.ServeHTTP(selfRec, selfReq)
	if selfRec.Code != http.StatusBadRequest {
		t.Fatalf("expected self request 400, got %d: %s", selfRec.Code, selfRec.Body.String())
	}

	existingReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"cdz888","greeting":"hi"}`))
	existingRec := httptest.NewRecorder()
	mux.ServeHTTP(existingRec, existingReq)
	if existingRec.Code != http.StatusBadRequest {
		t.Fatalf("expected existing contact 400, got %d: %s", existingRec.Code, existingRec.Body.String())
	}

	firstReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"new66","greeting":"你好"}`))
	firstRec := httptest.NewRecorder()
	mux.ServeHTTP(firstRec, firstReq)
	if firstRec.Code != http.StatusCreated {
		t.Fatalf("expected first request 201, got %d: %s", firstRec.Code, firstRec.Body.String())
	}

	duplicateReq := httptest.NewRequest(http.MethodPost, "/api/friend-requests", bytes.NewBufferString(`{"chatId":"new66","greeting":"再发一次"}`))
	duplicateRec := httptest.NewRecorder()
	mux.ServeHTTP(duplicateRec, duplicateReq)
	if duplicateRec.Code != http.StatusConflict {
		t.Fatalf("expected duplicate pending 409, got %d: %s", duplicateRec.Code, duplicateRec.Body.String())
	}
}

func TestFriendRequestAcceptAddsContactOnce(t *testing.T) {
	store := seedStore()
	store.requests = []FriendRequest{{ID: "fr-new", User: Contact{ID: "new-user", Nickname: "新朋友", ChatID: "new66", Avatar: avatar("新")}, Greeting: "你好", Status: "pending", Direction: "incoming", CreatedAt: time.Now()}}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPatch, "/api/friend-requests/fr-new", bytes.NewBufferString(`{"status":"accepted"}`))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected accept 200, got %d: %s", rec.Code, rec.Body.String())
		}
	}

	var count int
	for _, contact := range store.contacts {
		if contact.ID == "new-user" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("accepted contact count = %d, contacts=%+v", count, store.contacts)
	}
}

func TestFriendRequestRealtimeEventKeepsBothParticipants(t *testing.T) {
	request := FriendRequest{
		ID:         "fr-live",
		Status:     "accepted",
		User:       Contact{ID: "sender", Nickname: "发送方"},
		FromUserID: "sender",
		ToUserID:   "recipient",
	}

	reviewer := Contact{ID: "recipient", Nickname: "接收方"}
	event := friendRequestRealtimeEvent("friend.accepted", request, &reviewer)
	if event["type"] != "friend.accepted" {
		t.Fatalf("event type = %v", event["type"])
	}
	payload, ok := event["payload"].(map[string]any)
	if !ok {
		t.Fatalf("event payload = %#v", event["payload"])
	}
	reviewedBy, ok := payload["reviewer"].(Contact)
	if payload["fromUserId"] != "sender" || payload["toUserId"] != "recipient" || payload["status"] != "accepted" || !ok || reviewedBy.ID != reviewer.ID || reviewedBy.Nickname != reviewer.Nickname {
		t.Fatalf("event payload = %#v", payload)
	}
}

func TestDiscoverGroupsAreSeparateFromJoinedGroupsAndJoinable(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	listReq := httptest.NewRequest(http.MethodGet, "/api/groups", nil)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected groups 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var joined []Group
	if err := json.NewDecoder(listRec.Body).Decode(&joined); err != nil {
		t.Fatalf("decode groups: %v", err)
	}
	if groupByID(joined, "61001").ID != "" {
		t.Fatalf("discover group leaked into joined groups: %+v", joined)
	}

	discoverReq := httptest.NewRequest(http.MethodGet, "/api/groups/discover", nil)
	discoverRec := httptest.NewRecorder()
	mux.ServeHTTP(discoverRec, discoverReq)
	if discoverRec.Code != http.StatusOK {
		t.Fatalf("expected discover 200, got %d: %s", discoverRec.Code, discoverRec.Body.String())
	}
	var discover []Group
	if err := json.NewDecoder(discoverRec.Body).Decode(&discover); err != nil {
		t.Fatalf("decode discover groups: %v", err)
	}
	if groupByID(discover, "61001").ID == "" {
		t.Fatalf("discover group missing: %+v", discover)
	}

	joinReq := httptest.NewRequest(http.MethodPost, "/api/groups/61001/join-requests", bytes.NewBufferString(`{"greeting":"扫码入群"}`))
	joinRec := httptest.NewRecorder()
	mux.ServeHTTP(joinRec, joinReq)
	if joinRec.Code != http.StatusCreated {
		t.Fatalf("expected join 201, got %d: %s", joinRec.Code, joinRec.Body.String())
	}
	var join GroupJoinRequest
	if err := json.NewDecoder(joinRec.Body).Decode(&join); err != nil {
		t.Fatalf("decode join: %v", err)
	}
	if join.Status != "accepted" {
		t.Fatalf("join status = %q", join.Status)
	}
	if conversationByID(store.conversations, "group-61001").ID == "" {
		t.Fatalf("joined discover group conversation was not created: %+v", store.conversations)
	}
}

func TestSplitJoinedAndDiscoverGroups(t *testing.T) {
	store := seedStore()
	allGroups := map[string]Group{"21444": store.groups["21444"]}
	for _, group := range store.discoverGroups {
		allGroups[group.ID] = group
	}

	joined, discover := splitJoinedAndDiscoverGroups(allGroups, store.user.ID)

	if groupByID(mapValues(joined), "21444").ID == "" {
		t.Fatalf("joined group missing: %+v", joined)
	}
	if _, ok := joined["61001"]; ok {
		t.Fatalf("discover group leaked into joined map: %+v", joined)
	}
	if groupByID(discover, "61001").ID == "" {
		t.Fatalf("discover group missing: %+v", discover)
	}
}

func TestAllMutedBlocksMemberMessagesButAllowsAdminsAndOwner(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.AllMuted = true
	store.groups["21444"] = group
	store.sessions["member-token"] = "388754"
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	cases := []struct {
		name       string
		token      string
		wantStatus int
	}{
		{name: "member blocked", token: "member-token", wantStatus: http.StatusForbidden},
		{name: "admin allowed", token: "admin-token", wantStatus: http.StatusCreated},
		{name: "owner allowed", token: "", wantStatus: http.StatusCreated},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := bytes.NewBufferString(`{"type":"text","body":"test"}`)
			req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			rec := httptest.NewRecorder()

			mux.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("expected %d, got %d: %s", tc.wantStatus, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestGroupRateLimitBlocksOrdinaryMemberMessages(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.RateLimit = &GroupRateLimit{Enabled: true, WindowSeconds: 10, MaxMessages: 2}
	store.groups["21444"] = group
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	for i := 0; i < 2; i++ {
		body := bytes.NewBufferString(`{"type":"text","body":"test"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
		req.Header.Set("Authorization", "Bearer member-token")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("message %d expected 201, got %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}

	body := bytes.NewBufferString(`{"type":"text","body":"too fast"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGroupRateLimitDoesNotBlockAdminsOrOwner(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.RateLimit = &GroupRateLimit{Enabled: true, WindowSeconds: 10, MaxMessages: 1}
	store.groups["21444"] = group
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	cases := []struct {
		name  string
		token string
	}{
		{name: "admin", token: "admin-token"},
		{name: "owner", token: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for i := 0; i < 3; i++ {
				body := bytes.NewBufferString(`{"type":"text","body":"allowed"}`)
				req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
				if tc.token != "" {
					req.Header.Set("Authorization", "Bearer "+tc.token)
				}
				rec := httptest.NewRecorder()
				mux.ServeHTTP(rec, req)
				if rec.Code != http.StatusCreated {
					t.Fatalf("message %d expected 201, got %d: %s", i+1, rec.Code, rec.Body.String())
				}
			}
		})
	}
}

func TestGroupRateLimitCanBeUpdatedByAdmin(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	patchBody := bytes.NewBufferString(`{"rateLimit":{"enabled":true,"windowSeconds":10,"maxMessages":1}}`)
	patchReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444", patchBody)
	patchRec := httptest.NewRecorder()
	mux.ServeHTTP(patchRec, patchReq)
	if patchRec.Code != http.StatusOK {
		t.Fatalf("expected patch 200, got %d: %s", patchRec.Code, patchRec.Body.String())
	}

	for i := 0; i < 2; i++ {
		body := bytes.NewBufferString(`{"type":"text","body":"test"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
		req.Header.Set("Authorization", "Bearer member-token")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if i == 0 && rec.Code != http.StatusCreated {
			t.Fatalf("first message expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
		if i == 1 && rec.Code != http.StatusTooManyRequests {
			t.Fatalf("second message expected 429, got %d: %s", rec.Code, rec.Body.String())
		}
	}
}

func TestGroupRateLimitCanBeDisabledAfterBeingEnabled(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	group := store.groups["21444"]
	group.RateLimit = &GroupRateLimit{Enabled: true, WindowSeconds: 10, MaxMessages: 1}
	store.groups["21444"] = group
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	disableBody := bytes.NewBufferString(`{"rateLimit":{"enabled":false}}`)
	disableReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444", disableBody)
	disableRec := httptest.NewRecorder()
	mux.ServeHTTP(disableRec, disableReq)
	if disableRec.Code != http.StatusOK {
		t.Fatalf("expected disable 200, got %d: %s", disableRec.Code, disableRec.Body.String())
	}

	for i := 0; i < 3; i++ {
		body := bytes.NewBufferString(`{"type":"text","body":"after disabled"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
		req.Header.Set("Authorization", "Bearer member-token")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("message %d expected 201 after disabled, got %d: %s", i+1, rec.Code, rec.Body.String())
		}
	}
}

func TestGroupRateLimitUpdateCreatesAuditLog(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	patchBody := bytes.NewBufferString(`{"rateLimit":{"enabled":true,"windowSeconds":60,"maxMessages":10}}`)
	patchReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444", patchBody)
	patchRec := httptest.NewRecorder()
	mux.ServeHTTP(patchRec, patchReq)
	if patchRec.Code != http.StatusOK {
		t.Fatalf("expected patch 200, got %d: %s", patchRec.Code, patchRec.Body.String())
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)
	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "rate_limit_updated" {
		t.Fatalf("logs = %+v", logs)
	}
	if !strings.Contains(logs[0].Detail, "60 秒最多 10 条") {
		t.Fatalf("rate limit detail = %q", logs[0].Detail)
	}
}

func TestAutoMuteNewMembersMutesPublicJoinMember(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.AutoMuteNewMembers = true
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"想进群"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected join 201, got %d: %s", rec.Code, rec.Body.String())
	}
	member := groupMemberByID(store.groups["21444"], "1278382")
	if member.UserID == "" {
		t.Fatal("joined user was not added")
	}
	if !member.Muted {
		t.Fatal("auto-muted join member was not muted")
	}

	messageBody := bytes.NewBufferString(`{"type":"text","body":"hello"}`)
	messageReq := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", messageBody)
	messageReq.Header.Set("Authorization", "Bearer guest-token")
	messageRec := httptest.NewRecorder()
	mux.ServeHTTP(messageRec, messageReq)

	if messageRec.Code != http.StatusForbidden {
		t.Fatalf("expected muted member message 403, got %d: %s", messageRec.Code, messageRec.Body.String())
	}
}

func TestAutoMuteNewMembersMutesInvitedMember(t *testing.T) {
	store := seedStore()
	user, ok, err := store.userByID(context.Background(), "1278382")
	if err != nil || !ok {
		t.Fatalf("lookup invite target: ok=%v err=%v", ok, err)
	}
	user.Settings = mergeUserSettings(user.Settings, map[string]bool{"inviteGroupVerification": false})
	store.users[user.ID] = user
	group := store.groups["21444"]
	group.AutoMuteNewMembers = true
	store.groups["21444"] = group
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"1278382"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/members", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected invite 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var member Member
	if err := json.NewDecoder(rec.Body).Decode(&member); err != nil {
		t.Fatalf("decode member: %v", err)
	}
	if !member.Muted {
		t.Fatal("invited member was not auto-muted")
	}
}

func TestAutoMuteNewMembersCanBeUpdatedByAdmin(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"autoMuteNewMembers":true}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var group Group
	if err := json.NewDecoder(rec.Body).Decode(&group); err != nil {
		t.Fatalf("decode group: %v", err)
	}
	if !group.AutoMuteNewMembers {
		t.Fatal("autoMuteNewMembers was not persisted")
	}
}

func TestAutoMuteNewMembersUpdateCreatesAuditLog(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"autoMuteNewMembers":true}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)
	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "auto_mute_new_members_updated" {
		t.Fatalf("logs = %+v", logs)
	}
	if !strings.Contains(logs[0].Detail, "开启新成员入群自动禁言") {
		t.Fatalf("auto mute detail = %q", logs[0].Detail)
	}
}

func TestReadingConversationAddsReadReceiptCounts(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected member read 200, got %d: %s", rec.Code, rec.Body.String())
	}

	ownerReq := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages", nil)
	ownerRec := httptest.NewRecorder()
	mux.ServeHTTP(ownerRec, ownerReq)

	if ownerRec.Code != http.StatusOK {
		t.Fatalf("expected owner read 200, got %d: %s", ownerRec.Code, ownerRec.Body.String())
	}
	var messages []Message
	if err := json.NewDecoder(ownerRec.Body).Decode(&messages); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	ownerMessage := messageByID(messages, "m2")
	if ownerMessage.ID == "" {
		t.Fatal("owner message not found")
	}
	if ownerMessage.ReadCount < 1 {
		t.Fatalf("readCount = %d, want at least 1", ownerMessage.ReadCount)
	}
	if ownerMessage.ReadTotal != 4 {
		t.Fatalf("readTotal = %d, want 4", ownerMessage.ReadTotal)
	}
}

func TestMessageReadReceiptsListReadAndUnreadMembers(t *testing.T) {
	store := seedStore()
	store.messageReads["group-21444"] = map[string]time.Time{
		"388754": time.Now(),
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages/m2/reads", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected reads 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var detail struct {
		MessageID string `json:"messageId"`
		Read      []struct {
			UserID   string `json:"userId"`
			Nickname string `json:"nickname"`
		} `json:"read"`
		Unread []struct {
			UserID   string `json:"userId"`
			Nickname string `json:"nickname"`
		} `json:"unread"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&detail); err != nil {
		t.Fatalf("decode read detail: %v", err)
	}
	if detail.MessageID != "m2" || len(detail.Read) != 1 || detail.Read[0].UserID != "388754" {
		t.Fatalf("unexpected read detail: %+v", detail)
	}
	if len(detail.Unread) != 3 {
		t.Fatalf("unread members = %+v", detail.Unread)
	}
}

func TestMessageReadReceiptsRejectNonSender(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages/m2/reads", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected reads 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPublicGroupJoinRequestAddsMemberImmediately(t *testing.T) {
	store := seedStore()
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"想进群"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Status != "accepted" {
		t.Fatalf("status = %q", response.Status)
	}
	if !groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("public join did not add member")
	}
}

func TestQrJoinRequestRejectsMismatchedJoinCode(t *testing.T) {
	store := seedStore()
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"扫码入群","joinCode":"wrong-code"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected bad join code 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("mismatched qr code added member")
	}
}

func TestRefreshGroupQRCodeInvalidatesOldCode(t *testing.T) {
	store := seedStore()
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	oldCode := store.groups["21444"].ChatID
	refreshReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/qrcode/refresh", nil)
	refreshRec := httptest.NewRecorder()
	mux.ServeHTTP(refreshRec, refreshReq)
	if refreshRec.Code != http.StatusOK {
		t.Fatalf("expected refresh 200, got %d: %s", refreshRec.Code, refreshRec.Body.String())
	}
	var refreshed Group
	if err := json.NewDecoder(refreshRec.Body).Decode(&refreshed); err != nil {
		t.Fatalf("decode refreshed group: %v", err)
	}
	if refreshed.QRCode == "" || refreshed.QRCode == oldCode {
		t.Fatalf("qr code was not refreshed: old=%q group=%+v", oldCode, refreshed)
	}
	if refreshed.QRCodeExpiresAt == nil || !refreshed.QRCodeExpiresAt.After(time.Now()) {
		t.Fatalf("expected refreshed qr code to have a future expiry, got %+v", refreshed.QRCodeExpiresAt)
	}

	oldJoinBody := bytes.NewBufferString(`{"greeting":"旧二维码","joinCode":"` + oldCode + `"}`)
	oldJoinReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", oldJoinBody)
	oldJoinReq.Header.Set("Authorization", "Bearer guest-token")
	oldJoinRec := httptest.NewRecorder()
	mux.ServeHTTP(oldJoinRec, oldJoinReq)
	if oldJoinRec.Code != http.StatusBadRequest {
		t.Fatalf("expected old qr code 400, got %d: %s", oldJoinRec.Code, oldJoinRec.Body.String())
	}

	newJoinBody := bytes.NewBufferString(`{"greeting":"新二维码","joinCode":"` + refreshed.QRCode + `"}`)
	newJoinReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", newJoinBody)
	newJoinReq.Header.Set("Authorization", "Bearer guest-token")
	newJoinRec := httptest.NewRecorder()
	mux.ServeHTTP(newJoinRec, newJoinReq)
	if newJoinRec.Code != http.StatusCreated {
		t.Fatalf("expected new qr code 201, got %d: %s", newJoinRec.Code, newJoinRec.Body.String())
	}
}

func TestExpiredGroupQRCodeRejectsJoinRequest(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.QRCode = "expired-code"
	expiredAt := time.Now().Add(-time.Minute)
	group.QRCodeExpiresAt = &expiredAt
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"过期二维码","joinCode":"expired-code"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected expired qr code 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("expired qr code added member")
	}
}

func TestRefreshGroupQRCodeCanBePermanent(t *testing.T) {
	store := seedStore()
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	refreshBody := bytes.NewBufferString(`{"expiryMode":"permanent"}`)
	refreshReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/qrcode/refresh", refreshBody)
	refreshRec := httptest.NewRecorder()
	mux.ServeHTTP(refreshRec, refreshReq)
	if refreshRec.Code != http.StatusOK {
		t.Fatalf("expected refresh 200, got %d: %s", refreshRec.Code, refreshRec.Body.String())
	}
	var refreshed Group
	if err := json.NewDecoder(refreshRec.Body).Decode(&refreshed); err != nil {
		t.Fatalf("decode refreshed group: %v", err)
	}
	if refreshed.QRCode == "" {
		t.Fatalf("expected refreshed qr code, got %+v", refreshed)
	}
	if refreshed.QRCodeExpiresAt != nil {
		t.Fatalf("expected permanent qr code without expiry, got %+v", refreshed.QRCodeExpiresAt)
	}

	joinBody := bytes.NewBufferString(`{"greeting":"永久二维码","joinCode":"` + refreshed.QRCode + `"}`)
	joinReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", joinBody)
	joinReq.Header.Set("Authorization", "Bearer guest-token")
	joinRec := httptest.NewRecorder()
	mux.ServeHTTP(joinRec, joinReq)
	if joinRec.Code != http.StatusCreated {
		t.Fatalf("expected permanent qr code 201, got %d: %s", joinRec.Code, joinRec.Body.String())
	}
}

func TestRefreshGroupQRCodeCanExpireInOneDay(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	start := time.Now()
	refreshBody := bytes.NewBufferString(`{"expiryMode":"1d"}`)
	refreshReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/qrcode/refresh", refreshBody)
	refreshRec := httptest.NewRecorder()
	mux.ServeHTTP(refreshRec, refreshReq)
	if refreshRec.Code != http.StatusOK {
		t.Fatalf("expected refresh 200, got %d: %s", refreshRec.Code, refreshRec.Body.String())
	}
	var refreshed Group
	if err := json.NewDecoder(refreshRec.Body).Decode(&refreshed); err != nil {
		t.Fatalf("decode refreshed group: %v", err)
	}
	if refreshed.QRCodeExpiresAt == nil {
		t.Fatal("expected one-day qr code expiry")
	}
	min := start.Add(23 * time.Hour)
	max := start.Add(25 * time.Hour)
	if refreshed.QRCodeExpiresAt.Before(min) || refreshed.QRCodeExpiresAt.After(max) {
		t.Fatalf("expected expiry around one day, got %v", refreshed.QRCodeExpiresAt)
	}
}

func TestApprovalGroupJoinRequestRequiresAdminDecision(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"请审核"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Status != "pending" {
		t.Fatalf("status = %q", response.Status)
	}
	if groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("approval join added member before approval")
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/join-requests", nil)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)

	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var requests []GroupJoinRequest
	if err := json.NewDecoder(listRec.Body).Decode(&requests); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(requests) != 1 || requests[0].Status != "pending" {
		t.Fatalf("requests = %+v", requests)
	}
}

func TestApprovalGroupQrJoinRequestCreatesPendingApplication(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	group.QRCode = "approval-qr"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"扫码入群","joinCode":"approval-qr"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected qr approval join 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Status != "pending" {
		t.Fatalf("status = %q", response.Status)
	}
	if groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("approval qr join added member before approval")
	}
}

func TestDuplicateApprovalGroupJoinRequestReturnsExistingPendingApplication(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"第一次申请"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected first join 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var first GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&first); err != nil {
		t.Fatalf("decode first: %v", err)
	}

	duplicateBody := bytes.NewBufferString(`{"greeting":"重复申请"}`)
	duplicateReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", duplicateBody)
	duplicateReq.Header.Set("Authorization", "Bearer guest-token")
	duplicateRec := httptest.NewRecorder()
	mux.ServeHTTP(duplicateRec, duplicateReq)
	if duplicateRec.Code != http.StatusCreated {
		t.Fatalf("expected duplicate join 201, got %d: %s", duplicateRec.Code, duplicateRec.Body.String())
	}
	var duplicate GroupJoinRequest
	if err := json.NewDecoder(duplicateRec.Body).Decode(&duplicate); err != nil {
		t.Fatalf("decode duplicate: %v", err)
	}
	if duplicate.ID != first.ID {
		t.Fatalf("duplicate request id = %q, want existing %q", duplicate.ID, first.ID)
	}
	count := 0
	for _, request := range store.joinRequests {
		if request.GroupID == "21444" && request.User.ID == "1278382" && request.Status == "pending" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("pending request count = %d, want 1", count)
	}
}

func TestMemberCanListOwnGroupJoinRequestsOnly(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	registerBody := bytes.NewBufferString(`{"country":"+60","phone":"5552002","password":"demo123456","nickname":"路人"}`)
	registerReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", registerBody)
	registerRec := httptest.NewRecorder()
	mux.ServeHTTP(registerRec, registerReq)
	if registerRec.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d: %s", registerRec.Code, registerRec.Body.String())
	}
	var registerResponse struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(registerRec.Body).Decode(&registerResponse); err != nil {
		t.Fatalf("decode register: %v", err)
	}

	createBody := bytes.NewBufferString(`{"greeting":"请审核"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", createBody)
	createReq.Header.Set("Authorization", "Bearer guest-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/join-requests", nil)
	listReq.Header.Set("Authorization", "Bearer guest-token")
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected own list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var requests []GroupJoinRequest
	if err := json.NewDecoder(listRec.Body).Decode(&requests); err != nil {
		t.Fatalf("decode own list: %v", err)
	}
	if len(requests) != 1 || requests[0].User.ID != "1278382" {
		t.Fatalf("own requests = %+v", requests)
	}

	otherReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/join-requests", nil)
	otherReq.Header.Set("Authorization", "Bearer "+registerResponse.Token)
	otherRec := httptest.NewRecorder()
	mux.ServeHTTP(otherRec, otherReq)
	if otherRec.Code != http.StatusOK {
		t.Fatalf("expected other list 200, got %d: %s", otherRec.Code, otherRec.Body.String())
	}
	var otherRequests []GroupJoinRequest
	if err := json.NewDecoder(otherRec.Body).Decode(&otherRequests); err != nil {
		t.Fatalf("decode other list: %v", err)
	}
	if len(otherRequests) != 0 {
		t.Fatalf("other user saw requests: %+v", otherRequests)
	}
}

func TestRegisteredUserCanRequestApprovalGroupJoin(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	registerBody := bytes.NewBufferString(`{"country":"+60","phone":"5551001","password":"demo123456","nickname":"访客"}`)
	registerReq := httptest.NewRequest(http.MethodPost, "/api/auth/register", registerBody)
	registerRec := httptest.NewRecorder()
	mux.ServeHTTP(registerRec, registerReq)
	if registerRec.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d: %s", registerRec.Code, registerRec.Body.String())
	}
	var registerResponse struct {
		Token string `json:"token"`
		User  User   `json:"user"`
	}
	if err := json.NewDecoder(registerRec.Body).Decode(&registerResponse); err != nil {
		t.Fatalf("decode register: %v", err)
	}

	body := bytes.NewBufferString(`{"greeting":"请审核"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer "+registerResponse.Token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected join 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Status != "pending" {
		t.Fatalf("status = %q", response.Status)
	}
	if response.User.ID != registerResponse.User.ID {
		t.Fatalf("request user = %q, want %q", response.User.ID, registerResponse.User.ID)
	}
}

func TestAdminCanApproveGroupJoinRequest(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	createBody := bytes.NewBufferString(`{"greeting":"请审核"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", createBody)
	createReq.Header.Set("Authorization", "Bearer guest-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created GroupJoinRequest
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode create: %v", err)
	}

	approveBody := bytes.NewBufferString(`{"status":"accepted"}`)
	approveReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/join-requests/"+created.ID, approveBody)
	approveReq.Header.Set("Authorization", "Bearer admin-token")
	approveRec := httptest.NewRecorder()
	mux.ServeHTTP(approveRec, approveReq)

	if approveRec.Code != http.StatusOK {
		t.Fatalf("expected approve 200, got %d: %s", approveRec.Code, approveRec.Body.String())
	}
	if !groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("approved join did not add member")
	}
}

func TestBlacklistedPendingJoinRequestCannotBeApproved(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	createBody := bytes.NewBufferString(`{"greeting":"请审核"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", createBody)
	createReq.Header.Set("Authorization", "Bearer guest-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created GroupJoinRequest
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode create: %v", err)
	}

	blacklistBody := bytes.NewBufferString(`{"userId":"1278382","reason":"风险账号"}`)
	blacklistReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", blacklistBody)
	blacklistReq.Header.Set("Authorization", "Bearer admin-token")
	blacklistRec := httptest.NewRecorder()
	mux.ServeHTTP(blacklistRec, blacklistReq)
	if blacklistRec.Code != http.StatusCreated {
		t.Fatalf("expected blacklist 201, got %d: %s", blacklistRec.Code, blacklistRec.Body.String())
	}

	approveBody := bytes.NewBufferString(`{"status":"accepted"}`)
	approveReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/join-requests/"+created.ID, approveBody)
	approveReq.Header.Set("Authorization", "Bearer admin-token")
	approveRec := httptest.NewRecorder()
	mux.ServeHTTP(approveRec, approveReq)

	if approveRec.Code != http.StatusForbidden {
		t.Fatalf("expected approve 403, got %d: %s", approveRec.Code, approveRec.Body.String())
	}
	if groupHasMember(store.groups["21444"], "1278382") {
		t.Fatal("blacklisted pending applicant was added to group")
	}
}

func TestBlacklistingRejectsPendingJoinRequest(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	createBody := bytes.NewBufferString(`{"greeting":"请审核"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", createBody)
	createReq.Header.Set("Authorization", "Bearer guest-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	blacklistBody := bytes.NewBufferString(`{"userId":"1278382","reason":"风险账号"}`)
	blacklistReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", blacklistBody)
	blacklistReq.Header.Set("Authorization", "Bearer admin-token")
	blacklistRec := httptest.NewRecorder()
	mux.ServeHTTP(blacklistRec, blacklistReq)
	if blacklistRec.Code != http.StatusCreated {
		t.Fatalf("expected blacklist 201, got %d: %s", blacklistRec.Code, blacklistRec.Body.String())
	}

	for _, request := range store.joinRequests {
		if request.GroupID == "21444" && request.User.ID == "1278382" && request.Status != "rejected" {
			t.Fatalf("pending request status = %q, want rejected", request.Status)
		}
	}
}

func TestMemberCannotReviewGroupJoinRequest(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "approval"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	createBody := bytes.NewBufferString(`{"greeting":"请审核"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", createBody)
	createReq.Header.Set("Authorization", "Bearer guest-token")
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected create 201, got %d: %s", createRec.Code, createRec.Body.String())
	}
	var created GroupJoinRequest
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode create: %v", err)
	}

	approveBody := bytes.NewBufferString(`{"status":"accepted"}`)
	approveReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/join-requests/"+created.ID, approveBody)
	approveReq.Header.Set("Authorization", "Bearer member-token")
	approveRec := httptest.NewRecorder()
	mux.ServeHTTP(approveRec, approveReq)

	if approveRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", approveRec.Code, approveRec.Body.String())
	}
}

func TestClosedGroupRejectsJoinRequest(t *testing.T) {
	store := seedStore()
	group := store.groups["21444"]
	group.JoinMode = "closed"
	store.groups["21444"] = group
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"greeting":"想进群"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMemberCannotDeleteAnotherMembersMessage(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/conversations/group-21444/messages/m2", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if !messageExists(store.messages["group-21444"], "m2") {
		t.Fatal("message was deleted by unauthorized member")
	}
}

func TestMemberCanDeleteOwnMessage(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388786"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/conversations/group-21444/messages/m1", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if messageExists(store.messages["group-21444"], "m1") {
		t.Fatal("own message was not deleted")
	}
}

func TestAdminCanDeleteAnotherMembersMessage(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/conversations/group-21444/messages/m1", nil)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if messageExists(store.messages["group-21444"], "m1") {
		t.Fatal("message was not deleted by admin")
	}
}

func TestBatchDeleteMessagesUpdatesConversationPreview(t *testing.T) {
	store := seedStore()
	store.messages["group-21444"] = append(store.messages["group-21444"], Message{
		ID:             "m3",
		ConversationID: "group-21444",
		SenderID:       "388754",
		SenderName:     "恋情客",
		Type:           "text",
		Body:           "last message",
		CreatedAt:      store.messages["group-21444"][1].CreatedAt.Add(1),
	})
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"messageIds":["m2","m3"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages/batch-delete", body)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if messageExists(store.messages["group-21444"], "m2") || messageExists(store.messages["group-21444"], "m3") {
		t.Fatal("batch delete did not remove selected messages")
	}
	conv := conversationByID(store.conversations, "group-21444")
	if conv.LastText != "test" {
		t.Fatalf("lastText = %q, want %q", conv.LastText, "test")
	}
}

func TestOwnerCanTransferGroupOwnership(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"388754"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/transfer-owner", body)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	group := store.groups["21444"]
	if groupMemberRole(group, "388754") != "owner" {
		t.Fatalf("new owner role = %q", groupMemberRole(group, "388754"))
	}
	if groupMemberRole(group, "u1") != "admin" {
		t.Fatalf("old owner role = %q", groupMemberRole(group, "u1"))
	}
}

func TestAdminCannotTransferGroupOwnership(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"388754"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/transfer-owner", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMemberCannotTransferGroupOwnership(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"388770"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/transfer-owner", body)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCannotTransferGroupOwnershipToNonMember(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"1278382"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/transfer-owner", body)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestOwnerTransferCreatesAuditLog(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"388754"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/transfer-owner", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected transfer 200, got %d: %s", rec.Code, rec.Body.String())
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)

	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "owner_transferred" || logs[0].TargetID != "388754" {
		t.Fatalf("logs = %+v", logs)
	}
}

func TestBatchDeleteCreatesAuditLog(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"messageIds":["m1","m2"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages/batch-delete", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected delete 200, got %d: %s", rec.Code, rec.Body.String())
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)

	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "messages_deleted" || logs[0].TargetID != "2 messages" {
		t.Fatalf("logs = %+v", logs)
	}
	if !strings.Contains(logs[0].Detail, "test") || !strings.Contains(logs[0].Detail, "chenshao") {
		t.Fatalf("delete detail should include message summaries, got %q", logs[0].Detail)
	}
}

func TestSingleDeleteCreatesDetailedAuditLog(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/conversations/group-21444/messages/m2", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected delete 200, got %d: %s", rec.Code, rec.Body.String())
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)

	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "messages_deleted" || logs[0].TargetID != "m2" {
		t.Fatalf("logs = %+v", logs)
	}
	if !strings.Contains(logs[0].Detail, "删除 1 条消息") || !strings.Contains(logs[0].Detail, "@^魚") {
		t.Fatalf("delete detail should include message summary, got %q", logs[0].Detail)
	}
}

func TestInviteMemberCreatesDetailedAuditLog(t *testing.T) {
	store := seedStore()
	user, ok, err := store.userByID(context.Background(), "1278382")
	if err != nil || !ok {
		t.Fatalf("lookup invite target: ok=%v err=%v", ok, err)
	}
	user.Settings = mergeUserSettings(user.Settings, map[string]bool{"inviteGroupVerification": false})
	store.users[user.ID] = user
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"1278382"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/members", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected invite 201, got %d: %s", rec.Code, rec.Body.String())
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)
	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "member_invited" || logs[0].ActorName != "chenshao" || logs[0].TargetName != "小花朵接待号" || !strings.Contains(logs[0].Detail, "chenshao 邀请 小花朵接待号 入群") {
		t.Fatalf("logs = %+v", logs)
	}
}

func TestInviteMemberCreatesGroupSystemMessage(t *testing.T) {
	store := seedStore()
	user, ok, err := store.userByID(context.Background(), "1278382")
	if err != nil || !ok {
		t.Fatalf("lookup invite target: ok=%v err=%v", ok, err)
	}
	user.Settings = mergeUserSettings(user.Settings, map[string]bool{"inviteGroupVerification": false})
	store.users[user.ID] = user
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"1278382"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/members", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected invite 201, got %d: %s", rec.Code, rec.Body.String())
	}

	messagesReq := httptest.NewRequest(http.MethodGet, "/api/conversations/group-21444/messages", nil)
	messagesRec := httptest.NewRecorder()
	mux.ServeHTTP(messagesRec, messagesReq)
	if messagesRec.Code != http.StatusOK {
		t.Fatalf("expected messages 200, got %d: %s", messagesRec.Code, messagesRec.Body.String())
	}
	var messages []Message
	if err := json.NewDecoder(messagesRec.Body).Decode(&messages); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	last := messages[len(messages)-1]
	if last.Type != "system" || last.SenderName != "系统" || !strings.Contains(last.Body, "小花朵接待号 已加入群聊") {
		t.Fatalf("last message = %+v", last)
	}
}

func TestInviteMemberCreatesPendingRequestWhenTargetRequiresVerification(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	target := registerTestUser(t, mux, "+60", "66070112", "Chat66Test2", "测试账号2")

	body := bytes.NewBufferString(`{"userId":"` + target.User.ID + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/members", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected invite verification 202, got %d: %s", rec.Code, rec.Body.String())
	}
	var response GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Status != "pending" || response.User.ID != target.User.ID {
		t.Fatalf("response = %+v", response)
	}
	if groupHasMember(store.groups["21444"], target.User.ID) {
		t.Fatal("target was added to group before accepting invite")
	}

	requests := groupJoinRequestsForToken(t, mux, "21444", target.Token)
	if len(requests) != 1 || requests[0].Status != "pending" || requests[0].User.ID != target.User.ID {
		t.Fatalf("target requests = %+v", requests)
	}
}

func TestGroupInviteAppearsInRecipientInboxAndCanBeAccepted(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	target := registerTestUser(t, mux, "+60", "66070113", "Chat66Test2", "测试账号2")

	body := bytes.NewBufferString(`{"userId":"` + target.User.ID + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/members", body)
	req.Header.Set("Authorization", "Bearer demo-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected invite verification 202, got %d: %s", rec.Code, rec.Body.String())
	}
	var invite GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&invite); err != nil {
		t.Fatalf("decode invite: %v", err)
	}

	inboxReq := httptest.NewRequest(http.MethodGet, "/api/friend-requests", nil)
	inboxReq.Header.Set("Authorization", "Bearer "+target.Token)
	inboxRec := httptest.NewRecorder()
	mux.ServeHTTP(inboxRec, inboxReq)
	if inboxRec.Code != http.StatusOK {
		t.Fatalf("expected inbox 200, got %d: %s", inboxRec.Code, inboxRec.Body.String())
	}
	var inbox []FriendRequest
	if err := json.NewDecoder(inboxRec.Body).Decode(&inbox); err != nil {
		t.Fatalf("decode inbox: %v", err)
	}
	if len(inbox) != 1 || inbox[0].Type != "group-invite" || inbox[0].Direction != "incoming" || inbox[0].User.Nickname != "chenshao" || inbox[0].GroupTitle != "test" || inbox[0].GroupChatID != store.groups["21444"].ChatID {
		t.Fatalf("recipient inbox = %+v", inbox)
	}

	acceptReq := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/join-requests/"+invite.ID, bytes.NewBufferString(`{"status":"accepted"}`))
	acceptReq.Header.Set("Authorization", "Bearer "+target.Token)
	acceptRec := httptest.NewRecorder()
	mux.ServeHTTP(acceptRec, acceptReq)
	if acceptRec.Code != http.StatusOK {
		t.Fatalf("expected accept 200, got %d: %s", acceptRec.Code, acceptRec.Body.String())
	}
	if !groupHasMember(store.groups["21444"], target.User.ID) {
		t.Fatal("target was not added after accepting invite")
	}
}

func TestMemberCanLeaveGroupAndCreatesAuditLog(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/groups/21444/members/388754", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected leave 200, got %d: %s", rec.Code, rec.Body.String())
	}

	group := store.groups["21444"]
	if groupMemberRole(group, "388754") != "" {
		t.Fatalf("member was not removed: %+v", group.Members)
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)
	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "member_left" || logs[0].TargetID != "388754" {
		t.Fatalf("logs = %+v", logs)
	}
}

func TestMemberCannotViewAuditLogs(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAdminCanViewAuditLogs(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	store.auditLogs = append(store.auditLogs, AuditLog{
		ID:         "audit_test",
		GroupID:    "21444",
		ActorID:    "u1",
		ActorName:  "chenshao",
		Action:     "member_muted",
		TargetID:   "388754",
		TargetName: "恋情客",
		Detail:     "禁言成员",
		CreatedAt:  store.groups["21444"].CreatedAt,
	})
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(rec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) != 1 || logs[0].Action != "member_muted" {
		t.Fatalf("logs = %+v", logs)
	}
}

func TestOwnerCanBlacklistMemberAndRemoveFromGroup(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"388754","reason":"刷屏"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if groupHasMember(store.groups["21444"], "388754") {
		t.Fatal("blacklisted member was not removed from group")
	}

	logReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/audit-logs", nil)
	logRec := httptest.NewRecorder()
	mux.ServeHTTP(logRec, logReq)

	if logRec.Code != http.StatusOK {
		t.Fatalf("expected logs 200, got %d: %s", logRec.Code, logRec.Body.String())
	}
	var logs []AuditLog
	if err := json.NewDecoder(logRec.Body).Decode(&logs); err != nil {
		t.Fatalf("decode logs: %v", err)
	}
	if len(logs) == 0 || logs[0].Action != "member_blacklisted" || logs[0].TargetID != "388754" {
		t.Fatalf("logs = %+v", logs)
	}
}

func TestBlacklistedUserCannotRequestToJoin(t *testing.T) {
	store := seedStore()
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	blacklistBody := bytes.NewBufferString(`{"userId":"1278382","reason":"风险账号"}`)
	blacklistReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", blacklistBody)
	blacklistRec := httptest.NewRecorder()
	mux.ServeHTTP(blacklistRec, blacklistReq)
	if blacklistRec.Code != http.StatusCreated {
		t.Fatalf("expected blacklist 201, got %d: %s", blacklistRec.Code, blacklistRec.Body.String())
	}

	body := bytes.NewBufferString(`{"greeting":"想进群"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestBlacklistedUserCannotBeInvited(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	blacklistBody := bytes.NewBufferString(`{"userId":"1278382","reason":"风险账号"}`)
	blacklistReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", blacklistBody)
	blacklistRec := httptest.NewRecorder()
	mux.ServeHTTP(blacklistRec, blacklistReq)
	if blacklistRec.Code != http.StatusCreated {
		t.Fatalf("expected blacklist 201, got %d: %s", blacklistRec.Code, blacklistRec.Body.String())
	}

	body := bytes.NewBufferString(`{"userId":"1278382"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/members", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMemberCannotViewGroupBlacklist(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/groups/21444/blacklist", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAdminCannotBlacklistAdmin(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	if _, err := store.updateGroupMember(nil, "21444", "388770", "admin", nil); err != nil {
		t.Fatalf("make second admin: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"userId":"388770","reason":"越权测试"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if !groupHasMember(store.groups["21444"], "388770") {
		t.Fatal("admin was removed even though blacklisting should be forbidden")
	}
}

func TestOwnerCanRemoveGroupBlacklist(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	blacklistBody := bytes.NewBufferString(`{"userId":"1278382","reason":"误操作"}`)
	blacklistReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", blacklistBody)
	blacklistRec := httptest.NewRecorder()
	mux.ServeHTTP(blacklistRec, blacklistReq)
	if blacklistRec.Code != http.StatusCreated {
		t.Fatalf("expected blacklist 201, got %d: %s", blacklistRec.Code, blacklistRec.Body.String())
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/groups/21444/blacklist/1278382", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/groups/21444/blacklist", nil)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var entries []GroupBlacklistEntry
	if err := json.NewDecoder(listRec.Body).Decode(&entries); err != nil {
		t.Fatalf("decode entries: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("entries = %+v", entries)
	}
}

func TestUnblacklistedUserCanRequestToJoinAgain(t *testing.T) {
	store := seedStore()
	store.sessions["guest-token"] = "1278382"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	blacklistBody := bytes.NewBufferString(`{"userId":"1278382","reason":"误操作"}`)
	blacklistReq := httptest.NewRequest(http.MethodPost, "/api/groups/21444/blacklist", blacklistBody)
	blacklistRec := httptest.NewRecorder()
	mux.ServeHTTP(blacklistRec, blacklistReq)
	if blacklistRec.Code != http.StatusCreated {
		t.Fatalf("expected blacklist 201, got %d: %s", blacklistRec.Code, blacklistRec.Body.String())
	}

	removeReq := httptest.NewRequest(http.MethodDelete, "/api/groups/21444/blacklist/1278382", nil)
	removeRec := httptest.NewRecorder()
	mux.ServeHTTP(removeRec, removeReq)
	if removeRec.Code != http.StatusOK {
		t.Fatalf("expected remove 200, got %d: %s", removeRec.Code, removeRec.Body.String())
	}

	body := bytes.NewBufferString(`{"greeting":"重新申请"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/join-requests", body)
	req.Header.Set("Authorization", "Bearer guest-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected join 201 after unblacklist, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAdminCanUpdateGroupBotPlan(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"enabled":true,"message":"今晚 8 点语音集合","intervalSeconds":60}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/bots/announcement", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var bot GroupBot
	if err := json.NewDecoder(rec.Body).Decode(&bot); err != nil {
		t.Fatalf("decode bot: %v", err)
	}
	if !bot.Enabled {
		t.Fatal("bot was not enabled")
	}
	if bot.Message != "今晚 8 点语音集合" {
		t.Fatalf("message = %q", bot.Message)
	}
	if bot.IntervalSeconds != 60 {
		t.Fatalf("intervalSeconds = %d", bot.IntervalSeconds)
	}
}

func TestAdminCanUpdateGroupBotKeywordRules(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"enabled":true,"message":"定时公告","keywordRules":[{"keyword":"公告","reply":"请查看群公告"},{"keyword":"客服","reply":"请联系值班客服"}]}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/bots/announcement", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var bot GroupBot
	if err := json.NewDecoder(rec.Body).Decode(&bot); err != nil {
		t.Fatalf("decode bot: %v", err)
	}
	if len(bot.KeywordRules) != 2 {
		t.Fatalf("keyword rules length = %d", len(bot.KeywordRules))
	}
	if bot.KeywordRules[0].Keyword != "公告" || bot.KeywordRules[0].Reply != "请查看群公告" {
		t.Fatalf("keyword rule = %+v", bot.KeywordRules[0])
	}
	if store.auditLogs[0].Action != "bot_keyword_rules_updated" {
		t.Fatalf("audit action = %q", store.auditLogs[0].Action)
	}
}

func TestGroupBotKeywordRuleAutoRepliesToMatchingMessage(t *testing.T) {
	store := seedStore()
	bot := store.groupBotByID("21444", "announcement")
	bot.Enabled = true
	bot.KeywordRules = []BotKeywordRule{{Keyword: "公告", Reply: "请查看群公告"}}
	if err := store.upsertGroupBot(context.Background(), "21444", bot); err != nil {
		t.Fatalf("upsert bot: %v", err)
	}
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"type":"text","body":"今天有公告吗"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/group-21444/messages", body)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	messages := store.messages["group-21444"]
	if len(messages) < 2 {
		t.Fatalf("messages length = %d", len(messages))
	}
	last := messages[len(messages)-1]
	if last.SenderName != "公告机器人" || last.Body != "请查看群公告" {
		t.Fatalf("last message = %+v", last)
	}
}

func TestAdminCanUpdateGroupBotName(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"name":"值班公告助手","message":"今晚 8 点语音集合","intervalSeconds":60}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/bots/announcement", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var bot GroupBot
	if err := json.NewDecoder(rec.Body).Decode(&bot); err != nil {
		t.Fatalf("decode bot: %v", err)
	}
	if bot.Name != "值班公告助手" {
		t.Fatalf("name = %q", bot.Name)
	}
	stored := store.groupBotByID("21444", "announcement")
	if stored.Name != "值班公告助手" {
		t.Fatalf("stored name = %q", stored.Name)
	}
}

func TestAdminCanCreateAdditionalGroupBot(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"name":"早报机器人","message":"每日早报已更新","intervalSeconds":300}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/bots", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var bot GroupBot
	if err := json.NewDecoder(rec.Body).Decode(&bot); err != nil {
		t.Fatalf("decode bot: %v", err)
	}
	if bot.ID == "" || bot.ID == "announcement" {
		t.Fatalf("id = %q", bot.ID)
	}
	if bot.Name != "早报机器人" || bot.Message != "每日早报已更新" {
		t.Fatalf("bot = %+v", bot)
	}
	bots := store.groupBotsFor("21444")
	if len(bots) != 2 {
		t.Fatalf("bots length = %d, want 2", len(bots))
	}
	if store.auditLogs[0].Action != "bot_created" {
		t.Fatalf("audit action = %q", store.auditLogs[0].Action)
	}
}

func TestAdminCanDeleteCustomGroupBot(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	bot := defaultGroupBot("21444")
	bot.ID = "morning"
	bot.Name = "早报机器人"
	bot.Message = "每日早报已更新"
	if err := store.upsertGroupBot(context.Background(), "21444", bot); err != nil {
		t.Fatalf("upsert bot: %v", err)
	}
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/groups/21444/bots/morning", nil)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := store.groupBotByID("21444", "morning"); got.ID != "" {
		t.Fatalf("deleted bot still exists: %+v", got)
	}
	if store.auditLogs[0].Action != "bot_deleted" {
		t.Fatalf("audit action = %q", store.auditLogs[0].Action)
	}
}

func TestMemberCannotManageGroupBots(t *testing.T) {
	store := seedStore()
	store.sessions["member-token"] = "388754"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodGet, "/api/groups/21444/bots", nil)
	req.Header.Set("Authorization", "Bearer member-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestEnabledGroupBotSendsDueMessage(t *testing.T) {
	store := seedStore()
	bot := store.groupBotByID("21444", "announcement")
	bot.Enabled = true
	bot.Message = "请查看最新群公告"
	bot.IntervalSeconds = 60
	bot.NextRunAt = time.Now().Add(-time.Second)
	store.upsertGroupBot(context.Background(), "21444", bot)

	now := time.Now()
	sent, err := store.runDueGroupBots(context.Background(), now)
	if err != nil {
		t.Fatalf("run bots: %v", err)
	}
	if sent != 1 {
		t.Fatalf("sent = %d", sent)
	}
	messages := store.messages["group-21444"]
	last := messages[len(messages)-1]
	if last.SenderName != "公告机器人" {
		t.Fatalf("senderName = %q", last.SenderName)
	}
	if last.Body != "请查看最新群公告" {
		t.Fatalf("body = %q", last.Body)
	}
	updated := store.groupBotByID("21444", "announcement")
	if !updated.NextRunAt.After(now) {
		t.Fatalf("nextRunAt was not advanced: %s", updated.NextRunAt)
	}
}

func TestEnabledGroupBotCreatesAuditLogWhenScheduledMessageSends(t *testing.T) {
	store := seedStore()
	bot := store.groupBotByID("21444", "announcement")
	bot.Enabled = true
	bot.Message = "请查看最新群公告"
	bot.IntervalSeconds = 60
	bot.NextRunAt = time.Now().Add(-time.Second)
	store.upsertGroupBot(context.Background(), "21444", bot)

	_, err := store.runDueGroupBots(context.Background(), time.Now())
	if err != nil {
		t.Fatalf("run bots: %v", err)
	}

	if len(store.auditLogs) == 0 {
		t.Fatal("expected audit log")
	}
	log := store.auditLogs[0]
	if log.Action != "bot_auto_sent" {
		t.Fatalf("action = %q", log.Action)
	}
	if log.TargetName != "公告机器人" {
		t.Fatalf("targetName = %q", log.TargetName)
	}
	if !strings.Contains(log.Detail, "请查看最新群公告") {
		t.Fatalf("detail = %q", log.Detail)
	}
}

func TestDisabledGroupBotDoesNotSendMessage(t *testing.T) {
	store := seedStore()
	bot := store.groupBotByID("21444", "announcement")
	bot.Enabled = false
	bot.Message = "不应该发送"
	bot.IntervalSeconds = 60
	bot.NextRunAt = time.Now().Add(-time.Second)
	store.upsertGroupBot(context.Background(), "21444", bot)
	before := len(store.messages["group-21444"])

	sent, err := store.runDueGroupBots(context.Background(), time.Now())
	if err != nil {
		t.Fatalf("run bots: %v", err)
	}
	if sent != 0 {
		t.Fatalf("sent = %d", sent)
	}
	if got := len(store.messages["group-21444"]); got != before {
		t.Fatalf("messages length = %d, want %d", got, before)
	}
}

func TestAdminCanUpdateGroupBotDailyPlan(t *testing.T) {
	store := seedStore()
	existing := store.groupBotByID("21444", "announcement")
	existing.NextRunAt = time.Now().Add(5 * time.Minute)
	store.upsertGroupBot(context.Background(), "21444", existing)
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"enabled":false,"message":"每日 20:30 公告","scheduleMode":"daily","dailyTime":"20:30"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/21444/bots/announcement", body)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var bot GroupBot
	if err := json.NewDecoder(rec.Body).Decode(&bot); err != nil {
		t.Fatalf("decode bot: %v", err)
	}
	if bot.ScheduleMode != "daily" {
		t.Fatalf("scheduleMode = %q", bot.ScheduleMode)
	}
	if bot.DailyTime != "20:30" {
		t.Fatalf("dailyTime = %q", bot.DailyTime)
	}
	if bot.IntervalSeconds != 0 {
		t.Fatalf("intervalSeconds = %d", bot.IntervalSeconds)
	}
	if bot.NextRunAt.Minute() != 30 || bot.NextRunAt.Hour() != 20 {
		t.Fatalf("nextRunAt = %s, want daily 20:30", bot.NextRunAt)
	}
}

func TestDailyGroupBotAdvancesNextRunToTomorrow(t *testing.T) {
	store := seedStore()
	now := time.Date(2026, 7, 5, 20, 31, 0, 0, time.Local)
	bot := store.groupBotByID("21444", "announcement")
	bot.Enabled = true
	bot.Message = "每日公告"
	bot.ScheduleMode = "daily"
	bot.DailyTime = "20:30"
	bot.IntervalSeconds = 0
	bot.NextRunAt = now.Add(-time.Minute)
	store.upsertGroupBot(context.Background(), "21444", bot)

	sent, err := store.runDueGroupBots(context.Background(), now)
	if err != nil {
		t.Fatalf("run bots: %v", err)
	}
	if sent != 1 {
		t.Fatalf("sent = %d", sent)
	}
	updated := store.groupBotByID("21444", "announcement")
	want := time.Date(2026, 7, 6, 20, 30, 0, 0, time.Local)
	if !updated.NextRunAt.Equal(want) {
		t.Fatalf("nextRunAt = %s, want %s", updated.NextRunAt, want)
	}
}

func TestAdminCanRunGroupBotImmediately(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	body := bytes.NewBufferString(`{"message":"立即测试公告"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/groups/21444/bots/announcement/run", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var msg Message
	if err := json.NewDecoder(rec.Body).Decode(&msg); err != nil {
		t.Fatalf("decode message: %v", err)
	}
	if msg.SenderName != "公告机器人" || msg.Body != "立即测试公告" {
		t.Fatalf("message = %+v", msg)
	}
}

func TestOwnerCanDissolveGroup(t *testing.T) {
	store := seedStore()
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/groups/21444", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if _, ok := store.groups["21444"]; ok {
		t.Fatal("group still exists after dissolve")
	}
	if conversationByID(store.conversations, "group-21444").ID != "" {
		t.Fatal("group conversation still exists after dissolve")
	}
	if len(store.messages["group-21444"]) != 0 {
		t.Fatalf("group messages still exist: %+v", store.messages["group-21444"])
	}
}

func TestAdminCannotDissolveGroup(t *testing.T) {
	store := seedStore()
	store.sessions["admin-token"] = "388769"
	mux := http.NewServeMux()
	registerRoutes(mux, store)

	req := httptest.NewRequest(http.MethodDelete, "/api/groups/21444", nil)
	req.Header.Set("Authorization", "Bearer admin-token")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if _, ok := store.groups["21444"]; !ok {
		t.Fatal("group was deleted by admin")
	}
}

func groupHasMember(group Group, userID string) bool {
	for _, member := range group.Members {
		if member.UserID == userID {
			return true
		}
	}
	return false
}

func groupMemberRole(group Group, userID string) string {
	for _, member := range group.Members {
		if member.UserID == userID {
			return member.Role
		}
	}
	return ""
}

func groupMemberByID(group Group, userID string) Member {
	for _, member := range group.Members {
		if member.UserID == userID {
			return member
		}
	}
	return Member{}
}

func messageExists(messages []Message, messageID string) bool {
	for _, message := range messages {
		if message.ID == messageID {
			return true
		}
	}
	return false
}

func messageByID(messages []Message, messageID string) Message {
	for _, message := range messages {
		if message.ID == messageID {
			return message
		}
	}
	return Message{}
}

func conversationByID(conversations []Conversation, conversationID string) Conversation {
	for _, conversation := range conversations {
		if conversation.ID == conversationID {
			return conversation
		}
	}
	return Conversation{}
}

func groupByID(groups []Group, groupID string) Group {
	for _, group := range groups {
		if group.ID == groupID {
			return group
		}
	}
	return Group{}
}

type registerTestUserResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

func registerTestUser(t *testing.T, mux *http.ServeMux, country, phone, password, nickname string) registerTestUserResponse {
	t.Helper()
	body := bytes.NewBufferString(fmt.Sprintf(`{"country":%q,"phone":%q,"password":%q,"nickname":%q}`, country, phone, password, nickname))
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected register 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response registerTestUserResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	if response.Token == "" {
		t.Fatal("register response token is empty")
	}
	return response
}

func listFriendRequestsForToken(t *testing.T, mux *http.ServeMux, token string) []FriendRequest {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/friend-requests", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected friend requests 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var requests []FriendRequest
	if err := json.NewDecoder(rec.Body).Decode(&requests); err != nil {
		t.Fatalf("decode friend requests response: %v", err)
	}
	return requests
}

func groupJoinRequestsForToken(t *testing.T, mux *http.ServeMux, groupID, token string) []GroupJoinRequest {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/groups/"+groupID+"/join-requests", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected group join requests 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var requests []GroupJoinRequest
	if err := json.NewDecoder(rec.Body).Decode(&requests); err != nil {
		t.Fatalf("decode group join requests response: %v", err)
	}
	return requests
}

func mapValues(groups map[string]Group) []Group {
	values := make([]Group, 0, len(groups))
	for _, group := range groups {
		values = append(values, group)
	}
	return values
}
