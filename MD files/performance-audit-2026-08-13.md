# Performance Audit & Fix Pass — 2026-08-13/14

Read-only audit of `astrowani-backend` + `astrowani_customer-main`, followed by implementation
of the resulting roadmap, followed by a read-only validation pass over the implementation, followed
by fixes for what that validation surfaced. Full findings report (all severities, file:line detail):
[claude.ai/code/artifact/b1661799-efb3-4e1e-b27e-5803e2e23db7](https://claude.ai/code/artifact/b1661799-efb3-4e1e-b27e-5803e2e23db7).

## Corrections to prior documented state (found while auditing)

Three things CLAUDE.md/memory described as open issues turned out to already be fixed:
- The unfiltered `astrologers` Realtime subscription in Home/Chat/Video/Call — already replaced
  by `useAstrologerListSync` + `src/astrologerFanout.js` before this audit started.
- `process_session_billing` — version-controlled at `sql/process_session_billing.sql`, not
  vendor-locked in the Supabase dashboard as previously noted.
- Wallet mutations — already atomic via Postgres RPCs (`sql/hardening_03_atomic_wallet.sql`),
  not a bare read-modify-write.

## What was implemented (17 items)

**Backend** (`astrowani-backend`):
- `GET /api/astrologers/liveAstrologers` — added the same 10s cache + column projection
  (`ASTROLOGER_LIST_COLUMNS`) the sibling `/api/astrologers` endpoint already had.
- New `src/contentCache.js` (shared `TtlCache`, 60s) — wraps `/api/categories`, `/api/gifts`,
  `/api/astro-services`, `/api/remedies`, `/api/banners/all`, `/api/thoughts/latest`.
  Invalidated from `adminRoutes.js`'s `crud()` factory on every admin write.
- New `src/tableFanout.js` (generic version of `astrologerFanout.js`'s pattern) — one backend-side
  Realtime subscription each for `blogs`, `live_sessions`, `remedy_items`, rebroadcast over the
  existing Socket.io connection as `blogs_changed`/`live_sessions_changed`/`remedy_items_changed`.
  Replaces 4 separate unfiltered per-screen Supabase Realtime subscriptions (BlogList.js had one,
  Home.js had an independent second one for the same table; Live.js; RemedyShop.js — opened once
  per remedy type, so up to 3 identical subscriptions at once).
- `recomputeAstrologerRating` — SQL-side aggregate via new RPC `astrologer_review_stats`
  (falls back to the old full-row-fetch if the RPC isn't installed).
- `sessionManager.js` — parallelized the sequential `checkAstrologerBusy` loop in the stale-request
  sweep (`Promise.all`); narrowed the 30s billing poll's `SELECT *` to the 3 columns it actually uses.
- Two `count:'exact'` boolean-existence checks (free-session detection, referral reward) switched
  to `.limit(1)`/`.limit(2)` + length check.
- `postHogRoutes.js`'s hand-rolled cache Map swapped for the shared `TtlCache` (adds single-flight
  de-dup for concurrent identical admin-dashboard queries).

**Customer app** (`astrowani_customer-main`):
- Home.js marquee — `Array(1000).fill(...).flat()` (a 30,000+ element array) cut to
  `Array(6).fill(...).flat()`, with a wraparound rewind (`onContentSizeChange` + modulo-based
  offset correction) so the smaller buffer still loops indefinitely. `removeClippedSubviews`
  re-enabled.
- New `hooks/useWalletBalance.js` — one shared, ref-counted 20s poll of `GET /api/wallet`,
  replacing three independent pollers (`Navigation.js`'s tab bar, `Navigation.js`'s Wallet-screen
  header, `CustomHeader.js` on 6 screens).
- New `hooks/useBlogListSync.js`, `useLiveListSync.js`, `useRemedyListSync.js` — frontend side of
  the backend fanout above, mirroring the existing `useAstrologerListSync.js` pattern.
- `ChatSessionScreen.js` — the 5s "did the astrologer end the chat" poll (redundant with the
  `session_ended` socket listener that already handles this) backed off to 45s, kept only as a
  backstop.
- `ReusableList.js`, `MySessionScreen.js` — FlatList virtualization tuning (`windowSize`,
  `maxToRenderPerBatch`, `initialNumToRender`).
- `ReusableList.js`, `PlacementBanner.js`, `ChatSessionScreen.js`, `Live.js`, `AstrologerInfo.js` —
  6 `<Image>` usages swapped to the already-installed `react-native-fast-image` (no new native
  config needed — it was already linked, already used in Home.js/Call.js before this session).
- `Home.js` — `AstrologerItem`/`BlogItem` hoisted out of the component's render body to module
  scope (were being recreated every render, restarting the live-badge pulse animation on
  unrelated state changes).
- `Navigation.js` — the 18 astro-service report screens (9 input/result pairs + Tarot) switched
  from static imports to `getComponent={() => require('...').default}`, deferring module
  evaluation to first navigation instead of app cold-start.
- Deleted ~10.7MB of confirmed-unused fonts: 4 linked-but-unreferenced OpenSans/Montserrat
  variable-font files (`src/assets/Fonts/`), plus an entirely separate 8.2MB/54-file `static/`
  folder that was git-tracked but never part of the asset-linking pipeline
  (`react-native.config.js` only ever pointed at `src/assets/Fonts`).
- `sql/hardening_05_identity_and_review_indexes.sql` — see below, since revised.

## Validation pass — what it found and what got fixed

A second, read-only pass re-verified the implementation against the actual current code (not
memory). Found and fixed 5 issues:

1. **Wallet stale-balance-on-logout (real bug).** `useWalletBalance.js`'s `cachedBalance` is a
   module-level variable — correct for sharing one poll across consumers, but it survived
   `AsyncStorage.clear()` on logout. A new account logging in on the same app process (no JS
   reload) would briefly see the *previous* account's balance for one network round-trip before
   the first fresh poll resolved. **Fixed**: added `resetWalletBalance()`, wired into both
   logout implementations (`CustomDrawerContent.js` and a second, independent one in
   `Settings.js` that had the same exposure).
2. **Dead cache-invalidation call.** The `blogs` Realtime fanout's `onChange` called
   `contentCache.invalidate('blogs:')`, but `GET /api/blogs` was never wrapped in `contentCache`
   to begin with (it's a direct paginated query) — a harmless no-op. **Fixed**: removed, with a
   comment explaining why blogs doesn't need one.
3. **iOS project still referenced the 4 deleted fonts** by filename in `Info.plist`'s
   `UIAppFonts` array and in `project.pbxproj` (`PBXBuildFile`, `PBXFileReference`, group listing,
   `Resources` build phase — 4 locations each). **Fixed**: removed all 4 files' entries from both;
   verified brace/paren counts stayed balanced and no references remain anywhere in the repo.
4. **Home marquee `windowSize={5}` blank-gap risk.** Tighter than FlatList's default (21); the
   wraparound rewind jumps back exactly one buffer-copy's width, which risked landing in a region
   virtualization had already unmounted. **Fixed**: reverted to FlatList's default `windowSize`
   — cheap now that the buffer is 6 copies instead of 1000.
5. **Marquee edge case**: if the astrologer list shrinks mid-scroll while `scrollOffset` was sized
   for the old, larger content, the rewind only self-corrects one buffer-width per tick. **Fixed**:
   added a direct modulo clamp for a one-tick correction instead.

## SQL migration — corrected after running against production

`sql/hardening_05_identity_and_review_indexes.sql` originally added 3 indexes on the theory that
`customers.mobile` and `astrologers.phone_number` were unindexed gaps hit by the
"resolve real UUID from JWT phone" query on nearly every authenticated request. Running
`SELECT tablename, indexname FROM pg_indexes ...` after applying it showed **that theory was
wrong for 2 of the 3**:

- `customers.mobile` already had `uq_customers_mobile` — a UNIQUE constraint (added in the
  2026-08-07/08 hardening pass, per `database-hardening-deferred-decisions.md`), which Postgres
  backs with a full B-tree index.
- `astrologers.phone_number` already had `astrologers_phone_number_key`, same story.

Both new indexes (`idx_customers_mobile`, `idx_astrologers_phone_number`) were pure duplicates —
no read benefit, only marginal write overhead. **Dropped** via
`DROP INDEX CONCURRENTLY IF EXISTS ...` after confirming via `pg_indexes`.

`idx_reviews_astrologer_visible` (partial index, `WHERE is_hidden=false`) was kept — real if
narrower-benefit than first claimed, since `idx_reviews_astrologer` (full index, from
`hardening_01`) already existed and covers the same lookups less selectively.

**Resolved as a side effect**: whether `hardening_01_core_tables.sql`'s original index set had
ever actually been applied to production was the single biggest open question in the original
audit. Confirmed yes — `idx_chat_sessions_billing_due`, `idx_call_requests_pending`,
`idx_chat_requests_pending`, the one-active/pending-per-astrologer unique indexes, and the
wallet-transaction indexes are all present. The 30s billing poll, busy-status checks, and
stale-request sweep were never doing full table scans.

## What this means for the "did it get faster" question

Confirmed, mechanically (no profiling/measurement was done, this is code-level fact):
- Home marquee: 1000x array + disabled clipping → 6x array + clipping re-enabled.
- Wallet polling: 3 independent 20s pollers → 1 shared poll.
- 4 duplicate unfiltered Realtime subscriptions (blogs ×2, live_sessions, remedy_items ×≤3) → 1
  backend fanout each, shared over the existing socket.
- 6 endpoints gained a 10-60s cache where none existed.

Real but smaller than originally estimated: the SQL migration's contribution, per the correction
above — most of its claimed benefit turned out to already exist via pre-existing unique
constraints.

Not measured, needs a real device/build to confirm: the marquee's wraparound smoothness, the iOS
build succeeding cleanly after the `pbxproj` edit, and any actual before/after latency numbers.

## Addendum, 2026-08-14: perceived-load fix (stale-while-revalidate on Home)

Separate from the audit above but same theme — Home's sections (banners, astrologer carousel,
categories, blogs, top reviews) rendered blank/spinner until their own fetch resolved, so app
open showed items popping in one at a time. New `src/utils/cacheFetch.js` (`readCache`/
`writeCache`, `AsyncStorage`-backed, `cache_v1_` prefix, fails silently on any read/write error)
is now used by `Home.js`'s five fetchers and `PlacementBanner.js`: each hydrates instantly from
its last-fetched cache while a background refetch silently replaces it once the network call
resolves. No money-relevant state involved (astrologer prices/availability shown from cache are
always re-verified server-side the moment a call/chat is actually initiated — see
`money-billing-audit-2026-08-14.md`), so a stale cached price or busy-status flickering for a
moment on Home has no financial consequence, purely cosmetic.

**Reviewed, one minor un-fixed nit**: `PlacementBanner.js`'s interval-fallback line
(`const freshIntervalMs = secs > 0 ? secs * 1000 : intervalMs;`) reads `intervalMs` from the
closure captured when the effect was created, not the value just set by the cache-hydration
branch above it in the same effect run (that `setIntervalMs` call hasn't committed yet when the
network `.then` closure was created). If the API response ever omits `intervalSeconds`, this
falls back to the *default* 4000ms instead of whatever the cache actually had, and writes that
default back into the cache. Purely a banner-rotation-speed cosmetic issue, not user-visible in
any meaningful way and not money-relevant — left as-is, not worth the added complexity to fix.
