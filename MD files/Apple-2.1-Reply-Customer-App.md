# Reply to Apple — Guideline 2.1, Customer app (Astrowani 24.1, build 4)

Submission ID: 5ca6dbd6-f023-40ef-986b-5c422daf6fbd

Paste the block below TWICE:
1. App Store Connect -> Resolution Center -> reply to the review message.
2. App Store Connect -> the 24.1 version -> App Review Information -> Notes.
   (Notes is what the NEXT reviewer reads. The Resolution Center reply is what
   the current one reads. Both are needed.)

Then resubmit build 4. Do NOT upload a new build and do NOT change the version
number — Apple asked for information, not for a code change.

---------------------------------------------------------------------------

Thank you for the review. Below is the information requested, in order.

DEMO ACCOUNT
Phone number: 9999999999
OTP: 123456
No SMS is sent to this number — enter the OTP above directly. The account is
pre-funded with wallet balance so that paid features can be exercised without a
real payment.

1. DEMONSTRATION VIDEO
A screen recording made on a physical iPhone is available here:
https://drive.google.com/file/d/1H7A1EF9o6C9jxngqsKOQ3PwGhRUk5UD7/view
It shows registration and login, a live one-to-one consultation, the
user-generated-content surfaces together with the reporting and blocking
controls, the purchase of paid content, and account deletion.

For the user's security we did not film the payment-entry step itself, as doing
so would capture a UPI PIN or card details on screen. The video instead shows
the wallet balance being spent on a live paid consultation, with the per-minute
charge deducted in real time. The demo account below is pre-funded, so paid
features can be exercised without making a payment. If you would like to see a
top-up performed as well, we are happy to provide a separate recording.

2. WHAT THE APP DOES AND WHO IT IS FOR
Astrowani connects users with verified human astrologers for live, real-time
one-to-one consultations by chat, voice call and video call. A user browses
astrologer profiles, sees each one's per-minute rate, adds balance to an in-app
wallet, and spends that balance on time with an astrologer. The app also sells
physical products — gemstones, rudraksha and puja items — which are shipped to
the user's address.

The audience is adults in India seeking astrological guidance on everyday life
matters such as relationships, career and family. The app is rated 18+ and is
positioned as a lifestyle app, not a fortune-telling or prediction service.

All consultations are with real people. There is no automated or AI-generated
advice anywhere in the iOS build.

3. SETUP AND ACCESS
No setup is required beyond signing in. Sign in with the number and OTP above.
There is one account type for users; no additional configuration, invitation
code or environment switch is needed.

Astrologers use a separate application, "Astrowani for Astrologers", which is
submitted as its own app. A reviewer does not need it: the demo account can
start a consultation and a real astrologer will answer.

Please note that the app requests microphone and camera permission at the moment
a voice or video call is placed, not at launch.

4. THIRD-PARTY SERVICES AND TOOLS USED IN THIS BUILD
- Razorpay — payment gateway for wallet top-ups and physical-product orders.
  Card and UPI details are entered in Razorpay's own interface and are never
  seen or stored by Astrowani.
- Supabase (PostgreSQL and file storage) — our application database and the
  store for user-uploaded images.
- Our own backend server (Node.js / Express) hosted on a private virtual server,
  which handles sessions, billing and signalling.
- WebRTC, with a self-hosted TURN relay (coturn) — carries voice and video.
  Calls are peer-to-peer; no third party processes call media and no call is
  recorded in this build.
- Apple Push Notification service, reached through Firebase Cloud Messaging —
  delivers incoming-consultation alerts.
- An SMS provider — delivers the one-time passcode used to sign in.
- Sentry — crash and error reporting.
- PostHog — product analytics (screen views and feature usage).

There are no advertising SDKs in the iOS build, and no data is used to track
users across apps or websites owned by other companies. This matches the
"Tracking: No" answer in our App Privacy declaration.

5. REGIONAL DIFFERENCES
There are none. The app behaves identically in every storefront where it is
available. The same features, the same content and the same pricing are served
to every user; prices are shown in Indian rupees everywhere. The interface can
be switched between English and Hindi by the user at any time, and this is a
user preference rather than a regional variation. No feature is enabled or
disabled by country.

6. REGULATED INDUSTRY AND THIRD-PARTY CONTENT
Astrowani does not operate in a highly regulated industry. It is a consumer
lifestyle service. Specifically:

- It is not a financial institution and offers no financial product. The in-app
  wallet is a closed-loop prepaid balance that can only be spent inside
  Astrowani, on consultations and on physical goods. It cannot be withdrawn as
  cash, transferred to another user, or used anywhere else. All card and UPI
  processing is performed by Razorpay, a payment gateway licensed and regulated
  in India.
- It is not a health or medical service. The app makes no medical, diagnostic,
  fertility or treatment claims, and gives no health advice.
- It offers no gambling, lottery or game of chance of any kind.

All content in the app is our own or is licensed to us. Astrologer names,
photographs and profile text are supplied by the astrologers themselves under
our terms of service, with their consent to be shown in the app. Product
imagery and written content are our own. No third-party trademarked or
copyrighted material is used.

Our policies are published at:
Privacy Policy: https://astrowani.com/privacy-policy/
Terms of Use: https://astrowani.com/term_conditions/
Account deletion: https://astrowani.com/delete-account/

Please let us know if anything further would help.
