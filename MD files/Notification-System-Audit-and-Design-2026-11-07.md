# Notifications: what we have, what big apps have, and what is being built

Measured against the **live production database** on 2026-11-07, plus a read of every
push call site in the backend and both apps. Every number below came from a query, not
from reasoning about the code.

---

## 1. The headline number

**A broadcast to "All Customers" reaches 289 phones out of 4,857 customers. Six per cent.**

```
live customers (not soft-deleted)        4,857
 ├─ holding a usable FCM token             289   ← everyone a push can reach
 ├─ marked "app removed"                 2,156
 └─ no token, no removal mark            ~2,412   ← never registered one at all
```

The admin page has always shown this honestly — "289 can receive a push" — but nothing
has ever said what it *means*, so every broadcast has read as "sent to 4,849 recipients"
in the history table while 94% of them got nothing but a row in a list they do not open.

### The 2,156 "app removed" are real, and dating them explains a lot

```
2026-11-05 16:53  broadcast  4,802 recipients   272 ok   2,126 FAILED
2026-11-06 11:46  broadcast  4,846 recipients   278 ok   2,153 FAILED  → 2,119 tokens cleared
2026-11-06 15:59  broadcast  4,849 recipients   272 ok      42 failed
```

`push.js` requires a token to come back dead **twice, five minutes apart** before it
clears it — a deliberate guard added on 2026-09-28 after a live chat's token burst got a
customer wrongly marked as uninstalled. The 5 Nov send was the first sighting, the 6 Nov
send the confirmation, and 2,119 tokens were cleared between them. The guard worked
exactly as designed. **That is not a bug; it is the first time anybody measured the
truth.** Before 5 Nov the reported reach was ~2,400 and about 88% of it was fiction.

### The ~2,412 with no token at all is the part we cannot explain, and that is the real gap

There are four completely different reasons a customer has no token, and **the database
cannot tell them apart**, because nothing records any of them:

| Reality | Recorded today |
|---|---|
| Never asked (app build predates the ask) | nothing |
| Asked, tapped **Don't allow** | nothing |
| Allowed, but the token never arrived (iOS APNs race) | nothing |
| Allowed, then turned notifications off in Settings | nothing |
| Had a token, uninstalled | `app_removed_at` ✅ (the only one) |

This is precisely the question that was asked — *how many have notifications on, how many
tapped not-allow, how many deleted the app* — and today only the last one is answerable.

---

## 2. Everything else that is missing, measured

### 2.1 The in-app notification list is an admin-broadcast inbox, not a notification centre

15,468 rows in `notifications`, and only **three** types exist in the entire table:

```
admin_broadcast            14,506 rows      24 read  (0.17%)
admin_personal                961 rows      31 read  (3.2%)
wallet_debt_explanation          1 row       0 read
```

Meanwhile the backend pushes **at least 15 other kinds** of notification — chat requests,
chat messages, order shipped/delivered, report delivered, support replies, free-call
invites and reminders, "your astrologer is free now", referral rewards, session ended,
app update, review prompt, payout approved. **None of them are written to the in-app
list.** They exist for the few seconds they sit in the phone's tray and then they are
gone forever. A customer who misses the banner has no way to find out an order shipped.

`data` (the jsonb payload column) is **NULL on all 15,468 rows**, so no notification in
the list has ever carried a destination. Tapping an item in the list navigates nowhere.

A 0.17% read rate is not an engagement problem, it is a plumbing one: there is nothing in
there worth opening.

### 2.2 No image, ever

`sendPush` builds `{notification: {title, body}}` and an APNs alert. There is no
`android.notification.image`, no `apns.fcm_options.image`, and the app's own
`showLocalNotification` sets no `bigPictureUrl`. Every notification this app has sent has
been two lines of grey text. Astrotalk, Ganesha Speaks and every e-commerce app in India
send image notifications for festivals and offers because they roughly double the tap
rate on promotional sends.

The iOS half additionally needs a **Notification Service Extension** in the binary
(`mutable-content: 1` plus an extension that calls FCM's `populateNotificationContent`).
We have none — `AstrologyApp.xcodeproj` contains zero extension targets. So iOS images
need a store build; Android images ship by OTA.

### 2.3 Nothing is tracked after the send

The only numbers kept are `push_success` / `push_failure` from FCM's accept response —
which means "Google took the message", not "a human saw it". There is no record of:

- **delivered** (the app came to the foreground holding it),
- **opened / tapped**,
- **dismissed**,
- **what the person did next** (recharged? started a chat?),
- **which notification produced which recharge**.

`NotificationScreen.js` does fire a PostHog `notification_opened` event, but it carries
`{was_unread}` and nothing else — no campaign id — so it can never be attributed to a
send. 46 broadcasts have gone out and not one of them can be scored.

### 2.4 One token per customer, so a second phone is invisible

`customers.fcm_token` is a single text column, written by whichever device logged in last.
The astrologer side already got this right — `vendor_devices` is a proper per-device table
with `device_id`, `platform`, `app_version`, `last_seen_at` — and the customer side never
did. A customer with a phone and a tablet is reachable on exactly one of them, and which
one changes without warning.

### 2.5 No scheduling, no automation, no recurrence

Every send is a human pressing a button, now. There is no `scheduled_at`, no cron, no
recurring campaign, no triggered journey. So none of the following exists, and all of
them are table stakes:

- "₹75 = ₹101" Diwali push at **8pm IST**, written at 3pm
- a **birthday** push (we store `dob` on 4,857 customers and have never used it)
- **wallet ran dry** → "add ₹100, talk for 4 more minutes", 2 hours after a session ended
- **abandoned recharge** → opened the wallet, closed it without paying, 30 minutes later
- **day 1 / day 3 / day 7 onboarding** for someone who signed up and never consulted
- **win-back** at 14 / 30 / 60 days of silence
- **free call unused** → the invite everyone now gets at signup, re-offered on day 2
- **"your astrologer is online"** for someone who viewed a profile and left
- **order shipped/delivered** follow-up asking for a review
- a **weekly horoscope** on Monday morning, which is the single highest-retention
  recurring push in this category

### 2.6 No frequency cap, no quiet hours, no preference centre

Nothing stops two admins sending the same offer twice in an hour — and the history shows
the Diwali offer went out **three times in 24 hours** (5 Nov 16:53, 6 Nov 11:46, 6 Nov
15:59) to the same audience. Nothing stops a 2am send. A customer who wants order updates
but not promotions has exactly one lever: turn off notifications for the whole app, which
is what the 46%-opt-out research says they do.

### 2.7 No segmentation worth the name

Targeting is "all customers" / "all astrologers" / a hand-picked list, optionally filtered
by **acquisition source** (QR poster / ads / Google). That is the only filter that exists.
We hold, and cannot target on: wallet balance, recharge history, number of consultations,
days since last session, platform (iOS/Android), app version, state, gender, age from
`dob`, free-call used or not, language, blocked/suspended.

And we cannot target by **language at all** — nothing in the database records whether a
customer uses the app in Hindi or English, although the app has 1,198 translated strings.
Every notification goes out in one language to everybody.

### 2.8 No A/B testing, no templates, no approval, no audit trail

46 sends, no variants, no saved templates, and `notification_broadcasts` does not record
**who** sent it. The three duplicate Diwali sends have no author.

---

## 3. What the big players actually have

Researched across CleverTap, MoEngage, Braze and the published e-commerce benchmarks.
This is the feature set we are being compared against, in rough order of value to us:

| Capability | What it is | Us |
|---|---|---|
| **Per-send event log** | one row per recipient, with sent/delivered/opened/clicked/converted timestamps | ✗ |
| **Journeys / automations** | no-code multi-step flows reacting to user behaviour in real time | ✗ |
| **Rich push** | image, big text, up to 3 action buttons, deep link | ✗ |
| **Scheduling + recurrence** | send later, repeat daily/weekly, per-user local timezone | ✗ |
| **Send-time optimisation** | CleverTap's *IntelliTime* splits the day into 12 two-hour buckets and puts each user in the one matching their own usual activity | ✗ |
| **Frequency capping** | global and per-campaign caps — e.g. at most one promo per 24h | ✗ |
| **Do Not Disturb / quiet hours** | per-channel, per-user windows no campaign may cross | ✗ |
| **Behavioural segmentation** | RFM, recency, spend, event history | ✗ (acquisition source only) |
| **Preference centre** | the user picks categories instead of all-or-nothing | ✗ |
| **A/B testing** | variants with automatic winner selection | ✗ |
| **Multi-channel fallback** | push → SMS/WhatsApp if the push could not be delivered | partial (SMS + WhatsApp exist but are not wired to notification failure) |
| **Delivery hardening** | CleverTap's *RenderMax* claims ~30% more pushes actually rendered on Chinese OEM ROMs | ✗ |
| **Dead-token hygiene** | clear unregistered tokens, count uninstalls | ✅ **we already do this well** |

### Benchmarks worth holding ourselves to

- Opt-in: **~75% on Android**, ~52% on iOS for retail/e-commerce apps. We are at 6%
  reachable, which is not an opt-in rate — it is an instrumentation failure.
- Tap rate on a plain promotional push: **3.0–3.8%**. With an image, materially higher.
- **46% of users opt out if they get 2–5 promos a week.** Three Diwali sends in 24 hours
  is how a list gets burned.
- India timing: **8–9am, 12–1pm and 8–10pm IST** are the windows that work.

---

## 4. What is being built

Six new tables, a notification service in the backend, a real admin panel, and the app
side of tracking and rich push.

### Foundation
1. **`customer_devices`** — per-device rows mirroring `vendor_devices`, plus the three
   things nobody records today: `permission_status` (granted / denied / undetermined /
   blocked), when it was asked and answered, and `locale`. `customers.fcm_token` keeps
   being written as the primary device so **none of the 25 existing push call sites
   change**.
2. **`notification_campaigns`** — the thing an admin creates. Draft → scheduled → sending
   → sent, with image, deep link, Hindi copy, audience filter, schedule, variants, and
   roll-up counters.
3. **`notification_sends`** — one row per recipient per campaign. This single table is
   what makes every number in section 2.3 answerable.
4. **`notification_automations`** — recurring and triggered flows, with cooldown and cap.
5. **`notification_preferences`** — per-customer categories and quiet hours.
6. **`notification_templates`** — saved, reusable copy.

### Behaviour the design commits to
- **Transactional notifications are never suppressed.** A chat request, a call, an order
  update and a support reply ignore quiet hours, frequency caps and category opt-outs.
  Only `promotional` and `engagement` categories are governed. Getting this backwards
  would mean a customer missing a consultation they paid for.
- **Every notification lands in the in-app list** with a working destination, so missing
  the banner stops meaning losing the message.
- **The preview is computed by the same code as the send**, as `recipients.js` already
  does — a preview that disagrees with the send is worse than none.
- **The scheduler runs in one process only**, gated on the same flag that marks the real
  production process, so a developer machine can never fire a campaign at 4,857 people.
- **A campaign that cannot be delivered is recorded as suppressed with a reason**, not
  silently dropped — "quiet hours", "frequency cap", "opted out", "no device", "token
  dead". Otherwise a quiet system and a broken one look identical.

---

## 4b. Built and verified, 2026-11-07

All six tables and both SQL functions are **applied to production**; the backend
service, the admin Notification Center and the customer-app half are written and
verified by `astrowani-backend/scripts/notificationPlatformCheck.js` — **113 checks
against the live database**, with the push stubbed and one synthetic customer.

That suite found four real bugs on its first run, all of which would have shipped:
the audience function silently truncating at 1,000 rows, a NULL locale from a newer
device erasing one an older device had reported, a personal send bypassing the
permission check via the legacy token column, and a campaign suppressed for everybody
reporting no reason. It also caught a route collision with the existing Quick Push
page, which it could only see once it mounted both modules the way `index.js` does.

**Nothing is deployed and no OTA has been sent.** Each half degrades safely without
the other, so the order is a matter of choice rather than of risk. The full record,
including the ten seeded automations (all switched off) and what is deliberately not
done, is subsystem **ER** in `CLAUDE.md`.

## 5. Sources

- [CleverTap — Notification Delivery Options](https://docs.clevertap.com/docs/notification-delivery-options)
- [CleverTap — IntelliTime](https://docs.clevertap.com/docs/intellitime)
- [CleverTap — Push notifications platform](https://clevertap.com/messaging-channels/push-notifications/)
- [CleverTap — Retention-boosting push notifications](https://clevertap.com/blog/ultimate-guide-to-writing-retention-boosting-push-notifications/)
- [CleverTap vs MoEngage, 2026 comparison](https://sortment.com/blogs/clevertap-vs-moengage)
- [Firebase — Send an image in the notification payload (iOS)](https://firebase.google.com/docs/cloud-messaging/ios/send-image)
- [Pushwoosh — Push notifications for e-commerce: 2026 benchmarks](https://www.pushwoosh.com/blog/push-notifications-e-commerce/)
- [PushEngage — Push notification benchmarks](https://www.pushengage.com/push-notification-benchmarks/)
- [vmobify — Push notification strategy 2026 (India timing)](https://vmobify.com/blog/push-notification-strategy)
