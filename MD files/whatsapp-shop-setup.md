# Turning on the WhatsApp shop assistant

Everything in the code is built and on `main`; the database migration is applied.
What's left is account setup and data entry. This file is the checklist for that.

For what the feature *is* and why it's shaped this way, see the commits
`c82d9f8`, `8840883`, `0ae38b9`. For deploying the backend, see
[vps-git-deploy-guide.md](vps-git-deploy-guide.md).

## The short version

1. Get a phone number that is **not** on WhatsApp or WhatsApp Business already.
2. Create a Meta Business account, add a WhatsApp app, verify the business.
3. Put five env vars on the VPS.
4. Point Meta's webhook at `https://backend.astrowani.com/api/whatsapp/webhook`.
5. Enter ratti prices for the gemstones in the admin.
6. Pick the astrologers who answer escalations.
7. Set the number in the admin and flip `whatsapp_shop_enabled` to true.

Until step 7 the app keeps its normal in-app cart, so none of this is visible to
customers while you work through it. Nothing breaks half-done.

---

## Why this is the free option

Meta charges per **conversation**, and **service conversations — the customer
messages first and we reply within 24 hours — are free**. Our flow is always
customer-initiated: they tap a product in the app, WhatsApp opens with the
message pre-filled, they send it. That keeps us in the free tier permanently.

**Do not send unsolicited template messages.** Marketing/utility templates are
what cost money and what gets a number rate-limited. Nothing in the code sends
one; don't add it without deciding to pay for it.

The one real cost is the model. Claude replies run roughly **Rs. 0.15–0.50 per
customer message** depending on length. A hundred conversations a day is a few
hundred rupees a month, not thousands. The system prompt is cached, so the
second and later messages in a conversation are cheaper than the first.

---

## Step 1 — the phone number

Needs to be a number that has **never** been registered on regular WhatsApp or
WhatsApp Business, or you'll have to delete that account first (which wipes its
chat history). A cheap second SIM is the usual answer. It can receive the
verification code by SMS or voice call.

Once it's on the Cloud API it can no longer be used in the normal WhatsApp app.
Don't use a number your team already uses to talk to customers by hand.

## Step 2 — Meta Business account

At <https://business.facebook.com>:

1. Create a Business account for Astrowani.
2. At <https://developers.facebook.com> create an app, type **Business**, and add
   the **WhatsApp** product.
3. Under WhatsApp → API Setup, add and verify the phone number from step 1.
4. Start **Business Verification** (Settings → Business Info). It's free and
   takes a few days. You can test with the temporary token before it completes,
   but you need it verified to message the general public.

Collect four things as you go:

| What | Where |
|---|---|
| Phone number **ID** | WhatsApp → API Setup. This is a long number, **not** the phone number itself |
| Permanent access token | Business Settings → System Users → create one, assign the app, generate a token with `whatsapp_business_messaging` + `whatsapp_business_management`. The token shown on API Setup is temporary (24h) and will expire on you |
| App secret | App Settings → Basic → App Secret |
| A verify token | Any random string you invent. You type the same one into Meta and into the env var |

## Step 3 — env vars on the VPS

Alongside `SUPABASE_SERVICE_ROLE_KEY` and the rest (see
[vps-git-deploy-guide.md](vps-git-deploy-guide.md) for where that file lives):

```
WHATSAPP_VERIFY_TOKEN=<the random string you invented>
WHATSAPP_TOKEN=<permanent access token>
WHATSAPP_PHONE_NUMBER_ID=<the ID, not the number>
WHATSAPP_APP_SECRET=<app secret>
ANTHROPIC_API_KEY=<from console.anthropic.com>
```

Restart the backend after adding them.

Every one is optional at boot. Without them the routes answer "not configured"
instead of crashing — which is why the app could ship before any of this existed.

**`WHATSAPP_APP_SECRET` is not optional in practice.** Webhook signature
verification fails closed: with no secret set, every incoming webhook is
rejected. That's deliberate — this endpoint creates orders and payment links, so
an unsigned caller impersonating a customer is not a theoretical worry.

## Step 4 — the webhook

In the Meta app → WhatsApp → Configuration:

- **Callback URL**: `https://backend.astrowani.com/api/whatsapp/webhook`
- **Verify token**: the same string as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **`messages`** field.

Meta calls the URL once to verify. If it fails, the usual causes are the backend
not restarted after adding the env vars, or the verify token not matching.

## Step 5 — ratti prices

Admin → Remedies → open a gemstone → **Weights & prices**. Add a row per ratti:
label (`5 ratti`), the numeric ratti, and the price. MRP and stock are optional —
blank stock means unlimited.

This matters more than it looks. **The assistant is forbidden from stating a
price it has not read from the catalogue**, so a weight that isn't entered here
cannot be quoted and cannot be sold. An item with no weights keeps its single
price, which is right for pujas and vastu items but wrong for a stone.

There are 33 gemstones. You don't have to do them all before going live — just
know that the ones without weights will only be discussed at their single price.

## Step 6 — who answers when it hands over

Same admin card, **Who answers when the assistant hands over**. Tick the
astrologers on WhatsApp support duty.

Each escalation goes to whoever has the fewest open conversations, and if nobody
replies within 10 minutes it moves to the next person automatically. They read
and reply in the vendor app under **WhatsApp Customers** (drawer), and replying
takes the thread — the assistant stays quiet until they hand it back.

**Do not skip this.** The assistant tells the customer "I'm connecting you to an
astrologer". With an empty roster that promise is made to an empty room: the
thread is still marked for a human and still visible, but nobody is told. The
card shows a red warning when the roster is empty for exactly this reason.

Needs the vendor app build that contains the WhatsApp Customers screen
(versionName 6.6 / versionCode 23 or later). Escalation still assigns and pushes
correctly on older builds — the astrologer just has nowhere to read it.

## Step 7 — go live

Admin → the WhatsApp shop settings:

- `whatsapp_shop_number` — the number in international form, digits only
  (e.g. `919876543210`)
- `whatsapp_shop_enabled` — `true`
- `whatsapp_shop_greeting` — what the customer's first message says. `{item}` is
  replaced with the product name
- `whatsapp_shop_cta` — the button label in the shop

The app reads these on launch, so a customer already in the app sees the change
next time they open it. No app release needed.

### Optionally: close the in-app cart

The handoff overrides the in-app cart wherever it's on, but the cart endpoints
still work. To make WhatsApp the only way to buy, set
`remedy_orders_enabled_gemstone` / `_puja` / `_specific_puja` / `_vastu` to
`false` in the admin. That's enforced server-side, so an old installed build
can't slip an order through.

---

## Checking it works

Message the number from a normal phone. Expected: a reply within a few seconds
quoting real prices from the catalogue.

- **No reply at all** — check the backend logs. `[whatsapp] rejected a webhook
  with a bad or missing signature` means `WHATSAPP_APP_SECRET` is wrong or unset.
  `[whatsapp] not configured` means `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`
  are missing.
- **"One of our team will reply here shortly"** — that's the bot's fallback when
  `ANTHROPIC_API_KEY` is missing or the model call failed. The conversation is
  marked for a human, so nothing is lost.
- **Prices look wrong or vague** — the weights aren't entered (step 5).

Conversations are readable over the API now:

```
GET  /api/admin/whatsapp/conversations
GET  /api/admin/whatsapp/conversations/:id/messages
POST /api/admin/whatsapp/conversations/:id/reply     { "text": "..." }
POST /api/admin/whatsapp/conversations/:id/release
```

Replying by hand takes the thread — the bot goes quiet until you `release` it.
That's how the astrologer handover works, and it's deliberate: a human
mid-consultation must not have an assistant talking over them.

---

## What is deliberately not built

- **No admin page for conversations.** The endpoints above exist; there's no UI
  in the dashboard yet. Astrologers read and reply in the vendor app, so this
  only matters for an admin wanting to watch over the whole queue.
- **The bot has never run against the real model.** Everything up to the model
  call is tested against the live database — catalogue search, per-ratti pricing,
  order creation — but the actual conversation quality is unproven until the API
  key exists. Expect to tune the system prompt in `src/whatsappBot.js` after
  reading the first real conversations.
- **Text only.** A photo of a stone gets "I can only read text messages here."
  Answering an image wrongly is worse than declining it.
- **No Razorpay webhook.** If a customer pays the link but nothing tells us, the
  order stays `pending_payment` and shows in the admin's abandoned-checkouts
  view. Same known gap as the in-app cart — see the note in CLAUDE.md.
