# Phase 3: Implementation Plan - Wallet & Billing Integration

## 1. Recommended Architecture: Server-Authoritative Minute-by-Minute
To ensure financial integrity and prevent revenue leakage, the backend will be the authoritative source for session duration and wallet deductions.

### Key Logic:
1. **Session Start:** When the session is established (confirmed by `roomConnected` and media exchange), the backend starts an in-memory timer for the `sessionId`.
2. **Minute-by-Minute Deduction:** Every 60 seconds, the backend attempts to deduct the `per_minute_charge` from the customer's wallet and credit it to the vendor.
3. **Insufficient Balance Trigger:** If the customer's balance is lower than the required amount for the next minute, the backend initiates an auto-disconnect.
4. **Clean Termination:** The backend sends a `force_disconnect` signal via Socket.io to both apps and updates the EnableX Room duration to force a cloud-side termination.

## 2. Files Requiring Modification

### Backend (`astrowani-backend/index.js`)
- Implement a `SessionManager` to track active calls and their start times.
- Implement the `/api/call/confirm-connection` endpoint.
- Implement the `/api/call/end` endpoint (to stop timers and log final session duration).
- Implement the background interval logic for deductions.

### Mobile Apps (Customer & Vendor)
- **Customer:** Update `VoiceCallScreen.tsx` to call `/api/call/confirm-connection` when media starts.
- **Vendor:** Update `EnxScreenVoice.tsx` to call `/api/call/confirm-connection` when media starts.
- **Both:** Listen for `force_disconnect` socket event to show a "Balance Exhausted" alert before closing.

## 3. Database Changes Required
- **`chat_sessions`:** 
    - Add `is_active` (boolean) to track live sessions.
    - Add `total_billable_minutes` (integer) for summary reporting.

## 4. Risks & Mitigations
- **Double Charging:** Prevented by ensuring only the Backend Timer triggers the `deduct-and-credit` function.
- **Backend Restart:** In-memory timers will be lost.
    - *Mitigation:* Persist `last_billing_time` in the `chat_sessions` table so the SessionManager can recover active calls upon restart.
- **Ghost Sessions:** If the server doesn't receive an "End Call" signal.
    - *Mitigation:* Use EnableX Webhooks (`participant-left`) to definitively end sessions in the backend.

---
**Status:** PLAN COMPLETE
**Action:** Awaiting Approval to implement.
