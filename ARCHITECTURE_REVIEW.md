# senior System Architect Review: EnableX Integration

This document provides a critical review of the `IMPLEMENTATION_PLAN.md`. As a senior architect, I am challenging the existing assumptions to ensure the system is scalable, cost-effective, and financially secure.

---

## 1. Room Creation Timing
*   **Current Proposal:** Backend creates a room immediately when the customer clicks "Call" (`/api/call/initiate`).
*   **Risks:** 
    *   **Zombie Rooms:** If the vendor rejects or ignores the call, a room is still created on EnableX, potentially incurring "ghost" configuration costs or hitting account room limits.
    *   **Race Conditions:** Customer enters a room that the vendor never joins.
*   **Better Alternatives:** 
    *   **Lazy Creation:** The `/api/call/initiate` endpoint should only create a `chat_requests` row in Supabase. The EnableX room should ONLY be created by the backend AFTER the vendor's `handleAccept` triggers.
*   **Final Recommendation:** Move EnableX room creation to the "Accept" lifecycle. Backend should expose an `/api/call/confirm` endpoint called by the vendor app upon acceptance.

---

## 2. Token Generation Timing
*   **Current Proposal:** Backend generates tokens for both parties during the initial request.
*   **Risks:** 
    *   **Token Expiry:** If the vendor takes 2 minutes to answer and the customer waits another minute, short-lived tokens (TTL) might expire mid-negotiation.
    *   **Security:** Delivering a vendor token to the customer's device (as seen in the current backend mock) is a major security flaw.
*   **Better Alternatives:** 
    *   **Just-In-Time (JIT) Tokens:** Each app should request its own token from a private `/api/call/get-token` endpoint only when it is ready to join the room.
*   **Final Recommendation:** Backend must never return the vendor's token to the customer. Each participant must authenticate separately to receive their specific JWT.

---

## 3. Wallet Deduction Mechanism
*   **Current Proposal:** Backend polling/cron job every 60 seconds.
*   **Risks:** 
    *   **Drift:** Polling is notoriously inaccurate for billing. If the poll happens at second 59 vs second 01, you might miss a minute or double-charge.
    *   **Scale:** Running a cron job for thousands of concurrent calls will create massive database spikes every minute.
*   **Better Alternatives:** 
    *   **Websocket/Event-Based:** Use EnableX Webhooks (`room-connected`, `room-disconnected`) to calculate the exact duration in milliseconds.
    *   **Pre-Auth/Escrow:** Hold a 5-minute "buffer" amount from the wallet when the call starts.
*   **Final Recommendation:** Abandon polling. Use EnableX Webhooks for final billing. For real-time "Kill Switch" logic, use a lightweight in-memory timer (Redis) on the backend that decrements a local counter.

---

## 4. Auto-Disconnect Mechanism
*   **Current Proposal:** Backend calls EnableX REST API to kick participants.
*   **Risks:** 
    *   **Latency:** REST API calls can take 1-2 seconds. In that time, the user has stayed for "free".
    *   **API Limits:** Rapidly kicking users via REST might hit CPaaS rate limits.
*   **Better Alternatives:** 
    *   **Signal to Client:** Send a high-priority "Disconnect" signal via Supabase Realtime/Socket.io. The app then calls `room.disconnect()` locally.
    *   **Server-Side Duration:** Set the `duration` parameter during Room Creation to exactly `floor(balance / rate)` minutes. EnableX will then kill the room automatically.
*   **Final Recommendation:** Use the `duration` parameter in the Room Creation API as the primary safety net. Use a Socket.io signal for immediate termination if the balance changes mid-call (e.g., admin adjustment).

---

## 5. Reconnection Strategy
*   **Current Proposal:** Use `allow_reconnect: true` and re-use tokens.
*   **Risks:** 
    *   **State Conflict:** If a user "reconnects" after the backend has already billed and closed the session, they might get free time.
*   **Better Alternatives:** 
    *   **Stateless Tokens:** Ensure tokens have a `session_id` claim. If the `session_id` is marked as `closed` in the DB, the token should be rejected by the backend token-refresh endpoint.
*   **Final Recommendation:** Reconnection is vital for mobile (tunneling/signal drop). However, the backend must validate that the `chat_sessions.status` is still `active` before allowing a token to be re-used or refreshed.

---

## 6. Supabase Realtime Reliability
*   **Current Proposal:** Use Supabase Realtime for call signaling (Accept/Reject).
*   **Risks:** 
    *   **Delivery Guarantees:** Supabase Realtime (based on Postgres replication) can have latencies of several seconds or miss events during high DB load. It is not a dedicated signaling server.
*   **Better Alternatives:** 
    *   **Dedicated Socket.io:** Use the existing Socket.io implementation already present in `astrowani-backend/index.js` for "Calling" and "Ringing" states. It is much faster and designed for this.
*   **Final Recommendation:** Use Socket.io for all "active" signaling (ringing, accepting, hanging up). Use Supabase only for "cold" data persistence and history.

---

## 7. EnableX Participant Termination APIs (Verification)
*   **Constraint:** EnableX REST API `DELETE /rooms/{room_id}` fails if a session is active.
*   **Correction:** To kill a live call from the server, you cannot "Delete the Room". You must use the **Moderator** role via the SDK to call `room.destroy()`. Since the Backend is not a participant, it cannot call SDK methods.
*   **Strategic Shift:** The Backend must act as a **Hidden Moderator** (via a specialized token) or use the **Room Update API** to set a very short `duration` to force a server-side timeout.

---

**Conclusion:** The implementation plan is a good "Version 0" but requires significant hardening in financial logic and signaling choice before production.
