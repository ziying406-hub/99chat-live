# Realtime Events

All realtime messages are JSON envelopes:

```json
{
  "type": "message.created",
  "conversationId": "group-21444",
  "payload": {}
}
```

## Client Events

- `message.create`: send a text, media, file, voice, contact, or collection message.
- `message.read`: mark a conversation as read.
- `typing`: announce that a user is typing.

## Server Events

- `message.created`
- `message.read`
- `conversation.updated`
- `typing`
- `friend.requested`
- `friend.accepted`
- `friend.rejected`
- `friend.removed`
- `group.member.updated`

## Friend Events

All friend events use the same envelope shape described above and carry a `payload` with:

- `id`: request/event id.
- `fromUserId`: the user who initiated the request/action.
- `toUserId`: the target user.
- `status`: `pending`, `accepted`, `rejected`, or `removed`.
- `user`: a contact object relevant to the event.
- `reviewer` (optional): a contact object for the user who reviewed the request.

Example:

```json
{
  "type": "friend.accepted",
  "payload": {
    "id": "fr-123",
    "fromUserId": "u-from",
    "toUserId": "u-to",
    "status": "accepted",
    "user": {"id": "u-from", "nickname": "Alice"},
    "reviewer": {"id": "u-to", "nickname": "Bob"}
  }
}
```
