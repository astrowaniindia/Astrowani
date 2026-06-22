# Phase 3: Architecture Review - Wallet & Billing Integration

## 1. Current Wallet Deduction Functions
- **File Path:** `astrowani-backend/index.js`
- **Function Name:** `POST /api/wallet/deduct-and-credit`
- **Line Numbers:** 557 – 672
- **Evidence:** This endpoint performs the atomic subtraction from the customer's balance (`wallet_balance` in `customers` table) and verifies the user's identity via JWT before proceeding.

## 2. Current Vendor Earning Functions
- **File Path:** `astrowani-backend/index.js`
- **Logic Location:** Within `POST /api/wallet/deduct-and-credit` (Lines 634 – 661).
- **Evidence:** The backend fetches the vendor's current balance and earnings from the `astrologers` table and updates `wallet_balance`, `today_earnings`, and `total_earnings` simultaneously.

## 3. Existing Transaction Recording
- **Tables Involved:** `wallet_transactions` (Customer), `vendor_wallet_transactions` (Vendor).
- **Fields Involved:** `user_id`/`vendor_id`, `type`, `amount`, `description`, `session_id`, `request_id`.
- **Code References:** 
    - Customer Log: Lines 612 – 619 in `index.js`.
    - Vendor Log: Lines 653 – 660 in `index.js`.

## 4. Session Lifecycle Persistence
- **Storage:** `chat_sessions` table.
- **Recording Start:** Handled during `handleAccept` in `HomeScreen.js` (Lines 119 – 127) for chat requests. Currently, audio/video requests via `call_requests` do NOT create a `chat_sessions` entry on the vendor side.
- **Recording End:** No unified server-side "End Call" handler exists yet; it is currently triggered by client-side calls to `/api/call/end` (unimplemented in backend).

## 5. Backend Reliability Analysis

| Scenario | Behavior | Impact |
| :--- | :--- | :--- |
| **A. Backend Restarts** | In-memory timers are lost. | Billing stops; customer gets free time until room timeout. |
| **B. App Crashes** | Connection is lost; EnableX triggers `userDisconnected`. | Billing continues until the backend receives the disconnect event. |
| **C. Vendor Disconnects** | SDK triggers `userDisconnected` for customer. | Backend receives event; session should end and billing stops. |
| **D. Customer Disconnects** | Same as above. | Backend receives event; session ends. |
| **E. Network Loss** | EnableX attempts reconnection. | If reconnection fails within TTL, session is terminated. |
| **F. Room Ends Unexpectedly** | EnableX sends `room-disconnected` webhook. | Backend must catch this to stop all active billing for that room. |

## 6. Financial Integrity Review
The proposed Server-Authoritative Architecture prevents:
- **Double Charging:** By using a single `SessionManager` that locks the `sessionId` for the duration of the 60-second cycle.
- **Missed Charging:** By persisting `last_billing_time` in the database, a restarted backend can "catch up" on missed minutes immediately upon recovery.
- **Duplicate Payouts:** Every deduction/credit is wrapped in a single database transaction (or atomic update chain).
- **Race Conditions:** Using the `sessionId` as a unique key in the `SessionManager` ensures that multiple "Connect" signals from the same session don't spawn multiple timers.

## 7. SessionManager Design Comparison

| Feature | Memory-Based | Database-Backed |
| :--- | :--- | :--- |
| **Reliability** | Low (Lost on crash/restart) | High (Persistent) |
| **Recovery** | Impossible | Immediate (Re-scans DB on boot) |
| **Scalability** | High (No DB overhead per tick) | Medium (Requires DB check per tick) |
| **Recommendation** | **Database-Backed** | |

### **Final Recommendation:** 
Implement a **Database-Backed SessionManager**. Store the `next_billing_at` timestamp in the `chat_sessions` table. The backend should run a single global interval that queries `SELECT * FROM chat_sessions WHERE is_active = true AND next_billing_at <= NOW()`. This ensures absolute financial integrity, even across server restarts or multi-instance deployments.

---
**Status:** ARCHITECTURE REVIEW COMPLETE
**Action:** Ready for Implementation.
