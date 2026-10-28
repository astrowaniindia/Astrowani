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
- **Never interpolate a request value into a `.or()` string or a `.in()` array** without
  `src/pgrstFilter.js`. This is NOT SQL injection (PostgREST parameterises the SQL it
  generates) — it is the FILTER LOGIC TREE, and it changes which rows come back.
  `.or()`: a value carrying `)` and `,` closes the `and()` group it lands in and appends
  its own predicates; this is how `GET /api/vendor/chat-threads/:customerId` let any
  astrologer read all of `chat_messages` on the service-role client (fixed 2026-10-02).
  `.in()`: postgrest-js 2.108.2 quotes a value only when it contains `[,()]` and never
  escapes a `"` inside it, so a value with both breaks out into several values. Use
  `isUuid()` for a uuid column (reject with a 400 — don't sanitise), `quoteLikePattern()`
  for a text search box, `safeInValues()` for an `.in()` array. All three are no-ops for
  ordinary values. Everything else is clean as of the 2026-10-02 audit: no raw SQL
  anywhere, every SECURITY DEFINER function pins `search_path`, and HogQL's interpolations
  are all regex/whitelist/clamp-bounded (`ISO_DATE`, `clampDays`, the UUID guard in
  `analyticsExclusions.parseIds`) — keep them that way.
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
- ~~**There are no database backups**~~ — **RESOLVED 2026-10-19**: the org is on **Supabase
  Pro**, so daily backups exist. It was not bought for the backups; it was bought because the
  Free plan's cached-egress quota ran out and dropped every request to the project. See **EC**.

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

Two iOS apps: **Astrowani** (`com.astrowanicustomer`, version 24.1) and **Astrowani Astrologer** (`com.astrowaniVendor`, version 6.6). Both are iPhone-only — **`TARGETED_DEVICE_FAMILY = "1"`, set explicitly in both `.pbxproj` files on 2026-10-23.** This file previously said they were iPhone-only *because* the setting was absent, which is backwards: **absent means Xcode's default of `1,2`, i.e. iPhone AND iPad.** Both apps would have built universal. That matters twice over — App Store Connect demands iPad screenshots for a universal app, and Apple may review on an iPad, where Home cards are still untappable (memory `ios_home_touch_investigation`, OPEN and unexplained after 7 eliminated causes). **Do not remove this setting to "add iPad support"** — adding iPad is flipping it to `"1,2"` *after* that bug is solved, plus iPad screenshots, as an ordinary update: same app record, same listing, same reviews. Steps marked **(Claude)** are for Claude, and only need the owner to send the values asked for.

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
- [x] **ENROLLED 2026-10-23 as INDIVIDUAL. Team ID `U49M3S8V97`.** Paid, enrolment complete.
  **This reverses the 2026-10-12 decision in DW, deliberately and with the owner's agreement
  (2026-10-23): Individual now, convert to Organization later.** Individual needs no D-U-N-S
  number and no verification phone call, which is why it completed in a day — Organization
  would have blocked the first submission behind a ~1-week D&B lead time for no launch benefit,
  because **the first build sells nothing through Apple** (`DIGITAL_PURCHASES_ENABLED = false`,
  subsystem CN), so the Paid Apps agreement, bank details and tax forms are not required yet.
  - **THE TWO COSTS, and neither blocks launch — they come due later.**
    1. **The App Store seller name is the OWNER'S PERSONAL LEGAL NAME, not ASTROWANIINDIA.**
       It is public on both listings, and it contradicts Google Ads (payments profile
       "ASTROWANIINDIA") and the Privacy Policy rewrite that names ASTROWANIINDIA as the
       registered entity. Three records, two different answers.
    2. **IAP revenue would land on the individual's PAN, not ASTROWANIINDIA's PAN/GSTIN** —
       the exact problem the Play Console personal account already has (DW). Converting
       before coins/IAP avoids having it on both stores at once. Confirm with the accountant.
  - **CONVERT BEFORE ENABLING COINS/IAP (CO Phase 9), not after.** Apple's Individual →
    Organization path was NOT verified in this session — it is believed to be a Developer
    Support request plus a D-U-N-S number rather than a self-service button, but check it
    with Apple rather than planning around that. The D-U-N-S for ASTROWANIINDIA is still
    worth requesting (free, ~5 working days) since the Play personal → organization
    conversion needs it too.
  - Note: the Privacy Policy still says "astrowani.com is not a registered firm" while also
    calling it "the firm Astrowaniindia". Both are wrong — it must name ASTROWANIINDIA as
    the registered entity. Unchanged by this; it is about the firm, not about who holds the
    Apple account.
- [x] Apple Account: two-factor authentication ON, card charged (US$99/year).
- [ ] D-U-N-S number for ASTROWANIINDIA — **no longer blocks Apple**, still needed for the
  Play personal → organization conversion and for the later Apple conversion. Request at
  developer.apple.com/enroll/duns-lookup, company name exactly as registered with the MCA.
- [x] Team ID noted: **`U49M3S8V97`** (not a secret — it ships inside every binary and is
  part of the APNs topic).

#### Phase 4: agreements (App Store Connect → Business)
- [ ] Accept the latest **Apple Developer Program License Agreement**. Nothing can be submitted until it is accepted, and Apple re-asks when it changes.
- [ ] The **Free Apps agreement** is automatic. The first build sells nothing through Apple, so the **Paid Apps agreement, bank details and tax forms (PAN/GST)** are NOT needed yet. They become required only when coins/In-App Purchase are turned on (Phase 9).

#### Phase 5: identifiers, push keys, server config
- [ ] Certificates, Identifiers & Profiles → **Identifiers**: confirm (or create) App IDs `com.astrowanicustomer` and `com.astrowaniVendor` with the **Push Notifications** capability enabled. EAS/Xcode may create these automatically on the first signed build. **(Claude** can do this via EAS with the owner signed in.)
- [x] **APNs key created 2026-10-23. Key ID `49V28JX3XB`, Team ID `U49M3S8V97`.**
  File `AuthKey_49V28JX3XB.p8` (PEM, EC P-256, 257 bytes) is at **`D:\secrets\`** on the
  owner's machine — **deliberately OUTSIDE the repo, which is PUBLIC**, alongside
  `sentry.env`. It cannot be downloaded from Apple a second time; if it is lost, revoke and
  make a new one rather than hunting for a copy.
  - Registered **Environment: Sandbox & Production** and **Key Restriction: Team Scoped (All
    Topics)** — one key therefore serves the customer app, the astrologer app AND the
    astrologer `.voip` topic. **A Topic-Specific key would have to be replaced**, because
    three topics are in play.
  - No other service (DeviceCheck, Sign in with Apple, Maps) is attached, on purpose: a
    `.p8` is a private key, so it carries only what it must. Sign in with Apple is not
    needed at all — the apps are phone + OTP only, with no third-party social login.
- [x] **Firebase APNs auth key uploaded 2026-10-23 — BOTH Apple apps, BOTH rows.**
  Project `astrowani-b1845` holds four apps (Android + Apple of each), and the Apple ones
  carry the right bundle ids. Under Project settings → Cloud Messaging → Apple app
  configuration, each Apple app has **two separate slots — "Development APNs auth key" and
  "Production APNs auth key"** — and the SAME key (`49V28JX3XB` / `U49M3S8V97`) is uploaded
  to both, for both apps. **Filling only one is a real trap**: Development serves sideloaded
  and dev builds, Production serves TestFlight and the App Store, so a half-filled app pushes
  fine on the test phone and goes silent in TestFlight (or the reverse) with no error
  anywhere. This is the Firebase-side twin of the `APNS_PRODUCTION` flag below.
  - **APNs Certificates** (the section underneath) is the older mechanism and is deliberately
    left empty — auth keys supersede it.
  - **Web Push certificates** is deliberately left empty too: no browser push here. Do not
    "Generate key pair".
- [x] **VoIP push env SHIPPED 2026-10-23** (rings the astrologer's phone when the app is
  killed - FCM cannot do this, which is why it is separate from the Firebase upload above).
  All five GitHub secrets were set with `gh secret set` (the private key piped straight from
  `D:\secrets\APNS_PRIVATE_KEY_oneline.txt`, never through a clipboard), then the **Set backend env keys** workflow
  was run: run `39899385862`, success, log confirms all five written and `restarted`. The
  backend answered 200 on `/api/astrologers` afterwards.
  - [x] `APNS_KEY_ID=49V28JX3XB`
  - [x] `APNS_TEAM_ID=U49M3S8V97`
  - [x] `APNS_PRIVATE_KEY` - one line, newlines escaped. **The workflow hard-FAILS on a
        secret containing a real newline**, deliberately: a raw multi-line `.p8` would write
        a truncated value into the `.env` and the backend would start with a key that is
        silently WRONG rather than absent. `D:\secrets\APNS_PRIVATE_KEY_oneline.txt` is the pre-escaped copy.
  - [x] `APNS_VOIP_TOPIC=com.astrowaniVendor.voip` (**the `.voip` suffix is required**;
        without it APNs answers `TopicDisallowed`, which reads like a credential problem)
  - [ ] **`APNS_PRODUCTION` is `false` and MUST become `true` the day TestFlight/App Store
        builds are in use** - one more run of the same workflow, no code change. It is the
        #1 cause of VoIP push silently doing nothing: a sandbox token sent to the production
        host (or the reverse) fails `BadDeviceToken`.
  - **NOT verified at runtime.** `voipPush.js` logs `[voipPush] APNs VoIP enabled` at boot,
    but that goes to the root-owned pm2 log and the `deploy` SSH user has no `sudo`, so it
    could not be read from here. `getVoipDebugInfo()` is exported but NOT routed; the only
    observable signal is `voipConfigured` on the `POST /api/vendor/voip-token` response,
    which needs a real vendor JWT. What IS confirmed is that the five values are in the
    `.env` and the process restarted with them. **The real proof is a killed-app iPhone
    actually ringing** (CO Phase 7).
  - Details: `astrowani_vendors-main/ios/README-iOS-SETUP.md`.

#### Phase 6: App Store Connect records (both apps)
- [x] **DONE 2026-10-27, both apps.** appstoreconnect.apple.com → **My Apps → + → New App**, for each app: platform iOS; name (must be unique on the App Store, e.g. "Astrowani" / "Astrowani Astrologer", with a fallback ready); primary language English; bundle ID; SKU (e.g. `astrowani-customer-ios`, `astrowani-astrologer-ios`).
- [x] **DONE 2026-10-27.** **Category:** primary **Lifestyle** for both (see CN positioning).
- [x] **DONE 2026-10-27, both at 18+ via Override to Higher Age Rating.** **Age rating questionnaire → 18+.** The Terms and Child Safety pages say 18+. Answer honestly: users can chat and interact (yes); user-generated content (yes, live comments); web access limited to our own shop.
- [x] **DONE 2026-10-27.** **Privacy Policy URL:** `https://astrowani.com/privacy-policy/`. **Support URL:** e.g. `https://astrowani.com/` or a contact page. **Copyright:** "2026 <legal name>".
- [x] **ENTERED 2026-10-27, deliberately NOT PUBLISHED.** **App Privacy (nutrition labels)** must match the Privacy Policy and the app:
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
- [x] **DONE 2026-10-27 - free, 174 regions, China mainland removed from BOTH apps.** **Pricing:** Free. **Availability:** your choice, but **untick China for Astrowani Astrologer** (it uses CallKit, and Apple rejects CallKit apps on the China storefront).
- [ ] **STILL OPEN - the one blocker left for submission.** **Screenshots:** the CUSTOMER app is DONE (4 uploaded 2026-10-27); the ASTROLOGER app has none. **The required size is 1206×2622 or 1179×2556 (iPhone 6.1"/6.3"), NOT the 1320×2868 this line used to claim** - App Store Connect rejected that outright with "File dimensions are invalid" and names the accepted set itself. Om's iPhone 14 Pro captures at 1179×2556 natively, so screenshots can come straight off the phone with no resizing. No iPad screenshots — the apps are iPhone-only by explicit build setting (see Phase 3 above). Show live consultations, experts, chat and the shop. Do **not** show reports, horoscopes, gifts, free services or the free chat (hidden on iOS, and they don't fit the lifestyle positioning).
- [x] **DONE 2026-10-27.** **Description, subtitle, keywords:** lifestyle wording (CN). Don't mention Android, Google Play, or prices that differ by platform.
- [x] **DONE 2026-10-27.** **App Review Information:** contact name/phone/email, **sign-in required: Yes**, demo account **9999999999 / 123456**, and the Notes text from CN (a different note for each app).
- [x] **DONE 2026-10-27, both set to manual.** **Version release:** "Manually release this version", so the owner controls launch day.
- [x] Export compliance: `ITSAppUsesNonExemptEncryption=false` is already in both Info.plists, so there are no encryption questions per build.

#### Phase 7: signed builds + TestFlight
- [x] **ASTROLOGER DONE 2026-10-27; the customer app still needs a rebuild at 24.1.** **(Claude)** With the Team ID: set up signing (EAS `credentialsSource: remote` is already in both `eas.json`), build `production` for both apps, and submit to App Store Connect (`eas submit` or Transporter).
  - `CURRENT_PROJECT_VERSION` is 1 in both projects and must go up on every upload.
  - Check that iOS OTA targets the same `24.1` / `6.6` versions.
- [x] **DONE 2026-10-27 - internal group "Astrowani Team", automatic distribution on, 2 testers.** Wait for processing (~15–30 min), then add the owner and testers under **TestFlight → Internal Testing**.
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
- [x] **Supabase Pro** for database backups (CA) — **DONE 2026-10-19**, forced by the egress outage (EC), not chosen.
- [ ] Moderation: check admin → **Moderation (Reports)** at least daily once live. Both stores expect reported content to be handled promptly (aim for within 24 h).

### CQ. Google Ads live + customer build 42 (2026-09-17)

- **Google Ads account 819-134-9882** ("Astrowani", astrowaniindia@gmail.com) created. Payments profile is
  **Organization "ASTROWANIINDIA"**, tax info **Accepted** (GSTIN, Rajasthan), Postpay, no backup card yet.
  **Advertiser verification is due 2026-11-10 or the account is paused — and it must be done as
  ASTROWANIINDIA, never the parent Nexetern. See DW at the end of this file.**
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

### DE. The Platform Wallet screen is LIVE (this section used to say it was unmerged)

**Admin → Executive Center → Platform Wallet is in production.** Verified 2026-10-12:
`astrowani-admin/src/pages/AdminWallet.jsx` plus its `App.jsx` route (`/admin-wallet`) and
`Layout.jsx` sidebar entry are on `main`, and production answers **401** (not 404) on
`GET /api/admin/wallet` to an unauthenticated request, so the route is mounted.

- `GET /api/admin/wallet` in `adminRoutes.js` serves balance, ledger and revenue-by-source,
  and does the per-minute **row folding** that turns 8 × ₹25 ticks into one
  "Call with X (platform share) +₹200" entry. `DELETE /api/admin/wallet/:id` was added later
  (`31f4f91`) for deleting a ledger line.
- The work **re-landed directly on `main`** in `0cc6afc` rather than being merged, so
  `origin/claude/billing-astrologer-split-issue-wb5k72` is **not an ancestor of HEAD** and
  `git branch --merged` still lists it as unmerged. That branch is redundant — **do not merge
  it**; everything in it is on `main` already, and merging would re-raise the `index.js` gift
  conflict for nothing. It can be deleted.
- `sql/hardening_19_billing_50_50_split.sql` and `sql/hardening_20_admin_wallet_session_id.sql`
  **no longer exist in the repo** — they were superseded by `process_session_billing.sql`
  (the source of truth, see DB) and `hardening_21`/`22`. The old warning about re-running 19/20
  and reinstating the free-consultation outage is therefore moot, but the rule behind it still
  stands: **`process_session_billing.sql` + `hardening_21` are the authority, and nothing may
  turn the platform leg's WARNING back into an EXCEPTION.**

**The split is confirmed running on real consultations** (it never had, as of 2026-09-30).
Measured 2026-10-12 against production: 123 sessions in 24 h, **59**
`admin_wallet_transactions` rows with `service_key = 'session_billing'`, `admin_wallet`
holding exactly 1 row at ₹2462.50, and zero active sessions with an overdue `next_billing_at`.

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

> **RESOLVED 2026-10-12 — the split has since run on real consultations.** The zero-rows
> observation above is a record of 2026-09-30 only; production now shows 59
> `service_key='session_billing'` ledger rows in a 24 h window across 123 sessions, with
> `admin_wallet` a single row and no overdue `next_billing_at`. See DE.

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

### FOUR WAYS THE FREE CALL CAN BE LIVE WHEN YOU THINK IT IS NOT (2026-10-01 incident)

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
4. **EVERY NEW SIGNUP NOW HOLDS AN INVITE** (added 2026-10-19, subsystem EF). The
   gift-box reveal promises a free call to every signed-out first launch, so
   `src/welcomePromise.js` grants each new account the same `free_call_invites` row at
   sign-up. By route 3 above, that means `free_call_offer.enabled = false` **no longer
   stops the free call reaching new customers** — only the ones who already existed.
   Their switch is `app_settings.free_call_welcome_promise` (`{"enabled": false}`), and
   it must be turned off together with the reveal screen
   (`CAMPAIGN_GIFT_REVEAL_ENABLED`), or the screen promises what the server refuses.

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
4. ~~**Supabase Pro**~~ — **DONE 2026-10-19** (EC). The 60-connection/nano ceiling and the
   missing backups are both lifted; the project moves off `nano` to `micro` compute.
5. Rotate the TURN credential once `TURN_STATIC_AUTH_SECRET` is set (the old static pair is in
   both shipped APKs and in git history).

---

## Session 2026-10-01 (evening): the 60-second cap that made 12 consultations free

### DO. One stale variable paused billing and killed live chats mid-sentence

Astrologer **Astro Soni** and one customer had **12 consecutive chats** between 15:49 and
17:54 IST. Every one was cut off by the backend after 2-4 minutes. **Every one billed ₹0.**
The owner paid Soni out of pocket for work the server had already written off.

**The defect, in `utils/sessionRoom.js` (BOTH apps), introduced the previous evening in
`9122d6a` and OTA'd at 21:03 UTC:**

```js
const startedAt = Date.now();                        // captured ONCE, at screen mount
...
if (Date.now() - startedAt > MAX_WAIT_MS) return;    // 60s, and a SILENT return
```

Sixty seconds after a chat/call screen mounted, `joinSessionWithRetry` was dead. Its
`onConnect` handler still fired on every reconnect, still reset `joined = false`, then called
`attempt()` — which tripped the cap and **returned without emitting anything**. The socket was
healthy and kept rejoining its personal room; only the SESSION room was never re-entered.

Server-side that is indistinguishable from the customer having left:
`bothParticipantsPresent()` logged `caller not connected — billing paused`, and ~2 min later
`scheduleSessionAbandonCheck`'s timer force-ended the consultation.

> **WHY NOBODY NOTICED FOR A WHOLE EVENING, and the lesson worth keeping: the chat kept
> working perfectly.** `ChatSessionScreen` sends over HTTP (`POST /api/chat/message`) and
> re-fetches history on every `connect`, so neither person saw a thing. The production
> transcript has the customer typing at 10:23:08, 10:23:14 and 10:23:20 UTC — a full minute
> AFTER the server had already concluded they were gone. **Socket-room membership is not a
> proxy for "the user is here" when the product also works over HTTP.** Any future presence
> guard must assume the app can be alive, visible and in active use while holding no socket.

### DP. How it was actually proven (reusable method)

Theorising from `CLAUDE.md` would have landed on the pm2-cluster/Redis-adapter theory. It was
wrong. What settled it, in order:

1. **DB first, from the repo's own `.env`** — `chat_sessions` for the 12 rows. `next_billing_at`
   sat 76-123s in the PAST at `ended_at` on every one, and several had been shifted forward by
   `resumeAfterPause` — proving presence FLAPPED rather than simply failing.
2. **`chat_messages`** — both people replying to each other within seconds throughout. This is
   what killed every "the customer's app died" theory.
3. **VPS pm2 logs** (`/root/.pm2/logs/astrowani-backend-{out,error}.log`, grep the session id).
   This gave the answer in one screen: it was the **warn** branch, not the `catch` — so
   `fetchSockets()` was fine — and the kill came from the socket abandon timer, not the
   presence grace.
4. **The decisive grep**: the customer id in the out log. `User <CUST> joined their personal
   room (verified)` appeared **five more times** after their last `joined session room` line.
   The app was online the whole time and simply never re-joined the session room.
5. `pm2 describe` → `fork_mode`, and nginx's error log had **one** unrelated line in the whole
   two-hour window. Infrastructure was never involved.

**Hostinger VPS access for this:** hPanel → VPS → Manage → Browser console. The terminal is
xterm.js, so **`get_page_text` reads it cleanly** — screenshots are not needed and `grep`
output comes back as text. The terminal tab drops out of the browser tool-group after a few
minutes; re-open it from the overview page.

### DQ. The fix

- **`sessionRoom.js` (both apps):** the fast-retry budget is now **per connection and reset in
  `onConnect`**. Past it the helper slows to 15s rather than stopping. **Never give up while
  the screen is open** — being out of the session room is not cosmetic, it is the server
  concluding this participant left, which pauses billing and ends the consultation.
- **`index.js` `scheduleSessionAbandonCheck`:** before force-ending, it now **asks the room**
  (`io.in(sessionId).fetchSockets()`) whether the participant is really missing, instead of
  trusting that `cancelPendingSessionTermination` must have run. That trust was misplaced
  twice over — a dead socket's `disconnect` can be processed AFTER its replacement has already
  joined (so the cancel runs before there is anything to cancel, and the timer is then
  unstoppable), and any client-side join bug reaches that line with both people mid-chat.
  **This does not weaken the money-leak guard**: billing stays gated continuously by
  `bothParticipantsPresent()`, so someone genuinely gone is still never charged for. If the
  re-check itself throws, the kill is SKIPPED rather than guessed at.

**Verified** by running the regression against the actual shipped code: with `HEAD`'s version
a reconnect 90s after mount emits **nothing**; with the fix it re-joins. Both apps lint clean
(0 errors). Deployed in `ca8e2f7` — backend auto-deploy green, then OTA to both apps.

**Still worth doing:** a real two-device test — start a chat, leave it running past 60 seconds,
drop and restore the phone's network, and confirm billing keeps ticking and the session is NOT
killed. The unit-level proof is solid but nothing has exercised this on a handset.

---

## Session 2026-10-03: the free intro call is 11 minutes, pays a flat ₹5, and ends silently

### DR. Three changes, and the one that is NOT in the code

Owner's decision, all three applied together:

| | Before | Now |
|---|---|---|
| Call length | 12 minutes | **11 minutes** |
| Astrologer payout | ₹5 at 3 min, ₹5 more at 9 (₹10 max) | **one mark: ₹5 at 4 min, flat** |
| After the call | up to four modals in a row | **nothing — straight Home** |

> **THE LIVE VALUES ARE IN THE DATABASE, NOT IN `DEFAULTS`.** `loadOffer()` is
> `{...DEFAULTS, ...parsed}` over `app_settings.free_call_offer`, and that blob already
> carried `durationMinutes: 12` and `payoutMilestones: [{3,5},{9,5}]` — so editing
> `freeCallRoutes.DEFAULTS` or `freeCallPayout.DEFAULT_MILESTONES` alone would have
> changed **nothing in production**. The row was updated in the same session
> (`durationMinutes: 11`, `payoutMilestones: [{"minutes":4,"amount":5}]`,
> `headerText: 'Your first 11-minute call is on us'`). The code defaults were changed too,
> so a fresh database and the live one agree — but **the database is the authority, and
> any future change to either of these numbers has to be made there as well.**
> Rollback value for the three keys is `12` / `[{3,5},{9,5}]` / `'Your first 12-minute
> call is on us'`. The offer was `enabled: false, mode: 'instant'` throughout.

**The payout is FLAT above the mark, which is the part worth not misreading.** ₹5 at 4:00,
₹5 at 10:00, ₹5 on a call that runs the full 11 — nothing accrues with length. 3:59 pays
zero. The milestone *machinery* is untouched and still cumulative, so making it tiered
again is one more row in the admin's "What the astrologer earns" card; there is simply one
row in it today. `MIN_DAKSHINA_SECONDS` (180) was deliberately **left alone**: it is not
the payout line, it is the line that decides whether an astrologer hanging up early burns
the customer's one free call (`abandonedByAstrologer`), and moving it would change who
loses their offer.

### DS. The four post-call modals are hidden — and the server-side hold with them

`FREE_CALL_CONTINUE_ENABLED`, `CALL_FEEDBACK_PROMPT_ENABLED`, `DAKSHINA_PROMPT_ENABLED`
and `FREE_CALL_RATING_PROMPT_ENABLED` in customer `src/utils/featureFlags.js`, all `false`,
both platforms (a product decision, unlike `FREE_BOT_CHAT_ENABLED` above them). Hidden,
not deleted: every component, endpoint and route stays put and each flag flips back on its
own.

Three things about how it is wired that are load-bearing:

- **The three hosts are NOT MOUNTED, rather than mounted-and-silent.**
  `FreeCallContinueHost` re-offers itself: on every app resume it asks the server whether a
  live `decision`-phase hold exists and raises the sheet if so, precisely so a customer
  whose phone died mid-call still sees it. A mounted host would therefore keep showing the
  sheet no matter what the call screen does. `RateAstrowaniPromptHost` **stays mounted** —
  only its free-call trigger is gone; the admin dashboard (`show_review_popup`) and a
  tapped review push still need a host listening.
- **Each step in `VoiceCallScreen.doEndCall` falls through to the next when switched off**,
  instead of one flag short-circuiting the chain. All four off reaches `goHome()` and then
  does nothing; any one back on reappears in its original place in the order.
- **`sessionManager.UPSELL_SHEET_ENABLED = false` must track the app flag.** The hold is
  not cosmetic — `holdAstrologerForUpsell` takes the astrologer off the market for
  `holdDecisionSeconds` (90s) and shows them busy to everyone else. Reserving them for a
  sheet that is never drawn is pure lost availability **on every single free call**.

### Verified 2026-10-03
- Payout boundaries against the real module: 0 / 59 / 180 / **239s → ₹0**, **240s → ₹5**,
  and 241 / 300 / 600 / 660s → **₹5**, never more. 12/12. **660s (11 min) is the real
  ceiling** — the screens' countdown ends it there, and if the app dies instead,
  `endOverdueFreeCalls` records the duration as exactly `start + durationMinutes`, not the
  two minutes of slack plus however long the sweep took. The suite's 3600s case is a
  PROPERTY test, not a scenario: `freeCallPayout` is pure and pays out whatever
  second-count it is handed, so that case asserts there is no per-minute term in it that
  could run away on a clock skew or a bad `endedAtMs`. Do not read it as an hour-long
  free call being possible.
- `scripts/freeCallInstantCheck.js` rewritten to the new scheme and green (**51/51**);
  `freeCallSlotCheck.js` **23/23** (needs `node --env-file=.env`; it does slot arithmetic
  only and `index.js` is never booted). Its 12-minute fixture passes its own duration in
  and is unaffected.
- Customer app bundles for Android (8,067,176 bytes); eslint on every changed app file
  reports **0 errors** (pre-existing warnings only); `astrowani-admin` `npm run build` OK;
  `node --check` clean on all changed backend files.
- Live `app_settings` row re-read after the write: `11`, `[{"minutes":4,"amount":5}]`.

**Not exercised on a device.** The test worth doing: ring a free call, hang up at ~2 min
(astrologer paid ₹0), then again past 4 min (₹5 exactly, one
`vendor_wallet_transactions` row, `admin_wallet` down ₹5), and confirm the call screen
goes straight Home both times with no sheet, no "how was your call?", no Dakshina and no
stars — and that the astrologer is immediately available again rather than busy for 90s.

### DT. A paid session DOES show the astrologer busy on the free screen (verified, not assumed)

Asked 2026-10-03 and worth not re-deriving: `src/busyStatus.js` is the single definition of
busy for **both** the paid lists and the free 11-minute instant screen, and its
`chat_sessions` query filters on `is_active = true` with **no `is_free` filter**. A paid
chat / audio / video session, a still-ringing request, and a live stream all mark the
astrologer busy on the free screen exactly as a free call does.

The stale-list race is covered separately and is the part that actually matters:
`POST /api/free-call/instant/ring` re-runs `checkAstrologerBusy` at the moment of the tap
and answers **409 `ASTROLOGER_BUSY`**, so a list rendered a minute ago cannot ring somebody
who has since accepted a paid call. The list is a hint; the ring is the authority.

**Verified against production** by inserting a synthetic `is_free = false` active session
for the reviewer astrologer and running the real module against it — `buildBusyMap` →
`{isBusy: true, reason: 'session'}`, and the ring guard refused for a third customer, for
the session's own customer, and with `isFreeCall: true`. 5/5, then the row was deleted
(0 remaining, 0 active sessions, 0 vendor ledger rows). The probe set
`per_minute_charge = 0` and `next_billing_at = now() + 1 day` **on purpose**: the live
sessionManager polls this table every 30s, so a synthetic active session with a due
billing time would have been billed for real.

### DU. "Shagun Recharge" — a new skin on the Dakshina payment, not a new payment system

Owner, 2026-10-03: replace the post-free-call thank-you sheet with a 3x3 grid of nine
fixed amounts (₹11, 21, 51, 101, 251, 501, 1100, 2100, 5100), the astrologer's avatar +
a Hinglish note underneath, and a RED circular ✕ top-right (every other sheet in the app
uses a cream one).

**Built as a new component calling the SAME backend**, deliberately: `ShagunRechargePrompt.js`
(customer app) calls the exact same `/api/dakshina/*` endpoints Dakshina always did
(`getDakshinaOptions` / `createDakshinaOrder` / `verifyDakshinaPayment`) — same server-side
pricing, same Razorpay-signature-before-credit rule, same 50/50 split
(`DAKSHINA_VENDOR_SHARE`), same `dakshina_payments` ledger table. Building a second payment
pipeline for the same "say thank you" flow would have been needless duplication; only the
amounts offered and the layout changed.

- **The live config row IS the authority**, same lesson as the free-call offer (DR above):
  `app_settings.dakshina_config` already held `amounts: [21,51,101]` from before, so it was
  updated directly (`amounts: [11,21,51,101,251,501,1100,2100,5100]`, `allowCustom: false`,
  `maxAmount: 5100`), not just the code `DEFAULTS`. Verified by calling the real
  `loadDakshinaConfig()` against production afterward — all nine amounts came back in
  order, nothing clamped.
- **The old 4-amount cap in `normaliseMilestones`-style clamping (`.slice(0, 4)`) was
  raised to 12.** Missing this would have silently dropped the 6th–9th buttons no matter
  what the admin config said — exactly the kind of clamp worth checking before assuming a
  config change takes effect.
- **`SHAGUN_RECHARGE_ENABLED = true`, `DAKSHINA_PROMPT_ENABLED` stays `false`** in customer
  `utils/featureFlags.js`. The post-call chain in `VoiceCallScreen.tsx` checks Shagun first
  and falls back to the old Dakshina sheet only if Shagun is ever switched off — so turning
  one flag off doesn't silently skip the ask entirely, it falls back a step, matching the
  fall-through pattern the rest of the chain already uses (DS above).
- **No admin page edits the Dakshina amounts** — none exists; the only way to change this
  ladder is the two places above (`DEFAULTS` in `dakshinaRoutes.js`, and the live
  `app_settings` row). Worth building a real admin page if this changes often.
- **PLACEHOLDER COPY, not final.** `shagun.title`, `shagun.subtitle` and, most
  importantly, `shagun.astrologerNote` (the text in the speech-bubble next to the
  astrologer's avatar) are stand-ins pending the owner's actual Hinglish wording — see the
  file header comment in `ShagunRechargePrompt.js` and the `'en'`/`'hi'` blocks in
  `context/LanguageContext.js`. Nothing else needs to change once the real text arrives.

**Verified:** `loadDakshinaConfig()` against the live DB returns the nine amounts in order,
`maxAmount: 5100`, `enabled: true`. Customer app bundles clean for Android with the new
component wired through Navigation and VoiceCallScreen. `eslint` 0 errors on every changed
file (warnings only, matching the pre-existing codebase style). No duplicate i18n keys.

**Not exercised on a device**, and the astrologer-note/title copy is not final. The owner
still needs to supply: (1) the popup's heading/subtitle text, and (2) what the astrologer's
speech bubble says.


---

## Session 2026-10-05: the free intro call is now an admin ALLOWLIST

### DV. Only selected astrologers get the feature — and that gates the pool, not just the card

Owner, 2026-10-05: "only the selected astrologers should get the free instant call, and the
toggle should only appear on their dashboard." Most of the machinery already existed and was
simply inverted — `free_intro_call_visibility` was a BLOCKLIST (`hiddenForAll` +
`hiddenAstrologerIds`), so every approved astrologer saw the opt-in card by default and 41 of
the 82 had already switched themselves on.

**The same `app_settings.free_intro_call_visibility` key now carries two different controls,
and the difference is the thing to not forget:**

| | What it gates |
|---|---|
| `mode: 'selected'` + `allowedAstrologerIds` (NEW) | **Membership.** The only astrologers who see the switch AND the only ones who can be in `effectiveInstantPool`. |
| `hiddenForAll` / `hiddenAstrologerIds` (unchanged) | **The card only.** Someone already opted in keeps receiving free calls, they just cannot see or change the setting. |

- **The allowlist is applied inside `loadOffer`, over the top of BOTH the self-opt-in list and
  the admin pin list (`instantPoolAstrologerIds`), and BEFORE the empty-pool fallback.** So
  de-selecting somebody removes them from the pool even though `free_intro_call_enabled` is
  still true on their row — which is what an admin taking a name off a list actually means. An
  allowlist that leaves nobody eligible therefore degrades instant mode to `scheduled` (logged)
  rather than showing customers a screen with nobody on it.
- **Selection is not opt-in.** A selected astrologer sees the switch OFF and still has to turn
  it on themselves. That is the point of the toggle; pinning somebody into the pool regardless
  is the older, separate `instantPoolAstrologerIds` (which also sets `managedByAdmin` and takes
  their switch away).
- **An empty allowlist in `selected` mode means NOBODY, deliberately** — unlike
  `src/audience.js`, where an empty `only` list degrades to everyone. Degrading here would hand
  the feature to all 82 astrologers at the moment an admin was half-way through curating the
  list. The admin card shows a red warning when the selection is empty.
- **THE TWO HALVES OF THIS KEY FAIL IN OPPOSITE DIRECTIONS, on purpose.** A failed read of the
  key still hides the card (fail closed — re-showing a switch an admin hid is the worse
  mistake) but reports `mode: 'everyone'` (fail OPEN), because the allowlist now gates pool
  membership and a transient DB blip that emptied the pool would take the whole instant offer
  down for every customer.
- **`mode` is only ever `'selected'` when it is that literal string.** An older row, a typo or
  a half-written blob reads as `everyone`, so nothing can silently restrict the feature.

**The 10-call lock stays** (`minFreeCallsBeforeOptOut: 10`, owner's choice when asked): a
selected astrologer who switches the toggle ON still cannot switch it off until they have
completed 10 free calls. Worth knowing because it is NOT "toggle on and off as they like" —
if that is ever wanted, the value is one admin field.

**Admin:** the "Astrologer's Free Introductory Calls card" panel in `FreeCallSettings.jsx`
gained a radio pair (Every astrologer / Only the astrologers I select) plus a checkbox list,
saving to the same key with the same dedicated Save button. **No app release and no OTA** —
the vendor app already renders nothing for `available: false`, so this takes effect on the next
dashboard load.

**Applied to production the same day:** `free_intro_call_enabled` reset to false for all **42**
rows that had it (41 active + 1 suspended), and the visibility key written as `mode: 'selected'`
with an empty list — a clean slate, so nobody is in the pool until the owner picks names and
those astrologers switch themselves on. The offer was `enabled: false` throughout, so no
customer was affected. Rollback list of the 42 ids: the scratchpad file
`free-intro-optin-rollback-2026-10-05.sql` from that session.

### Verified 2026-10-05 — 26/26 against the live database
A bare Express harness (**`index.js` never booted**) mounting only `freeCallRoutes`, driving
the real `GET/POST /api/vendor/free-intro-call` with locally signed vendor JWTs and calling the
real exported `loadOffer()`, writing and then restoring only the visibility key (teardown
asserted the row went back to absent).

Covers: **a positive control first** (`mode: 'everyone'` — all three test astrologers see the
card and the two opted-in ones are in the pool, so the later exclusions prove something); an
allowlist of one dropping an opted-in astrologer out of the pool and refusing their
`POST .../free-intro-call` with `503 NOT_CONFIGURED`; a selected-but-not-opted-in astrologer
seeing the card while staying out of the pool; an empty allowlist meaning nobody plus the
fallback to `scheduled`; a legacy row with no `mode` field meaning everyone; and the old hide
control still hiding the card while keeping the astrologer in the pool.

> **A local `.env` can invalidate an assertion and look like a code bug.** The first run failed
> exactly one case — "instant degrades to scheduled" — because `FREE_CALL_LOCAL_TEST=true` in
> the local `.env` arms `freeCallLocalTest`, which forces `mode = 'instant'` *after* every
> clamp and fallback by design. The fallback had fired (its warning was in the log). Re-running
> with `FREE_CALL_LOCAL_TEST=false`, which is how production runs, gave 26/26.

**Not exercised on a device.** The test worth doing: select one astrologer, confirm the card
appears on their dashboard and not on another's, switch it on, then de-select them in the admin
and confirm the card disappears and they stop being offered for free calls.

---

## Session 2026-10-12: the legal entity for every platform is ASTROWANIINDIA

### DW. One entity everywhere — ASTROWANIINDIA, never the parent

Owner confirmed 2026-10-12: **ASTROWANIINDIA is separately registered.** Nexetern is the
parent company and **must not appear on any platform record** — Google, Apple, Play, the
bank/card, the GSTIN/PAN or the website policies.

**The rule:** every platform verifies the entity that **pays**, and the payer here is
ASTROWANIINDIA — that is already the Google Ads payments profile (Organization
"ASTROWANIINDIA", GSTIN Rajasthan, CQ above). So the legal name, the registration
certificate, the D-U-N-S record, the card holder and the tax id must all read
ASTROWANIINDIA, character-for-character as registered with the MCA. **Submitting the
parent's documents against a child's payments-profile name is the standard rejection
cause**, and repeated rejections are what actually pauses an account.

**Google Ads advertiser verification — ALL TASKS SUBMITTED 2026-10-12**, four weeks inside the
2026-11-10 pause deadline. The account page shows every task under "Completed tasks" and the
disclosure preview reads *Advertiser identity verified — ASTROWANIINDIA, IN*.
- [x] Organization questions — answered 2026-10-12.
- [x] **Dun & Bradstreet info** — answered 2026-10-12. **The D-U-N-S number itself is an
      OPTIONAL field on this step**; Google matches the organization details against D&B's
      records, allows 3 resubmissions, and falls back to identity documents. So the D&B lead
      time never gated this deadline — it is only needed for Apple and the Play conversion.
- [x] EU political ads → No.
- [x] Who pays for your ads → ASTROWANIINDIA (the disclosure was already correct).
- [x] Financial products & services ads application → **dismissed, correctly.** We advertise
      astrology consultations, not financial products. The `wa.me` tag on that task means a
      destination pointed at WhatsApp; leave the task dismissed, it is not deadline-bound.
- **Do NOT click "Reset verification"** on that page — it wipes the submission and restarts
  the whole process, deadline included.
- Review is 1–10 days. If Google emails asking for documents (the D&B no-match fallback),
  have the registration certificate, GST certificate, entity PAN and the owner's photo ID
  ready.

**Play Console is a PERSONAL account in the name of Dilip Sharma** (checked 2026-10-12);
"Nexetern" is only the public **developer name**, a display field — Nexetern was never verified
with Google and is not the legal publisher of anything. So:
- [ ] Change the public developer name off "Nexetern" (Settings → Developer account →
      Developer page). Users currently see the wrong publisher, and iOS will say ASTROWANIINDIA.
- [ ] **Convert the Play account personal → organization (ASTROWANIINDIA).** Google supports
      this conversion in place — **no new account and no app transfer**, installs/reviews/
      listings/signing key all stay put. It is **one-way** (organization → personal is not
      possible). Prerequisites: the **account owner** does it, **astrowani.com verified** in
      Play Console (the "change account type" option only appears after website verification),
      an **organization payments profile** (a personal one cannot be reused) which needs the
      **D-U-N-S number** above, and the payout bank account in ASTROWANIINDIA's name.
      Do it when no release is in review or mid-rollout.
      Note: an organization account **publicly displays the verified legal name and address**
      on the store listing — ASTROWANIINDIA's registered address becomes public.
- **This is the forcing function for coins/IAP** (CO Phase 9): on a personal account, Play
  payouts and tax forms belong to **Dilip Sharma personally**, not to ASTROWANIINDIA's
  PAN/GSTIN. Convert before enabling IAP, or the revenue lands in the wrong entity. Confirm
  with the accountant.

**Knock-ons:**
- **Apple was enrolled as INDIVIDUAL on 2026-10-23, Team ID `U49M3S8V97`** — the owner chose
  Individual now and Organization later, so the App Store seller name will be the owner's
  personal legal name, NOT ASTROWANIINDIA. This is a deliberate, recorded exception to the
  one-entity-everywhere rule above, taken because Organization needed a D-U-N-S number the
  first submission did not. It must be converted before coins/IAP are enabled, or Apple
  payouts land on the individual exactly as Play's do today. See CO Phase 3.
- **The Privacy Policy's "astrowani.com is not a registered firm" is now factually wrong** and
  contradicts what Google and Apple are being told. Fix it to name ASTROWANIINDIA as the
  registered entity (already on the CO Phase 1 website checklist).

---

## Subsystem added 2026-10-12: photos in a consultation chat (both apps + the website)

### DX. Attaching an image, with crop, drawing and writing — and why none of it is rasterised on the device

A customer can photograph a horoscope, a palm or a document and send it mid-chat;
an astrologer can send a chart back with the relevant house circled. Crop, 90°
rotation, freehand drawing and text-on-the-photo are all available **before** sending.
Images only — no documents, no video — and the picker says so.

**THE DESIGN DECISION EVERYTHING ELSE FOLLOWS: the device sends the ORIGINAL photo
plus a small JSON description of the edits, and the backend replays them with sharp.**
Nothing is flattened on the phone or in the browser.

- The obvious alternative — draw it into a view and rasterise with
  `react-native-view-shot` — is **a new native dependency in both apps**, i.e. a Play
  Store *and* App Store build before a single user could attach a photo, and **no OTA
  path at all**. As built, `react-native-image-picker` is already autolinked in both
  apps and both already declare CAMERA + the iOS photo-library usage strings, so
  **this whole feature ships by OTA. Zero native changes.** (Verified: both apps bundle
  clean for Android; the vendor app has no `react-native-svg`, which is also why the
  in-app stroke preview is drawn with plain `<View>`s, not SVG.)
- It also keeps **full resolution**. A screenshot-based approach would have given an
  astrologer ~1080px of a 2000px chart to zoom into.
- The cost is that the editor is a **faithful preview, not the artefact**. Geometry
  matches exactly (everything is normalised); text metrics are close but not identical,
  because the astrologer app has no Poppins to preview with while the server renders
  with it. See `TEXT_TOP_CORRECTION` in the composer.

**THE COORDINATE RULE — every bug in this subsystem will be a coordinate bug.** Every
number in the edit spec is normalised 0..1 against the **ORIENTED** photo: after the
user's 90° taps, **before** the crop. x/widths divide by the oriented WIDTH, y/heights
by the HEIGHT, a brush width by the WIDTH, a font size by the HEIGHT. The server
composites in exactly that order — auto-orient → user rotation → **annotate** → crop →
downscale — which is what makes a stroke anchored to the PHOTO rather than to the crop
frame: re-cropping afterwards slides nothing, and a stroke running off the frame is
correctly cut. Rotating in the editor **transforms the existing crop, strokes and
captions** rather than discarding them (`rotateEditsClockwise`), and rescales brush
widths and font sizes because the sides they normalise against have just swapped.

| Piece | Where |
|---|---|
| `sql/chat_image_messages.sql` | `chat_messages.message_type / image_url / image_width / image_height`. **APPLIED 2026-10-12.** Two CHECK constraints; **no new grants** (`anon`/`authenticated` stay at zero). |
| `src/chatImageComposer.js` | the sharp pipeline + `normaliseEdits`. No I/O, so it is unit-testable. |
| `index.js` `POST /api/chat/image` | deliberately **next to `POST /api/chat/message`** — see below |
| `astrowani-backend/assets/fonts/Poppins-Bold.ttf` | bundled, 150 KB, covers Devanagari |
| customer/vendor `src/components/chatImage/*` + `src/utils/chatImage.js` | the editor, the bubble, the picker sheet — **duplicated byte-for-byte** between the two apps |
| website `aw/chat-image.js`, `aw/chat-image-geometry.js`, CSS in `aw/aw.css` | same spec, same endpoint |

**Things that are load-bearing — do not "tidy" them:**

- **The route lives in `index.js` beside the text one, on purpose.** The gate it shares
  — you must be a participant, the session must not have ended, and you must pass
  `senderMayBeServed` — *is* the security of chat, and `POST /api/chat/message` shipped
  **without** it (2026-08-08: anyone could inject a message into any session by guessing
  its id). A second writer to `chat_messages` in its own module would drift away from
  those three checks one refactor at a time. Only the pixels are factored out.
- **`sessionId` is REQUIRED here**, unlike the text endpoint which still tolerates a
  legacy caller without one. An image costs the server far more, and allowing it would
  be an upload path with no session check at all.
- **`message` is still filled in** — `📷 Photo`, or `📷 <caption>`. Far more things read
  that column than will ever know about `message_type`: the push notification body, the
  admin off-platform-contact proof view, a dispute transcript, and **every installed app
  build that predates the OTA**. All of them degrade to something sensible with no change.
- **A caption goes through the same `maskContacts`** as a typed message. A phone number
  is a phone number whether it is typed in the box or under a photo. **THE PIXELS ARE
  NOT SCANNED** — a number written on paper and photographed walks straight past the
  off-platform detector. Closing that needs OCR on every chat image; it is a separate
  decision, not an oversight.
- **Throttles are claimed BEFORE the first `await`** (one photo per 2.5s per sender, 60
  per session). Every `await` yields the loop, so two taps landing together would
  otherwise both pass the check. Same rule as every other async guard in this project.
- **The editor stays OPEN on a failed send**, with the crop and annotations intact.
  Closing it would make an astrologer re-circle the house they just circled because of
  one dropped request.
- **`textDropped`** is returned when the deployed libvips cannot rasterise text (probed
  once, cached). The photo still goes with its drawings and the sender is TOLD — rather
  than believing a caption they typed went through.
- **The express error handler now maps `entity.too.large` → 413 and a bad JSON body → 400.**
  `express.json()` rejects before any route runs, so a route's own 413 can never be
  reached; it used to answer **500**, i.e. "something went wrong, try again" for a photo
  that would never fit. This affects every base64 endpoint, not just this one.
- **`chat-images/` is its own folder in the public `app-images` bucket.** Names are
  unguessable (timestamp + 12 hex) and this matches what profile photos and voice notes
  already do — but it IS a public bucket. Moving chat photos behind signed URLs is a
  follow-up, and the separate folder is what makes it possible without touching anything
  else. Note account deletion deliberately does NOT purge them, consistent with the
  2026-09-25 decision to keep `chat_messages`.

### DY. The three copies, and the two scripts that stop them drifting

The editor exists three times — customer app, astrologer app, website — because all
three post the same spec to the same endpoint. Duplication is this repo's established
pattern; its one real cost is drift, and drift here is silent (a photo cropped on the
website coming back cropped somewhere else, with nothing erroring).

- `astrowani_customer-main/scripts/checkSharedChatImageFiles.js` — hashes the 8 shared
  app files, checks every `chatImage.*` key exists in **both** apps in **both**
  languages, and re-derives the website's geometry to confirm it still matches.
  **Verified to actually fail on an introduced one-character change** (exit 1), which is
  the only reason to trust it.
- `astrowani-website/aw/sync-chat-image-geometry.js` — regenerates the website's ESM
  copy from the apps' CommonJS one, rewriting only the export syntax and refusing if
  anything else would have to change. Run it after editing the app copy.

Note the website's `?v=N` cache-busting version was bumped to **22** for this
(`node aw/bump-version.js 22`), as every change under `aw/` requires.

### Verified 2026-10-12

- **Composer, 53/53** (`astrowani-backend/scripts/testChatImageComposer.js`). Asserts on
  PIXELS, not on "it didn't throw": a crop of a four-quadrant image keeps the green
  quadrant and loses the red one; a stroke lands where it was drawn and the rest of the
  photo stays untouched; a stroke outside the crop is cut and one inside survives;
  Devanagari text renders to real glyphs; white text still carries a dark shadow; EXIF
  does not survive. Every annotation case is paired with a positive control.
- **Editor geometry, 63/63**, run against both apps' copies. Includes four quarter turns
  returning a point exactly where it started, a 1:1 crop of a 2:1 photo being square **in
  output pixels** (not in normalised units — the easy bug), a ratio lock not drifting
  over 25 drags, a canvas→photo→canvas round trip, and **4000 random crop drags** never
  leaving the photo, inverting or producing NaN.
- **Route, 38/38 over real HTTP against the live database** (devServer on a spare port;
  `index.js` never booted, and the boot log checked for EADDRINUSE first — a port clash
  did occur and was caught). A stranger with a VALID token → 403, an ended session → 409
  `SESSION_ENDED`, a disconnected sender → 409 `NOT_CONNECTED`, an audio file dressed as
  a photo → 400, an oversized body → 413, a second send inside the gap → 429 — each
  paired with a positive control first. Teardown asserted 0 rows and 0 objects left.
  (`chat_sessions` has a `uq_one_active_session_per_vendor` unique index, so a test
  needing two sessions must retire the first — worth knowing before writing another.)
- **Website editor, 34/34 in a real browser** (`aw/chat-image-selftest.html`, dev-only
  and excluded from the deploy), driving real pointer gestures through the real
  `aw/chat-image.js` and asserting on the spec it posts. Then the spec it produced was
  replayed through the **real backend composer**, which rendered exactly the quadrant the
  browser had selected, at the size the crop implies — the join between the two halves.
- Both apps bundle for Android (customer 8,194,983 B; vendor 6,336,878 B). Lint: vendor
  0 errors, customer 1 — the same pre-existing one `HEAD` has, checked side by side.

**Two real defects were found by this verification and fixed, both of which would have
shipped silently:**
1. **sharp applies a pipeline in a FIXED internal order** (rotate, extract, resize,
   composite) regardless of call order, so `.composite().extract()` cropped *first* and
   then failed to lay a full-size overlay over the smaller crop. Annotating and cropping
   are now separate passes.
2. **`requestAnimationFrame` is not a safe trigger for a first paint.** The website
   editor's initial render hung off one, and in a throttled or hidden document rAF simply
   never fires — a blank editor with no error anywhere. It now paints immediately and
   uses a `ResizeObserver` for the settle.

**Not exercised on a device, and that is the test worth doing:** send a photo both ways
in a real consultation on two handsets — check the crop and the drawing arrive as drawn,
the caption is masked if it contains a number, the bubble does not make the chat jump
while it loads, and the astrologer's push notification reads sensibly.

---

## Subsystem added 2026-10-13: the blog agent — three SEO articles a day, unattended

### DZ. What it is, and the two things it must never do

`astrowani-backend/src/blogAgent/` plus `scripts/runBlogAgent.js`. Three systemd timers a day
(03:30 / 09:30 / 17:30 IST) each write ONE article — English and Hindi, with a photograph —
into the `blogs` table, which is what the **new** website's blog section (`astrowani-website`,
served today at `shop.astrowani.com/test-site`) and the customer app's `BlogList`/`BlogScreen`
both read. The owner's brief: 3 posts/day forever, on different topics, Astrowani named several
times in each, free APIs only.

**Everything is free, and that is a constraint not a happy accident.** Gemini writes the article
through the same six-key chain `src/freeChatAi.js` already runs (plus a seventh, `rajiv`, added
2026-10-13); photographs come from Pexels → Pixabay → Unsplash; with no image key at all it
draws a branded card locally with `sharp`. No new npm dependency was added for any of it.

**Hindi is written by Gemini in the same call, NOT by `src/autoTranslate.js`.** That module uses
MyMemory, whose free allowance is ~5k characters a day; three long articles is ~24k, so it would
be exhausted before breakfast and the Hindi columns would sit empty — the exact bug autoTranslate
was built to fix. The agent therefore also deliberately writes to `blogs` with the service role
rather than through `POST /api/admin/blogs`, because that route fires `queueBlogTranslation()` and
would spend that quota re-translating text that is already finished.

> **THE TWO INVARIANTS. First: it publishes to a live website with nobody reading first, so
> everything about it fails CLOSED.** `enabled` defaults to `false`; a config row that cannot be
> read or parsed leaves it off; a missing `blog_agent_runs` table makes it refuse to publish at
> all. This is the deliberate opposite of `src/audience.js`, which fails OPEN — there, failing
> open withholds nothing from a customer; here it would publish unreviewed. **Second: it must
> never write the same article twice.** Duplicate content does not merely fail to rank, it drags
> down the pages that were already ranking, and an agent out of ideas does not stop — it starts
> rewriting last month's post under a new title.

### EA. The parts that are load-bearing — do not "simplify" these

- **The quality gate (`quality.js`) has TWO STAGES, and conflating them breaks everything.**
  The prompt forbids the model from writing any `<a>` tags (an invented URL is a 404, and the
  real links are added afterwards by code that knows them). The first version of the gate
  nonetheless checked the link count on the DRAFT, so **every article was rejected on
  `TOO_FEW_LINKS` and the agent could never have published anything at all.** `stage: 'draft'`
  checks what the model is responsible for; `stage: 'final'` runs after `generate.assemble()` has
  added the links, FAQ, CTA and JSON-LD — which change the word count, link count, brand-mention
  count and keyword density, so the numbers that passed the draft are not the published ones.
  A draft containing a link now fails `MODEL_WROTE_LINKS`, because that means the sanitiser leaked.
- **`sanitiseHtml` is a WHITELIST that strips every attribute**, not a blacklist. The model is a
  third party writing markup that lands in a web page *and* in the app's
  `react-native-render-html`. Dropping all attributes is what makes it safe without parsing: no
  `href`, `src`, `style` or `on*` can survive, so there is nothing to sanitise individually.
- **Topic dedup is on a STABLE `topic_key`, read from `blog_agent_runs`, not from `blogs`.** The
  model rewrites the title every run, so the title cannot identify a subject. The ledger records
  **failed and rejected** attempts too — counting only published posts would make the agent loop
  forever on a topic the model cannot write well, and a quiet agent and a broken one would look
  identical from outside (the same failure mode `astrologerFanout` is noted for).
- **The catalogue walks its generated topics in order, with a prime stride — never `Math.random()`.**
  A random walk over a large space revisits far sooner than intuition suggests (birthday problem)
  and every revisit wastes a run slot. 2,383 topics ≈ **2.2 years** at 3/day, verified by
  simulating 1,000 days with zero repeats. When it runs out the agent **stops and says so**.
- **The gate runs BEFORE the image is fetched.** Checking afterwards would leave an orphaned
  object in the public `app-images` bucket on every rejection, and nothing ever deletes those.
- **`BANNED_PATTERNS` is not an SEO rule.** It rejects medical, fertility, guaranteed-wealth,
  black-magic and caste claims outright, because `fc964c0` already had to reword seven Wani Shop
  items for the App Store and a blog is a worse place to make those claims, not a safer one. Each
  pattern is paired in the test suite with a legitimate sentence that must still PASS, or the
  agent silently stops writing about health, money and marriage.
- **`HINDI_NOT_HINDI` exists because a loaded model returns the English body again for
  `contentHi`**, and nothing downstream would notice — the app's Hindi toggle would just show
  English. It requires at least 25% Devanagari.
- **Each article is TWO calls, in the order English -> gate -> Hindi.** One reply cannot hold
  two articles: measured against the real API, asking for both gave ~8,000 characters split
  across them, i.e. **391-553 English words against a 700-word floor, rejected three times in a
  row.** Split, the same model gave 885 English / 1,117 Hindi and passed first time. The Hindi
  pass runs only AFTER the English gate passes — running it first meant every discarded article
  paid for a translation, and 3 attempts x 2 calls x up to 130s exceeds the systemd unit's
  TimeoutStartSec (raised to 1200s for the same reason; a healthy run is ~105s).
- **Hindi is judged by `quality.checkHindi()`, separately, and a failure DROPS THE HINDI rather
  than the article.** The Hindi columns are allowed to be empty and both apps already fall back
  to English, so rejecting 1,100 good English words over one weak translation would be the wrong
  trade. `check()` therefore judges no Hindi at all, in either stage. `checkHindi` returns
  `skipped: true` when there is no Hindi, so "never asked for" cannot be read as "came back bad".
- **Model names must be probed, never remembered.** `DEFAULT_MODELS` originally named
  `gemini-2.5-flash` / `2.0-flash` and **every call 404'd** — both retired, the API itself
  pointing at the 3.x line. Measured 2026-10-13: the full flash tier is routinely **503
  "high demand"** on free while the *lite* tier answers instantly, so the chain falls through
  flash → lite and **ends on the alias `gemini-flash-lite-latest`, which cannot 404 when a
  numbered version retires.** `GET /v1beta/models` is the authority.
- **Brand casing is normalised, brand MISSPELLINGS are rejected.** "AstroWani" is the same token
  to a search engine as "Astrowani", so `generate.normaliseBrand()` fixes the casing silently
  rather than discarding a good 1,400-word article over a capital W. "Astro Wani" and "Astrovani"
  are *different* tokens — mentions split across them are mentions thrown away — so those fail
  `BRAND_MISSPELT`.
- **`maxPerDay` (4) is a hard ceiling counted from the ledger**, and it is the guard against a
  misconfigured timer or two overlapping schedules quietly publishing twenty articles overnight.
- **The live config row wins over `config.js` DEFAULTS**, the same trap recorded at DR (free-call
  duration) and DU (Dakshina amounts). To change a live value, change `app_settings.blog_agent_config`.

### EB. What shipped alongside it, and the SEO blocker that remains

`sql/blog_agent.sql`, **APPLIED 2026-10-13**: `blogs.slug` (plus a partial unique index, so the
five pre-agent rows stay valid with NULL), and the `blog_agent_runs` ledger (RLS on, service-role
only, zero anon/authenticated grants).

It also adds `blogs.excerpt_hi` and `blogs.meta_description_hi` — and **that fixed a live bug
nobody had noticed since 2026-08-16.** `sql/blog_meta_description_hindi_schema.sql` was written
for those two columns and never applied, but `astrowani-admin`'s `Blogs.jsx` always sends them
(they are in its `EMPTY` object) and `adminRoutes.js` `crud('blogs')` has both in `allowed` — so
PostgREST refused the whole statement and **every admin blog save had been failing for two
months.** CLAUDE.md's old claim that `excerpt_hi` was "blank on every live row" was wrong: it did
not exist.

- `GET /api/blogs` now returns `slug`. `aw/blog.js` accepts **`?slug=` or `?id=`** forever, so no
  shared link can break, and sets a per-article canonical plus Open Graph/Twitter tags — the
  canonical matters because one article is reachable at both URLs and a crawler finding both
  treats them as duplicate pages, splitting whatever the article earns.
- `src/blogSitemap.js` serves `GET /api/blogs/sitemap.xml`, generated from the table. It is a
  ROUTE and not a file because the agent publishes three a day and cannot commit to the
  git-deployed website directory. A post with **no slug is excluded deliberately** — submitting
  a `?id=<uuid>` URL invites Google to index an address that changes the moment the row gets a
  slug. On a database error it still returns the static pages, because a crawler that gets an
  error page may back off for days.
- `astrowani-website/robots.txt` points at that route. **Every `Disallow` here must be absent
  from the sitemap and vice versa** — an earlier draft blocked `chat.html` and `call.html`, which
  look like app screens but are the "Chat with an Astrologer" / "Call an Astrologer" landing
  pages carrying the highest-intent keywords on the site. `testBlogAgent.js` now cross-checks the
  two files and asserts every submitted page exists as a real file.
- `aw/blog.js`'s `bestDescription()` keeps `meta_description` only when it reads as prose. The
  five pre-agent rows hold a keyword list in that column ("numerology, Palmistry, Astrology, …"),
  which `Home.js` renders as the visible line under a blog card; preferring it unconditionally
  made those five posts *worse*. ("Fewer than N commas" does not work — a good sentence has three.)

> **THE REAL SEO BLOCKER IS NOT CONTENT, AND THE AGENT CANNOT FIX IT.** `blog.html` and
> `blog-post.html` render **entirely in JavaScript**, and the new site is not on `astrowani.com`
> yet (that is still the old WordPress, with its own ThinkRank sitemap). Google does run JS, but
> on a second pass days-to-weeks behind, and only for URLs it already knows — and there is no
> server-rendered `<a href>` anywhere pointing at an individual article. The sitemap takes
> rendering out of the *discovery* path, which is why it matters disproportionately here, so
> **submit it in Search Console once the site is on its final domain.** What would actually solve
> it is server-rendered article pages (prerender at publish time, or an nginx route per post).
> That is website work, not agent work, and it is the highest-value SEO change left.

**`BLOG_SITE_BASE_URL` is the one setting that will need changing.** It defaults to
`https://shop.astrowani.com/test-site` because that is where the new site actually answers (all
13 internal link targets verified there 2026-10-13); those paths 404 on astrowani.com today.
Internal links are absolute, not relative, because the same `content_en` renders in the website,
the app and the admin. When the new site takes the domain, set it to `https://astrowani.com` and
run a one-off UPDATE over `blogs.content_en` / `content_hi` for the articles already published.

### Verified 2026-10-13
- **A real end-to-end generation was run** (owner-supplied key, 2026-10-13). Two topics, both
  accepted on the FIRST attempt after the two-call split: Mangal Dosh 885 EN / 1,117 HI words,
  Kundali Milan 868 EN / 1,057 HI (78.9% Devanagari), finishing at ~1,090 words with 9-11 brand
  mentions, 6 internal links and keyword density 0.74-1.27%. The prose is specific (houses,
  *bhanga* cancellation rules, Mars exalted in Capricorn, Tuesday remedies) and correctly frames
  readings as tendencies rather than verdicts. **The published article itself has still never
  been seen on the site** — these were `--dry-run`.
- **`scripts/testBlogAgent.js` — 210 offline checks** (no network, no DB, no keys). Every gate
  rule is paired with a positive control, because a gate that rejects everything passes a
  negative-only suite. **The suite was itself verified to FAIL on four deliberately introduced
  regressions** (gate ignoring banned claims, slug keeping Devanagari, assembly dropping JSON-LD,
  both slug guards removed) — the Devanagari one needed BOTH guards removed, which is how it was
  discovered that the `[^a-z0-9]+` catch-all already covers it.
- **`scripts/testBlogAgentLive.js` — 84 checks against the LIVE database and storage bucket**,
  model stubbed (the Gemini keys live only in the VPS `.env`). `index.js` is NEVER booted. It
  publishes a real row as a **draft**, asserts the columns, the rendered HTML (every `href` is
  ours, anchors balanced, no `<h1>`, no `style`/`class`), the parsed JSON-LD, the thumbnail
  actually fetching as a 1200x675 JPEG with EXIF stripped, the ledger row, and that
  `GET /api/blogs` does **not** serve it — with a positive control that the endpoint returned 5
  published posts, so the check is not passing on an empty list — then deletes everything and
  **asserts its own teardown**. Production confirmed unchanged after: 5 blogs, 0 slugs, 0 ledger rows.
- Two real bugs were found by that live suite and fixed, both of which would have shipped:
  **(1)** `sharp` refuses a composite larger than its base, and a long title at dpi 150 overflows
  1200x675 — and because `.composite()` is LAZY it threw at `.toBuffer()`, *outside* the
  try/catch meant to contain it, taking the whole article down. Same family as the
  fixed-pipeline-order trap at DX. **(2)** The teardown checked the public URL, which keeps
  answering 200 from Supabase's CDN after a delete, reporting a leak that was not there — storage
  deletion must be verified through the storage API.

### Still to do (owner)
- A **free Pexels key** (`PEXELS_API_KEY`, 2 minutes, no attribution required). Without it every
  article gets a generated gradient card instead of a photograph.
- `sudo bash vps-deployment/blog-agent/install.sh`, then `--dry-run` to read one, then `--enable`.
  **The agent ships disabled** — the timers fire and do nothing until it is switched on.
- Submit the sitemap in Google Search Console once the site is on its final domain.
- Operator guide, including every failure mode and the SQL to inspect the ledger:
  [`vps-deployment/blog-agent/README.md`](vps-deployment/blog-agent/README.md).

---

## Session 2026-10-19: the free tier ran out of BANDWIDTH, and nothing in the database was the cause

### EC. "Supabase limits are over" was not about space — and looking for space wastes the day

The org was hard-blocked: **Cached egress 6.25 GB against a 5.5 GB cap**, Fair Use Policy
applied, **every request to the project answering 402** until the cycle refilled on 11 Nov.
The owner's reading of it — and the obvious one — was "we are out of space, find what is
taking it up and delete it."

**Nothing was out of space, and deleting data could not have lifted the block.**

| | Used | Allowance |
|---|---|---|
| Database size | **40 MB** | 500 MB — 8%, irrelevant |
| Storage size | **688 MB** | 1 GB — 69%, not the blocker |
| **Cached egress** | **6.25 GB** | 5.5 GB — the one that was spent |

> **THE RULE: a Supabase quota mail names the quota. Read it before measuring anything.**
> "Cached egress" is bandwidth served from the storage CDN, it is a per-ORGANISATION monthly
> figure, and it is spent — it cannot be refunded by deleting the files that spent it. The
> first two rows of that table took one query each and ruled out the entire premise.

**How the real cause was found, and the query to reuse.** `query_logs` on `source='edge_logs'`,
summing `log_attributes['response.headers.content_length']` bucketed by path prefix, over the
24 h before the block:

```
/storage/v1/object/public/...   4,965 req   651 MB   (134 KB per image)
/storage/v1/render/image/...    8,449 req    83 MB   ( 10 KB per image)
every REST table combined     110,000 req   < 5 MB
```

**735 MB/day — ~22 GB/month against a 5.5 GB allowance — on roughly 130 app opens a day.**
89% of it was the `app-images` bucket. Every table in the database put together was under 5 MB.

**Three admin-uploaded files were 403 MB/day, 55% of all egress**, each fetched by ~120-130
DISTINCT IPs:

| File | Size | req/day | uniq IPs | MB/day | Column |
|---|---|---|---|---|---|
| `card-image/…3b04b1237be2.jpeg` | 1.23 MB | 139 | 124 | 171 | `astro_services.image` |
| `customer-profiles/…0cd47f678b94.png` | 1.05 MB | 147 | 130 | 154 | `customers.profile_image` |
| `card-image/…8d4eaffaa1b3.png` | 608 KB | 132 | 120 | 78 | `astro_services.image` |

The unique-IP counts are the whole diagnosis: these are SHARED SCREENS, so one oversized
upload is re-downloaded by every user who opens the app. A reviewer's own 1 MB selfie was
being served to 130 strangers a day because the reviews carousel rendered it full size.

> **DO NOT CIRCUMVENT A RESTRICTION. Two ideas were investigated and abandoned**, and they are
> written down so nobody re-derives them: (1) connecting **directly to Postgres**, whose port
> answers separately from the 402-ing API gateway, and (2) creating a **second free
> organisation** for a fresh quota. Both would have worked. Both are circumvention of an
> enforcement the provider applied — the mail already says "violations" — and the second is
> textbook multi-account quota evasion. The owner's instruction was explicit: never risk the
> account. The legitimate options are exactly three: reduce usage, wait for the refill, pay.

### ED. The fix was already in this repo, wired to ONE surface — plus the PNG trap

`thumbnailUrl` in `index.js` (added 2026-09-09) rewrites a Supabase `object/public` URL to the
`render/image` endpoint, which resizes and re-encodes on demand and caches the result. It was
only ever applied to **astrologer profile photos**. That is precisely the cheap half of the
table above: the 8,449 requests at 10 KB. The expensive half was every surface nobody extended
it to.

**`src/imageUrl.js` is now the single definition**, with widths named by SURFACE, not by caller
— the render endpoint caches per distinct URL, so every extra width is another full-cost miss:

| Width | Value | Why that number |
|---|---|---|
| `AVATAR` | 300 | unchanged; the 2026-09-09 measured value, covers list avatar + profile header |
| `AVATAR_SMALL` | 120 | reviewer/customer avatars, never render above ~40px |
| `ICON` | 240 | category + remedy-category tiles |
| `CARD` | **520** | the report grid is `width: '48%'`, two per row ≈ **518 physical px** on a 1080px phone |
| `BANNER` | **1080** | the banner box is `Dimensions.get('window').width` with NO margin — a 1:1 pixel match |

**`BANNER` is the one width NOT to trim.** Lowering it to 720 saves ~36 KB per banner and
upscales the most prominent image in the app on the device. At 2% of the Pro allowance that is
a bad trade. `CARD` went the other way: 600 was buying 24% more bytes than the screen can
physically show, measured across the real card art (320→22K, 480→47K, 600→68K, 1080→177K).

Applied to `/api/astro-services`, `/api/reviews/astrologers/reviews`, `/api/banners/all` (both
the resolved and the Hindi image), `/api/blogs`, `/api/categories`, `/api/remedy-categories`
and four vendor-side list routes. **No app, admin or website file was touched** — none of them
builds a storage URL itself, they all render whatever the API returns, so this reaches every
installed build with a backend deploy and no OTA.

**`src/uploadRoutes.js` also caps the SOURCE** (1024px for faces, 1600px for artwork). Nothing
on that path had ever resized anything. Four things in it are load-bearing: `.rotate()` runs
BEFORE resize (sharp strips metadata on re-encode, so a phone portrait would store sideways),
`withoutEnlargement`, keeping the original whenever re-encoding comes out bigger, and keeping
alpha images as PNG rather than introducing a format on a path with no device coverage.

> **THE PNG TRAP — the half of this that resizing cannot fix.** The render endpoint
> **preserves the source format**, and a photograph saved as PNG barely compresses however
> much it is resized. One live service card went 608 KB → 491 KB (**−21%**) and a blog
> thumbnail came back **1 KB LARGER than the original**. Two files, 59 MB/day, after the
> "fix". Both declared an alpha channel with **minimum alpha 255** — transparency present but
> never used — so converting to JPEG was visually lossless. **Always check `stats()` on the
> alpha channel, not `metadata().hasAlpha`**: the flag says a channel exists, the stats say
> whether anything uses it. Converted in production 2026-10-19 (originals left in storage, one
> UPDATE from rollback):
>
> - `astro_services.image` numerology card → `card-image/1792365865136-9be171f3e786.jpeg`,
>   608 KB → 63 KB, **78.4 → 4.5 MB/day**
> - `blogs.thumbnail` "The Light of Numbers" → `thumbnail-url-or-upl/1792365866645-0a6a88c56c00.jpeg`,
>   112 KB → 17 KB, **9.9 → 1.2 MB/day**

**It makes the app FASTER, not slower.** Measured from a Delhi Cloudflare edge on the 1.2 MB
card: the cached original **2.57 / 2.65 / 2.60 s**; warm through the render endpoint
**0.34 / 0.40 / 0.38 s**; and a **COLD miss — the first ever request at a given width, where
the server must fetch and resize — 1.77 s**, i.e. the worst case of the new path still beats
the steady state of the old one. That cold miss happens once per image per size, ~650 times
across the whole library.

### EE. Free is no longer enough for this app — and the grace period is gone

**Measured end to end** (real files through the real module, weighted by the request counts in
those same edge logs): the twelve heaviest files **520 MB/day → 45 MB/day (−91%)**, and the
project **735 MB/day → ~165 MB/day, about 5 GB/month**.

> **That is still over the Free plan's 5.5 GB once anything grows, so do not plan on
> downgrading.** An earlier estimate in this session said ~1.5 GB/month; it was wrong, because
> it assumed ~10 KB per image when a card at 520px is ~55 KB. The measured figure supersedes
> it. Roughly **half of the remaining 165 MB is the astrologer avatars**, which already go
> through the render endpoint at ~10 KB and are simply requested 8,449 times a day — the
> remaining cost is VOLUME, not waste, and there is no easy ground left.

**The org is on Pro as of 2026-10-19** (~$25/mo: $25 plan + $10 compute − $10 included compute
credits, one project). Restrictions lift immediately on upgrade. Spend Cap stays **ON**.
Knock-ons worth knowing:

- **Daily database backups now exist** — the thing flagged in "Standing rules" for months.
- Compute moves `nano` → `micro`; the 60-connection ceiling from **DN** is lifted.
- Billing is per ORGANISATION. Address and Tax ID are **ASTROWANIINDIA + GSTIN** per **DW**,
  entered BEFORE the first invoice because a finalised invoice cannot be regenerated.
- **The grace period is spent.** Supabase's own docs: after it ends, exceeding limits again
  brings restriction with **no second grace period**, and the warning only clears after
  several clean cycles.
- **Image transformations are listed as "unavailable on Free"** (Pro: 100 origin images
  included, then $5/1000). Ours have been serving regardless, so something is grandfathered —
  but the delivery fix now leans on a feature Free is not supposed to have. On Pro it costs
  ~$2-3/mo for ~650 distinct images. **This is the real argument for the R2 move**: images on
  R2 with resizing at upload needs no transformation service at all.

**Still open:**
- **Not deployed.** Commits `8b50292a` and `48e5a557` are on a branch; until the backend ships,
  the apps still request raw URLs. The two PNG conversions ARE live (they changed stored files,
  not code).
- ~~626 MB of dead OTA bundles~~ — **PRUNED 2026-10-19, but only 427 MB of it.** The two
  legacy `hot-updater-*` buckets held 307 objects; **101 of them (199 MB) are still
  referenced by 31 `bundles` rows that are `enabled = true`**, targeting app versions still
  in the wild (customer `24.0`/`24.0.0`/`24.0.x`, vendor `6.5`/`6.5.0`/`6.5.x`) plus 33
  `bundle_patches` delta rows. Deleting those would silently stop OTA reaching anyone who
  has not taken the native update — i.e. break the one channel that could fix it for them.
  **Never prune these buckets by bucket; prune by reference.** The safe set is objects with
  no row in `bundles` (`storage_uri`, `manifest_storage_uri`, `asset_base_storage_uri`) or
  `bundle_patches` (`patch_storage_uri`). Storage went **688 MB → 261 MB**.
  Note `asset_base_storage_uri` is a bare folder prefix (`…/assets`) with no object behind
  it, so an integrity check will always report it as 2 "missing" references — that is
  expected, not damage. Verified after: 3 kept bundles still download (5.1-5.3 MB), and the
  `update-server` function served **373 × HTTP 200** to real devices in the same 24 h.
- `scripts/testImageEgress.js` (**46 offline checks**, verified to fail on three deliberate
  regressions) and `scripts/recompressStorageImages.js` (dry-run by default, resizes in place
  without touching paths or formats).
- One row in `customers.profile_image` holds an on-device path
  (`file:///data/user/0/com.astrowanicustomer/cache/rn_image_picker_lib_temp_….jpg`) saved
  straight into the database. Unrelated pre-existing bug; the helper passes it through untouched.

---

## Subsystem added 2026-10-19: the welcome promise (EF)

### EF. The app says "you win" before anything has agreed — so the entitlement is granted

`screens/FreeCall/CampaignGiftReveal.js` tells a signed-out visitor **"YOU WIN!"** and
*"aapne jeet li hai 11 minute ki free call"*, with **no eligibility check of any kind**,
before they have an account. Four things could then refuse it after signup
(`free_call_offer.enabled`, the `mode:'selected'` allowlist, `audience_rules`,
`offerGuard`). Found during the App Store rejection audit — see
[`MD files/Apple-Rejection-Audit-2026-10-19.md`](MD%20files/Apple-Rejection-Audit-2026-10-19.md).

**Owner's decision: if we say "you win", they get the reward.** So the promise is made
true at account creation rather than the wording softened. `src/welcomePromise.js`
`grantOnSignup()` is called from `mobile-otp-verify`, **on the create branch only** (same
rule as acquisition attribution — a returning customer logging in has just been promised
nothing), best-effort, never throws.

> **THE REVEAL IS NOT CAMPAIGN-GATED, AND THE NAME LIES.**
> `acquisition.isTargetCampaignFirstOpen()` is `if (PROMPT_SHOWN_KEY) return false; return
> true;` — it does not look at the referrer at all (corrected 2026-10-10, comment in
> `App.js`). So **every** signed-out first cold start sees the promise: organic installs,
> and every iPhone, which has no install referrer and therefore
> `acquisition_source = null`. Keying the grant off `acquisition_source` — the obvious
> move, and what was first asked for — would have honoured it for a minority and left
> everyone else with exactly the broken promise being fixed.

**It grants the SAME `free_call_invites` row the admin card writes** (subsystem CR), which
already means "this customer gets the offer whatever is switched off". Nothing new was
allowed to bypass anything. **The consequence is in the FOUR WAYS section above: turning
`free_call_offer.enabled` off no longer stops new signups.**

**Who gets it is the Audience Targeting feature `welcome_promise`** (`src/audience.js`
`FEATURES`, admin → Audience Targeting), matched against the `acquisition_source` written a
few lines earlier in the same signup. Unset = everyone, which is today's answer and who the
screen promises it to. Narrowing it later to particular ad sources is an admin edit, no
deploy — which is the whole reason the hook exists before anyone needs it. It is read
**once per customer**, so narrowing never takes the call away from someone already granted.

**Fail directions, deliberately not uniform:**
- The **config read fails OPEN** (grant). This is the opposite of `freeCallRoutes
  .isNewCustomer`, which fails closed because a free call is a real astrologer's time — and
  the reason for the inversion is that by the time this runs the app has already told the
  person they won. A DB blip must not turn that into a lie. Bounded to one per number by
  `offerGuard`.
- Only a **literal `false`** switches it off; a typo or half-written blob reads as on.
- The **one refusal kept** (owner's instruction) is `offerGuard` FREE_CALL with
  `failClosed: true`: this number already used its free call on an account it then deleted.
  Honouring a promise is not the same as letting it be farmed (subsystem CY).
- An empty instant pool is **not** a broken promise — `loadOffer` falls back to
  `scheduled`, so the call is booked rather than instant.

### Verified 2026-10-19 — 37/37 against the live database and over real HTTP
`scripts/welcomePromiseCheck.js` (**`index.js` never booted** — a bare Express app on an
ephemeral port, so no EADDRINUSE to mistake for a product failure). Run it with
`node --env-file=.env scripts/welcomePromiseCheck.js`; it passed with
`FREE_CALL_LOCAL_TEST` both true and **false**, which is how production runs (the 2026-10-05
lesson: that flag has invalidated an assertion before).

The section that matters is the last one: `grantOnSignup` writing a row proves the module,
not that the row unlocks anything. So it signs a real customer JWT, reads the real
`GET /api/free-call/offer`, and asserts `invited: true` — **with a negative control first**
(no invite → not reported as invited), which is also what proves local-test mode is not
forging that field. Every refusal case is likewise preceded by a positive control.

Covers: the config normalisation (the string `"false"` and `0` do **not** switch it off);
the grant, its `invited_by: 'welcome_promise'` marker, and a ~30-day expiry; that the row is
found by **the query `findActiveInvite` actually runs**, not merely present; idempotency on
a retried OTP verify (compared by `getTime()`, never string equality); `enabled: false`
refusing and writing nothing; an `only` audience rule excluding an unknown-source customer
while **granting** a `qr_` one; and the `offerGuard` refusal with another number as its
control. Teardown is asserted, and production was re-read afterwards: 3 invite rows as
before, 0 from the promise, 0 synthetic claims, `audience_rules` byte-identical, the
welcome-promise key still absent.

> **A segment id is not its label.** The first version of the narrowing check wrote
> `only: ['qr_posters']` because the segment reads "QR posters" in the admin — its id is
> `qr` — and the grant went through, which looked exactly like a broken gate. It was not:
> `normalizeRules` drops an `only` naming no known segment and degrades to **everyone**,
> deliberately (DI), since the alternative is blocking everybody over a typo. There is now
> a named check for that behaviour.

**Not exercised on a device.** The test worth doing: install fresh, tap the gift box open,
sign up, and confirm the free call is actually offered — then again pressing ✕ instead of
the CTA, since both are meant to keep it.

### The demo login — FIXED 2026-10-23, and the state is different again from this note

**Customer side: fixed.** `customers` now holds exactly **ONE** row for 9999999999 —
`2e23b19d-3221-42bd-b967-2dcc9dd8cbbd`, created 2026-10-22, renamed **"Ansh" → "Test User"**
on 2026-10-23 so the App Store / Play review notes are true again. Safe to rename: the row
had 0 sessions, 0 wallet transactions, 0 orders and 0 free-call bookings (just the one
`free_call_invites` row every signup now gets, subsystem EF) — it is a test signup, not a
real customer. **The `parked-reviewer-9999999999` row and the ids in the old version of this
note (`550e8400-…`, `bcf31426-…`) NO LONGER EXIST.** Do not look for them.

> **THE RULE, now demonstrated three times: never quote a reviewer-account id or name from
> this file or from the `store_reviewer_accounts` memory — re-read the live DB.** The row is
> deleted and recreated whenever someone tests the delete-account flow on that number, so
> every recorded id goes stale and the name reverts to whatever the tester typed. The only
> durable facts are the NUMBER (9999999999) and the OTP (123456).

**Astrologer side: STILL BROKEN, and it is a submission blocker.**
`astrologers` row `1f70210e-6234-4f49-a764-13e851968e1e` ("Play Store Reviewer", created
2026-08-14) is `approval_status = 'approved'` and `hidden_from_customers = true` as intended
— but **`is_suspended = true`**. CLAUDE.md's 2026-09-16 record (subsystem CN) says approved
and says nothing about suspension, so this was set later. A reviewer logging into the
astrologer app on that number hits the suspended path, not the dashboard. **Clear it before
submitting either astrologer app**, and re-check it on the day of submission rather than
trusting this line.

---

## Subsystem added 2026-10-19: telling iPhone and Android customers apart (EG)

### EG. One dashboard with a platform filter — never a second admin

Astrowani is becoming **four store listings** (customer × Play, customer × App Store,
vendor × Play, vendor × App Store) over **one backend, one database, one admin**. That
is deliberate and must stay that way; nobody forks a codebase per store. The gap was
that the admin could not *see* the difference, so nothing could answer "how many
customers are on iPhone", "is recharge failing only on iOS", "is this refund Razorpay or
Apple IAP", or "which platform produced that crash".

`vendor_devices.platform` has recorded this for ASTROLOGERS since 2026-09. The customer
side had nothing, and the customer app sent nothing at all.

**`sql/customer_platform.sql` — APPLIED to production 2026-10-19.** Two nullable columns
on `customers`, both `CHECK (… IN ('ios','android','unknown'))` matching `vendor_devices`,
plus a partial index. No grants, so `anon`/`authenticated` stay at zero (verified `NONE`
after applying).

| Column | Written | Answers |
|---|---|---|
| `platform` | **every login**, latest wins | the operational question — is iOS recharge broken, which platform is this ticket |
| `signup_platform` | **account creation only**, never again | the reporting question — how many of last month's signups were iPhone |

> **WHY TWO COLUMNS, and why this had to ship BEFORE the App Store launch.** A single
> latest-wins column cannot answer the signup question once anybody changes handset, and
> **platform is not backfillable** — there is no record anywhere of what a past signup was
> running. Applying this after the first iPhone signs up means those customers are
> permanently unattributable. The split mirrors one the codebase already makes:
> `acquisition_source` is create-branch-only because origin is a property of the account,
> while `fcm_token` is rewritten every login because reachability is a property of the
> device in someone's hand.

**It also separates two things that previously looked identical.** `acquisition_source` is
Android-only (Play Install Referrer, no iOS equivalent without a paid SDK), so every
iPhone customer lands there as null alongside every pre-2026-09 Android customer. Null in
*that* column is permanent and normal for iOS; null in `platform` is temporary and shrinks
as customers log in. **Do not fold them together.**

**Things that are load-bearing — do not "simplify" them:**

- **ABSENT IS NOT `'unknown'`.** `src/devicePlatform.js` `normalizePlatform()` returns
  **null** for a missing/empty value and `'unknown'` only for something unrecognised.
  Callers must then write *nothing* — stamping `'unknown'` over a value an earlier login
  established correctly is strictly worse than leaving it alone, and every installed build
  predating this sends nothing.
- **The signup write is SEPARATE from the acquisition write, and that is the whole point.**
  The acquisition update only runs `if (acqSource || acqRaw)`, and both are **always null
  on iOS** — folding platform into it would silently skip the exact platform the column
  exists to measure. Not folded into `insertAccountRow` either: that helper drops its
  optional columns as one group on a missing-column error, so an unapplied migration would
  also cost the terms-acceptance record.
- **The login write is a patch object, not `if (fcmToken)`.** The old customer update was
  gated on having a push token, so a customer who never granted notification permission
  would have had no platform recorded *ever* — a large, invisible hole in the one column
  this exists for. Mirrors the vendor branch's `loginPatch`.
- **All THREE customer OTP call sites send it** (`SignupGatePopup`, `OtpScreen/VerifyOtp`,
  `OtpScreen/OtpScreen`) via one shared `utils/devicePlatform.js`. The login screen creates
  accounts too, so gating on "is this signup" would drop it — the same trap already
  recorded for acquisition.
- **The admin list route has a THREE-TIER column fallback** (platform+removal → removal →
  base). A column PostgREST does not know **400s the whole query** rather than omitting the
  field, so without it a backend deployed before the migration renders the Customer
  Tracking page completely empty. Only a missing-column error falls through; anything else
  is rethrown so a real fault cannot hide behind a silently narrower column set.
- **`vendorDevices.registerDevice` now uses the shared helper** instead of its own inline
  whitelist. Identical for every value either app sends, additionally tolerant of casing
  and whitespace (which the old line recorded as `'unknown'`).

**Admin:** a `ChipGroup` **Platform** filter (All / Android / iPhone / Unknown, with counts
taken from what the other filters leave) plus a Platform column and both columns in the CSV
export, on the existing Customers page. **No new page, and there must never be one** —
per-store dashboards diverge the moment one is filtered.

**Release ledger:** "What's live where" at the top of
[`MD files/deployment-and-releases.md`](MD%20files/deployment-and-releases.md) — four
listings × store version × build × newest enabled OTA bundle, seeded with real values
(customer 24.1/63, vendor 6.6/35, both iOS rows not submitted) and the SQL to read the
live state back.

### Verified 2026-10-19 — 53/53 through the real route, plus 7/7 on the vendor path
`scripts/customerPlatformCheck.js`, run as
`PORT=4599 node --env-file=.env scripts/customerPlatformCheck.js`. It drives the **real**
`mobile-otp-verify` via `scripts/devServer.js` (so `index.js` is never booted directly and
the billing worker never runs), forces `FREE_CALL_LOCAL_TEST=false` for production parity,
and **refuses to start if the boot log shows EADDRINUSE** — a port clash silently tested
stale code once before (DH). Uses the no-SMS QA number `9123450001`, and refuses to run if
that number already has a row.

Covers: the helper including absent-vs-unknown and parity with the line it replaced; a
signup on Android (**the positive control — everything after it is "X did not change"**);
a signup on iPhone; a login from the other platform moving `platform` while
`signup_platform` stays; a login with **no fcmToken** still recording it; a build sending
nothing leaving both values alone rather than writing `'unknown'`; a garbage value stored
as `'unknown'` and never raw; the database CHECK rejecting a direct bad write; the admin
route actually serving both fields (with a populated-list control); and that an unknown
column really does error, which is why the tiers exist. Teardown asserted — production back
at 4,058 customers, 0 welcome-promise invites.

> **THE SUITE WAS VERIFIED TO FAIL on three deliberately introduced regressions**, which is
> the only reason to trust it: absent→`'unknown'` (2 failures), the login branch also
> overwriting `signup_platform` (3 failures, across three independent sections), and the
> create branch recording nothing (9 failures). `scripts/` had no vendor-path coverage for
> `registerDevice`, so that was checked separately against the live DB (7/7, synthetic
> device row removed).

Also: customer app bundles for Android (**8,204,248 bytes**, `devicePlatform` present in the
shipped JS), `astrowani-admin` `npm run build` clean, `node --check` clean on all changed
backend files, and eslint on the changed app files **identical to HEAD** (45 problems, the
same 1 pre-existing error — compared side by side).

**Not exercised on a device, and that is the test worth doing:** sign up fresh on Android
and on an iPhone, then check the Platform column and filter in admin. Note the column will
read "Unknown" for all 4,058 existing customers until each of them next logs in on a build
carrying this — **which needs the customer OTA; the backend half alone records nothing.**

---

## Session 2026-10-21: 14% of calls were killed by a timer while the mic dialog was still open

### EH. The permission prompt raced the connect watchdog, and the watchdog won

Reported as "calls get cut under one minute, most calls go this way". It was not most calls,
and the shape of the data is what gave it away.

**Measured first, 7 days to 2026-10-21.** The distribution is BIMODAL — survivors run a
median 5-6 minutes, and a separate population dies almost immediately:

| | calls | died <60s | never activated |
|---|---|---|---|
| free audio | 394 | 143 (36%) | 98 |
| paid audio | 81 | 21 (26%) | 12 |
| chat | 107 | 10 (9%) | 3 |

The deaths are not spread across that minute. They are a spike at **47-51s: 63 sessions, 56
of them with `next_billing_at` still NULL**, i.e. no media ever flowed. Humans hanging up do
not cluster in a 5-second window; a timer does.

**THE CAUSE.** Every call screen asked for `RECORD_AUDIO` on mount inside `setupWebRTC()`,
and armed `createPreConnectWatchdog()` in the same effect — but the watchdog captured
`startedAt = Date.now()` at creation, while `setupWebRTC()` was still sitting on
`await PermissionsAndroid.request(...)`, **which blocks on a human tapping "Allow"**. 45s
later the watchdog ended the call with "We could not connect this call", underneath a dialog
the customer had not answered yet. 45s deadline + 3s poll + the `/api/call/end` round trip is
exactly the observed 47-51s.

> **THE CONFIRMING NUMBER, and the one to reuse: a customer's FIRST EVER call failed 16.4%
> of the time against 7.3% for every later call.** Android shows that dialog once. That gap
> *is* the dialog. It also explains why the free intro call is worst hit — a free call is
> almost always someone's first-ever call, on an app installed two minutes earlier.

**This is the same bug family as the 60-second `sessionRoom` cap (DO): a clock captured at
mount that outlived what it was meant to measure.** When a deadline and the thing it bounds
start at different moments, say so explicitly.

### What was ruled out, with evidence — do not re-derive this

- **The relay is healthy.** A real TURN `Allocate` against `76.13.243.165:3478` using the
  exact credentials compiled into the shipped APKs → **SUCCESS**, relay allocated. UDP and
  TCP both answer Binding too. coturn listens on **3478 only** (checked `ss -lntup`): there is
  no TLS listener, and **443 is nginx** (a raw STUN probe there returns `0x4854`, i.e. "HT").
  Note a TCP probe of 5349 can look like a connection that never answers — that is a false
  positive from a script printing on timeout, not a listener.
- **Not capacity.** The busiest hour (16:00 IST, 51 calls) has the LOWEST failure rate (6%);
  quiet hours are worst. Saturation would do the opposite.
- **Not one bad astrologer or handset.** Spread 7-38% across all 23 astrologers, 370 distinct
  customers, and 14 of 35 repeat customers got MIXED outcomes.
- **Not the backend.** `logs/errors.log` holds no entry for any of these sessions — only SMS
  failures and billing reconciliation. The server behaved correctly throughout.
- **VPS access for this:** `ssh -i ~/.ssh/astrodilip_deploy -p 2222 deploy@76.13.243.165`.
  That user has **no `sudo`** (so `/root/.pm2/logs` is unreachable), but
  `/var/www/astrowani-monorepo/astrowani-backend/logs/errors.log` is world-readable.

### The fix

**Primary — ask at the tap, not on mount.** `customer src/utils/callPermissions.js`
(`ensureCallPermissions({video})`), called from `InstantAstrologers.onCall` **before**
`ringInstantAstrologer`. By the time the call screen mounts the permission is settled, so
there is nothing to race. It also means a customer who denies the mic **never rings an
astrologer and never spends their one-per-customer free call** on a call that could not have
carried audio (`free_call_mic_denied` is captured). Reuses the existing `call.permissionRequired`
/ `call.micPermissionMsg` keys — no new i18n. `check()` runs before `request()` so a repeat
caller never sees a dialog on a tap that used to be instant.
- **It FAILS OPEN.** Only an explicit denial returns false; a thrown bridge error or an
  unreadable result proceeds, because the call screen asks again and handles a real denial
  itself. Refusing to place a call because a permission probe misfired is the worse failure.
- **iOS has no `PermissionsAndroid`**, so there the prompt is raised by opening a
  `getUserMedia` stream and releasing it immediately; the OS caches the grant, so the call
  screen's own `getUserMedia` a moment later does not prompt again.

**Secondary, the safety net — `preConnectWatchdog` now takes `isMediaReady`**, and
`deadlineMs` runs from the moment media is genuinely open rather than from mount. A caller
passing no `isMediaReady` keeps exactly the old behaviour. Wired in all four call screens via
a `mediaReadyRef` set where `getUserMedia` resolves. A **new `setupDeadlineMs` (120s)** still
bounds "media never opened at all", because *nothing may sit on "Connecting…" forever* — but
on the long clock, since what it is waiting for is a human reading a dialog.
**Crucially, `ended_by_other` is still detected throughout the permission wait**, so a hangup
during the dialog is reported as promptly as before.

### Verified 2026-10-21 — 23/23, no device, no network, no database
`astrowani_customer-main/scripts/testPreConnectWatchdog.js` drives the REAL module on a
virtual clock with a stubbed poll transport. It asserts the two app copies are byte-identical
(drift guard, per DY), that the 45s kill no longer fires while media is unopened, that it
still fires 45s after media opens late, that the old behaviour is preserved without
`isMediaReady`, and that all four screens declare, set and pass `mediaReadyRef`.

It also asserts the **delivery path** for all seven entry points: that each asks on every one
of its call paths, and that every `ensureCallPermissions` appears BEFORE every
`/api/call/initiate` / `ringInstantAstrologer` in that file. A call site that imports the
helper but asks AFTER the POST has already rung an astrologer, which is the thing this change
exists to stop — and that is the regression a naive "does it import it" check would miss.
Both failure modes were introduced deliberately and caught (2 failures for never asking,
1 for asking too late).

> **The suite was verified to FAIL on the original bug** — restoring
> `Date.now() - startedAt > deadlineMs` produces 3 failures while the two "behaviour must not
> change" cases still pass. Every negative check is paired with a positive control
> (`still bounded at 120s`, `ended_by_other still gets through`), because a watchdog that had
> simply stopped working would pass every "not killed" assertion on its own.

**All SEVEN call entry points now ask before they ring** (same session): the free instant
call, `Call.js`, `Video.js`, `Home.js` (audio + video), `AstrologerInfo.js` (audio + video)
and `ExpertsList.js`. Each asks **after** the wallet check and **before**
`POST /api/call/initiate`, so nobody is prompted for a permission they only need for a call
they cannot afford, and no astrologer is rung for a call with no microphone behind it. Video
paths pass `{video: true}` and use `call.micCameraPermissionMsg` (both languages already had
the key). Chat is deliberately untouched — it opens no media.
**Also still open and unrelated to this bug: there is no TURNS/443 relay path** (DM item 2),
which is the likely explanation for the ~7% floor that survives on repeat calls.

**Not exercised on a device.** The test worth doing: a FRESH install, tap "Call free", and
confirm the mic dialog appears BEFORE the astrologer's phone rings, that denying it rings
nobody and leaves the offer unspent, and that allowing it connects.

---

## Session 2026-10-23: the first iOS builds, and five failures worth not repeating (EK)

### EK. A build that COMPILES is not a build Apple ACCEPTS

The first ever signed iOS build of the customer app took five attempts. Every failure was
toolchain, not app code, and each only became visible once the previous one was fixed.

| # | Failed at | Cause | Fix |
|---|---|---|---|
| 1 | Apple sign-in | `iTunes service key is empty` | eas-cli **22.2.0 -> 25.3.0**. It bundles fastlane's Apple-auth code; Apple moved the endpoints. It died BEFORE asking for 2FA, which is how you tell it is not the password. |
| 2 | Xcode compile | `AppTransaction has no member 'appTransactionID'` | `react-native-iap` 13.0.4 reads an iOS 18.4 property. The `#available` guard is correct, but Swift still COMPILES the line, so it needs the 18.4+ SDK. |
| 3 | Xcode compile | `IPHONEOS_DEPLOYMENT_TARGET ... 9.0 ... supported is 15.0 to 27.1` | CocoaPods-GENERATED privacy-manifest and resource-bundle targets inherit each pod's ancient minimum. Podfile `post_install` raises them to 15.1. Older Xcode only warned. |
| 4 | Xcode compile | `call to consteval function 'fmt::basic_format_string<...>'` | RN 0.77 does not compile on Xcode 26. See below. |
| 5 | **Apple, after a successful upload** | **ITMS-90725** | **The one that matters — read on.** |

> **THE RULE: a green build tells you nothing about whether Apple will take the binary.**
> Build 1 compiled, signed, uploaded and was then refused at processing:
> *"This app was built with the iOS 18.5 SDK. All iOS and iPadOS apps must be built with the
> iOS 26 SDK or later."* The reaction to failure 2 had been to pin `"image": "latest"`; the
> reaction to failure 4 was to retreat to Xcode 16.4, which compiled — and produced exactly
> the binary Apple refuses. **Verify `DTSDKName` in the built `.ipa` BEFORE submitting**
> (see the check at the end of this section); it costs thirty seconds against a
> twenty-minute round trip and an email.

**APPLE'S FLOOR AND REACT NATIVE'S CEILING NOW OVERLAP.** Apple requires Xcode 26+; RN 0.77
does not compile on it. There is no older toolchain to retreat to, so `fmt` is patched:

- `ios/Podfile` `post_install` (BOTH apps) forces `FMT_USE_CONSTEVAL` to 0 in the fmt pod.
- **A `-DFMT_USE_CONSTEVAL=0` compiler flag DOES NOT WORK.** RN pins **fmt 11.0.2** through
  `RCT-Folly`, and in 11.0.2 the macro is set by an unguarded `#if/#elif` chain that
  overwrites anything passed with `-D`. The `#ifdef` guard that would honour a flag arrived
  in **fmt 12.1.0**, which RN has not adopted. Patching the header is the only route.
- **The hook RAISES when it finds nothing to patch**, deliberately. Every published version
  of this workaround shares one failure mode: the pattern stops matching after a dependency
  bump, the hook silently does nothing, and the same consteval error returns fifteen minutes
  later looking like a new problem. **Delete the whole block when RN ships fmt >= 12.1.0.**
- Ruby trap, caught before it cost a build: `gsub(..., '\\10')` is **backreference 10**, not
  group 1 followed by a zero. With one capture group it substitutes empty and emits a
  valueless `#define`. Use the block form.

**`"image"` IS PINNED AND MUST STAY PINNED** — `macos-sequoia-15.6-xcode-26.0`, the EARLIEST
image meeting Apple's floor. `"latest"` is not a stable target (it resolved to Xcode 27.1
today) and a floating alias on a React Native app means the toolchain moves under a release
that has not changed a line. Xcode 27 images additionally require the UIKit scene life cycle.
Move the pin deliberately, when RN is upgraded.

### What is live
- **Apple Developer Program: INDIVIDUAL**, Team ID `U49M3S8V97`, seller name **Ansh Sharma**
  (see CO Phase 3 for why Individual, and what it defers).
- **App Store Connect app: `Astrowani - Ask an Astrologer`, Apple ID `6826113999`**, primary
  language English (U.K.), bundle `com.astrowanicustomer`. Written into
  `astrowani_customer-main/eas.json` as `submit.production.ios.ascAppId`, so submits need no
  interactive lookup.
- **Customer build 24.1 (2)** uploaded and accepted for processing. Build 1 is spent.
- APNs key `49V28JX3XB`, Firebase (both apps, both slots), VoIP env on the VPS — all 2026-10-23.

> **THE App ID TRAP.** `developer.apple.com` holds THREE identifiers: the real
> `com.astrowanicustomer` (ugly EAS-generated name), plus `com.astrowanicustomer.U49M3S8V97`
> and `com.astrowaniVendor.U49M3S8V97` — two hand-made App IDs with the TEAM ID pasted into
> the identifier. **The tidy-looking names are the broken ones.** Pick by IDENTIFIER, never
> by name. The vendor app still has NO usable `com.astrowaniVendor` App ID; EAS registers it
> on that app's first build.

### Verify a built .ipa before submitting
Unzip `Payload/*.app/Info.plist` and `embedded.mobileprovision` and check four things:
`DTSDKName` (must be `iphoneos26.x` — this is ITMS-90725), `CFBundleVersion` (must exceed
every number already uploaded, accepted or not), `UIDeviceFamily` (`[1]` = iPhone only, see
CO Phase 3), and the profile's `aps-environment` (must be `production`, or push works on a
dev build and goes silent in TestFlight). Build 24.1(2) was confirmed as
`iphoneos26.0` / `2` / `[1]` / `production`, with no `ProvisionedDevices` (App Store, not ad hoc).

---

## Subsystem added 2026-10-23: a customer can finally block an astrologer (EJ)

### EJ. The two directions were asymmetric, and the customer had the weaker half

App Store Guideline 1.2 asks for three things where users contribute content: a filter,
a way to report, and **the ability to block abusive users**. Before today:

| Surface | Report | Block |
|---|---|---|
| Live-stream comments | yes | yes |
| Astrologer profile | yes | **no** |
| Astrologer's side of a chat | yes (`ReportCustomerSheet`) | yes |
| **Customer's side of a chat** | **no** | **no** |

So the astrologer could report AND block the customer mid-consultation, while the customer
could only report from the astrologer's PROFILE — never from inside the conversation — and
**could not block anybody, anywhere in the app**. That asymmetry is what a reviewer testing
a 1:1 chat app probes for, and it mattered more after 2026-10-12 (DX), when astrologers
gained the ability to send **photographs** into that chat: unmoderated image content from
one user to another, with the recipient unable to report it in context or stop the sender.

| Piece | Where |
|---|---|
| `sql/astrologer_blocks.sql` | the missing table. **APPLIED 2026-10-23.** RLS on, zero anon/authenticated grants, self-verifying `DO $$` tail |
| `src/customerModeration.js` | `isBlockedByCustomer`, `blockAstrologer`, `unblockAstrologer`, `listBlockedAstrologers`, and **`isContactBlocked`** |
| `src/moderationRoutes.js` | `POST /api/astrologers/block` / `unblock`, `GET /api/astrologers/blocked`, plus `customerFromReq` |
| customer `components/ChatModerationSheet.js` | the sheet; a ⋮ in `ChatSessionScreen`'s header opens it |
| 22 i18n keys, EN + HI | `context/LanguageContext.js` |

**Things that are load-bearing — do not "simplify" them:**

- **THE TABLE NAMES READ BACKWARDS, and both are correct.** `customer_blocks` holds
  "an astrologer has blocked a customer"; `astrologer_blocks` holds "a customer has
  blocked an astrologer". **Each is named after WHO IS BLOCKED**, not who did the
  blocking. Getting this backwards silently inverts a moderation decision.
- **The three contact paths call `isContactBlocked`, NOT `isBlocked`.** It asks both
  directions. `index.js` `/api/call/initiate`, `/api/chat/check-availability` and
  `/api/chat/initiate` were all switched. Leaving them on `isBlocked` would have meant a
  customer-side block was written, confirmed to the customer, and then **silently ignored
  on the one path where it has to bite** — which is exactly what the verification suite
  was confirmed to catch.
- **It FAILS OPEN**, like the astrologer-side check it mirrors, and for the same reason:
  this runs on the initiation path for every call and chat, so a transient database error
  must not take the whole marketplace dark. A blocked astrologer may get through during an
  outage; the alternative is every consultation on the platform failing on a blip.
- **`customerFromReq` REFUSES AN ASTROLOGER TOKEN before any lookup.** One phone number
  can be both a customer and an astrologer — the store-reviewer account 9999999999 is
  exactly that — and the lookup works by phone, so an astrologer's token would otherwise
  resolve to the customer sharing the number and let them block in that person's name.
  Same trap, same fix, as `/api/requests/:kind/:id/status` and `/api/notifications/read`.
- **Report and block stay INDEPENDENT.** Someone may want to flag an astrologer without
  cutting off a consultation they have paid for, or cut contact without filing a complaint.
  The sheet offers report, report-and-block, and block-alone; the server keeps them separate.
  On a combined submit the REPORT goes first and the block is best-effort, because the
  report is the record that matters and must not be lost to a failed block.
- **A block does NOT end the live session.** Tearing down a billing consultation from a
  moderation sheet would be worse than the problem: the customer may want to finish the
  minutes they paid for, and the End button is immediately beside the ⋮. The popup says the
  chat is still open. The block governs FUTURE contact.
- **The reason slugs must stay inside `moderationRoutes.REASONS`**, which the block endpoint
  validates against; anything else is a 400. The *report* sends an English label instead,
  because `astrologer_reports.reason` is free text read by an admin — same split, and same
  reason, as `LiveReportSheet`'s `STREAM_REASON_LABELS`.

### Verified 2026-10-23 — 26/26 over real HTTP against the live database
`scripts/chatModerationCheck.js` (`node --env-file=.env scripts/chatModerationCheck.js`).
**`index.js` is never booted** — only the moderation routes are mounted on a bare Express
app on an **ephemeral port**, so there is no EADDRINUSE to mistake for a product failure
(the 2026-09-30 lesson). It drives the real routes with real signed JWTs rather than calling
the module, because a harness that only tests its own helper reports green while the call
sites stay broken (BN).

Every refusal is preceded by a POSITIVE CONTROL, so a route that refused everything could
not pass: contact is asserted ALLOWED before the block and allowed again after the unblock.
Covers the write, the reason, idempotency via the UNIQUE pair, the caller-scoped list,
`isContactBlocked` seeing a customer-side block, the astrologer-side direction staying
independent, an unauthenticated refusal, **an astrologer token refused twice**, a missing
id, an unknown reason writing nothing, and unblocking twice being a success rather than a
404. Teardown is asserted.

> **The suite was verified to FAIL on a deliberate regression** — reducing
> `isContactBlocked` to the astrologer direction alone produces exactly one failure,
> "isContactBlocked sees a CUSTOMER-side block", which is the assertion that stands between
> this feature and a block that does nothing. That is the only reason to trust the 26.

Also: 22 i18n keys with zero one-sided (EN + HI both 22), `node --check` clean on all three
backend files, and eslint on the changed app files back to the single pre-existing
`exhaustive-deps` error at `ChatSessionScreen.js:757`.

**Not exercised on a device, and that is the test worth doing:** open a chat, tap the ⋮,
report with the block checkbox, then confirm from the astrologer's phone that a new chat or
call to that customer is refused with the neutral "not accepting consultations" message —
neutral on purpose, since naming who blocked someone invites retaliation.

---

## Session 2026-10-21 (later): free intro call 11 → 7 minutes — CODE ONLY, NOT LIVE

### EI. The change is staged in code; production is still on 11

Owner, 2026-10-21: the free introductory call becomes **7 minutes**, everything else
unchanged. Then, mid-change: *keep it local for now, we are not pushing it directly* — the
Google Ads creatives say 11 minutes and the owner will update them first.

> **PRODUCTION IS STILL 11 MINUTES. `app_settings.free_call_offer.durationMinutes` = 11 and
> `headerText` = "Your first 11-minute call is on us".** The row WAS briefly written to 7
> during this session and was reverted within minutes; `loadOffer()` was re-read afterwards
> and confirms 11 / 660s ceiling, with `enabled`, `mode`, `payoutMilestones`,
> `ringTimeoutSeconds` and `minFreeCallsBeforeOptOut` all untouched.

**TO GO LIVE, two things must happen TOGETHER — and this is the trap.** Per DR the database
is the authority, so the code alone changes nothing:

```sql
update app_settings
set value = ((value::jsonb) || jsonb_build_object(
      'durationMinutes', 7,
      'headerText', 'Your first 7-minute call is on us'))::text
where key = 'free_call_offer';
```

> **But the app's own copy is NOT server-driven.** `Login.js`'s `FREE_CALL_MINUTES`
> constant and every `campaignGift.*` / `campaignMetro.*` / `freeCall.giftHint` string are
> hardcoded, so an app build carrying this change will SAY 7 minutes while a database still
> on 11 GIVES 11 — and the reverse if the row is flipped before the OTA lands. **Flip the row
> and ship the OTA in the same window**, or the gift reveal promises one number and the call
> delivers another. Rollback is the same statement with `11` and the old header.

**What changed in code (nothing applied to the database):**
- `freeCallRoutes.js` — `DEFAULTS.durationMinutes` 11→7, `headerText`, `instantBodyText`,
  the `EMPTY` instant fallback, and 4 `|| 11` fallbacks.
- `sessionManager.js` — the `endOverdueFreeCalls` backstop `(row.duration_minutes || 11)`.
- `freeCallAnalyticsRoutes.js` — `TALK_BUCKETS` rebuilt around a 420s ceiling
  (`4 – 6`, `6 – 7`, `Full 7 min`) instead of 480/660.
- Customer: `Login.js` `FREE_CALL_MINUTES`, `FreeCallApi.js`, `FreeCallIncoming.js`,
  `InstantAstrologers.js`, `SignupWelcome.js`, and **14 i18n strings in EN + HI**.
- Vendor: `FreeCalls.js`. Admin: `FreeCallBookings.jsx`, `FreeCallSettings.jsx` DEFAULTS.
- A comment sweep across 36 files, so no source comment still claims 11 minutes.

**Deliberately NOT changed:**
- **`payoutMilestones` stays `[{minutes: 4, amount: 5}]`.** The mark is at 4 minutes, still
  comfortably inside 7, and the payout is FLAT above it (DR) — so the astrologer still earns
  ₹5 for any call past 4:00 and nothing accrues with length. `MIN_DAKSHINA_SECONDS` (180) is
  likewise untouched: it decides whether an astrologer hanging up early burns the customer's
  one free call, not what they are paid.
- **The Google Ads campaign name `"11 min call better geolocations"` is a PROPER NOUN** and
  must survive every sweep — it is matched against the install referrer in
  `customer src/utils/acquisition.js`. Renaming it in comments would misname a live campaign.
  The sweep asserted its occurrence count was unchanged.

### Verified 2026-10-21
`freeCallInstantCheck.js` **52/52** (its payout boundaries re-pointed at the 420s ceiling:
4:00 → ₹5, 6:59 → ₹5, 7:00 → ₹5; 3:59 → ₹0. The above-ceiling cases are PROPERTY checks —
`freeCallPayout` is pure and must not accrue with length on a clock skew — not scenarios, as
the screens end at 7:00 and `endOverdueFreeCalls` caps at `start + durationMinutes`).
`freeCallSlotCheck.js` **23/23**. `node --check` clean on every changed backend file, admin
`npm run build` clean, customer app bundles for Android with no "11 minute" copy left in the
shipped JS. **`index.js` was never booted** — `loadOffer()` was called directly, with a local
`ws` shim for Node 20.

---

## Session 2026-10-27: the astrologer app reached TestFlight, and both listings were filled in (EL)

### EL. Two App Store Connect records, one build, and the access trap that hid a teammate

The astrologer app went from "no App ID" to a build installable on a phone in one
session. Both listings were filled in; **nothing was published and nothing was submitted
for review** — both still read `PREPARE_FOR_SUBMISSION`.

| | Customer | Astrologer |
|---|---|---|
| Apple ID | `6826113999` | **`6827442905`** (new) |
| Bundle | `com.astrowanicustomer` | `com.astrowaniVendor` |
| ASC version | 1.0 → **24.1** | **6.6** |
| TestFlight | 24.1 (3) installed | **6.6 (1), VALID** |

> **THE CUSTOMER LISTING WAS COMPLETELY BLANK, and CLAUDE.md implied otherwise.** EK
> records the record being created and build 24.1(2) accepted — both true — so it read as
> "the customer app is ready and waiting on screenshots". It was not: `versionString` was
> still `1.0`, and description, keywords, promotional text, support URL, copyright and
> **every App Review field** were empty. TestFlight does not read any of that, which is
> exactly why it went unnoticed for four days. **A build in TestFlight says nothing about
> whether the App Store listing exists.** Both were filled in today.

**The App ID trap from EK bit again, in its other form.** The New App dialog offered only
`com.astrowanicustomer.U49M3S8V97` and `com.astrowaniVendor.U49M3S8V97` — both decoys with
the Team ID pasted into the identifier. The real `com.astrowaniVendor` was **absent because
it did not exist yet**, and picking the decoy would have bound the record permanently (the
bundle ID cannot be changed after Create). It was registered by hand at
developer.apple.com → Identifiers, Explicit, **Push Notifications only**; everything else
left off, because the app's `.entitlements` contains exactly one key (`aps-environment`)
and a provisioning profile must match the entitlements in the binary.
`AutoFill Credential Provider` is NOT how OTP autofill works — `react-native-otp-entry`
already sets `textContentType: "oneTimeCode"` and `autoComplete: "sms-otp"/"one-time-code"`
on its hidden input, so it needs no capability at all.

**The build compiled first time.** All five EK failures were pre-empted: the EAS image is
pinned to `macos-sequoia-15.6-xcode-26.0`, the Podfile carries the fmt
`FMT_USE_CONSTEVAL` patch and the pod deployment-target bump, and this app has no
`react-native-iap`. Certificate `KVP59Z2S2T` was **reused** from the customer app (a
distribution certificate is per TEAM, and an Individual account's slots are scarce); the
provisioning profile was newly generated, because a profile is per APP ID.

**Verified in the `.ipa` before submitting** (`DTSDKName` `iphoneos26.0`, `CFBundleVersion`
1, `UIDeviceFamily` `[1]`, `aps-environment` **production**, `get-task-allow` false, no
`ProvisionedDevices`). `eas submit` then resolved the destination from
`eas.json`'s new `submit.production.ios.ascAppId`, with no interactive lookup.

> **THE ACCESS TRAP — why a teammate can be invisible.** Om Naphade did not appear in the
> astrologer app's internal-tester picker, which read as "he is not on the team". He is:
> Users and Access, role **DEVELOPER**, and he already had the customer app **INSTALLED**
> (24.1 build 3, iPhone15_2). The cause is `allAppsVisible: false` — his account was scoped
> to `com.astrowanicustomer` alone, so for any other app he does not exist. **An internal
> tester is a team user filtered by VISIBLE APPS, not by team membership.** The fix is
> Users and Access → the user → Manage apps, not a new invitation. Granting it is a
> permission change and needs the owner.

**TestFlight:** internal group **Astrowani Team**
(`3ddc452f-66c0-4993-a9bb-d34e698a4911`), **automatic distribution ON** (it cannot be
changed later), 2 testers — `anshmanu2006@gmail.com` and `omnaphade199@gmail.com`, both
INVITED — with 6.6 (1) attached.

**Other facts worth keeping:**
- **Free Apps Agreement is Active** (22 Oct 2026 - 22 Oct 2027). The Paid Apps agreement is
  still not needed; the first builds sell nothing through Apple.
- `APNS_PRODUCTION` was flipped to **`true`** earlier the same day (`set-backend-env.yml`
  run `40460591096`). That is correct for TestFlight and **kills VoIP on sideloaded builds**.
- **China mainland was removed from BOTH apps.** CO only required it for the astrologer app
  (CallKit), but mainland China needs an ICP filing nobody has. Reversible before release.
- The reviewer astrologer `9999999999` currently has **`hidden_from_customers = false`**, so
  the customer-app review note's sentence about the demo account being kept out of public
  listings was **deliberately left out** — it would have been untrue.

**Still open:** screenshots (6.9" iPhone, both apps), publishing App Privacy on both, a
customer rebuild at 24.1, and the **EU Digital Services Act trader status**, which App Store
Connect is warning about and which blocks EU distribution for both apps.

**The test that still matters, and that nothing has ever proven:** kill the astrologer app
completely and have a customer call. `astrologers.voip_token` is **empty for every
astrologer in the database** — no device has ever registered one, because free-provisioned
sideloads strip the entitlement. If it does not ring, read that column first: empty means
the token never registered, populated means the push failed. Different bugs.

### EL (later the same day): build 4, the EU removed, and the screenshot size that is NOT 6.9"

**Customer build 24.1 (4) is uploaded and VALID** (`5715444c` bumped
`CURRENT_PROJECT_VERSION` 3 -> 4; `MARKETING_VERSION` stays **24.1**, because the iOS OTA
bundles target that exact string). App Store Connect now holds builds 2, 3 and 4.

> **Why a new build rather than submitting build 3: so the BINARY carries what the OTA
> carries.** Build 3 predates the second TestFlight round. Checked before bumping —
> `git diff --name-only 43563587..main -- astrowani_customer-main/` returns **zero files**,
> where `43563587` is the commit behind the newest enabled iOS bundle for 24.1
> (`01a179a7`). So build 4 and that bundle are the same JS, and a reviewer sees the real app
> on first launch instead of whatever the binary shipped with plus an OTA patch.

`.ipa` verified before upload: `iphoneos26.0`, `CFBundleVersion` 4, `UIDeviceFamily [1]`,
`aps-environment` **production**, `get-task-allow` false, no `ProvisionedDevices`,
`UIBackgroundModes` `audio, remote-notification` — **no `voip`, which is correct**: the
customer app places calls, the astrologer app receives them.

> **`eas submit` does NOT submit for review.** It uploads the binary to App Store Connect
> and makes it selectable in TestFlight and on the version page. Review is the separate
> "Add for Review" button. The name causes real alarm; it is worth saying out loud. Expect
> EAS's own queue ("waiting for an available submitter") to sit for 10-20 minutes on the
> free tier — the job is already scheduled server-side, so Ctrl+C stops the watching, not
> the upload. Do not re-run it; that queues a duplicate.

**THE SCREENSHOT SIZE IN THE CO CHECKLIST WAS WRONG, and it cost a render cycle.** The
checklist said 6.9" / 1320x2868. App Store Connect rejected all four with **"File dimensions
are invalid"** and states the real requirement itself:

> for iPhone 6.1" or 6.3" displays ... supported sizes include 2556 x 1179px, 1179 x 2556px,
> 2622 x 1206px and 1206 x 2622px

The set registers as `APP_IPHONE_61`. The aspect ratios are near-identical (2.1727 vs
2.1741) so it was a resize, not a redo — but **read the slot's own hint before rendering
anything**. Om's iPhone 14 Pro is 1179x2556, i.e. natively acceptable: no simulator, no Mac,
no resizing.

**Four customer screenshots uploaded**, built from the live Play Store artwork (1024x1536,
2:3) scaled to width and extended upward by stretching the top pixel row. The top third is
empty cream, because Play's canvas is far squarer than Apple's; it is valid but a designer
re-lay would be better.

> **TWO of the six Play screenshots MUST NOT be reused, and one of them is a live problem.**
> (1) A chat screenshot shows a customer asking *"Sir Will I have a boy or a girl"* and the
> astrologer answering that a boy is likelier. **Predicting the sex of an unborn child is
> prohibited in India under the PCPNDT Act, and advertising it is a separate offence.** It is
> public on the Play listing right now and should come down there too, not merely be left out
> of the App Store set. (2) The astrologer-profile screenshot shows a **Gift** button, and
> gifts are hidden on iOS (`DIGITAL_PURCHASES_ENABLED = false`) — a screenshot showing a
> feature the build does not have is a Guideline 2.3.3 rejection.

**Both apps dropped from 174 to 147 countries: the 27 EU states removed**, so the **EU
Digital Services Act trader declaration no longer applies**. The alternative was declaring as
a trader, which publishes name, address, phone and email on the EU product page — and on an
INDIVIDUAL account those are the owner's personal details, not ASTROWANIINDIA's (DW again).
Reversible in minutes: re-tick the countries and declare, once the Organization conversion is
done. UK, Norway and Switzerland are NOT in the EU and stayed ticked.

> **Apple lists Czechia as "Czech Republic".** An exact-name match on the modern name
> silently misses it and leaves 148 countries instead of 147. Apple's own confirmation
> dialog states the number being removed — read it, it is the check.

**One thing deliberately left ON**, owner's call: the customer app is still offered on Apple
Silicon Macs ("Make this app available", Automatic macOS 11.0). The app is WebRTC calls,
camera, mic and payments, none of it tested on macOS.

**Still open:** astrologer screenshots (none), attaching a build on both versions, publishing
App Privacy on both. Those last two are the final push and were deliberately not done.

### EL (2026-10-28): the customer app is in review, the astrologer app is staged, and the privacy labels were WRONG on both

**`Astrowani - Ask an Astrologer` 24.1 is `WAITING_FOR_REVIEW`** with `releaseType: MANUAL`,
so approval does NOT publish it — it waits in Pending Developer Release. **`Astrowani for
Astrologers` 6.6 is fully staged at `PREPARE_FOR_SUBMISSION`**: 7 screenshots, build 6.6 (1)
attached and VALID, Content Rights answered, App Privacy published with 17 data types.
Deliberately not submitted.

> **THE PRIVACY LABELS WERE UNDER-DECLARED ON BOTH APPS, and the fix is a check, not a
> judgement.** Every SDK ships a `PrivacyInfo.xcprivacy` manifest declaring what IT collects,
> and they are all inside the `.ipa` (16 in the customer build, 18 in the astrologer one).
> Unzip the build, read every manifest's `NSPrivacyCollectedDataTypes`, and diff that against
> the App Store Connect declaration. Doing that found:
>
> | App | Missing | Declared by |
> |---|---|---|
> | customer | **Payment Info** | `RazorpayStandard.framework` |
> | customer | **Device ID** | Firebase Messaging, Razorpay |
> | customer | **Other Diagnostic Data** | Firebase Installations, Messaging, GoogleDataTransport |
> | customer | **Other Data Types** | Firebase Messaging |
> | astrologer | **Other Diagnostic Data**, **Other Data Types** | the same Firebase trio |
> | astrologer | **Other Financial Info** | the app's OWN manifest — earnings and wallet balances |
>
> **Payment Info was reasoned away and that reasoning was wrong.** "Razorpay handles cards, we
> never store them" is irrelevant: Apple's own wording in that dialog is *"you're responsible
> for any third-party code that is added to your app, so if your third-party partners collect
> data from your app, you must represent that."* It is about what is IN THE BINARY.
> **Other Financial Info** is the same lesson from the other direction — a prediction of
> "two missing" was wrong because the repo's own manifest declares a third. **Read the
> manifests; do not reason about it.**

**App Privacy is editable and republishable after publishing**, including once the app is
live, so discovering this after pressing Publish costs nothing. Nothing is public until the
app is released.

**`Content Rights` blocks submission and is easy to miss.** `Add for Review` refused with
*"You must set up Content Rights Information in App Information."* It is per-app, so both
apps need it. The answer is **Yes, and I have the necessary rights** — the apps show
astrologer photos, live video, user chat and photos, blog articles and stock imagery. "No"
would be disprovable in thirty seconds. It needs a **Save on the App Information page**
afterwards; the dialog alone does not persist it.

**Screenshots: the customer app uses the owner's own Canva set (5, 1206x2622), the astrologer
app reuses the Play captures (7).** The Play ones are raw 1080x2400 Android screenshots, so
the **status bar and gesture bar were cropped** (TOP 118 / BOTTOM 52 px) before fitting —
the punch-hole dot and Android signal/battery icons are the only platform tells, and the
app's own header then starts at the top edge. Owner was told that customer screenshot #1 is a
stock portrait with **no app UI** (Guideline 2.3.3, and it sits in the search-results slot)
and chose to keep it; if Apple rejects, that is the first thing to swap, and swapping a
screenshot needs no new build.

> **Scripted clicks do NOT register with App Store Connect's React radios.** Setting
> `.checked` or calling `.click()` from JavaScript leaves the DOM looking right, the control
> looking selected, and the Next/Publish button **permanently disabled**, because React never
> sees a change event. Checkboxes and ordinary buttons are fine; radios are not. Use real
> mouse clicks for them, and click the LABEL rather than the radio circle — the circle is a
> small target and a near miss silently does nothing. The same class of failure left
> `releaseType` as `AFTER_APPROVAL` on the astrologer app for a day after a batch "Save" that
> looked successful. **Verify every setting by reading it back from `/iris/v1/...`, never
> from the page.**

**Also fixed today:** the reviewer astrologer `9999999999` had `hidden_from_customers = false`
— publicly listed, online, with charges set, able to take real customer calls during review.
Set back to `true`; verified by `GET /api/astrologers` returning 57 astrologers without it.
Login still works (`approved`, not suspended).

**Still open:** the astrologer app's `Add for Review`; the demo login proven on a device for
both apps; the "Exprienced" typo in the WordPress site title (it is in every browser tab,
including on the privacy policy a reviewer opens); the boy/girl prediction screenshot still
live on the Play listing; and the 7-minute screenshot copy against a database that still says
11.

---

## Session 2026-10-28/29: the chat that would not ring, and both apps submitted (EM)

### EM. Three wrong theories about a notification sound, and the fix that sidestepped it

The astrologer's phone did not make a sound for an incoming CHAT request, while CALLS rang
perfectly throughout. Three causes were proposed and shipped, and **all three were wrong**:
an unentitled `timeSensitive` interruption level, a missing foreground presentation option,
and `content-available` on the alert push silencing it. Each was plausible, each was deployed,
and the chat stayed silent.

> **THE LESSON, and it is the one worth keeping from this whole session: calls rang the entire
> time because CallKit DOES NOT USE THE NOTIFICATION SYSTEM AT ALL.** Three rounds were spent
> theorising about notification delivery while a working counter-example sat in the same app.
> When one path works and a neighbouring one does not, compare the two MECHANISMS before
> theorising about the broken one — and if two fixes in a row do not land, stop fixing and
> start measuring.

**So the chat now takes the call's road.** `POST /api/push/notify-chat-request` sends a VoIP
push alongside the ordinary one, and the astrologer gets the native full-screen incoming UI.
**Almost nothing new was needed** — `screenFor('chat')` already mapped to `VendorChatSession`,
`reqFromPayload` already set `table: 'chat_requests'`, `AppDelegate.mm` reports whatever
`callType` it is handed, and `pushTargetFor` already returned `voip_token`. The push was the
only missing piece.

- **KILL SWITCH: `app_settings.chat_callkit_enabled` set to `{"enabled": false}`.** One row, no
  deploy, no app update, no review. Apple intends VoIP pushes for calls and a chat arriving
  this way appears in the iPhone's call history, so this must stay one statement away.
  Cached 60s and **fails OPEN** — the whole reason it exists is that an ordinary notification
  could not be made to ring, so a transient blip must not silently drop the astrologer back
  to a notification they will not hear.

### EM1. The CallKit screen's text is ONE field, and it is native

iOS writes its own "app name + Audio" line from the provider configuration and **it cannot be
varied per call**. The caller name below it is the only text we control, and `AppDelegate.mm`
reads **`callerName` and nothing else** for both the handle and the localized caller name.
That is native, so the label has to be decorated SERVER-SIDE — which also means it ships
without a new build. Now "Chat from Ansh" / "Audio call from Ansh" / "Video call from Ansh",
set in `notify-chat-request`, `src/ringAstrologer.js` and the `/api/call/initiate` path.

> **`callerName` CANNOT SIMPLY BE RENAMED.** `/api/session/accept` echoes `reqBody.callerName`
> straight back in `navigationParams`, which becomes the chat/call screen's own header — so the
> astrologer would have landed in a consultation captioned "Chat from Ansh". The undecorated
> name travels alongside as **`callerRealName`**, and `reqFromPayload` prefers it, falling back
> to `callerName` so a call payload and any older bundle behave exactly as before.

### EM2. One bug behind "the popup goes invisible" AND "it keeps vibrating after I accept"

**Nothing ever removed a request from HomeScreen's `popupQueue` when it was handled OUTSIDE
HomeScreen.** That queue is emptied only by its own Accept button or by a socket cancellation,
and answering on the CallKit screen goes through neither. Since the ringtone is driven by
`popupQueue.length > 0`, the leftover entry meant the phone kept ringing after the chat had
opened, **and** the card went on rendering underneath whatever screen was on top — which is
what "the accept/reject popup gets invisible" actually was. One defect, two long-standing
symptoms that looked unrelated.

`callKeep` now emits `REQUEST_RESOLVED_EVENT` on answer and on decline and HomeScreen dismisses
the matching entry. **`stopRinging()` alone is not enough**: the queue effect re-arms on the
next state change, so the entry itself has to go.

### EM3. A cancelled request needs a poller, because the socket cannot be there yet

The socket path (`cancel_call` to `call_cancelled` to `dismissPopupIfMatches`) needs HomeScreen
mounted AND its socket already joined to the astrologer's room. **Neither holds in the case
CallKit exists for** — a VoIP push into a KILLED app, where the socket is still connecting and
Socket.io never replays what it missed. A customer cancelling within a second or two was simply
never heard, and the phone rang on for somebody who had already gone.

The ringing call now polls `/api/vendor/pending-requests` (the same endpoint HomeScreen's
catch-up uses) every 2.5s and ends itself once the request is no longer listed.
**Deliberately conservative:** a failed fetch returns nulls, which is indistinguishable from
"cancelled", so a disappearance only counts once the request has been seen at least once.
Otherwise one flaky poll would hang up on a real customer.

### EM4. iOS WILL NOT LET AN APP FOREGROUND ITSELF — and the function that pretends otherwise

Answering on the CallKit screen left the astrologer on the lock screen having to hunt for the
app; the consultation connected server-side, and while the app sat suspended a "network
problem" banner appeared about 30 seconds later for a connection that was fine.

**`RNCallKeep.backToForeground()` is literally an `isIOS` early return with no native
implementation.** The line meant to open the app has never done anything on iOS, and the
comment above it claiming otherwise was wrong. This is a platform rule, not a library gap —
which is also why VIDEO behaved identically; video gets no special privilege here.

What IS available is CallKit's own in-call banner, so the answered call is now **kept alive**
for every type, and tapping that banner opens the app. Chat was ending the call immediately,
which removed even that. **Chat has no `doEndCall`**, so `VendorChatSession.endSessionLocal`
closes it instead, or the call would outlive the conversation.

> **A test result is only valid once you know which bundle was running.** The owner reported
> "audio opens the app, chat and video do not", then later "none of them open", then finally
> "all three were working fine" — three different answers to the same question across three
> OTA bundles, because an iOS OTA needs TWO force-quit relaunches to take effect. Before
> theorising about a behaviour difference between screens, establish that both tests ran the
> same JS. Lock state matters too: iOS can foreground an app on answer from an UNLOCKED phone
> and cannot from a locked one.

### EM5. The brown band was a BLEND, which is why grepping for a colour never found it

A muted taupe band sat below the white card on Login and the OTP screen. Grepping for
`AstroMaroon` and for greys found nothing, through several rounds of guessing.

**Measured off the owner's screenshot by decoding the PNG: `#b29b93`, which is AstroMaroon
(`#592a19`) at about 45% over white.** Not either colour on its own — the screen ROOT showing
through a translucent layer in the gap below the card. The card carries `flex: 1` inside a
`flexGrow: 1` container and usually does reach the bottom; something intermittently shrinks
it (the `KeyboardAvoidingView`'s own padding is the likeliest).

Rather than win that argument, **the root is now white and the maroon belongs to the header
block that wants it**, so a gap is white on white and invisible whatever opens it.

> **Sample the pixels before theorising about a colour.** Two rounds were spent grepping for a
> colour that was never in the source.

### EM6. Both apps are WAITING_FOR_REVIEW (2026-10-29)

| | Apple ID | Version | Build | Release |
|---|---|---|---|---|
| Astrowani - Ask an Astrologer | 6826113999 | 24.1 | — | MANUAL |
| **Astrowani for Astrologers** | 6827442905 | **6.6** | **3** | MANUAL |

Astrologer build 3 (`CURRENT_PROJECT_VERSION` 2 to 3, `MARKETING_VERSION` still **6.6**) was
built from commit `90b01787`, the same commit the newest enabled 6.6 OTA bundle was built
from, so a reviewer sees the real app on first launch rather than the binary plus a patch.
Verified in the `.ipa` before upload: `iphoneos26.0`, `CFBundleVersion` 3, `UIDeviceFamily [1]`,
`aps-environment` production, `get-task-allow` false, no `ProvisionedDevices`,
`UIBackgroundModes` includes **voip**. Its `main.jsbundle` was also opened and confirmed to
carry the session's fixes — source being right does not prove the binary is.

App Review notes are **3,626 characters** (4,000 cap) and carry the demonstration video,
confirmed readable to an anonymous fetch. The reviewer astrologer was re-hidden before
submitting (`hidden_from_customers = true`; `/api/astrologers` went 58 to 57), because the
notes state it is kept out of public listings and that sentence had to be true.

> **"Add for Review" IS NOT THE SUBMIT.** It moves the version to `READY_FOR_REVIEW` and opens
> a **Draft Submission** panel; a second **"Submit for Review"** button inside that panel is
> what reaches `WAITING_FOR_REVIEW`. Stopping at the first button leaves a version that looks
> submitted and is not. Every step here was verified by reading `/iris/v1/...` back from the
> server rather than from the page, per EL.
>
> **The built-in browser pane has its own cookie jar and is NOT signed in to App Store
> Connect.** Use Claude in Chrome for ASC work; its Apple session restores itself. Do not try
> to sign in to Apple from the pane — that needs the owner's password and a 2FA code.

**Still open:** the demo login proven on a device for both apps; the "Exprienced" typo in the
WordPress site title; the boy/girl prediction screenshot still live on the Play listing; the
7-minute free-call copy against a database that still says 11; and
`MD files/astrologer-app-review-notes.txt` is deliberately **untracked** (it holds the video
link and this repo is public).
