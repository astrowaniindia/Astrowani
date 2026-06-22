# Phase 3B.0.5: Insert & Update Plan

## 1. Analysis of Session Creation Paths

There are three locations in the codebase that insert into `chat_sessions`. However, they are redundant implementations of the same action (Accepting a Chat Request).

1.  **`astrowani_vendors-main/src/screens/Home/HomeScreen.js`** (`handleAccept`): This is the active, unified flow we built in Phase 3A. It handles popup acceptances for chat, audio, and video.
2.  **`astrowani_vendors-main/src/api/ChatApi.js`** (`acceptChatRequest`): An API utility function.
3.  **`astrowani_customer-main/src/api/ChatApi.js`** (`acceptChatRequest`): An API utility function incorrectly placed in the customer app (customers do not accept requests).

## 2. Proposed Code Modifications

### **Modification 1: `HomeScreen.js` (Active Flow)**
- **File Path:** `astrowani_vendors-main/src/screens/Home/HomeScreen.js`
- **Function Name:** `handleAccept`
- **Reason for Change:** To fully populate the newly added schema columns so that the backend `SessionManager` has the necessary data to perform billing and tracking for all call types.
- **Implementation Detail:** Add `call_type`, `room_id`, `call_request_id`, `is_active`, and `next_billing_at` to the `insert` object.
- **Risk Assessment:** **Low**. The columns exist and default correctly if null. Populating them simply enables the backend to begin tracking.

### **Modification 2: `ChatApi.js` (Vendor Utility)**
- **File Path:** `astrowani_vendors-main/src/api/ChatApi.js`
- **Function Name:** `acceptChatRequest`
- **Reason for Change:** To ensure consistency if this utility function is ever used directly (e.g., from a custom UI instead of the popup). It currently inserts a minimal object.
- **Implementation Detail:** Update the insert payload to include `call_type: 'chat'`, `is_active: false` (since it's not a live call until connected), and map the caller/vendor IDs if available.
- **Risk Assessment:** **Low**. Standardizing payload shape.

### **Modification 3: `ChatApi.js` (Customer Utility)**
- **File Path:** `astrowani_customer-main/src/api/ChatApi.js`
- **Function Name:** `acceptChatRequest`
- **Reason for Change:** Customers do not accept requests; this function is dead code or a copy-paste error. However, if used, it would create an incomplete session.
- **Implementation Detail:** Update the payload similarly to the vendor side to prevent schema constraint issues if it is accidentally triggered.
- **Risk Assessment:** **Low**. Dead code normalization.

---
**Status:** INSERT UPDATE PLAN COMPLETE.
**Action:** Waiting for approval to proceed with Phase 3B.1 (Mobile App Insert Updates).
