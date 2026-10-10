import {NativeModules, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import {SOCKET_URL} from '../config/api';

/**
 * Which offline QR poster (or ad) this install came from.
 *
 * Each printed poster's QR points at a Play Store link carrying its own
 * `referrer=utm_source=qr_<place>`. Play stores that against the install and hands it
 * back through the native InstallReferrer module; we read it once and send it with the
 * signup, where the backend records it on the new customer row.
 *
 * Read at SIGNUP rather than at app launch, deliberately: Play retains the referrer
 * indefinitely, so reading it later returns the same value, and doing it here means
 * there is no launch-time work and no state to keep in sync. An install that never
 * signs up is not attributed by us at all — that gap is Play Console's job to report,
 * and trying to cover it here would mean tracking anonymous devices.
 *
 * THREE WAYS THIS RETURNS NOTHING, all normal and all handled:
 *   - iOS: there is no Play Install Referrer equivalent without a paid attribution SDK.
 *   - An older store build running this over OTA: the native module does not exist.
 *   - A sideloaded APK, or a device with no Play Store.
 * In every case the customer signs up exactly as before and is simply unattributed.
 */

// Cached so a retried signup (wrong OTP, then right one) does not rebind the Play
// service. Only ever holds a value we successfully read.
const CACHE_KEY = 'acquisitionReferrer';

// The native call binds to a Play Store service, which is normally instant but can
// hang on a device whose Play Services is wedged. This runs inside the OTP
// verification request, so it is capped: an attribution is worth a moment, never a
// customer stuck on a spinner.
const TIMEOUT_MS = 2500;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(''), ms)),
  ]);

/**
 * Pull utm_source out of a Play referrer string.
 *
 * Mirrors the backend's parser (astrowani-backend/src/acquisition.js) so the app can
 * report the same value it will be attributed under. The backend re-derives it
 * regardless and its answer is the authority — this is a convenience, not a source of
 * truth, which is why a parse failure here is harmless.
 */
function parseSource(referrer) {
  if (!referrer) return null;
  const match = /(?:^|&)utm_source=([^&]*)/.exec(String(referrer));
  if (!match) return null;
  let value = match[1];
  try {
    value = decodeURIComponent(value.replace(/\+/g, ' '));
  } catch (e) {
    // A malformed percent-escape is not worth losing the signup over; fall through
    // with the undecoded value and let the backend's own parser decide.
  }
  const cleaned = String(value).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80);
  return cleaned || null;
}

/**
 * Read the install referrer, for sending with a signup.
 *
 * ALWAYS resolves — never throws and never rejects. Returns
 * `{acquisitionSource, acquisitionRaw}` with nulls when nothing could be determined,
 * shaped to be spread straight into the verify request body.
 */
export async function getAcquisition() {
  const empty = {acquisitionSource: null, acquisitionRaw: null};

  try {
    if (Platform.OS !== 'android') return empty;

    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) return {acquisitionSource: parseSource(cached), acquisitionRaw: cached};

    // Guarded rather than imported at the top: this file ships over OTA to store
    // builds made before the native module existed, where the module is simply
    // absent. Touching a method on it would throw during signup.
    const native = NativeModules.InstallReferrer;
    if (!native || typeof native.getInstallReferrer !== 'function') return empty;

    const raw = await withTimeout(native.getInstallReferrer(), TIMEOUT_MS);
    if (!raw) return empty;

    // Cache failures are irrelevant — the value is already in hand for this signup.
    AsyncStorage.setItem(CACHE_KEY, String(raw)).catch(() => {});

    return {acquisitionSource: parseSource(raw), acquisitionRaw: String(raw)};
  } catch (e) {
    return empty;
  }
}

// ── First open ──────────────────────────────────────────────────────────────
//
// Tell the backend "an install from poster X has opened", BEFORE any signup, so the QR
// page can show installs that never became customers. The install referrer is read the
// same way as at signup; only QR posters are reported (organic/Ads installs have their
// own reporting). Fire-and-forget: it must never delay, block or fail anything the
// person is doing.
const FIRST_OPEN_DONE_KEY = 'qrFirstOpenReported';
const FIRST_OPEN_TRIES_KEY = 'qrFirstOpenTries';
// The referrer is normally ready on first launch, but a wedged Play Services can answer
// empty once. A few launches are tried before giving up, so a hiccup does not lose an
// install — but an ordinary (non-QR) install stops after that instead of asking forever.
const MAX_TRIES = 3;

async function stableInstallId() {
  // Derived from the device + the moment THIS install was made, not from anything in
  // AsyncStorage: logout wipes AsyncStorage, and a fresh random id would then count the
  // same install twice. A reinstall changes firstInstallTime, so it correctly counts anew.
  const [uid, first] = await Promise.all([DeviceInfo.getUniqueId(), DeviceInfo.getFirstInstallTime()]);
  return `${uid}-${first}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export async function reportFirstOpen() {
  try {
    if (Platform.OS !== 'android') return;
    if (await AsyncStorage.getItem(FIRST_OPEN_DONE_KEY)) return;

    const tries = Number(await AsyncStorage.getItem(FIRST_OPEN_TRIES_KEY)) || 0;
    if (tries >= MAX_TRIES) return;
    AsyncStorage.setItem(FIRST_OPEN_TRIES_KEY, String(tries + 1)).catch(() => {});

    const {acquisitionSource, acquisitionRaw} = await getAcquisition();
    // Nothing to report (organic install, sideload, old build): leave it for the next
    // launch until the tries run out.
    if (!acquisitionRaw && !acquisitionSource) return;
    if (!/^qr_/.test(String(acquisitionSource || ''))) {
      // A definite non-QR answer — no reason to ask again on later launches.
      await AsyncStorage.setItem(FIRST_OPEN_DONE_KEY, '1');
      return;
    }

    const installId = await stableInstallId();
    if (installId.length < 16) return;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    const res = await fetch(`${SOCKET_URL}/api/acquisition/first-open`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({installId, acquisitionSource, acquisitionRaw}),
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    // Marked done only once the backend has actually answered, so a network failure at
    // first launch is retried on the next one.
    if (res && res.ok) await AsyncStorage.setItem(FIRST_OPEN_DONE_KEY, '1');
  } catch (e) {
    // Never surfaced: this is bookkeeping, not part of anything the person asked for.
  }
}

// ── Campaign-targeted first-open prompt ────────────────────────────────────
//
// "11 min call better geolocations" (Google Ads campaign 24326942598) pays far more
// per install than the broad campaign (₹41 vs ₹1.91 — see astrowani-backend's
// acquisitionRoutes.js), so a signed-out visitor from THIS campaign specifically sees a
// full-screen "want a free call?" prompt before Login (see CampaignFreeCallPrompt.js /
// App.js), instead of relying on the quieter post-signup gift screen every install sees.
//
// Hardcoded to one campaign id on purpose: this is a targeted response to one
// expensive campaign's numbers, not a general mechanism. Widening it to other
// campaigns is a deliberate follow-up, not something this constant should silently do.
const TARGET_CAMPAIGN_ID = '24326942598';
// The "Metro" campaign: the same 11-minute free call, but presented in ENGLISH and
// routed to ONE named astrologer chosen for the visitor, rather than to the picker.
//
// This is the SAME campaign as TARGET_CAMPAIGN_ID, and deliberately so (owner,
// 2026-10-10): "11 min call better geolocations" now runs the English flow with one
// chosen astrologer instead of the Hinglish gift reveal. One install carries one
// gad_campaignid, so a campaign can only ever be one variant — getCampaignVariant()
// checks Metro FIRST, which is what makes this replace the gift flow rather than
// depend on the order the branches happen to be written in.
//
// The 'gift' variant is kept whole and still works; it simply has no campaign
// pointing at it. Point another id at TARGET_CAMPAIGN_ID to bring it back.
const METRO_CAMPAIGN_ID = '24326942598';
const PROMPT_SHOWN_KEY = 'campaignFreeCallPromptShown';
// Which variant this install belongs to, remembered so the screens AFTER the first
// one (signup, the chosen-astrologer card) can stay in the same language and layout
// without re-reading the Play referrer on every screen.
const VARIANT_KEY = 'campaignVariant';

/** Pull the campaign id out of a stored Play referrer. */
function campaignIdOf(raw) {
  const match = /(?:^|&)gad_campaignid=([^&]*)/.exec(String(raw || ''));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return match[1];
  }
}

/**
 * 'metro' | 'gift' | null for this install, ignoring whether the prompt has been shown.
 * Never throws.
 */
export async function getCampaignVariant() {
  try {
    const remembered = await AsyncStorage.getItem(VARIANT_KEY);
    if (remembered) return remembered;
    if (Platform.OS !== 'android') return null;
    const {acquisitionRaw} = await getAcquisition();
    const id = campaignIdOf(acquisitionRaw);
    if (!id) return null;
    // Metro first: it is the narrower, explicitly-configured one, so if the two ids
    // were ever set the same the English flow wins rather than the choice being
    // whichever branch happened to be written first.
    const variant = (METRO_CAMPAIGN_ID && id === METRO_CAMPAIGN_ID)
      ? 'metro'
      : (id === TARGET_CAMPAIGN_ID ? 'gift' : null);
    if (variant) await AsyncStorage.setItem(VARIANT_KEY, variant);
    return variant;
  } catch (e) {
    return null;
  }
}

/** Dev/testing only: force a variant without a real Play referrer. */
export async function setCampaignVariant(variant) {
  try {
    if (variant) await AsyncStorage.setItem(VARIANT_KEY, variant);
    else await AsyncStorage.removeItem(VARIANT_KEY);
  } catch (e) {}
}

/**
 * True once, for ANY signed-out visitor's first cold start — not gated on a campaign
 * referrer. (Corrected 2026-10-10: this used to require `gad_campaignid` to match the
 * one paid campaign, which meant the gift reveal — and the free 11-minute call offer
 * behind it — was only ever shown to the ~1 install in a hundred that came through that
 * specific ad. Every organic install, every other campaign and every QR scan landed on
 * the plain phone-number screen instead, which was never the intent: the reveal and the
 * free call are for everyone. The campaign id still decides exactly one thing, entirely
 * separately — which astrologer(s) appear in the free-call list afterwards, via
 * campaign_astrologer_routing on the backend. It has nothing to do with whether this
 * screen is shown.)
 *
 * Never throws. Checked once per install — the caller persists PROMPT_SHOWN_KEY once
 * the prompt has actually been shown (not here: this only answers "should it show").
 */
export async function isTargetCampaignFirstOpen() {
  try {
    if (await AsyncStorage.getItem(PROMPT_SHOWN_KEY)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export async function markCampaignFreeCallPromptShown() {
  try {
    await AsyncStorage.setItem(PROMPT_SHOWN_KEY, '1');
  } catch (e) {
    // Worst case the prompt shows again on a later cold start — never worth crashing over.
  }
}

export default {
  getAcquisition,
  reportFirstOpen,
  isTargetCampaignFirstOpen,
  markCampaignFreeCallPromptShown,
  getCampaignVariant,
  setCampaignVariant,
};
