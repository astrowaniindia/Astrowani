# Phase 3A: Implementation Plan - Session Unification

## 1. Schema Analysis: `chat_sessions`
- **Current Columns:** `id` (uuid), `request_id` (uuid), `vendor_id` (uuid), `caller_id` (uuid), `per_minute_charge` (numeric), `started_at` (timestamptz), `ended_at` (timestamptz).
- **Constraints:** `request_id` has a strict Foreign Key (`chat_sessions_request_id_fkey`) to the `chat_requests` table.
- **Nullability:** `request_id` is **NULLABLE**. This is a critical finding, as it allows us to reuse the table for `call_requests` without violating the foreign key.

## 2. Read/Write Locations
- **Reads (`select`):** 
    - Vendor App: `VendorChatSession.js`, `ChatHistory.js`, `ChatHiostory.tsx`.
    - Customer App: `ChatSessionScreen.js`, `MySessionScreen.js`.
    - Backend: `index.js` (for vendor wallet credit).
- **Writes (`insert`/`update`):**
    - Vendor App: `HomeScreen.js` (Line 138).

## 3. Required Schema Changes
To fully support authoritative billing in later phases, the following columns must be added to `chat_sessions` (or applied via migration):
- `call_type` (text): To distinguish 'chat', 'audio', 'video'.
- `room_id` (text): The EnableX reference to link webhooks back to the session.
- `call_request_id` (uuid): A soft link to the `call_requests` table (since `request_id` is bound to `chat_requests`).
- `is_active` (boolean): Default `true`.
- `next_billing_at` (timestamptz): For the Backend SessionManager.

## 4. Implementation Strategy (Current Phase)
Since we cannot alter the production database schema directly, we will unify session creation using the *existing* columns to unblock the architecture. 

**Changes in `HomeScreen.js`:**
Remove the `if (targetTable === 'chat_requests')` restriction.
Insert into `chat_sessions` for all types:
```javascript
await supabase.from('chat_sessions').insert([
  {
    request_id: targetTable === 'chat_requests' ? req.requestId : null, // Prevent FK violation
    per_minute_charge: perMinuteCharge,
    vendor_id: astroId,
    caller_id: req.callerId,
    started_at: new Date().toISOString(),
  },
]);
```
This ensures that every accepted interaction (Chat, Audio, Video) generates an authoritative tracking record, satisfying the Session Unification requirement.
