# EnableX Events

The EnableX SDK is event-driven. You must register listeners to respond to state changes in the room.

## Connection Events
These events notify you about the state of the connection between the client and the EnableX Video Cloud.

- **`onRoomConnected`**: Local participant successfully joined the room.
- **`onRoomError`**: A fatal error occurred (e.g., invalid token, room full).
- **`onRoomDisconnected`**: The connection was closed (check `reason` for details).
- **`onConnectionInterrupted`**: Network issues detected; the SDK is trying to recover.
- **`onConnectionLost`**: The link is broken; the SDK has stopped trying to reconnect.

## User Lifecycle Events
These events inform you about other people in the room.

- **`onUserConnected`**: A new participant joined the room.
- **`onUserDisconnected`**: A participant left the room.
- **`onUserDataReceived`**: A participant sent a message via the data channel (chat).
- **`onUserAudioMuted` / `onUserAudioUnmuted`**: Audio state change for a participant.
- **`onUserVideoMuted` / `onUserVideoUnmuted`**: Video state change for a participant.

## Stream Events
These events are critical for media handling.

- **`onStreamAdded`**: A remote stream is available but not yet received. Call `Enx.subscribe(streamId)` to start receiving it.
- **`onStreamSubscribed`**: You have successfully started receiving a remote stream.
- **`onStreamRemoved`**: A remote stream is no longer available.
- **`onLocalStreamAdded`**: Your own local media stream has been initialized and is ready for publishing.
- **`onPublished`**: Your local stream is now being broadcast to all other participants.

## Active Talker Events
- **`onActiveTalkerList`**: Provides an updated list of participants who are currently speaking. Use this to dynamically update your UI grid.

## Messaging & Data Events
- **`onMessageReceived`**: A text message or custom data object was received from another user.
- **`onFileUploadStarted` / `onFileAvailable`**: Events for the session's file-sharing feature.

## Example (React Native)
```javascript
const eventHandlers = {
    onRoomConnected: (roomData) => {
        console.log("Joined Room:", roomData.room_id);
        Enx.publish(localStreamId);
    },
    onStreamAdded: (event) => {
        console.log("New stream:", event.streamId);
        Enx.subscribe(event.streamId);
    },
    onRoomError: (error) => {
        console.error("Connection failed:", error.message);
    }
};
```
