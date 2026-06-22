# EnableX Overview

## What is EnableX?
EnableX is a comprehensive Communication Platform as a Service (CPaaS) designed for building real-time communication applications. It provides a robust infrastructure for integrating Voice, Video, and Messaging (SMS, WhatsApp, RCS) into web and mobile applications through a unified API.

## Architecture
EnableX is built for the AI era and high-scalability:
- **WebRTC Core:** Uses WebRTC for low-latency, multi-party video and audio sessions.
- **Selective Forwarding Unit (SFU):** For group calls, EnableX employs SFUs to efficiently manage media streams between multiple participants.
- **Global Infrastructure:** Leverages a distributed network across 50+ countries to ensure high availability and low latency (99.95% uptime).
- **AI Integration:** Features specialized WebSockets for streaming live media directly to AI models (e.g., OpenAI Realtime, Deepgram) for real-time processing, translation, and summarization.

## Core Concepts
- **Rooms:** Virtual containers where sessions happen. A room must be created before participants can join.
- **Streams:** Media tracks (audio/video) published by participants.
- **Participants:** Users who join a room. They can be moderators or regular participants.
- **Tokens:** Short-lived, secure JWTs required for clients to join specific rooms.
- **Webhooks:** A unified event notification system that sends real-time updates about session lifecycle and messaging status to your backend.

## SDKs Available
EnableX offers a wide range of SDKs to support various platforms:
- **Web:** JavaScript SDK for browsers.
- **Mobile (Native):** iOS (Swift/Objective-C) and Android (Java/Kotlin).
- **Cross-Platform:** 
    - **React Native:** (`enx-rtc-react-native`) - Used in this project.
    - **Flutter**
    - **Cordova / Ionic**
- **Server-Side:** REST APIs for room management, recording, and messaging.
- **Low-Code Tools:** Visual builders and UI Kits for rapid deployment.
