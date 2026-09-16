// Ad-platform conversion tracking: Meta (react-native-fbsdk-next) and Google Ads (via
// Firebase Analytics, which Google Ads imports conversions from).
//
// WHY THIS EXISTS: without it an ad network can only count installs. With it, it learns
// which installs went on to sign up, PAY and actually consult an astrologer, and
// optimises delivery toward people like them.
//
// HOW EVENTS GET HERE: nothing calls this directly. captureEvent() in Analytics.js
// forwards every PostHog event (release builds only) to forwardToAdPlatforms(), and
// AD_EVENT_MAP below picks the handful that matter to an ad network. That keeps the
// instrumentation in the one place that already sits at the right choke points (see
// CLAUDE.md subsystems S/T) instead of a second set of calls across many screens.
// ⚠ If you RENAME or remove one of the PostHog events named in AD_EVENT_MAP, update the
// map in the same commit, or the ad conversion silently stops being reported.
//
// WHAT IS NEVER SENT: only event names, rupee amounts and a coarse type. No phone
// number, name, birth details, astrologer id, order/session id or chat content. Each
// mapping builds its params from scratch rather than passing PostHog's properties
// through, so a property added to a PostHog event later cannot leak by accident.
//
// SAFE ON OLD BUILDS: this ships over OTA to builds without the native SDKs (build 37
// and older). Both packages read NativeModules and misbehave without the native side,
// so each is required only after its native module is confirmed present, and every call
// is wrapped. Tracking must never crash the app.
//
// ANDROID ONLY FOR NOW: both packages are excluded from iOS autolinking
// (react-native.config.js). iOS needs Apple's App Tracking Transparency prompt first,
// and is not in the App Store yet.
import { NativeModules, Platform } from 'react-native';

// ── Meta ──────────────────────────────────────────────────────────────────────────
// Public identifiers (they ship inside every APK, same trust level as the PostHog key).
// Must match android/app/src/main/res/values/strings.xml. While either is still a
// placeholder the Meta SDK is never initialised and nothing is sent to Meta.
const META_APP_ID = '28499438753050213';
const META_CLIENT_TOKEN = '5424bb793f70c681a2b4f956a7dc6bd9';

const metaConfigured =
  !META_APP_ID.startsWith('REPLACE_WITH_') && !META_CLIENT_TOKEN.startsWith('REPLACE_WITH_');

let fbsdk = null;
let metaReady = false;

// ── Google (Firebase Analytics) ───────────────────────────────────────────────────
// Needs no ids here: it uses the Firebase project already configured for push
// (android/app/google-services.json). Firebase also collects first_open / session_start
// on its own, from every build — that is what Google Ads counts as an install.
let firebaseAnalytics = null;
let googleReady = false;

function onAndroid() {
  return Platform.OS === 'android';
}

export function initAdTracking() {
  if (!onAndroid()) return;

  if (!metaReady && metaConfigured && NativeModules.FBAppEventsLogger && NativeModules.FBSettings) {
    try {
      fbsdk = require('react-native-fbsdk-next');
      // The manifest sets AutoInitEnabled=false, so the native SDK sends nothing until
      // this runs — which is what makes the placeholder state above inert.
      fbsdk.Settings.setAdvertiserIDCollectionEnabled(true);
      fbsdk.Settings.setAutoLogAppEventsEnabled(true); // install + app-open, for attribution
      fbsdk.Settings.initializeSDK();
      metaReady = true;
    } catch (_) {
      metaReady = false;
    }
  }

  if (!googleReady && NativeModules.RNFBAnalyticsModule) {
    try {
      firebaseAnalytics = require('@react-native-firebase/analytics');
      firebaseAnalytics.getAnalytics(); // throws here, not later, if Firebase is unusable
      googleReady = true;
    } catch (_) {
      googleReady = false;
    }
  }
}

// ── What gets reported ────────────────────────────────────────────────────────────
// PostHog event name -> what an ad network should see. Return null to send nothing.
const AD_EVENT_MAP = {
  // Account created and OTP verified. login_completed is deliberately NOT mapped: a
  // returning customer logging in again is not a new conversion.
  signup_completed: () => ({ type: 'registration' }),

  // Real money in. Fires only after the backend verified the Razorpay signature.
  wallet_recharged: (p) => ({ type: 'purchase', amount: p.amount, purchaseType: 'wallet_recharge' }),

  // A shop order is new money ONLY when paid through Razorpay. A wallet-paid order spends
  // money already reported as a purchase at recharge — reporting it again would double
  // count revenue and make every campaign look better than it is. (Reports and gifts
  // are never mapped for the same reason: they are paid from the wallet.)
  order_placed: (p) =>
    p.payment_method === 'razorpay'
      ? { type: 'purchase', amount: p.grand_total, purchaseType: 'remedy_order' }
      : null,

  // A consultation that actually CONNECTED — the call reached in_call, or the astrologer
  // opened the chat session. Deliberately not call_initiated/chat_initiated: most
  // requests are never answered (measured 39% accept rate), so optimising for requests
  // would teach the ad networks mostly from consultations that never happened.
  call_connected: (p) => ({
    type: 'consultation',
    consultationType: p.call_type === 'video' ? 'video' : 'audio',
    dedupeKey: p.session_id,
  }),
  chat_started: (p) => ({ type: 'consultation', consultationType: 'chat', dedupeKey: p.session_id }),
};

// chat_started fires again if the chat screen is reopened for the same live session
// (e.g. from the ongoing-session notification). One consultation must count once.
const reportedSessions = new Set();

function sendToMeta(evt) {
  if (!metaReady) return;
  const { AppEventsLogger } = fbsdk;
  if (evt.type === 'registration') {
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, {
      [AppEventsLogger.AppEventParams.RegistrationMethod]: 'phone_otp',
    });
  } else if (evt.type === 'purchase') {
    AppEventsLogger.logPurchase(evt.amount, 'INR', {
      [AppEventsLogger.AppEventParams.ContentType]: evt.purchaseType,
    });
  } else if (evt.type === 'consultation') {
    AppEventsLogger.logEvent('ConsultationConnected', { consultation_type: evt.consultationType });
  }
}

function sendToGoogle(evt) {
  if (!googleReady) return;
  const { getAnalytics, logEvent, logSignUp, logPurchase } = firebaseAnalytics;
  const analytics = getAnalytics();
  // Firebase calls return promises; a rejection must not surface as an unhandled one.
  const quiet = (p) => p && typeof p.catch === 'function' && p.catch(() => {});
  if (evt.type === 'registration') {
    quiet(logSignUp(analytics, { method: 'phone_otp' }));
  } else if (evt.type === 'purchase') {
    quiet(logPurchase(analytics, { value: evt.amount, currency: 'INR', purchase_type: evt.purchaseType }));
  } else if (evt.type === 'consultation') {
    quiet(logEvent(analytics, 'consultation_connected', { consultation_type: evt.consultationType }));
  }
}

export function forwardToAdPlatforms(name, properties) {
  try {
    const build = AD_EVENT_MAP[name];
    if (!build) return;
    const evt = build(properties || {});
    if (!evt) return;

    if (evt.type === 'purchase') {
      const amount = Number(evt.amount);
      if (!Number.isFinite(amount) || amount <= 0) return;
      evt.amount = amount;
    }
    if (evt.dedupeKey) {
      if (reportedSessions.has(evt.dedupeKey)) return;
      reportedSessions.add(evt.dedupeKey);
    }

    try { sendToMeta(evt); } catch (_) {}
    try { sendToGoogle(evt); } catch (_) {}
  } catch (_) {
    // Never let ad tracking break the event call that triggered it.
  }
}
