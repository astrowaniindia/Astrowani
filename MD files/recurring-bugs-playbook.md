# Recurring Bugs Playbook

This is a living reference of **bug patterns** in this codebase — not one-off incidents, but
shapes of bugs that have happened more than once, or are structurally likely to happen again
in new code. When you (or the bug-scan agent) fix something that fits this description, add
an entry here using the template at the bottom, so the next person doesn't have to
re-diagnose it from scratch.

See also: [bug-scan-agent.md](bug-scan-agent.md) (the automated agent that should be checked
against this file), [deployment-and-releases.md](deployment-and-releases.md).

---

## 1. Timer drift (accumulating `setInterval` instead of anchored elapsed-time)

**Symptom**: a call/chat duration display falls behind real time or looks "stuck," especially
after the app was backgrounded or the JS thread was busy.

**Root cause pattern**: `setInterval(() => setSeconds(s => s + 1), 1000)` adds exactly 1
regardless of how much real time actually passed since the last tick. A delayed tick still
only adds 1 — the display permanently falls behind and never self-corrects.

**Fix pattern**: never accumulate. Anchor to a real start timestamp and recompute
`Date.now() - startMs` on every tick. Both apps have a ready-made hook for this:
`useElapsedSeconds(startMs, active)` (customer: `src/hooks/useElapsedSeconds.js`, vendor:
`src/utils/useElapsedSeconds.js`). Use it for **any** future on-screen duration/countdown —
never write a raw accumulating interval again.

---

## 2. Supabase Realtime channel name collisions

**Symptom**: `cannot add postgres_changes callbacks ... after subscribe()` crash, usually on
a screen that re-mounts (navigation stack push/pop, Strict Mode, fast refresh).

**Root cause pattern**: `supabase.channel('fixed-name')` returns the *same* channel object if
one with that name is already subscribed. Calling `.on()` on an already-subscribed channel
throws.

**Fix pattern**: every Realtime channel name must be unique per mount:
`` `channel-base-name_${Date.now()}_${Math.floor(Math.random() * 1e6)}` ``. If the
subscription lives inside a focus listener that can re-run, call `supabase.removeChannel()`
on the old channel before creating a new one.

---

## 3. `session_ended` must always call `doEndCall()` — never navigate directly

**Symptom**: a call ends (remote hangup, insufficient balance) but billing never finalizes —
the session stays "active" on the backend even though both screens have left the call.

**Root cause pattern**: a `session_ended` socket handler calls `navigation.replace(...)`
directly instead of going through the screen's own end-call function.

**Fix pattern**: every call/chat screen's `session_ended` handler must call the same
`doEndCall()` (or equivalent) that a manual hangup uses — that function is what actually hits
`POST /api/call/end` and finalizes billing. Also filter by `sessionId` first (events for a
previous session can arrive on the personal room) and guard with an `isEndingRef` to avoid
double-firing.

---

## 4. ENX/native video PiP container must stay a plain `View`

**Symptom**: local camera preview never initializes on Android video calls — black or blank
PiP box.

**Root cause pattern**: putting `overflow: 'hidden'`, `borderRadius`, or `elevation` directly
on the `View` wrapping the native video component forces Android to create a hardware
rendering layer that blocks the native `SurfaceView` from initializing.

**Fix pattern**: the `View` that directly wraps the native video room/stream component must
stay style-free (no overflow/radius/elevation). Put any decorative border/rounding on a
**separate** `pointerEvents="none"` overlay view on top of it instead.

---

## 5. Backend "reshapes" a third-party API response and silently drops a field the frontend expects

**Symptom**: `TypeError: Cannot read property 'map' of undefined` (or similar) on a screen
that renders fine for some data but crashes on a specific sub-section — the crash is 100%
reproducible, not intermittent, because the field is *never* present, not just sometimes
missing.

**Root cause pattern**: the backend maps/reshapes a third-party API's response into a custom
shape for the app (see `astrowani-backend/src/freeServicesRoutes.js` for an example), but the
reshaping step doesn't include every field the frontend screen actually consumes.

**Fix pattern** (two layers, do both):
1. **Backend**: audit that every field the frontend destructures from the response is
   actually included in the reshaped payload.
2. **Frontend, always**: any `array.map(...)` on data that came from an API response should
   default to `[]` first (`data.someArray?.map(...)` or `(data.someArray || []).map(...)`) —
   don't assume a truthy parent object means every child field is populated.

*First caught*: Panchang screen, 2026-08-05 — see
[bug-scan-agent.md](bug-scan-agent.md#real-example-first-live-test---2026-08-05).

---

## 6. Stale/synthetic ID used instead of the real Supabase UUID

**Symptom**: billing silently fails (`invalid input syntax for type uuid`), or a socket event
never reaches the right device even though both sides are "connected."

**Root cause pattern**: a `user_<timestamp>` placeholder ID (from an older/stale JWT) gets
used as if it were the real Supabase UUID for a customer/astrologer — sockets join a room
under the fake ID, billing RPCs get called with the fake ID, and everything downstream fails.

**Fix pattern**: always resolve the real Supabase UUID server-side (by phone number, from the
JWT) before creating sessions, joining socket rooms, or calling billing RPCs. Never trust an
ID embedded in an old client-stored JWT without resolving it fresh.

---

## 7. Hardcoded default secret used as a fallback (`process.env.X || 'hardcoded-value'`)

**Symptom**: nothing crashes, nothing errors — the app just quietly works, which is exactly
what makes this dangerous. Only surfaces via a deliberate security check.

**Root cause pattern**: code like `` const JWT_SECRET = process.env.JWT_SECRET ||
'some-default-string' `` is convenient for local dev (no `.env` needed to get started) but
means production silently runs on that same publicly-visible default if the real env var was
never actually set on the server. Confirmed on 2026-08-05: `backend.astrowani.com` was
accepting JWTs forged with the hardcoded default `JWT_SECRET` fallback, meaning anyone
reading this repo could forge a login token for any customer or astrologer UUID.

**Fix pattern**:
1. Set the real value in the production environment (VPS env vars / PM2 ecosystem file).
2. Longer-term: `grep` the codebase for `process.env.X ||` patterns on anything
   security-sensitive (JWT secrets, signing keys, admin credentials) and consider throwing at
   startup instead of silently falling back when running with `NODE_ENV=production`.

**How to check it live** (read-only, safe): craft a JWT signed with the known default value
and send it to any authenticated `GET` endpoint. `200` = vulnerable, `401`/`500` = the real
secret is actually in use.

*First caught*: production JWT_SECRET, 2026-08-05.

---

## 8. Animated nodes created inside `renderItem` (native Animated node-graph teardown races)

**Symptom**: the app dies with one of a *family* of fatal Android exceptions, intermittently
(anywhere from 6 seconds to 4 minutes on the same screen), with **no JS error logged first**:

- `JSApplicationIllegalArgumentException: disconnectAnimatedNodeFromView: Animated node with tag [N] does not exist`
- `JSApplicationIllegalArgumentException: disconnectAnimatedNodes: Animated node with tag (parent) [N] does not exist`
- `IllegalViewOperationException: Trying to add unknown view tag: N` (at `UIImplementation.setChildren`)

They look like three separate bugs and were filed as three separate Sentry issues
(REACT-NATIVE-7/8/9, 2026-08-23). They are one root cause.

**Root cause pattern**: calling `someAnimatedValue.interpolate({...})` (or constructing any
other Animated node) **inside** a `renderItem` / render body. `interpolate()` is not a pure
getter — every call **mints a new native animated node**. In a virtualized list that means a
fresh pair of nodes per item on every re-render, attached to recycled views. The superseded
nodes get dropped natively while views still reference them, so the queued
`disconnectAnimatedNodes`/`disconnectAnimatedNodeFromView` batch executes against tags that
no longer exist, and the same churn desynchronizes the shadow tree into the `setChildren`
"unknown view tag" variant.

The amplifier is anything that changes the list's `data` identity often — a parent that
refetches on focus, or a socket/Realtime signal that triggers a refetch. That only changes
*how often* it crashes, not whether the code is wrong.

**Do not be misled by `ReanimatedUIManager` in the stack trace.** It appears in all three
traces because `react-native-reanimated` installs a global UIManager wrapper as soon as it is
a dependency. These crashes are RN's **own** `Animated` API. Grep for
`react-native-reanimated` importers before spending any time there — on Home, for instance,
there are none.

**Fix pattern**: never construct Animated nodes during render. Cache one node (or set of nodes)
per stable key and reuse it. In a list, `inputRange` is usually a pure function of `index`
and a constant item width, so a per-index cache is correct for the life of the list:

```js
const interpCacheRef = useRef(new Map());
const getInterpolations = (index) => {
  let entry = interpCacheRef.current.get(index);
  if (!entry) {
    const inputRange = [(index - 1) * ITEM_WIDTH, index * ITEM_WIDTH, (index + 1) * ITEM_WIDTH];
    entry = {
      cardScale: scrollX.interpolate({ inputRange, outputRange: [0.72, 1, 0.72], extrapolate: 'clamp' }),
      opacity:   scrollX.interpolate({ inputRange, outputRange: [0.4, 1, 0.4],  extrapolate: 'clamp' }),
    };
    interpCacheRef.current.set(index, entry);
  }
  return entry;
};
```

Also demote any `Animated.View` that animates nothing back to a plain `View` — each one is
another native node attached to every recycled row.

**How to confirm it is this and not something else**: the exceptions are thrown on the
`mqt_native_modules` thread with no preceding `ReactNativeJS` error, and they stop entirely
if you `return null` from the suspect component. Bisect that way — these crashes are too
intermittent to attribute by reading a single stack trace, and the three variants make it easy
to think you fixed one when you have only changed the timing.

*First caught*: `astrowani_customer-main/src/screens/Home/AnimatedAstrologerMarquee.js`,
2026-08-23 — `scrollX.interpolate()` ×2 inside `renderItem` on an `Animated.FlatList`.
Verified by bisect (disable → 90s clean; re-enable with the cache → 5m42s of scroll-stress
with zero crashes, where the old build died within 6–60s).

---

## Template for a new entry

```markdown
## N. <short name of the pattern>

**Symptom**: <what a user or developer would actually observe>

**Root cause pattern**: <the underlying mechanism — generic enough to recognize next time>

**Fix pattern**: <the actual fix, and where the reusable pattern/helper lives if there is one>

*First caught*: <where/when, link to PR/commit if useful>
```
