package main

import "testing"

func TestEnsureGroupOwnerMemberPromotesPersistedOwnerRole(t *testing.T) {
	group := Group{
		ID: "group-1",
		Members: []Member{
			{UserID: "owner-1", Nickname: "旧昵称", Role: "member"},
			{UserID: "member-1", Nickname: "成员", Role: "member"},
		},
	}

	updated := ensureGroupOwnerMember(group, Member{UserID: "owner-1", Nickname: "群主", Role: "owner"})

	if updated.Members[0].Role != "owner" {
		t.Fatalf("owner role = %q, want owner", updated.Members[0].Role)
	}
	if updated.Members[0].Nickname != "旧昵称" {
		t.Fatalf("owner nickname = %q, want 旧昵称", updated.Members[0].Nickname)
	}
}

func TestStoredGroupOwnerCanManageEvenWhenLegacyMemberRoleIsStale(t *testing.T) {
	store := &Store{groups: map[string]Group{
		"group-1": {
			ID:          "group-1",
			OwnerUserID: "owner-1",
			Members:     []Member{{UserID: "owner-1", Role: "member"}},
		},
	}}

	if !store.canManageGroup("group-1", "owner-1") {
		t.Fatal("stored group owner should retain management permission")
	}
	if !store.isGroupOwner("group-1", "owner-1") {
		t.Fatal("stored group owner should retain owner-only permission")
	}
}

func TestRuntimeGroupsKeepGroupsForEveryAccount(t *testing.T) {
	groups := runtimeGroups(map[string]Group{
		"group-owner-1": {ID: "group-owner-1", OwnerUserID: "owner-1"},
		"group-owner-2": {ID: "group-owner-2", OwnerUserID: "owner-2"},
	})

	if len(groups) != 2 {
		t.Fatalf("runtime groups = %d, want 2", len(groups))
	}
	store := &Store{groups: groups}
	if !store.canManageGroup("group-owner-2", "owner-2") {
		t.Fatal("group owner loaded after the bootstrap account should retain permission")
	}
}
