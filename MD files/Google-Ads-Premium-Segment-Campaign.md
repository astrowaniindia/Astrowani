# Google Ads — quality customers on a ₹500–600/day budget, straight to the Play Store
### Written 2026-10-08. Revised for the real budget.

Goal: high-intent customers with real paying capability, without burning the budget.
Destination is the Play Store listing directly — no website. Budget ₹500–600/day.
Two poster creatives supplied by the owner.

---

## 1. Set the budget at ₹600/day, and here is the only reason you need

Promotion **4DNF3-V3XPT-RMGW** needs **₹20,000 ex-GST spent by 2026-11-16** to unlock
**₹40,000 in credit**. From today that is **40 days**:

| Daily budget | Total by Nov 16 | ₹40,000 credit |
|---|---|---|
| ₹400 | ₹16,000 | **MISSED** |
| ₹500 | ₹20,000 | clears — with zero margin |
| **₹600** | **₹24,000** | **clears comfortably** |

**₹400/day misses the credit by ₹4,000 and costs you ₹40,000.** Going from ₹400 to
₹600 costs an extra ₹8,000 and earns ₹40,000. That is the highest-return decision on
this page by a wide margin, and it is purely arithmetic.

₹500/day lands on exactly ₹20,000 — no margin at all. One paused day, one declined
card, one disapproved ad and you miss it. **₹600/day** is the number.

When the credit lands you get **₹667/day of free spend for 60 days**, on top of your
own ₹600 — roughly **₹1,267/day effective**. That is the budget at which the serious
optimisation becomes possible, and it is about six weeks away. Everything below is
built around getting there.

## 2. You were right: do NOT optimise for purchase yet

At ₹550/day, with a realistic cost per install, here is what actually arrives:

| CPI | Installs/day | Purchases/day (at 5% recharge rate) |
|---|---|---|
| ₹25 | 22.0 | 1.10 |
| ₹35 | 15.7 | 0.79 |
| ₹50 | 11.0 | 0.55 |
| ₹75 | 7.3 | 0.37 |

In-app-action optimisation needs roughly **10 conversions/day** to learn. You would be
delivering **under one**. The campaign would sit in permanent learning, spend the full
₹600/day, and never develop a usable model — the worst of both worlds.

**So: optimise for INSTALLS for now.** Install conversions at 11–22/day *are* enough
volume to learn on. Purchase optimisation is a Phase 2 move, once the credit triples
the budget.

My earlier advice to set a tCPA at 2x your CPI was written for a ₹1,500/day budget.
It does not apply here, and your objection to it was correct.

## 3. So where does "quality" come from at this budget?

**Geography and language — and nothing else.** These cost nothing, need no conversion
volume, and work from day one. You are not asking Google to *find* affluent users; you
are only letting it buy cheap installs **inside a pool that is already affluent**.

That is the whole trick at this budget, and it is genuinely effective: an install from
Bandra or Koramangala is a different population from a broad-India install, at a
similar price.

## 4. ONE campaign. Not three.

₹600/day split across three campaigns is ₹200 each, and nothing learns on ₹200/day.
Budget fragmentation is what kills small accounts. Run a single campaign:

**Campaign: App promotion → App installs**
- **Optimisation:** Installs (not in-app actions)
- **Bidding:** Maximize conversions. Add a Target CPI only once you have a stable
  baseline to set it from — guessing a tCPI on day one throttles delivery.
- **Locations — radius-target affluent neighbourhoods, not whole cities:**
  - Delhi NCR: South Delhi (GK, Vasant Vihar, Saket), Gurgaon DLF phases, Noida 15–50
  - Mumbai: Bandra, Juhu, Worli, Powai, Lower Parel
  - Bangalore: Indiranagar, Koramangala, Whitefield, HSR
  - Hyderabad: Jubilee Hills, Banjara Hills, Gachibowli
  - Pune: Koregaon Park, Baner, Kalyani Nagar
  - Chennai: Adyar, Besant Nagar, Nungambakkam
- **Location setting: Presence only.** Never "presence or interest" — otherwise you pay
  for people merely reading about those places.
- **Languages:** English + Hindi
- **Ad groups:** one per poster, so you can tell which creative brings payers

**Pause App-1** or drop it to the floor while this runs. Two campaigns competing for
the same ₹600 is the fragmentation problem in miniature.

### NRI is out for now — deliberately
NRI geos (US/UK/UAE/Canada/Australia) carry a ₹150–400 CPI, which at ₹550/day is **2–4
installs/day**. It would not learn and would consume the entire budget. It remains the
highest-value segment in this category and it is the **first thing to add when the
₹40,000 credit lands**, not now.

## 5. Still import the purchase conversion — for measurement, not bidding

Do this in week one even though you are not bidding on it:

1. **Firebase / GA4** → mark `purchase` (wallet recharge) and `consultation_connected`
   as key events.
2. **Google Ads → Tools → Conversions → Import → GA4** → import both, **with revenue
   values**.
3. Set both to **"Secondary"** action — they get reported but do not drive bidding.

Measurement is free and it is the entire point of Phase 1. Without it you reach
mid-November with no idea which neighbourhoods produced payers, and you will spend the
₹40,000 credit as blindly as the ₹24,000. With it, Phase 2 starts from evidence.

## 6. The two phases

### Phase 1 — now to 2026-11-16 (₹600/day, ~₹24,000)
- One campaign, install-optimised, affluent metros, English + Hindi
- Purchase imported as a secondary conversion, with values
- **Do not touch it for 3–4 weeks.** App campaigns restart learning on every
  meaningful edit; fiddling at this budget guarantees it never stabilises
- Goal: clear ₹20,000, and find out which geos pay

### Phase 2 — credit lands, 60 days at ~₹1,267/day
- Promote `purchase` to the primary conversion, switch to **tCPA on purchase**
- Add the **NRI** campaign as its own line
- Cut whichever Phase 1 geos produced installs but no revenue
- Move to **tROAS** if revenue volume supports it

The credit expires 60 days after it is granted, so it has to be spent deliberately.
Having Phase 1 data is what makes that possible.

## 7. The two posters

In an App campaign the posters are **image assets** served across Display, Discover
and YouTube. They still get used — you upload them to the campaign, not to a separate
creative campaign.

**Check before uploading:** A4 is 1:1.41 and Google accepts no slot at that ratio, so
an A4 poster gets cropped badly or rejected. Each one needs:

| Ratio | Size |
|---|---|
| 1.91:1 | 1200x628 (most aggressive crop — check the message survives) |
| 1:1 | 1200x1200 |
| 4:5 | 1200x1500 (closest to the original poster) |

Text under ~20% of the image area. **A 15-second portrait video matters more than you'd
expect** — App campaigns lean on YouTube and Shorts inventory, and image-only asset
sets get materially throttled. Even a slideshow of the two posters with a voiceover
beats stills here, and at this budget you cannot afford throttled delivery.

## 8. Copy — and the decision that sorts the audience

**Do not lead with "free" or "₹1".** A free-first ad is the most reliable way to fill
the app with people who never recharge — which is exactly the problem you are trying to
avoid, and it matters more at ₹600/day than at ₹2,000/day. The free 11-minute call is a
good product and a bad *advertisement*. Let it be discovered after install.

### Headlines — 30 characters
| # | Text | Len |
|---|---|---|
| 1 | Talk To Verified Astrologers | 28 |
| 2 | Vedic Guidance, 1-On-1 | 22 |
| 3 | Private Astrology Consult | 25 |
| 4 | Consult Senior Astrologers | 26 |
| 5 | Speak To An Expert Today | 24 |
| 6 | Clarity On Career & Marriage | 28 |
| 7 | Real Experts, Real Answers | 26 |
| 8 | Pay Per Minute, No Plans | 24 |
| 9 | Your Chart, Read Properly | 25 |
| 10 | Trusted Vedic Astrologers | 25 |

### Descriptions — 90 characters
- Private 1-on-1 chat, voice or video calls with verified Vedic astrologers. *(74)*
- Career, marriage or business questions? Get clear answers from senior experts. *(78)*
- Choose your expert, see their rate, and talk in private. Pay per minute, no plans. *(82)*
- Verified experts, confidential consultations, and remedies you can actually follow. *(83)*
- Hand-picked astrologers with 10+ years of practice. Your details stay private. *(78)*

### Long headlines — 90 characters
- Private, one-on-one guidance from India's verified Vedic astrologers *(68)*
- Talk to a senior Vedic astrologer in private, by chat, voice or video call *(74)*

All counts verified against Google's limits.

### Fix the Play Store listing — it is free and it is doing half the work
Every click lands on the listing, and App campaigns pull assets from it directly. At
this budget the listing's conversion rate matters as much as the targeting, and
improving it costs nothing. The first two lines of the short description and the first
two screenshots decide the install. Make them say *verified senior experts, private
1-on-1 consultation* — not *free*.

### Wording to keep out — policy and positioning
The app is positioned as **Lifestyle**, not fortune-telling (CLAUDE.md CN):
- No "predict your future", "fortune telling", "lucky numbers", "100% accurate",
  "guaranteed solution".
- **No health, fertility, pregnancy or cure claims of any kind.** The Wani Shop copy was
  reworded for exactly this reason. A health claim risks the account, not just the ad.
- No "black magic", "vashikaran", "get your love back" — cheap-intent magnets and
  policy risk together.

## 9. The only metric to watch

**Revenue per install, by geography.** Not CPI, not install count.

A ₹180 install that recharges ₹2,000 beats a ₹40 install that never pays, and CPI will
tell you the opposite, confidently, every day. At ₹600/day the temptation to chase a
low CPI is strongest — and following it walks you straight back to the cheap-user
problem you started with.

---

## Sources checked 2026-10-08
- [Set up an App campaign for installs — Google Ads Help](https://support.google.com/google-ads/answer/12575501?hl=en)
- [Create an App campaign for engagement — Google Ads Help](https://support.google.com/google-ads/answer/9234102?hl=en)
- [About campaign objectives — Google Ads Help](https://support.google.com/google-ads/answer/7450050?hl=en)
- [Create a Demand Gen campaign — Google Ads Help](https://support.google.com/google-ads/answer/13695389?hl=en)
- [Promote Your App on YouTube, Search, Play and More — Google Ads](https://ads.google.com/home/campaigns/app-ads/)

---

# LAUNCH DAY — step by step (2026-10-08)

## Part A — before you open Google Ads (do this first, ~15 min)

**A1. Deploy the backend.** `src/acquisition.js` now parses Google Ads referrers
(`gclid` / `gad_campaignid`), which it never did before.

**This is server-side only — no OTA, no app release.** The app already sends the raw
referrer; only the parsing was wrong. Every signup after the deploy is attributed
automatically, including from apps already installed on phones.

Deploy this BEFORE creating the new campaign, so the new campaign's installs are
labelled from its first hour instead of needing another backfill later.

**A2. Already done (2026-10-08):** 1,726 historical customers backfilled to
`google_ads_24260607071`. Verified: 0 rows left with a referrer but no label.
Reversible — see the header of `sql/acquisition_backfill_google_ads.sql`.

**A3. Write down the old campaign's id: `24260607071`.** It is your benchmark. The
whole point of the new campaign is to beat it on revenue per install.

## Part B — create the campaign in Google Ads (~30 min)

**B1.** Google Ads → **+ New campaign** → objective **App promotion** → subtype
**App installs** → platform **Android** → select `com.astrowanicustomer`.

**B2. Name it so you can tell them apart later:**
`App-2-Metro-Affluent-Install-Oct2026`

**B3. Bidding.**
- Focus on: **Install volume**
- Bid strategy: **Maximize conversions**
- **Leave the Target CPI box EMPTY.** You have no reliable baseline for the new geos,
  and a guessed target throttles delivery on day one.

**B4. Budget: ₹600/day.** Not ₹400. ₹400 × 40 days = ₹16,000, which misses the
₹20,000 promo threshold and forfeits the ₹40,000 credit.

**B5. Locations — this is the entire quality mechanism, so do it carefully.**
Use **Enter another location → Advanced search → Radius**, 5–8 km per point:

- Delhi: Greater Kailash, Vasant Vihar, Saket
- Gurgaon: DLF Phase 1–5
- Noida: Sector 15–50
- Mumbai: Bandra West, Juhu, Worli, Powai, Lower Parel
- Bangalore: Indiranagar, Koramangala, Whitefield, HSR Layout
- Hyderabad: Jubilee Hills, Banjara Hills, Gachibowli
- Pune: Koregaon Park, Baner, Kalyani Nagar
- Chennai: Adyar, Besant Nagar, Nungambakkam

**Then open "Location options" and set Target = "Presence: People in or regularly in
your included locations".** The default is *"Presence or interest"*, which also buys
people merely browsing about those places and is the single biggest silent leak in a
geo-targeted campaign.

**B6. Languages:** English and Hindi.

**B7. Ad group 1 — name it `Poster-A`.** Paste from §5 of this document:
- 5 headlines (30 char) — pick any 5 from the table
- 5 descriptions (90 char) — all five
- Images: poster A at **1200x628, 1200x1200, 1200x1500**
- Video: add one if you have it. Strongly recommended — App campaigns lean on YouTube
  and Shorts, and an image-only asset set gets materially throttled delivery.

**B8. Ad group 2 — `Poster-B`.** Same copy, poster B's three crops. Two ad groups is
how you find out which creative brings payers rather than just cheaper clicks.

**B9. Publish.**

## Part C — immediately after publishing (~10 min)

**C1.** Find the new campaign's numeric id (it is in the URL when the campaign is open,
or add the "Campaign ID" column). **Send it to Claude** — it goes into the reporting so
the two campaigns can be compared side by side.

**C2. Do NOT pause the old campaign yet.** Let both run **3–4 days** until the new one
is actually delivering. Pausing immediately risks underspending against the Nov 16
promo deadline while the new campaign is still ramping. Once the new one is spending its
full ₹600/day, pause `24260607071`.

**C3.** In GA4/Firebase, mark `purchase` and `consultation_connected` as key events and
import them into Google Ads as **Secondary** conversions, with revenue values. Secondary
means they report but do not drive bidding — which is correct for now (§2). This is what
makes the next six weeks worth anything.

## Part D — then leave it alone

**Do not edit the campaign for 3–4 weeks.** Every meaningful change restarts learning,
and at ₹600/day a restarted campaign never stabilises.

Check only two things, weekly:
1. **Spend pacing** — are you on track for ₹20,000 by Nov 16?
2. **Revenue per install, by campaign** — the new one vs `24260607071`.

Ignore CPI. The old campaign is buying installs at roughly ₹3.50, which is not a
bargain — it is the sign of Maximize-conversions finding the cheapest inventory on the
internet. If you judge the new campaign on CPI it will look worse while being better.

## What to expect, honestly

This campaign will improve the *quality of person arriving*. It will not make this month
profitable, and that is not a setup failure.

The reason is in the data: **organic traffic activates at 4.0% and paid Google traffic
at 5.3%.** Organic is the highest-intent audience that exists — people who searched the
Play Store and chose you — and it performs no better. So the 95% drop-off is not an
audience problem that targeting can fix. It is the app.

The honest purpose of the next six weeks is therefore:
1. Bank the ₹40,000 credit.
2. Get clean per-campaign data for the first time.
3. **Fix the activation drop-off**, so the ₹40,000 is not spent into a funnel that
   loses 95% of arrivals at the first step.

## Side effect you will notice
`google_ads_24260607071` now appears on the admin **QR Codes** page, because that page
lists the union of the poster registry and every source seen in the data
(`qrRoutes.js:234`). That is not a bug — it is the per-campaign funnel, and it is the
quickest place to see installs → signups → paying customers for a campaign.
