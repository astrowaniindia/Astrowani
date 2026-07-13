# Hindi/English Localization — Customer App

## How it works

- `src/context/LanguageContext.js` — `LanguageProvider` (wraps the whole app in `App.js`) holds
  `language` (`'English' | 'Hindi'`), persists it to `AsyncStorage` under the key `appLanguage`,
  and exposes `t(key, params?)` for looking up strings.
- Keys are **namespaced** as `"namespace.key"` (e.g. `home.welcome`, `drawer.logout`,
  `alerts.unavailable`) to avoid collisions as coverage grows. Add new strings under the
  namespace that matches the screen/section they belong to.
- `t()` supports simple interpolation: `t('home.waitingFor', { name: 'Ramesh' })` replaces
  `{{name}}` in the resolved string. Use this instead of string concatenation so both languages
  can reorder words naturally.
- Fallback behavior: unknown key in the current language → falls back to English → falls back
  to the raw key itself (so a missing translation never crashes, it just shows English or the key).

## Using it in a screen

```js
import { LanguageContext } from '../../context/LanguageContext'; // adjust relative path
const { t, language, changeLanguage } = React.useContext(LanguageContext);
...
<Text>{t('home.viewAll')}</Text>
```

## The toggle

`src/routes/CustomHeader.js` renders a small `EN | हिं` pill (only when the screen passes
`showLanguage={true}` — currently only the Home stack, see `Navigation.js`). Tapping it calls
`changeLanguage(language === 'Hindi' ? 'English' : 'Hindi')` directly — no modal. This was
previously a translate-icon-opens-modal pattern; that's been removed in favor of the inline pill.

`src/screens/drawerScreens/Settings.js` used to have a second, disconnected language toggle
(dead code, commented out) — it's been removed. The header pill is the single source of truth
for language everywhere in the app.

## What is NEVER translated (by design)

- Numbers, currency amounts (`₹123`), dates/times — always rendered in plain Latin digits/English
  formatting regardless of language. Never call `toLocaleString('hi-IN')` or similar.
- Astrologer names (proper nouns) and the "Astrowani" brand name.
- OTP codes.
- Legal pages: Terms of Use, Privacy Policy, Refund & Cancellation — always render in English
  even when Hindi is selected (legal-mistranslation risk was flagged and explicitly rejected by
  the product owner).

## Coverage so far (Phase 1 + Phase 2 + Phase 3 + Phase 4)

Fully wired with `t()`:
- `CustomHeader.js` (header pill itself)
- `CustomDrawerContent.js` (all drawer item labels)
- `Home/Home.js` (search bar, section headers, astrologer card buttons/alerts, waiting modal,
  categories list — including consuming the backend's bilingual `hindi.*` fields for categories/
  thought-of-the-day/blogs, live section, free services, astro reports, blog section, "why
  Astrowani" footer, fixed bottom Chat/Call buttons)
- `drawerScreens/Settings.js` (all items + modals; dead language-modal code removed)
- `screens/Login/Login.js` (all labels, validation/error alerts)
- `components/RequestingPopup.js`, `components/StatusPopup.js` (shared call/chat waiting +
  outcome popups)
- `screens/Remedies/HomeRemedies.js`, `screens/Remedies/RemedyShop.js` (static tile labels +
  DB item title/description via `hindi.*` fallback + "Buy Now")
- `screens/Call/Call.js` (waiting modal + all alerts — most of the file is dead/commented-out
  code, only the alerts and modal are actually rendered)
- `screens/component/ReusableList.js` (the shared Chat/Call/Video card used by `Allastrologers`,
  `Call.js`, `Video.js` — buttons, search placeholder, Exp/Free labels, waiting modal, all alerts)
- `screens/Video/Video.js`, `screens/chat/Chat.js` + `hooks/useChatRequest.js` (the chat-request
  flow shared by every "Chat" button across the app)
- `screens/Live/Live.js` (LIVE badge, watching count, Join Now, search, empty state)
- `screens/Home/AstrologerInfo.js` — the full profile screen: stats bar, specialization/about/
  experience/reviews cards, floating Chat/Call/Video dock, all alerts and waiting popups
- `screens/OtpScreen/OtpScreen.js`, `screens/OtpScreen/VerifyOtp.js` (both OTP screens are wired
  into navigation — VerifyOtp is the one Login.js actually navigates to)
- `screens/Category/CategoryAstrologers.js` header — `Home.js` now passes the Hindi category name
  as `categoryName` when Hindi is selected (only Home.js navigates to this screen)
- `screens/drawerScreens/AboutUsScreen.js`, `FaqScreen.js` (full marketing copy + FAQ content)
- `screens/Home/Wallet/Wallet.js` (the real wallet recharge screen — `drawerScreens/WalletScreen.js`
  is dead/empty, not the one wired into navigation)
- `screens/Register/Register.jsx`, `screens/OtpScreen/EmailOtpScreen.js` (signup + email-OTP flows)
- `screens/drawerScreens/UserProfileScreen.js` (669 lines — full edit form, all validation alerts;
  gender/marital-status dropdown option labels are translated but their stored `value` stays
  English for backend compatibility; the 28 Indian state names are intentionally left untranslated
  — proper nouns, commonly written in Roman script even in Hindi UIs)
- `screens/drawerScreens/MySessionScreen.js` + `screens/component/SessionDetails.js` (all 4 session
  tabs, card labels, empty states — the session-type color lookup was refactored to key off a
  stable English `typeKey` instead of the now-translated display label, to avoid breaking once
  Hindi is selected)
- `screens/Home/BlogList.js` (list card now shows `hindi.title` when Hindi is selected),
  `BlogScreen.js` ("Created At" label — the screen has always shown English AND Hindi blog content
  stacked together regardless of the toggle; that dual-display behavior was pre-existing and left
  as-is), `SearchScreen.js` (search placeholder, empty state, "most searched" tag list),
  `NotificationScreen.js` (only the empty-state text — the notification list itself is dummy/mock
  data, not a real feature)

- `screens/drawerScreens/FreeSeviceScreen/*` — Panchang, Janam Kundali, Kundali Match (free
  version), Horoscope (zodiac names now come from `zodiac.*` keys keyed by the stable English
  `sign` slug, not the display name, so switching language never breaks the API param), Shubh
  Muhurat (tab labels — Choghadiya/Shubh Hora/Gowri Panchangam/Rahu Kaal — intentionally left
  untranslated, standard Sanskrit/Vedic terms used as-is in Hindi UIs too)
- `screens/drawerScreens/AstroServices/*` — all 10 paid-report input screens (Kundli, Matching,
  Chart, Dasha, Dosh, Numerology, Lal Kitab, KP Astrology, Tarot, PDF Report) via the shared
  `BirthDetailsForm.js` + `useAstroPurchase.js`, and all 10 result screens' section titles (the
  report body itself is a generic recursive JSON renderer in `ReportResultView.js` — its
  `humanize()`-generated field labels come from the external API's raw JSON keys and are
  intentionally not translated, same as any other externally-sourced dynamic content). Divisional
  chart names (D1, D9 — Navamsa, etc.) and PDF report template names are left in English —
  technical/product names, not conversational UI text.

### Bugs caught and fixed while translating (worth knowing about)
1. `AstrologerInfo.js` had `const t = setTimeout(...)` inside a `useEffect`, which would have
   shadowed the `t()` translation function and crashed the auto-action "unavailable" alert path —
   renamed to `timer`.
2. `UserProfileScreen.js`'s custom alert modal picked its icon via
   `title.toLowerCase().includes('error')` — this silently breaks once titles are translated to
   Hindi. Replaced with an explicit `isError` flag on the alert state instead of string-sniffing
   the (now-translatable) title.
3. **`FreeSeviceScreen/PanchangScreen.js` had a real, pre-existing crash bug** (unrelated to
   translation): it used `Platform.select(...)` but never imported `Platform` from `react-native`
   — a `ReferenceError` on every render, meaning tapping the Panchang tile silently did nothing.
   Fixed by adding the import. This was very likely the concrete "nothing happens" bug reported —
   see the "Free Services backend integration" section below for the rest of that story.
4. `MySessionScreen.js` passed a translated `sessionTypeLabel` straight into `SessionDetails.js`'s
   `TYPE_COLORS` lookup, which was keyed by the exact English label — broke color lookup as soon
   as Hindi was selected. Fixed by adding a stable English `typeKey` alongside the translated
   label, used for the color lookup while the label is used only for display.

## Free Services backend integration (found while fixing the "nothing happens" bug)

Investigating why Free Services didn't work turned up a bigger, unrelated finding:

- **The 10 paid `AstroServices` reports are already fully wired** to a real provider,
  JyotishamAstroAPI, via `astrowani-backend/src/astroRoutes.js` + `src/jyotishamClient.js`. Auth
  is a `key` header read from the `JYOTISHAM_API_KEY` env var (not yet set on Render as of this
  writing — that's the one blocker for those 10 reports actually working end to end).
- **The 5 Free Services screens are NOT wired to this backend at all** — they call a dead
  `astrowani-fb6pi.ondigitalocean.app` URL (Panchang, Janam Kundali, Horoscope) or a
  `/api/free-services/*` backend route that was never built (Kundali Match). Building
  `/api/free-services/panchang` etc. on top of the existing `callJyotisham` client is Phase 5
  follow-up work — see the task list / conversation for the exact Postman endpoint paths once
  confirmed.

## Not yet covered (Phase 5 — follow-up work)

Same pattern applies everywhere: import `LanguageContext`, destructure `t`, replace strings, add
keys to `LanguageContext.js`. Reuse existing `alerts.*`/`common.*` keys where the message matches
one already used elsewhere. Watch for the bug classes above (variable shadowing of `t`, and
string-matching translated text for control flow) when doing this work.

- `screens/Home/Astrologers.js` is placeholder/mock data (unused UI strings coupled to
  string-matching routing logic in `Home.js`'s `handleServiceSelect`) — do NOT translate the
  `services[].title` values without also updating the `===` comparisons that route on them
- Legal pages (`RefundAndCancel.js`, `PrivacyPolicy.js`, `TermsOfUse.js`) — intentionally
  English-only per product decision, not a gap

## Backend-driven (DB) content

See `astrowani-backend/HINDI_I18N_BACKEND.md` for how categories/banners/remedies/thoughts/blogs
carry Hindi text and how the admin dashboard edits it. Customer-app convention for consuming it:

```js
const { language } = useContext(LanguageContext);
const title = language === 'Hindi' ? (item.hindi?.title || item.title) : item.title;
```

Always fall back to the English field when the Hindi field is empty — the backend already does
this same fallback server-side, but do it again client-side defensively.
