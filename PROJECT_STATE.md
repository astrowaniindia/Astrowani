# Project State

**Last updated:** 2026-06-22
**Authoritative deep docs:** `CLAUDE.md` (living architecture) + `memory/MEMORY.md` (per-feature notes).

## Monorepo (4 sub-projects)
- `astrowani-backend/` — Node/Express + Socket.io (:4500), Supabase, billing RPC.
- `astrowani_customer-main/` — React Native customer app.
- `astrowani_vendors-main/` — React Native vendor/astrologer app.
- `astrowani-admin/` — React + Vite **admin dashboard** (web only, :5173).

## Current focus
Feature build-out complete across all four projects. Remaining work is verification on real
devices + a few explicitly-deferred items (wallet recharge gateway, push notifications, SFU for
large live audiences).

## Shipped subsystems
- **Calls (audio/video)** — WebRTC P2P over Socket.io signalling (NOT EnableX, despite docs).
  Wallet billing via `process_session_billing` RPC, 30s `sessionManager` poll. Cancellation sync.
- **Chat** — `useChatRequest` hook → `chat_requests` → `ChatSessionScreen`.
- **Service-toggle sync** — vendor toggles drive per-card Chat/Call/Video button states (never hides
  astrologers). Live via Realtime + focus refresh.
- **Admin dashboard** — `admins`/bcrypt login, `/api/admin/*` CRUD; manages blogs, banners, thought,
  categories, remedies, orders, gifts, live, missed, astrologers, customers, sessions. The old mock
  content endpoints now read real DB tables.
- **Profile sync + unified cards + category screens** — `formatAstrologer` reconciles the columns the
  vendor writes; `ExpertsList`/`ReusableList` cards; `CategoryAstrologers` filtered by category.
- **Live streaming + gifts** — WebRTC mesh (`GoLiveScreen`/`LiveViewerScreen`), comments + paid gifts
  (50% astrologer / 50% platform), admin Gifts + Live (force-stop) pages.
- **Missed sessions** — 60s request timeout → `status='missed'`; vendor MissedSessions screen + red
  drawer badge; admin Missed page; backend stale-request sweep.
- **My Sessions (customer)** — real `chat_sessions` history, 4 tabs, View Profile.
- **UI** — themed `StatusPopup` (missed/busy), brown `RequestingPopup`, animated vendor toggle,
  banner local-image fallback.

## SQL to run (Supabase SQL editor)
1. `astrowani-backend/sql/admin_schema.sql` + `sql/enable_realtime_content.sql`
2. Remedies tables (see `memory/remedies_shop.md`)
3. `astrowani-backend/sql/live_schema.sql`
4. Missed sessions — no migration (`status` is free-text).
Then: `node astrowani-backend/scripts/seedAdmin.js <email> <pass>`.

## Not yet verified / deferred
- Full device-to-device verification of each flow under one logged-in pair.
- Wallet **recharge** (Razorpay/PhonePe) — gifting/calls need pre-existing balance.
- Push notifications (FCM tokens stored; not yet sent) for incoming/missed.
- Live scaling beyond ~5 concurrent viewers (WebRTC mesh → SFU/Agora).
- Chat sessions recorded in `chat_sessions` with `call_type='chat'` (My Sessions Chat tab depends on it).
- RLS: new tables created via raw SQL have RLS off (anon reads work); if enabled, add public-read policies.

## Key conventions
- Supabase Realtime channel names MUST be unique per mount (`name_${Date.now()}_${rand}`).
- `userData.id` / JWT carry the real Supabase customer UUID (re-login required after JWT fixes).
- Gift split constant: `GIFT_VENDOR_SHARE = 0.5` in `index.js`.
- Run apps with `adb reverse` + `localhost:4500` (or set `SOCKET_URL`/`VITE_API_URL` to LAN IP).

---
**CLAUDE.md is the living architecture doc; this file is the high-level snapshot.**
