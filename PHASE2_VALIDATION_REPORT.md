# Phase 2: Pre-Modification Validation Report

## 1. Existing Implementation
- **Backend:** Eagerly creates EnableX rooms and tokens via `/api/call/initiate`.
- **Customer App:** Feature-complete implementation in `VoiceCallScreen.tsx`. Uses `call_requests` table for audio/video signaling.
- **Vendor App:** Contains feature-complete utility screens (`EnxScreenVoice.tsx`, `EnxConferenceScreen.tsx`) but uses placeholder screens for the main routing targets.

## 2. Placeholder Components Found
The following files are verified as minimal stubs with no EnableX SDK logic:
- `astrowani_vendors-main/src/screens/AudioCall.js`
- `astrowani_vendors-main/src/screens/VideoCall.tsx`

## 3. Reusable EnableX Components
- `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`: A robust, functional component with full SDK event handling and media controls. This is the **primary template** for Phase 2.
- `astrowani_vendors-main/src/utils/EnxConferenceScreen.tsx`: A class-based implementation of multi-party conferencing.

## 4. Dependencies
- `enx-rtc-react-native`: ^2.3.46 (Vendor App) / ^2.3.49 (Customer App).

## 5. Required Files (Phase 2 Target)
- `astrowani_vendors-main/src/screens/AudioCall.js`
- `astrowani_vendors-main/src/screens/VideoCall.tsx`
- `astrowani_vendors-main/src/screens/Home/HomeScreen.js` (Required for listener update)

## 6. Route Registrations & Parameters
- Verified routes in `NavigationScreen.js`: `AudioCall`, `VideoCall`.
- **Navigation Parameters Verified:**
    - `requestId`: Available
    - `callerName`: Available
    - `callerId`: Available
    - `perMinuteCharge`: Available
    - **TOKEN (MISSING):** The current `HomeScreen.js` listener (`chat_requests`) does not provide the EnableX `room_token`.

## 7. Risks & Open Issues
- **Signaling Mismatch:** The Vendor app listens to `chat_requests`, but the Customer app sends audio/video calls to `call_requests`. Audio/Video calls currently **cannot be received** by the vendor.
- **Token Delivery:** Even if received, the `chat_requests` table does not store the `room_token`. The `call_requests` table does.
- **SDK Lifecycle:** `EnxScreenVoice.tsx` must be carefully adapted to ensure the room is initialized and joined correctly using the passed token.

## 8. Assumptions
- `call_requests` is the intended table for audio/video signaling as evidenced by customer-side implementation in `Home.js` and `ReusableList.js`.
- The `room_token` stored in `call_requests` by the customer is the correct token for the vendor.

## 9. UNVERIFIED ASSUMPTION
- **Vendor Token Availability:** It is currently unverified how the vendor will receive a valid EnableX token if they continue to use the `chat_requests` flow as suggested in the Phase 1 instructions.

---
**Status:** VALIDATION COMPLETE (Flagging critical signaling gap).
**Action:** Waiting for approval to proceed with Phase 2 (SDK Implementation + Signaling Fix).
