// What the support bot knows about Astrowani, as plain sentences.
//
// EVERY LINE MUST BE TRUE OF THE SHIPPED APPS. Each one was written from the
// apps' own screen texts (both LanguageContext files), their screens and the
// backend rules on 2026-11-17; the source is noted in brackets where it is not
// obvious. If the product changes, change the line. The admin can append
// further lines without a deploy through app_settings.support_ai_knowledge.
//
// WHAT IS DELIBERATELY NOT HERE: prices, amounts, minimum balances, bonus
// offers, payout percentages, minimum withdrawals, tax, free-call minutes and
// any date or turnaround time. The bot does not talk about money (supportAi's
// gate refuses a reply that does) and those numbers change; questions about
// them go to the hand-written replies, which read the person's real records,
// or to a person.
//
// THE TONE LINES at the end of each list are not facts but how to speak, and
// they come from what the team actually does: reassure someone who is waiting,
// without promising a time.

const CUSTOMER = [
  // ── What Astrowani is ──
  'Astrowani is an Indian app where you talk to verified astrologers live, one to one, by chat, audio call or video call. It also has the Wani Shop for gemstones, pujas and other remedies, live streams by astrologers, and astrology reports.',
  'Every astrologer on Astrowani is reviewed and approved by our team before they can take consultations. [vendor approval flow]',

  // ── Account ──
  'Signing up and logging in are the same: enter your mobile number and the 6-digit OTP sent by SMS. There is no password.',
  'An OTP can take up to a minute to arrive. Check the number is right and the phone has signal, wait, then tap Resend OTP.',
  'Before your first consultation the app asks for your birth details (name, date, time and place of birth), because the astrologer reads your chart from them. You can change them later in My Profile from the menu.',
  'Your name, date of birth, birth time and birth place can be changed from Menu > My Profile. The mobile number cannot be changed in the app; that needs the team.',
  'The app can be used in English or Hindi; switch the language from the button at the top of the Home screen.',
  'To delete your account go to Menu > Settings > Delete my account. Your profile and personal details are erased; chat messages and call recordings are kept for safety and dispute purposes.',

  // ── Finding an astrologer ──
  'The Home screen lists astrologers for chat, audio call and video call. Tap an astrologer to open their profile with experience, languages and reviews.',
  'Each astrologer sets their own per-minute rate, shown on their card and profile.',
  'A red "Unavailable" button means that astrologer has switched that service off right now. "Busy" means they are in another consultation. Choose another astrologer or try again a little later.',
  'Tap the heart on an astrologer\'s profile to add them to Menu > My Favorites.',
  'Live astrologers appear in the Live section of the Home screen. Tap Join Now to watch; you can comment, and report or block someone from the comments.',

  // ── Consultations ──
  'To start a chat or call, open the astrologer and tap Chat, Call or Video. The astrologer gets a request and has about a minute to accept it; if they do not, the request cancels by itself and nothing is charged.',
  'Billing starts only when the chat or call actually connects, and is taken from the wallet minute by minute. The session ends by itself when the wallet balance runs out.',
  'A call or video call needs the microphone (and camera for video) permission; the app asks before the call rings. If a call fails to connect, check the permission and switch between Wi-Fi and mobile data.',
  'In a chat you can send photos (for example a palm or a kundli) and crop, draw or write on them before sending.',
  'Sharing phone numbers, email addresses or links in a chat is not allowed. They are hidden automatically before the other person sees the message.',
  'Past consultations are in Menu > My Sessions, where you can also rate a session. Past chat messages are in Menu > Chat History; it is read-only, so to talk again start a new chat with the astrologer.',
  'Astrologers can send you voice notes after a consultation; they appear in Menu > Voice Notes.',
  'To report or block an astrologer, tap the three dots inside the chat, or report from their profile. Blocked astrologers are listed in Menu > Blocked astrologers, where you can unblock them. Our team reviews every report.',

  // ── Offers ──
  'New customers get one free introductory call with an astrologer. It is claimed from the gift box or the free call offer on the Home screen and can be used once per mobile number, even if the account is deleted and made again.',
  'The free welcome chat for new customers, where it is offered, opens from the offer poster on the Home screen.',
  'Refer A Friend in the menu gives you a referral code to share; the reward comes when your friend signs up with your code and completes their first consultation, not just on downloading the app.',

  // ── Wallet (how-to only) ──
  'The wallet is topped up from the wallet icon at the top of the Home screen or Menu > My Wallet. If topping up does not go through, nothing is taken; try again or use another method.',

  // ── Wani Shop ──
  'The Wani Shop (in the menu, and the circles on the Home screen) sells gemstones, pujas, vastu items, pyramids and astrology reports.',
  'Shop orders and their tracking are in Menu > My Orders. An order moves through: Order placed, Confirmed, Packed, Shipped, Out for delivery, Delivered. A report order shows "being prepared" until it is delivered in the app.',
  'Kundli matching (enter the boy\'s and girl\'s birth details to get a match report) is one of the services listed in the services and Astro Reports sections of the Home screen on Android. On iPhone those services are not shown in the app.',
  'Astrowani\'s blog with articles on astrology is in Menu > Astrowani Blogs.',

  // ── Notifications, support, policies ──
  'Notification choices are in Menu > Settings > Notifications. If notifications do not arrive, check they are allowed for Astrowani in the phone settings and that battery saver is not restricting the app.',
  'Help is in Menu > Support. The assistant answers first and can bring in a person from our team at any time; just ask to talk to a person.',
  'Menu > Settings has the Privacy Policy, Terms of Use, Child Safety, Safety Guidelines and the cancellation policy.',
  'To work on Astrowani as an astrologer, install the separate Astrowani Astrologer app and register there. Our team reviews every application and contacts the astrologer.',
  'Support cannot give astrological readings or predictions. For questions about marriage, career, health, kundli and the like, start a chat or call with an astrologer from the Home screen.',

  // ── How to speak ──
  'TONE: When someone is waiting on us (a reply, a review, an order), reassure them kindly that it is with the team and they will hear back, and that they do not need to do anything again. Never give a date or time.',
];

const VENDOR = [
  // ── Joining ──
  'To join Astrowani as an astrologer: install the Astrowani Astrologer app, tap Register, add a photo (under 5 MB), full name, skills, total experience, gender, languages, email and phone number, verify the OTP, accept the Terms and submit.',
  'After registering, the app shows "Account Under Review". Our team reviews every registration and contacts the astrologer. This can take some time, and there is no need to register again.',
  'While under review, the "Check Approval Status" button on that screen shows the latest status. Once the account is approved, the app opens the dashboard by itself.',
  'Before an account is made active, the team may contact the astrologer for a short interview or an onboarding training session. [team practice, seen in their replies]',
  'If an application is not approved, the app says so; the astrologer can contact support from the app to ask about it.',
  'Logging in uses the registered mobile number and a 6-digit OTP. "No astrologer account found" means that number has not registered yet.',

  // ── Being visible to customers ──
  'Customers can see an astrologer only when the account is approved, not suspended, and the profile is complete: profile photo, full name, email, gender, experience, languages, and a per-minute rate set for at least one of chat, call or video.',
  'A "Complete your profile" banner on the dashboard shows when something is missing. Profile details are filled in from Profile > Edit Profile, which opens once the account is approved; while under review the app shows only the review screen.',
  'Rates are set once from Edit Profile and then lock. After that only the team can change them; ask in Support with the new rates.',
  'Skills chosen at registration show on the profile and can be changed any time from Edit Profile.',
  'A suspended account is hidden from customers and cannot be reached. Only the team can say why; contact Support from the app.',

  // ── Daily work ──
  'The dashboard has an Online/Offline switch. When offline, the astrologer is hidden from new requests everywhere. Separate switches turn chat, call and video on or off.',
  'Requests ring on the phone. A request not answered within about a minute goes to Missed Sessions, which shows today, yesterday, this month and all.',
  'If requests are not ringing, check that notifications are allowed for the app, that battery saver is not restricting it, and that you are Online with at least one service switched on. A red banner on the dashboard warns when notifications are off.',
  'On iPhone, incoming requests ring like a phone call even when the app is closed.',
  'GO LIVE on the dashboard starts a live stream that customers can watch and comment on. Comments can be reported, and a commenter can be blocked.',
  'In a chat the astrologer can send photos, for example a chart with houses circled, and crop, draw or write on them first.',
  'Sharing phone numbers, emails or links in a chat is not allowed. They are hidden automatically, and repeated attempts can get the account flagged.',
  'A customer can be reported or blocked from inside the chat. Blocked customers are listed in Settings, where they can be unblocked.',
  'Session History, Ratings & Reviews, Missed Sessions and Performance (acceptance rate) can all be checked in the app.',
  'Chat History keeps every past conversation. From there the astrologer can send a voice note to a past customer.',
  'My Free Calls lists free introductory calls assigned to the astrologer; ring the customer at the time shown. The free introductory call option is only offered to astrologers selected by the team.',
  'WhatsApp Customers in the menu shows shop customers the WhatsApp assistant has handed to an astrologer.',

  // ── Earnings (how-to only) ──
  'Earnings are in the Wallet screen, and withdrawals are requested from there. A withdrawal needs payout details: a bank account or a UPI ID, added in Edit Profile > Payout Details.',

  // ── Other ──
  'The app can be used in English or Hindi; switch from the menu.',
  'To delete the astrologer account go to Settings > Delete account. Withdraw any earnings before deleting.',
  'Help is in Support in the menu. The assistant answers first and can bring in a person from our team at any time.',

  // ── How to speak ──
  'TONE: When an astrologer is waiting on us (approval, a call from the team, a withdrawal, a change of rates), reassure them kindly that it is with the team and they will be contacted, and that they do not need to register or ask again. Never give a date or time.',
];

module.exports = { CUSTOMER, VENDOR };
