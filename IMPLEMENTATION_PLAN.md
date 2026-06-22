# Astrowani EnableX Implementation Plan

This document outlines the architectural roadmap for integrating EnableX Video, Voice, and SMS services into the Astrowani ecosystem.

---

## 1. Customer Call Flow
**Existing Implementation:**
- `JoinTheRoom.tsx` calls backend `/api/call/initiate`.
- Backend creates an EnableX room and generates tokens for both parties.
- Customer navigates to `VoiceCallScreen.tsx`.

**Missing Implementation:**
- Logic to differentiate between "Requesting a Call" and "Starting a Room". Currently, the room is created before the vendor even accepts.
- A "Waiting for Vendor" UI state in the Customer App.

**Files Affected:**
- `astrowani_customer-main/src/screens/Video/JoinTheRoom.tsx`
- `astrowani_customer-main/src/screens/Video/VoiceCallScreen.tsx`

**Risk Level:** Medium (Syncing UI state with backend availability).

---

## 2. Vendor Call Flow
**Existing Implementation:**
- `HomeScreen.js` listens for `chat_requests` via Supabase Realtime.
- `NotificationPopup.js` displays the incoming request.
- `handleAccept` updates Supabase and navigates to `VendorChatSession.js`.

**Missing Implementation:**
- Differentiated navigation based on `request_type` (Audio vs. Video).
- Actual EnableX SDK integration in `AudioCall.js` and `VideoCall.tsx`.

**Files Affected:**
- `astrowani_vendors-main/src/screens/Home/HomeScreen.js`
- `astrowani_vendors-main/src/screens/AudioCall.js`
- `astrowani_vendors-main/src/screens/VideoCall.tsx`

**Risk Level:** High (Device permission handling and SDK lifecycle management).

---

## 3. Audio & Video Requests
**Architecture:**
- **Request Phase:** Customer inserts a row into `chat_requests` with `request_type='audio'` or `'video'`.
- **Signaling:** Supabase Realtime notifies the Vendor.
- **Backend Role:** Only when the Vendor accepts, the Backend should call EnableX to create the room and return the tokens.

**Missing Implementation:**
- UI buttons in Customer `AstrologerInfo` to trigger audio/video rows in `chat_requests`.
- Logic in `JoinTheRoom.tsx` to wait for the `status='accepted'` update in Supabase before fetching EnableX tokens.

**Files Affected:**
- `astrowani_customer-main/src/screens/Video/JoinTheRoom.tsx`
- `astrowani_backend/index.js`

**Risk Level:** Low.

---

## 4. Accept/Reject Mechanism
**Existing Implementation:**
- `handleAccept` and `handleCancel` in `HomeScreen.js` update the `chat_requests` table.

**Missing Implementation:**
- If `rejected`, the Customer app should receive a Realtime event and show a "Call Declined" message.
- "Busy" logic: If the vendor is already in a call, auto-reject or queue the request.

**Files Affected:**
- `astrowani_vendors-main/src/screens/Home/HomeScreen.js`
- `astrowani_customer-main/src/screens/Video/JoinTheRoom.tsx`

**Risk Level:** Low.

---

## 5. Wallet Deduction Architecture
**Proposed Architecture:**
- **Start:** When the session starts (EnableX `onRoomConnected`), the Backend records the `start_time`.
- **Polling:** The Backend runs a cron job or a set-interval every 60 seconds to check active sessions.
- **Deduction:** Subtract the `per_minute_charge` from the Customer's `wallet_balance` in Supabase.

**Missing Implementation:**
- Backend session tracking logic.
- Wallet balance update function in Supabase or Backend.

**Files Affected:**
- `astrowani-backend/index.js`
- Supabase Schema (Transactions table).

**Risk Level:** High (Financial integrity and concurrency).

---

## 6. Auto-Disconnect Logic
**Proposed Architecture:**
- **Threshold Check:** During the minute-by-minute wallet deduction, if `balance < per_minute_charge`, the Backend triggers a disconnect.
- **Action:** Backend calls EnableX REST API `DELETE /rooms/{roomId}/participants/{participantId}` or terminates the entire room.
- **Client Sync:** Mobile apps handle `onRoomDisconnected` by showing a "Low Balance" alert.

**Missing Implementation:**
- Backend balance-check trigger.
- EnableX Participant Kick REST API call.

**Files Affected:**
- `astrowani-backend/index.js`

**Risk Level:** Medium.

---

## 7. Reconnection Architecture
**Proposed Architecture:**
- **SDK Level:** Set `allow_reconnect: true` in `EnxRoom` config.
- **App Level:** If the app crashes, the `JoinTheRoom.tsx` logic should check for an existing "Active" session in the database and re-use the same `roomId` and `token`.

**Missing Implementation:**
- Enabling `allow_reconnect` in mobile SDK configs.
- Persistence of `roomId` in the `chat_sessions` table.

**Files Affected:**
- `astrowani_customer-main/src/screens/Video/VoiceCallScreen.tsx`
- `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`

**Risk Level:** Medium.

---

## 8. Database & Realtime Updates
**Database Changes:**
- `chat_requests`: Ensure `request_type` supports `['chat', 'audio', 'video']`.
- `chat_sessions`: Add `enx_room_id` and `call_type` columns.

**Realtime Events:**
- `chat_requests` (INSERT): Notify Vendor of new call.
- `chat_requests` (UPDATE): Notify Customer of Accept/Reject.
- `customers` (UPDATE): Notify Backend/App if wallet balance changes externally.

---

**Note:** This plan is for architectural guidance only. No code has been modified during its creation.
