# Phase 3: Pre-Implementation Consistency Report

## 1. Session Lifecycle Traces

### **A. Chat Session**
| Stage | File Path | Function | Line | Tables |
| :--- | :--- | :--- | :--- | :--- |
| **Request** | `astrowani_customer-main/src/hooks/useChatRequest.js` | `sendChatRequest` | 80+ | `chat_requests` |
| **Accept** | `astrowani_vendors-main/src/screens/Home/HomeScreen.js` | `handleAccept` | 113+ | `chat_requests` |
| **Creation** | `astrowani_vendors-main/src/screens/Home/HomeScreen.js` | `handleAccept` | 131+ | `chat_sessions` |
| **Billing Start**| `astrowani_customer-main/src/api/ChatApi.js` | `deductWalletMinute`| 85+ | API call only |
| **Billing Stop** | N/A (Client-controlled) | N/A | N/A | N/A |
| **Closure** | N/A | N/A | N/A | N/A |

### **B. Audio/Video Call**
| Stage | File Path | Function | Line | Tables |
| :--- | :--- | :--- | :--- | :--- |
| **Request** | `astrowani_customer-main/src/screens/Home/Home.js` | Inline logic | 140+ | `call_requests` |
| **Accept** | `astrowani_vendors-main/src/screens/Home/HomeScreen.js` | `handleAccept` | 113+ | `call_requests` |
| **Creation** | **GAP IDENTIFIED** | N/A | N/A | **NONE** |
| **Join** | `astrowani_vendors-main/src/screens/AudioCall.js` | `EnxScreenVoice` export| 1+ | N/A |
| **Billing Start**| **GAP IDENTIFIED** | N/A | N/A | **NONE** |
| **Billing Stop** | **GAP IDENTIFIED** | N/A | N/A | **NONE** |
| **Closure** | **GAP IDENTIFIED** | N/A | N/A | **NONE** |

---

## 2. Gap Identification & Verification

### **1. Do audio calls create `chat_sessions`?**
**NO.**
- *Evidence:* `HomeScreen.js` Line 130: `if (targetTable === 'chat_requests')`. 
- *Impact:* Audio calls (which use `call_requests`) are excluded from session persistence.

### **2. Do video calls create `chat_sessions`?**
**NO.**
- *Evidence:* Same as above. Video calls use the `call_requests` table and are therefore excluded.

### **3. If not, where will SessionManager obtain session records?**
**NOWHERE.**
- Under the current implementation, the `SessionManager` would have zero visibility into active audio or video calls. It cannot track duration, bill the user, or trigger auto-disconnects.

### **4. Is a new `call_sessions` table required?**
**NOT NECESSARILY.**
- A better alternative is to unify both into a single `communication_sessions` table.
- However, since `chat_sessions` already exists and is in use, the most surgical approach is to adapt it.

### **5. Can existing `chat_sessions` safely support Chat, Audio, and Video?**
**YES, with modifications.**
- **Required Columns:** `call_type` (enum: chat, audio, video), `room_id` (EnableX reference), and `is_active` (status tracking).
- **Required Change:** Remove the `if (targetTable === 'chat_requests')` restriction in `HomeScreen.js`.

---

## 3. Critical Recommendations

1.  **Unify Persistence:** Modify `handleAccept` to create a `chat_sessions` entry for **all** request types.
2.  **Add Room Data:** The `room_id` from `call_requests` must be saved in the session record so the backend can correlate EnableX events with the correct billing record.
3.  **Authoritative Switch:** Stop using client-side `deductWalletMinute` for Chat and move it to the Server-Side `SessionManager` to align with the Audio/Video architecture.

---
**Status:** CONSISTENCY CHECK COMPLETE (Blocker found)
**Action:** Waiting for approval to unify session creation before implementing SessionManager.
