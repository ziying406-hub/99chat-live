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
- `group.member.updated`
