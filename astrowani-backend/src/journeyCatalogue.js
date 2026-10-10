/**
 * EVERY event the customer app fires, in the order a customer actually meets them.
 *
 * WHY THIS FILE EXISTS (owner, 2026-10-10). The Analytics page grew one card per
 * question — a free-call funnel here, a wallet funnel there, a "blocked attempts" card
 * somewhere else — and each card owns its own endpoint and its own HogQL query. That
 * had two consequences:
 *
 *   1. Opening the page fired 26 queries at once, most of them at PostHog, every time
 *      the date range changed. That is the slowness.
 *   2. The app now fires 258 distinct events and those cards between them name about a
 *      quarter. Everything added since — the whole campaign reveal, the rewritten
 *      signup flow, the chosen-astrologer screen, the post-call sheets — simply was not
 *      anywhere on the page.
 *
 * So this is the single source of truth instead: one ordered list, one query, one
 * section. Adding an event to the app means adding ONE LINE here and it appears in the
 * journey, in the right place, with a sentence explaining it.
 *
 * THE ORDER IS THE POINT. Stages run in the sequence a real person experiences them —
 * install → sign up → look around → the free offer → a paid consultation → what happens
 * after. Within a stage, events are listed in the order they can occur. Read top to
 * bottom and it is the story of one customer.
 *
 * FIELDS
 *   event  the exact PostHog event name the app sends — never guessed, extracted from
 *          the app's own captureEvent() calls.
 *   label  what it means, in plain English, for somebody who has not read the code.
 *   drop   true when it represents a customer STOPPING, failing or being refused.
 *          Rendered as a drop-off so a funnel reads correctly instead of counting a
 *          failure as progress.
 *   note   optional extra context where the name alone would mislead.
 */

/** Stages, in journey order. `key` is what the API and the UI group on. */
const STAGES = [
  { key: 'install', title: 'First open — before there is an account', blurb: 'The very first screens after the app is installed, including the Metro ad campaign\'s gift reveal.' },
  { key: 'signup', title: 'Creating the account', blurb: 'Phone number, OTP, name, and the welcome screen.' },
  { key: 'login', title: 'Coming back and signing in', blurb: 'An existing customer returning to the app.' },
  { key: 'profile', title: 'Birth details and profile', blurb: 'What we ask for before a reading can happen, and where people give up.' },
  { key: 'home', title: 'Looking around the app', blurb: 'Home screen, search, browsing astrologers, banners.' },
  { key: 'free_call', title: 'The free introductory call', blurb: 'Both flows: booking a slot, and ringing an astrologer instantly — including the campaign\'s single chosen astrologer.' },
  { key: 'free_chat', title: 'The free chat', blurb: 'The free 5-minute chat offer and the AI assistant.' },
  { key: 'free_services', title: 'Free tools and ₹1 services', blurb: 'Horoscope, panchang, kundali and the other self-serve tools.' },
  { key: 'consult', title: 'A paid consultation', blurb: 'Asking for a chat, call or video with an astrologer, and whether it connected.' },
  { key: 'post_call', title: 'After the consultation ends', blurb: 'The sheets that appear once a call finishes: Shagun, more minutes, ratings.' },
  { key: 'wallet', title: 'Wallet and recharge', blurb: 'Putting money in, and where payments fall over.' },
  { key: 'shop', title: 'Wani Shop — remedies and orders', blurb: 'Browsing products, the cart, checkout and what happened to the order.' },
  { key: 'reports', title: 'Astro reports', blurb: 'Paid written reports.' },
  { key: 'live', title: 'Live streams', blurb: 'Watching an astrologer live, commenting and gifting.' },
  { key: 'engagement', title: 'Coming back — notifications, referrals, reviews', blurb: 'Everything that pulls a customer back or asks them for something.' },
  { key: 'support', title: 'Support', blurb: 'When a customer needed help.' },
  { key: 'account', title: 'Settings, updates and leaving', blurb: 'Account management, forced updates, and deletion.' },
];

const EVENTS = [
  /* ── 1. First open ─────────────────────────────────────────────────────── */
  { stage: 'install', event: 'campaign_gift_reveal_shown', label: 'Metro campaign: the closed gift box appeared on the very first screen after install' },
  { stage: 'install', event: 'campaign_gift_reveal_opened', label: 'Metro campaign: tapped the box open and saw "YOU WIN — 11 minute free call"' },
  { stage: 'install', event: 'campaign_gift_reveal_abandoned', label: 'Metro campaign: left the app WITHOUT ever tapping the gift box open', drop: true, note: 'The most expensive drop-off on a paid install — they saw an unopened present and walked away.' },
  { stage: 'install', event: 'campaign_gift_reveal_accepted', label: 'Metro campaign: tapped "Yes! I want my free call"' },
  { stage: 'install', event: 'campaign_gift_reveal_closed', label: 'Metro campaign: pressed the ✕ on the reveal instead of accepting', drop: true },
  { stage: 'install', event: 'campaign_gift_reveal_collapsed', label: 'Metro campaign: watched the gift fold into the corner bubble to keep for later', drop: true },
  { stage: 'install', event: 'campaign_gift_bubble_tapped', label: 'Metro campaign: came back and tapped the gift bubble in the corner' },
  { stage: 'install', event: 'campaign_gift_bubble_claimed', label: 'Metro campaign: claimed the free call from that corner bubble' },
  { stage: 'install', event: 'campaign_free_call_prompt_shown', label: 'Older campaign prompt (speech-bubble version) appeared', note: 'The variant the gift reveal replaced. Only older installs still fire this.' },
  { stage: 'install', event: 'campaign_free_call_prompt_accepted', label: 'Older campaign prompt: accepted the free call' },
  { stage: 'install', event: 'campaign_free_call_prompt_closed', label: 'Older campaign prompt: closed without accepting', drop: true },
  { stage: 'install', event: 'campaign_free_call_auto_opened', label: 'Campaign customer was taken straight into the free call after signing up' },

  /* ── 2. Signup ─────────────────────────────────────────────────────────── */
  { stage: 'signup', event: 'login_screen_viewed', label: 'Reached the phone-number screen' },
  { stage: 'signup', event: 'login_submit_tapped', label: 'Tapped Continue after typing a phone number' },
  { stage: 'signup', event: 'login_validation_failed', label: 'The phone number was rejected before it was sent (too short, wrong format)', drop: true },
  { stage: 'signup', event: 'signup_otp_sent', label: 'New number: the OTP was sent' },
  { stage: 'signup', event: 'signup_otp_already_sent', label: 'New number: an OTP had already been sent and was still valid' },
  { stage: 'signup', event: 'otp_screen_viewed', label: 'Reached the "enter the 6-digit code" screen' },
  { stage: 'signup', event: 'otp_autofilled_from_sms', label: 'The code was read from the SMS automatically — no typing needed' },
  { stage: 'signup', event: 'otp_verify_tapped', label: 'Submitted the OTP' },
  { stage: 'signup', event: 'otp_resend_tapped', label: 'Asked for the code to be sent again' },
  { stage: 'signup', event: 'otp_resent', label: 'A replacement code was sent' },
  { stage: 'signup', event: 'otp_resend_failed', label: 'Asked for a new code and it could not be sent', drop: true },
  { stage: 'signup', event: 'otp_verify_blocked', label: 'The OTP was refused — wrong or expired', drop: true },
  { stage: 'signup', event: 'otp_attempts_exceeded', label: 'Entered the wrong OTP too many times and was locked out', drop: true },
  { stage: 'signup', event: 'otp_back_tapped', label: 'Backed out of the OTP screen', drop: true },
  { stage: 'signup', event: 'signup_otp_verified', label: 'The number was verified — the account now exists' },
  { stage: 'signup', event: 'signup_name_screen_viewed', label: 'Reached "what should we call you?"' },
  { stage: 'signup', event: 'signup_name_saved', label: 'Gave their name' },
  { stage: 'signup', event: 'signup_name_save_failed', label: 'Gave a name but it could not be saved', drop: true },
  { stage: 'signup', event: 'signup_welcome_viewed', label: 'Reached the welcome screen that follows signup' },
  { stage: 'signup', event: 'signup_welcome_hi_tapped', label: 'Moved on from the welcome screen into the app' },
  { stage: 'signup', event: 'signup_welcome_leave_confirm_shown', label: 'Tried to back out of the welcome screen while the free-call card was showing' },
  { stage: 'signup', event: 'signup_welcome_leave_cancelled', label: 'Was asked "are you sure?" on the way out and stayed' },
  { stage: 'signup', event: 'signup_completed', label: 'Signup finished end to end' },
  { stage: 'signup', event: 'signup_failed', label: 'Signup failed', drop: true },
  { stage: 'signup', event: 'signup_step_blocked', label: 'A signup step refused to continue', drop: true },
  { stage: 'signup', event: 'referral_code_applied', label: 'Entered a friend\'s referral code during signup' },
  { stage: 'signup', event: 'referral_code_rejected', label: 'Entered a referral code that was not valid', drop: true },

  /* ── 3. Login ──────────────────────────────────────────────────────────── */
  { stage: 'login', event: 'login_otp_sent', label: 'Existing number: the OTP was sent' },
  { stage: 'login', event: 'login_otp_already_sent', label: 'Existing number: a code had already been sent and was still valid' },
  { stage: 'login', event: 'login_completed', label: 'Signed back in' },
  { stage: 'login', event: 'login_failed', label: 'Sign-in failed', drop: true },
  { stage: 'login', event: 'login_welcome_viewed', label: 'Saw the short "welcome back" greeting' },
  { stage: 'login', event: 'logout', label: 'Signed out', drop: true },

  /* ── 4. Profile / birth details ────────────────────────────────────────── */
  { stage: 'profile', event: 'birth_details_screen_viewed', label: 'Was asked for birth details (date, time, place)' },
  { stage: 'profile', event: 'birth_details_saved', label: 'Gave their birth details' },
  { stage: 'profile', event: 'birth_details_abandoned', label: 'Opened the birth-details form and left without finishing', drop: true },
  { stage: 'profile', event: 'birth_details_save_failed', label: 'Filled the birth-details form but it could not be saved', drop: true },
  { stage: 'profile', event: 'birth_details_step_blocked', label: 'A birth-details step refused to continue', drop: true },
  { stage: 'profile', event: 'profile_gate_blocked', label: 'Tried to do something that needs birth details and was stopped to fill them in', drop: true },
  { stage: 'profile', event: 'profile_save_tapped', label: 'Tapped save on their profile' },
  { stage: 'profile', event: 'profile_saved', label: 'Profile saved' },
  { stage: 'profile', event: 'profile_save_failed', label: 'Profile could not be saved', drop: true },
  { stage: 'profile', event: 'profile_validation_failed', label: 'Profile form rejected what was typed', drop: true },
  { stage: 'profile', event: 'profile_tab_switched', label: 'Moved between tabs on the profile screen' },
  { stage: 'profile', event: 'language_toggled', label: 'Switched the app between English and Hindi' },

  /* ── 5. Looking around ─────────────────────────────────────────────────── */
  { stage: 'home', event: 'home_screen_click', label: 'Tapped something on the Home screen' },
  { stage: 'home', event: 'header_tapped', label: 'Tapped something in the top bar (wallet, bell, language)' },
  { stage: 'home', event: 'banner_impression', label: 'A promotional banner was shown' },
  { stage: 'home', event: 'banner_click', label: 'Tapped a promotional banner' },
  { stage: 'home', event: 'search_performed', label: 'Searched for an astrologer' },
  { stage: 'home', event: 'search_result_tapped', label: 'Opened something from the search results' },
  { stage: 'home', event: 'most_searched_tapped', label: 'Tapped one of the "most searched" suggestions' },
  { stage: 'home', event: 'astrologer_profile_viewed', label: 'Opened an astrologer\'s profile' },
  { stage: 'home', event: 'favorite_toggled', label: 'Added or removed an astrologer from favourites' },
  { stage: 'home', event: 'favorite_astrologer_opened', label: 'Opened an astrologer from their favourites' },
  { stage: 'home', event: 'favorite_toggle_failed', label: 'Tried to favourite an astrologer and it failed', drop: true },
  { stage: 'home', event: 'drawer_item_tapped', label: 'Opened something from the side menu' },
  { stage: 'home', event: 'consult_cta_click', label: 'Tapped a "consult now" button somewhere in the app' },
  { stage: 'home', event: 'guide_avatar_tapped', label: 'Tapped the guide character' },
  { stage: 'home', event: 'mascot_tip_shown', label: 'A guide tip appeared' },
  { stage: 'home', event: 'mascot_tip_action', label: 'Acted on a guide tip' },
  { stage: 'home', event: 'mascot_tip_dismissed', label: 'Dismissed a guide tip', drop: true },
  { stage: 'home', event: 'mascot_tips_turned_off', label: 'Turned the guide tips off entirely', drop: true },
  { stage: 'home', event: 'guide_hint_dismissed', label: 'Dismissed a guide hint', drop: true },

  /* ── 6. The free introductory call ─────────────────────────────────────── */
  { stage: 'free_call', event: 'free_call_offer_shown', label: 'The free-call offer card was shown' },
  { stage: 'free_call', event: 'free_call_claim_tapped', label: 'Tapped "Claim my free call"' },
  { stage: 'free_call', event: 'free_call_offer_dismissed', label: 'Closed the free-call offer without claiming it', drop: true },
  { stage: 'free_call', event: 'free_call_gift_bubble_tapped', label: 'Tapped the gift bubble on Home that reopens the offer' },
  { stage: 'free_call', event: 'free_call_invite_opened', label: 'Opened the offer from an invite notification we sent' },
  { stage: 'free_call', event: 'low_balance_free_call_tapped', label: 'Was short of wallet balance and took the free call instead' },
  { stage: 'free_call', event: 'free_call_birth_details_auto_opened', label: 'Was asked for birth details before the free call could start' },
  { stage: 'free_call', event: 'free_call_already_booked', label: 'Tried to claim a free call they had already used', drop: true },
  { stage: 'free_call', event: 'free_call_declined', label: 'Declined the free call when offered', drop: true },
  // Booking (scheduled) flow
  { stage: 'free_call', event: 'free_call_slots_opened', label: 'Booking flow: opened the list of time slots' },
  { stage: 'free_call', event: 'free_call_date_selected', label: 'Booking flow: picked a date' },
  { stage: 'free_call', event: 'free_call_slot_selected', label: 'Booking flow: picked a time' },
  { stage: 'free_call', event: 'free_call_booked', label: 'Booking flow: booked the slot' },
  { stage: 'free_call', event: 'free_call_booking_failed', label: 'Booking flow: the booking failed', drop: true },
  { stage: 'free_call', event: 'free_call_confirmed_done', label: 'Booking flow: closed the confirmation screen' },
  { stage: 'free_call', event: 'free_call_answered', label: 'Booking flow: answered when the astrologer called at the booked time' },
  // Instant flow (and the campaign's chosen astrologer)
  { stage: 'free_call', event: 'free_call_instant_opened', label: 'Instant flow: opened the list of astrologers to ring' },
  { stage: 'free_call', event: 'free_call_instant_opened_from_card', label: 'Instant flow: went straight to the astrologers in one tap from the offer card' },
  { stage: 'free_call', event: 'free_call_chosen_shown', label: 'Metro campaign: saw the single chosen astrologer ("This astrologer has been chosen for you")' },
  { stage: 'free_call', event: 'free_call_chosen_offline', label: 'Metro campaign: the chosen astrologer was offline — a dead end', drop: true },
  { stage: 'free_call', event: 'free_call_instant_ring', label: 'Rang an astrologer\'s phone for the free call' },
  { stage: 'free_call', event: 'free_call_instant_answered', label: 'The astrologer picked up and the free call began' },
  { stage: 'free_call', event: 'free_call_instant_rejected', label: 'The astrologer declined the call', drop: true },
  { stage: 'free_call', event: 'free_call_instant_no_answer', label: 'Nobody answered before the ring timed out', drop: true },
  { stage: 'free_call', event: 'free_call_instant_notify_me', label: 'Gave up ringing and joined the "tell me when they are free" list', drop: true },
  { stage: 'free_call', event: 'free_call_left_without_calling', label: 'Left the astrologer screen without ringing anyone', drop: true },
  { stage: 'free_call', event: 'free_call_feedback', label: 'Gave feedback about the free call afterwards' },

  /* ── 7. Free chat ──────────────────────────────────────────────────────── */
  { stage: 'free_chat', event: 'free_chat_offer_shown', label: 'The free 5-minute chat offer was shown' },
  { stage: 'free_chat', event: 'free_chat_offer_accepted', label: 'Accepted the free chat offer' },
  { stage: 'free_chat', event: 'free_chat_offer_dismissed', label: 'Closed the free chat offer', drop: true },
  { stage: 'free_chat', event: 'free_bot_chat_started', label: 'Started the free assistant chat' },
  { stage: 'free_chat', event: 'free_bot_chat_message_sent', label: 'Sent a message in the free assistant chat' },
  { stage: 'free_chat', event: 'free_bot_chat_ai_fallback', label: 'The assistant fell back to a generic answer' },
  { stage: 'free_chat', event: 'free_bot_chat_ended', label: 'The free assistant chat ended' },

  /* ── 8. Free tools and ₹1 services ─────────────────────────────────────── */
  { stage: 'free_services', event: 'free_service_tile_tapped', label: 'Tapped one of the free-service tiles' },
  { stage: 'free_services', event: 'free_service_tapped', label: 'Opened a free service' },
  { stage: 'free_services', event: 'free_service_profile_autofilled', label: 'Their saved birth details filled the form automatically' },
  { stage: 'free_services', event: 'free_service_submitted', label: 'Submitted a free-service form' },
  { stage: 'free_services', event: 'free_service_purchased', label: 'Paid for a ₹1 service' },
  { stage: 'free_services', event: 'free_service_declined', label: 'Backed out of a free service', drop: true },
  { stage: 'free_services', event: 'free_service_blocked', label: 'A free service refused to run', drop: true },
  { stage: 'free_services', event: 'free_service_failed', label: 'A free service failed to produce a result', drop: true },
  { stage: 'free_services', event: 'horoscope_sign_selected', label: 'Picked a zodiac sign for the horoscope' },
  { stage: 'free_services', event: 'horoscope_details_opened', label: 'Read a full horoscope' },
  { stage: 'free_services', event: 'panchang_viewed', label: 'Opened the panchang' },
  { stage: 'free_services', event: 'kundali_match_report_opened', label: 'Opened a kundali-matching result' },
  { stage: 'free_services', event: 'blog_opened', label: 'Read a blog article' },
  { stage: 'free_services', event: 'blog_language_switched', label: 'Switched a blog article\'s language' },
  { stage: 'free_services', event: 'faq_opened', label: 'Opened the FAQ' },

  /* ── 9. A paid consultation ────────────────────────────────────────────── */
  { stage: 'consult', event: 'chat_initiated', label: 'Asked an astrologer for a chat' },
  { stage: 'consult', event: 'chat_started', label: 'The chat actually started' },
  { stage: 'consult', event: 'chat_ended', label: 'The chat ended' },
  { stage: 'consult', event: 'chat_resumed_after_relaunch', label: 'Reopened the app and went back into a chat that was still running' },
  { stage: 'consult', event: 'chat_history_thread_opened', label: 'Opened an old chat from their history' },
  { stage: 'consult', event: 'call_initiated', label: 'Asked an astrologer for a call' },
  { stage: 'consult', event: 'call_connected', label: 'The call connected' },
  { stage: 'consult', event: 'call_ended', label: 'The call ended' },
  { stage: 'consult', event: 'consult_blocked', label: 'Tried to start a consultation and was stopped (low balance, astrologer busy, service off)', drop: true },
  { stage: 'consult', event: 'request_cancelled_by_customer', label: 'Cancelled their own request while it was still ringing', drop: true },
  { stage: 'consult', event: 'session_intro_banner_dismissed', label: 'Dismissed the in-session intro banner' },
  { stage: 'consult', event: 'session_view_profile_tapped', label: 'Opened the astrologer\'s profile from inside a session' },
  { stage: 'consult', event: 'session_rate_tapped', label: 'Tapped to rate from inside a session' },
  { stage: 'consult', event: 'my_sessions_tab_switched', label: 'Switched tabs on the My Sessions screen' },
  { stage: 'consult', event: 'voice_notes_banner_tapped', label: 'Tapped the voice-notes banner' },
  { stage: 'consult', event: 'voice_note_play_toggled', label: 'Played or paused a voice note' },

  /* ── 10. After the consultation ────────────────────────────────────────── */
  { stage: 'post_call', event: 'shagun_dakshina_shown', label: 'The Shagun Arpan thank-you sheet appeared after the call' },
  { stage: 'post_call', event: 'shagun_dakshina_paid', label: 'Paid a Shagun amount — the astrologer was tipped' },
  { stage: 'post_call', event: 'shagun_dakshina_dismissed', label: 'Closed the Shagun sheet without paying', drop: true },
  { stage: 'post_call', event: 'shagun_dakshina_failed', label: 'Tried to pay Shagun and the payment failed', drop: true },
  { stage: 'post_call', event: 'shagun_dakshina_skipped', label: 'The Shagun sheet was skipped automatically without being seen', drop: true },
  { stage: 'post_call', event: 'dakshina_shown', label: 'The older Dakshina sheet appeared' },
  { stage: 'post_call', event: 'dakshina_paid', label: 'Paid through the older Dakshina sheet' },
  { stage: 'post_call', event: 'dakshina_dismissed', label: 'Closed the older Dakshina sheet', drop: true },
  { stage: 'post_call', event: 'dakshina_failed', label: 'Dakshina payment failed', drop: true },
  { stage: 'post_call', event: 'dakshina_skipped', label: 'The Dakshina sheet was skipped automatically', drop: true },
  { stage: 'post_call', event: 'free_call_continue_shown', label: '"Buy more minutes with this astrologer" appeared' },
  { stage: 'post_call', event: 'free_call_continue_options_opened', label: 'Tapped "yes, I want more time" to see the prices' },
  { stage: 'post_call', event: 'free_call_continue_started', label: 'Picked a price and opened the payment screen' },
  { stage: 'post_call', event: 'free_call_continue_paid', label: 'Paid for extra minutes' },
  { stage: 'post_call', event: 'free_call_continue_paid_but_busy', label: 'Paid for extra minutes but the astrologer had become busy', drop: true },
  { stage: 'post_call', event: 'free_call_continue_recovered', label: 'A stuck "more minutes" purchase was recovered' },
  { stage: 'post_call', event: 'free_call_continue_dismissed', label: 'Closed "buy more minutes" without buying', drop: true },
  { stage: 'post_call', event: 'free_call_continue_expired', label: 'Left "buy more minutes" open until it timed out', drop: true },
  { stage: 'post_call', event: 'free_call_continue_nothing_to_sell', label: 'The "more minutes" sheet had nothing available to offer', drop: true },
  { stage: 'post_call', event: 'review_prompt_shown', label: 'Was asked to review the astrologer' },
  { stage: 'post_call', event: 'review_rating_selected', label: 'Picked a star rating for the astrologer' },
  { stage: 'post_call', event: 'review_submitted', label: 'Left a review for the astrologer' },
  { stage: 'post_call', event: 'review_prompt_dismissed', label: 'Closed the review prompt without reviewing', drop: true },
  { stage: 'post_call', event: 'review_submit_failed', label: 'Tried to leave a review and it failed', drop: true },
  { stage: 'post_call', event: 'review_validation_failed', label: 'The review form rejected what was written', drop: true },
  { stage: 'post_call', event: 'review_not_eligible', label: 'Was not eligible to review' },
  { stage: 'post_call', event: 'rate_astrowani_shown', label: 'Was asked to rate Astrowani itself' },
  { stage: 'post_call', event: 'rate_astrowani_dismissed', label: 'Closed the "rate Astrowani" sheet', drop: true },

  /* ── 11. Wallet ────────────────────────────────────────────────────────── */
  { stage: 'wallet', event: 'wallet_viewed', label: 'Opened the wallet' },
  { stage: 'wallet', event: 'wallet_history_viewed', label: 'Looked at their wallet history' },
  { stage: 'wallet', event: 'wallet_history_add_money_tapped', label: 'Tapped "add money" from the history screen' },
  { stage: 'wallet', event: 'low_balance_recharge_tapped', label: 'Was short of balance and chose to recharge' },
  { stage: 'wallet', event: 'recharge_amount_selected', label: 'Picked a recharge amount' },
  { stage: 'wallet', event: 'recharge_invalid_amount', label: 'Typed a recharge amount that was not allowed', drop: true },
  { stage: 'wallet', event: 'payment_method_selected', label: 'Chose a payment method' },
  { stage: 'wallet', event: 'recharge_started', label: 'Opened the payment screen to recharge' },
  { stage: 'wallet', event: 'wallet_recharged', label: 'The recharge succeeded — money is in the wallet' },
  { stage: 'wallet', event: 'recharge_failed', label: 'The recharge failed', drop: true },

  /* ── 12. Wani Shop ─────────────────────────────────────────────────────── */
  { stage: 'shop', event: 'remedy_category_tapped', label: 'Opened a shop category' },
  { stage: 'shop', event: 'remedy_blocked_category_tapped', label: 'Tapped a category that is not available', drop: true },
  { stage: 'shop', event: 'product_opened', label: 'Opened a product' },
  { stage: 'shop', event: 'add_to_cart', label: 'Added something to the cart' },
  { stage: 'shop', event: 'cart_viewed', label: 'Opened the cart' },
  { stage: 'shop', event: 'cart_quantity_changed', label: 'Changed a quantity in the cart' },
  { stage: 'shop', event: 'cart_empty_shop_tapped', label: 'Had an empty cart and went back to browsing' },
  { stage: 'shop', event: 'cart_address_opened', label: 'Opened the address step' },
  { stage: 'shop', event: 'address_add_tapped', label: 'Started adding a delivery address' },
  { stage: 'shop', event: 'address_added', label: 'Saved a delivery address' },
  { stage: 'shop', event: 'address_edit_tapped', label: 'Edited an address' },
  { stage: 'shop', event: 'address_delete_tapped', label: 'Deleted an address' },
  { stage: 'shop', event: 'address_selected', label: 'Chose which address to deliver to' },
  { stage: 'shop', event: 'checkout_started', label: 'Started checkout' },
  { stage: 'shop', event: 'order_placed', label: 'Placed the order' },
  { stage: 'shop', event: 'order_confirmed', label: 'The order was confirmed' },
  { stage: 'shop', event: 'order_payment_failed', label: 'The order payment failed', drop: true },
  { stage: 'shop', event: 'order_success_cta', label: 'Tapped the button on the order-success screen' },
  { stage: 'shop', event: 'my_orders_viewed', label: 'Looked at their orders' },
  { stage: 'shop', event: 'order_cancel_tapped', label: 'Started cancelling an order' },
  { stage: 'shop', event: 'order_cancelled', label: 'Cancelled an order', drop: true },
  { stage: 'shop', event: 'order_cancel_abandoned', label: 'Started cancelling an order and changed their mind' },
  { stage: 'shop', event: 'order_cancel_failed', label: 'Tried to cancel an order and it failed', drop: true },
  { stage: 'shop', event: 'remedy_whatsapp_handoff', label: 'Was handed over to WhatsApp for a remedy' },
  { stage: 'shop', event: 'store_webview_fallback_tapped', label: 'Fell back to the web shop' },

  /* ── 13. Astro reports ─────────────────────────────────────────────────── */
  { stage: 'reports', event: 'astro_reports_list_click', label: 'Opened the reports list' },
  { stage: 'reports', event: 'astro_report_submitted', label: 'Submitted the form for a report' },
  { stage: 'reports', event: 'astro_report_purchase_confirmed', label: 'Paid for a report' },
  { stage: 'reports', event: 'astro_report_generated', label: 'The report was produced' },
  { stage: 'reports', event: 'astro_report_blocked', label: 'A report was refused', drop: true },
  { stage: 'reports', event: 'astro_report_failed', label: 'A report failed to generate', drop: true },
  { stage: 'reports', event: 'report_language_switched', label: 'Switched the report language' },

  /* ── 14. Live ──────────────────────────────────────────────────────────── */
  { stage: 'live', event: 'live_screen_viewed', label: 'Opened the Live tab' },
  { stage: 'live', event: 'live_join_tapped', label: 'Tapped to join a live stream' },
  { stage: 'live', event: 'live_viewer_joined', label: 'Joined a live stream' },
  { stage: 'live', event: 'live_stream_connected', label: 'The live video actually connected' },
  { stage: 'live', event: 'live_comment_sent', label: 'Commented on a live stream' },
  { stage: 'live', event: 'live_comment_blocked', label: 'A comment was blocked by moderation', drop: true },
  { stage: 'live', event: 'live_gift_opened', label: 'Opened the gift sheet during a live stream' },
  { stage: 'live', event: 'live_left', label: 'Left a live stream', drop: true },
  { stage: 'live', event: 'live_aarti_youtube_opened', label: 'Opened the live aarti on YouTube' },
  { stage: 'live', event: 'gift_tapped', label: 'Tapped to send a gift' },
  { stage: 'live', event: 'gift_modal_opened', label: 'Opened the gift picker' },
  { stage: 'live', event: 'gift_selected', label: 'Chose a gift' },
  { stage: 'live', event: 'gift_sent', label: 'Sent a gift' },
  { stage: 'live', event: 'gift_declined', label: 'Backed out of sending a gift', drop: true },
  { stage: 'live', event: 'gift_blocked', label: 'A gift was refused', drop: true },
  { stage: 'live', event: 'gift_failed', label: 'A gift payment failed', drop: true },
  { stage: 'live', event: 'gift_modal_closed', label: 'Closed the gift picker without sending', drop: true },

  /* ── 15. Coming back ───────────────────────────────────────────────────── */
  { stage: 'engagement', event: 'notification_opened', label: 'Opened the app from a notification' },
  { stage: 'engagement', event: 'notifications_mark_all_read', label: 'Marked all notifications read' },
  { stage: 'engagement', event: 'referral_screen_viewed', label: 'Opened the refer-a-friend screen' },
  { stage: 'engagement', event: 'referral_prompt_shown', label: 'Was prompted to refer a friend' },
  { stage: 'engagement', event: 'referral_code_copied', label: 'Copied their referral code' },
  { stage: 'engagement', event: 'referral_shared', label: 'Shared their referral code' },
  { stage: 'engagement', event: 'referral_share_failed', label: 'Tried to share a referral and it failed', drop: true },
  { stage: 'engagement', event: 'referral_prompt_dismissed', label: 'Dismissed the referral prompt', drop: true },
  { stage: 'engagement', event: 'app_shared', label: 'Shared the app with somebody' },
  { stage: 'engagement', event: 'app_share_failed', label: 'Tried to share the app and it failed', drop: true },
  { stage: 'engagement', event: 'rate_app_prompt_shown', label: 'Was asked to rate the app on the store' },
  { stage: 'engagement', event: 'rate_app_prompt_accepted', label: 'Agreed to rate the app' },
  { stage: 'engagement', event: 'rate_app_prompt_dismissed', label: 'Declined to rate the app', drop: true },
  { stage: 'engagement', event: 'app_rating_store_opened', label: 'The store page opened for a rating' },
  { stage: 'engagement', event: 'app_rated', label: 'Rated the app' },

  /* ── 16. Support ───────────────────────────────────────────────────────── */
  { stage: 'support', event: 'support_conversation_started', label: 'Started a support conversation' },
  { stage: 'support', event: 'support_conversation_opened', label: 'Reopened a support conversation' },
  { stage: 'support', event: 'support_message_sent', label: 'Sent a support message' },
  { stage: 'support', event: 'support_escalated_to_human', label: 'Was escalated to a human agent' },
  { stage: 'support', event: 'support_escalation_failed', label: 'Escalation to a human failed', drop: true },
  { stage: 'support', event: 'support_rated', label: 'Rated the support they got' },

  /* ── 17. Account, updates, leaving ─────────────────────────────────────── */
  { stage: 'account', event: 'settings_item_tapped', label: 'Opened something in Settings' },
  { stage: 'account', event: 'legal_link_opened', label: 'Opened a legal page (terms, privacy, refunds)' },
  { stage: 'account', event: 'app_update_prompt_shown', label: 'Was told a new version is available' },
  { stage: 'account', event: 'app_update_prompt_accepted', label: 'Went to the store to update' },
  { stage: 'account', event: 'app_update_prompt_dismissed', label: 'Dismissed the update prompt', drop: true },
  { stage: 'account', event: 'app_update_forced_back_pressed', label: 'Tried to back out of a forced update', drop: true },
  { stage: 'account', event: 'account_delete_tapped', label: 'Started deleting their account', drop: true },
  { stage: 'account', event: 'account_deleted', label: 'Deleted their account', drop: true },
  { stage: 'account', event: 'account_delete_failed', label: 'Tried to delete their account and it failed' },
];

module.exports = { STAGES, EVENTS };
