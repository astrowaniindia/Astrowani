# Phase 3: Validation Report - Wallet & Billing Integration

## 1. Current Wallet Architecture
- **Customer Wallet:** Stored in the `customers` table under the `wallet_balance` column (Decimal/Numeric).
- **Transaction Tables:**
    - `wallet_transactions`: Records debits from customers (e.g., chat/call charges) and credits (recharges).
    - `vendor_wallet_transactions`: Records credits to vendors (earnings) and debits (payouts).
- **Vendor Earnings:** Stored in the `astrologers` table under `wallet_balance`, `today_earnings`, and `total_earnings`.
- **Current Balance Update Functions:**
    - `POST /api/wallet/deduct-and-credit` (Backend): Atomically deducts from customer and credits the vendor.
    - `GET /api/wallet` (Backend): Fetches customer balance and recent transactions.
    - `GET /vendor/wallet` (Backend): Fetches vendor balance and recent transactions.

## 2. Call Lifecycle Events
- **Call Start:** Triggered by `/api/call/initiate`. Creates EnableX room and tokens.
- **Call Connected:** EnableX SDK `roomConnected` event on both client apps.
- **Call Disconnected:** EnableX SDK `roomDisconnected` or `userDisconnected` events.
- **Call Rejection:** Update to `chat_requests` or `call_requests` table with `status='rejected'`.

## 3. Existing Billing Logic
- **Client-Side Trigger:** `astrowani_customer-main/src/api/ChatApi.js` contains `deductWalletMinute`, which attempts to call `/api/wallet/deduct` (Note: Backend actually uses `/api/wallet/deduct-and-credit`).
- **Backend Transaction:** `index.js` implements the atomic deduction and credit logic, including logging to both transaction tables.
- **Payouts:** No explicit payout logic found in the core backend routes yet, focus is on earnings accumulation.

## 4. EnableX Events Available
The following events are currently registered in `VoiceCallScreen.tsx` and `EnxScreenVoice.tsx`:
- `roomConnected`: signaling a successful session start.
- `streamAdded` / `activeTalkerList`: used to confirm the two parties are actually exchanging media.
- `roomDisconnected`: local user left.
- `userDisconnected`: remote user left.

## 5. Financial Edge Cases & Risks
- **Zero Balance:** Currently, there is no server-side "kill switch" to disconnect a user when their balance reaches zero during a call.
- **Sudden Disconnects:** If an app crashes, the backend might continue to bill if it relies on a client-side timer.
- **Reconnection:** If a user reconnects within the same minute, they should not be double-charged for that minute.
- **Double Charging:** If both apps were to trigger billing, the user would be charged twice. Only one authoritative side (preferably the server) should trigger billing.

## 6. Architecture Comparison

| Feature | Architecture A (1 min) | Architecture B (15 sec) | Architecture C (Reserve) |
| :--- | :--- | :--- | :--- |
| **Accuracy** | High (aligned with billing) | Very High | High |
| **Scalability** | High (fewer DB writes) | Low (4x more writes) | Medium |
| **User Experience** | Good (standard) | Fair (frequent updates) | Excellent (guaranteed) |
| **Leakage Risk** | Low (up to 59s free) | Very Low (up to 14s free) | Zero |

---
**Status:** VALIDATION COMPLETE
**Action:** Proceeding to Implementation Plan.
