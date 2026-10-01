# Astrowani — Project State

## Architecture Overview

**Four** sub-projects in one monorepo:

| Directory | Role | Package |
|---|---|---|
| `astrowani-backend/` | Node/Express REST + Socket.io backend | `astrowani-backend` |
| `astrowani_customer-main/` | React Native customer app | `com.astrowanicustomer` |
| `astrowani_vendors-main/` | React Native vendor/astrologer app | `AstroIndia_Astrologers` |
| `astrowani-admin/` | React + Vite **admin dashboard** (web only) | `astrowani-admin` |

> **Living state note (updated 2026-10-01):** this file used to be a complete verbatim
> changelog back to 2026-06-20 and had grown to ~450KB, loaded into every session's context
> regardless of relevance. The architecture/reference sections below (tables, call flow, sync
> rules) are current-state docs and were kept. The dated subsystem changelog from 2026-06-20
> through 2026-09-14 (subsystems A through CU — admin dashboard, remedies commerce, reviews/
> favorites, live streaming, busy-gating, PostHog analytics, badges, coins/IAP, device-session
> handling, moderation, first hardening passes, etc.) was moved to
> [`MD files/CLAUDE-ARCHIVE-2026-06-to-09-14.md`](MD%20files/CLAUDE-ARCHIVE-2026-06-to-09-14.md)
> — open it deliberately when investigating that period. Everything from it that is still an
> active rule today was pulled forward into **"Standing rules, traps and gotchas"** further
> down. Sessions from 2026-09-16 onward are kept here in full, since they're current.
> **Store submissions:** the owner's step-by-step Apple enrolment → App Store and Play Store
> upload checklists are **CO** and **CP** under "Session 2026-09-16" below.
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


## Next Steps (original list, 2026-06-20) — superseded, kept for history only

This section predates almost the entire current app. Most items (1, 2, 3, 6, 7) were marked
DONE in the original text; the rest (4, 5, 8, 9, 10, 11) were never re-verified against current
state. The full original list, with 2026-10-01 status notes on each still-open item, is in
[`MD files/CLAUDE-ARCHIVE-2026-06-to-09-14.md`](MD%20files/CLAUDE-ARCHIVE-2026-06-to-09-14.md)
under "Original 'Next Steps' list". Two items there look like they might still be genuinely
open and worth a look: **#8 (low-wallet warning during an active call)** and **#10 (earnings
reset is still in-memory, not DB-backed — confirmed still true as of this file's architecture
section above)**. For other outstanding work, check the end of this file and `MD files/` for
the latest checklists (Apple/Play submission, hardening rollout, backups).

## Video transport reality (IMPORTANT)

Despite the ENX docs in this file, the **actual** customer↔vendor call video uses **WebRTC
peer-to-peer** (`react-native-webrtc`) signalled over our own Socket.io
(`webrtc_offer/answer/ice_candidate`). EnableX env vars exist but are **not used** in the live
code path. `/api/call/initiate` returns crypto-UUID room/session ids; tokens in the payload are
vestigial. Live streaming reuses this same WebRTC stack as a **mesh** (see below).

---


---

## Standing rules, traps and gotchas (carried forward from archived history)

> Full narrative, verification detail, and dated subsystem write-ups for everything below live
> in [`MD files/CLAUDE-ARCHIVE-2026-06-to-09-14.md`](MD%20files/CLAUDE-ARCHIVE-2026-06-to-09-14.md)
> (not auto-loaded — open it deliberately). These are the facts from that period still true
> today and worth knowing before you touch the related code.

**Architecture / transport**
- **Calls are WebRTC peer-to-peer** (`react-native-webrtc`), signalled over our own Socket.io
  (`webrtc_offer/answer/ice_candidate`), **not** EnableX/ENX despite file names like
  `EnxScreenVoice.tsx` — those are historical names for WebRTC implementations. EnableX env
  vars exist but are unused in the live path. Live streaming reuses the same WebRTC stack as a
  mesh (~5 viewers before an SFU would be needed).
- **Supabase Realtime channel names must be unique per mount** — suffix with
  `_${Date.now()}_${Math.floor(Math.random()*1e6)}`, or a fixed name returns the
  already-subscribed channel and any further `.on()` throws.
- `session_ended` must always call `doEndCall()` (which hits `POST /api/call/end` and finalizes
  billing) — never navigate directly.
- ENX/WebRTC PiP container must be a plain `View` — no `overflow:hidden`/`borderRadius`/
  `elevation` directly wrapping the room component, or Android's native SurfaceView breaks.
  Put decoration in a separate `pointerEvents="none"` overlay.

**Database / money — do not undo these**
- `JWT_SECRET` has **no fallback**; the server refuses to boot if unset/short/the old default.
- The backend's Supabase client uses the **service-role key**, not anon — it runs on a trusted
  VPS and this is what let anon privileges be revoked without breaking our own API.
- `anon` and `authenticated` now hold **zero** INSERT/UPDATE/DELETE privileges anywhere in
  `public` as of 2026-09-23/30 hardening passes — every write goes through the backend or the
  service role. When auditing Postgres access, enumerate grants for **every** role, not just
  `anon` — a dozen earlier audit passes all had this blind spot.
- **`CREATE OR REPLACE FUNCTION` cannot change a money function's parameter list** — a changed
  arg count creates a second overload instead of replacing it, and Node's named-argument calls
  become ambiguous (`PGRST203`). Always `DROP` the old signature explicitly in the same
  migration. (This took vendor withdrawals offline for weeks before being caught.)
- Any WHERE-less `UPDATE` inside a SECURITY DEFINER function is rejected by this database
  (a pg_safeupdate-style guard) — `admin_wallet`'s singleton-table updates must still use
  `WHERE id = ...` with a row lock.
- **Never boot `index.js`/the full backend locally** — it starts `sessionManager`'s 30s billing
  worker (and hourly earnings resets) against the **live production** Supabase DB. Mount
  individual route modules on a bare Express app for testing instead. See
  `local-backend-bills-production` memory.
- A PostgREST missing-table error is `PGRST205`, not `42P01` — a "table missing" branch that
  checks only `42P01` will 500 instead of degrading gracefully.
- **There are no database backups** (Supabase Free plan). Buy Supabase Pro (~$25/mo, daily
  backups) before this matters more than it already does — see the backups section further
  down if still unresolved.

**OTA / builds**
- `versionName` must stay the same across store builds so OTA bundles keep matching
  (`versionCode` goes up, `versionName` doesn't) — e.g. customer stays `24.1`, vendor `6.6`.
- OTA bundles ship the **whole JS bundle at the current commit**, not just the intended change —
  always check `git log` on files about to be touched, and check whether a native dependency
  changed before shipping (compare the native bridge API between versions; see the
  react-native-razorpay 2.3.0→3.0.0 case).
- `npm run deploy:ota -- -m "message with spaces"` breaks on Windows (npm drops the quotes and
  the arg gets split) — call `node scripts/deployOta.js -m '"message"'` directly, quoted twice.
- OTA bundles live in Cloudflare R2 now (`astrowani-ota-customer` / `-vendor` buckets), not
  Supabase Storage (which hit its free-tier quota). Prune superseded R2 bundles periodically —
  10GB free isn't unlimited either.
- Vendor `android/build.gradle` has signing config set TWICE — a second `android {}` block at
  the bottom overrides the first with the real release key. Deleting that block silently
  produces a debug-signed AAB that Play rejects. Always `keytool -printcert -jarfile` a vendor
  build to confirm the signer.
- Gradle must be driven from **PowerShell**, not the Bash tool, on this machine — Bash mangles
  `JAVA_HOME` and a build can report exit 0 having compiled nothing.

**Testing methodology (repeated lessons, worth not re-learning)**
- A test harness that only calls your own helper function proves the helper, not the delivery
  path — grep every caller of what you changed and assert on what a real client actually
  receives, not on the function in isolation.
- "Nothing happened" is not a passing assertion unless something could have happened — pair
  every negative check with a positive control, or a dead code path looks like a passing test.
- Compare timestamps by `getTime()`, never by string equality (`+00:00` vs `Z`).
- A migration's `DROP INDEX`/`CREATE INDEX` can silently not take effect if wrapped in explicit
  `BEGIN/COMMIT` in some tooling — give any index-swap migration a self-verifying `DO $$` tail
  that raises if the expected end state isn't there.
- Set an async guard/latch **before** the first `await` in it, never after — every `await`
  yields the event loop, so concurrent callers can all pass a check before any of them sets the
  flag.

**Operational**
- Node 20 has no global `WebSocket`, which `@supabase/realtime-js` needs at import — the
  backend throws on boot without a `ws` shim for local-only debugging (never fix this in repo
  code; it doesn't affect the VPS's actual Node version situation).
- The VPS runs backend + Socket.io + TURN relay + OTP sending + billing — all single points of
  failure on one Hostinger box. A past ~13h outage took all of them down together.
- GEMINI_API_KEY (free chat AI) and all other third-party secrets live only in the VPS `.env`,
  set via the `set-backend-env.yml` GitHub Action (the local `deploy` SSH user cannot write
  that file directly).
- The live Razorpay key is in git history (old deleted screen) — needs rotation in the Razorpay
  dashboard; no code depends on it being the specific value, both payment paths read the key
  from the VPS env at runtime.


---

> **The detailed dated history from 2026-06-20 through 2026-09-14 (subsystems A through
> CU, including admin dashboard, reviews/favorites, live streaming, missed sessions,
> busy-gating, analytics, badges, remedies commerce, referral commissions, coins/IAP,
> device-session handling, moderation, and the first security hardening passes) now
> lives in
> [`MD files/CLAUDE-ARCHIVE-2026-06-to-09-14.md`](MD%20files/CLAUDE-ARCHIVE-2026-06-to-09-14.md).
> It is NOT loaded automatically — read it when investigating something from that window
> or when a recent note below references a lettered subsystem you don't recognize. The
> "Standing rules" section just above already carries forward everything from it that's
> still operationally true today.

---

## Session 2026-09-16: first App Store submission prep + store checklists

> **READ CO and CP BEFORE doing anything with Apple or the Play Store.** They are the owner's
> step-by-step checklists. Tick items off in this file as they are done (change `[ ]` to
> `[x]` and add the date), so the next session knows where things stand.

### CN. What changed today (record)

**Nothing from today has been sent by OTA.** The owner is testing on an iPhone via a new
Sideloadly build first. Backend and database changes ARE live in production. Installed
apps only get today's app changes through the next OTA or store build.

| Commit | What | Where it lives |
|---|---|---|
| `b09986d` | **Account deletion purges all personal data**, not only profile columns: name ("Deleted user"), addresses, favourites, reviews (ratings recomputed), voice notes, free-call bookings, notifications, support tickets/conversations, WhatsApp conversations, chat messages, and the photo/voice-note FILES in the public `app-images` bucket. Astrologers: bank/UPI, photo, reviews about them, devices; upcoming free calls go back to the unassigned queue. KEPT (tax law): sessions, wallet/vendor/coin/gift ledgers, orders (+invoice name/phone/address), withdrawals, referrals, safety reports. 30/30 verified on live DB. | `astrowani-backend/src/accountRoutes.js` (purge runs BEFORE the row delete, throws on failure so a retry finishes it) |
| `279aecf` | **iOS hides every digital purchase** for the first App Store build: Astro Reports (Home section + Reports circle), ₹1 Free Services section, gifts (profile + live), StoreKit init; purchase hooks refuse too. Android unchanged. Also fixed the **profile Video button doing nothing on all platforms** (`isVideoWaiting` was undefined). | switch: `DIGITAL_PURCHASES_ENABLED` in customer `src/utils/payments.js` |
| `f2d12e1` | **iPhones never get a Play Store link or the custom "rate us" popup** (App Store 2.3.10 / 5.6.1). The admin-saved store URL used to be served to iOS too. | `astrowani-backend/src/appPromptRoutes.js`, both apps' `src/utils/appPrompts.js` |
| `6a9e629` | **Live comment moderation (both platforms)**: backend verifies sender, name from DB, word filter (EN + Hindi), 1/sec, 200 chars, admin ban, host block; customer can report a comment / block the person / report the stream; astrologer can report / report+block / block (reuses `customer_blocks`, also clears their comments from every viewer via `live_hide_sender`). New admin **Moderation (Reports)** page (live comment reports + the astrologer-filed customer reports, which had no page before). **Free 5-minute AI chat hidden on iOS** (Gemini under a persona with no AI disclosure/consent — 5.1.2(i)). 30/30 verified. | `src/liveModeration.js`, `sql/live_comment_moderation.sql` (APPLIED), `components/LiveReportSheet.js`, vendor `ReportCustomerSheet.js`, admin `pages/Moderation.jsx`; iOS switch `FREE_BOT_CHAT_ENABLED` in customer `src/utils/featureFlags.js` |
| `fc964c0` | **Wani Shop health claims reworded** (7 items, e.g. "will revoke death if critical condition in hospital", "cure severe illnesses", fertility/pregnancy promises, "Medicine Charging", "Cure" titles). APPLIED to production. Original text kept for rollback. | `sql/remedy_copy_health_claims_20260916.sql` |
| `38a8ce3` | **Store reviewer astrologer approved but hidden from customers.** New column `astrologers.hidden_from_customers` (APPLIED), checked by `astrologerVisibleToCustomers` + the `/api/astrologers` query. The reviewer astrologer (9999999999) had been stuck on `pending` since 2026-08-14. | `index.js`, `sql/astrologer_hidden_from_customers.sql`; memory `store_reviewer_accounts` |

**Owner documents written today** (in `MD files/`):
- `Astrowani-Policy-Page-Fixes.docx`: exact find/replace for Privacy Policy (4), Terms (3), Refund (4), Child Safety (2). Safety Guidelines needs nothing.
- `Astrowani-Delete-Account-Page.docx`: full text for `astrowani.com/delete-account/`, which currently returns **404**.

**Work from ANOTHER session, seen but not made here:** customer `versionCode` 40 → **41**, Meta SDK switched ON for Android (`react-native.config.js` android exclusion removed, ids in `strings.xml` + `adTracking.js`), and `D:\Astrowani-Releases\astrowani-customer-24.1-41.aab` built **2026-09-16 22:10**. Those files were committed by that session in `a4687e5` (`adTracking.js` had already been swept into `279aecf` by mistake). Build 41's merged manifest was checked: it DOES contain `com.google.android.gms.permission.AD_ID`, `ACCESS_ADSERVICES_*` and `FacebookActivity`. Firebase Analytics is still `android: null`. **Build 41 was built BEFORE `279aecf`…`38a8ce3`**, so it does NOT contain today's live-report UI (checked: the bundle has no `liveReport` strings).

**Reviewer logins (both apps, both stores):** mobile **9999999999**, OTP **123456** (no SMS sent). Customer = "Test User"; astrologer = "Play Store Reviewer" (approved, `hidden_from_customers = true`).

**Review notes to paste** (App Store Connect → App Review Information → Notes):

- Customer app:
  > Astrowani connects users with human astrologers for live, real-time one-to-one chat, voice and video consultations (App Store Review Guideline 3.1.3(d), Person-to-Person Services). The in-app wallet is used only to pay for these live consultations and for physical products (gemstones, puja items) shipped to the user (3.1.3(e)). No digital content is sold in the iOS app.
  >
  > Demo login: mobile 9999999999, OTP 123456.
- Astrologer app:
  > Astrowani Astrologer is the app used by verified astrology experts to take live one-to-one chat, voice and video consultations booked through the Astrowani customer app, and to track their earnings. New astrologer sign-ups are reviewed by our team before they can take consultations, so please use the approved demo account below.
  >
  > Demo login: mobile 9999999999, OTP 123456.
  >
  > The demo account is kept out of public listings, so it will not receive real customer requests during review.

**Positioning, decided by the owner:** Astrowani is a **lifestyle** app (live guidance from experts, pujas, gemstones), NOT a fortune-telling app. App Store primary category **Lifestyle**. In the name, subtitle, description, keywords and screenshots avoid "fortune telling", "predict your future", "horoscope predictions" and "lucky numbers". Screenshots should show live consultations, experts and the shop, not reports or horoscopes (those are hidden on iOS anyway).

### CO. OWNER CHECKLIST: Apple Developer enrolment → first App Store submission

Two iOS apps: **Astrowani** (`com.astrowanicustomer`, version 24.1) and **Astrowani Astrologer** (`com.astrowaniVendor`, version 6.6). Both are iPhone-only (no `TARGETED_DEVICE_FAMILY`). Steps marked **(Claude)** are for Claude, and only need the owner to send the values asked for.

#### Phase 1: website (can be done today, before Apple)
- [ ] **Publish `astrowani.com/delete-account/`**, using `MD files/Astrowani-Delete-Account-Page.docx` (copy everything below the yellow box). The slug must be exactly `delete-account`. It is **404 right now** and both apps link to it.
- [ ] **Apply the policy fixes** in `MD files/Astrowani-Policy-Page-Fixes.docx`: Privacy Policy (4), Terms & Conditions (3), Refund & Cancellation (4), Child Safety (2).
- [ ] If the owner will run Meta ads (build 41 already has the Meta SDK), add **Meta** to the Privacy Policy's third-party list (Change 4 in the doc).
- [ ] Confirm the **8-year retention** figure with the accountant (delete-account page, "What we keep, and why").
- [ ] Send a test email to **support@astrowani.com** and **security@astrowani.com** and confirm both arrive. If the Contact Us page has no "Security / Vulnerability Report" option, delete that line on the Report Vulnerability page.
- [ ] Fix the website title typo **"Exprienced"** → "Experienced" (WordPress → Settings → General → Site Title/Tagline). It shows in every browser tab, including to reviewers.
- [ ] **(Claude)** Re-read all 7 pages in a real browser and confirm every change landed. Note: curl gets **429** from Hostinger on these pages, so use the Browser pane.

#### Phase 2: test the current build on an iPhone (Sideloadly, no Apple account needed)
- [ ] Build a new unsigned IPA from `main` (GitHub Actions → "iOS unsigned IPA" → target `device`) and sideload it.
- [ ] Log in with 9999999999 / 123456.
- [ ] Confirm these are **NOT visible**: Astro Reports section, Reports circle, Free Services section, gift buttons (profile + live), the free-chat banner/popup, the "Coming soon" strip, and any "Rate on Play Store" text.
- [ ] Start a chat and send messages.
- [ ] Place an audio call and a video call to a real astrologer.
- [ ] Recharge the wallet: once with UPI (should jump to PhonePe/GPay and back), once with a card, and once closing the sheet without paying (nothing charged, no error shown).
- [ ] Place one Wani Shop order.
- [ ] Watch a live stream: see the ⋮ on other people's comments, report one, block one, and use the flag to report the stream.
- [ ] Open Menu → Settings → Delete Account → cancel. Do **not** delete the reviewer account.
- [ ] Tap every legal link in the app and check each page opens.
- [ ] If an iPad is available, sideload there too. The old "Home cards can't be tapped on iPad" bug (memory `ios_home_touch_investigation`) is still unexplained, and Apple sometimes reviews iPhone apps on iPad.
- [ ] Report anything broken to Claude **before** enrolling. Fixes then go into the first real build.

#### Phase 3: Apple Developer Program enrolment
- [ ] **Decide the account type.**
  - **Organization** if Astrowani is a registered Pvt Ltd/LLP: the App Store shows the company as seller. Needs a D-U-N-S number, a company website and a company-domain email.
  - **Individual** otherwise: shows the owner's legal name. Faster.
  - Note: the Privacy Policy currently says "astrowani.com is not a registered firm" while also calling it "the firm Astrowaniindia". Make the policy match whichever you choose.
- [ ] Apple Account (account.apple.com): company email, **two-factor authentication ON**, legal name exactly as on your ID/company papers.
- [ ] A card with **international payments enabled**. The fee is US$99/year, charged in INR.
- [ ] **Organization only:** check or request a **D-U-N-S number** at developer.apple.com/enroll/duns-lookup (free). Use the company name exactly as registered with the MCA. It takes ~5 working days, then ~2 more days for Apple to see it.
- [ ] Enrol through the **Apple Developer app** on an iPhone (Account → Enroll Now) or at developer.apple.com/programs/enroll. Pay.
- [ ] **Organization:** answer Apple's verification phone call.
- [ ] Wait for the **"Welcome to the Apple Developer Program"** email.
- [ ] developer.apple.com/account → Membership details → note the **Team ID** (10 characters) → **send it to Claude**.
- [ ] If enrolment is still pending after 7 days (Individual) or 14 days after D-U-N-S (Organization), contact Apple: developer.apple.com/contact → Membership and Account.

#### Phase 4: agreements (App Store Connect → Business)
- [ ] Accept the latest **Apple Developer Program License Agreement**. Nothing can be submitted until it is accepted, and Apple re-asks when it changes.
- [ ] The **Free Apps agreement** is automatic. The first build sells nothing through Apple, so the **Paid Apps agreement, bank details and tax forms (PAN/GST)** are NOT needed yet. They become required only when coins/In-App Purchase are turned on (Phase 9).

#### Phase 5: identifiers, push keys, server config
- [ ] Certificates, Identifiers & Profiles → **Identifiers**: confirm (or create) App IDs `com.astrowanicustomer` and `com.astrowaniVendor` with the **Push Notifications** capability enabled. EAS/Xcode may create these automatically on the first signed build. **(Claude** can do this via EAS with the owner signed in.)
- [ ] **Keys → + → Apple Push Notifications service (APNs)** → download the **`.p8` file**. It can be downloaded **only once**, so store it in a password manager. Note the **Key ID**. One key works for both apps.
- [ ] Firebase console → Project settings → **Cloud Messaging** → iOS app `com.astrowanicustomer` → upload the `.p8` (Key ID + Team ID).
- [ ] Repeat for the iOS app `com.astrowaniVendor`. Without this, no push notification reaches any iPhone, including astrologers' incoming chat/call alerts.
- [ ] **VoIP push for the astrologer app** (rings the phone when the app is killed). Set in the VPS backend `.env`, then run `pm2 restart astrowani-backend --update-env`:
  - [ ] `APNS_KEY_ID`
  - [ ] `APNS_TEAM_ID`
  - [ ] `APNS_PRIVATE_KEY` (contents of the `.p8`; `\n` newlines accepted) or `APNS_PRIVATE_KEY_PATH`
  - [ ] `APNS_VOIP_TOPIC=com.astrowaniVendor.voip` (**the `.voip` suffix is required**; without it you get `TopicDisallowed`, which reads like a credential problem)
  - [ ] **`APNS_PRODUCTION=true`**, but only once TestFlight/App Store builds are in use. It defaults to sandbox. **This flag is the #1 cause of VoIP push silently doing nothing.** Sideloaded/dev builds need `false`, TestFlight/App Store builds need `true`.
  - Details: `astrowani_vendors-main/ios/README-iOS-SETUP.md`.

#### Phase 6: App Store Connect records (both apps)
- [ ] appstoreconnect.apple.com → **My Apps → + → New App**, for each app: platform iOS; name (must be unique on the App Store, e.g. "Astrowani" / "Astrowani Astrologer", with a fallback ready); primary language English; bundle ID; SKU (e.g. `astrowani-customer-ios`, `astrowani-astrologer-ios`).
- [ ] **Category:** primary **Lifestyle** for both (see CN positioning).
- [ ] **Age rating questionnaire → 18+.** The Terms and Child Safety pages say 18+. Answer honestly: users can chat and interact (yes); user-generated content (yes, live comments); web access limited to our own shop.
- [ ] **Privacy Policy URL:** `https://astrowani.com/privacy-policy/`. **Support URL:** e.g. `https://astrowani.com/` or a contact page. **Copyright:** "2026 <legal name>".
- [ ] **App Privacy (nutrition labels)** must match the Privacy Policy and the app:
  - **Contact info:** name, email, phone.
  - **User content:** photos (profile, palm), other user content (chat messages, reviews, live comments, birth details), customer support.
  - **Location:** precise, only when "use my current location" is used for an address.
  - **Purchases:** purchase history.
  - **Identifiers:** user ID.
  - **Usage data:** product interaction (PostHog).
  - **Diagnostics:** crash data, performance (Sentry).
  - All **linked to the user**.
  - **Tracking: No.** The iOS build has no ad SDKs: Meta and Firebase Analytics are `ios: null`. If that ever changes, the App Tracking Transparency prompt and a "Yes" are required.
  - Payment details are handled by Razorpay and not collected by us.
- [ ] **Pricing:** Free. **Availability:** your choice, but **untick China for Astrowani Astrologer** (it uses CallKit, and Apple rejects CallKit apps on the China storefront).
- [ ] **Screenshots:** iPhone **6.9" (1320×2868)** is required; 6.5" is optional. No iPad screenshots (the apps are iPhone-only). Show live consultations, experts, chat and the shop. Do **not** show reports, horoscopes, gifts, free services or the free chat (hidden on iOS, and they don't fit the lifestyle positioning).
- [ ] **Description, subtitle, keywords:** lifestyle wording (CN). Don't mention Android, Google Play, or prices that differ by platform.
- [ ] **App Review Information:** contact name/phone/email, **sign-in required: Yes**, demo account **9999999999 / 123456**, and the Notes text from CN (a different note for each app).
- [ ] **Version release:** "Manually release this version", so the owner controls launch day.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption=false` is already in both Info.plists, so there are no encryption questions per build.

#### Phase 7: signed builds + TestFlight
- [ ] **(Claude)** With the Team ID: set up signing (EAS `credentialsSource: remote` is already in both `eas.json`), build `production` for both apps, and submit to App Store Connect (`eas submit` or Transporter).
  - `CURRENT_PROJECT_VERSION` is 1 in both projects and must go up on every upload.
  - Check that iOS OTA targets the same `24.1` / `6.6` versions.
- [ ] Wait for processing (~15–30 min), then add the owner and testers under **TestFlight → Internal Testing**.
- [ ] **Two real iPhones**, one with each app:
  - [ ] **Push:** a customer chat request reaches the astrologer iPhone.
  - [ ] **VoIP:** with the astrologer app **fully killed**, a customer call rings full-screen (CallKit), answering lands in the call, and hanging up ends it on both phones. If it doesn't ring, check `APNS_PRODUCTION=true` first.
  - [ ] Audio and video both ways, mute/speaker/camera, and a call with the astrologer app backgrounded.
  - [ ] Everything from Phase 2 again, on the signed build.
  - [ ] Astrologer app: log in with 9999999999, toggle online/offline, go live, and report/block a comment.

#### Phase 8: submit for review
- [ ] Attach the TestFlight build to the version in App Store Connect, check the review notes and demo login again, then **Submit for Review**, for each app.
- [ ] Review usually takes 24–48 h. **If rejected, paste Apple's full message to Claude** before changing anything. Most fixes are JS and can ship in a new build quickly.
- [ ] After approval: **Release** manually.

#### Phase 9: after the first approval
- [ ] **(Claude)** Once the App Store IDs exist:
  - [ ] set `APP_STORE_URL` in customer `src/config/api.js` and `CUSTOMER_APP_STORE_URL` in vendor `src/config/api.js` to `https://apps.apple.com/app/id<ID>` (adds the iPhone line to share messages);
  - [ ] fill `APP_STORE_URLS` in `astrowani-backend/src/appPromptRoutes.js`;
  - [ ] add the App Store link on astrowani.com;
  - [ ] OTA both platforms.
- [ ] **Later builds, not the first:**
  - **Coins / In-App Purchase:**
    - Paid Apps agreement + bank + tax forms.
    - Create the 5 products in App Store Connect; ids must equal `coin_packs.product_id`.
    - Apple root certificates in `astrowani-backend/certs/apple/`.
    - `APPLE_IAP_APP_APPLE_ID` in the VPS `.env`.
    - App Store Server Notifications V2 URL `https://backend.astrowani.com/api/apple/notifications` (Production + Sandbox).
    - Set `DIGITAL_PURCHASES_ENABLED` to `true` (see subsystem BA).
  - **Free AI chat on iOS:** first add a clear "AI assistant" label and a consent screen before any birth details go to Gemini, then set `FREE_BOT_CHAT_ENABLED` to `true`.
  - **Review prompt on iOS:** only via Apple's own `SKStoreReviewController`, never the custom popup.
  - **iPad support:** only after the iPad touch bug is solved.

### CP. OWNER CHECKLIST: Play Store uploads

#### Customer app: build 41
Artifact: `D:\Astrowani-Releases\astrowani-customer-24.1-41.aab` (versionCode 41, versionName 24.1). Contains the **Meta SDK** → `AD_ID` permission.
- [x] **(Claude)** Commit the other session's files (`build.gradle` versionCode 41, `strings.xml` Meta ids, `react-native.config.js`), so git matches build 41. Done 2026-09-16 in `a4687e5`.
- [ ] **Play Console → App content → Advertising ID:** change to **"Yes"**, with purposes **Analytics** and **Advertising or marketing**. **The release is rejected without this**, because build 41 declares `AD_ID`. Builds 37–40 did not, which is why the earlier answer was "No".
- [ ] **App content → Data safety:** update and resubmit.
  - [ ] Device or other IDs: **collected and shared** (Meta) for advertising/analytics.
  - [ ] App activity / app interactions: collected (PostHog, Meta).
  - [ ] Keep: personal info (name, email, phone), photos, messages, location (approximate/precise, optional), financial info (purchase history), crash logs.
  - [ ] Data encrypted in transit: Yes.
  - [ ] **Users can request deletion: Yes**, with the URL `https://astrowani.com/delete-account/`. **Publish that page first** (CO Phase 1).
  - [ ] If the free AI chat stays on for Android: name, gender and birth details are shared with Google (Gemini). Declare it.
- [ ] **App content → Child safety standards:** URL `https://astrowani.com/child-safety/` + contact email `support@astrowani.com` (after applying the Child Safety fixes).
- [ ] **App content → Target audience:** 18+ (matches Terms). **Content rating** questionnaire: users interact/communicate; shares location (optional); digital purchases.
- [ ] Meta developer app: confirm Android platform settings are complete (package `com.astrowanicustomer`, class `com.astrowanicustomer.MainActivity`, key hash from Play Console → App integrity → App signing SHA-1, which Claude can convert), app is **Live**, and events show in Events Manager → Test events after install (see CH).
- [ ] Upload: Play Console → **Test and release → Internal testing** (recommended first) → Create new release → upload the AAB → release notes.
  - Install from the internal track on a real phone: login, chat, call, recharge, live stream.
  - Then **Production** → Create release → **staged rollout** (e.g. 20%) → review → roll out.
- [ ] **Build 41 lacks today's app changes** (the live comment report/block UI; the deletion purge and comment filtering are server-side and already live). Deliver them to Android by **OTA after build 41 is live** (`node scripts/deployOta.js -p android -m '"live comment reporting"'` from each app folder; see the traps in CB), or build 42. **Ask the owner before any OTA.**

#### Astrologer app: build 27
Artifact: `D:\Astrowani-Releases\astrowani-vendor-6.6-27.aab` (versionCode 27, versionName 6.6, built 2026-09-13). No native changes since, so later vendor JS changes (live report/block sheet, iOS guards) go by OTA.
- [ ] If not already uploaded: Internal testing → check on a phone → Production (staged).
- [ ] **Data safety:** users can request deletion → `https://astrowani.com/delete-account/`; bank/UPI details (financial info) collected for payouts; photos; messages; crash logs; app activity.
- [ ] **App content → Child safety standards** URL + contact, same as the customer app.
- [ ] **App access** (reviewer login): phone 9999999999, OTP 123456. The astrologer account is now approved (it was stuck on pending until 2026-09-16, so earlier Play reviews could only ever see "pending approval").
- [ ] Advertising ID: **No** (the vendor app has no ad SDKs).

#### Both apps, whenever uploading
- [ ] The signing key must be the upload key: customer CN=Astrowani Customer (SHA-256 `55:01:0B:59…`), vendor CN=Astrowani (`76:FC:45:AF…`). Check with `keytool -printcert -jarfile <aab>`. See the vendor `build.gradle` signing trap in CE.
- [ ] `versionName` stays **24.1** (customer) / **6.6** (vendor), so OTA bundles keep reaching the new build. Only `versionCode` goes up.
- [ ] Sentry source maps are not uploaded (no auth token on the build machine), so crash stack traces from these builds are minified.

#### Not store steps, but still open and related
- [ ] **Rotate the Razorpay live key** (still in git history): `MD files/razorpay-key-rotation-runbook.md`.
- [ ] Set `RAZORPAY_WEBHOOK_SECRET` + add the webhook in the Razorpay dashboard (BT item 7).
- [x] Apply `hardening_13`, then `11` + `12` — **DONE 2026-09-23**, plus `hardening_17` (BZ, CU).
- [ ] **Supabase Pro** for database backups (CA). A store launch will bring more users onto a database with no backups.
- [ ] Moderation: check admin → **Moderation (Reports)** at least daily once live. Both stores expect reported content to be handled promptly (aim for within 24 h).

### CQ. Google Ads live + customer build 42 (2026-09-17)

- **Google Ads account 819-134-9882** ("Astrowani", astrowaniindia@gmail.com) created. Payments profile is
  **Organization "ASTROWANIINDIA"**, tax info **Accepted** (GSTIN, Rajasthan), Postpay, no backup card yet.
- **Promotion 4DNF3-V3XPT-RMGW**: spend ₹20,000 (ex-GST) **by 2026-11-16** → ₹40,000 credit, which must be used
  within 60 days of being granted (~₹670/day). When the credit appears, raise the budget.
- **Campaign App-1**: App → App installs, Android `com.astrowanicustomer`, India, English + Hindi, All users,
  Maximize conversions, no target CPI, ₹400/day. Went Eligible (Learning) the same day.
- **Linked** to Analytics property `astrowani-b1845` (Personalized Advertising ON). Key events
  (`sign_up`, `purchase`, `consultation_connected`) still to be marked and imported **after build 42 has data**
  (CH steps 9–10). Then consider an in-app-action campaign.
- **Build 42** (`4274696`): `@react-native-firebase/analytics` Android exclusion removed (iOS still null), versionCode 42,
  versionName 24.1. Verified: signed CN=Astrowani Customer (SHA-256 55:01:0B:59…), merged manifest has AD_ID,
  FacebookActivity and `google_analytics_*` meta-data, no BILLING; invertase analytics, AppEventsLogger, RNShare and
  hotupdater in the dex; JS bundle includes the 2026-09-16 live-report UI. Built in 7m 58s after closing Notion.
  Artifact `D:\Astrowani-Releases\astrowani-customer-24.1-42.aab`. **Supersedes build 41** — upload 42, not 41.
  Play Console: Advertising ID "Yes"; Data safety must list Google as well as Meta.
- **Build 42 sent for Play review 2026-09-17** (production, replaces 39). Play blocked it at first with "an active artifact
  lacks AD_ID": the cause was OLD TEST TRACKS, not build 42 — Internal testing (build 2) and Closed testing Alpha (build 5)
  were still active. Both were **paused**; Open testing was already inactive. Any future "active artifact" manifest error:
  check every testing track, not just the release being edited.
- **Meta developer app 28499438753050213** (matches strings.xml/adTracking.js): switched **Live** 2026-09-17 (the header
  label kept saying "Development"; the Alerts inbox confirmed Live). Android platform: package `com.astrowanicustomer`,
  class `com.astrowanicustomer.MainActivity`, key hashes `JbM/6HQK1e+qnlMpzAK3AHybl9k=` (Play app-signing key) and
  `bpklq6iV+jKXLIXVzb8WDV4gOaY=` (upload key); auto-log in-app purchases OFF (no Play Billing). Privacy / terms
  (`https://astrowani.com/term_conditions/` — NOT terms-and-conditions, that 404s) / data-deletion
  (`/delete-account/`, now live) URLs set; App domains left EMPTY (adding astrowani.com demands a Website platform).
  Business verification not done (not needed for app events). Still to do: Events Manager data source, check events
  after build 42 installs, Meta ad account (INR + GSTIN), campaign.
- **Meta ad account "Astrowani Ads" 2075297189792991** (INR, inside the Astrowani business portfolio 1799253787875184),
  created 2026-09-17 — USE THIS ONE. The older personal ad account 768984796279174 could not be claimed into the portfolio
  (Meta requires a past payment first) and is unused. Add 2075297189792991 under the Meta app's Authorized ad account IDs.

---

## Feature added 2026-09-17: free-call invites by push (works while the offer is off)

### CR. Invite customers to the free 12-minute call

An admin sends a push + in-app notification; tapping it opens the same booking flow
(birth details, then time slot). **It works whether `free_call_offer.enabled` is on or off.**

- **Who can be invited:** anyone without a live (non-cancelled) free-call booking. For an
  invited customer the "brand-new customers only" rule is dropped. Once-per-customer is still
  the `free_call_bookings_customer_live_uniq` index.
- **DB:** `sql/free_call_invites.sql` — **APPLIED 2026-09-17.** One row per customer
  (unique `customer_id`, upsert refreshes `expires_at`), RLS on, service-role only.
- **Backend** (`src/freeCallRoutes.js`): `findActiveInvite()` (fails to null) is checked by
  `/api/free-call/offer` (adds `invited`), `/slots` and `/book`. Admin:
  `POST /api/admin/free-call-invites/preview`, `POST .../send`
  (`audience: all_not_booked | customers`, `validDays` 1-60, default 7), `GET .../summary`.
  Send writes invites FIRST, then `notifications` rows (`type: free_call_invite`), socket
  `new_notification`, data-only FCM, and a `notification_broadcasts` row with audience
  `free_call_invite:<audience>`. Soft-deleted customers and already-booked ones are skipped.
- **Customer app:** `utils/freeCallInvite.js` (`openFreeCallFromInvite` navigates to Home and
  queues the request if Home isn't mounted yet). Wired from `PushNotification.js` and
  `NotificationScreen.js`. Home re-fetches the offer and opens the sheet (source `invite`), or
  shows "already booked" / "offer ended". 4 new i18n keys, EN + HI.
- **Admin:** "Invite customers to a free call" card at the top of Free Call Bookings
  (`components/FreeCallInviteCard.jsx`) with a live recipient count.
- **Verified 25/25** against the live DB (bare Express harness, push stubbed, offer-off faked
  in memory, Test User 9999999999). Teardown left 0 invites / bookings / broadcasts.
  **Not tested on a device.** Installed apps need the customer OTA before a tap opens the
  booking; until then the tap only opens the app.
- **Shipped 2026-09-17:** backend + admin deployed (commit `80a9a9a`); customer OTA from R2,
  android `01a0affc-09dd…`, ios `01a0b004-83ef…`. The first iOS build attempt failed with no
  error shown and succeeded on a plain re-run of `deployOta.js -p ios`.

### CR. Excluding customers from analytics (2026-09-17)

Admin → Analytics → **"Excluded from analytics"** card (`astrowani-admin/src/components/AnalyticsExclusionsCard.jsx`):
search a customer by name/mobile, add or remove them. Stored as a JSON list of customer ids in
`app_settings.analytics_excluded_customers`, applied server-side by `astrowani-backend/src/analyticsExclusions.js`
(same in-memory + refresh-on-save pattern as `analyticsSince.js`).

- **A filter, not a delete.** Covers past data too; removing someone brings their numbers back.
- **PostHog cards:** `ENV_FILTER` in `postHogRoutes.js` adds
  `person_id NOT IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN (...))`. Excluding by PERSON also
  drops events from before they logged in on that phone (PostHog merges them on identify). Anonymous visitors who never
  logged in can't be excluded. Any new HogQL query must include `${ENV_FILTER}` or it will count excluded customers.
- **Database cards** (`adminRoutes.js` analytics routes): rows filtered with `withoutExcluded(rows, <customer column>)`
  on `wallet_recharges.customer_id`, `chat_sessions.caller_id`, `wallet_transactions.user_id`,
  `call_requests.customer_id`, `chat_requests.caller_id`. A new analytics route must do the same.
- `parseIds` keeps only well-formed UUIDs — that is also the HogQL injection guard. The settings PATCH normalises the value.
- Does NOT stop the apps sending events, and does not affect Meta/Google Ads conversions (option 2, not built).

Verified 2026-09-17: 10/10 module checks; against real PostHog, excluding one customer removed exactly their 135 screen
views and 1 unique user; all 15 PostHog routes and all 7 database routes answer 200 with the filter in place.

---

## Subsystem added 2026-09-19: Sentry → Claude auto-fixer → one-tap merge → deploy

### CS. The pipeline (replaces the paused 8-hourly `/bug-scan` routine)

```
Sentry issue created / regressed (production, error|fatal)
  -> POST /api/sentry/webhook      (src/sentryWebhookRoutes.js: HMAC verify, drop development
                                    + warnings, 24h dedupe, cap 6/hour 20/day)
  -> GitHub issue "Sentry <SHORT-ID>: …" labelled `sentry-alert`
  -> routine "Astrowani Sentry auto-fixer (webhook)" trig_01QMpuUSurEHBU7vnpKNHhQ4
     (GitHub issues.labeled trigger, Opus 5, env_01Cfa57DfbVUBXfUxyVQWJf8)
  -> either a `sentry-fix/<short-id>` PR ("Fixes #n", RISK line, "Ships as") or findings
     as a comment on the issue, or closes it as not worth fixing
  -> OWNER merges on the GitHub mobile app (the only human step)
  -> backend: deploy-backend.yml (existing) | apps: .github/workflows/ota-on-merge.yml
```

- **The routine's label filter was silently dropped at creation**, so the routine fires on
  EVERY `issues.labeled` event in the repo; its prompt's STEP 0 exits unless the label is
  `sentry-alert` and the title starts `Sentry `. Don't use labels heavily on this repo, or
  each one costs a (short) run.
- Routine connectors: the create call attached Supabase + Claude_Code_Remote by default.
  They were removed (only Claude_Docs left, with no permitted tools). **Never give this
  routine Supabase** (production write access) or Claude_Code_Remote (lets it schedule
  self-rearming check-ins, which is how the old bug-scan spammed).
- `ota-on-merge.yml` runs ONLY for merged `sentry-fix/*` PRs, OTAs only the app whose
  `src/` changed, and **refuses** a PR touching `package.json`/`android/`/`ios/`.
  `workflow_dispatch` = dry run (checks + both bundles, no upload).
- Both apps: `Sentry.init({enabled: !__DEV__})` — emulator errors no longer reach Sentry
  (they were 20 of 27 customer issues on 2026-09-19).

### Setup state (2026-09-19)
- [x] routine created, `sentry-alert` label created, relay + workflow committed
- [x] VPS `.env`: `SENTRY_WEBHOOK_SECRET`, `SENTRY_AUTH_TOKEN` (read-only), `GITHUB_ALERT_TOKEN`
      (fine-grained, this repo, Issues read+write only; GitHub secret name `ALERT_GITHUB_TOKEN`
      because secret names can't start with GITHUB_). Written by **`set-backend-env.yml`**
      (manual): it copies an allowlist of keys from GitHub secrets into the root-owned VPS
      `.env`, backs it up and restarts. The local `deploy` SSH user CANNOT write that file.
- [x] Sentry → Settings → Custom Integrations → Internal Integration, Webhook URL
      `https://backend.astrowani.com/api/sentry/webhook`, "issue" webhook on; its Client
      Secret = `SENTRY_WEBHOOK_SECRET`
- [x] GitHub secrets `HOTUPDATER_ENV_CUSTOMER` / `HOTUPDATER_ENV_VENDOR` (= each app's
      `.env.hotupdater`), then one `workflow_dispatch` dry run per app
- [ ] Owner: GitHub mobile app with notifications on for this repo

### Two things to know before touching this pipeline

- **THE REPO IS PUBLIC** (checked 2026-09-19). Every `sentry-alert` issue, routine comment
  and PR is world-readable, so the relay writes only the error title, culprit, counts,
  release and a Sentry link (login needed); the routine prompt forbids posting breadcrumbs,
  ids, phone numbers, URLs with ids or tokens. Do not "improve" the issue body with stack
  traces or breadcrumbs. Same reason: `android/gradle.properties` in both apps is tracked
  and holds the upload-keystore passwords, so they are public (the .keystore files are not).
- **The routine's Sentry token lives in its prompt** (claude.ai routine settings, not the
  repo). The first one (`f925…`, from the 08-04 bug-scan setup) is dead since the new
  "sentry bug fix agent cloud" integration was created; if the routine starts getting 401
  from Sentry, update the prompt with the integration's current token. Local copies of all
  three keys: `D:secretssentry.env` (outside the repo).
- Verified 2026-09-19: unsigned POST -> 401 "Bad signature"; signed test for REACT-NATIVE-Y
  created issue #19 and started the routine within seconds; OTA dry run (customer) built
  both bundles on the runner (7.7 MB each).

---

## Session 2026-09-23: the `authenticated` role was wide open (Supabase advisory)

### CT. Every table granted full access to a role nobody was watching

A Supabase advisory email (`rls_disabled_in_public` + `sensitive_columns_exposed`) led to
the largest security hole this project has had. **Applied to production the same day** —
`sql/hardening_15_revoke_authenticated_role.sql` and `sql/hardening_16_lock_call_history.sql`.

**What was exposed.** All **55** tables in `public` granted the Postgres `authenticated`
role full INSERT/SELECT/UPDATE/REFERENCES on **every column**: `admins` (login rows),
`otp_codes`, `withdrawal_requests`, both wallet ledgers, `astrologers`
(`bank_account_number`, `bank_ifsc`, `upi_id`, `wallet_balance`, `today_earnings`,
`phone_number`, `voip_token`) and `customers` (`mobile`, `wallet_balance`, `coin_balance`,
`dob`).

**Nobody granted it.** It is the Supabase project template's DEFAULT PRIVILEGES:

```
pg_default_acl, schema public, objtype 'r' (tables):
  supabase_admin -> {anon=arwdDxtm, authenticated=arwdDxtm, service_role=…}
  postgres       -> {authenticated=arwdDxtm, service_role=…}
```

so every `CREATE TABLE` auto-granted it from the day the project was created.

> **THE RULE THIS PRODUCES — and it is the important part of this section.**
> `hardening_01` … `hardening_14` are a long, careful, genuinely good sequence of access
> audits. **Every single one of them reasoned only about `anon`** — the key shipped inside
> both APKs, the obvious attacker path — and not one looked at `authenticated`. A dozen
> passes over "who can reach this table" all shared the same blind spot, because they all
> started from the same mental model. **When auditing Postgres access here, enumerate
> `information_schema.role_table_grants` by grantee with no WHERE clause first, and check
> `pg_default_acl` as well** — the roles you did not think to name are exactly the ones that
> will be open, and a default privilege re-opens the hole on the next migration no matter how
> many REVOKEs precede it.

**Why it was exploitable.** The apps do not use Supabase Auth — they use our own Express JWT,
which is why `auth.uid()` is always NULL and why RLS policies are not expressible on the core
tables (subsystem U). `select count(*) from auth.users` = **0**. But GoTrue is enabled by
default on every Supabase project and is reachable with the publishable key baked into both
APKs. Anyone could have signed up through Supabase directly — no app involvement at all —
and received a valid `role: authenticated` JWT carrying full read/write on everything above.
RLS being off on the core tables meant there was no second line of defence behind the grant.

**Why the fix was safe.** Nothing legitimate uses that role: the backend runs on the
**service role** (bypasses grants and RLS), the apps and admin read through **`anon`**
(untouched — its 16 tables are exactly as they were), and `grep -r "supabase.auth."` across
both apps and the admin returns zero hits. `hardening_15` revokes tables, sequences and
functions, **and fixes the `postgres` default privileges** so new tables do not re-open it.

**`hardening_16`** closed `call_history`, found during the same pass: fully anon-readable —
`client_name`, `astrologer_name`, avatars, `charge_per_minute`, `total_charge`,
`duration_minutes`. A downloadable log of who consulted whom and for how much. It has **zero
readers** in all three codebases; its only references are the two account-deletion UPDATEs in
`src/accountRoutes.js` that scrub exactly those columns as PII, and those run on the service
role. Revoked from anon, RLS enabled.

### Verified against production 2026-09-23

`authenticated` now holds **0** privileges on tables, routines and sequences; `anon` still
has its **16** tables. Through the real REST API with the publishable key: `customers`,
`otp_codes`, `admins`, `withdrawal_requests`, `wallet_transactions`, `call_history` and
`astrologers.bank_account_number` all answer **42501**, while `astrologers`, `app_settings`
and `chat_sessions` still answer **200** (so the apps keep working), and every backend
endpoint answers 200. The Supabase `rls_disabled_in_public` ERROR went from **8 tables to 2**.

### Still open (deliberately — these need app changes first)

- **`chat_requests`** — anon can SELECT all 8 columns (`caller_id`, `caller_name`,
  `receiver_id`, …) and UPDATE `status`/`responded_at` on ANY row. Read directly by the
  vendor app in 3 places (`MissedSessionsHome.js`, `CustomDrawer.js`, `HomeScreen.js`).
- **`chat_sessions`** — anon can SELECT 13 columns. Read directly by both apps in 8+ places.

  These are the same move-to-backend-then-revoke pattern as BU/BV/BW: add an endpoint,
  migrate the app reads, OTA, wait for adoption, then revoke. Much lower severity than what
  was just closed (session metadata and names, not bank details or OTP codes), but real.
- **`supabase_admin`'s default privileges still auto-grant to `anon` AND `authenticated`**
  on new tables. Could not be altered from here (owned by a Supabase-internal superuser;
  `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` fails as `postgres`). Latent rather than
  live: tables created from the SQL editor / MCP / migrations are owned by `postgres`, whose
  default is now clean. **If a future table somehow comes back world-open, this is why** —
  check `pg_default_acl` before assuming a migration misfired.
- **The 31 `rls_enabled_no_policy` INFO lints are FINE, not a to-do.** RLS on with no policy
  means deny-everyone, which is the correct posture for a table only the service role should
  touch. Do not "fix" them by adding permissive policies.

### CU. The overdue write-revokes are applied — and the log check that unblocked them

`hardening_11`, `12`, `13` (written 2026-09-11, scheduled for "on or after 2026-09-18",
still unapplied on 2026-09-23) plus a new **`hardening_17`** are all **APPLIED to production
2026-09-23**. Net result, asserted globally by hardening_17's own tail:

> **`anon` and `authenticated` now hold ZERO INSERT/UPDATE/DELETE privileges anywhere in
> `public`.** Every write to this database now goes through the backend or the service role.

What was still open until then, on any row, to anyone holding the publishable key that ships
inside both APKs: `astrologers.fcm_token` (redirect an astrologer's incoming-call pushes) and
the five availability toggles (take any astrologer offline, or switch a suspended one on),
`call_requests.status` / `chat_requests.status` (cancel other customers' pending
consultations), and `notifications.is_read`.

**`hardening_17` is new and finishes `hardening_13`.** That file revoked only `status`, but
the app used to write companion columns in the *same* statement — `call_requests.responded_at`
and `session_id`, `chat_requests.responded_at`. After hardening_13 those were the last write
grants left in the database. `session_id` is the one worth naming: a table-wide UPDATE meant a
request row could be repointed at a different session.

> **THE METHOD THAT ACTUALLY UNBLOCKED THIS, and the one to reuse.** BZ's precondition was a
> device test ("toggle online/offline on a real phone, confirm a call still rings"), which is
> one phone, once, and had gone undone for five days. BZ also offers a second route — "apply
> sooner if the Supabase API logs show no direct anon writes for a day or two" — and that is
> strictly better evidence, because it covers the entire installed base. Use
> `query_logs` on `source = 'edge_logs'` and group by
> **`log_attributes['request.sb.jwt.apikey.payload.role']`**.
>
> **Do not read the raw request counts and stop there.** The trailing 24h showed 2,888 PATCHes
> to `chat_requests`, 2,876 to `call_requests` and 159 to `astrologers` — which reads as
> "thousands of live direct writes, do not touch this." Broken down by role, **every single
> one** was `service_role` with `x_client_info: supabase-js/2.108.2; runtime=node` — i.e. our
> own backend, which bypasses column grants entirely and cannot be affected by a revoke. The
> only non-service-role traffic in the whole window was 814 OTA update-check RPCs
> (`get_target_app_version_list`, `get_update_info_by_app_version`). **Zero anon writes to any
> table.** The apps had fully migrated; the raw count was measuring the thing that was never
> at risk. Corroborated in code: every remaining `.from('call_requests')` /
> `.from('chat_requests')` call in both apps is a `.select()`.
>
> That 814/day figure is also why `hardening_15` deliberately left `anon`'s EXECUTE on the
> hot-updater routines alone — revoking it would stop OTA updates reaching every installed app.

**Verified against production afterwards**, through the real REST API with the publishable
key: `astrologers.is_online`, `astrologers.fcm_token`, `call_requests.status`,
`chat_requests.status`, `notifications.is_read` and `call_requests.session_id` all answer
**401/42501** to a PATCH, while `astrologers`, `chat_sessions`, `chat_requests`,
`call_requests`, `notifications` and `app_settings` still answer **200** to a SELECT so the
apps keep working. All backend endpoints 200; the three replacement endpoints
(`/api/vendor/availability`, `/api/vendor/fcm-token`, `/api/notifications/read`) still routed.

**Still open** — unchanged from CT, and now the only remaining public exposure: anon SELECT on
`chat_requests` (8 columns incl. `caller_name`) and `chat_sessions` (13 columns). Those have
live app readers and need the move-to-backend-then-OTA-then-revoke treatment; the two
Supabase `rls_disabled_in_public` ERRORs are exactly these.

---

## Subsystem added 2026-09-23: offline QR poster attribution

### CV. One printed code per location, and what each one actually brought in

Posters going up in Haridwar and Rishikesh. Each carries its own Play Store link, so a
customer who scans it is tagged with that poster for life, and the admin can see which
walls produce paying customers rather than which produce scans.

**THE RULE THE WHOLE THING RESTS ON: every poster's `utm_source` starts with `qr_`.**
Google Ads sets its own `utm_source` and organic Play browsing sends
`utm_source=google-play&utm_medium=organic`, neither of which can begin with that
prefix — so "is this a QR customer" is a prefix test and the three channels can never
be mixed. There is no channel column and none is needed. `src/acquisition.js` owns the
rule, `qrRoutes.js` enforces it server-side on create (400), and a poster registered
without it would silently never match.

**The chain:** poster QR → Play Store link with `referrer=utm_source=qr_<place>` →
Play retains it → `InstallReferrerModule.kt` reads it → sent with the OTP verify →
`customers.acquisition_source`.

| Piece | Where |
|---|---|
| `sql/acquisition_source.sql` | `customers.acquisition_source` + `acquisition_raw` + partial index. **APPLIED 2026-09-23.** |
| `src/acquisition.js` | parsing, sanitising, the `qr_` rule, channel bucketing |
| `index.js` `mobile-otp-verify` | accepts `acquisitionSource`/`acquisitionRaw`, writes on the INSERT branch only |
| `src/qrRoutes.js` | `/api/admin/qr/sources` (+ `/:source`, PUT, DELETE) |
| customer `android/.../InstallReferrerModule.kt` + `Package.kt` | the native read |
| customer `src/utils/acquisition.js` | reads it at signup, guarded + timed out |
| admin `pages/QrCodes.jsx` | the page; generates the printable QR with `qrcode` |

**Things that are load-bearing — do not "simplify" them:**

- **Attribution is written ONLY on the branch that creates the account**, never on the
  existing-customer branch. A returning customer who reinstalls after scanning carries
  that poster's referrer, and crediting it would re-attribute someone the poster did
  not win. Acquisition is a property of the account's origin, not of a login.
- **It is a SEPARATE update, not part of `insertAccountRow`.** That helper drops its
  optional columns as one group on a missing-column error, so folding these in would
  mean an unapplied migration silently costs the terms-acceptance record too — legally
  meaningful, where this is only marketing. Best-effort: the account already exists by
  then and a failure here must never fail a signup.
- **The client is not the authority on what gets stored.** `resolveFromRequest` always
  re-derives the source from the raw referrer and re-sanitises; a hand-crafted request
  cannot write an arbitrary string into a column the admin reads back.
- **Sent on BOTH the signup and login paths.** The login screen's own notice also
  creates accounts for a new number (`termsAccepted`'s `login_notice` branch), so
  gating on `isSignup` would drop attribution for anyone who tapped Login.
- **`null` means UNKNOWN, not organic** — every pre-2026-09 customer, every iOS
  customer, every sideload. Do not write a query that folds them together.
- **The overview is the UNION of the registry and the sources seen in the data.** A
  registered poster with no signups must appear (it is how you check the link was
  printed right), and an unregistered source appearing in the data must also appear, or
  a typo'd poster reads as a dead location rather than a bad link.
- **Deleting a poster removes its label, never its attribution** — its customers keep
  `acquisition_source` and it reports on under its raw code.
- **`chat_sessions` has NO `duration_minutes` column** (CLAUDE.md claimed it did —
  wrong, measured 2026-09-23). Duration is `ended_at - started_at`, with the same
  12-hour implausible-session exclusion as `/api/admin/analytics/session-volume`.

**iOS gets nothing here and that is expected** — there is no Play Install Referrer
equivalent without a paid attribution SDK. An iPhone-heavy spot can look dead while
working. The page says so.

**What this can and cannot answer.** Scans happen in a phone's camera and installs that
never sign up leave no row, so neither is here — those are Play Console → Grow →
Acquisition, grouped by `utm_source`. This page starts at signup and covers everything
after it, which is the half Play Console cannot give you.

### ⚠️ This needs a STORE RELEASE, not an OTA
`InstallReferrerModule.kt`, its Gradle dependency and the `MainApplication` registration
are native. The JS is OTA-safe (the native module is presence-guarded, so an older build
running this bundle simply reports no attribution) — but **no attribution is captured
until a build carrying the native module is on the Play Store**, which is also the build
a poster-scanner downloads. Merged manifest gains exactly one permission,
`com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` (normal-level,
no user prompt, no Play Console declaration); verified no BILLING permission appears.

### Verified 2026-09-23
- Parsing/sanitising **27/27** offline.
- Routes **43/43** over HTTP against the LIVE database via a bare Express harness
  (**`index.js` never booted** — it starts sessionManager's billing worker against
  production): auth refusals, the `qr_` enforcement, a zero-signup poster still listed,
  the funnel arithmetic (2 recharges from 1 customer = 1 paying customer, not 2), the
  12-hour session exclusion (20 minutes counted, a 40-day zombie session counted as a
  session but contributing 0 minutes), no leakage between two posters, `google-play`
  refused as a QR source, unregistered sources still visible, and delete/archive keeping
  attribution. Teardown asserted 0 synthetic rows and the registry restored exactly.
- **QR round trip 27/27**: the generated PNG was decoded with a real decoder (`jsqr`)
  and the decoded text equals the link byte-for-byte across four source lengths; its
  referrer then resolves back to the same poster through the real backend parser, while
  Google Ads / organic referrers never match. **This is the check that matters** — a QR
  encoding the wrong thing is a wall poster that tracks nothing for weeks.
- Admin page driven in a browser against that harness (gitignored `.env.local`, removed
  after): stats correct, the zero-signup poster listed, drill-down renders the QR and
  the right 6 customers, the create form auto-prefixes and strips illegal characters.
- `:app:compileDebugKotlin` **BUILD SUCCESSFUL** (13 tasks executed, so the new Kotlin
  genuinely compiled) — from **PowerShell**, not the Bash tool. Admin `npm run build`
  succeeds. Customer app lint clean.

**Not exercised on a device.** The native read needs a real Play-installed build; that
is the one thing only a store release can prove.

---

## Subsystem added 2026-09-25: off-platform contact flags (chat)

### CW. Detecting astrologers moving customers off the platform

Every chat message is described by `src/contactLeakDetector.js` (pure, no I/O): phone
numbers (digits, +91/0 prefixes, Devanagari digits, spelled-out English/Hindi digits,
"double nine", keycap emoji), emails, UPI ids, links, social handles (HIGH), and channel
names / "give me your number" wording (LOW). A match is written to `session_flags`
(`sql/session_flags.sql`, **APPLIED 2026-09-25**, service-role only) by
`contactLeakRoutes.recordChatFlag()`, called fire-and-forget from `POST /api/chat/message`.
**It records; it never blocks or delays a message.** (Updated same day: the server now also MASKS contact details -- see the end of this section.) Admin review: sidebar "Off-platform
Contact Flags" (`pages/SessionFlags.jsx`) with severity/status/sender filters, the
surrounding conversation, and a 30-day repeat-offender tally.

- A phone only counts when, after stripping a +91/91/0 prefix, a run is EXACTLY ten digits
  starting 6-9. Birth details ("15 08 1995 10 30") are twelve digits in a row and must not
  flag; commas and slashes end a run. Do not loosen this to windows/substrings -- a DOB
  like "26 09 1995 06 45" contains a valid-looking mobile as a sliding window.
- Flags survive account deletion (person links become NULL), like `customer_reports`.
- Verified: detector 28/28, routes 11/11 against the live DB (bare Express harness,
  `index.js` never booted), admin build OK. Not exercised from a real chat on a device.
- **NOT built: call recording.** Calls are P2P WebRTC; the server never sees media.
  Options and the consent/legal prerequisites are in the 2026-09-25 session notes.
  Also unresolved: account deletion (subsystem CN) purges `chat_messages`, which
  conflicts with keeping chats as evidence -- needs an owner retention decision.

- **Masking (2026-09-25, later):** `maskContacts()` in the detector runs in `POST /api/chat/message`
  BEFORE the insert, so phone numbers, emails, UPI ids, links and handles are saved as stars
  (one star per digit/letter, separators kept). The response carries `masked: true`. Wording-only
  matches ("whatsapp", "apna number de do") are flagged but NOT masked. The flag keeps the
  ORIGINAL text as evidence (`session_flags.excerpt`, admin only); `chat_messages`, the socket
  relay, the history endpoint and the vendor's push notification all carry the masked text.
  Only the SENDER of a masked message sees a warning popup (the receiver gets no notice --
  the owner asked for warnings to go to whoever tried, never both at once; a permanent
  banner shown to both sides was built and removed); keys `chatSession.*` (customer) / `call.*` (vendor), EN + HI.
  Messages saved before this stay unmasked. **App-side warning needs an OTA to reach installed
  apps; the masking itself is server-side and live on deploy.**
- **Proof view (2026-09-25):** admin "View proof" on a flag shows astrologer/customer, session
  times and the conversation with the flagged message highlighted, showing the text AS TYPED
  (from `session_flags.excerpt`) plus what the other side saw; "Copy proof" gives plain text.
  Chat only -- there is no call recording, so calls have no proof to show.

### CX. Call audio recording (2026-09-25) -- BUILT, DORMANT, needs a store build + R2

Audio only, no media server. Calls stay peer-to-peer WebRTC. Each phone records ITS OWN
microphone and uploads it; the server transcribes it (Gemini audio input) and runs the same
`contactLeakDetector` as chat; a hit becomes a `session_flags` row with `source='call'`.

**Capture (Android only, NATIVE -> needs a Play Store release; not OTA-able):**
- `MainApplication.onCreate` sets `WebRTCModuleOptions.getInstance().audioDeviceModule =
  RecordingAudioDeviceModule(this)`. react-native-webrtc 124 exposes this option, so NO library
  patch. The wrapper builds a FRESH `JavaAudioDeviceModule` per `getNativeAudioDeviceModulePointer()`
  because react-native-webrtc releases the module it is given and rebuilds its factory when the JS
  context is recreated (hot-update reload); one long-lived module would be reused after release.
- The module's `setSamplesReadyCallback` feeds `CallRecorder` (AAC-LC ADTS, 32 kbps, ~240 KB/min,
  bounded queue + writer thread; drops buffers rather than blocking audio; 40 MB cap).
- **MUTE RULE:** that callback sees the RAW hardware mic, before WebRTC applies the app's mute.
  Every mute toggle must call `setCallRecordingMuted(next)` (done in all four call screens) or a
  muted user is still recorded. Any NEW mute control must do the same.
- Own-mic only: on speakerphone the other person's voice can bleed into a track; the admin proof
  panel says so. Hardware AEC (default on) reduces it.
- JS: `src/utils/callRecording.js` in both apps. Start at `call_connected`, stop+upload in
  `doEndCall` (not awaited). NO in-call notice is shown (owner's decision 2026-09-25, after a notice popup was built and
  removed). Consent therefore rests on the Terms/Privacy wording alone -- keep that step.

**Server:** `src/callRecordingRoutes.js`, `src/objectStorage.js` (R2 via `aws4fetch`, private bucket,
presigned PUT for phones / GET for admin), `sql/call_recordings.sql` (APPLIED 2026-09-25).
`POST /api/call-recordings/start` answers `{enabled:false}` (HTTP 200) unless
`app_settings.call_recording_enabled = 'true'` AND storage is configured -- so shipping the apps
first is safe. Participant-checked against `chat_sessions`; identity always from the JWT. Retention:
`expires_at` default 90 days, hourly purge deletes the object.

**TO TURN ON (owner):**
1. Cloudflare R2: create bucket `astrowani-call-recordings` (private) + an API token scoped to THAT
   bucket only (separate from the OTA token). Set on the VPS: `R2_ENDPOINT`, `R2_CALL_BUCKET`,
   `R2_CALL_ACCESS_KEY_ID`, `R2_CALL_SECRET_ACCESS_KEY` (`set-backend-env.yml` allowlist).
2. Update Terms/Privacy/consent wording (calls may be recorded) -- legal, before enabling.
3. Ship customer + vendor store builds carrying the native recorder.
4. Admin -> Off-platform Contact Flags -> "Call recording" -> Switch ON.
iOS is NOT covered (different audio-device mechanism) -- iPhones simply never start a recording.
Account deletion does not yet purge call recordings/transcripts (decide with the chat-retention
question).

## Subsystem added 2026-09-25: offer abuse guard (delete + re-register exploit)

### CY. New-customer offers cannot be re-claimed by deleting the account

**The exploit (confirmed in code):** delete the account, sign up again with the same number,
and the free 12-minute call and free 5-minute chat were available again -- a re-registered
number is a fresh `customers` row, and the old account's sessions stay under the OLD id.
**Do not "fix" this by removing account deletion:** Google Play and Apple both require it.

`src/offerGuard.js` (`sql/offer_guard.sql`, **APPLIED 2026-09-25**): when an account is deleted
(customer self-delete in `accountRoutes.js`, admin delete in `adminRoutes.js`),
`snapshotCustomer()` looks at what it really used and stores it against an HMAC-SHA256 hash of
the canonical 10-digit number (`offer_claims`; last 4 digits kept for the admin). Later accounts
on that number are refused: `free_call` (booking/offer routes, fails CLOSED -- it is a real
astrologer's time), `free_chat` (stamped used at signup, in `mobile-otp-verify`, fails open),
`welcome_session` (had a real consultation -> not a new customer). Refusals land in
`offer_blocks`; admin page "Offer Abuse Guard".
- The snapshot runs BEFORE the purge (the purge deletes the bookings it reads) and never throws:
  a deletion must always succeed.
- A 'missed' or 'cancelled' free-call booking does NOT count as used.
- The hash key is `OFFER_GUARD_SECRET`, falling back to `JWT_SECRET`. **Rotating that secret
  forgets every remembered number.** Set a dedicated one if JWT_SECRET might ever rotate.
- **Adding a new offer:** add its key to `OFFERS`, add one line to `snapshotCustomer()`, call
  `claimedByOther()` where it is granted. No migration.
- Not covered: a different phone number, and accounts deleted before 2026-09-25 (nothing was
  recorded). The Privacy Policy should say a hashed number is kept to prevent offer misuse.
- Verified 14/14 against the live DB (same number in `+91`/bare formats matches; other numbers
  unaffected; snapshot idempotent; test rows removed).

## Admin/API slowness investigation 2026-09-25 (READ BEFORE CHASING "THE SERVER IS SLOW")

**Symptom:** `deploy-admin.yml`'s final "confirm live" step failed (curl exit 28 x5, 15 s each)
right after a successful file swap; manu.astrowani.com and even backend.astrowani.com felt slow
from a developer PC, with a 1.9 MB script taking ~20 s.

**Verdict: the server is healthy. The variance is between Cloudflare and the origin.** Measured
with a one-off read-only diagnostic workflow (since deleted; it SSHed in with the deploy key):
- VPS idle: load 0.00, 4.6 GB RAM free, nginx + pm2 up, disk 9%. `sudo -n` works for the deploy
  user (ufw, ip6tables, journalctl, tcpdump), so deeper checks are possible via a workflow.
- Cloudflare-**cached** files (the JS bundle, `cf-cache-status: HIT`) arrive in 40-55 ms every time
  from the runner. Anything that must go back to the **origin** through Cloudflare (index.html,
  the API, the shop) takes 0.3 s minimum (LAX edge to a far-away origin) and ~1 request in 6
  takes over 1 s, with spikes of 2.5 / 4 / 7 / 15 / 22 s and a few with no answer in 25 s.
- Connecting to the origin **directly** (bypassing Cloudflare) is a steady 0.24 s connect /
  0.74 s first byte. A tcpdump during the test showed **every SYN arriving exactly once and
  answered in ~0.1 ms, none retransmitted, none lost**. So the origin never sees the delay.
- Ruled out with evidence: CPU/RAM, ufw (443 open v4 and v6, nginx on both), the Cloudflare-only
  allow-list (matches Cloudflare's published ranges exactly, only 19 non-CF requests dropped
  all day), IPv6, path MTU (1500 works end to end), TCP retransmit rate (0.35%, normal),
  conntrack (239 / 262144), fail2ban (0 bans).
- **Two things in the "slow" reports were the developer's own connection:** GitHub's API and
  SSH to the VPS also timed out intermittently from that PC, and its requests were routed to a
  Marseille Cloudflare edge (`cf-ray` ...-MRS). The GitHub runner and the VPS itself do not
  have this problem. A fail2ban ban was suspected and disproved (0 banned).

**What was changed:** the deploy's confirm step now runs **on the VPS** and checks that the page
references the new build's bundle (stronger than "200") instead of curling from GitHub's US
network with a 15 s limit. It no longer reports a false failure when the runner's path is slow.

**Not changed, needs the owner (Cloudflare dashboard) if the slowness ever matters to users:**
1. A Cache Rule for `manu.astrowani.com` (cache the SPA shell a few minutes) so the admin never
   touches the origin. Hashed assets are already cached. Purge on deploy or keep the TTL short.
2. Argo Smart Routing (~$5/month + per-GB) or a Cloudflare Tunnel (free) makes the
   Cloudflare-to-origin leg reliable. The origin is in Malaysia; Indian visitors normally use the
   Mumbai edge, where a request from the VPS through Cloudflare measured 30-170 ms.
3. Do not spend more time on nginx / kernel tuning for this; nothing there is wrong.

### Store builds 2026-09-25: customer 47 and vendor 29 (built, NOT uploaded)
- Customer `versionCode 47` (name 24.1), vendor `versionCode 29` (name 6.6); names unchanged so OTA
  bundles keep matching. AABs: `D:\Astrowani-Releases\astrowani-customer-24.1-47.aab` and
  `astrowani-vendor-6.6-29.aab`. Signed with the correct upload keys (customer CN=Astrowani
  Customer, SHA-256 55:01:0B:59...; vendor CN=Astrowani, 76:FC:45:AF... -- checked with
  `keytool -printcert -jarfile`, the vendor debug-key trap did not trigger).
- New in these builds over customer 46 / vendor 28: the **native call recorder**
  (`CallRecorder` / `RecordingAudioDeviceModule` / `CallRecordingModule`, subsystem CX; dormant until
  the admin switch is on AND R2 is configured) and the JS since then (chat number masking + the
  sender-only "Contact details hidden" popup, offer guard is server-side). Both manifests were read
  back: `enableOnBackInvokedCallback="false"`, no BILLING permission.
- The vendor manifest declares `AD_ID` / `ACCESS_ADSERVICES_AD_ID` in its own AndroidManifest since
  at least build 27 -- so the astrologer app's Play "Advertising ID" answer must be Yes; this is not new.
- Sentry source maps are not uploaded (no auth token on the build machine).

### OTA 2026-09-25: chat number masking popup (both apps, android + ios)
Customer bundle `01a0d812-c52e-70a8-99bf-7f982ae75625`, vendor bundle deployed the same afternoon
from commit `ac525b6` (`npx hot-updater bundle disable <id>` to roll back). Installed builds pick it up
on their next launch. The JS also carries the dormant call-recording hooks, guarded by
`NativeModules.CallRecording`, so builds without the native recorder simply skip them.

### Retention decisions 2026-09-25 (owner) -- supersedes the chat purge in subsystem CN
- **Deleting an account no longer erases chat messages or call recordings.** All four
  `chat_messages` deletes (customer + astrologer self-delete in `accountRoutes.js`, the two admin
  delete routes) were removed; the profile/personal data purge is unchanged. Verified against the
  live DB: after a self-delete the account is gone and both chat messages remain.
- **Call recordings are kept 90 days**, then the hourly purge clears the audio AND the transcript
  (`callRecordingRoutes.purgeExpired`); the flagged sentence in `session_flags.excerpt` stays.
- **Nothing ever purges `chat_messages`** -- there is no retention period for them. If one is
  chosen, add a scheduled delete.
- In-app delete confirmations (customer + vendor, EN + HI) now say chats/recordings are kept; that
  text ships by OTA. The website pages must be updated by the owner: see
  `MD files/Astrowani-Website-Text-Changes.docx` (exact find/replace text for the delete-account page, Privacy Policy and Terms, written against the live pages on 2026-09-25).

---

## Session 2026-09-30: the 50/50 consultation split, audited — and an unmerged branch

### DB. Consultation revenue is split 50/50 — read this before touching billing

Every billed minute of chat/audio/video now pays the astrologer **half** of what the
customer is charged; the platform keeps the rest in `admin_wallet`. The customer is quoted
and debited the FULL per-minute rate as before — the split is invisible to them.

**Where it lives: `sql/process_session_billing.sql`, and that file IS the source of truth
again.** It had drifted: the split was applied straight to the live database while the
committed file still said 100%-to-the-astrologer, so re-running the file — which its own
header instructs you to do — would have silently reverted the platform's entire
consultation revenue. Synced 2026-09-30; keep it that way.

**Two details in the function are load-bearing:**
- `astro = ROUND(charge*0.5, 2)` and `admin = charge - astro`. The platform takes the
  REMAINDER, so the halves always sum to exactly what the customer paid. Rounding both
  independently would leak or mint a paisa on an odd charge.
- The `admin_wallet` UPDATE is keyed `WHERE id =` after `SELECT ... FOR UPDATE`. A
  WHERE-less UPDATE is rejected by this database even inside SECURITY DEFINER — that is
  what kept `adjust_admin_wallet` silently failing for months (hardening_07). The row is
  picked the same way `adjust_admin_wallet` picks it (`ORDER BY updated_at LIMIT 1`) so
  both money paths credit the same wallet.

**The bug that was fixed, and the rule from it** (`hardening_21_…`, applied):
the platform leg originally `RAISE`d when `admin_wallet` held no row. The function is ONE
transaction, so that rolled back the customer debit, the astrologer credit, the ledger rows
**and the `next_billing_at` advance** — and `sessionManager.processBilling` only logs a
failed RPC, so the session just came due again 30s later, forever. One missing row meant
**every consultation on the platform ran FREE, silently**. It now sits in its own
`BEGIN/EXCEPTION` sub-block: a failure is a WARNING and billing continues. Losing one
minute's ledger entry is recoverable (the customer's `wallet_transactions` debit is the
authoritative record); refusing to bill is not. **Do not turn that WARNING back into an
EXCEPTION** — and note this is the same log-only posture `astroRoutes.js`,
`orderRoutes.js`, `freeServicesRoutes.js` and the gift path already take with
`admin_wallet`, for the same reason: by then the customer has been charged.

Because that failure is now silent by design, `scripts/dbHealthCheck.js` gained an
**'Admin wallet singleton'** check — CRITICAL unless `admin_wallet` holds exactly one row.
Zero means platform revenue is going unrecorded; more than one means the balance
alternates between rows and neither holds the true total.

> **It was NEVER 50/50 before.** `v_astro_share` appears in no committed version of that
> file, and the copy exported *out of production* on 2026-08-08 already credited the
> astrologer the full charge — so the dashboard function paid 100% from the day it was
> first written, and no later change converted it. The 50/50 that did exist in code was
> always the **gift** one (`GIFT_VENDOR_SHARE`).

### DC. Gifts now reach `admin_wallet` (they never did)

`platformCut` was computed and written to `gift_transactions.platform_cut`, but there was
no `adjustAdminWallet` call on the gift path — so the astrologer got their 50% and the
platform's 50% never entered the balance the admin dashboard reports. Paid reports
(`astroRoutes.js`) and the ₹1 free services have always credited it; gifts were the one
money path that did not. Added in `index.js` with `serviceKey: 'gift'`, keyed
`${giftIdempotencyKey}:admin` so it is stable across a retry of one tap, log-only.
Recorded in rupees for a COIN gift too — 1 coin == ₹1 of catalogue price and nothing is
credited when coins are bought, so there is no double count.

### DD. The astrologer's own screens showed the CUSTOMER's rate

`VendorChatSession.js`, `EnxScreenVoice.tsx` and `EnxScreenVideo.tsx` rendered
`₹{perMinuteCharge}/min • billing active` on the astrologer's screen. That is what the
customer pays, and they now earn half of it — ten minutes of "₹25/min" followed by ₹125 in
the wallet is a support ticket every time. Now `t('call.customerRate')` → **"Customer:
₹25/min"** (EN + HI). **Deliberately does not do the maths in the app**: the share lives
server-side and hardcoding 0.5 in the client would drift the day it changes.

### DE. ⚠️ THE PLATFORM WALLET SCREEN IS BUILT BUT NOT MERGED — CHECK THIS FIRST

Branch **`origin/claude/billing-astrologer-split-issue-wb5k72`** (3 commits on top of
`1d81dde`) contains, all unmerged:
- `GET /api/admin/wallet` in `adminRoutes.js` (+130) — balance, ledger, revenue-by-source,
  and the per-minute **row folding** that turns 8 × ₹25 ticks into one
  "Call with X (platform share) +₹200" entry;
- `astrowani-admin/src/pages/AdminWallet.jsx` (164 lines) + its `App.jsx` route and
  `Layout.jsx` sidebar entry under **Executive Center**;
- `sql/hardening_19_billing_50_50_split.sql`, `sql/hardening_20_admin_wallet_session_id.sql`;
- the same gift → `admin_wallet` fix as DC above.

**The database half of that branch IS live** (the split, and
`admin_wallet_transactions.session_id`). **The code half is not**: `main` does not have it,
and production answers **404** on `/api/admin/wallet` while a real admin route answers 401.
So the Platform Wallet page cannot be reached in production, and the folding it describes
is not running.

**Do not rebuild that page** — merge the branch. Two things to know when doing it:
1. It will **conflict in `index.js`** on the gift block (DC), because both sides add the
   same credit. Keep either; the working-tree version also passes `customerId`, which
   attributes the ledger row.
2. `hardening_19`/`20` still carry the `RAISE` that DB fixed. **Do not re-run either after
   `process_session_billing.sql`** — both reinstate the platform-wide free-consultation
   outage. `hardening_21` says so at the top.

### Verified 2026-09-30
Against the LIVE database, each case run for real inside a transaction that was then
aborted so nothing persisted (synthetic session on the store-reviewer accounts):
- **`admin_wallet` deleted entirely, charge ₹21** → RPC returned **true**, customer
  500→479, astrologer +10.50, `today_earnings` +10.50, customer ledger 21, vendor ledger
  10.50, admin ledger rows 0, `next_billing_at` advanced. The outage is gone.
- **Normal, charge ₹25** → customer −25, astrologer +12.50, `admin_wallet` +12.50, admin
  ledger 12.50, halves sum exactly to the charge, and an immediate second call for the same
  minute returned **false** (no double-bill).
- **Gift leg** → `adjust_admin_wallet` 189→199.50, a replay under the same key credited
  **nothing**, exactly one ledger row.
- Deployed function re-read afterwards: best-effort guard present, split present,
  `session_id` still written (nothing of hardening_20 was clobbered).
- `node --check` clean on `index.js` and `dbHealthCheck.js`; the new health check runs and
  reports `1 admin_wallet row(s)`; vendor eslint clean on all 4 changed files; vendor i18n
  **497 keys, zero one-sided**.

**Not yet exercised on a device.** A real 2-minute paid call is still the test worth doing:
check customer −₹X, astrologer +₹X/2, `admin_wallet.balance` +₹X/2, and one
`service_key='session_billing'` ledger row per minute. Note `admin_wallet_transactions`
had **zero** `session_billing` rows as of this session, so the split had never yet run on a
real consultation.

---

## Session 2026-09-30 (later): calls and chat were not connecting — acceptance delivery had no backstop

### DF. What was actually broken, measured before anything was changed

Reported: "the call is not getting connected, neither video nor audio — it just rings until
the timer is done"; "in chat the astrologer gets connected and comes to the chat room but on
the customer side only 'request sent' shows"; and later, "video was working fine, chat and
audio call were the problems".

**The backend was never the problem. Acceptance DELIVERY to the customer was.** Evidence
gathered first, in this order:

- `chat_requests` / `call_requests` rows were reaching `status='accepted'` with `responded_at`
  set, and `chat_sessions` rows were being created. `logs/errors.log` on the VPS had nothing
  but the usual SMS-failover lines.
- A live end-to-end probe against production proved BOTH transports work when everything is
  online and subscribed in time: socket `call_accepted` arrived, and the Supabase Realtime
  UPDATE arrived, for a real `/api/call/initiate` -> `/api/session/accept` cycle.
- **PostHog dated the break to within one hour.** Customer-side `chat_started` and
  `call_connected` collapse to ~zero from **2026-09-29 22:00 UTC** while `chat_initiated` and
  `call_initiated` continue at the same rate. (The customer Android OTA `01a0eefb`, commit
  `dc94f4b`, shipped at 21:03:46 UTC — the last working chat session started 21:11 UTC on the
  still-running old bundle, the first broken one at 22:23 UTC after a relaunch.)
- `$screen` events said how far the app got: in the 07:00 UTC 2026-09-30 test window,
  **`ChatSessionScreen` = 0 views against 3 `chat_initiated` and one accepted chat** — the
  customer never navigated at all. For audio, one accepted call produced one `VoiceCallScreen`
  view and **zero `call_connected`**, and its session died at 34s with `next_billing_at` still
  NULL, i.e. never activated.
- `chat_messages` agreed: accepted chats after 21:11 UTC had `from_customer = 0`. The customer
  auto-sends its birth details on connect, so zero means it was never in the room.

**THE CAUSE, and it is a design gap rather than one bad line: the customer learned the outcome
from exactly ONE push-style message, and nothing anywhere reconciled state if it was missed.**

| Path | Before |
|---|---|
| chat acceptance | ONE Supabase Realtime UPDATE. No socket path existed at all. |
| call acceptance | socket `call_accepted` **emitted only by the vendor app's HomeScreen**, plus one Realtime UPDATE |
| rejection | Realtime only — the vendor app emitted nothing |
| `join_session` | fire-and-forget. Every failure was a silent `return`. Never retried. |
| pre-connect state | no deadline of any kind (the 30s countdown only starts at `'ringing'`) |

Ways that single message was lost, all real:
1. **The astrologer accepted from the heads-up notification or the new draw-over-other-apps
   overlay.** Both run with no HomeScreen and no socket, so `accept_call` was never emitted
   and Realtime was the only signal that ever existed.
2. The Realtime channel was still SUBSCRIBING when the accept landed (accepts as fast as 4s
   were measured; the channel needs ~1s and the socket's verified `join_room` does a DB
   round trip first).
3. The customer's phone was locked or the app backgrounded — which is what happens while the
   tester looks at the *other* handset. That drops both sockets, and neither redelivers.

**And separately, the media path:** `webrtc_ready` -> `webrtc_offer` -> `webrtc_answer` all
travel through the session socket room. `join_session` does TWO database round trips before
joining and used to `return` silently on any failure, with no retry and no ack — so a customer
that was never in the room heard no `webrtc_ready`, never sent an offer, and sat on "Ringing..."
while the astrologer never reached ICE-connected and never emitted `signal_connection`. That
is the audio symptom exactly; video survived on timing luck, not design.

### DG. Second reported bug: hanging up inside the connecting window told nobody

"the time between accepting request and getting connected — if one side cuts, the other shows
connecting connecting connecting ... and it doesn't even tell why."

`terminateSession` does emit `session_ended` to both personal rooms AND the session room, and
its claim is correctly keyed on `ended_at IS NULL` (not `is_active`), so ending a
never-connected call is not treated as already-ended. But:

- **a socket that has not finished joining is in none of those rooms, and Socket.io never
  replays to a room you join afterwards**; and
- **the astrologer's call screen is in the session room ONLY** (HomeScreen owns the personal
  room) **and HomeScreen has no `session_ended` listener** — so a customer hanging up early
  reached the astrologer's app nowhere at all.

Found while fixing it: **`sessionManager.io` was assigned only inside `start(io)`, which is
gated on `ENABLE_SESSION_MANAGER`.** Every client notification in `terminateSession` sits
behind `if (this.io)`, so on any process without that flag a session could end with NOBODY
told. Production sets the flag so no real customer hit it, but tying "can we tell people the
call ended" to "do we run billing here" is the wrong dependency — and it is what hid this bug
during local testing. There is now `sessionManager.attachIo(io)`, called unconditionally
before the gate. **Do not fold it back into `start()`.**

### DH. What changed

**Backend (`index.js`, `src/sessionManager.js`)**
- `/api/session/accept` **emits the acceptance itself** — `call_accepted` for
  `call_requests`, `chat_accepted` for `chat_requests` — to the caller's personal room. The
  notification is now a property of the acceptance, not of which button the astrologer
  pressed. The vendor's own emit is kept; it is a harmless duplicate because every
  customer-side handler is idempotent. `/api/session/reject` does the same with
  `call_rejected` / `chat_rejected`. Both are wrapped so a failed emit can never fail an
  accepted call.
- **`join_session` now takes an optional ack callback** and answers `{ok}` plus a `retry`
  flag, and also emits `session_joined` / `session_join_failed`. `session_not_found` is
  marked retryable (the row may legitimately not be visible yet); `not_a_participant`,
  `unauthenticated` and `session_ended` are not. Old builds that pass no callback behave
  exactly as before.
- **`GET /api/requests/:kind/:id/status`** — the customer's authoritative "has the astrologer
  picked up yet?", returning `{status, sessionId}` and resolving a chat request's session id
  for the chat screen. Scoped to the caller's own row, and **refuses an astrologer token
  outright**: one phone number can be both a customer and an astrologer (the store-reviewer
  account is), and `resolveCustomerFromReq` works by phone, so a vendor token would otherwise
  be served the customer's row. Same trap and same fix as `/api/notifications/read`.
- **`GET /api/session/:id/state`** — `{ended, endedAt, active, viewer}` for the two
  participants only. This is what un-sticks a screen stuck on "Connecting...".
- `sessionManager.attachIo(io)`, above.

**Both apps — three new shared utilities, duplicated per app as every other cross-app util here is**
- `utils/sessionRoom.js` -> `joinSessionWithRetry(socket, sessionId)`: re-emits every 1.5s
  until the server acks, gives up only on a non-retryable refusal, and re-arms on reconnect.
  **Wired into all four call screens and both chat screens.** This is the audio-call fix.
- `utils/awaitRequestOutcome.js` (customer only) -> polls the status endpoint every 2s while a
  request is ringing, plus immediately on `AppState` -> active. **Wired into `useChatRequest`
  and all five call entry points** (`Call.js`, `Video.js`, `Home.js` x2, `AstrologerInfo.js`
  x2, `ExpertsList.js`). It never decides anything itself — it calls the screen's existing
  `goToCall` / cleanup, which are already guarded, so whichever path arrives first wins.
- `utils/preConnectWatchdog.js` (both apps) -> while unconnected, asks
  `/api/session/:id/state` every 3s. If the session ended, leave AT ONCE naming the other
  side ("The astrologer ended the call before it connected. You have not been charged." /
  "The customer ended the call before it connected."). If still alive past 45s, give up with
  "We could not connect this call." **Its deadline only applies once the endpoint has
  actually answered** — against a backend without the route it stays a no-op rather than
  killing slow-but-real connections, so the app half is safe to ship before the backend.
- `useChatRequest` gained a socket path (it had none) and all three paths funnel into one
  `resolveAccepted` / `resolveClosed` pair behind a `resolvedRef`. Its ring timeout now
  **re-checks the server before writing the request off as missed**, so an accept that landed
  in the last second cannot strand the astrologer.
- 3 new i18n keys per app, EN + HI (customer 1198 keys, vendor 488, zero one-sided).

**The draw-over-other-apps overlay was deliberately left completely alone** at the owner's
request. It benefits for free: its accept path goes through `/api/session/accept`, which now
notifies the customer itself.

### Verified 2026-09-30 — 29/29 over real sockets and HTTP

A harness (`verify.js`, session scratchpad, not the repo) drives a real customer and a real
astrologer through production's own login, then asserts on **what the customer-shaped client
receives** — not on the helpers (CLAUDE.md subsystem BN: a harness that only tests your own
module reports green while the call sites that ignore it stay broken).

Run first against the OLD code as a baseline: **15 failures**, including no server-side
acceptance notification, no ack from `join_session`, and no status endpoint. Then against the
fixed code: **29 passed, 0 failed**, teardown confirming 0 leftover call_requests,
chat_requests or sessions.

Covers: the astrologer accepting over HTTP ONLY (the notification/overlay case) still
reaching the customer; the session keeping its pre-generated id so both sides address the same
room; `join_session` acked, and refused with a reason for an unknown session; `webrtc_ready`
actually reaching the customer; the polling backstop reporting `accepted` + `sessionId`, and
refusing both an unauthenticated read and an astrologer token; **the hangup-during-connecting
case** — the astrologer receiving `session_ended` in the session room, both sides' state reads
agreeing it ended, a late joiner being refused `session_ended`, and a non-participant refused;
the whole chat flow including its new socket event; and rejection reaching the customer.

> **Run the local backend with `node --env-file=.env scripts/devServer.js` and on a spare
> `PORT=`.** `index.js` must never be booted directly here, and the first attempt of this
> session silently lost 15 assertions to `EADDRINUSE` against the dev server already on
> :4500 — the harness happily tested the OLD code and reported failures as if they were new.
> **Check the boot log for EADDRINUSE before trusting a local result.**

> **Harness lesson, the fourth recorded in this file: do not blind-retry a POST.**
> `/api/call/initiate` and `/api/chat/initiate` hold a per-customer in-flight mutex, so a
> retry of a request the server had already accepted came back `409 selfBusy` — which reads
> exactly like a product bug and sent me looking for one. GETs retry; POSTs get one long
> attempt.

Both apps bundle clean for Android (customer 7,963,122 bytes; vendor 6,184,270). `node --check`
clean on both backend files. Lint on every changed file is back to exactly the pre-existing
`exhaustive-deps` / unused-var errors, confirmed by linting the HEAD versions side by side.

### Deploy order and what is NOT yet done

1. **Deploy the backend FIRST.** The app half degrades safely without it (the pollers 404 and
   are ignored, the watchdog's deadline stays disarmed, the join retry just re-emits), but
   nothing is actually fixed until the routes exist.
2. **Then OTA both apps, both platforms.** `node scripts/deployOta.js` from each app folder;
   quote a multi-word message twice on Windows (see subsystem CB).
3. **Not exercised on two real devices.** The one test worth doing: accept from the
   *notification* or the *overlay* (not the in-app card) and confirm the customer connects;
   then start a call and cut it from each side during "Connecting..." and confirm the other
   side leaves with a reason instead of hanging.
4. Not changed, noticed in passing: a **vendor HomeScreen crash**
   (`TypeError: Cannot read property 'length' of undefined`, Sentry `ASTROWANI-VENDOR-6`, 3x
   at 2026-09-29 23:57-23:58 UTC, caught by the AppRoot ErrorBoundary) on a transient
   versionCode-31 dev build. It stopped before `5569d70` and `popupQueue` is declared above
   its uses at HEAD, so it appears already fixed — but if the astrologer dashboard ever shows
   the error fallback again, that crash also disables HomeScreen's socket listeners, its
   Realtime channel and the ringtone teardown.

---

## Session 2026-10-01: the two free-call offers are now separate, and audience-targeted

### DI. Audience Targeting — what it is (it was never written down here)

`astrowani-backend/src/audience.js` + admin **Audience Targeting** (`pages/Audience.jsx`).
It answers one question: **is THIS customer allowed THIS welcome offer**, based on where
they came from.

- Reads `customers.acquisition_source`, written at signup by `src/acquisition.js` (the QR
  poster / install-referrer work, subsystem CV). It never writes anything.
- Config lives in `app_settings.audience_rules`:
  `{segments: [{id, label, match: {kind, value}}], features: {<key>: {mode, segments}}}`.
  `kind` is `prefix` | `exact` | `raw_contains` | `null`. `mode` is `block` ("everyone
  except these") or `only` ("only these"); anything else means everyone.
- Default segments: QR posters (`qr_`), tracked ad links (`ad_`), Google Ads / Play
  (`google`), and **`unknown`** — no source at all, which is every iPhone customer, every
  sideload, and everyone who signed up before the referrer build.

**The three guarantees, and do not weaken them:**
1. Every feature defaults to `everyone`. The module changes nothing until an admin
   writes a rule.
2. `unknown` is only ever affected by a rule that NAMES it. A rule about "google" cannot
   silently catch the 700-odd customers with a null source.
3. It **fails OPEN** — missing key, bad JSON, unreachable DB all answer "allowed". This
   is deliberately the opposite of `freeCallRoutes.isNewCustomer()`, which fails closed.
   A wrongly-granted free call is one astrologer hour; a wrongly-WITHHELD offer is a
   customer who bounced. This layer can only ever take an offer away, so its failure
   direction is "take nothing away".

Two safeguards inside `normalizeRules` worth knowing: a `prefix` rule with an empty
value is dropped (it would match everyone), and an `only` rule with an empty segment
list degrades to `everyone` (it would block everyone).

### DJ. The booking offer and the instant offer are now separately targetable

**What was wrong:** the two free-call flows were marketed as separate offers but the code
had no idea. All three paths asked the SAME audience key — `/api/free-call/offer` (960),
the instant ring (1065) and the booking write (1659) all called
`isAllowed(customer, 'free_call')`. So a rule written for one flow silently governed both.

Now `FEATURES = ['free_call', 'free_call_instant', 'free_chat']`, and each path asks for
the flow it is actually serving (`audienceFeatureFor(offer)` on the shared `/offer`
endpoint, which keys off `offer.mode`).

> **The compatibility rule that makes this safe — `FEATURE_FALLBACKS`.** Instant had no
> key of its own until today, so any existing `free_call` rule was written with BOTH
> flows in mind. Dropping it off the instant path would have LOOSENED an admin's
> restriction without anybody asking. So instant uses its own rule when one exists and
> **falls back to `free_call`'s when it does not**. Adding the key therefore changed
> nothing on its own, and from the moment an instant rule is written it is the only one
> that applies to instant. Verified 13/13, including that exact case.

### DK. Admin: two offers, two sections, settings behind a big button

`FreeCallSettings.jsx` is no longer a page. It is a **panel** taking `flow="booking" |
"instant"`, collapsed behind a full-width button ("⚙️ Free Call Booking Offer Settings —
click here to change") that also shows LIVE/OFF at a glance.

- **`/free-call-bookings` — "Free Call Booking Offer"**: the panel plus the bookings
  list, merged onto one page. Collapsed by default, because the list is what an admin
  opens that page for.
- **`/free-call-instant` — "Free Instant Call Offer"** (new): the same panel with
  `flow="instant"`.
- `/free-call-settings` is now a redirect to `/free-call-bookings`, so old links land.

**Both panels edit the SAME `free_call_offer` blob**, because the flows are mutually
exclusive — `offer.mode` (`scheduled` | `instant` | `off`) decides which one customers
reach, and the backend reads one config. So every shared setting is deliberately shown in
BOTH panels rather than parked in a third place; only the slot/operating-hours card is
hidden from instant, which genuinely has no slots, lead time or calendar.

**There is no bookings list on the instant page on purpose:** an instant call produces the
same `free_call_bookings` row as a booked one, so it already appears in the list on the
booking page. Two lists over one table disagree the moment one is filtered.

### THREE WAYS THE FREE CALL CAN BE LIVE WHEN YOU THINK IT IS NOT (2026-10-01 incident)

An astrologer's phone rang with a real free intro call while the feature was believed to
be off. It was not off: `free_call_offer.enabled` was `true` with `mode: 'instant'`.

1. **`enabled` is the only real kill switch.** It gates all three paths
   (`/offer`, `/book` → 403 `OFFER_CLOSED`, `/instant/ring` → 403 `OFFER_CLOSED`).
   Switch it off and both flows stop within the 60s config cache.
2. **Emptying the instant pool does NOT stop it.** With instant mode on and an empty
   pool, `loadOffer` logs a warning and **falls back to `scheduled`** — it does not turn
   anything off.
3. **Invites bypass `enabled` entirely.** A customer holding an active
   `free_call_invites` row sees the offer and can ring astrologers with the offer
   switched off — deliberate (subsystem CR), and the one route by which a phone can still
   ring after the master switch is off. Check the invite card before concluding it is
   closed.

Also: `mode` survives the master switch. Turning `enabled` back on resumes whichever flow
was last selected — so set the flow first, then enable.

### Still to verify
The two admin sections build clean (`npm run build`) but were **not driven in a browser**
this session. The audience split is unit-tested (13/13) but was **not exercised over HTTP**
against a real customer row.

---

## Session 2026-10-01: load ceiling measured, and the WebRTC relay actually checked

### DL. The fanout was re-broadcasting every billed minute to every connected app

**The amplifier.** `process_session_billing` does
`UPDATE astrologers SET wallet_balance…, today_earnings…, total_earnings…` once per billed
minute **per active session**. `astrologerFanout` subscribes to `*` on that table. So every
one of those writes used to (1) call `onChange()`, dropping the server's astrologer-list
cache **immediately and per-change, not coalesced**, and (2) feed a `io.emit(...)` broadcast
to **every connected socket** every ≤3s, after which every client with a list screen focused
refetched `/api/astrologers`.

In production some session is essentially always billing, so **the list cache was permanently
cold and every connected user re-downloaded the list every few seconds, forever, triggered by
nothing any user did.** At ~1,000 connected users that is ~200+ req/s and ~16 Mbps of pure
noise, on a single-core Node process against a free-tier database.

**Fix:** `isNonDisplayChange(payload)` in `src/astrologerFanout.js`. An UPDATE whose only
differing columns are in `NON_DISPLAY_COLUMNS` (the three money columns, `fcm_token` /
`voip_token` / `voip_platform`, bank + UPI fields, `admin_notes`, `charges_locked_at`,
`logged_out_at`, the `terms_*` columns) is dropped — no broadcast, no cache invalidation.

- It is an **IGNORE list, not an allow list**, on purpose: a column added later is treated as
  customer-visible until someone decides otherwise. The failure direction is "broadcast
  something harmless", never "silently stop telling customers an astrologer came online".
- **Fails safe everywhere else**: INSERT/DELETE, a payload whose `old` has ≤1 key (REPLICA
  IDENTITY not FULL, so no diff is possible), or any thrown error all relay as before.
- Depends on `astrologers` being `REPLICA IDENTITY FULL` — **verified against production**,
  and the live check prints a loud warning if that ever stops being true.
- A 5-minute `[astrologerFanout] 5m: relayed N, skipped M` line exists so "the fanout went
  quiet" and "the filter is eating real changes" cannot look identical from the outside.

**Verified:** `scripts/testFanoutFilter.js` **34/34** (no DB, no network) — most cases assert a
change IS relayed, since a false positive here is the expensive, invisible one. Then
`scripts/verifyFanoutFilterLive.js` against **real production Realtime payloads**: `oldKeys=50`
(REPLICA IDENTITY FULL confirmed), the exact billing write → **SKIP**, a `badge` change →
**RELAY**. Every test value restored exactly.

### DM. The WebRTC backup, measured rather than assumed

**TURN is the automatic same-call backup** — ICE gathers direct and relay candidates in
parallel during one attempt and switches to the relay by itself if the direct path fails.
No redial, invisible to the user. Mid-call drops are additionally covered by
`utils/iceRecovery.js` (ICE restart ×2 on the same peer connection, 5-minute window, session
and billing survive).

Measured 2026-10-01 with a real STUN/TURN protocol client (Binding + long-term-credential
Allocate), not a port check:

| | Result |
|---|---|
| our coturn `76.13.243.165:3478` **UDP** | ✅ Allocate SUCCESS, relay address returned |
| our coturn `76.13.243.165:3478` **TCP** | ✅ Allocate SUCCESS |
| `openrelay.metered.ca` :443/tcp, :80/udp | ❌ **DEAD** — TCP connects, never answers STUN/TURN |
| our coturn TLS `:5349` | ❌ closed — **no TURNS/TLS relay exists** |

> **`openrelay.metered.ca` was 3 of the 7 ICE entries and the only relay besides our own.**
> Its free `openrelayproject` credentials are no longer served. The config *looked* like it
> had a backup relay; it had none. Removed from both apps — a dead entry is not a safety net,
> just ICE gathering latency.

**`GET /api/call/ice-servers`** (`src/iceServers.js`, registered in `index.js`) now serves the
list so a relay can be repaired, rotated or added for every installed app in **one backend
deploy** instead of a store release. Both apps' `utils/iceServers.js` fetch it with a 3.5s
timeout and **fall back to a bundled list on any failure** (no token, offline, 401, malformed
JSON) — this endpoint can only improve a call's chances, never block one. All six call screens
(customer Voice/Video/LiveViewer, vendor EnxScreenVoice/EnxScreenVideo/GoLive) now build their
peer connection from it.

Credential modes, in order: `TURN_STATIC_AUTH_SECRET` → coturn time-limited credentials
(`username = <expiry>:<label>`, `credential = base64(HMAC-SHA1(secret, username))`), else
`TURN_USERNAME`/`TURN_CREDENTIAL`, else the pair currently compiled into the apps — so
deploying this changes nothing until it is configured. Relay URLs come from `TURN_URLS`
(comma-separated), which is how a second provider or a `turns:` entry gets added.
**Verified 19/19** on a bare Express app (`index.js` never booted).

### DN. Load ceiling

**Measured constraints:** the backend is **one Node process on one core** (`pm2 start index.js`,
fork mode — and the shop's `/api/` proxies into the same process). Supabase is **Free tier**,
in Tokyo while the VPS is in Malaysia: `max_connections` **60 with 29 already used at idle**,
and the PostgREST pool is **9**. nginx is untuned, so `worker_connections` is the Ubuntu
default **768**, and every websocket costs **two** of those.

**Estimate — comfortable ~300–500 concurrent connected users; degradation ~500–800; hard wall
~750–1,000** (nginx `worker_connections` and the default 1024 file-descriptor limit, whichever
bites first). Concurrent *calls* is far higher — call media is peer-to-peer and never touches
the server; the limit there is TURN bandwidth for the ~20–30% that relay, and video relaying
is ~10× costlier than audio.

> **This estimate is NOT a measured ceiling.** It could not be measured from the dev machine:
> that connection drops SYN packets (TCP connect times of 0.22s / 3.25s / **24.27s** to the
> same endpoint, while time-to-first-byte after connecting stayed 0.3–1.5s). Any throughput
> number from here measures the ISP, not the backend — the same false-positive recorded in the
> 2026-09-25 slowness investigation. A load test from a GitHub Actions runner is the way to
> turn this into a real number.

`vps-deployment/scripts/apply-scaling-limits.sh` (idempotent, `sudo`) raises nginx
`worker_connections`→16384 + `worker_rlimit_nofile`, writes `/etc/security/limits.d`, and adds
a systemd drop-in with `LimitNOFILE=65535` for the pm2 unit. **A systemd service ignores
`limits.conf`, so both are needed**, and the pm2 unit must be *restarted*, not reloaded.
It deliberately does NOT enable pm2 cluster mode: that **requires a Socket.io Redis adapter
first**, or workers cannot see each other's rooms and calls/chat break.

### Still outstanding (owner)

1. **Add a second, independent TURN provider** (Cloudflare Calls TURN / Twilio / Metered paid)
   — our coturn is currently a single point of failure for relay. Set `TURN_URLS` + credentials;
   no app release needed now.
2. **Add TURNS on 443 (TLS).** Until then, a network that blocks UDP and non-standard TCP ports
   has **no working relay path at all** and the call simply cannot connect — the most common
   cause of "it sometimes doesn't connect".
3. Run `apply-scaling-limits.sh` on the VPS and restart the pm2 unit.
4. **Supabase Pro** (~$25/mo) — lifts the 60-connection/nano ceiling *and* finally provides
   database backups, which still do not exist.
5. Rotate the TURN credential once `TURN_STATIC_AUTH_SECRET` is set (the old static pair is in
   both shipped APKs and in git history).
