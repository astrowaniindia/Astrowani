# Astrowani — Project State

## Architecture Overview

**Four** sub-projects in one monorepo:

| Directory | Role | Package |
|---|---|---|
| `astrowani-backend/` | Node/Express REST + Socket.io backend | `astrowani-backend` |
| `astrowani_customer-main/` | React Native customer app | `com.astrowanicustomer` |
| `astrowani_vendors-main/` | React Native vendor/astrologer app | `AstroIndia_Astrologers` |
| `astrowani-admin/` | React + Vite **admin dashboard** (web only) | `astrowani-admin` |

> **Living state note:** The detailed history below (call-flow rounds, bug fixes) is preserved.
> For everything added after 2026-06-21 (admin dashboard, remedies shop, profile sync + unified
> cards + category screens, live streaming + gifts, missed sessions, real My Sessions, themed
> popup), see **"Subsystems added 2026-06-21 → 06-22"** near the end of this file. For the latest
> work (real reviews & ratings, real favorites, per-app banners + admin rotation interval, vendor
> home missed-sessions widget, UI polish), see **"Subsystems added 2026-06-22 (session 2)"**.
> Per-feature deep notes also live in the auto-memory index (`memory/MEMORY.md`).

### Backend (`astrowani-backend/`)
- **Entry**: `index.js` — Express server + Socket.io on port 4500
- **Session billing**: `src/sessionManager.js` — polls `chat_sessions` every 30 s, calls Supabase RPC `process_session_billing`
- **Earnings resets**: `src/sessionManager.js` also runs `checkEarningsResets()` every hour — resets `today_earnings = 0` daily (new calendar day detected), resets `total_earnings = 0` every 30 days. Tracking is in-memory (`lastDailyResetDate`, `lastMonthlyResetMs`); on server start, daily reset always fires once (initialised to `null`), monthly fires if 30+ days have elapsed (initialised to 31 days ago).
- **Database**: Supabase (PostgreSQL). Uses anon key for most reads, service role key for billing RPC
- **Auth**: JWT signed with `super_secret_astrowani_key_123` (override via `JWT_SECRET` env var)
- **Video/Voice**: EnableX (enx-rtc) — rooms and tokens created server-side via EnableX REST API
- **Key env vars**: `ENABLEX_APP_ID`, `ENABLEX_APP_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`

### Customer App (`astrowani_customer-main/`)
- Navigation root: `src/routes/Navigation.js`
  - `BottomTabNavigator` fetches `customers.wallet_balance` on mount and subscribes to Supabase Realtime `UPDATE` — shows the live balance as small green text below the "Home" tab label. Tab bar height is `verticalScale(70)` to accommodate the extra line.
- **Audio call entry points (both identical flow)**:
  - `src/screens/Home/AstrologerInfo.js` → `initiateAudioCall()` — profile screen Call button
  - `src/screens/Call/Call.js` → `getRoomTokenWebCall(item)` — Talk To Experts screen Call button
  - Both: wallet check → `POST /api/call/initiate` → call_requests insert → socket listeners → `RequestingPopup` / waiting modal → navigate to `VoiceCallScreen` on acceptance
  - Both use a **mount-time socket** that joins the customer's personal room on connect, so `call_accepted` arrives reliably even if vendor accepts within seconds of the request
- **Video call entry point**:
  - `src/screens/Video/Video.js` → `initiateVideoCall(item)` — Video With Experts tab
  - Same pattern as audio: wallet check → `POST /api/call/initiate { callType:'video' }` → call_requests insert → mount-time socket → waiting modal → navigate to `VideoCallScreen` on acceptance
- Voice call screen: `src/screens/Video/VoiceCallScreen.tsx` — audio-only ENX screen
- **Video call screen**: `src/screens/Video/VideoCallScreen.tsx` — full video ENX screen with remote `EnxPlayerView` + local PiP `EnxStream`
- Chat session: `src/screens/ChatSessionScreen.js`
- Socket URL config: `src/config/api.js` → `SOCKET_URL`
- **Legacy/unused**: `src/utils/EnxJoinScreen.tsx` — old broken flow, bypassed; do NOT use as call entry point

### Vendor App (`astrowani_vendors-main/`)
- Home/incoming call handler: `src/screens/Home/HomeScreen.js` — socket + Supabase Realtime listener, shows `NotificationPopup` on incoming call
  - Routes `callType === 'audio' || 'voice'` → `AudioCall`
  - Routes `callType === 'video'` → `VideoCall`
  - `perMinuteCharge` uses `video_charge_per_minute` for video calls, `call_charge_per_minute` for audio
- Audio call screen: `src/screens/AudioCall.js` → re-exports `src/utils/EnxScreenVoice.tsx`
- **Video call screen**: `src/screens/VideoCall.tsx` → re-exports `src/utils/EnxScreenVideo.tsx` (full video with PiP)
- Socket URL config: `src/config/api.js` → `SOCKET_URL`

---

## Supabase Tables (key ones)

| Table | Purpose |
|---|---|
| `customers` | Customer accounts — `id` (UUID), `mobile`, `wallet_balance`, `name` |
| `astrologers` | Vendor accounts — `id` (UUID), `wallet_balance`, `today_earnings`, `total_earnings`, `is_available`, charges |
| `chat_sessions` | Active/ended call sessions — `caller_id` (customer UUID), `vendor_id` (astrologer UUID), `is_active`, `next_billing_at`, `per_minute_charge` |
| `call_requests` | Pending call requests — `customer_id`, `astrologer_id`, `status` (pending/accepted/rejected), `room_token`, `session_id` |
| `wallet_transactions` | Customer debit log |
| `vendor_wallet_transactions` | Vendor credit log |

Billing RPC: `process_session_billing(p_session_id uuid)` — deducts from customer, credits vendor, advances `next_billing_at` by 60 s.

---

## Service-Toggle Visibility Sync (Vendor ⇄ Customer)

A vendor's service toggles drive which per-card buttons are **active vs. disabled** in the
customer app. **Astrologers are NEVER hidden** — every astrologer shows in every section;
when a service toggle is off, that button turns **red and reads "Unavailable" / "No Chat" /
"No Call"** and, on tap, shows an "X is not available for … right now" alert. (Disappearing
cards looked unprofessional — explicitly rejected.) `is_available` (GO LIVE) still gates only
the dedicated "Live" section.

| Toggle column (`astrologers`) | Drives this button | When OFF |
|---|---|---|
| `is_chat_enabled` | Chat (Home + Chat-with-Astrologers) | red "No Chat" / "Unavailable", tap → alert |
| `is_call_enabled` | Call/audio (Home + Talk-To-Experts `Call.js`) | red "No Call" / "Unavailable", tap → alert |
| `is_video_call_enabled` | Video (Video-With-Experts `Video.js`) | red "Unavailable", tap → alert |
| `is_available` | Live section (`Live.js`) listing | — (Live still filters by availability) |

**Backend** (`astrowani-backend/index.js`):
- Both `/api/astrologers` and `/api/astrologers/liveAstrologers` include in each formatted
  row: `isChatEnabled`, `isCallEnabled`, `isVideoEnabled`, `isAvailable`, `chatPrice`,
  `videoPrice`. These flags were previously dropped — the root cause of buttons not reflecting
  vendor toggles.
- `/api/astrologers` still accepts `?service=chat|audio|video` (filters by `is_*_enabled`),
  but the customer app no longer uses it — all list screens fetch the full list so nobody
  disappears. The param is kept for potential future use.

**Customer app** (all fetch the FULL list — no service filter):
- `Chat.js`, `Video.js`, `Call.js` (Talk-To-Experts), `Home.js` all call `/api/astrologers`
  (no `?service`). `Home.js` shows the whole carousel (slice(0,7) removed). `Live.js` keeps
  `/liveAstrologers`.
- `ReusableList.js` `renderButton`: enabled → normal button; disabled → red
  `actionBtnUnavailable` style + "Unavailable" label + `showUnavailable()` alert on tap
  (never returns `null`). `Home.js` cards use `unavailableBtn`/`unavailableBtnTxt` styles;
  `Call.js` card uses `actionBtnUnavailable`.
- **Astrologer profile** (`AstrologerInfo.js`) floating dock has all three buttons —
  **Chat, Call, Video**. `initiateVideoCall()` mirrors `Video.js` (callType `'video'` →
  `VideoCallScreen`) using `person.videoPrice`. Each button reflects the toggle
  (`chatEnabled/callEnabled/videoEnabled = person.is*Enabled !== false`); a disabled
  service turns the button red with "Off" + an unavailable alert on tap.
- **Sync = refresh-on-focus + Realtime.** Each list screen (`Home`, `Chat`, `Video`, `Call`)
  re-fetches via `useFocusEffect` and subscribes to Supabase Realtime `postgres_changes` on
  the `astrologers` table, re-fetching on any change. So vendor toggle changes propagate
  near-instantly (Realtime) or on next focus.
- Home card "Call" button: now `callType:'audio'` → navigates to `VoiceCallScreen`
  (was `callType:'video'` → `EnxConferenceScreen`). Home's call flow now mirrors `Call.js`:
  mount-time socket joining the customer's personal room, wallet check, `navigatedRef`
  guard, `cancelCall()` (wired to the waiting-modal Cancel button), Supabase Realtime
  backup on `call_requests.id`, and a 45 s auto-cancel timeout.

**Realtime publication**: the `astrologers` table must be in the `supabase_realtime`
publication for the live-sync subscriptions to fire. Apply
`astrowani-backend/sql/enable_realtime_astrologers.sql` via the Supabase SQL editor
(it also sets `REPLICA IDENTITY FULL`). Until then, focus-refresh still works; live push does not.

**Vendor app**: `Registration.js` insert now seeds `is_chat_enabled / is_call_enabled /
is_video_call_enabled / is_available = false` and the three `*_charge_per_minute = 0`. A new
astrologer is therefore VISIBLE everywhere but with all buttons in the red "Unavailable" state
until they set charges (EditProfile, incl. Video Charges) and flip toggles (HomeScreen).
HomeScreen toggle/GO-LIVE writes were already correct.

---

## Call Cancellation Sync (customer abandons before vendor answers)

When a customer cancels/backs out of a pending call (Cancel button, hardware back, screen
unmount, or 45 s timeout), the vendor's incoming-call popup must dismiss. Both a socket
fast-path and a Supabase Realtime backup are used.

**Customer side** (all four call entry points — `Home.js`, `Call.js`, `Video.js`,
`AstrologerInfo.js`): each tracks the in-flight request in an `activeCallRef`
(`{ requestId, astrologerId, roomId }`), set right after the `call_requests` insert and
cleared in `goToCall` (acceptance) / on rejection. A `notifyVendorCancelled()` (or inline
`cancelCall`) helper, called on cancel/back/timeout:
1. `UPDATE call_requests SET status='cancelled' WHERE id=requestId` (Realtime backup), and
2. `socket.emit('cancel_call', { astrologer_id, requestId, roomId })` (fast path).
Waiting modals also wire `onRequestClose` to the cancel handler so Android back triggers it.
`AstrologerInfo.js` additionally cancels on screen unmount via a `useEffect` cleanup.

**Backend** (`index.js`): `socket.on('cancel_call')` relays `call_cancelled` to
`io.to(data.astrologer_id)`.

**Vendor side** (`HomeScreen.js`):
- `socket.on('call_cancelled')` → `dismissPopupIfMatches(data)`.
- Realtime UPDATE listener on `call_requests` (filter `astrologer_id`): if `status` leaves
  `pending` (and isn't `accepted`), `dismissPopupIfMatches({...})`.
- `dismissPopupIfMatches` uses a **functional `setPopupData` updater** (no stale closure) and
  accepts both camelCase + snake_case keys; matches on `requestId | roomId | callerId`.
- `handleAccept` guards: for `call_requests`, if no pending row resolves or the row's status
  isn't `pending`, it aborts with a toast ("Caller cancelled the request") instead of
  creating a dead session.

Also: vendor `connect_error` is logged via `console.log` (not `console.error`) so a transient
socket timeout doesn't throw a dev redbox.

---

## Call Cancellation Sync (Customer ⇄ Vendor)

When a customer backs out of a pending call (Cancel button, back gesture, or 45s timeout),
the vendor's incoming-call popup must dismiss automatically. Two independent paths ensure this:

**Fast path — socket:**
```
Customer cancelCall() / cleanupAndAlert() / timeout
  → activeCallRef.current holds { requestId, astrologerId, roomId }
  → notifyVendorCancelled():
      supabase.from('call_requests').update({ status: 'cancelled' }).eq('id', requestId)
      socket.emit('cancel_call', { astrologer_id, requestId, roomId })
  → Backend relays: socket.on('cancel_call') → io.to(astrologer_id).emit('call_cancelled', data)
  → Vendor HomeScreen: socket.on('call_cancelled') → dismissPopupIfMatches(data)
```

**Backup path — Supabase Realtime:**
```
Vendor HomeScreen subscribes to postgres_changes on call_requests
  filter: astrologer_id=eq.<vendorId>
  on UPDATE: if status not 'pending'/'accepted' → dismissPopupIfMatches(data)
```

**`dismissPopupIfMatches` (vendor HomeScreen)** — uses functional `setPopupData` updater to
avoid stale closure. Matches by `requestId`, `roomId`, OR `callerId` (tolerates camelCase vs
snake_case key differences across socket payloads):
```js
setPopupData((prev) => {
  if (!prev) return prev;
  const matches = (reqId && prev.requestId && reqId === prev.requestId) ||
    (roomId && prev.roomId && roomId === prev.roomId) ||
    (callerId && prev.callerId && callerId === prev.callerId);
  if (matches) { setPopupVisible(false); ToastAndroid.show('Caller cancelled', SHORT); return null; }
  return prev;
});
```

**`handleAccept` guard** — before creating `chat_sessions`, re-fetches the `call_requests` row
and bails if `status !== 'pending'` (handles the race where customer cancels right as vendor taps Accept).

**Files involved:**
- Backend: `astrowani-backend/index.js` — `cancel_call` → `call_cancelled` relay
- Customer: `Home.js`, `Call.js`, `Video.js`, `AstrologerInfo.js` — all have `activeCallRef` + `notifyVendorCancelled()`
- Vendor: `astrowani_vendors-main/src/screens/Home/HomeScreen.js` — `dismissPopupIfMatches` + `handleAccept` guard + Realtime backup

---

## Call Flow (Voice/Audio) — Current Correct Flow

```
Customer taps "Call" in AstrologerInfo.js
  → initiateAudioCall() checks wallet balance via Supabase (needs ≥ 5 min worth)
  → shows RequestingPopup (isCallWaiting = true)
  → POST /api/call/initiate { receiverId, callType:'audio' }
      → backend creates ENX room + 2 tokens (callerToken, vendorToken)
      → backend looks up real Supabase UUID by phone number from JWT
      → backend emits io.to(vendorId) 'incoming_call' { callType:'audio', callerId: realUUID, vendorToken, sessionId, roomId }
  → customer inserts call_requests row (status:'pending', room_token: vendorToken)
  → customer connects socket → join_room(userId) + emit 'initiate_call'
  → customer subscribes to Supabase Realtime on call_requests.id
  → 45-second auto-cancel timeout if vendor doesn't respond

Vendor HomeScreen receives 'incoming_call' socket → shows NotificationPopup
Vendor taps Accept (handleAccept)
  → creates chat_sessions row (caller_id: real customer UUID, vendor_id: astroId)
  → updates call_requests (status:'accepted', session_id)
  → emits socket 'accept_call' { customer_id: callerUUID, sessionId }
  → navigates to AudioCall → EnxScreenVoice with { token: vendorToken, sessionId, callerName, perMinuteCharge }

Customer receives 'call_accepted' socket.once OR Supabase Realtime UPDATE on call_requests
  → goToCall(sessionId) → navigates to VoiceCallScreen { token: callerToken, sessionId, recieverName, recieverImage }

VoiceCallScreen (customer):
  → Enx.initRoom() → roomConnected → Enx.publish() → state: 'ringing' + ripple animation + 30s countdown
  → streamAdded fires when vendor's stream arrives → state: 'in_call', timer starts (activeTalkerList kept as fallback)

EnxScreenVoice (vendor):
  → Enx.initRoom() → roomConnected → Enx.publish() + emit 'signal_connection' { sessionId }
  → backend activates chat_sessions (is_active = true)

SessionManager polls every 30 s → calls billing RPC → deducts customer, credits vendor

Hangup (either party):
  → Enx.disconnect() (NOT Enx.destroy())
  → ENX fires roomDisconnected / userDisconnected on remote
  → isEndingRef guard prevents double doEndCall()
  → doEndCall() → POST /api/call/end → sessionManager.terminateSession
  → io emits 'session_ended' to caller room + vendor room + session room
  → both screens call doEndCall() → navigate to DrawerNavigator
```

---

## Call Flow (Video) — Current Correct Flow

```
Customer taps "Video" in Video With Experts tab (Video.js)
  → initiateVideoCall(item) checks wallet balance via Supabase (needs ≥ 5 min worth)
  → shows waiting Modal (isWaiting = true)
  → POST /api/call/initiate { receiverId, callType:'video' }
      → backend creates ENX room + 2 tokens (callerToken, vendorToken)
      → backend looks up real Supabase UUID by phone from JWT
      → backend emits io.to(vendorId) 'incoming_call' { callType:'video', callerId: realUUID, vendorToken, sessionId, roomId }
  → customer inserts call_requests row (status:'pending', call_type:'video', room_token: vendorToken)
  → mount-time socket already connected → subscribes to call_accepted / call_rejected
  → Supabase Realtime backup on call_requests.id
  → 45-second auto-cancel timeout if vendor doesn't respond

Vendor HomeScreen receives 'incoming_call' socket → shows NotificationPopup
Vendor taps Accept (handleAccept)
  → creates chat_sessions row (caller_id: real customer UUID, vendor_id: astroId)
  → updates call_requests (status:'accepted', session_id)
  → emits socket 'accept_call' { customer_id: callerUUID, sessionId }
  → navigates to VideoCall → EnxScreenVideo with { token: vendorToken, sessionId, callerName, perMinuteCharge }

Customer receives 'call_accepted' socket OR Supabase Realtime UPDATE on call_requests
  → goToCall(sessionId) → navigates to VideoCallScreen { token: callerToken, sessionId, recieverName, recieverImage }

VideoCallScreen (customer):
  → requests RECORD_AUDIO + CAMERA permissions (Android)
  → Enx.initRoom() → roomConnected → Enx.publish() → state: 'ringing' + ripple + 30s countdown
  → streamAdded fires → setRemoteStreamId() → EnxPlayerView shows remote video full-screen → state: 'in_call'
  → local video shown as PiP (EnxRoom + EnxStream positioned in top-right corner throughout)

EnxScreenVideo (vendor):
  → requests RECORD_AUDIO + CAMERA permissions
  → Enx.initRoom() → roomConnected → Enx.publish() + emit 'signal_connection' { sessionId }
  → backend activates chat_sessions (is_active = true)
  → streamAdded → EnxPlayerView shows remote video full-screen
  → local video PiP in top-right corner

SessionManager polls every 30 s → calls billing RPC → deducts customer, credits vendor

Hangup (either party): same as audio — Enx.disconnect() → isEndingRef guard → doEndCall()

session_ended from backend (insufficient balance or remote hangup):
  → sessionId filter skips events for other sessions
  → isEndingRef guard prevents double-call
  → doEndCall() → POST /api/call/end → navigate to DrawerNavigator
```

---

## ENX Screen Architecture Pattern

All four call screens (`VoiceCallScreen.tsx`, `VideoCallScreen.tsx`, `EnxScreenVoice.tsx`, `EnxScreenVideo.tsx`) use this pattern for stable handlers:

```typescript
// State read in handlers via refs (avoids stale closures)
const isEndingRef = useRef(false);      // guard against double doEndCall
const isConnectedRef = useRef(false);
const callDurationRef = useRef(0);
const sessionIdRef = useRef(initialSessionId); // customer only — can be updated via socket

// ENX event handlers — stable object, no deps, all state reads via refs
const roomEventHandlers = useMemo(() => ({
  roomConnected: ...,
  roomDisconnected: (event) => { if (isEndingRef.current) return; isEndingRef.current = true; doEndCall(); },
  userDisconnected: (event) => { if (isEndingRef.current) return; isEndingRef.current = true; doEndCall(); },
}), []); // empty deps — intentional

// ENX config defined OUTSIDE component (never re-created)
// Audio-only: { audio: true, video: false, audio_only: true, ... }
// Video:      { audio: true, video: true,  audio_only: false, ... }
const localStreamInfo = { ... };
const enxRoomInfo = { allow_reconnect: false, ... };
```

**Video-specific ENX pattern** (`VideoCallScreen.tsx`, `EnxScreenVideo.tsx`):
```typescript
const [remoteStreamId, setRemoteStreamId] = useState('');

// In streamAdded handler:
Enx.subscribe(event.streamId, () => {});
setRemoteStreamId(String(event.streamId));

// In render: remote video full-screen
{remoteStreamId && isActive && (
  <EnxPlayerView style={StyleSheet.absoluteFillObject} streamId={remoteStreamId} isLocal="remote" />
)}

// Local video PiP — plain container (NO overflow/borderRadius/elevation — these break ENX native video on Android)
<View style={styles.localVideoPiP}>
  <EnxRoom token={token} eventHandlers={...} localInfo={localStreamInfo} roomInfo={enxRoomInfo}>
    <EnxStream style={styles.localStream} />
  </EnxRoom>
</View>
// Decorative border as a separate pointerEvents="none" overlay — does NOT wrap EnxRoom
<View style={styles.localVideoPiPBorder} pointerEvents="none" />

// Camera controls:
Enx.muteSelfVideo(localStreamId, muted);  // toggle camera
Enx.switchCamera(localStreamId);           // flip front/back
```

**session_ended handler pattern** (all four call screens):
```typescript
socket.on('session_ended', (data) => {
  // Filter: ignore events for other sessions (stale events from previous calls arrive on personal room)
  if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) return;
  if (!isEndingRef.current) {
    isEndingRef.current = true;
    if (isConnectedRef.current) { try { Enx.disconnect(); } catch (_) {} }
    doEndCall(); // ALWAYS call doEndCall() — never navigate directly; this hits POST /api/call/end
  }
});
```

Socket rooms:
- **Customer VoiceCallScreen / VideoCallScreen**: joins personal room (`join_room(userId)`) + session room (`join_session(sessionId)`)
- **Vendor EnxScreenVoice / EnxScreenVideo**: joins session room ONLY (`join_session(sessionId)`). Do NOT emit `join_room(astroId)` here — HomeScreen socket already owns the personal room. Joining it in the call screen causes double `session_ended`.

---

## Known Bugs Fixed (2026-06-20)

### Round 1 — Backend & basics

#### 1. Vendor opened chat screen instead of voice screen
**Cause**: Backend defaulted `callType` to `'voice'`; vendor HomeScreen only routed `'audio'` to `AudioCall`, `'voice'` fell through to `VendorChatSession`.  
**Fix**: Backend defaults to `'audio'`. Vendor HomeScreen handles `'audio' || 'voice'` → AudioCall.  
Files: `astrowani-backend/index.js`, `astrowani_vendors-main/src/screens/Home/HomeScreen.js`

#### 2. Customer screen never transitioned from "Ringing" to "In Call"
**Cause**: Customer's stored JWT had stale `user_<timestamp>` id. Backend sent `call_accepted` to that room, customer had joined with real UUID — never received it.  
**Fix**: `/api/call/initiate` always looks up real Supabase UUID by phone number from JWT before emitting.  
File: `astrowani-backend/index.js`

#### 3. Hang-up not propagating to remote party
**Cause**: Vendor used `Enx.destroy()` instead of `Enx.disconnect()`. Remote never received `userDisconnected`. Also, disconnect handlers only navigated without calling `doEndCall()` so billing kept running.  
**Fix**: All disconnect handlers call `doEndCall()`. `onPressDisconnect` uses `Enx.disconnect()`.  
File: `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`

#### 4. Wallet not deducting (billing RPC failed)
**Cause**: `caller_id` in `chat_sessions` was `user_1781452835500` (not a valid UUID) — billing RPC threw `invalid input syntax for type uuid`.  
**Fix**: Same UUID lookup fix as #2 propagates to session creation.  
**Action required**: Customers with stale JWTs must log out and log back in.

#### 5. Customer duplicate disconnect / double navigation
**Cause**: `roomDisconnected` and `userDisconnected` fired simultaneously → two `doEndCall()` calls.  
**Fix**: `isEndingRef` guard in `VoiceCallScreen.tsx`.

#### 6. Speaker toggle non-functional
**Cause**: `toggleSpeaker` only updated local state, never called ENX API.  
**Fix**: Now calls `Enx.enableSpeaker(newSpeakerOn)`.  
Files: `astrowani_customer-main/src/screens/Video/VoiceCallScreen.tsx`, `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`

### Round 2 — Full call flow rewrite & session bugs

#### 7. Both screens stuck after vendor accepts (root cause: wrong call entry point)
**Cause**: Call button in `AstrologerInfo.js` navigated to `EnxJoinScreen` (old broken screen). `EnxJoinScreen` called `/api/call/initiate` then immediately navigated to `VoiceCallScreen` with NO `sessionId` and NO wait for vendor acceptance.  
**Fix**: `AstrologerInfo.js` `Call` button now calls `initiateAudioCall()` — inline flow with wallet check, API call, call_requests insert, socket signaling, `RequestingPopup` while waiting, then navigates only after `call_accepted`.  
File: `astrowani_customer-main/src/screens/Home/AstrologerInfo.js`

#### 8. `POST /api/call/end` returning 400 (sessionId empty)
**Cause**: `EnxJoinScreen` passed no `sessionId` to `VoiceCallScreen`, so `doEndCall()` always sent empty `sessionId`.  
**Fix**: `VoiceCallScreen` stores `sessionId` in `sessionIdRef` (mutable ref). Added `call_accepted` socket listener to update ref dynamically.  
File: `astrowani_customer-main/src/screens/Video/VoiceCallScreen.tsx`

#### 9. Vendor received `session_ended` twice
**Cause**: `EnxScreenVoice` emitted `join_room(astroId)`, joining both personal room + session room. `terminateSession` emits `session_ended` to both → double navigation.  
**Fix**: Removed `join_room(astroId)` from `EnxScreenVoice.setupSocket()`.  
File: `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`

#### 10. `signal_connection` emitted too early
**Cause**: Old code emitted `signal_connection` in `useEffect` on mount, before ENX room connected.  
**Fix**: `signal_connection` now emitted inside `roomConnected` event handler.  
File: `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`

#### 11. Customer stuck in "Ringing" while vendor shows "Billing Active" (intermittent)
**Cause**: Customer used `activeTalkerList` to detect vendor join — only fires when someone speaks. Silent calls never transitioned.  
**Fix**: Use `streamAdded` instead. `activeTalkerList` kept as fallback.  
File: `astrowani_customer-main/src/screens/Video/VoiceCallScreen.tsx`

#### 12. Call screens fully redesigned (audio-only)
Both screens rewritten with Astrowani branding: dark burnt-sienna background, ripple rings, `connecting → ringing → in_call` state machine.

### Round 3 — Talk To Experts call button & socket stability (2026-06-20)

#### 13. Talk To Experts "Call" button used a different (broken) flow from AstrologerInfo
**Cause**: `Call.js` created a per-call socket inside the async function — connected too late, missed `call_accepted`. Cancel button didn't clean up listeners.  
**Fix**: Rewrote `getRoomTokenWebCall` to use mount-time socket, `navigatedRef` flag, 45s auto-cancel, `call_rejected` handler.  
Files: `astrowani_customer-main/src/screens/Call/Call.js`

#### 14. Mute button non-responsive in both call screens
**Cause**: Only ENX `audioEvent` callback updated state — fires asynchronously and sometimes late.  
**Fix**: Added optimistic state update in `toggleMute`.  
Files: `astrowani_customer-main/src/screens/Video/VoiceCallScreen.tsx`, `astrowani_vendors-main/src/utils/EnxScreenVoice.tsx`

### Round 4 — Video calling feature (2026-06-20)

#### 15. Video calling fully implemented end-to-end
- `VideoCallScreen.tsx` (customer): full video ENX screen. `connecting → ringing (30s) → in_call`. Remote `EnxPlayerView` full-screen; local PiP top-right.
- `EnxScreenVideo.tsx` (vendor): vendor video screen. Emits `signal_connection` in `roomConnected`.
- `VideoCall.tsx` (vendor): re-exports `EnxScreenVideo`.
- `Video.js` (customer): mount-time socket, `callType: 'video'`, 45s timeout, waiting modal.
- `ReusableList.js`: video button calls `actionButton(item)` (parent-provided handler).
- `HomeScreen.js` (vendor): `perMinuteCharge` uses `video_charge_per_minute` for video calls.
- `Navigation.js` (customer): `VideoCallScreen` route added.

### Round 5 — Video screen fixes + earnings resets + nav wallet balance (2026-06-20)

#### 16. `session_ended` skipped `doEndCall()` in video screens (remote hangup didn't hit `/api/call/end`)
**Cause**: `session_ended` handlers in both `VideoCallScreen.tsx` and `EnxScreenVideo.tsx` called `navigation.replace/reset` directly — bypassing `doEndCall()`, so `POST /api/call/end` was never called when the remote party ended the call. Session stayed unfinalized on the backend.  
**Fix**: Both `session_ended` handlers now call `doEndCall()` (consistent with audio screens and with `roomDisconnected`/`userDisconnected` handlers).  
Files: `astrowani_customer-main/src/screens/Video/VideoCallScreen.tsx`, `astrowani_vendors-main/src/utils/EnxScreenVideo.tsx`

#### 17. ENX camera not initializing — PiP container style interference
**Cause**: `EnxRoom` was nested in a container with `overflow: 'hidden'`, `borderRadius: 10`, `elevation: 8`. On Android, these create hardware rendering layers that block ENX's native `SurfaceView` initialization. The working audio screen uses `{width: 1, height: 1, opacity: 0}` with none of these styles.  
**Fix**: Removed `overflow`, `borderRadius`, `elevation` from `localVideoPiP` container. Added a separate `localVideoPiPBorder` view with `pointerEvents="none"` on top (zIndex +1) that carries the visual rounded border. The `EnxRoom` renders in a clean container.  
Files: `astrowani_customer-main/src/screens/Video/VideoCallScreen.tsx`, `astrowani_vendors-main/src/utils/EnxScreenVideo.tsx`

#### 18. `session_ended` without sessionId filter fired prematurely on active calls
**Cause**: Screens listened for `session_ended` without checking `data.sessionId`. Events from previous sessions (routed to personal room by `terminateSession`) would terminate the current call.  
**Fix**: All four call screens check `if (data.sessionId && currentSessionId && data.sessionId !== currentSessionId) return;` before acting on `session_ended`.  
Files: `VideoCallScreen.tsx`, `EnxScreenVideo.tsx`, `VoiceCallScreen.tsx`

#### 19. Vendor daily/monthly earnings never reset
**Cause**: No reset mechanism existed. `today_earnings` accumulated forever; `total_earnings` never zeroed.  
**Fix**: `sessionManager.js` now runs `checkEarningsResets()` on startup and hourly. Daily: compares `new Date().toDateString()` to `lastDailyResetDate`; resets `today_earnings = 0` on all astrologers when the day changes. Monthly: resets `total_earnings = 0` when 30 days have elapsed since `lastMonthlyResetMs`. Both use `.gt('earnings_col', 0)` as the Supabase filter. State is in-memory; on server restart the daily reset fires once (catches missed midnight resets).  
File: `astrowani-backend/src/sessionManager.js`

#### 20. Customer navigation tab bar showed no wallet balance
**Cause**: No wallet display in the bottom tab navigation.  
**Fix**: `BottomTabNavigator` in `Navigation.js` now fetches `customers.wallet_balance` on mount and subscribes to Supabase Realtime `UPDATE` on that row. Displays live balance as small green text below the "Home" tab label. Tab bar height increased from `verticalScale(65)` to `verticalScale(70)` to fit the extra line.  
File: `astrowani_customer-main/src/routes/Navigation.js`

### Round 6 — Call cancellation sync + Realtime channel crashes (2026-06-21)

#### 21. Vendor incoming-call popup didn't dismiss when customer backed out
**Cause**: `cancelCall()` / `cleanupAndAlert()` only cleaned up customer-side state — never notified the vendor. Vendor popup stayed visible after customer cancelled, leading to a dead session when vendor tapped Accept.  
**Fix**: Added `activeCallRef` (tracks in-flight `{ requestId, astrologerId, roomId }`) and `notifyVendorCancelled()` to all four customer call-entry points (`Home.js`, `Call.js`, `Video.js`, `AstrologerInfo.js`). `notifyVendorCancelled()` updates `call_requests.status = 'cancelled'` in Supabase AND emits `cancel_call` socket event. Backend relays it as `call_cancelled` to the vendor's personal socket room. Vendor HomeScreen `dismissPopupIfMatches()` listens on both paths.  
Files: `astrowani-backend/index.js`, `astrowani_customer-main/src/screens/Home/Home.js`, `Call/Call.js`, `Video/Video.js`, `Home/AstrologerInfo.js`, `astrowani_vendors-main/src/screens/Home/HomeScreen.js`

#### 22. Accept/cancel race — vendor accepted already-cancelled request creating dead session
**Cause**: If customer cancelled right as vendor tapped Accept, `handleAccept` created a `chat_sessions` row for a cancelled request, navigating vendor to call screen with no customer.  
**Fix**: `handleAccept` re-fetches `call_requests` row by ID before proceeding; if `status !== 'pending'`, shows a toast and returns without navigating.  
File: `astrowani_vendors-main/src/screens/Home/HomeScreen.js`

#### 23. `cannot add postgres_changes callbacks ... after subscribe()` crash (all customer list screens)
**Cause**: Fixed Realtime channel names — when a screen re-mounted (React Strict Mode, screen stack push/pop, or fast-refresh), `supabase.channel('fixed-name')` returned the already-subscribed channel object. Calling `.on()` on it after `.subscribe()` threw a runtime error and crashed the screen.  
**Fix**: Every Supabase Realtime subscription now uses a **unique channel name per mount**: `channel-base-name_${Date.now()}_${Math.floor(Math.random() * 1e6)}`. Subscriptions inside focus listeners that re-run on every focus also tear down the previous channel before creating a new one.  
Files fixed: `Home.js` (`home-astro-list-*`), `Chat.js` (`chat-astro-list-*`), `Video.js` (`video-astro-list-*`), `Call.js` (`talk-astro-list-*`), `Navigation.js` (`wallet_nav_*`), `CustomHeader.js` (`customers_header_*`), `ChatApi.js` (`chat_requests_user_*`)

#### 24. `CustomHeader` re-subscribed on every focus without cleanup
**Cause**: `fetchBalance()` was called on every `navigation.focus` event via `addListener`. Each call created a new Realtime channel on `customers` without removing the previous one, eventually accumulating duplicate subscriptions and triggering crash #23.  
**Fix**: At the start of `fetchBalance()`, if `subscription` is non-null, call `supabase.removeChannel(subscription); subscription = null` before creating a new channel.  
File: `astrowani_customer-main/src/routes/CustomHeader.js`

---

## Testing note — call routing depends on which astrologer is tapped
The backend routes `incoming_call` to exactly the `receiverId` sent in `POST /api/call/initiate` (`item.userId`). When testing, the vendor device must be logged in as the same astrologer that the customer tapped "Call" on.

---

## Running Locally

```bash
# Backend
cd astrowani-backend
npm run dev          # nodemon on port 4500

# Customer app (separate terminal)
cd astrowani_customer-main
npx react-native start
# Android: npx react-native run-android

# Vendor app (separate terminal)
cd astrowani_vendors-main
npx react-native start --port 8082
# Android: npx react-native run-android
```

Both apps must point `SOCKET_URL` to the same backend IP (not localhost — use LAN IP for real devices).

---

## Important Notes

- **Re-login required** after any JWT fix deployment — stale tokens in AsyncStorage will continue to use old IDs until the user logs out and back in.
- **`EnxJoinScreen.tsx` is dead code** — the call flow no longer uses it. The correct entry point is `AstrologerInfo.js` → `initiateAudioCall()`.
- The `process_session_billing` Supabase RPC must exist. If billing fails silently, check that the function exists and the service role key has execute permission.
- For audio-only calls: `localStreamInfo.audio_only: true` in ENX stream info. For video calls: `audio_only: false, video: true`. ENX room `media_type` is `audio_video` in both cases.
- Both apps use the same ENX `room_token` pattern: customer gets `callerToken`, vendor gets `vendorToken` from the same room.
- **Video call screens are live** — `VideoCallScreen.tsx` (customer) and `EnxScreenVideo.tsx` (vendor) are complete. `VideoCall.tsx` re-exports `EnxScreenVideo`. Entry point: Video With Experts tab (`Video.js`).
- Video screens require both `RECORD_AUDIO` + `CAMERA` Android permissions. Audio-only screens only need `RECORD_AUDIO`.
- **ENX PiP container must be plain** — do NOT add `overflow: 'hidden'`, `borderRadius`, or `elevation` to the `View` that directly wraps `EnxRoom`. Use a separate `pointerEvents="none"` overlay for visual decoration.
- **`session_ended` must always call `doEndCall()`** — never navigate directly. `doEndCall()` hits `POST /api/call/end` which finalizes billing. Navigating directly bypasses this.
- **Earnings reset is in-memory** — if the backend server restarts, `lastMonthlyResetMs` resets and the 30-day clock restarts. For production, migrate to DB-backed timestamps.
- `RequestingPopup` component is used in `AstrologerInfo.js` both for chat (`requesting` state) and for calls (`isCallWaiting` state). Two instances, both visible conditionally.
- **`ReusableList.js` video button** calls `actionButton(item)` (parent-provided handler). `Video.js` owns the video call logic.
- **Supabase Realtime channel names must be unique per mount** — always suffix with `_${Date.now()}_${Math.floor(Math.random() * 1e6)}`. A fixed name causes `supabase.channel()` to return the already-subscribed channel, making any subsequent `.on()` call throw `cannot add postgres_changes callbacks ... after subscribe()`. Subscriptions inside focus listeners must also `removeChannel` the previous channel before creating a new one.
- **Call cancellation sync uses two paths** — socket `cancel_call` (fast) + Supabase UPDATE `status='cancelled'` (backup). Both trigger `dismissPopupIfMatches()` on the vendor side. `activeCallRef` on the customer side tracks the in-flight request; cleared to `null` on acceptance so `notifyVendorCancelled()` is a no-op after the vendor accepts.

---

## Next Steps

### 1. ~~Video Calling Screen~~ — DONE (2026-06-20)
### 2. ~~Earnings Resets~~ — DONE (2026-06-20)
`today_earnings` resets daily; `total_earnings` resets every 30 days. In-memory tracking in `sessionManager.js`. For production, migrate to DB-backed timestamps (add `last_daily_reset`, `last_monthly_reset` columns to a `system_config` table).

### 3. ~~Customer Nav Wallet Balance~~ — DONE (2026-06-20)
Real-time wallet balance shown in Home tab of customer bottom nav. Updates on every transaction via Supabase Realtime.

### 4. Call History / Session Log Screen
- `chat_sessions` table already has `caller_id`, `vendor_id`, `started_at`, `ended_at`, `duration_minutes`, `total_charged`
- New screen in customer app: `src/screens/CallHistory.js`
- New screen in vendor app: `src/screens/EarningsHistory.js`

### 5. Wallet Recharge Flow
- Recharge screen in customer app with payment gateway (Razorpay/PhonePe)
- Backend endpoint: `POST /api/wallet/recharge`
- Add `wallet_transactions` entry on each recharge

### 6. ~~Astrologer Availability / Service-Toggle Sync~~ — DONE
See **Service-Toggle Visibility Sync** section above. Service toggles drive customer-app
visibility + per-card buttons; `is_available` gates the Live section. Backend exposes flags
+ `?service=` filter; customer lists sync via focus + Realtime.
- DONE: `video_charge_per_minute` is now editable in vendor `EditProfile.js` (Video Charges field).
- DONE: Home's call flow migrated to the `Call.js` mount-time-socket + Realtime-backup pattern.
- Action: run `astrowani-backend/sql/enable_realtime_astrologers.sql` in the Supabase SQL editor to enable live-sync push.

### 7. ~~Call Cancellation Sync~~ — DONE (2026-06-21)
Customer backing out now dismisses the vendor popup via socket `cancel_call` fast path + Supabase Realtime backup. `handleAccept` guard prevents dead sessions on accept/cancel race. See **Call Cancellation Sync** section above.

### 7b. Call Rejection Handling (vendor side — remaining)
- Verify `call_rejected` socket event emits correctly from vendor HomeScreen
- Verify customer cleanup on rejection (both `AstrologerInfo.js` and `Call.js`)
- Update `call_requests.status` to `'rejected'` in Supabase on vendor reject tap

### 8. Low Wallet Warning During Active Call
- Backend: before each `process_session_billing`, check if balance < `per_minute_charge * 2` → emit `wallet_low` to customer session room
- Customer call screens: show inline warning banner on `wallet_low`

### 9. Chat Session Screen Audit
- `ChatSessionScreen.js` and `VendorChatSession.js` not audited since call flow rewrite
- Verify chat billing, socket events, `RequestingPopup` text

### 10. Earnings Reset — Migrate to DB-backed Timestamps
- Replace in-memory `lastDailyResetDate` / `lastMonthlyResetMs` in `sessionManager.js` with a Supabase `system_config` table
- Prevents reset-clock restart on server deploy

### 11. Delete / Archive Dead Code
- `astrowani_customer-main/src/utils/EnxJoinScreen.tsx` — safe to delete
- `astrowani_customer-main/src/utils/EnxConferenceScreen.tsx` — audit, likely deletable
- `astrowani_customer-main/src/utils/JoinRoom.tsx` — audit, likely deletable
- `astrowani_vendors-main/src/utils/EnxConferenceScreen.tsx` — same audit
- DONE: customer `drawerScreens/{ChatSession,CallSession,VideoSession}.js` stubs deleted (My Sessions now real).

---

## Video transport reality (IMPORTANT)

Despite the ENX docs in this file, the **actual** customer↔vendor call video uses **WebRTC
peer-to-peer** (`react-native-webrtc`) signalled over our own Socket.io
(`webrtc_offer/answer/ice_candidate`). EnableX env vars exist but are **not used** in the live
code path. `/api/call/initiate` returns crypto-UUID room/session ids; tokens in the payload are
vestigial. Live streaming reuses this same WebRTC stack as a **mesh** (see below).

---

## Subsystems added 2026-06-21 → 06-22

### A. Admin Dashboard (`astrowani-admin/` — React + Vite, web only)
- Auth: `admins` table (bcrypt) → `POST /api/admin/login` issues an admin-role JWT → `requireAdmin`
  middleware guards all `/api/admin/*`. All admin logic in `astrowani-backend/src/adminRoutes.js`
  (registered via `require('./src/adminRoutes')(app)` in `index.js`); a generic `crud()` factory
  backs the content tables. Writes use the **service-role** Supabase client.
- Pages (`src/pages/*.jsx`) + sidebar (`components/Layout.jsx`) + routes (`App.jsx`): Dashboard
  (stats), Blogs, Banners, Thought of the Day, Categories, Remedies, Orders, Gifts, Live Streams,
  Missed Sessions, Astrologers (approve/suspend/edit charges), Customers (wallet adjust), Sessions.
- Run: `cd astrowani-admin && npm run dev` (Vite :5173). `VITE_API_URL` → backend (default :4500).
  Seed admin: `node astrowani-backend/scripts/seedAdmin.js <email> <pass>`.
- **The previously-mock content endpoints are now real DB reads**: `/api/blogs`, `/api/banners/all`,
  `/api/thoughts/latest`, `/api/categories` (shapes preserved so the apps don't break). Blogs push
  to the customer Home/BlogList via Supabase Realtime on the `blogs` table.
- SQL: `sql/admin_schema.sql` (admins, blogs, banners, thoughts, categories + astrologer
  `approval_status`/`is_suspended`/`admin_notes`) + `sql/enable_realtime_content.sql`. Run in
  Supabase SQL editor. New tables created via raw SQL have RLS off → anon reads work; if a table
  gets RLS enabled, add a `FOR SELECT USING (true)` policy.

### B. Profile Sync + Unified Cards + Category Screens (customer)
- **Backend `formatAstrologer(astro, index, categoryMap)`** in `index.js` is the single source of
  truth for both `/api/astrologers` and `/liveAstrologers`. Reads the columns the vendor actually
  writes: `profile_image` (base64, EditProfile) || `profile_pic_url`; `languages` || `language`;
  resolves `specialties` (an **array of category UUIDs** from `categories`) → names, exposing
  `categoryIds` + `categoryNames` + `specialties:[{name}]`. `/api/astrologers?category=<id|name>`
  filters by category.
- **Section screens** (Chat / Talk / Video) keep their **single** relevant button (direct request,
  no profile redirect); `ReusableList` call/video buttons restyled to the maroon Chat-button look.
- **Category screens**: Home "Astrowani's Categories" tiles → `CategoryAstrologers` (one
  parameterized screen, `/api/astrologers?category=`) rendering the shared `ExpertsList` 3-button
  card (Chat/Call/Video) which fires each request **directly** (self-contained call flow + chat hook).
- `AstrologerInfo` supports a `route.params.autoAction` to auto-fire chat/call/video on mount.

### C. Live Streaming + Wallet Gifts
- **WebRTC mesh**: vendor `GoLiveScreen.tsx` (broadcaster, one RTCPeerConnection per viewer),
  customer `LiveViewerScreen.tsx` (viewer). Socket relays (`index.js`): `live_join` →
  `live_viewer_joined`, `live_offer`/`live_answer`/`live_ice` (targeted), `live_comment`/`live_gift`
  (broadcast to `live_<sessionId>`), `end_live`→`live_ended`. Scales to ~5 viewers (swap to SFU later).
- Endpoints: `GET /api/gifts`, `GET /api/live/active`, `POST /api/live/start`, `POST /api/live/:id/end`,
  `POST /api/gift/send`. Vendor GO LIVE → `GoLiveScreen`; customer Live tab + Home strip use
  `/api/live/active`.
- **Gifts** (admin-managed `gifts` table; GiftModal `Component/Modal.tsx` real): customer debited
  full price, astrologer credited **50%** (`GIFT_VENDOR_SHARE=0.5`), rest = platform revenue logged
  in `gift_transactions`. Applies to both live AND profile gifting.
- Admin: `crud('gifts')`, `GET /api/admin/live`, `POST /api/admin/live/:id/stop` (force-stop via
  `app.locals.endLiveSession`).
- SQL: `sql/live_schema.sql` (gifts seeded, live_sessions, gift_transactions, `astrologers.is_live`,
  realtime on live_sessions, public-read RLS).

### D. Missed Sessions
- Request popup waits **60s** (was 45s; chat had none). Reject → "Astrologer is busy…"; no answer →
  request row `status='missed'` + "…not picked up…"; manual cancel → `status='cancelled'`.
- Customer: all 5 call entry points' end-helper takes a `status` param (timeout→`'missed'`,
  reject→`'rejected'` (don't overwrite), cancel→`'cancelled'`); `useChatRequest` got a 60s timeout.
- Backend: `sessionManager.markStaleRequestsMissed()` (in the 30s poll) flips any `pending`
  call/chat request older than 75s to `'missed'` (backup if app died). `GET /api/admin/missed`.
- Vendor: `screens/HIstory/MissedSessions.js` (3 tabs Chat/Audio/Video, `status='missed'`) + drawer
  item with a **red badge** (count since `missed_seen_at` in AsyncStorage). Admin: `pages/Missed.jsx`.
- No DB migration — `status` is free-text.

### E. My Sessions (customer) — now REAL
- Drawer "My Sessions" renders `drawerScreens/MySessionScreen.js` (was wired to dead stub tabs):
  4 tabs (Chat/Audio/Video/Live) reading the customer's `chat_sessions` by `caller_id` + Realtime,
  rendering `component/SessionDetails.js`. "View Profile" → `AstrologerInfo`. Stub files deleted.

### F. UI polish
- **Themed status popup**: `components/StatusPopup.js` — imperative `showStatusPopup({variant,title,
  message})` + `<StatusPopupHost/>` mounted once at the Navigation root. Replaces the default Android
  `Alert` for call/chat **missed**/**busy** outcomes (brand brown card). Other alerts still use Alert.
- **`RequestingPopup`** restyled to the brown theme (used for chat/call waiting everywhere).
- **Vendor service toggles**: custom animated `ServiceToggle` in `HomeScreen.js` replaced the default
  RN `Switch`.
- **Home banner** (`FadeBanner`): falls back to bundled local images when no admin banners exist.

### Remedies Shop
- Admin CRUD of `remedy_items` (type = puja | gemstone | specific_puja); customer Buy Now / Place
  Order. See `memory/remedies_shop.md`. (Orders table needs service-role insert under RLS.)

---

## Subsystems added 2026-06-22 (session 2)

### G. Reviews & Ratings (real — replaced full mock)
- Was entirely fake (hardcoded `4.8 / 120`, "Demo User", POST saved nothing). Now real end-to-end.
  See `memory/reviews_system.md`.
- **DB** `sql/reviews_schema.sql`: `reviews` (rating 1–5, comment, `is_hidden`, `admin_note`,
  `admin_reply`, UNIQUE(astrologer_id,customer_id)) + cached `astrologers.average_rating` /
  `total_reviews`; realtime + public-read of non-hidden.
- **Backend** (`index.js`): `recomputeAstrologerRating(id)` (mean of non-hidden, runs after every
  write/delete); `resolveCustomerFromReq(req)` (JWT→real customer UUID by phone — **shared with
  favorites**). The 4 ex-mock `/api/reviews/*` endpoints are real; **POST is eligibility-gated** —
  a completed `chat_sessions` row (caller+vendor, `ended_at NOT NULL`) is required → else 403.
  Upsert = one editable review per pair. `formatAstrologer` exposes real `rating` + `totalReviews`
  (no more 4.8 fallback). Admin routes (`adminRoutes.js`): list/PATCH/DELETE + recompute.
- **Customer**: shared `components/StarRating.js` — ALWAYS 5 stars (yellow filled = `round(rating)`,
  rest brown `star-border`; 0 → empty outline). Used on every card/profile. **On the compact
  `ReusableList` cards use `size` only — NO `showValue`** (the value text overflows the 85px avatar
  column and overlaps the price). After-session prompt `components/ReviewPrompt.js` (imperative
  `showReviewPrompt` + `ReviewPromptHost` at nav root) fires from the call/chat `doEndCall`/`endSession`
  (gated on connected) + SessionDetails "Rate this session". All 5 call entry points thread `recieverId`.
- **Admin** `pages/Reviews.jsx` (tabs All/Visible/Hidden; Hide/Delete/Edit/reply). **Vendor**
  `RatingReview.tsx` fetches real reviews by own `astroId`.

### H. Favorites (real — replaced mock)
- See `memory/favorites_system.md`. `sql/favorites_schema.sql`: `favorites`
  (UNIQUE(customer_id,astrologer_id)) + realtime + public-read. The 3 ex-mock
  `/api/favoriteAstrologer*` endpoints are real (use `resolveCustomerFromReq`); GET returns
  formatted astrologers. `AstrologerInfo` heart toggles real (optimistic+revert); `FavoriteScreen`
  re-fetches on focus + Realtime on `favorites` filtered by `userData.id`. **"Gemstones" drawer
  item removed** from `CustomDrawerContent.js`.

### I. Per-app Banners + admin rotation interval
- `sql/app_settings_schema.sql`: `app_settings` (key/value) seeded `banner_interval_seconds=4`.
  `sql/banner_app_separation.sql`: adds `banners.app` ('customer'|'vendor'|'both', default 'both')
  and seeds the two hosted fallback images (`/public/images/banner{1,2}.jpeg`) as removable rows.
- **Backend**: `/api/banners/all?app=customer|vendor` filters by `app = requested OR 'both'` and
  returns `intervalSeconds` (from `app_settings`, via `getSetting`). Admin `GET/PATCH
  /api/admin/settings`. Banners crud `allowed` now includes `app`.
- **Admin** `pages/Banners.jsx`: Customer/Vendor tabs, "Show in app" selector, "Shows in" column,
  editable interval. **Customer** `Home.js` `FadeBanner` takes `intervalMs` + fetches `?app=customer`.
  **Vendor** new `components/HomeBanner.js` (admin-driven cross-fade, `?app=vendor`) replaced the
  static `mainlogo.jpeg`. Both apps still fall back to a bundled image only when an app has 0 banners.

### J. Vendor home Missed Sessions + UI polish
- Vendor `components/MissedSessionsHome.js` on `HomeScreen` — combined missed chat/audio/video with
  time-filter chips (Today default / Yesterday / This Month / All), "View All" → `MissedSessions`.
- Vendor drawer header gradient changed to brown (`['#3d1c11', AstroMaroon]`) — was reddish `#800000`.
- Admin dashboard: collapsible sidebar — `Layout.jsx` `collapsed` state + fixed top-right toggle
  (✕/☰); `.main` has right padding so the button never overlaps page actions.

### SQL files to run (Supabase SQL editor), in order
1. `sql/admin_schema.sql` + `sql/enable_realtime_content.sql` (admin/content)
2. Remedies items table + orders (see remedies memory)
3. `sql/live_schema.sql` (live + gifts)
4. Missed sessions: **none** (free-text `status`).
5. `sql/reviews_schema.sql` (reviews + astrologer rating columns)
6. `sql/favorites_schema.sql` (favorites)
7. `sql/app_settings_schema.sql` + `sql/banner_app_separation.sql` (banner interval + per-app banners)
Seed admin: `node astrowani-backend/scripts/seedAdmin.js`.
