# Task 2 Report: Record and Send Audio

## Implemented

- Added MediaRecorder state for the recorder, stream, start time, and active recording state.
- The voice pad now starts microphone capture on pointer down and stops on pointer up, pointer cancel, or pointer leave while recording.
- Active recording renders a live `MM:SS` duration with `松开发送`; idle renders `按住录音`.
- On a valid recording (at least one second), the app creates a WebM `File`, uploads it, and sends `{ type: "voice", body, attachment }`.
- Microphone, recorder, empty-audio, upload, and send-adjacent failure paths do not call `sendMessage` before a valid attachment is available.
- Conversation transitions and page unload cancel the recorder and stop all media tracks. A completed upload also verifies that the original conversation is still selected before sending.

## Verification

```text
node --test apps/web/src/voiceMessage.test.js apps/web/src/composerActions.test.js

5 passed, 0 failed
```

```text
node --check apps/web/src/app.js
git diff --check

both passed
```

## Self Review

- The stop event is ignored after cancellation by checking recorder identity, preventing a cancelled recording from being uploaded or sent.
- Releasing while the microphone permission prompt is open clears the pending state; a subsequently granted stream is stopped immediately.
- Switching conversations during upload prevents the result from being sent to the newly selected conversation.

## Concern

- A manual microphone authorization and hold/release test was not run in this environment, so real device/browser MediaRecorder behavior still needs that final browser check.
