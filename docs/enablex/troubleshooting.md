# EnableX Troubleshooting

Common issues and strategies for debugging EnableX implementations.

## Common Error Codes
- **401 Unauthorized**: Invalid `App ID` or `App Key` used in REST API calls.
- **403 Forbidden**: The Video API service is not enabled for your project in the EnableX Portal.
- **404 Not Found**: Incorrect `room_id` or `token` endpoint URL.
- **Room Full**: The number of participants has reached the limit set during room creation.
- **Token Expired**: The JWT token used to join has passed its TTL. Generate a new one.

## Debugging Steps
1. **Console Logs:** Set the log level to capture detailed internal events.
    - `Enx.setLogLevel(5)` (Verbose).
2. **Network Tab:** Inspect WebSocket connections and REST API responses in web browsers.
3. **Dashboard Logs:** Check the [EnableX Dashboard](https://portal.enablex.io/) for session history and error logs.
4. **Local Stream Test:** Ensure `initLocalStream` succeeds before calling `connect`. Failure here usually means camera/mic permissions were denied.

## Network Issues
- **Firewalls:** EnableX requires certain ports to be open for WebRTC (UDP/TCP). If users are behind a restrictive corporate firewall, they may need to use TURN servers (automatically handled by EnableX).
- **Bandwidth:** Video requires ~500kbps+ for stable quality. Low bandwidth leads to:
    - `onConnectionInterrupted` events.
    - Frozen video frames.
    - Audio-only fallback.
- **Jitter/Latency:** High latency (>300ms) will cause noticeable delays in conversation.

## Reconnection Strategies
1. **Listen for Interruption:** When `onConnectionInterrupted` fires, show a "Reconnecting..." UI to the user.
2. **Handle Disconnection:** If `onConnectionLost` fires, prompt the user to check their internet and try joining the room again from scratch.
3. **State Sync:** After a reconnection, re-check the mute states and participant list to ensure your UI is in sync with the server.

## Device Issues
- **Camera in Use:** If another app is using the camera, `initLocalStream` will fail.
- **Unsupported Codecs:** Ensure the mobile device supports the required video codecs (H.264/VP8). Modern smartphones typically do.
- **Background State:** On iOS/Android, ensure you handle app backgrounding correctly (e.g., stopping video capture to save battery, or using foreground services for audio-only calls).
