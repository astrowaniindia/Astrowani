# PHASE 3B: Financial Integrity & Configuration Fixes

## Status
- **Fix 1: Atomic Billing (Postgres RPC):** Pending SQL Approval
- **Fix 2: URL De-hardcoding:** Complete

## Fix 2: Remove Hardcoded URLs
Establishing centralized configuration for Socket.io URLs to ensure portability across environments.

### 1. Centralized Config Files
- `astrowani_customer-main/src/config/api.js`
- `astrowani_vendors-main/src/config/api.js`

### 2. Affected Files (Hardcoded `10.0.2.2:4500`)
- [ ] `astrowani_customer-main/src/screens/Home/Home.js`
- [ ] `astrowani_customer-main/src/screens/ChatSessionScreen.js`
- [ ] `astrowani_customer-main/src/utils/EnxConferenceScreen.tsx`
- [ ] `astrowani_vendors-main/src/screens/Home/HomeScreen.js`
- [ ] `astrowani_vendors-main/src/screens/VendorChatSession.js`

### 3. Backend Hardcoding
- [ ] `astrowani-backend/src/sessionManager.js` (Remove Supabase URL fallback)

## Fix 1: Atomic Billing via Postgres RPC
Drafting a robust, transaction-safe billing function to replace sequential client-side calls.

### Proposed SQL: `process_session_billing`
(See output for full SQL draft)
