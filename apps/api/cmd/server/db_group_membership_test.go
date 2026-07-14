package main

import "testing"

func TestEnsureGroupOwnerMemberRestoresMissingOwner(t *testing.T) {
	group := Group{
		ID: "group-1",
		Members: []Member{{UserID: "member-1", Nickname: "成员", Role: "member"}},
	}

	updated := ensureGroupOwnerMember(group, Member{UserID: "owner-1", Nickname: "群主", Role: "owner"})

	if len(updated.Members) != 2 {
		t.Fatalf("expected owner to be restored, got %d members", len(updated.Members))
	}
	if updated.Members[0].UserID != "owner-1" || updated.Members[0].Role != "owner" {
		t.Fatalf("expected owner first, got %#v", updated.Members)
	}
}
