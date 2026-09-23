# Astrowani — every third-party service, and what it costs

One row per service actually wired into the code or the infrastructure — not
things merely considered. **Add a row here the same day a new service is
integrated**, before it ships. Costs and limits below are as last checked
(date in the "Checked" column) — a provider can change pricing at any time,
so re-verify before treating a number here as current if it's more than a
few months old.

**How to read "Free tier / limit":** what you get before paying anything.
**"If you exceed it":** what actually happens — billed automatically,
degraded, or hard-blocked. That distinction is the point of this document:
some of these will just start charging your card, some will silently stop
working, and a few need a manual step from you before they'll bill at all.

---

## Money — payments & purchases

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **Razorpay** | Wallet recharge, remedy shop checkout (India, UPI/cards) | Backend (`RAZORPAY_KEY_ID/SECRET`), customer app | No free tier as such — per-transaction fee (~2%, check your live dashboard for your actual negotiated rate) | Nothing "exceeds" — it's per-transaction. Payments simply stop if the account is suspended (KYC/compliance) | 2026-09 |
| **Apple In-App Purchase (coins)** | Digital purchases on iOS only (reports, gifts, free-services ₹1 charge) — required by Apple, NOT used on Android | Backend, customer app (StoreKit 2) | Apple takes ~15–30% commission on IAP revenue | N/A — commission is automatic per sale. Requires paid Apple Developer Program ($99/yr, below) before it can go live at all | 2026-09 |

## Infrastructure — always running, real recurring cost

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **Hostinger VPS** | The one server running the backend, nginx, the admin build, coturn (TURN relay), everything | All of it | N/A — this is a paid VPS plan already | Plan-dependent; weekly backups included, **daily backups cost extra** (~₹10,000+ for the remaining term when last quoted, see `CLAUDE.md` §CA) | 2026-09 |
| **Supabase** | THE database — every table, every row | Backend (service role), both apps (`anon` key, read-only), admin | **Currently on the Free plan.** 500 MB DB (measured ~25 MB used), 1 GB storage, 5 GB egress/month, **NO backups at all** | Free plan can be paused/restricted if usage limits are exceeded for a sustained period. **The real risk isn't the limit — it's that there are zero backups today.** Pro is **~$25/month**: daily backups (7-day retention), higher limits. This is the single highest-priority thing to buy — see `CLAUDE.md` §CA | 2026-09 |
| **Cloudflare** | DNS + CDN + WAF in front of the VPS, and free R2 storage for OTA app-update bundles | astrowani.com DNS, `sql/…`/OTA delivery | Free plan covers DNS/CDN/WAF fully. **R2**: 10 GB storage free, **free egress always** (the reason it was chosen over Supabase Storage for OTA bundles) | R2 storage past 10 GB is billed per GB (~$0.015/GB-month) — cheap even well past free tier. Requires pruning old OTA bundles periodically (see `CLAUDE.md` §CB/CC) | 2026-09 |
| **GitHub** | Source control, CI/CD (GitHub Actions deploys backend + admin, builds iOS IPAs) | Everywhere | Free for a public repo (this repo IS public — see `CLAUDE.md` §CS) with generous Actions minutes | N/A at current usage | 2026-09 |

## Communication — SMS, push, calling

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **EnableX** | Primary OTP SMS delivery | Backend | Prepaid credit — you top up a wallet | **Sends silently fail at zero balance** (this has happened before — see the `otp_dlt_template_literal_placeholder` memory). Check the EnableX job summary, not just the API response, to know if an OTP actually went out | 2026-09 |
| **MSG91** | Fallback OTP SMS, used only when EnableX demonstrably didn't send | Backend | Prepaid credit, separate wallet from EnableX | Same as EnableX — keep balance topped in **both** wallets | 2026-09 |
| **Firebase Cloud Messaging (FCM)** | Push notifications, both apps | Backend, both apps | **Free, unlimited**, no card, no cap that matters at any realistic scale | N/A | 2026-09 |
| **Apple Push Notification service (APNs)** | iOS push + VoIP push (incoming-call ring on the astrologer app) | Backend | Free — part of the Apple Developer Program you already need for other reasons | N/A | 2026-09 |
| **WhatsApp Cloud API (Meta)** | The Wani Shop chat assistant on WhatsApp | Backend | **Free** as long as every conversation is customer-initiated (a "service conversation") — this is architecturally enforced: the bot never sends an unsolicited template | Sending an unsolicited template message is what costs money on this API and risks rate-limiting the number. The code is written to never do this — don't add a broadcast/marketing message feature here without re-reading the cost model first | 2026-09 |

## Calling infrastructure (WebRTC)

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **Google STUN servers** | NAT traversal for audio/video calls | Both apps (hardcoded ICE list) | Free, no limit, Google's public infrastructure | N/A | 2026-09 |
| **Self-hosted coturn** | TURN relay (calls that STUN alone can't connect) | Runs on the same Hostinger VPS above — no separate bill | Bandwidth-limited by the VPS's own plan, not a separate paid service | Counts against the VPS's own bandwidth allowance | 2026-09 |
| **OpenRelay (metered.ca)** | Free public TURN, used only as a backup relay | Both apps (hardcoded ICE list) | Free, but **no SLA** — it can go down with no warning | Calls fall back to direct/STUN if it's unreachable; not a money risk, a reliability one. `CLAUDE.md` §CM flags replacing this with a paid TURN provider as a real to-do | 2026-09 |

## AI

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **Google Gemini** | The free 5-minute AI astrology chat (customer app, Android only for now) | Backend | **Free tier**, multiple models walked in order for capacity: ~500 requests/day per model, ~15K total/day across the list (~1,000+ AI chats/day) | Hits `fallback: quota` and the app silently drops to the old scripted engine for that chat — **no error, no charge, just a worse reply**. Moving to paid billing on the same key needs no code change, just flipping billing on in AI Studio. Watch the admin's AI stats card for how often fallback fires | 2026-09-13 |
| **Anthropic (Claude API)** | The WhatsApp shop assistant's model access | Backend (`ANTHROPIC_API_KEY`) | Pay-as-you-go, no free tier — billed per token from the first request | This is a metered API key: cost scales directly with WhatsApp assistant usage. No hard cap unless you set spending limits in the Anthropic console | 2026-09 |
| **MyMemory** | Free machine translation, admin blog English→Hindi (one-time per blog, result is saved) | Backend | Free, no key needed. ~5,000 chars/day anonymous, ~50,000/day if `MYMEMORY_EMAIL` is set | Fails soft — returns null, the Hindi column just stays empty and the app falls back to English. Never called per-request, only once per blog, so this ceiling is not realistically reachable | 2026-09 |

## Analytics & monitoring

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **PostHog** | Screen views, funnels, retention — the whole admin Analytics page | Both apps (SDK), backend (read-only API for the admin page) | **1,000,000 events/month, free, no card** | Auto-switches to metered billing past 1M/month — you'd be billed, not blocked. Nowhere near this today | 2026-09 |
| **Sentry** | Crash reporting, both apps + backend; also feeds the automated Sentry → GitHub → Claude bug-fix pipeline | Both apps (SDK), backend | Free tier, generous error-event quota, no card | Errors beyond the free quota get dropped/sampled, not billed automatically (Sentry's free plan doesn't auto-upgrade you) | 2026-09 |

## Advertising (spends money by design — not a "limit", this is the point)

| Service | Used for | Where | Free tier / limit | If you exceed it | Checked |
|---|---|---|---|---|---|
| **Google Ads** | App-install/conversion campaigns | Backend + customer app (Firebase Analytics feeds conversion data), managed in Google Ads console | N/A — you set the daily budget yourself (currently ₹400/day) | It spends exactly what you budget, nothing more. A ₹40,000 promotional credit is active, must be used by 2026-11-16 per `CLAUDE.md` §CQ | 2026-09-17 |
| **Meta Ads (Facebook/Instagram)** | Conversion tracking wired in (`react-native-fbsdk-next`); campaign **not yet running** | Customer app (Android only so far) | N/A — same, budget-controlled by you when you launch it | Same — spends only what you set | 2026-09-17 |

## Developer accounts (annual, not usage-based)

| Service | Used for | Where | Cost | If you exceed it | Checked |
|---|---|---|---|---|---|
| **Apple Developer Program** | Required for App Store distribution, push certs, IAP, TestFlight | iOS builds of both apps | **$99/year**, flat, charged in INR | N/A — flat annual fee, not usage-metered | 2026-09 |
| **Google Play Developer account** | Required for Play Store distribution | Android builds of both apps | **$25 one-time**, already paid (both apps are live on Play) | N/A | 2026-09 |

---

## Things that look like a bill but currently aren't

- **The Gemini API key rotation trick was explicitly declined** — see
  `CLAUDE.md` "Traps hit while building this" under §CD. Do not multiply free
  quota across several Google accounts; it's against Google's terms and the
  owner already said no to it.
- **`react-native-iap` / Apple IAP only activates on iOS.** Android wallet
  recharge and remedy orders go through Razorpay as before — no double
  taxation, no code path where both take a cut of the same rupee.
- **coturn and the bg-removal service are self-hosted on the VPS** — they
  read like third-party API calls in the code but are not billed services;
  their "cost" is VPS bandwidth/CPU you're already paying for.

## When you add a new service

Add a row to the right table above (or a new table if it doesn't fit an
existing category) with: what it's for, which app/backend/admin uses it,
the free tier or plan cost, and — the important part — **what actually
happens when you hit the limit** (auto-bill? silent degrade? hard block?).
Date it. If you're not sure what happens at the limit, that's worth finding
out before shipping, not after.
