# Voice Recording Slide-to-Cancel

## Goal

Prevent accidental voice-message sends while keeping the existing press-and-hold
recording interaction fast on mobile and desktop.

## Chosen interaction

- Press and hold the voice pad to start recording.
- Releasing while the pointer remains within the normal recording zone sends the
  recording, subject to the existing one-second minimum.
- Moving the active pointer upward by a small, fixed threshold changes the pad
  into a cancellation state and shows "松开取消".
- Releasing in that state cancels the recording. No audio upload, message send,
  pending message, or conversation update is created.
- Pressing Escape while recording uses the same cancellation path. This covers
  mouse and keyboard users without adding another persistent control.

## Boundaries

- Existing microphone permission, minimum duration, upload retry, and playback
  behavior remain unchanged.
- Moving sideways or downward does not cancel a recording.
- Pointer cancellation, a conversation switch, and microphone failures retain
  their existing cleanup behavior.

## Implementation shape

- Keep the pointer origin and a `voiceRecordingCancelArmed` flag in composer
  state.
- Derive the pad label and CSS state from that flag rather than rerendering the
  whole chat on each pointer movement.
- On pointer release, choose between the existing send completion path and the
  existing recording cleanup path based on the armed flag.
- Clear the pointer origin and flag whenever recording resets, including all
  error and cancellation exits.

## Verification

- A focused unit test proves the upward-threshold decision and prevents a
  sideways move from cancelling.
- A focused unit test proves an armed cancellation never calls the voice-send
  completion path.
- Browser check: record a voice, move upward until the cancellation state is
  visible, release, and confirm that no message appears for either participant.
- Browser check: record and release without moving upward, then confirm the
  voice message still sends and plays normally.
