// The guide mascot's tips — short, friendly nudges at the moments customers get
// stuck (first visit to Home, not enough balance, waiting for an astrologer, the
// recharge screen).
//
// RULES
//  - Every tip can be switched off or reworded from the admin (Guide Avatar page),
//    stored in app_settings.guide_avatar_config under `tips`. A missing or failed
//    config falls back to the bundled text below, so tips work before any admin edit.
//  - "once" tips are shown one time per customer (per install), remembered in
//    AsyncStorage. The customer can also turn ALL skippable tips off.
//  - Tips never block anything: every one can be closed, and functional ones (low
//    balance, waiting) only change wording inside a popup that exists anyway.
//  - Every tip reports shown / action / dismissed / turned-off to analytics, so real
//    customers will tell us which tips actually reduce drop-off.
//
// The state is loaded once at app start (loadMascotTips) and read synchronously
// afterwards, because two tips live in imperative helpers that cannot await.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { captureEvent } from './Analytics';
import { translate, getCurrentLanguage } from '../context/LanguageContext';

export const TIP_IDS = {
  homeFreeChat: 'home_free_chat',
  lowBalance: 'low_balance',
  waiting: 'waiting_astrologer',
  recharge: 'recharge_help',
};

// `group` shares one "seen" flag across tips for the same moment.
// `skippable` tips obey "tips off".
const TIP_RULES = {
  home_free_chat: { once: true, group: 'home', skippable: true },
  recharge_help: { once: true, skippable: true },
  low_balance: { once: false, skippable: false },
  waiting_astrologer: { once: false, skippable: false },
};

// Seen/off flags are stored PER CUSTOMER (suffixed with their id), not per phone:
// otherwise a second account signed in on the same phone would never see a
// once-only tip because someone else already had it.
const SEEN_KEY = 'mascotTipsSeen';
const OFF_KEY = 'mascotTipsOff';

const state = {
  config: {}, // tipId -> { enabled, textEn, textHi } from the admin
  customerId: null, // whose flags are loaded into `seen` / `off`
  seen: new Set(),
  off: false,
};

const storageKey = (base) => (state.customerId ? `${base}_${state.customerId}` : base);

// Loads the signed-in customer's flags if a different customer's (or nobody's) are
// in memory. Cheap to call often: it only reads storage when the account changed.
export async function syncMascotTipsCustomer() {
  let id = null;
  try { id = await AsyncStorage.getItem('customerId'); } catch (_) {}
  id = id || null;
  if (id === state.customerId) return;
  state.customerId = id;
  state.seen = new Set();
  state.off = false;
  try {
    const pairs = await AsyncStorage.multiGet([storageKey(SEEN_KEY), storageKey(OFF_KEY)]);
    const map = Object.fromEntries(pairs);
    try { state.seen = new Set(JSON.parse(map[storageKey(SEEN_KEY)] || '[]')); } catch (_) {}
    state.off = map[storageKey(OFF_KEY)] === 'true';
  } catch (_) {
    // Nothing stored for this customer yet — every tip is still unseen.
  }
  notify();
}
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (_) {} });

export const subscribeMascotTips = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

let loadPromise = null;
export function loadMascotTips() {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([
    syncMascotTipsCustomer(),
    Instance.get('/api/guide-avatar/config')
      .then((res) => {
        const tips = res?.data?.tips;
        if (tips && typeof tips === 'object') state.config = tips;
      })
      .catch(() => {}),
  ]).finally(notify);
  return loadPromise;
}

const seenKeyFor = (tipId) => TIP_RULES[tipId]?.group || tipId;

// Synchronous: may this tip be shown right now?
export function canShowTip(tipId) {
  const rule = TIP_RULES[tipId];
  if (!rule) return false;
  if (state.config?.[tipId]?.enabled === false) return false;
  if (rule.skippable && state.off) return false;
  if (rule.once && state.seen.has(seenKeyFor(tipId))) return false;
  return true;
}

const persistSeen = () =>
  AsyncStorage.setItem(storageKey(SEEN_KEY), JSON.stringify([...state.seen])).catch(() => {});

export function markTipSeen(tipId) {
  const key = seenKeyFor(tipId);
  if (state.seen.has(key)) return;
  state.seen.add(key);
  persistSeen();
  notify();
}

// The tip's words: the admin's text for the current language if set, otherwise the
// bundled Hinglish/Hindi default. {{params}} are filled in either way.
export function tipText(tipId, params, textKey = `mascot.${tipId}`) {
  const lang = getCurrentLanguage();
  const cfg = state.config?.[tipId] || {};
  const admin = (lang === 'Hindi' ? cfg.textHi : cfg.textEn) || '';
  let str = admin.trim() ? admin : translate(textKey, params);
  if (admin.trim() && params) {
    Object.keys(params).forEach((p) => {
      str = str.replace(new RegExp(`{{${p}}}`, 'g'), params[p]);
    });
  }
  return str;
}

export const trackTipShown = (tipId, extra) =>
  captureEvent('mascot_tip_shown', { tip: tipId, ...(extra || {}) });

export const trackTipAction = (tipId, action) =>
  captureEvent('mascot_tip_action', { tip: tipId, action });

export function dismissTip(tipId) {
  captureEvent('mascot_tip_dismissed', { tip: tipId });
  if (TIP_RULES[tipId]?.once) markTipSeen(tipId);
}

export function turnOffTips(fromTipId) {
  captureEvent('mascot_tips_turned_off', { tip: fromTipId || null });
  state.off = true;
  AsyncStorage.setItem(storageKey(OFF_KEY), 'true').catch(() => {});
  notify();
}
