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
> For product analytics (PostHog screen-view tracking + admin Analytics page), see
> **"Subsystem added 2026-08-06: Product analytics (PostHog)"** near the end of this file.
> Per-feature deep notes also live in the auto-memory index (`memory/MEMORY.md`).

### Backend (`astrowani-backend/`)
- **Entry**: `index.js` — Express server + Socket.io on port 4500
- **Session billing**: `src/sessionManager.js` — polls `chat_sessions` every 30 s, calls Supabase RPC `process_session_billing`
- **Earnings resets**: `src/sessionManager.js` also runs `checkEarningsResets()` every hour — resets `today_earnings = 0` daily (new calendar day detected), resets `total_earnings = 0` every 30 days. Tracking is in-memory (`lastDailyResetDate`, `lastMonthlyResetMs`); on server start, daily reset always fires once (initialised to `null`), monthly fires if 30+ days have elapsed (initialised to 31 days ago).
- **Database**: Supabase (PostgreSQL). Uses anon key for most reads, service role key for billing RPC
- **Auth**: JWT signed with the `JWT_SECRET` env var. There is **no fallback** — the server
  refuses to boot if it is unset, under 32 chars, or equal to the old hardcoded default.
  Never write the actual value into this file, source, or a deploy script.
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

---

## Subsystem added 2026-08-04: Crash reporting + autonomous bug-scanning agent

### K. Crash/error reporting (prerequisite — previously nothing existed)
- Backend is deployed on a **Hostinger VPS**, reachable at `https://backend.astrowani.com`
  (both apps' `src/config/api.js` `SOCKET_URL`) — not Render. (A few pre-existing fallback
  image URLs still said `astrowani.onrender.com`, a stale domain from an earlier host; the
  live one in `formatAstrologer`'s `profileImage` fallback was fixed to `backend.astrowani.com`.
  The unreachable `MOCK_ASTROLOGERS` dead-code array near `/api/astrologers` still has the old
  domain too, but it's never referenced by any route — harmless until someone deletes the dead
  code.)
- **Backend**: `astrowani-backend/src/errorLogger.js` — appends JSON-line entries to
  `logs/errors.log` (gitignored; **wiped whenever the Node process restarts** — there's no
  managed-platform persistence here, just whatever process manager runs it on the VPS).
  Wired as the last Express error-handling middleware in `index.js`, plus
  `process.on('uncaughtException'/'unhandledRejection')`. Neither handler changes prior
  crash/restart behavior — errors are logged, not swallowed into a new `process.exit()`.
  Read-only access for tooling: `GET /api/bug-agent/errors` (`src/bugAgentRoutes.js`),
  guarded by a **separate, narrowly-scoped** `BUG_AGENT_TOKEN` env var — deliberately NOT
  the admin JWT (`requireAdmin`), since that can reach wallet/billing writes and no scanning
  tool should hold a credential capable of that even indirectly. Must be set wherever the
  VPS process's env vars live (e.g. PM2 ecosystem file / `.env` / systemd unit — whatever
  currently supplies `SUPABASE_SERVICE_ROLE_KEY` etc. to the running process) for the
  endpoint to work (503s if unset).
- **Both RN apps used Firebase Crashlytics initially, fully replaced by Sentry same day**
  (see subsystem M below) — `@react-native-firebase/crashlytics` and its Gradle plugin are
  **fully removed** from both apps. Do not re-add Crashlytics or suggest it as a fix for
  anything crash-reporting related.

### M. Crash reporting migrated: Crashlytics → Sentry (2026-08-04, later same day)
- **Why**: Crashlytics has no free programmatic read API — reading issues needs either
  BigQuery export (requires the Blaze pay-as-you-go billing plan, i.e. a card on file) or a
  GCP service account granted the Crashlytics API, and the user explicitly didn't want to add
  billing just to read crash logs. Sentry's free tier includes full REST API read access with
  no card required, so the bug-scan agent (subsystem L) can pull real crash data
  autonomously. Considered the free **Crashlytics → Slack integration** as an alternative
  (keeps Crashlytics, posts alert-level summaries to Slack, still free/no-card) but went with
  a full Sentry swap instead since it gives structured, queryable data rather than
  message-parsing, at the cost of redoing the SDK wiring (already sunk since Crashlytics was
  brand new that same day).
- **Sentry org**: `astrowani` (https://astrowani.sentry.io). Three projects, one per signal
  source: `react-native` (customer app), `astrowani-vendor` (vendor app), `astrowani-backend`
  (created for future use, not currently wired into the backend — the backend already has its
  own working `errorLogger.js` + `/api/bug-agent/errors` endpoint from subsystem K, so it
  wasn't switched over; no need to duplicate a source that already works).
- **Both RN apps**: `@sentry/react-native` (`^8.x`) replaces `@react-native-firebase/crashlytics`
  entirely. `src/utils/CrashReporting.js` (both apps) now just calls `Sentry.init({dsn, ...})`
  — unlike the old manual `ErrorUtils`/promise-rejection wrapping Crashlytics needed, Sentry's
  `init()` sets up the global JS error handler, unhandled promise rejection tracking, and
  native (Java/NDK) crash capture on its own. Native: the Crashlytics Gradle plugin classpath
  (`android/build.gradle`) and `apply plugin: 'com.google.firebase.crashlytics'`
  (`android/app/build.gradle`) were removed from both apps — Sentry's native linking is
  handled by the RN package's autolinking, no manual Gradle plugin needed for basic crash
  capture (source-map/debug-symbol upload for symbolicated stack traces is a possible future
  addition, not done yet). Vendor app's `src/components/ErrorBoundary.js` (wraps
  `CustomDrawer` — see the blank-screen-crash fix below) now calls
  `Sentry.captureException(error, {tags: {boundary: name}})` instead of
  `crashlytics().recordError()`.
- **Bug-scan agent** (subsystem L): reads new issues via Sentry's REST API
  (`GET https://sentry.io/api/0/projects/astrowani/<project-slug>/issues/?statsPeriod=24h&query=is:unresolved`),
  auth'd with a **read-only Internal Integration token** scoped to `Issue & Event: Read` +
  `Project: Read` only (named "bug-scan-agent (read-only)" in the Sentry org) — same
  least-privilege reasoning as `BUG_AGENT_TOKEN`. Token is embedded in the cloud routine's
  prompt as `$SENTRY_AUTH_TOKEN` (no separate secrets store existed for cloud routines at
  setup time, same pattern as `BUG_AGENT_TOKEN`). Full instructions in
  `.claude/skills/bug-scan/SKILL.md` section 1.
- **Cloud environment network policy**: the routine's cloud environment (`bug-scan`, then
  recreated as `bug-scan-v2` to add `sentry.io` to the Custom network allowlist — environments
  can't be edited in place, only recreated, see subsystem L's original setup notes) must
  include `sentry.io` or the agent's Sentry API calls will fail with a network-policy block,
  the same failure mode the backend endpoint hit before its domain was allowlisted.

### L. Autonomous bug-scanning agent (`/bug-scan`)
- `.claude/skills/bug-scan/SKILL.md` — full operating instructions for a scheduled agent that
  pulls new backend errors (via the endpoint above) and (once wired) app crashes, triages
  against `bug_agent_log.md` (repo root, its running dedup/status log), root-causes against
  this file's documented invariants, and drafts a fix on a `fix/<description>` branch + PR —
  **never** merges, deploys, or touches secrets/CI config, and flags any change touching
  wallet/billing/session-finalization code with an explicit "⚠️ Money-affecting change"
  warning at the top of the PR.
- Intended to run on a recurring cloud schedule (not this local machine — needs `gh`/git
  push access to `origin` independent of any single developer's machine being on).
- `bug_agent_log.md` at the repo root is the dedup ledger — re-run the skill to see its
  exact update rules rather than hand-editing status columns.

---

## Subsystem added 2026-08-05: Busy-astrologer gating + notify-me waitlist + timer-drift fix

### N. Busy-astrologer gating (chat/call/video mutually exclusive)
- **Problem**: nothing prevented a second customer from chatting/calling/video-calling an
  astrologer who was already in a session (or already being rung by someone else) — the
  vendor's `NotificationPopup` state was also a single value, so a second incoming request
  silently overwrote/dropped the first with no trace beyond the 75s `markStaleRequestsMissed`
  sweep.
- **"Busy" definition** — `astrowani-backend/src/busyStatus.js` (`checkAstrologerBusy` for a
  single id, `buildBusyMap` batched for list endpoints): astrologer has EITHER an active
  `chat_sessions` row (`vendor_id = id AND is_active = true`) OR a `pending` `call_requests`
  row (`astrologer_id`) OR a `pending` `chat_requests` row (`receiver_id`). Busy blocks chat
  AND call AND video equally (mutually exclusive — matches "on the phone" semantics). Fails
  open on any DB error (never blocks a legit request over a transient failure).
- **Enforcement**: `POST /api/call/initiate` (audio+video, shared endpoint) now 409s with
  `{busy:true, busySince}` before emitting `incoming_call` if busy. Chat has no backend
  request-creation route (the customer app inserts `chat_requests` directly via Supabase) —
  new `POST /api/chat/check-availability` is a pre-check `useChatRequest.js` calls immediately
  before its insert, aborting (same busy UI) on 409. **All 5 duplicated call/chat-initiation
  code paths** (`ReusableList.js`, `Home.js`, `Call.js`, `AstrologerInfo.js`, `ExpertsList.js`)
  each catch a 409 from `/api/call/initiate` and show the existing `showStatusPopup({variant:
  'busy', ...})` pattern instead of a generic error.
- **List data**: `formatAstrologer()` takes a 4th `busyMap` param, adds `isBusy`/`busySince` to
  every astrologer row. `/api/astrologers` and `/liveAstrologers` build the map once per
  request (3 queries total, not per-row) via `Promise.all`.
- **Customer UI**: busy overrides the per-service enabled/disabled buttons with a single
  orange "Busy · Xm" state (color `#E67E22`, distinct from the red `#C0392B` "Unavailable"
  toggle-off state) across all 5 button call sites + `AstrologerInfo`'s floating dock (which
  additionally gets a live-ticking elapsed time via `useElapsedSeconds`, since it's a single
  item — list cards use a cheaper render-time snapshot instead, since calling a ticking hook
  per-row inside `renderItem`/`renderButton` would violate Rules of Hooks). Tapping the busy
  pill offers "Notify Me" instead of the normal action.
- **Not done**: no Postgres trigger/RLS-level enforcement — gating is application-level only
  (the 5 call sites + the two check endpoints). A client that skipped these checks entirely
  could still insert a `call_requests`/`chat_requests` row directly; considered and explicitly
  deferred as out of scope given the risk of a novel DB trigger under time pressure — flag if
  this ever needs hardening.

### O. "Notify me" waitlist (fire-once, not a live queue)
- `sql/astrologer_waitlist_schema.sql` — **not yet run against Supabase**, run it before this
  feature will work (the endpoint fails closed/silently without the table; core busy-gating
  above does NOT depend on it). `astrologer_waitlist` (astrologer_id, customer_id UNIQUE pair,
  request_type). RLS: service-role only, no client-direct access.
- `POST /api/astrologer/:id/notify-me` (upsert, requires customer JWT) — the only write path.
- `astrowani-backend/src/waitlist.js` `notifyWaitlistIfFree(supabase, sendPush, astrologerId)`
  — pushes the first 5 waiters (oldest first) then **deletes those rows** (fire-once, not
  polling/live). Hooked into `sessionManager.js` at the two places the backend actually learns
  an astrologer freed up: `terminateSession` (a session just ended) and
  `markStaleRequestsMissed` (a pending request just timed out at 75s) — in both cases it
  re-checks `checkAstrologerBusy` first and only notifies if genuinely free now. **Known gap**:
  vendor-reject and customer-cancel paths are mostly client-driven Supabase writes with no
  backend touchpoint, so the waitlist isn't notified on those (only on natural session end or
  the 75s stale-request sweep) — deliberate scope cut, not an oversight.
- This is intentionally NOT a real auto-connect queue (customer still has to tap to initiate
  once notified) — modeled after Astrotalk's actual list-level "grey button + wait label"
  pattern rather than building a full FIFO auto-connect system.

### P. Vendor incoming-request popup: single value → queue
- **Real pre-existing bug**, found while building the above: `HomeScreen.js` `popupData`/
  `popupVisible` was a single value — `setPopupData({...})` from a second incoming request
  (different customer, or a socket+Realtime race for the same one) silently overwrote the
  first with no trace. Converted to `popupQueue` (array); `popupData`/`popupVisible` are now
  derived (`popupQueue[0]`, `popupQueue.length > 0`). New `enqueuePopup()` dedupes by
  requestId/roomId before appending. `dismissPopupIfMatches` now filters the whole queue, not
  just the front item. `handleAccept`/`handleCancel` `slice(1)` off the front instead of
  nulling a single value. `NotificationPopup` gets a `queueCount` prop → shows "+N more
  waiting" (`notificationPopup.js`). With busy-gating (subsystem N) in place, a second request
  to the same astrologer is normally rejected before it can even queue — this is defense in
  depth for the remaining race window, and fixes a bug that could already happen for two
  simultaneous requests to a genuinely idle astrologer.

### Q. Timer-drift fix (all 6 call/chat duration timers)
- **Bug**: every call/chat screen in both apps used
  `setInterval(() => setSeconds(s => s + 1), 1000)` — an *accumulating* counter, not anchored
  to a real timestamp. A delayed tick (JS thread throttled: backgrounded app, heavy re-render,
  Android Doze) still only adds 1 regardless of real elapsed time, so the displayed timer
  drifts behind and can appear "stuck" — this was a standing, user-reported bug independent of
  the busy-gating work.
  - Fix: `useElapsedSeconds(startMs, active)` — new hook (`astrowani_customer-main/src/hooks/
    useElapsedSeconds.js`, `astrowani_vendors-main/src/utils/useElapsedSeconds.js`, identical
    logic) recomputes `Date.now() - startMs` on every tick instead of incrementing state —
    self-correcting, can't drift even if a tick lands late.
  - Applied to all 6: customer `ChatSessionScreen.js` (anchors to `chat_sessions.started_at`
    when available, else `Date.now()`), `VoiceCallScreen.tsx`, `VideoCallScreen.tsx`; vendor
    `VendorChatSession.js`, `EnxScreenVoice.tsx`, `EnxScreenVideo.tsx`. Same hook also powers
    the live-ticking "Busy · Xm" display in `AstrologerInfo.js` (subsystem N).
  - Pattern for any *future* on-screen duration/countdown timer in this codebase: use this
    hook, never a raw accumulating `setInterval`.

### SQL to run for this subsystem
- `sql/astrologer_waitlist_schema.sql` (notify-me — busy-gating itself needs no new tables,
  it's computed from existing `chat_sessions`/`call_requests`/`chat_requests`).

### Testing note
- Verified via direct API calls against a locally-run backend (temporarily pointed both apps'
  `SOCKET_URL` at `http://10.0.2.2:4500`, reverted before commit): `/api/chat/check-availability`
  and `/api/call/initiate` both correctly 409 with `busySince` when a synthetic pending
  `chat_requests` row exists, `/api/astrologers` reflects `isBusy`/`busySince` per row, and the
  state cleanly reverts to `busy:false` after the row is removed. Both apps' debug builds
  compile clean with all changes. Full two-emulator click-through (real OTP login + live
  cross-app request) was not completed — blocked entirely by local Android-emulator/ADB
  input-automation friction (see `emulator_headless_launch` memory), not by any app-level
  issue found. Worth a manual click-through pass before shipping.

---

## Subsystem added 2026-08-06: Product analytics (PostHog)

### R. Screen-view tracking (both apps) + admin Analytics page

- **Why PostHog, not Firebase Analytics**: real query access to Firebase Analytics data
  (beyond the stock console) requires BigQuery export, which requires the paid Blaze plan —
  the same "need a card on file just to read data" wall this project already hit and walked
  away from with Crashlytics → Sentry (subsystem M). PostHog's free tier (1M events/month, no
  card) includes full API read access, so the same narrowly-scoped-token pattern used for
  Sentry/`BUG_AGENT_TOKEN` applies directly.
- **Scope of this pass**: auto-tracked **screen views** only, surfaced as charts in a new
  admin page. Custom business events (wallet recharge, call started, etc.), session replay,
  and feature flags are deliberately **not** built yet — future work, not an oversight.
- **Architecture**: both RN apps send events straight to PostHog Cloud (its Project API Key
  is safe client-side — write-only for ingestion). The admin dashboard never talks to
  PostHog directly; `astrowani-admin` calls `astrowani-backend`'s `/api/admin/analytics/*`
  (behind the normal admin JWT), which holds a separate, read-only **Personal API Key**
  server-side and proxies to PostHog's HogQL Query API. Same shape as `sentry.js`/
  `bugAgentRoutes.js`: narrowly-scoped secret, never the admin JWT, graceful 503 (not a
  crash) if unconfigured.
- **Client SDK** (`posthog-react-native`): `src/utils/Analytics.js` in each app constructs a
  module-level `PostHog` singleton (`disabled: true` while the API key is still the
  `REPLACE_WITH_...` placeholder — see "Outstanding setup" below) and exports
  `identifyCustomer`/`identifyVendor` + `resetAnalyticsIdentity`. Imported for its side effect
  at the top of each `index.js`, same spot as `initCrashReporting()`.
- **Screen-view autocapture** uses PostHog's built-in navigation hook via `<PostHogProvider
  client={posthog} autocapture={{captureScreens: true, ...}}>` — for `@react-navigation/native`
  v6 (both apps are on `^6.1.18`) this **must be rendered as a child of `NavigationContainer`**,
  not wrapped around it, because the hook reads navigation state through
  `@react-navigation/native`'s own React hooks. Wired inside `<Stack.Navigator>` in
  `astrowani_customer-main/src/routes/Navigation.js` and
  `astrowani_vendors-main/src/routes/NavigationScreen.js` (independent of and non-conflicting
  with the vendor app's pre-existing `onReady` on the same `NavigationContainer`). Each
  screen event is tagged `{app: 'customer' | 'vendor'}` via the `routeToProperties` option so
  the two apps are distinguishable inside one shared PostHog project.
- **Identify/reset**: `identifyCustomer`/`identifyVendor(realUserId)` called right after OTP
  verify succeeds (`VerifyOtp.js`, both apps) — ties pre-login anonymous activity to the real
  Supabase UUID. `resetAnalyticsIdentity()` called on logout (`CustomDrawerContent.js`
  customer, `CustomDrawer.js` vendor). The customer app previously never persisted its own
  `customers.id` locally (only the vendor app stored `astroId`) — added
  `AsyncStorage.setItem('customerId', ...)` alongside the existing `identify()` call, a small
  necessary addition, not scope creep.
- **Backend** (`astrowani-backend/src/postHogRoutes.js`, registered in `index.js` next to
  `adminRoutes`/`bugAgentRoutes`): reads `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`,
  `POSTHOG_PERSONAL_API_KEY` from env; every route 503s with a clear message if any are unset
  rather than crashing. `requireAdmin` is now exported from `adminRoutes.js`
  (`module.exports.requireAdmin = requireAdmin`) specifically so this file could reuse it
  instead of duplicating the JWT-verification logic. Three GET endpoints under
  `/api/admin/analytics/`: `summary` (views + unique users), `trend` (daily views split by
  app, for the line chart), `top-screens` (per-app screen breakdown). Small in-memory 60s TTL
  cache per query (same shape as `astroRoutes.js`'s PDF cache) so the admin page's 60s
  auto-refresh doesn't hammer PostHog's API.
- **Admin** (`astrowani-admin/src/pages/Analytics.jsx`, new `recharts` dependency — no chart
  library existed in this app before): stat cards (reuses `Dashboard.jsx`'s `.stat-grid` CSS),
  a 30-day line chart (one line per app), and a Customer/Vendor-tabbed top-screens table (tab
  pattern from `Reviews.jsx`). Registered as `/analytics` in `App.jsx` + a sidebar entry in
  `Layout.jsx`. When the backend 503s (not yet configured), the page shows an explanatory
  card instead of an error — no separate "is it configured" check needed on the frontend.

### S. Business events + admin-controlled session replay (2026-08-06, same day)

- **Business events** — the "screen views only" MVP above only shows *where* users go, not
  *what they do*. Both apps' `src/utils/Analytics.js` now export `captureEvent(name, props)`
  (auto-tags `{app: 'customer'|'vendor'}`, same as screen views) and it's wired at the
  existing state-transition points that were already single, canonical choke points — not
  the 5-duplicated call/chat-*initiation* entry points (`ReusableList.js`/`Home.js`/`Call.js`/
  `AstrologerInfo.js`/`ExpertsList.js`) that busy-gating (subsystem N) had to touch
  individually. Connected/ended events fire regardless of which entry point started the call,
  so instrumenting the one shared call/chat *screen* per type was sufficient:
  - `call_connected` / `call_ended` (`{call_type: 'voice'|'video', session_id, duration_seconds,
    connected}`) — customer `VoiceCallScreen.tsx` / `VideoCallScreen.tsx`, vendor
    `EnxScreenVoice.tsx` / `EnxScreenVideo.tsx`, at the same ICE-connected-state and
    `doEndCall()` chokepoints documented in the "ENX Screen Architecture Pattern" section above.
  - `chat_started` / `chat_ended` — customer `ChatSessionScreen.js`, vendor
    `VendorChatSession.js`.
  - `wallet_recharged` (`{amount}`) — customer `Wallet.js`, fired only after the backend's
    signature-verified `/api/wallet/verify-payment` succeeds (never on a client-reported
    Razorpay callback alone, consistent with that flow's existing trust boundary).
  - `review_submitted` (`{astrologer_id, rating}`) — `ReviewPromptHost` in
    `components/ReviewPrompt.js`, the single shared post-session prompt used everywhere
    (call/chat end + SessionDetails "Rate this session"), so one instrumentation point covers
    every review path.
  - `call_initiated` / `chat_initiated` — see subsystem T below (added later the same day).
  - Still not instrumented: vendor-side accept/reject actions — future addition if needed.
- **Admin-controlled session replay** — the user explicitly wants every analytics control
  living in `astrowani-admin`, not PostHog's own project settings. Reused the existing
  `app_settings` key/value table (already powers the banner rotation interval) rather than
  adding new backend routes: `sql/app_settings_schema.sql` now also seeds
  `session_replay_enabled` ('false') and `session_replay_sample_rate` ('0.1'). The generic
  `/api/admin/settings` GET/PATCH (`adminRoutes.js`) already handled arbitrary keys, so no
  backend code changes were needed — only a new "Session Replay" card at the top of
  `Analytics.jsx` (checkbox + sample-rate input, same save pattern as `Banners.jsx`'s interval
  field). Both apps' `applySessionReplaySetting()` (in `Analytics.js`) reads those two keys
  **directly from Supabase** (public-read RLS, same pattern as `Navigation.js`'s wallet-balance
  read) once per app launch — via a `useEffect` in the root `Navigation.js` /
  `NavigationScreen.js` — does a local `Math.random() < sampleRate` coin-flip, and only then
  calls `posthog.startSessionRecording()`. Off by default; toggling in the admin only affects
  *new* app sessions going forward (same eventual-consistency model as the banner interval).
  SDK's default masking (`maskAllTextInputs`/`maskAllImages: true`) already protects OTP entry
  and profile photos without extra config.
  - **One caveat that can't be avoided**: PostHog's `startSessionRecording()` is a no-op if
    session replay is disabled at the *PostHog project* level — so turning it on once in the
    PostHog project settings is a one-time prerequisite done during account setup (alongside
    getting the API keys), not something the admin dashboard can control. Everything
    afterward — on/off, sample rate, day-to-day — is 100% from `astrowani-admin`.

### T. Call/chat initiation events + funnel view (2026-08-06, later still)

- **`call_initiated` / `chat_initiated`** — the piece subsystem S deliberately deferred,
  because it meant touching the duplicated entry points instead of one shared screen. Done
  now via `captureEvent` right after each request is confirmed to have gone out (not on tap —
  after the wallet check + `POST /api/call/initiate` returns 200, or after the
  `chat_requests` insert returns a real row id), so a failed/blocked attempt doesn't
  pollute the funnel:
  - `call_initiated` (`{call_type, astrologer_id}`) — customer `Video.js`, `Call.js`,
    `ExpertsList.js`, `AstrologerInfo.js` (both its audio and video call sites),
    `ReusableList.js`, `Home.js` (both its audio and video call sites). `call_type` reflects
    whatever string that specific call site actually sends the backend — the codebase isn't
    consistent about `'audio'` vs `'voice'` across these files (pre-existing inconsistency,
    not introduced here) — so don't assume a single canonical value when querying.
  - `chat_initiated` (`{astrologer_id}`) — **one** location: `src/hooks/useChatRequest.js`,
    the shared hook "for ANY screen that has a Chat button" (its own header comment). Every
    chat entry point already funnels through this hook, so instrumenting it once covers all
    of them — unlike calls, which have no equivalent shared hook. `src/api/ChatApi.js`'s
    `chat_requests` insert is dead code (nothing imports it, confirmed via grep) and was
    deliberately left uninstrumented.
  - Customer-only — there is no vendor-side "initiated" event; the vendor app only ever
    accepts/rejects an incoming request, it never originates one.
- **Funnel endpoint** — `GET /api/admin/analytics/funnel` (`postHogRoutes.js`), same
  `requireAdmin` + `requireConfigured` + 60s-cache pattern as the other three routes. Returns
  `{call: {initiated, connected}, chat: {initiated, connected}}`, always for `app='customer'`
  (hardcoded, no query param — a `?app=vendor` funnel would be meaningless since vendor has
  no `initiated` counterpart). Deliberately two stages, not three: `call_ended`/chat's end
  event fire on **every** call/chat regardless of whether it connected, so "Ended" doesn't
  represent further drop-off the way a real funnel stage should — Initiated → Connected is
  the actual conversion question.
- **Admin UI** — new "Call & Chat Funnel" card on `Analytics.jsx`, between the trend chart and
  top-screens table. Two side-by-side mini-funnels (Call, Chat), each a plain CSS bar
  (`FunnelRow`) rather than a recharts `Funnel` component — simpler and matches the
  card/table styling already on the page. No app-tab toggle on this card (see "customer-only"
  above) — the existing Customer/Vendor tabs are still there for the unrelated Top Screens
  table below it.

### Outstanding setup (blocks real data, not the code)

The PostHog account itself has **not been created yet** — account creation isn't something
Claude can do on the user's behalf. Both apps' `src/utils/Analytics.js` currently ship a
`REPLACE_WITH_POSTHOG_PROJECT_API_KEY` placeholder (SDK stays `disabled: true` until it's
swapped), and the backend 503s until its three `POSTHOG_*` env vars are set. To turn real data
on:
1. Sign up free at posthog.com (no card), create one project.
2. Get the **Project API Key** → paste into both apps' `Analytics.js` (safe to hardcode,
   write-only, same trust level as the Sentry DSN already hardcoded there).
3. Create a **read-only** Personal API Key (Project: Read, Query: Read only — least privilege,
   matching `BUG_AGENT_TOKEN`) → set as `POSTHOG_PERSONAL_API_KEY` wherever the backend's other
   env vars live (VPS process env — see subsystem K).
4. Set `POSTHOG_PROJECT_ID` and `POSTHOG_HOST` (`https://us.i.posthog.com` or
   `https://eu.i.posthog.com` depending on the Cloud region chosen at signup) the same way.
5. If session replay will ever be used (subsystem S), turn on "Record user sessions" once in
   the PostHog project's own settings — required by the SDK regardless of our own admin
   toggle, see subsystem S's caveat. Everything else about replay (on/off, sample rate) stays
   in `astrowani-admin` from then on.
6. Re-run `sql/app_settings_schema.sql` in the Supabase SQL editor — it's additive/idempotent
   and now also seeds `session_replay_enabled` / `session_replay_sample_rate` (subsystem S).
No other code changes are needed once these values exist — the admin page starts rendering
real numbers automatically, and the Session Replay toggle starts working.

### Testing note
- Verified end-to-end against a locally-run backend (temporarily pointed the admin dashboard's
  `VITE_API_URL` at `http://localhost:4500` via a gitignored `.env.local`, reverted before
  finishing): the three `/api/admin/analytics/*` endpoints correctly 503 with the "not
  configured" message when hit with a valid admin JWT, and the admin `/analytics` page renders
  the same friendly message end-to-end (sidebar link → route → chart-library import → API call
  → graceful unconfigured state), confirmed via browser with no console errors beyond the
  expected 503s. Both RN apps lint clean and the admin app's production build (`npm run
  build`) succeeds. Real on-device screen-view capture was not verified — blocked on the
  outstanding PostHog account creation above, not on any code issue found.

---

## Data-layer audit 2026-08-07 — READ THIS BEFORE TOUCHING THE DATABASE

### U. Current state of the database (measured against production, not inferred)

Full report: https://claude.ai/code/artifact/21051385-473d-43db-b353-121aae67c3dc
Deep notes: `memory/database_audit_20260807.md`. Overall data-layer rating **3/10**.

**The one structural fact to carry forward:** every table created via a schema file in
`astrowani-backend/sql/` (wallet_recharges, reviews, favorites, waitlist, …) is properly
built — foreign keys, CHECK constraints, UNIQUE idempotency guards, RLS. Every table created
ad-hoc in the Supabase dashboard at the start of the project — `customers`, `astrologers`,
`chat_sessions`, `chat_requests`, `call_requests`, `chat_messages`, `wallet_transactions`,
`vendor_wallet_transactions` — has **none** of it. Those eight carry all the money and all
the session state. When adding to them, bring them up to the newer standard rather than
matching what is already there.

**Open issues (NOT yet fixed — do not assume any of these are handled):**
- **RLS is OFF on the core tables.** The publishable key shipped in both APKs can INSERT and
  UPDATE `customers`, `astrologers`, `chat_sessions`, `call_requests` — including
  `wallet_balance` and `*_charge_per_minute` — and can READ astrologer bank details, customer
  birth data, and every `chat_messages` transcript. Verified by probe.
- **RLS cannot simply be enabled.** The apps authenticate with our own Express JWT, not
  Supabase Auth, so `auth.uid()` inside a policy is always NULL and no ownership policy is
  expressible. Turning RLS on today breaks every direct-from-app query without securing
  anything. The working path is column-level `GRANT`/`REVOKE` on the `anon` role — see
  `sql/hardening_02_access_control.sql`, which is sequenced and commented.
- **Every wallet mutation is a non-atomic read-modify-write** (`SELECT wallet_balance` → add in
  Node → `UPDATE`) with the ledger insert as a *separate* statement. ₹5,865 of drift across 3
  accounts already exists. Any new money code must instead do the balance change and the ledger
  write in one transaction / one Postgres function — copy the `wallet_recharges` pattern.
- **Zero indexes** beyond primary keys on all 8 hot tables. `sql/hardening_01_core_tables.sql`
  has the 16 that the current query patterns need. Add the index with the query from now on.
- **Realtime amplifier**: `Home.js`, `Chat.js`, `Video.js`, `Call.js` each subscribe to
  `{event:'*', table:'astrologers'}` **unfiltered** and refetch the whole list on any change.
  This scales as users × astrologer-activity and is the most likely cause of a sudden outage.
  Never add another unfiltered table-wide subscription.
- **Zombie-session trap**: `is_active = true` with `next_billing_at = NULL` is invisible to
  `sessionManager.checkActiveSessions` (which filters `next_billing_at <= now`) but still counts
  as busy in `busyStatus.js` — so the astrologer is locked out of all work, silently and
  indefinitely. Two such rows had been live since 2026-06-18. Any code that sets `is_active`
  must set `next_billing_at` in the same write.
- `process_session_billing` exists **only in the Supabase dashboard** — it is not in the repo,
  has never been reviewed, and cannot be restored. Export and commit it before changing billing.
- No rate limiting, no `helmet`, no compression; `cors()` is fully open.

### V. Things that are now enforced — do not undo them

- **`JWT_SECRET` has no fallback.** The old hardcoded default (`super_secret…`) was in six
  source files, in this document, and in `vps-deployment/scripts/deploy.sh`, and production was
  actually running on it. `index.js` now **exits at boot** if the secret is unset, under 32
  characters, or equal to that default. Do not reintroduce a fallback "to make local dev
  easier" — generate one and put it in `.env`.
- **The backend's main Supabase client uses the service-role key**, not the anon key
  (`index.js`). It runs on a trusted VPS; using the anon key there was what made it impossible
  to revoke anon privileges without breaking our own API. `supabaseService` is now an alias of
  the same client.
- **`scripts/dbHealthCheck.js`** — read-only, exits non-zero on any critical finding, so it can
  be scheduled and alerted on. Run it after any schema or billing change:
  `node --env-file=.env scripts/dbHealthCheck.js`

### SQL to run (written, NOT yet applied)
1. `sql/hardening_01_core_tables.sql` — audit queries, cleanup, uuid conversion + 8 missing FKs,
   CHECK constraints, one-active-session-per-astrologer unique index, 16 indexes.
2. `sql/hardening_02_access_control.sql` — sequenced lockdown of the `anon` role.
Both are sectioned and idempotent. Read the notes before each section; several sections require
a coordinated app change first and say so explicitly.

---

## Subsystem added 2026-08-13: Astrologer recognition badges (Verified / Celebrity / Top Rated)

### W. Admin-assigned badges shown on astrologer cards

- **What**: three mutually-exclusive recognition badges — `verified`, `celebrity`, `top_rated` —
  settable only from `astrowani-admin`'s Astrologers page. There is no vendor-app or
  customer-app write path; astrologers cannot assign this to themselves.
- **DB**: `sql/astrologer_badge_schema.sql` adds `astrologers.badge text` (nullable) + a CHECK
  constraint restricting it to the three values or `NULL`. Idempotent, not yet run against
  production — run it before this feature works end-to-end.
- **Backend**: `astrologers.badge` added to `ASTROLOGER_LIST_COLUMNS` and to `formatAstrologer`'s
  output as `badgeType` (`index.js`) — kept as a distinct field name from the pre-existing
  generic `item.badge` **text label** that `ReusableList.js`'s ribbon renders for unrelated static
  data (the chat-category screens' "Must Try" tag), to avoid the two colliding. Admin routes
  (`adminRoutes.js`): `GET /api/admin/astrologers` now selects `badge`; `PATCH
  /api/admin/astrologers/:id`'s `allowed` list includes `badge`, with a 400 guard rejecting
  anything outside the three values (defense in depth — the DB CHECK constraint is the real
  backstop, this just avoids a raw Postgres error reaching the admin UI).
- **Admin UI** (`Astrologers.jsx`): new "Badge" table column (`AstroBadge` pill, new `.badge.blue`
  CSS class added for "Verified") + a "Badge" `<select>` in the Edit modal + quick
  set/remove `ActionMenu` entries (mirrors the existing Approve/Reject pattern) so an admin
  doesn't have to open the full edit modal just to tag someone.
- **Customer app**: new shared `src/components/AstrologerBadge.js` — renders nothing if
  `badgeType` is falsy; otherwise a small colored pill (icon + label: verified=blue
  check, celebrity=gold star, top_rated=green grade). Two variants: `corner` (absolute-positioned
  over the top-left of a circular avatar — parent needs `position:'relative'`) and `inline`
  (plain pill next to text). Wired into every astrologer-card surface that has an avatar:
  `ReusableList.js` (Chat/Talk/Video section lists), `ExpertsList.js` (category screens),
  `Home.js`'s "Best Astrologers" carousel (`AstroImage` was refactored into an
  `AstroImageWrap` so the badge can sit at a fixed offset relative to it instead of the
  card), and `AstrologerInfo.js`'s profile header (inline variant, next to the name).
  `AnimatedAstrologerMarquee.js` (Home's small avatar-only marquee) was deliberately left
  alone — no room for a legible badge on that scale, and it doesn't show a name/price anyway.
- **Not done**: no vendor-app surface shows the badge (vendor doesn't need to see its own
  recognition badge to do their job); no push/notification when a badge is granted.

---

## Subsystem reworked 2026-08-16: Astro report presentation layer

### X. Reports rebuilt as visual documents (customer app)

- **The problem**: all 13 report/service screens rendered as label/value text inside boxes.
  Three specific failure modes, all visible in production screenshots:
  parallel arrays printed as disconnected lists (dasha), boolean pairs printed as the
  literal words "false"/"false" (matching), and ten-paragraph remedy lists flattening
  every other section off the screen (dosha, Lal Kitab).
- **Design system** — `src/components/astro/AstroUI.js` (primitives) + `AstroBlocks.js`
  (payload-specific blocks). New primitives: `Reveal` (staggered mount animation, wraps
  every `SectionCard`), `RingGauge` (animated `react-native-svg` arc with a counting
  number), `Collapsible`, `NumberedList`, `CompareRow`/`CompareHeader`, `Callout`,
  `PillRow`. `ScoreBar` fills are animated and staggered by an `index` prop.
  **Changing the look of all 13 screens means changing these two files, not the screens.**
- **`ZoomableChart.js`** (new) — the API returns `<svg height="330" width="330">` with
  **no viewBox**, so `SvgXml width="100%"` clipped the right-hand houses. `normalizeSvg()`
  injects `viewBox="0 0 W H"` read off the width/height already present. Charts render
  square + full-bleed (`aspectRatio: 1`, never a magic pixel height) and open full-screen
  with pinch/pan/double-tap via gesture-handler + reanimated. **Any future chart must go
  through this component** — a raw `SvgXml` will be cropped again.
- **Parallel-array shapes**: `normalizePeriods()` in `AstroBlocks.js` zips
  `{mahadasha, mahadasha_order}` and `{dasha_list, dasha_end_dates, dasha_lord_list}` into
  one `[{name, start, end, lord}]`. Dates arrive in two formats
  (`Sat 31 Oct 1998` and `Mon, May 27, 2002, 12:00:00 AM`); `parseDate()` strips the
  leading weekday so `Date.parse` handles both. Timelines open on the period containing
  today and fold earlier/later ones away.
- **Blocks that replaced raw dumps**: `AggregateMatch` (was five repetitions of
  "MANGLIKDOSH SATURN POINTS / Boy false / Girl false"), `LalKitabHoroscope` (12-house
  grid), `LalKitabHouses`, `LalKitabRemedies` (one collapsible per planet),
  `LalKitabDebts`, `KpCusps`, `KpSignificators`, `NameAnalysis`, `MobileAnalysis`,
  `LuckyThings`, `PersonalYear`, `AscendantReport`. The Lo Shu grid is drawn as the
  3×3 magic square (missing cells ARE the reading) inside `NumerologyNumbers`.
  `PlanetTable` moved from a six-column sideways-scrolling table to one card per planet.
- Every block stays **progressive** — it checks for the shape it expects and falls back to
  `GenericKeyVals` otherwise, so an upstream payload change degrades rather than crashes.
- **PDF report 502**: NOT a code bug. `/api/pdf/*` bills from a separate, exhausted credit
  pool at the provider (429 `Insufficient credits`) while every other endpoint answers 200.
  See the `jyotisham_pdf_credit_pool` memory. `jyotishamClient.js` tags it `quotaExhausted`;
  `astroRoutes.js` returns a 503 stating the customer was not charged (they aren't — the
  debit runs only after a successful fetch). `astroApi.js` no longer treats the provider's
  "Insufficient credits" as an insufficient-WALLET-balance error, and no longer surfaces
  axios's bare "Request failed with status code NNN" to a customer.


---

## Subsystem added 2026-08-21: Remedies shop → real commerce (cart, addresses, payments)

### Y. The gemstone/remedy shop became an actual store

- **What it was**: a 2-column catalogue whose only action was "Buy Now" → a bottom-sheet
  form (qty / name / phone / free-text address) whose Place Order **deliberately did
  nothing**. `RemedyShop.js`'s `placeOrder()` never called `POST /api/orders` and never
  touched the wallet; it showed the admin-editable "We're not currently delivering {item}
  to your location" popup. The backend's `POST /api/orders` had **no caller anywhere in
  either app** — `orders` had no live writer at all, `payment_status` was only ever flipped
  by hand from the admin, and there was no cart, no line items, no address book, no
  delivery fee, no stock, no order history and no payment leg.
- **What it is now**: ADD → inline `− qty +` stepper → sticky cart bar → cart with a
  server-computed bill → saved-address book → **Razorpay or wallet** payment → confirmation
  → tracked order in My Orders. Gemstones go live first (see the gate below).

**The three rules this subsystem is built on — do not weaken them:**

1. **The client never computes money.** `POST /api/orders/quote` is the single source of
   truth for every figure the cart and payment screens display; `POST /api/orders/checkout`
   re-derives the identical numbers from `remedy_items` + `app_settings` and ignores
   anything money-shaped in the request body. `CartContext`'s `subtotalEstimate` is a cached
   running tally for instant paint only — it is labelled "subtotal", never "to pay", and is
   never sent anywhere.
2. **Every payment is replay-safe.** `POST /api/orders/verify-payment` is a structural clone
   of `POST /api/wallet/verify-payment`: HMAC verify → atomic claim scoped
   `.eq('razorpay_order_id').eq('customer_id').eq('status','pending_payment')` → 0 rows
   claimed means somebody already handled it, which returns **200 `{alreadyProcessed:true}`,
   not an error**. Wallet payments key `adjustCustomerWallet` on `order:<orderId>`; refunds
   on `order-refund:<orderId>`. Both Razorpay ids carry partial UNIQUE indexes.
3. **Ordering is gated per category, server-side.** `app_settings`
   `remedy_orders_enabled_<type>` (gemstone `true`, the rest `false`) is read by the app via
   `hooks/useRemedyOrderingGate.js` (direct Supabase, public-read, same pattern as
   `applySessionReplaySetting`) **and re-checked in `/api/orders/checkout`, which 403s a
   blocked category** — so a stale installed build cannot slip an order through. The gate
   **fails CLOSED**: a missing key or a failed read means "not delivering yet". A blocked
   category still shows a normal ADD button; tapping it is how the customer learns why.

### Backend — `astrowani-backend/src/orderRoutes.js` (new module)

Registered via `require('./src/orderRoutes')(app)` alongside the other ten route modules.
Owns `/api/addresses/*` and **all** of `/api/orders/*`. The old `POST /api/orders` and
`GET /api/orders/mine` were **deleted from `index.js`** (a comment marks the spot) — the POST
had no caller, and the GET fed a legacy `user_<timestamp>` id straight into `.eq()` on a uuid
column, an unconditional 500 for anyone holding a pre-UUID token. Everything now uses the
shared `resolveCustomer` pattern from `astroRoutes.js`.

| Route | Notes |
|---|---|
| `GET/POST/PUT/DELETE /api/addresses` | Setting a default clears the old one first (a real UNIQUE index enforces one per customer). Deleting the default promotes the newest survivor. A concurrent double-save that collides on that index is retried as non-default rather than 500ing. |
| `POST /api/orders/quote` | Reprices from the DB, **enforces `is_active`** (the old route didn't — a deactivated item was still orderable by id), merges duplicate lines, clamps to 20 lines × 10 units, returns `blockedTypes` + `outOfStock` + `canCheckout`. Never leaks `stock` counts to the client, only an `inStock` boolean. |
| `POST /api/orders/checkout` | Order is deliberate: address → reprice → gate (403) → stock (409) → create order `pending_payment` → **only then** move money. Wallet insufficiency returns **402 with the exact `shortfall`**. `'cod'` returns 400 `COD_COMING_SOON`. |
| `POST /api/orders/verify-payment` | See rule 2. Also where stock is decremented — never at add-to-cart, so an abandoned checkout holds no inventory. |
| `GET /api/orders/mine` | Joins `order_items` + `order_status_events`; **synthesises a single `items[]` line from the legacy inline columns** for rows that predate the child table, so the app has one render path. Hides `pending_payment`. |
| `POST /api/orders/:id/cancel` | Only while `placed`/`confirmed`, claimed atomically. Wallet-paid refunds instantly and reverses the `admin_wallet` credit; Razorpay-paid is flagged `refund_pending` for manual processing (there is no gateway refund call in this codebase). |

Wallet-paid orders credit `admin_wallet` non-blockingly after the customer is charged, exactly
as `astroRoutes.js` does. Razorpay-paid orders deliberately do **not** touch `admin_wallet` —
that money never enters our ledger; the `razorpay_payment_id` on the order is the record.

### DB — `sql/remedy_commerce_schema.sql` (idempotent, **NOT yet applied**)

New: `customer_addresses` (pincode CHECK, partial unique index for one default per customer),
`order_items` (all columns snapshots), `order_status_events` (the audit trail + the app's
tracking timeline — `orders.status` is a single mutable column with no history). Additive on
`orders`: `subtotal / delivery_fee / handling_fee / grand_total / payment_method /
razorpay_order_id / razorpay_payment_id / paid_at / address_id / delivery_address jsonb /
cancelled_at`. Additive on `remedy_items`: `mrp / stock / unit_label`.

- **`orders` is live for `item_type='life_report'`** — those rows are read by
  `MyOrdersScreen` and delivered via admin `report_content`. The inline single-item columns
  therefore **stay and keep being written**: cart orders fill them with a *summary*
  (`item_title` = "X + 2 more items", `total` = grand total, `item_id` = null) purely so
  pre-existing readers keep showing something sensible. `order_items` is the real record.
- `remedy_orders_enabled_life_report` is seeded **false** on purpose: a life report is a
  digital good needing no delivery address, and it was never actually buyable before this
  either. Forcing it through an address-required cart would be wrong.
- The status/payment CHECKs are added only if no existing row violates them, otherwise a
  `RAISE NOTICE` names the count — an admin has been able to PATCH `status` to any string.
  The `address_id` FK is `NOT VALID` so legacy rows can't fail the migration.
- Deliberately **not** added to `supabase_realtime`: `orders` has been in the publication
  since 2026-06-21 with no consumer at all, and three more unread tables would only widen
  the WAL. The app polls `/api/orders/mine` on focus.

### Customer app

New: `context/CartContext.js` (AsyncStorage-persisted, **keyed to `customerId` so a
different account never inherits a cart**), `components/shop/{ProductCard,QtyStepper,CartBar,
BillSummary}.js`, `api/OrdersApi.js`, `hooks/useRemedyOrderingGate.js`, and
`screens/Remedies/{ProductDetail,CartScreen,AddressList,AddressForm,PaymentScreen,
OrderSuccess}.js`. All new screens live in the **root** stack next to `RemedyShop`, so
`navigate('Cart')` resolves from the Remedies tab, the drawer and the Home row alike.

Cart storage is **client-side on purpose** — no `carts` table. Cross-device sync isn't worth
the schema, and it is safe precisely because of rule 1: a stale cart price is corrected by the
quote before any money moves.

Rewritten: `RemedyShop.js` (grid of `ProductCard`, Place Order modal **deleted**),
`MyOrdersScreen.js` (multi-item + fee breakdown + tracking timeline + cancel; the
`life_report` branch untouched), `Navigation.js` (`CartProvider` outside
`NavigationContainer` so the cart survives navigation resets; `CartHeaderButton` with a live
badge), `PushNotification.js` (`order_update` deep-links to My Orders alongside
`report_delivered`). ~79 new i18n keys in **both** EN and HI.

### Admin

`pages/Remedies.jsx` gains an **"Accepting orders"** card (the four per-category toggles plus
delivery / free-delivery-above / handling fees — all through the existing generic
`/api/admin/settings` PATCH, no new backend routes) and `mrp` / `stock` / `unit_label` inputs
and columns. Blank is not 0 for mrp and stock, so `numOrNull` maps blank/missing/non-numeric
to null. `pages/Orders.jsx` is now a fulfilment view: search + status/type filters, an
"include abandoned checkouts" toggle, expandable line items, fee breakdown, structured
address with the pincode called out, Razorpay ids, and the status history. Status changes
confirm first and say when a push will be sent. `adminRoutes.js` validates status against
`ADMIN_SETTABLE_STATUSES`, writes an `order_status_events` row on every change, and pushes on
shipped / out-for-delivery / delivered / cancelled.

### Outstanding — blocks real orders, not the code

1. **All three SQL files are APPLIED and VERIFIED (2026-08-21)** —
   `remedy_commerce_schema.sql`, `remedy_commerce_client_request_id.sql`, and
   `hardening_07_admin_wallet_where_clause.sql`. Final run against the live database:
   **89 assertions, 0 failures** across the core wallet-checkout flow (57), stock /
   constraints / platform revenue / concurrency (20), and checkout de-duplication (12).
   The test account finished on its exact starting balance with zero live or unpaid orders
   left behind.
2. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in the VPS process env if not already
   present — `/api/orders/checkout` 503s the online-payment path without them (the wallet
   path works regardless).
3. Fill in `mrp` / `unit_label` / `stock` on the gemstone items from the admin, or the cards
   render without a discount badge or unit line (they degrade cleanly, they don't break).

### Verified against the live database (2026-08-21)

Tested by mounting `src/orderRoutes.js` on a bare Express app rather than booting
`index.js` — **never boot the full backend just to test routes**, it starts sessionManager's
billing worker against production (see the `local-backend-bills-production` memory). All
rupees moved during testing were reversed; the seeded "Test User" (`550e8400-…`) ended on
its exact starting balance.

Confirmed working: address validation + CRUD, quote arithmetic, duplicate-line merging and
the 10-unit clamp, `is_active` enforcement, the per-category gate (403, no money moved),
COD refusal, the 402 + exact `shortfall` with the unpayable order **voided rather than left
pending**, the wallet debit (exactly ONE ledger row, keyed `order:<id>`), the address
snapshot, the legacy-column summary that keeps old readers working, order history including
the synthetic single line for pre-migration rows, stock decrement/restore, and
cancel + refund (a second cancel 409s and does **not** double-refund).

### TWO REAL PROBLEMS THIS TESTING FOUND

**1. `adjust_admin_wallet` has never once succeeded — platform revenue was never recorded.**
Not caused by this feature; found by it. `sql/hardening_04_atomic_admin_wallet.sql` reasoned
that "admin_wallet is a singleton table … so no id/WHERE clause is needed" and wrote a
WHERE-less `UPDATE`. This database rejects those ("UPDATE requires a WHERE clause", a
pg_safeupdate-style guard) **including inside SECURITY DEFINER functions**. Both call sites
correctly wrap it in a log-only try/catch — the customer has already been charged by then, so
a ledger failure must not fail their purchase — so it failed **silently**. Evidence:
`admin_wallet_transactions` had **zero rows** and `admin_wallet.balance` was still 0 despite
the row existing since 2026-07-08. **`astroRoutes.js`'s paid-report revenue is affected the
same way.** Customer and vendor wallets are fine — those functions were always keyed by id.
Fix: **`sql/hardening_07_admin_wallet_where_clause.sql`** (adds `WHERE id =` plus a
`FOR UPDATE` row lock, which is what actually makes it atomic). **Applied and verified** —
the function now credits on checkout and reverses on cancel, and `admin_wallet_transactions`
has written its first-ever rows. **Paid astro reports now record revenue too.** Not
backfilled — the history is reconstructible from `wallet_transactions` but doing it
automatically risks double-counting against any manual bookkeeping.

**2. A retried or raced checkout used to charge twice.** The wallet debit is keyed on the
order id, which guarantees one order can't be charged twice — but every checkout call mints a
**new** order id, so the key never deduped two *calls*. Measured: two simultaneous identical
wallet checkouts produced two orders and charged ₹2000 twice. (An earlier note in this file
claiming the idempotency key covered this was wrong.) Fixed with a client-supplied
per-attempt token, the same approach Stripe and Razorpay expose:
`orders.client_request_id` + a `(customer_id, client_request_id)` partial unique index
(**`sql/remedy_commerce_client_request_id.sql`**). `PaymentScreen` mints one per mount and
holds it in a ref, so retries of one attempt dedupe while a deliberate second purchase (new
mount → new token) still works. The endpoint checks for a duplicate first *and* handles
losing the insert race, returning the winner's order — so it is "cannot double-charge", not
"usually deduped". Voided attempts are excluded from the duplicate check, so topping up and
retrying after a 402 still works. **Deploy order does not matter**: without the column,
checkout keeps working un-deduped and logs one loud warning, same posture as `src/wallet.js`
(both the degraded and the guarded behaviour were verified).

Verified with the column in place: a sequentially retried checkout and a genuinely
simultaneous one both collapse to ONE order charged ONCE, a different token is still a real
second purchase, and omitting the token still works. **Note the guard latches per process** —
`dedupeAvailable` is set false on first sighting of a missing column, so a backend that
booted before the migration keeps the guard OFF until it is restarted. Restart the VPS
process after applying that file.

### TWO MORE FOUND BY BROWSER-VERIFYING THE ADMIN PAGES

Both were bugs in the new admin UI itself, found by driving it in a browser against a
harness that mounts `adminRoutes` + `orderRoutes` without booting `index.js`. Fixed in
`adminRoutes.js` **server-side as well as in the UI**, because the UI is never the
enforcement point:

**3. A cancelled, already-REFUNDED order could be set back to "placed."** The status
dropdown rendered for every non-`pending_payment` row, so an admin could revive a refunded
order into the fulfilment queue — i.e. ship goods the customer had their money back for.
Now: cancelled is terminal and renders as a read-only badge, and `PATCH
/api/admin/orders/:id` 409s `ORDER_CANCELLED` on any attempt to revive one, plus
`ALREADY_REFUNDED` on any attempt to flip a refunded payment_status back to paid. Verified:
both 409, the row is unchanged, and a legitimate `packed → shipped` still returns 200.

**4. An admin choosing "cancelled" did NOT refund the customer.** Only the customer-facing
`POST /api/orders/:id/cancel` ever refunded; the admin dropdown just set the column, leaving
the customer out of pocket with no trace. The admin PATCH now performs the refund for a paid
wallet order (and flags `refund_pending` for a Razorpay one, matching the customer path).
**It reuses the IDENTICAL idempotency key `order-refund:<id>`**, so whichever path runs first
wins and the other is a no-op — a customer and an admin cancelling the same order cannot both
refund it. A refund that fails now returns 500 `REFUND_FAILED` with explicit "refund manually
before telling the customer" wording rather than being logged and swallowed: an admin who
believes they refunded but didn't is the situation that produces an angry customer. Verified:
₹4100 refunded on admin-cancel, ₹0 on a repeat, balance back to baseline.

Also verified in the browser: the per-category toggles read the live `app_settings` (gemstone
on, the rest off), the fee inputs, the new Unit / MRP / Stock columns rendering "Unlimited"
and "—" correctly, and the full item write path — saving `mrp` / `unit_label` / `stock` from
the modal persists and makes `/api/remedies` serve the fields the product card needs (a
₹2000 item with MRP ₹2500 yields the "20% OFF" badge). The Orders detail panel renders line
items, the fee breakdown, the structured address with pincode, and the status history with
correct attribution (`by system` for automated steps, the admin's email for manual ones).

### Dead-code purge that followed (2026-08-21)

Eight files deleted, ~50 KB of source, once the cart flow superseded them. The trigger was
`screens/Home/GemStoneBuy.tsx`: it held a **hardcoded LIVE Razorpay key**, called
`RazorpayCheckout.open()` with a hardcoded `amount: 20` (paise — ₹0.20), prefilled dummy
customer details, and treated success as a client-side `Alert` with **no server-side
verification at all**. Deleted rather than just de-keyed, because a dead screen containing a
payment flow is the kind of thing that gets copy-pasted.

Gone, with their `Navigation.js` imports and `<Stack.Screen>` registrations:
`screens/Home/GemStoneBuy.tsx` (registered as route `GemstoneDetails`),
`screens/Home/VipPuja.jsx` (`SpecificPuja`), `screens/Remedies/GemstoneList.js`,
`screens/Remedies/GemstoneDetails.js` (entirely commented out),
`screens/Remedies/PujaDetails.js`, `screens/Remedies/BookPujaScreen.js`,
`screens/Remedies/HomeRemedies.js` (never imported), and the 0-byte
`screens/drawerScreens/WalletScreen.js`. A comment at the `RemedyShop` registration records
where they went.

**Why deletion was provably safe** — they formed a *closed* unreachable subgraph: the only
navigations into any of them came from each other (`GemstoneList → GemstoneDetails`,
`PujaDetails → BookPujaScreen`) or from already-commented-out lines, with no live entry
point. Static greps alone are not sufficient proof in this app though, because it has two
**admin-driven dynamic** navigation paths — `PlacementBanner.js` passes a banner's
`action_value` straight to `navigate()` when `action_type === 'screen'`, and
`PushNotification.js` navigates to `data.screen` from an FCM payload. Both were checked
against production: all 7 banners are `action_type: 'none'`, and no notification has ever
carried a `screen`. **Check those two tables before deleting any route in future** — a grep
of `src/` will not reveal an admin-configured target.

Verified after: the app bundles clean (7,341,965 bytes, ~29 KB smaller) and `GemstoneList`'s
two real `no-dupe-keys` eslint errors went with it.

**The live Razorpay key is still in git history.** Deleting the file does not un-expose it —
**rotate that key in the Razorpay dashboard.** History was deliberately NOT rewritten.

### Known gap, still deliberately out of scope

There is **no Razorpay webhook**. If a customer's payment succeeds but the app dies before
`verify-payment` lands, the order stays `pending_payment` — money taken, order invisible in
their history. The recovery path exists (admin Orders → "Include abandoned checkouts" →
"Mark paid") but it is manual. A `payment.captured` webhook that runs the same atomic claim
is the proper fix and is the first thing to add if this sees real volume. Note the Razorpay
leg itself is the one part of this flow **not** yet exercised against the gateway — it needs
test keys in the backend env.
