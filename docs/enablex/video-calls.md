# EnableX Video Calls

EnableX supports high-definition, multi-party video conferencing with advanced stream management.

## Video Implementation
Video sessions require initializing a stream with video enabled and rendering it in the UI.

### Initialization
```javascript
const localInfo = {
    audio: true,
    video: true,
    data: true,
    videoSize: { minWidth: 320, minHeight: 180, maxWidth: 1280, maxHeight: 720 }
};
Enx.initLocalStream(localInfo);
```

### Rendering Video
In React Native, use the `EnxPlayerView` component to display streams.
```javascript
<EnxPlayerView
    key={streamId}
    streamId={streamId}
    style={{ width: '100%', height: '100%' }}
/>
```

## Camera Controls
- **Switch Camera:** Toggle between front and back cameras.
    - **Method:** `Enx.switchCamera(localStreamId)`
- **Mute Video:** Stop sending video frames without closing the stream.
    - **Method:** `Enx.muteSelfVideo(localStreamId, true/false)`

## Participant Streams
- **Active Talkers:** EnableX automatically manages the "Active Talker" list, prioritizing the streams of people currently speaking.
- **Subscribing:** When a remote participant joins, the `onStreamAdded` event is triggered. You must subscribe to receive their video.
    - **Method:** `Enx.subscribe(remoteStreamId)`

## Reconnection Handling
Video calls are sensitive to network fluctuations.
- **Automatic Retries:** The SDK has built-in logic to reconnect if the WebSocket or WebRTC link drops.
- **`onRoomError`:** Listen for fatal connection errors.
- **`onRoomDisconnected`:** Check the `reason` code to determine if it was a user action or a network failure.
- **Quality Adaptation:** The SDK automatically scales video resolution and framerate down if the bandwidth is low to maintain audio priority.

## Advanced Features
- **Screen Sharing:** Publish a screen stream instead of a camera stream.
- **Canvas Streaming:** Stream content from a canvas element (Web SDK).
- **Background Blur/Replacement:** Apply virtual backgrounds via the SDK's processing pipeline.
