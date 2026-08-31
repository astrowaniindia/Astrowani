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

> **Verified 2026-08-23 — four items previously listed here as open are FIXED.** They were
> corrected in the 2026-08-07/08 hardening pass and the 2026-08-13/14 performance pass, but
> this file was never updated, so it kept reporting them as live problems. That cost real
> debugging time: a crash investigation was misdirected into blaming the "Realtime amplifier"
> that no longer exists. Each correction below was re-verified against the code, not against
> another document.
>
> - **Realtime amplifier — GONE.** `Home.js`, `Chat.js`, `Video.js` and `Call.js` all use
>   `hooks/useAstrologerListSync.js`: ONE backend-side subscription
>   (`astrowani-backend/src/astrologerFanout.js`) rebroadcast over the existing Socket.io
>   connection. No per-client unfiltered subscription on `astrologers` remains anywhere in the
>   customer app. `src/tableFanout.js` does the same for `blogs`, `live_sessions` and
>   `remedy_items`. The rule still stands: never add a new unfiltered table-wide subscription.
> - **Wallet mutations are ATOMIC.** `astrowani-backend/src/wallet.js` calls Postgres RPCs
>   (`adjust_customer_wallet`, `adjust_vendor_wallet`, `transfer_customer_to_vendor`,
>   `adjust_admin_wallet`) — balance change and ledger insert in one function. Defined in
>   `sql/hardening_03_atomic_wallet.sql`, `_04`, `_07`. Not a read-modify-write.
> - **`process_session_billing` IS version-controlled**, at
>   `astrowani-backend/sql/process_session_billing.sql`. Not dashboard-only, not unrecoverable.
> - **The core-table indexes ARE applied to production.** `hardening_01_core_tables.sql`'s set
>   was confirmed present by querying `pg_indexes`. The billing poll, busy checks and
>   stale-request sweep were never doing full table scans. See
>   `MD files/performance-audit-2026-08-13.md`, which also records two indexes that turned out
>   to be duplicates and were dropped.
>
> **When this file and `MD files/` disagree, `MD files/` is newer.** Those per-pass reports are
> written at the end of each audit; this summary is not always updated alongside them. Verify
> against the code before acting on any "open issue" below.

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
- **Zombie-session trap**: `is_active = true` with `next_billing_at = NULL` is invisible to
  `sessionManager.checkActiveSessions` (which filters `next_billing_at <= now`) but still counts
  as busy in `busyStatus.js` — so the astrologer is locked out of all work, silently and
  indefinitely. Two such rows had been live since 2026-06-18. Any code that sets `is_active`
  must set `next_billing_at` in the same write.
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

---

## Analytics audit + fixes 2026-08-21 — READ BEFORE TOUCHING THE ANALYTICS PAGE

Full audit report: https://claude.ai/code/artifact/ade3a2a5-06a2-4354-8293-115443e5da11

### Z. What was wrong, and the rules that came out of it

The dashboard measured volume well (screen views, revenue, sessions) but could not answer
*why* anything happened, and four correctness bugs made numbers wrong in ways that looked
plausible. All fixed; the rules below are the durable part.

**1. A query must never reference an event name the apps don't send.** The Remedies funnel
asked for `remedy_buy_now_clicked` / `remedy_place_order_clicked` / `remedy_order_placed` —
**zero occurrences in either app**. The cart rewrite (subsystem Y) replaced them and the query
was never updated, so the card rendered `0 -> 0 -> 0` permanently and read as "nobody is
buying." Now driven by the events the cart actually fires (`add_to_cart`, `cart_viewed`,
`checkout_started`, `payment_method_selected`, `order_placed`, plus `order_payment_failed` and
`remedy_blocked_category_tapped` as side stats). **When you rename or remove a client event,
grep `postHogRoutes.js` in the same commit.**

**2. The environment tag is a BUILD constant, not an awaited network read.**
`currentEnvironment` used to start at `'test'` and wait on a Supabase `app_settings` fetch,
while `PostHogProvider` captured its first `$screen` on mount — hundreds of ms earlier. So the
first screen view of every launch was tagged `test` and permanently invisible, and `'test'` was
also the *failure* default, meaning an offline cold start discarded the user's whole session
(preferentially dropping users on bad connections and single-screen bounces — exactly what
retention analysis needs). Now `BUILD_ENVIRONMENT = __DEV__ ? 'test' : 'production'`, resolved
synchronously at module load; the remote override still applies but is cached in AsyncStorage
and a failed read **keeps** the build default. Also registered via `posthog.register()` as
**super properties**, so PostHog's own lifecycle events (`Application Opened` /
`Backgrounded` / `Installed`) carry `app` + `environment` too — 873 events had a null
environment and were invisible to every query. Do not reintroduce a network-gated default.

**3. Any Supabase `.select()` that gets summed must be paged.** PostgREST caps at 1000 rows
and does **not** error — it returns 1000 and the total silently stops growing. Use
`src/pagedSelect.js` (`pagedSelect` + `chunkIds`). All five revenue/session routes now page,
return `truncated`, and the admin renders a warning when it is set. `wallet_transactions` gets
~4.2 rows per session (one per billed minute), so `/revenue-by-type` would have started
truncating at ~240 sessions in the window. `chunkIds` also exists because a single
`.in('id', ...)` with ~1000 UUIDs builds a ~37 KB query string and 414s before any row cap.
Aggregating in Postgres would be better still, but the service-role key cannot run DDL from
here (see `local-backend-bills-production` memory).

**4. A fixed-window metric must not sit inside a range-filtered query.** DAU/WAU/MAU were
computed as `now() - INTERVAL n DAY` *inside* a query already bounded by the page's date
range, so with the default "This Week" the "MAU" card showed a 7-day number and all three
converged for short ranges. Now a separate query with its own fixed 30-day bound. The summary
also had **no `properties.app` filter**, blending customers with astrologers (who keep the
vendor app open all day) into the headline "Unique Users"; it is app-scoped now and the labels
say so.

**5. Session minutes exclude implausible durations, and say that they did.** Measured: **two**
rows held 144,409 of 145,553 total minutes — 99.2% from 1.8% of rows. Both are the zombie
sessions from the data-layer audit (`is_active = true` with `next_billing_at = NULL`), whose
`ended_at` was stamped ~50 days after `started_at` at cleanup. Real average is ~10 min.
Durations over `MAX_PLAUSIBLE_SESSION_MINUTES` (12 h) are excluded from minutes, still counted
as sessions, and surfaced in an admin warning — excluded rather than clamped, because a
multi-day session is a data-quality signal worth seeing, not something to round down.

### New endpoints

| Route | Source | Answers |
|---|---|---|
| `/api/admin/analytics/request-outcomes` | Postgres | Outcome of every request that reached an astrologer (accepted/rejected/missed/cancelled) per type. **Needs no instrumentation — `call_requests.status` / `chat_requests.status` had this all along**, so it works retroactively. |
| `/api/admin/analytics/astrologer-performance` | Postgres | Per-astrologer requests, accept rate, sessions, minutes, revenue, unique + repeat customers, rating. |
| `/api/admin/analytics/auth-failures` | PostHog | `signup_failed` / `login_failed` grouped by their `reason` property (was captured, never read). |
| `/api/admin/analytics/blocked-attempts` | PostHog | New `consult_blocked` event — attempts stopped *before* a request row existed. |

### New client events

- **`consult_blocked`** `{reason, intent, ...}` — reasons `low_balance` (with
  `min_required`/`balance`/`shortfall`), `astrologer_busy`, `service_off`,
  `astrologer_offline`. Captured **centrally in `showStatusPopup()`** (`StatusPopup.js`) via
  `BLOCK_REASON_BY_VARIANT`, which covers all ~21 busy/insufficient call sites in one place;
  the `service_off` / `astrologer_offline` paths use a plain `Alert` instead of StatusPopup so
  they are instrumented explicitly in `ReusableList.js`, `ExpertsList.js` and
  `AstrologerInfo.js`. `intent` is threaded through `showInsufficientBalanceAlert({intent})` at
  all 8 balance-check sites. **These attempts leave NO trace in Postgres** — the checks run
  before any request row is written — so this event is the only record that a customer wanted
  to pay and couldn't.
- **Vendor supply side** (the app had only 4 events, so half the marketplace was unmeasured):
  `request_accepted` / `request_rejected` / `request_accept_failed` with `secondsToDecide`,
  instrumented in **`utils/incomingRequestActions.js`** (not HomeScreen) because the
  notification action buttons reach it with the app backgrounded or killed; `enqueuePopup`
  stamps `receivedAt` so the decision latency can be derived. `availability_toggled`
  `{field, enabled}` in `updateToggleStatus` (one choke point for the master online switch
  *and* all three service toggles) and `go_live_toggled`.

### Other changes

- Retention returns **D1/D7/D30 plus a per-cohort-day curve**, not one blended average — the
  level was visible but never the trend, which is the only thing retention is used for.
  Cohorts too young to have reached a mark are excluded from that mark's blend.
- Funnels now report their `basis`: call/chat counts **attempts**, remedies counts **distinct
  persons**. Both are labelled in the UI so the percentages are never read as comparable.
- `sentryRoutes.js` `fetchIssueCount` follows the `Link`-header cursor instead of counting one
  100-item page (which saturated at exactly 100 and read as "stable"); returns `atLeast` so
  the UI can show a floor.

### Verified 2026-08-21

Backend tested by mounting `adminRoutes` + `postHogRoutes` + `sentryRoutes` on a bare Express
app — **never boot `index.js` to test routes**, it starts sessionManager's billing worker
against production (`local-backend-bills-production` memory). All 13 analytics endpoints
returned 200 with valid shapes. Every new HogQL query was additionally run against
`environment='test'` (where the real pre-launch data lives) to prove it matches real events,
not just that it parses: the rebuilt remedies funnel returns `[1,1,1,1,1]` (one real person
through all five stages — the old query returned zeros), and `auth-failures` surfaces real
reasons including `account_exists: 4` and `OTP_THROTTLED: 2`.

Admin page browser-verified end to end (Vite + a gitignored `.env.local` pointing at the local
harness, both removed afterwards): every new card renders, the excluded-sessions and truncation
warnings appear correctly, the wide astrologer table scrolls inside its own `.table-wrap`
without the page scrolling sideways, and `npm run build` succeeds. Both RN apps' changed files
lint with no new errors (the 14 pre-existing errors are `react-hooks/exhaustive-deps` and
duplicate StyleSheet keys in `Home.js`, none in the edited lines).

**What the real data immediately showed** (168 requests, Jun–Aug): a **39.3% accept rate**,
and the dominant cause is **`missed: 48` versus `rejected: 7`** — astrologers are not
declining work, they are not answering. Chat is worst at 36.2%. That distinction was
invisible before and points at notification reliability / availability discipline rather than
pricing or demand.

### Still outstanding (not code)

1. `analytics_environment` is still `'test'` in `app_settings`, so every PostHog-backed card
   reads zero by design. Flip it in the admin's Analytics page on launch day.
2. `SENTRY_AUTH_TOKEN` is unset, so the App Health card 503s with an explanatory message.
3. Historical events with a null `environment` (873 `$screen`) stay invisible — unavoidable,
   they predate the tag and cannot be attributed to test or production after the fact.

---

## Bug fixed 2026-08-22: vendor withdrawals were down — duplicate wallet function overload

### AA. "Withdrawal request failed" — root cause and the rule it produced

**Symptom**: the vendor app showed "Withdrawal request failed" on every withdrawal attempt.
That string is the generic 500 catch-all in `POST /vendor/wallet/withdraw`, so it carried no
diagnostic information at all.

**Root cause**: the database held **two** copies of `adjust_vendor_wallet`.
`sql/hardening_03_atomic_wallet.sql` created the 8-parameter version;
`sql/hardening_06_vendor_txn_counterparty.sql` then added a 9th parameter (`p_customer_id`)
using `CREATE OR REPLACE FUNCTION`.

> **THE RULE: in PostgreSQL, `CREATE OR REPLACE FUNCTION` can only replace a function with an
> IDENTICAL argument list. Change the parameter count and you create a second, OVERLOADED
> function — the old one stays.** `hardening_06`'s header comment asserted the opposite
> ("a new trailing DEFAULT NULL parameter is backward compatible"). That assertion is wrong and
> was the bug. **Any future change to a money function's parameter list must `DROP` the old
> signature explicitly, in the same file.**

Node's callers pass **8 named** arguments, which match both candidates (the 9th has a default),
so PostgREST could not resolve the call and returned `PGRST203: Could not choose the best
candidate function between …`.

**Why session billing kept working** — and why this went unnoticed:
`transfer_customer_to_vendor` calls `adjust_vendor_wallet` with **9 positional** arguments,
which can only match the 9-arg version. Unambiguous. Only the API-level 8-named-argument calls
broke. Confirmed against production: exactly one withdrawal ever succeeded (₹10 on 2026-07-19,
before `hardening_06` was applied).

**Everything that was broken** — all three callers of `wallet.adjustVendorWallet`:
1. `POST /vendor/wallet/withdraw` (index.js) — the reported symptom.
2. `POST /api/admin/astrologers/:id/wallet` (adminRoutes.js) — admin adjusting a vendor balance.
3. Admin **rejecting** a withdrawal (adminRoutes.js) — so held money could not be returned
   through the normal path.

Customer wallets, `admin_wallet` and session billing were unaffected — verified by probing all
four functions; only `adjust_vendor_wallet` was ambiguous.

**No data was corrupted.** The endpoint creates the `withdrawal_requests` row *before* moving
money and its own catch deletes that row if the hold fails, so failed attempts left no orphan
rows and no lost balance. `withdrawal_requests` held exactly one (legitimate, paid) row.

### The fix

1. **`sql/hardening_08_drop_duplicate_vendor_wallet_overload.sql`** — drops the obsolete 8-arg
   overload by explicit argument-type list, then **asserts** exactly one overload remains and
   that it takes 9 arguments, raising an exception rather than leaving a money path quietly
   broken. Ends with a query listing any duplicated money-function name (expect zero rows) —
   run that after any future function migration. Idempotent.
2. **`src/wallet.js`** — new `isAmbiguousFn()` / `WalletFunctionAmbiguous` / `throwIfAmbiguous()`,
   wired into all four wrappers (`adjustCustomerWallet`, `adjustVendorWallet`,
   `transferCustomerToVendor`, `adjustAdminWallet`).
   - **PGRST203 deliberately does NOT take the legacy fallback path.** Falling back would
     abandon the atomicity guarantee these functions exist to provide, on a money write, in
     exactly the situation (two overloads) that signals a half-finished migration. It throws a
     typed, self-diagnosing error naming the fix file instead.
   - Logs on **every** occurrence, not once like `warnFallback` — a fully-blocked money path
     should keep shouting until someone acts.
3. **`index.js`** — the withdrawal endpoint answers **503** with "Withdrawals are temporarily
   unavailable… your balance is unchanged" for `WalletFunctionAmbiguous`, instead of a 500
   "Withdrawal request failed" that reads as the astrologer's fault and invites them to retry a
   call that cannot succeed.

### Verified 2026-08-22 — migration APPLIED, all paths confirmed working

Tested in two stages, before and after the migration.

**Before** (guard behaviour against the actually-broken schema):
`wallet.adjustVendorWallet(..., 0, ...)` — amount 0, cannot move money — threw
`WalletFunctionAmbiguous` with `code: WALLET_FN_AMBIGUOUS` and logged the fatal diagnostic.

**After** `hardening_08` was applied to production:
- All four money functions probed with `p_amount: 0` answer `ZERO_AMOUNT` /
  `INVALID_AMOUNT` — i.e. each resolves to exactly one function. No ambiguity remains.
- Withdrawal path, end to end, 10/10 assertions: request row created, `adjustVendorWallet`
  succeeds, balance debited by exactly the amount, `today_earnings`/`total_earnings`
  **unchanged** (`countEarnings:false` works), exactly ONE ledger row written, and a repeat
  call with the same idempotency key does **not** double-debit.
- Admin vendor-wallet adjust (`POST /api/admin/astrologers/:id/wallet`) returns **200** where
  it previously 500'd, 4/4 assertions.

Every rupee moved was reversed and every synthetic row deleted: the test account finished on
its exact starting balance (₹5663), `withdrawal_requests` back to its one real row, zero
leftover ledger rows. Tested by mounting `adminRoutes` on a bare Express app and calling
`wallet.js` directly — **`index.js` was deliberately never booted**, since that starts
sessionManager's billing worker *and* `checkEarningsResets()` (which would zero
`today_earnings` across all astrologers) against the live database.

`node --check` clean on both changed files.

### Known adjacent gap (NOT fixed, deliberately out of scope)

`wallet.adjustVendorWallet` still never passes `p_customer_id`, so the counterparty column that
`hardening_06` added is only populated via `transfer_customer_to_vendor`. Profile gifting — the
exact case that file was written for — still writes a vendor ledger row with no customer
reference. Completing that means adding a `customerId` option to `adjustVendorWallet` and
threading it from the gift path. Left out to keep this money-path diff minimal and reviewable.

---

## Changes 2026-08-22: referral ₹50 + Play Store link, and "Get" on astro service names

### AB. Referral reward ₹25 → ₹50, and the missing Play Store link

**The amount lives in the DB, not in code.** `referrals.reward_amount` is what actually gets
credited (read off the row in `sessionManager.js` when the referred friend completes their first
session). `sql/referral_reward_50.sql` sets that column's DEFAULT to 50 and updates
still-`pending` rows — same policy as the `referral_reward_25.sql` it reverses: a pending
referral hasn't been honoured yet so it gets the new rate, while already-`rewarded` rows are
left alone so the ledger stays an accurate record of what was paid.

`index.js` now has a named `REFERRAL_REWARD_AMOUNT = 50` constant instead of a magic `25`
inline in the `/api/customer/referral-info` response. **That constant is DISPLAY ONLY** — it
feeds "Get ₹50 per friend" in the app. It is not what gets credited. If it and the DB default
ever disagree, the app advertises one figure and pays another, so they are cross-referenced in
comments in both files.

Copy updated to ₹50 in `insufficientBalanceAlert.js` (message + `extraText`),
`ReferralPromptHost.js` (the pre-fetch fallback `useState`), and the doc comments in
`StatusPopup.js` / `useChatRequest.js`. The `refer.*` i18n strings already interpolated
`{{amount}}`, so no translation changes were needed. **Note `StatusPopup.js`'s "Pay ₹25" doc
comment is a GIFT example, not the referral — deliberately left at ₹25.**

**The Play Store link was only missing from one of three share paths.** `ReferAndEarnScreen`
and `ReferralPromptHost` already included it; the drawer's **"Share app"**
(`CustomDrawerContent.handleShareApp`) sent "Check out this awesome astrology app!" with no way
to act on it. Fixed, and all three now import a single
`PLAY_STORE_URL` from `src/config/api.js` rather than each holding their own copy of the URL —
one edit if the package name ever changes. It must match `applicationId` in
`android/app/build.gradle` (`com.astrowanicustomer`).

### AC. "Get" prefixed to astro service names

Card titles read "Get Kundli Report" instead of "Kundli Report" — an action, not a noun on a
card. The buttons *inside* each report screen (`astro.getKundliReport` etc.) already read this
way; this brings the titles in line.

**Done in SQL, not code**, via `sql/astro_services_get_prefix.sql`.
`astro_services.name` is the single source of truth for the English label —
`astroServiceLabel()` returns `service.name` verbatim for any non-Hindi language — and it is
admin-editable from the Astro Services page. Prefixing at render time would fight the admin:
renaming a service to "Get Kundli Report" there would then display "Get Get Kundli Report". The
migration is idempotent (`WHERE name NOT LIKE 'Get %'`), so a newly-added service can be
prefixed by re-running it.

`name_hi` is empty for all ten rows, so Hindi falls through to the bundled
`astroService.<key>` translations in `LanguageContext.js`, which were updated alongside.
**Hindi puts the verb LAST** — "कुंडली रिपोर्ट पाएं", not a "Get" prefix — matching the
phrasing already used by `refer.getPerFriend`. An admin who later fills in `name_hi` overrides
this and should include the verb themselves.

**One knock-on fix**: `astro.confirmPurchaseMsg` embedded the service name mid-sentence
("…debited from your wallet for Get Kundli Report."). Restructured in both languages so the
name sits after a separator — in Hindi this was not merely awkward but ungrammatical, since
"कुंडली रिपोर्ट पाएं के लिए" doesn't parse.

### SQL to run for these two (Supabase SQL editor)

1. `sql/referral_reward_50.sql`
2. `sql/astro_services_get_prefix.sql`

Both are idempotent and both `RAISE NOTICE` what they changed, so running them confirms the
result. Nothing else is required — the app changes are pure JS and ship over OTA.

### Verified 2026-08-22

`node --check` clean on `index.js`. Changed customer-app files lint with **no new errors**
(the one reported, `scaleAnim` exhaustive-deps in `ReferralPromptHost.js:62`, is pre-existing —
the diff for that file only touches the `useState` default and the `PLAY_STORE_URL` import).
All **922** i18n keys confirmed present in **both** English and Hindi after the edits, with all
10 `astroService.*` keys in both. Every hardcoded `play.google.com` literal is gone from `src/`
outside `config/api.js`, and no referral-₹25 copy remains.

**Not yet verified on-device** — the two SQL files had not been applied at the time of writing,
so the "Get …" titles and the ₹50 figure will not appear until they are run.

---

## Change 2026-08-22: profile fields directly editable (customer app)

### AD. Removed the per-field "tap edit first" gate in UserProfileScreen

**Which screen**: `astrowani_customer-main/src/screens/drawerScreens/UserProfileScreen.js`.
Not the vendor app — vendor `Profile.js` just navigates to a separate `EditProfile` screen,
which is a normal pattern. The customer profile was the one with the gate.

**What it was**: an `editableFields` state object held a boolean per field, every field
defaulted to `false`, and each row rendered an edit-pencil badge (`editIconBadge`) calling
`toggleEditable(fieldKey)`. So changing anything took two taps, and a fully-filled profile
rendered dimmed (`opacity: 0.85`, text `#666`) as though it were disabled.

**Now**: `editableFields`, `toggleEditable` and the pencil are gone. Fields are editable
immediately and render at full contrast.

**The one judgement call — the phone number stays locked.**
`PUT /api/users/profile` deliberately does **not** accept `mobile` (it is the OTP login
identity — see the allowed-field list in `index.js`), and `UserProfileScreen`'s save payload
never included `phoneNumber` either. So the old pencil let a customer tap edit, type a new
number, press Save, and have it silently do nothing and revert on reload — the same "fake
control" class of bug as the 2026-08-10 signup photo picker. Making it *freely* editable would
have made that worse, not better.

So `renderField` gained a `readOnly` flag, which is a **different concept from the old gate**:
it marks a field the backend will not accept a change to. It renders muted
(`textInputReadOnly`) with a `lock-outline` badge where the pencil used to sit (same
`scale(24)` width, so rows stay aligned). Only `phoneNumber` passes it today.

**Also removed**: the "Please enter your Mobile Number" validation. It guarded a field that is
now read-only and whose value is never transmitted, so it could only ever produce an error the
customer had no way to fix. The `userProfile.enterMobile` i18n key was orphaned by that and was
deleted from **both** languages (note `astro.enterMobileNumber` is a different key, still in
use).

### Verified 2026-08-22

`eslint --quiet` clean on both changed files (the three `no-unused-vars` warnings in
UserProfileScreen — `Alert`, `launchCamera`, `supabase` — are pre-existing; `git diff` confirms
no import lines were touched). No references to `isEditable` / `editableFields` /
`toggleEditable` / `editIconBadge` remain. i18n parity re-checked: **921** distinct keys, zero
present in only one language. Not exercised on-device.

---

## Fix 2026-08-22: microphone dies when a call is backgrounded (NATIVE — needs a store release)

### AE. Why the mic cut out, and why an "ongoing" notification was never going to fix it

**Reported**: mid-call, the astrologer switches apps or hits Home and their voice stops
reaching the customer; it resumes when they return. Separately, the call itself was seen
cutting once.

**Root cause**: from Android 11 the OS silences the microphone for any app not in the
foreground, and from **Android 14 (API 34) the only way to keep capturing is a running
foreground service whose `foregroundServiceType` is `microphone`**. Measured state before the
fix, in BOTH apps:

- `targetSdkVersion = 36` — so every Android 14+ restriction applies.
- `FOREGROUND_SERVICE` was declared but **`FOREGROUND_SERVICE_MICROPHONE` was not**.
- **No `<service>` was declared at all**, in either manifest.
- No dependency supplies one either (checked `react-native-incall-manager` and grepped every
  `node_modules/*/android/src/main/AndroidManifest.xml` for `foregroundServiceType="microphone"`
  — zero hits). Note the vendor app has `@notifee/react-native`, whose foreground service
  declares no microphone type, so it would not have helped.

**The trap worth remembering**: the customer app already had
`utils/activeSessionNotification.js` posting an `ongoing: true` notification for the whole
session. That looks exactly like a call notification and is why the problem seemed like it
should already be handled — but **a plain ongoing notification grants no microphone
privilege**. Only a real foreground service of type `microphone` does. The appearance had been
built without the mechanism. (The vendor app had no such notification at all, which is
consistent with the astrologer being the one who noticed.)

Keeping the service alive also stops Android freezing/killing the backgrounded process, which
is the most likely explanation for the rarer "call just cut" sighting.

### What was added (per app: 3 Kotlin files + manifest + package registration)

- **`CallForegroundService.kt`** — posts an ongoing, silent, `CATEGORY_CALL` notification and
  calls `startForeground(..., FOREGROUND_SERVICE_TYPE_MICROPHONE)` on API 29+ (plain
  two-arg call below that, where typed services don't exist and backgrounded mic wasn't gagged
  anyway). `START_NOT_STICKY` on purpose — if the process dies the call is over, and
  resurrecting the service would strand an undismissable notification. `onTaskRemoved` tears it
  down if the app is swiped away. Small icon is the app's existing `ic_notification`
  silhouette, already shipped in every density bucket.
- **`CallServiceModule.kt`** — legacy `ReactContextBaseJavaModule` (correct: both apps have
  `newArchEnabled=false`). `start`/`stop`. **Every method resolves rather than rejects** —
  losing the service degrades a call, but must never break one by throwing into a call screen.
  `stop` uses `stopService` only; routing a STOP action through `startService` would *start* the
  service just to stop it when no call is running.
- **`CallServicePackage.kt`** + `add(CallServicePackage())` in `MainApplication.kt` — it lives
  in the app, not a node_module, so autolinking can't see it.
- **Manifest**: `FOREGROUND_SERVICE_MICROPHONE`, and for the vendor app also
  `POST_NOTIFICATIONS` (never declared — a foreground service must post a notification, and
  Android 13+ gates that), plus the `<service … foregroundServiceType="microphone"
  exported="false"/>` entry.

### JS wiring

- **`utils/callForegroundService.js`** (both apps) — safe no-op on iOS or if the native module
  is absent; swallows failures.
- **Customer**: `activeSessionNotification.js` gained a `kind` parameter.
  `kind: 'call'` starts the foreground service (which posts its **own** notification, so there
  is never a duplicate); `kind: 'chat'` keeps the plain local notification, because chat
  captures no audio and a service there would be an unjustified always-on-mic privilege.
  `hideActiveSessionNotification()` tears down **both** paths unconditionally, so a mismatched
  show/hide can never leave a service holding the mic open after a call ends. The two call
  screens pass `kind: 'call'`; their existing `doEndCall` already called hide.
- **Vendor**: started right after `captureEvent('call_connected')` in `EnxScreenVoice.tsx` /
  `EnxScreenVideo.tsx`, stopped at the top of each `doEndCall`.

**Start position is load-bearing**: Android forbids starting a microphone-type foreground
service from the background, and requires RECORD_AUDIO already granted. Both hold at the
connect moment (call screen visible, permission requested during setup). Do not move these
calls earlier or into a background handler.

### ⚠️ This one cannot ship over OTA

Manifest, permissions and native code — Hot Updater only replaces the JS bundle. **This needs a
full Play Store release for both apps.** Everything else from 2026-08-21/22 is JS-only.

### Verified 2026-08-22

- `:app:compileDebugKotlin` — **BUILD SUCCESSFUL** for both apps (customer: 10 tasks executed,
  so the new Kotlin genuinely compiled).
- `:app:processDebugMainManifest` — **BUILD SUCCESSFUL** for both, and the merged manifest was
  read back to confirm `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, and
  `<service android:name="….CallForegroundService" android:exported="false"
  android:foregroundServiceType="microphone"/>` all landed.
- `eslint --quiet` clean on every changed JS/TS file (the one reported error, unused
  `SCREEN_WIDTH` in `VideoCallScreen.tsx:40`, is pre-existing — the diff there is four lines).
- **Gradle must be driven from PowerShell on this machine, not the Bash tool** — bash mangles
  the `JAVA_HOME` path and `./gradlew` dies with
  `C;D:/Program Files/…/java: No such file or directory`. A bash run appears to "succeed" with
  exit 0 while having compiled nothing, which is how a false pass can slip through.

**Not verified on a device.** This is the one change here that genuinely needs a real
two-device test: connect a call, background the astrologer's app, and confirm audio keeps
flowing and the ongoing notification appears.

---

## Subsystem added 2026-08-22 (IN PROGRESS): astrologer referral commission on remedy orders

### AF. Commission core — DB, money paths, API, admin rates

An astrologer recommends a remedy item to a customer; if that customer buys it, the
astrologer earns a share. Covers **all three commissionable types — gemstone, puja,
specific_puja** — with the rate set **per type** from the admin. `life_report` is excluded
(digital good, no delivery, no rate).

**The three rules this is built on** (confirmed with the user before building):

1. **Commission comes out of the PLATFORM's margin, never the customer's price.**
   `resolveLineCommissions()` runs *after* the cart is priced and only annotates lines — it
   cannot change what is charged. Payout credits the astrologer and debits `admin_wallet` by
   the same figure.
2. **Paid on DELIVERY** (`orders.status` → `completed`), not at checkout. This is what makes
   the whole feature safe: a cancelled or refunded order simply never pays, so there is **no
   clawback path to get wrong** — unlike the refund reversals the cart flow already needs.
3. **Rates are SNAPSHOTTED per order line at checkout.** Changing a rate in the admin must
   never retroactively alter what an already-placed order owes, so payout never re-reads
   `app_settings` — it uses the number stored on the line.

**Per LINE, not per order**, because rates differ by type and one cart can mix a gemstone
with a puja.

### Referral creation — both paths, deliberately

- `source = 'vendor'` — the astrologer recommends from the vendor app.
- `source = 'admin'` — an admin attributes one by hand. This exists because plenty of real
  recommendations happen outside the app flow (phone consults, disputes, corrections) and
  without it those would be unpayable.

**The vendor write goes through the backend, never Supabase directly.** `remedy_referrals` has
RLS on with no anon policy, and `astrologer_id` is taken from the verified JWT rather than the
request body — otherwise any astrologer holding the publishable key could write themselves a
commission on somebody else's customer.

**Attribution**: history is kept, never overwritten. Multiple rows per (customer, item) are
legal; checkout takes the **most recent inside the window** — "last recommendation wins".
Overwriting would destroy the audit trail for a payment, which is the one thing needed when an
astrologer disputes a commission.

### Files

| File | Role |
|---|---|
| `sql/remedy_referral_commission.sql` | `remedy_referrals` table (RLS on, service-role only), 4 additive `order_items` columns + CHECKs + 3 indexes, 4 seeded settings. Idempotent. |
| `src/remedyCommission.js` | `resolveLineCommissions()` (checkout) and `payoutOrderCommissions()` (delivery). **Neither ever throws.** |
| `src/remedyReferralRoutes.js` | vendor create/list, admin list/create/delete, admin per-astrologer commission report. |
| `src/orderRoutes.js` | snapshots commission onto `order_items` at checkout. |
| `src/adminRoutes.js` | pays out when status becomes `completed`. |
| `astrowani-admin/src/pages/Remedies.jsx` | "Astrologer referral commission" card — 3 rates + window, clamped 0–100. |

**Settings** (`app_settings`, seeded at 10% / 30 days):
`remedy_commission_percent_{gemstone,puja,specific_puja}`, `remedy_referral_window_days`.

### Failure posture — every path fails toward not-paying

- `loadCommissionConfig` fails **CLOSED**: an unreadable/missing/out-of-range rate becomes 0.
  Paying nothing is recoverable (an admin can attribute later); paying a wrong amount out of
  the margin is not.
- `resolveLineCommissions` never throws — an unattributed order is fixable, a blocked
  purchase is not.
- `payoutOrderCommissions` never throws — a delivery must stay recordable even if payout
  fails, and unpaid lines stay retryable because `commission_paid_at` is stamped **only after**
  the credit succeeds.
- Idempotent twice over: `commission_paid_at` *and* wallet idempotency keys
  (`remedy-commission:<orderId>:<astrologerId>`), so re-selecting "delivered" cannot double-pay.
- One wallet write per astrologer per order, not per line — three gemstones from the same
  astrologer read as one ledger entry.
- `countEarnings: true` — commission is real earned income and belongs in
  `today_earnings`/`total_earnings`.
- **Razorpay-paid orders**: the `admin_wallet` debit is still recorded even though that money
  never entered our ledger. The resulting negative is *accurate* — we owe an astrologer out of
  revenue that went straight to the gateway. (`adjust_admin_wallet` has no sufficiency check,
  verified, so the debit always lands.)
- Deleting a referral affects **future orders only**; commission already snapshotted onto a
  placed order is untouched.

### Verified 2026-08-22 — migration APPLIED, money path proven end to end

`node --check` clean on all five changed/new backend files; admin `npm run build` succeeds.

**Before the migration** — 6/6: `loadCommissionConfig` returns zero rates,
`resolveLineCommissions` returns an empty Map without throwing (so **checkout is completely
unaffected**), and `payoutOrderCommissions` reports `paid: 0` with the missing-column error
captured rather than raised. **Deploy order does not matter**, same posture as `src/wallet.js`.

**After the migration — money path, 17/17** on a real gemstone (Rs.11,000 @ 10%):
referral created -> commission resolved at Rs.1,100 and attributed to the right astrologer ->
snapshotted onto the order line -> payout credited the astrologer (5663 -> 6763), counted it as
real earnings, and debited `admin_wallet` by the **same** amount (0 -> -1100, i.e. straight out
of the platform margin, never the customer) -> `commission_paid_at` stamped -> **re-delivering
paid nothing** -> changing the rate to 50% did **not** rewrite the placed order -> a referral
aged past the 30-day window stopped resolving. Every rupee reversed: astrologer and
`admin_wallet` both finished on their exact starting values, `remedy_referrals` back to 0 rows,
rate restored to 10.

**API surface — 13/13** via a bare Express harness mounting `adminRoutes` +
`remedyReferralRoutes` (**never `index.js`** — that starts sessionManager's billing worker and
`checkEarningsResets()` against production): unauthenticated vendor create 401s, a **vendor
token is rejected 403 on the admin routes**, vendor create 201s and returns the live rate +
window, missing field 400s, unknown item 404s, vendor list returns referrals + split
paid/pending earnings, admin attribution 201s and is tagged `source=admin` with `created_by`,
admin list joins astrologer/customer/item, the commission report responds, and admin delete
200s. All test rows removed.

Note `admin_wallet` sits at 0 and therefore went negative during the test — expected and
correct per the Razorpay note above.

### AG. The UI layer (2026-08-22, same day)

**Vendor app**
- `screens/Drawer/MyCustomers.js` — a **Recommend** button beside the existing "Send voice
  note", opening a remedy picker. Items are filtered to the three commissionable types, so
  the astrologer can never tap something the backend would refuse with
  `NOT_COMMISSIONABLE`. The confirmation state **replaces** the list (rather than stacking an
  alert) and quotes the rate + window **returned by the server**, never a hardcoded number —
  an admin can change the rate at any time and promising a stale percentage is worse than
  saying nothing.
- `screens/Drawer/RemedyReferrals.js` (new, drawer item "Referrals & Commission") — read-only
  ledger. **Paid and Pending are shown separately on purpose**: one combined figure would tell
  an astrologer they had earned money a cancellation could still remove. Admin-attributed rows
  carry an "Added by Astrowani" pill, since the astrologer did not create those themselves.

**Customer app**
- New `GET /api/remedies/recommended` (customer JWT) → `{ [itemId]: 'Astrologer Name' }`.
  **Deliberately a separate endpoint, not a field on `/api/remedies`** — that route is
  unauthenticated and `contentCache`d, so a per-customer field there would either leak one
  customer's recommendations to everyone through the cache or force the cache off for all.
  Returns **only the name** — no commission figures; what an astrologer earns is not the
  customer's business and showing it would make advice look like a sales incentive.
  Honours the same window and the same "last recommendation wins" rule as checkout, so the
  badge can never name an astrologer who would not actually be credited.
- `components/shop/ProductCard.js` — `recommendedBy` prop renders a small verified-icon line
  above the title. `screens/Remedies/ProductDetail.js` — a fuller "Recommended for you by X"
  banner. Both fetched via `OrdersApi.getRecommendations()`, which **resolves to `{}` on any
  failure** so a missing badge can never break the shop screen.

**Admin**
- `pages/Orders.jsx` — each expanded line shows `Referral commission ₹X (Y%)` with
  **"paid <date>" in green or "pays on delivery" in amber**, plus a new "Astrologer referral
  commission" card (Paid / Pending totals + a per-astrologer breakdown). The card reads
  `GET /api/admin/remedy-commissions` rather than deriving from the loaded page, so totals
  cover everything and not just the current filter. Its fetch is independent of the orders
  fetch — a failure (e.g. migration not yet applied) cannot stop the table rendering.

### Verified 2026-08-22 — UI driven in a real browser

`GET /api/remedies/recommended` — **7/7**: no token and a malformed token both return an empty
map with **200** (badges simply do not render rather than erroring), a customer with no
referrals gets `{}`, a real referral returns the astrologer's name keyed by item id, the
response contains **no commission/percent/amount fields**, and a referral aged past the window
disappears.

**Admin UI end-to-end in the browser** against a harness mounting `adminRoutes` +
`orderRoutes` + `remedyReferralRoutes` (never `index.js`): seeded one referred order, then
confirmed the commission card read **"Paid ₹0 · Pending ₹1100"** with the breakdown row
`Manu Sharma | 1 | 0 | 1,100`, and the expanded line showed
`Referral commission ₹1100 (10%) — pays on delivery`. Marking the order **completed through
the real admin PATCH** then produced, in the database: `commission_paid_at` stamped, astrologer
5663 → **6763**, `total_earnings` 5673 → **6773**, `admin_wallet` 0 → **−1100**, and exactly
one ledger row keyed `remedy-commission:<orderId>:<astrologerId>`. Reloading the page flipped
the card to **"Paid ₹1100 · Pending ₹0"**.

Teardown verified clean: astrologer back to 5663/0/5673, `admin_wallet` back to 0,
`remedy_referrals` at 0 rows, demo order removed, every synthetic ledger row deleted.
`eslint --quiet` clean across all changed vendor and customer files (the two reported errors —
`exhaustive-deps` in `NavigationScreen.js:122` and `SCREEN_WIDTH` in `VideoCallScreen.tsx:40` —
are pre-existing, confirmed by `git diff`). Admin `npm run build` succeeds.

### STILL TO DO

Nothing functional. Optional polish if it ever matters: the customer app has no
"recommendations for me" list screen (the badge only appears while browsing the shop), and the
`NOT_COMMISSIONABLE` refusal path is untested because no `life_report` row exists in
`remedy_items` to reject.

---

## Feature added 2026-08-22: session-start prompt ("share your birth details first")

### AH. The "first minute" feature is COPY ONLY — no billing change, deliberately

The original ask read as "add 1 minute free at the start". The user then clarified it is
**a marketing/onboarding prompt, not a real free minute**: "this is not a real thing this is
just a marketing gimmick… we are not leaving anything in money… these all will be banners".

**So nothing here touches money.** No free-minute logic, no billing exemption, no discount, no
change to `per_minute_charge`, `process_session_billing`, or any wallet path. A session is
charged from the moment it connects exactly as before. Verified mechanically: every match for
`wallet|charge|per_minute|billing|price|discount|refund` across the four new/changed files and
the three session-screen diffs is **comment prose**, not code.

**One judgement call recorded, because it will come up again**: the default wording
deliberately does **not** claim the first minute is free. Billing starts on connect, so
"1 minute free" is a claim the customer can check against their own wallet balance — and the
usual outcome is a refund request or a one-star review, not a happier customer. The copy says
what the minute is *for* ("share your name, date, time and place of birth — and double-check
them with your astrologer") rather than what it costs. The text is admin-editable, so this is a
default, not a lock.

### How it works

- `sql/session_intro_banner.sql` (idempotent) seeds three `app_settings` keys:
  `session_intro_banner_enabled`, `session_intro_banner_text`,
  `session_intro_banner_text_hi`.
- `hooks/useSessionIntroBanner.js` reads them straight from Supabase — `app_settings` is
  public-read and this mirrors `useRemedyOrderingGate` / `applySessionReplaySetting`, so no
  bespoke endpoint. **Fails to OFF** rather than to a hardcoded fallback sentence: if the copy
  can't be read, an admin may have reworded or disabled it deliberately, and showing stale
  promotional text nobody approved is worse than showing none. Hindi falls back to English when
  blank, the same convention `/api/remedies` uses for `title_hi`.
- `components/SessionIntroBanner.js` — dismissible, auto-hides after 25s so it never sits on
  top of a live chat. **Not** persisted as "seen forever": the reminder is useful at the start
  of *every* session, since the details matter per-reading.
- Wired into `ChatSessionScreen.js` (above the message list),
  `VoiceCallScreen.tsx` and `VideoCallScreen.tsx`. **On the call screens it is gated on
  `isActive`** — showing "start by telling them your details" while the phone is still ringing
  would tell the customer to talk before anyone is there. On video it is absolutely positioned
  below the top bar so it floats over the remote stream instead of displacing it.
- Admin: a "Session start message" card at the top of `pages/Sessions.jsx` — on/off, English
  and Hindi text. The card's own help text states that this is wording only and warns against
  promising a free minute, so the next person to edit it sees the reasoning without having to
  find this file.

There is **no server-side counterpart**, and that is correct: the banner grants nothing and
costs nothing, so a stale value in an old installed build is an out-of-date sentence, not a
loophole. (Contrast the remedy ordering gate, which *is* re-checked server-side because it
guards money.)

### Verified 2026-08-22

`eslint --quiet` clean on the two new files; the two errors reported in the touched screens
(`exhaustive-deps` in `ChatSessionScreen.js:403`, unused `SCREEN_WIDTH` in
`VideoCallScreen.tsx:41`) are **pre-existing** — `git diff` shows those files gained only an
import and a 3-line insert. Admin `npm run build` succeeds. Not exercised on-device.

**To activate**: run `sql/session_intro_banner.sql`. Until then the hook fails to OFF and no
banner appears, so it is safe to ship the app change first.

---

## Storefront 2026-08-25: a page per product, and a cautionary tale

### AI. What actually shipped

`shop.astrowani.com` gained ONE thing: every gemstone and every puja opens at its own URL
instead of in a quick-view popup.

```
/gemstones/ceylon-blue-sapphire-neelam/
/pujas/gauri-ganesh-puja/
```

Neither has an HTML file. Nginx ends `location /` with `try_files $uri $uri/ /index.html`, so
those paths are served the ROOT document; it gained one empty `<main id="view">`, and
`store.js` hides the gate tiles (`#entry`) and renders the detail block into it. On `/`
nothing changes. **No nginx change was needed**, which matters because certbot rewrote that
file in place on the VPS and the deploy deliberately never overwrites it.

Navigation is a plain page load, not pushState: the two listings are real separate documents,
so a history stack buys nothing, and a browser navigation gets Back, scroll restoration and
the app WebView's hardware Back right for free.

- **Gemstone pages**: image left, details right. The sticky element is an inner wrapper, not
  the grid item — a grid item shrink-wraps its content and so has no room to travel. Its
  offset is `--chrome-h` (header + ticker, both measured in `store.js`), never a constant.
- **Puja pages**: stacked, photograph on top, at every width. The images are 400x224
  originals; beside a full column of text they could only ever be a short picture next to a
  tall block.
- **Contrast**: `--ink-soft` / `--ink-faint` are redefined on `.detail-page` only. The shared
  tokens measured 2.16:1 and 3.90:1 on cream, against a 4.5:1 AA minimum; the "nothing is
  charged" note was 1.77:1. Listings keep the original palette.
- **The puja booking form** renders into `.detail-card`, NOT `#view` — `#view` holds the
  section/wrap/card chrome, so writing to it threw the card away and the form spread edge to
  edge.
- **reconcileCart()** now waits for the live catalogue before dropping unknown ids. It ran
  before the fetch landed, when `byId` held only the offline `p1..p48` fallback, so every
  `remedy_items` uuid in a saved cart was deleted on page load. Invisible while a product was
  a modal (a cart could be filled without leaving `/gemstones/`); fatal once every product is
  its own page.

### The cautionary tale — READ THIS BEFORE A "WHILE I'M IN HERE" REWRITE

The ask was pagination and a page per product. What was built first was a full rewrite: the
three pages became one shell, the calculators / testimonials / about bands were moved onto
separate routes, the two-tile landing became a gemstone grid, and the heroes and puja campaign
banner were dropped. It shipped to production and had to be reverted byte-for-byte
(`git checkout <prev> -- astrowani-shop/`).

None of that was asked for. The storefront's composition was the product of many earlier
sessions. **Restructuring someone's information architecture is not a free side effect of a
routing change.** If a task seems to require moving their content around, it doesn't — ask.

A second, quieter failure in the same pass: rewriting `index.html` and `store.js` wholesale
silently reverted 16 of the 18 occurrences of a "Wani Shop" rename that had landed hours
earlier. **A wholesale file rewrite discards concurrent work with no conflict to warn you.**
Check `git log` on the files you are about to replace.

### Backend / app, additive and currently INERT

These shipped and are harmless, but nothing on the site uses them yet — the commerce
storefront they were built for was reverted:

- `GET /api/store/config` (`src/orderRoutes.js`) — public, unauthenticated: which categories
  accept orders, plus the fees. A convenience only; `/checkout` still 403s a blocked category.
- `orders.source` ('app' | 'web') + a "From" column and server-side filter on the admin Orders
  page. **Descriptive only.** Both the insert and the filter degrade gracefully if
  `sql/order_source.sql` is unapplied (it HAS been applied).
- `StoreWebView.js` — the native Razorpay bridge (page posts `{type:'razorpay'}`, the app runs
  `RazorpayCheckout.open` and injects the signed response back) and `*.razorpay.com` kept
  inside the WebView. Needed because UPI in a WebView hands off to an `intent://` URL the
  WebView cannot follow. Detected via `window.__ASTROWANI__.nativePay`.

### OTA note — CHECK NATIVE MODULE COMPATIBILITY FIRST

Shipped as bundle `01a03870-add4-7b98-8f5f-db2df3741e56` (android/production, target `24.0.x`).

An OTA ships the whole JS bundle at the current commit, not just your change. In this window
another session had bumped **react-native-razorpay 2.3.0 -> 3.0.0**, a NATIVE module — so
3.0.0's JS would run against 2.3.0's native code on every installed phone, and a changed
bridge would have hung wallet recharge and order payments silently for every user.

Verified safe by fetching 2.3.0's own source
(`https://unpkg.com/react-native-razorpay@2.3.0/RazorpayCheckout.js`): both versions call the
same native modules (`RNRazorpayCheckout`, `RazorpayEventEmitter`) with the same event names.
3.0.0 only adds a TurboModule branch, and both apps set `newArchEnabled=false`, so the
old-architecture fallback runs. **Do this comparison before any OTA that follows a native
dependency change.** The commit that introduced it had verified the JS API and iOS linking —
neither of which covers the OTA path.

The vendor app was deliberately NOT pushed: its only changes were iOS build config and a
postinstall script that never reaches the runtime bundle, so the bundle is byte-identical to
what is already deployed.

Rollback: `npx hot-updater bundle disable <id>`, effective on next launch.

### Still not built

The cart, checkout, OTP sign-in and order tracking on the web store. `orderRoutes.js` is ready
for it and `/api/store/config` is live; nothing on the site calls either.

---

## Session 2026-08-31: free-chat off, themed date picker, brown icon, free-call bookings

### AJ. Free 5-minute bot chat switched OFF (the toggle already existed)

`app_settings.free_bot_chat_persona.enabled` is now **false**. The admin toggle was
already built (admin -> Free Bot Chat -> "Enabled"); nothing new was needed to turn it off.
Two real bugs in the DISABLED path were fixed first, both of which would have bitten the
moment the switch was flipped:

- `Home.js` did `if (personaRes.data?.enabled === false) return;` -- that `return` exits
  `fetchUserProfile`, whose `setLoading(false)` sits below it, so **every eligible new
  customer would have seen an infinite loading spinner on Home**. Now a flag, not a return.
- The persona fetch failed **open**: a network error fell into the `catch` and the popup
  still showed with the bundled fallback persona. Now fails **closed** -- no successful
  "enabled" answer means no popup. That check is the ONLY place the admin switch is read.

### AK. `ThemedDateTimePicker` -- replaced `@react-native-community/datetimepicker` everywhere

`astrowani_customer-main/src/components/ThemedDateTimePicker.js`, wired into all **8**
customer screens that had a picker (`Register.jsx`, `UserProfileScreen`, `BirthDetailsForm`,
`NumerologyInputScreen`, `JanamKundaliScreen`, `KundaliMatchScreen`, `PanchangScreen`,
`MuhuratCard`). The vendor app has no date pickers; chat has none either (it reads the DOB
off the profile).

**The pre-1970 bug, root cause**: no call site ever passed `minimumDate`, so the OS dialog
used its own default minimum -- the Unix epoch on the affected devices -- and silently
clamped 1965 up to 1970. A customer could not enter their own birth year, which makes every
chart wrong. The new picker owns its year list (`DEFAULT_MIN_YEAR = 1900`), so there is no
OS default left to clamp against. The year in the header is a **button** opening a year
grid: 1965 is two taps, not 730 months of paging.

**Drop-in contract** -- props and `onChange(event, date)` mirror the community picker
(`event.type` 'set' / 'dismissed'), so call sites only swapped the import. Three things had
to change with it:
- Birth-date pickers now pass `maximumDate={new Date()}`; several accepted a **future**
  birth date. Panchang/Muhurat deliberately do NOT (they pick forward-looking dates; the
  year list runs to currentYear+5 when unbounded).
- Old handlers did `setShowPicker(Platform.OS === 'ios')` -- correct for the old inline iOS
  spinner, but this is a Modal on both platforms, so on iOS it would never close. All
  changed to `false`. **Watch for this in any future picker call site.**
- The time wheels select on `onMomentumScrollEnd`, not only on tap; taps alone meant
  spinning to a time and pressing "Set time" silently kept the old value.

Pure JS, no native dependency -- ships over OTA. (`@react-native-community/datetimepicker`
is still installed but now has zero importers; removing it would need a native release.)

### AL. Launcher icon + splash: black -> brown (#592a19, `COLORS.AstroMaroon`)

- `values/colors.xml`: `ic_launcher_background` AND `splash_background` both `#000000` ->
  `#592a19`. `IntroSplash.js`'s container was a **separate** hardcoded `#000000` -- changing
  only the XML gives a brown flash into a black screen, so both moved together.
- `ic_launcher.png` + `ic_launcher_round.png` recoloured across all 5 densities. Method:
  the plate is every pixel with max-channel <= 30 (art starts at ~250, only ~90 pixels sit
  between, so it is a clean cut); the plate is repainted and the anti-aliased fringe where
  gold met it is **recomposited** (`P + brown*(1-A)`) rather than colour-swapped, so the
  star keeps clean edges instead of a dark halo. The star, coin and purple W are carried
  through pixel-for-pixel. The original's inner navy panel is merged into one flat brown.
- **Native -- needs a Play Store release, not an OTA.** Verified via
  `processDebugMainManifest` + `mergeDebugResources`, reading the value back out of the
  merged resources. Gradle must be driven from **PowerShell**, not the Bash tool.

### AM. Free 12-minute introductory CALL -- booking system (replaces the bot chat)

A brand-new customer books a real slot; **the astrologer rings them directly**. There is no
session, no wallet, no billing anywhere in this subsystem.

**Files**: `sql/free_call_booking_schema.sql`, `src/freeCallRoutes.js`,
`scripts/freeCallSlotCheck.js` (DB-free assertions), admin `pages/FreeCallBookings.jsx`,
customer `api/FreeCallApi.js` + `components/FreeCallOffer.js` +
`components/FreeCallGiftBubble.js`, plus `Home.js` / `onboardingFlags.js` wiring and 14 new
i18n keys in **both** languages (parity re-verified: 940 keys each, 0 one-sided).

**The rules it is built on:**

1. **The server owns the slot grid.** The app renders what it is told and re-checks
   nothing. `/api/free-call/book` rejects any `slotStart` that is not a slot this server
   would itself offer, so a hand-crafted 3am time is refused.
2. **Double-booking is prevented by a partial UNIQUE INDEX, not an application check.**
   `free_call_bookings_slot_live_uniq` (one live booking per slot) and
   `free_call_bookings_customer_live_uniq` (one per customer, ever). A 23505 is the race
   being *caught*, not a bug; the two indexes are told apart by name so each gets the right
   message. **Do not "optimise" these into a read-then-write.**
3. **Slot maths runs in business time (IST, `FREE_CALL_TZ_OFFSET_MIN`), never the server's
   local timezone.** A VPS clock on UTC would otherwise shift every offered slot by 5h30m
   with nothing else noticing. `scripts/freeCallSlotCheck.js` asserts this (18 checks incl.
   midnight and window-boundary cases) -- run it after touching the arithmetic.
4. **Eligibility is server-side and fails CLOSED** -- brand-new customers only (no
   `chat_sessions` row). An unreadable sessions table means "not eligible".
5. **The offer config is one JSON blob** under `app_settings.free_call_offer`, saved via the
   existing generic `/api/admin/settings` PATCH -- no new settings endpoint. Every numeric
   field is clamped on read, because it is admin free-text.

**Customer UX**: popup on Home (once, `freeCallOfferSeen_<id>`), and if dismissed a floating
**gift bubble** stays on Home until they actually book -- the "seen" flag suppresses only the
popup, deliberately. `astrologer_name` is snapshotted onto the booking so changing the offer
astrologer never rewrites who a past customer was promised.

**Admin** (sidebar -> Free Call Bookings): offer settings (astrologer, hours, slot spacing,
lead time, all copy) + the bookings table with search, status/date filters, "upcoming first"
sorting, mark done/missed/cancelled, internal notes, and a **reschedule picker that goes
through the same unique index** -- an admin cannot move a call onto a held slot.

**Deploy order does not matter.** Pre-migration the offer reports `enabled:false`, booking
returns a clean 403 `OFFER_CLOSED`, and the admin list returns 200 with `tableMissing` so
the page shows a "run the migration" banner. Verified explicitly.

> **Trap found and fixed here:** PostgREST reports a missing table as **`PGRST205`**, not
> Postgres's `42P01`. Checking only `42P01` turned a not-yet-migrated database into a 500.
> `isMissingTable()` matches both -- use it for any future table-missing branch.

### SQL to run (Supabase SQL editor)
`sql/free_call_booking_schema.sql` -- idempotent. It seeds the offer **DISABLED on purpose**:
the astrologer name/photo are placeholders, and going live on migration would book real
customers onto a person who may not exist. Fill in the astrologer on the admin page, then
tick "Offer is live".

### Verified 2026-08-31
Backend: `scripts/freeCallSlotCheck.js` 18/18; a bare-Express harness mounting
`freeCallRoutes` 11/11 (admin routes reject missing/customer tokens, accept admin; the
pre-migration path proven). **`index.js` was never booted** -- it starts sessionManager's
billing worker against production. Admin page driven in a real browser against that harness:
the migration banner, the "off" badge and offer summary, and the full settings form all
render, and Save persists with numeric fields coerced to numbers. The test `app_settings`
row was deleted afterwards so the migration seeds cleanly. Customer app: full Android bundle
succeeds; lint clean on all new files (the 2 remaining `Home.js` errors are pre-existing
`exhaustive-deps`). Admin `npm run build` succeeds. **Not exercised on a device** -- the app
side needs a real booking pass once the SQL is applied.

### AN. Free-call assignment: who takes it, and the vendor app (2026-08-31, same day)

An admin decides who handles free-call bookings, and the assigned astrologer sees their
own list in the vendor app and dials from it.

**Three assignment modes** (`free_call_offer.assignmentMode` in app_settings):

| Mode | At booking time | Slot capacity |
|---|---|---|
| `manual` (default) | left unassigned, admin hands each one out | 1 |
| `single` | always `assignedAstrologerId` | 1 |
| `pool` | split across `poolAstrologerIds`, least-loaded first | **= number of active pool members** |

An admin can reassign any individual booking from the table at any time, whatever the mode.

**Capacity had to become per-astrologer, and that changed a shipped index.**
`free_call_booking_schema.sql` enforced one live booking per slot *globally*. Correct for one
astrologer, but it makes a pool pointless — a second astrologer would add zero bookable
places, because 3pm could still only hold one customer. `sql/free_call_booking_pool.sql`
drops that index and replaces it with two:
- `free_call_bookings_slot_astro_uniq` on `(slot_start, astrologer_id)` — an astrologer can
  never be double-booked, but N astrologers give a slot N places.
- `free_call_bookings_slot_unassigned_uniq` on `(slot_start)` WHERE `astrologer_id IS NULL`.
  **This second index is not optional.** In Postgres NULLs are DISTINCT inside a unique
  index, so `(slot_start, astrologer_id)` alone would allow unlimited unassigned rows on one
  slot — silently removing the per-slot limit for exactly the mode where nobody is assigned.

**Least-loaded, not round-robin.** `assigneeCandidates()` counts each pool member's live
*upcoming* `booked` calls and puts the emptiest first. A round-robin cursor drifts out of
balance permanently the first time a booking is cancelled; least-loaded self-corrects, and it
handles someone joining or leaving the pool mid-stream. Completed/missed calls are excluded
from the count, or finished work would keep pushing customers away from an astrologer forever.

**The booking insert walks the candidate list.** It returns a LIST, not one astrologer,
because two customers booking the same slot at the same instant can both pick the same
emptiest member; a 23505 on the slot/astrologer index means "that one is busy at this slot",
so it tries the next, with `null` as the final attempt. A 23505 naming `customer_live_uniq`
is terminal (they already have a booking) and breaks out immediately. **The database decides
availability, not the ordering logic.**

**Fails toward unassigned, never toward a failed booking.** A suspended or un-approved
astrologer is dropped from the pool; an empty pool falls back to `manual`; any error in
assignment yields `null`. An unassigned booking sits in the admin's queue one click from
fixed, whereas a failed booking loses the customer.

**Vendor app** — `screens/Drawer/FreeCalls.js`, drawer item "My Free Calls":
- `GET /api/vendor/free-call-bookings` scopes by the astrologer id **inside the vendor JWT**,
  never a query param — these rows carry customers' phone numbers.
- Upcoming and history are separate sections, not one sorted list, so a call due in 20
  minutes can't be buried under a week of completed ones.
- Primary action is a `tel:` dialler. `PATCH /api/vendor/free-call-bookings/:id` accepts only
  `completed` / `missed`, and its `.eq('astrologer_id', …)` filter IS the authorisation check
  (someone else's id updates zero rows and 404s). **Rescheduling and cancelling are
  deliberately admin-only** — moving a customer's appointment is a conversation, not a button
  in the vendor app.

**Admin**: assignment mode + pool checkboxes in the offer settings; an "Assigned to"
dropdown on every row; an astrologer filter including "Unassigned"; and a "Need an
astrologer" count tile (live `booked` rows with nobody on them). The reschedule picker now
shows `used/capacity` per slot.

### SQL to run for this (Supabase SQL editor, after the base schema)
1. `sql/free_call_booking_assignment.sql` — indexes for the per-astrologer lookups.
2. `sql/free_call_booking_pool.sql` — **swaps the per-slot unique index**; required before
   pool mode can give a slot more than one place.

### Verified 2026-08-31 (assignment + pool)
Against the live database, calling the assignment logic directly and deleting every
synthetic row afterwards (24 created, 24 deleted, table confirmed back to 0). **9/9**:
capacity is 2 for a 2-astrologer pool and 1 for single/manual; **20 bookings split exactly
10/10**; after cancelling 4 of one astrologer's calls the next 4 all went to them and the
load returned to 10/10 (the assertion a round-robin implementation would fail); an
unknown/inactive id is dropped from the pool; an empty pool assigns nobody without throwing.
`scripts/freeCallSlotCheck.js` still 18/18. Admin `npm run build` and the vendor Android
bundle both succeed; vendor lint clean (the one `NavigationScreen.js` exhaustive-deps error
is pre-existing).

> **Test-harness lesson:** the first run swallowed failed inserts and reported a pass on a
> tally built from 21 rows when it thought it had 24 — the database has only 21 customers and
> the loop indexed past the end. A harness that does not throw on a failed write can report a
> distribution that never happened. Rewritten to throw.

### AO. End-to-end verification of the free-call flow (2026-08-31)

All three SQL files applied to production, then the whole flow driven over real HTTP against
the live database: **53 assertions, 0 failures**. A bare Express app mounting `adminRoutes` +
`freeCallRoutes`; `index.js` never booted. Teardown deleted every synthetic booking (table
confirmed back to 0 rows) and restored `free_call_offer` byte-for-byte.

Covered: offer off (403 `OFFER_CLOSED`) -> offer on with a 2-astrologer pool -> 7 dates / 14
free slots -> **two customers both booking the SAME slot, auto-assigned to two different
astrologers**, third refused `SLOT_TAKEN` -> once-only per customer (`ALREADY_BOOKED`) ->
off-grid timestamp rejected `BAD_SLOT` -> vendor list scoped to the JWT's own astrologer (the
other astrologer gets 404 on someone else's booking; a customer token gets nothing; cancel
refused 400) -> admin list/filters/search, reassign (409 when the target astrologer is
already busy at that time), unassign, reschedule (original time kept, `slot_end` moves,
`reschedule_count` increments), notes, invalid status rejected -> admin cancel frees the
place and a new customer takes it -> manual mode arrives unassigned at capacity 1 -> single
mode auto-assigns -> a customer with a prior session is `NOT_ELIGIBLE`.

> **THE MIGRATION TRAP, worth remembering.** The first run failed 6 assertions, all from one
> cause: `free_call_booking_pool.sql` had been run but its `DROP INDEX` had not taken effect,
> leaving `free_call_bookings_slot_live_uniq` in place. The file wrapped its statements in
> explicit `BEGIN; ... COMMIT;`, which is the suspected cause. **A half-applied index
> migration here throws no error at runtime** — booking still works, it just silently caps
> every slot at one customer forever, which reads as "the pool feature doesn't work" rather
> than "the migration didn't run". The file now has no transaction control and ends with a
> `DO $$` block that RAISES if the old index survives or either new one is missing, plus a
> `pg_indexes` SELECT so the result pane shows the truth. **Give any future index-swap
> migration the same self-verifying tail.**

> **Test-harness lesson (second one this session).** The final "failure" was the harness
> comparing `slot_start` as STRINGS: Postgres returns `...+00:00`, the value sent was `...Z`,
> so the filter matched nothing and reported 1 booking where there were 2. Compare timestamps
> by `getTime()`, never by string equality.

**Still not applied:** `sql/free_call_booking_assignment.sql` — its two indexes
(`free_call_bookings_astrologer_idx`, `free_call_bookings_unassigned_idx`) are absent from
production. Performance only: the vendor app's per-astrologer query and the admin's
unassigned queue currently scan the table. Correctness is unaffected, which is why every test
above passes without it.
