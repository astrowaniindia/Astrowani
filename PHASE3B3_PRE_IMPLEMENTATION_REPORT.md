# Phase 3B.3: Pre-Implementation Report

## Overview
This phase integrates the mobile applications with the backend `SessionManager` via Socket.io to enable authoritative billing and connection tracking.

## 1. Backend Modifications (`astrowani-backend`)
- **No further changes required** to `sessionManager.js` or `index.js` as the socket events (`signal_connection`, `join_session`, `end_session`) are already implemented.

## 2. Vendor App Modifications (`astrowani_vendors-main`)

### A. `HomeScreen.js`
- **Change:** Initialize Socket.io and emit `accept_call` with `sessionId` after creating a session.
- **Payload added:** `sessionId` in the `accept_call` emission.
- **Risk:** Low. Essential for notifying the customer to proceed to the call screen.

### B. `VendorChatSession.js`
- **Change:** Join the socket room for `sessionId` and emit `signal_connection`.
- **Change:** Listen for `session_terminated` to force exit the chat.
- **Risk:** Low. Improves reliability and syncs with backend billing.

### C. `EnxConferenceScreen.tsx` (Utils)
- **Change:** Join the socket room for `sessionId` and emit `signal_connection` on `roomConnected`.
- **Risk:** Low. Enables per-minute billing for audio/video calls.

## 3. Customer App Modifications (`astrowani_customer-main`)

### A. `Home.js`
- **Change:** Update the `call_accepted` listener to receive `sessionId` and pass it to `EnxConferenceScreen`.
- **Risk:** Low. Essential for linking the call to the billing session.

### B. `ChatSessionScreen.js`
- **Change:** Remove local `minuteTimer` and `deductAndCredit` logic (delegating to backend).
- **Change:** Join the socket room for `sessionId` and emit `signal_connection`.
- **Change:** Listen for `session_terminated` to handle balance exhaustion.
- **Risk:** Low. Simplifies the app and ensures billing accuracy.

### C. `EnxConferenceScreen.tsx` (Utils)
- **Change:** Join the socket room for `sessionId` and emit `signal_connection` on `roomConnected`.
- **Risk:** Low. Enables per-minute billing for audio/video calls.

## Conclusion
These changes establish the "Connection Confirmation Signal" required by the architectural plan. By moving billing timers to the backend, we prevent client-side timer manipulation and ensure consistent billing across all session types.

Awaiting approval to execute.
