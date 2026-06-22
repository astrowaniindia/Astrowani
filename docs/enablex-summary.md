# EnableX Integration Master Reference

This document serves as a high-level summary and roadmap for the EnableX integration within the Astrowani project.

## Quick Links
- [Overview](./enablex/overview.md): Architecture and core concepts.
- [Authentication](./enablex/authentication.md): App ID, Key, and Token flow.
- [Room Management](./enablex/room-management.md): Creation and participant lifecycle.
- [Audio Calls](./enablex/audio-calls.md): Implementation and best practices for voice.
- [Video Calls](./enablex/video-calls.md): Rendering streams and camera controls.
- [Events](./enablex/events.md): Comprehensive list of SDK callbacks.
- [Troubleshooting](./enablex/troubleshooting.md): Error codes and debugging.

## Core Integration Architecture
The Astrowani project utilizes a three-tier architecture for communication:
1. **Astrowani Backend:** Responsible for communicating with EnableX REST APIs to create rooms and securely generate tokens.
2. **Astrowani Apps (Customer & Vendor):** React Native applications using the `enx-rtc-react-native` SDK to connect to sessions.
3. **EnableX Video Cloud:** The global infrastructure handling the actual real-time media transport.

## Key Implementation Steps
1. **Backend Setup:**
    - Store `App ID` and `App Key` in secure environment variables.
    - Implement a `/create-room` endpoint.
    - Implement a `/get-token` endpoint that validates user identity before calling EnableX.
2. **Mobile App Integration:**
    - Initialize the EnableX SDK.
    - Set up event listeners for room and stream lifecycle.
    - Implement UI for audio/video toggles, camera switching, and disconnection.
    - Handle network interruptions gracefully.
3. **Quality & Reliability:**
    - Implement "Active Talker" logic to optimize mobile UI.
    - Use "Audio View Mode" for voice-only consultations to save bandwidth.
    - Monitor for `onConnectionInterrupted` to provide user feedback.

## Security Checklist
- [ ] App Key is NOT in the mobile app code.
- [ ] Tokens have a short TTL (e.g., 30-60 mins).
- [ ] All API communication is over HTTPS.
- [ ] Participant roles (Moderator/Participant) are correctly assigned during token generation.
