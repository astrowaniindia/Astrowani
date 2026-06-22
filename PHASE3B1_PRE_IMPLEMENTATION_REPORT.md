# Phase 3B.1: Pre-Implementation Report

## Overview
This report details the planned changes to the mobile applications (Customer and Vendor) to populate the newly added database columns in `chat_sessions` during session creation, as specified in `PHASE3B_INSERT_UPDATE_PLAN.md`.

## Target File 1: `HomeScreen.js` (Vendor App)
- **Path:** `astrowani_vendors-main/src/screens/Home/HomeScreen.js`
- **Function:** `handleAccept` (approx. line 110)
- **Changes Planned:**
  - Update `setPopupData` (approx. line 95) in the `call_requests` listener to also include `roomId: req.room_id`.
  - Update the `chat_sessions` insert payload (approx. line 139) to include:
    ```javascript
    call_type: req.callType || 'chat',
    room_id: req.roomId || null,
    call_request_id: targetTable === 'call_requests' ? req.requestId : null,
    is_active: false,
    next_billing_at: null,
    ```
- **Risk Assessment:**
  - **Chat Flow:** Minimal risk. The existing navigation and connection flows rely on `requestId` and other params. We are only adding data to the `chat_sessions` table.
  - **Audio/Video Flow:** Minimal risk. The `EnableX` connection uses the `room_token`, which is passed directly to the `EnxConferenceScreen`. Storing `room_id` in `chat_sessions` does not interfere with the token transmission.

## Target File 2: `ChatApi.js` (Vendor App)
- **Path:** `astrowani_vendors-main/src/api/ChatApi.js`
- **Function:** `acceptChatRequest` (approx. line 21)
- **Changes Planned:**
  - Update the `chat_sessions` insert payload (approx. line 33) to include:
    ```javascript
    call_type: 'chat',
    is_active: false,
    caller_id: request.caller_id || null,
    vendor_id: request.vendor_id || null
    ```
- **Risk Assessment:** Minimal risk. This standardizes the payload in a utility function.

## Target File 3: `ChatApi.js` (Customer App)
- **Path:** `astrowani_customer-main/src/api/ChatApi.js`
- **Function:** `acceptChatRequest` (approx. line 51)
- **Changes Planned:**
  - Update the `chat_sessions` insert payload (approx. line 62) to include:
    ```javascript
    call_type: 'chat',
    is_active: false,
    caller_id: request.caller_id || null,
    vendor_id: request.vendor_id || null
    ```
- **Risk Assessment:** Minimal risk. This is dead code, but updating it prevents potential schema violations if accidentally invoked.

## Conclusion
The planned changes are localized to database insert payloads. They do not alter the sequence of the connection logic, thus posing minimal risk of breaking existing chat, audio, or video capabilities.

Awaiting approval to execute these modifications.
