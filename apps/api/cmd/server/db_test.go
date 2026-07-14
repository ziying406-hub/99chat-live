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
