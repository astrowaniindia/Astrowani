# EnableX Audio Calls

EnableX provides flexible audio handling for both voice-only calls and multi-modal sessions.

## Audio Calling Implementation
For React Native and other SDKs, audio is handled via the `EnxStream` object.

### Initializing Audio
When creating a local stream, specify `audio: true`.
```javascript
const localInfo = {
    audio: true,
    video: false, // For voice-only calls
    data: true
};
Enx.initLocalStream(localInfo);
```

### Specialized Audio View Mode
For 1-to-1 audio calls, EnableX offers an `isAudioViewMode` that simplifies the UI:
- Replaces the video grid with avatars.
- Optimized for mobile bandwidth and battery.
- Configurable via `EnxAudioViewConfig`.

## Audio Events
- `onUserAudioMuted`: Fired when a participant mutes their mic.
- `onUserAudioUnmuted`: Fired when a participant unmutes their mic.
- `onAudioEvent`: General callback for audio state changes.

## Mute / Unmute
Control your own audio publishing state.
- **Method:** `Enx.muteSelfAudio(localStreamId, true/false)`
- **Server-Side Mute:** Moderators can mute other participants globally.

## Connection States
- **Establishing:** Negotiating audio codecs (e.g., Opus for high quality).
- **Active:** Audio data is being transmitted.
- **Degraded:** Network congestion causing packet loss or high jitter.

## Best Practices
1. **Echo Cancellation:** Always rely on the SDK's built-in Acoustic Echo Cancellation (AEC).
2. **Noise Suppression:** Enable noise suppression for better clarity in noisy environments.
3. **Mute by Default:** For large rooms (lecture mode), participants should join with audio muted.
4. **VAD (Voice Activity Detection):** Use VAD events to highlight the "Active Talker" in your UI.
5. **Headset Detection:** Monitor for changes in audio output devices (e.g., plugging in headphones) to adjust volume levels.
