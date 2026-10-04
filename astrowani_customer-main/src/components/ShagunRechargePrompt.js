// "Shagun Dakshina" — the voluntary thank-you sheet shown after the free 11-minute call
// (owner, 2026-10-03). This REPLACES the older Dakshina sheet's UI for that moment —
// three rows of amounts plus a custom field — with the profile screen's "Send a Gift"
// grid (picture, name, price, three to a row) and the guide mascot + a short note
// underneath, asking in Hinglish.
//
// THE MONEY IS SPLIT 50/50 WITH THE ASTROLOGER THE FREE CALL WAS WITH, which is the whole
// point of it: pay ₹21 here after a call with Astro Rishi Raj and ₹11 reaches Rishi Raj's
// wallet as earnings, the remainder is the platform's. So this is a new SKIN, not a new
// payment system — it calls the same /api/dakshina/* endpoints as the old sheet
// (getDakshinaOptions, createDakshinaOrder, verifyDakshinaPayment — see api/DakshinaApi.js
// and astrowani-backend/src/dakshinaRoutes.js). The server prices the order, the signature
// is verified before anyone is credited, and the split is the server's
// DAKSHINA_VENDOR_SHARE. Only the amounts offered and the layout changed.
//
// `req.astrologerId` IS THE LOAD-BEARING FIELD. It is what create-order writes to
// dakshina_payments.astrologer_id, and therefore who gets paid — it must stay the
// astrologer of the call that just ended, never a default or a last-viewed profile.
//
// IT IS NOT A RECHARGE, despite the file name. It was briefly rewired into a wallet
// top-up on 2026-10-03 and reverted the same day; the sheet is called Shagun Dakshina
// precisely because this money is a thank-you to the astrologer and does NOT come back to
// the customer as balance. Copy anywhere that implies otherwise is a bug.
//
// THE RULES CARRIED OVER FROM DAKSHINA, because they are not Dakshina-specific — they are
// what makes ANY optional post-free-call ask acceptable to show at all:
//
// 1. IT MUST LOOK OPTIONAL. The close button is large and obvious and dismissing costs
//    nothing: the free call is already over and already free, whatever happens here.
// 2. STRAIGHT TO RAZORPAY, no wallet top-up. The money never lands in the customer's
//    wallet — it goes gateway -> split, same as Dakshina always did.
// 3. THE SERVER PRICES IT, TWICE OVER. The tiles are the live gift catalogue
//    (/api/gifts) and the legal amounts are /api/dakshina/options (admin-editable via
//    app_settings.dakshina_config). This file multiplies nothing and hardcodes no ladder,
//    and it draws only the gifts whose price the dakshina route would actually accept, so
//    the two admin-editable lists drifting apart cannot produce a button that always
//    fails. Both change without an app release.
// 4. `onDone` RUNS EXACTLY ONCE — paid, dismissed, cancelled at the gateway, or failed.
//    It is what carries the customer onward (today: nothing, since the rest of the
//    post-call chain is switched off — see utils/featureFlags).
//
// THE COPY IS THE OWNER'S OWN, given 2026-10-03, and the two halves of it depend on each
// other: the bubble's heading ("51 kyun, 50 kyun nahi?") is answered by the line under it
// explaining the ₹1, and together they are why every amount in the ladder ends in 1.
// Changing the ladder without the copy, or either line without the other, leaves the sheet
// asking a question it no longer answers. It lives in context/LanguageContext.js, 'en'
// (Hinglish) and 'hi'.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import RazorpayCheckout from 'react-native-razorpay';

import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import { useDeferredPresent, useModalPresence } from '../utils/modalPresentation';
import { getDakshinaOptions, createDakshinaOrder, verifyDakshinaPayment } from '../api/DakshinaApi';
import { describeRazorpayError } from '../utils/razorpayError';
import { razorpayPrefill } from '../utils/customerIdentity';
import { showStatusPopup } from './StatusPopup';
import Instance from '../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';
const RED = '#D32F2F';

// THE AMOUNTS ARE THE OWNER'S NINE AND THEY COME FROM THE SERVER (/api/dakshina/options,
// i.e. app_settings.dakshina_config). The gift catalogue supplies only the PICTURE AND THE
// NAME for each one — the prices in `gifts` are the Send-a-Gift prices (21, 108, 111, 751,
// 1008…) and are deliberately NOT used here, because this sheet's ladder is its own.
//
// So the pairing is by amount, below. Chosen to climb the way the catalogue does — flower,
// greeting, lamp, garland, kalash, then the three grandest for the top three. `Trishul` is
// the one catalogue entry with no slot; swapping it in is a one-line change here.
const GIFT_FOR_AMOUNT = {
  11: 'Rose',
  51: 'Lotus',
  501: 'Kalash',
  1100: 'Om',
  2100: 'Crown',
  5100: 'Blessings',
};

// The amount called out as the popular one (owner, 2026-10-03). Matched on the FIGURE, not
// on a name or a position, so renaming or reordering the catalogue cannot move the tag to
// the wrong tile. If this amount ever leaves the ladder the tag simply does not appear.
const HIGHLIGHT_AMOUNT = 101;

/**
 * The gift catalogue, as the profile screen's "Send a Gift" grid uses it.
 *
 * Returns [] on ANY failure rather than throwing: this sheet is optional and a blip must
 * skip it silently, exactly like the options call it runs beside.
 */
async function fetchGiftArt() {
  try {
    const res = await Instance.get('/api/gifts');
    const byName = {};
    (res?.data?.data || []).forEach((g) => { if (g?.name) byName[g.name] = g; });
    return byName;
  } catch (_) {
    return {};
  }
}

/**
 * The nine tiles: the server's amounts, each dressed with its picture and name.
 *
 * A missing picture is NOT a reason to drop the amount — the tile falls back to the figure
 * alone, which still pays correctly. The catalogue is decoration here; the ladder is the
 * product, and an admin renaming a gift must never quietly remove a way to pay.
 */
// These tiles use a bundled asset instead of the server's gift-catalogue picture — a
// `require`'d local image, not a `{uri}`, so it is kept out of `tile.image` and handled
// separately at render time. `LOCAL_TILE_NAME` overrides the label to match, since the
// catalogue's gift name (if any) no longer describes what is actually drawn.
const LOCAL_TILE_IMAGE = {
  11: require('../assets/images/nariyal.png'),
  21: require('../assets/images/diya.png'),
  51: require('../assets/images/garland.png'),
  101: require('../assets/images/pooja.png'),
  251: require('../assets/images/mithai_dabba.png'),
  2100: require('../assets/images/shankh.png'),
};
const LOCAL_TILE_NAME = {
  11: 'Nariyal',
  21: 'Diya',
  51: 'Garland',
  101: 'Pooja',
  251: 'Mithai Dabba',
  2100: 'Shankh',
};
// The shankh's art sits further inside its own square than the other local images, so at
// the shared size it reads smaller than its neighbours — this just draws it bigger, not
// changing the tile itself.
const LOCAL_TILE_IMAGE_SIZE = {
  2100: true,
};

function buildTiles(amounts, art) {
  return (amounts || []).map((a) => {
    const amount = Math.round(Number(a));
    const gift = art[GIFT_FOR_AMOUNT[amount]] || null;
    return { amount, name: LOCAL_TILE_NAME[amount] || gift?.name || null, image: gift?.image || null };
  }).filter((tile) => Number.isFinite(tile.amount) && tile.amount > 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS A CACHE HERE AT ALL.
 *
 * This sheet is raised the instant a free call ends. Fetching its contents at that
 * moment meant the customer watched an empty card sit there and fill in — the tiles
 * carry their artwork as base64 inside the /api/gifts payload (~12 KB each, ~125 KB for
 * the ten), so on a real phone on mobile data that is a visible, ugly pause at exactly
 * the wrong moment. A post-call ask that arrives half-built reads as broken.
 *
 * So the data is fetched ONCE, early (as the app starts, long before any call), kept in
 * memory and mirrored to AsyncStorage so even a cold start opens the sheet already
 * populated. When the sheet is raised it renders from that cache SYNCHRONOUSLY and
 * revalidates in the background; the spinner now only appears on a first-ever run that
 * has never once reached the server.
 *
 * The cache holds no personal data — an amount ladder and some pictures — so there is
 * nothing here that must not be written to disk.
 * ──────────────────────────────────────────────────────────────────────────── */
const CACHE_KEY = 'shagunArpan_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let memCache = null;     // { options, art, at }
let inflight = null;     // de-dupes concurrent prefetches
let hydrated = false;

const isFresh = (c) => !!c && Date.now() - Number(c.at || 0) < CACHE_TTL_MS;

/** Pull the last good copy off disk, so a cold start is populated too. */
async function hydrateFromDisk() {
  if (hydrated) return memCache;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // Deliberately accepted even when stale: a day-old ladder shown instantly and
    // corrected a second later beats an empty card. Only the revalidation below decides
    // what is actually charged, and the server prices every order regardless.
    if (parsed?.options?.amounts?.length) memCache = parsed;
  } catch (_) { /* a corrupt or missing cache is simply no cache */ }
  return memCache;
}

/**
 * Fill the cache. Safe to call often — concurrent calls share one request, and a fresh
 * cache is left alone. Never throws: a failed warm-up just means the sheet falls back to
 * fetching when it is raised, which is what it used to do always.
 */
export async function prefetchShagunArpan({ force = false } = {}) {
  await hydrateFromDisk();
  if (!force && isFresh(memCache)) return memCache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [options, art] = await Promise.all([getDakshinaOptions(), fetchGiftArt()]);
      // Only a usable answer replaces what is cached. A 401 or a blip must not wipe a
      // good copy and leave the next call's sheet empty.
      if (options?.enabled && (options.amounts || []).length) {
        memCache = { options, art, at: Date.now() };
        try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memCache)); } catch (_) {}
      }
    } catch (_) { /* keep whatever was cached */ }
    inflight = null;
    return memCache;
  })();
  return inflight;
}

let listener = null;

/**
 * Offer the Shagun Recharge sheet.
 * @param {object} opts
 * @param {string} opts.astrologerId
 * @param {string} [opts.astrologerName]
 * @param {string} [opts.astrologerImage]
 * @param {string} [opts.sessionId]
 * @param {Function} [opts.onDone] always called exactly once when the sheet is finished
 */
export const showShagunRecharge = (opts) => { if (listener) listener(opts || {}); };

export function ShagunRechargePromptHost() {
  const { t } = useContext(LanguageContext);
  const [req, setReq] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tiles, setTiles] = useState([]);
  const [paying, setPaying] = useState(null); // the amount currently in flight, or null
  // onDone must fire once and only once, from whichever path finishes first.
  const doneRef = useRef(false);

  useEffect(() => {
    listener = (opts) => {
      doneRef.current = false;
      setReq(opts);
    };
    // Warm the sheet now, at app start, so it opens complete whenever a call ends.
    // Fire-and-forget and never throws — nothing here may delay or disturb startup.
    prefetchShagunArpan();
    return () => { listener = null; };
  }, []);

  const visible = useDeferredPresent(!!req);
  useModalPresence(visible);

  /**
   * Close the sheet and hand the customer onward.
   *
   * `deferDone` is for the one path that must not hand them onward immediately: after a
   * successful payment a thank-you is shown, and the next step in the chain has to wait
   * until THEY dismiss it. It returns the onward callback instead of calling it, and
   * still burns `doneRef`, so the guarantee that onDone runs at most once is unchanged —
   * the caller owns it from that point and runs it exactly once.
   */
  const finish = useCallback((opts) => {
    const cb = req?.onDone;
    setReq(null); setCfg(null); setTiles([]); setPaying(null);
    if (doneRef.current) return null;
    doneRef.current = true;
    if (opts?.deferDone) return typeof cb === 'function' ? cb : null;
    if (typeof cb === 'function') cb();
    return null;
  }, [req]);

  // Load what the sheet needs. A disabled config, unavailable payments or an empty
  // catalogue skip the sheet entirely rather than showing an empty one — and still hand
  // the customer onward via onDone.
  useEffect(() => {
    if (!req) return undefined;
    let cancelled = false;

    // THE FAST PATH, and the one that matters: by the time a call ends, the sheet has
    // had the whole call — minutes — to warm up in the background (see the mount effect
    // above). `memCache` is a plain module variable, not React state, so this check is
    // synchronous: when it already holds data, the sheet is built and shown on its very
    // first render with `loading` never set to true at all. No spinner frame, no flash —
    // the customer sees the finished popup the instant the call ends, exactly like a
    // screen that was always there. Only a cold app (this sheet's first-ever raise since
    // launch, before the mount effect's fetch has landed) falls through to the loading
    // path below.
    if (hydrated && memCache?.options?.amounts?.length) {
      setTiles(buildTiles(memCache.options.amounts, memCache.art || {}));
      setCfg(memCache.options);
      setLoading(false);
      captureEvent('shagun_dakshina_shown', { astrologer_id: req.astrologerId || null, from_cache: true });
      // Correct it quietly behind the open sheet, same as the slow path below.
      prefetchShagunArpan({ force: true }).then((fresh) => {
        if (cancelled || !fresh?.options?.amounts?.length) return;
        setTiles(buildTiles(fresh.options.amounts, fresh.art || {}));
        setCfg(fresh.options);
      });
      return () => { cancelled = true; };
    }

    setLoading(true);
    (async () => {
      // Both at once: the sheet needs the config to know it may charge at all, and the
      // gift catalogue for what it draws. Neither is useful without the other, so a
      // failure of either skips the sheet rather than showing half of it.
      const cached = await hydrateFromDisk();
      const warm = isFresh(cached) ? cached : (cached || await prefetchShagunArpan());
      if (cancelled) return;

      if (warm?.options?.enabled && (warm.options.amounts || []).length) {
        setTiles(buildTiles(warm.options.amounts, warm.art || {}));
        setCfg(warm.options);
        setLoading(false);
        captureEvent('shagun_dakshina_shown', {
          astrologer_id: req.astrologerId || null,
          from_cache: true,
        });
        // Correct it quietly behind the open sheet. An admin who changed the ladder an
        // hour ago is reflected without anybody watching a reload; if the amounts did
        // not change, nothing re-renders.
        prefetchShagunArpan({ force: true }).then((fresh) => {
          if (cancelled || !fresh?.options?.amounts?.length) return;
          setTiles(buildTiles(fresh.options.amounts, fresh.art || {}));
          setCfg(fresh.options);
        });
        return;
      }

      // Nothing cached and nothing fetched — first run, or the server is unreachable.
      const res = warm?.options;
      setLoading(false);
      if (!res?.enabled || !res?.paymentsAvailable || !(res.amounts || []).length) {
        captureEvent('shagun_dakshina_skipped', { reason: res?.enabled ? 'payments_unavailable' : 'disabled' });
        finish();
        return;
      }
      setTiles(buildTiles(res.amounts, warm.art || {}));
      setCfg(res);
      captureEvent('shagun_dakshina_shown', { astrologer_id: req.astrologerId || null, from_cache: false });
    })();
    return () => { cancelled = true; };
  }, [req, finish]);

  const dismiss = useCallback(() => {
    if (paying) return;
    captureEvent('shagun_dakshina_dismissed', { astrologer_id: req?.astrologerId || null });
    finish();
  }, [paying, req, finish]);

  const pay = useCallback(async (tile) => {
    if (paying) return;
    const amt = Math.round(Number(tile?.amount));
    if (!Number.isFinite(amt) || amt <= 0) return;
    setPaying(amt);
    try {
      const order = await createDakshinaOrder({
        astrologerId: req.astrologerId,
        amount: amt,
        sessionId: req.sessionId,
      });
      const prefill = await razorpayPrefill();
      const rzp = await RazorpayCheckout.open({
        description: t('shagun.rzpDescription'),
        currency: order.currency || 'INR',
        key: order.keyId,
        amount: Math.round(Number(order.amount) * 100),
        order_id: order.orderId,
        name: 'Astrowani',
        // Fetched above but was never actually passed here — Razorpay had nothing to
        // prefill with, so its own sheet asked the customer to type their number again
        // before it would even show the UPI apps. Passing it here is what skips straight
        // to app selection. Still editable: Razorpay shows a prefilled, editable field
        // rather than a locked one, so someone paying from a different number can change
        // it right there instead of being forced to.
        prefill,
        // UPI ONLY, so tapping an amount goes as near as the gateway allows to
        // "their UPI app opens with that figure already in it" (owner, 2026-10-03).
        // Razorpay then shows the installed UPI apps rather than a method menu, and
        // picking one launches it with the amount locked to the order — the figure is
        // the server's, so it can never be edited on the way through.
        //
        // The amount was ALWAYS fixed; what changed is that cards, netbanking, wallets,
        // pay-later and EMI are gone from this sheet. Deliberate, and only on this
        // sheet: a shagun is a small UPI-shaped gesture, and the method menu was one
        // more screen between the tap and the payment. Wallet top-ups, remedy orders
        // and the continue-call purchase are untouched and still offer every method —
        // narrowing those would cost real sales.
        method: {
          upi: true,
          card: false,
          netbanking: false,
          wallet: false,
          paylater: false,
          emi: false,
        },
        theme: { color: RED },
      });

      await verifyDakshinaPayment({
        orderId: rzp.razorpay_order_id,
        paymentId: rzp.razorpay_payment_id,
        signature: rzp.razorpay_signature,
      });
      captureEvent('shagun_dakshina_paid', { amount: amt, gift: tile.name || null, astrologer_id: req.astrologerId || null });
      // The thank-you is a STEP, not a notification (owner, 2026-10-04): whatever comes
      // next in the post-call chain waits behind it until the customer taps "That's OK".
      // Raising the next sheet on top of a thank-you for money just given would read as
      // being asked for something again before being thanked for the first thing.
      const resume = finish({ deferDone: true });
      showStatusPopup({
        variant: 'success',
        title: t('shagun.thanksTitle'),
        message: t('shagun.thanksBody', { amount: amt, name: req.astrologerName || t('common.astrologer') }),
        buttonText: t('shagun.thanksOk'),
        // StatusPopup calls this however it is closed (the button, or the backdrop), so
        // the chain cannot be stranded by dismissing it a different way.
        onClose: () => { if (typeof resume === 'function') resume(); },
      });
    } catch (err) {
      setPaying(null);
      const rz = describeRazorpayError(err);
      // Backing out of the gateway is not a failure and nothing was charged. Leave the
      // sheet open so they can pick a different amount; say nothing.
      if (rz.cancelled) return;
      captureEvent('shagun_dakshina_failed', { amount: amt, gift: tile.name || null, reason: rz.message || err?.message || 'unknown' });
      showStatusPopup({
        variant: 'error',
        title: t('shagun.failedTitle'),
        message: rz.message || err?.message || t('shagun.failedBody'),
      });
    }
  }, [paying, req, finish, t]);

  if (!req) return null;

  const astrologerName = req.astrologerName || t('common.astrologer');
  // Raw template with the literal "{{name}}" token still in it — t() only substitutes
  // when params are passed. Splitting on that token (not on astrologerName itself) means
  // a name that happens to recur in the sentence can never split it in the wrong place.
  const [subtitleBefore, subtitleAfter] = t('shagun.subtitle').split('{{name}}');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* RED, not the usual cream — the owner asked for the close button specifically
              in red, distinct from every other sheet in this app. */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={dismiss}
            activeOpacity={0.8}
            disabled={!!paying}
          >
            <MaterialIcons name="close" size={moderateScale(20)} color={COLORS.white} />
          </TouchableOpacity>

          {/* The kalash sits above the title, centred. Square source (500x500) with the
              background already removed, so it needs no container — just a fixed box and
              `contain`, which keeps it unsquashed whatever the scale factor works out to. */}
          <Image
            source={require('../assets/images/shagunArpan.png')}
            style={styles.hero}
            resizeMode="contain"
          />

          <Text style={styles.title}>{t('shagun.title')}</Text>
          {/* The astrologer's name highlighted within the subtitle (owner, 2026-10-04):
              orange with a thin brown outline. Built from the raw template — t() with no
              params leaves the literal "{{name}}" token in place — split around that
              token so the name gets its own styled <Text> while the rest of the
              sentence stays plain, in both languages, without hardcoding word order. */}
          <Text style={styles.subtitle}>
            {subtitleBefore}
            <Text style={styles.subtitleName}>{astrologerName}</Text>
            {subtitleAfter}
          </Text>

          {loading || !cfg ? (
            <ActivityIndicator color={RED} style={{ marginVertical: verticalScale(28) }} />
          ) : (
            <>
              {/* The same tile as the profile screen's "Send a Gift" grid — picture,
                  name, price — so the gesture reads the way customers already know it.
                  Three to a row, nine amounts, a clean 3x3. What a tap does is NOT sending
                  a gift: it pays that figure as shagun arpan through /api/dakshina/*, so
                  the astrologer gets their half in rupees. The picture is the dress; the
                  amount is the product. */}
              <View style={styles.grid}>
                {tiles.map((tile) => {
                  const isPaying = paying === tile.amount;
                  const disabled = !!paying;
                  const isPopular = tile.amount === HIGHLIGHT_AMOUNT;
                  return (
                    <TouchableOpacity
                      key={tile.amount}
                      style={[
                        styles.giftTile,
                        isPopular && styles.giftTilePopular,
                        disabled && !isPaying && styles.giftTileOff,
                      ]}
                      onPress={() => pay(tile)}
                      activeOpacity={0.85}
                      disabled={disabled}
                    >
                      {isPopular && (
                        <View style={styles.popularTag}>
                          <Text style={styles.popularTagTxt} numberOfLines={1}>
                            {t('shagun.mostlyUsed')}
                          </Text>
                        </View>
                      )}
                      {isPaying ? (
                        <ActivityIndicator color={COLORS.AstroMaroon} style={styles.giftSpinner} />
                      ) : LOCAL_TILE_IMAGE[tile.amount] ? (
                        <Image
                          source={LOCAL_TILE_IMAGE[tile.amount]}
                          style={[styles.giftImg, LOCAL_TILE_IMAGE_SIZE[tile.amount] && styles.giftImgLarge]}
                          resizeMode="contain"
                        />
                      ) : tile.image ? (
                        <Image source={{ uri: tile.image }} style={styles.giftImg} resizeMode="contain" />
                      ) : (
                        // No artwork for this amount (catalogue unreachable, or renamed).
                        // The tile still pays, so it is drawn with the figure alone.
                        <View style={styles.giftImg} />
                      )}
                      {!!tile.name && <Text style={styles.giftName} numberOfLines={1}>{tile.name}</Text>}
                      <Text style={styles.giftPrice}>
                        <Text style={styles.rupee}>₹</Text>{tile.amount}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* The GUIDE MASCOT (assets/images/guideAvatarLogin.png) — the same figure
                  the Namaste/welcome and name screens use, NOT the astrologer's photo.
                  It is the app's one recurring character, so the voice asking here is the
                  voice the customer already met at signup. Rendered by its intrinsic
                  145x281 aspect so the figure is never squashed. */}
              <View style={styles.noteRow}>
                <Image
                  source={require('../assets/images/guideAvatarLogin.png')}
                  style={styles.avatar}
                  resizeMode="contain"
                />
                <View style={styles.bubble}>
                  <View style={styles.bubbleTail} />
                  <View style={styles.bubbleTitleWrap}>
                    <Text style={styles.bubbleTitle}>{t('shagun.noteTitle')}</Text>
                  </View>
                  <Text style={styles.bubbleTxt}>{t('shagun.astrologerNote')}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281) — the same
// constant SignupWelcome, SignupName and MascotTip each declare. The figure is tall and
// narrow; constraining it by WIDTH and letting the height follow is what keeps it from
// being squashed, which is why nothing here sets an explicit height.
const AVATAR_ASPECT = 145 / 281;

// Light skin fill + a thin brown border + brown text (owner, 2026-10-03). Nine of these
// sit three-to-a-row, so they are deliberately small and quiet — a wall of nine heavy
// solid blocks read as a demand rather than an offer.
const SKIN = COLORS.AstroSoftOrange;   // #f4d8bc

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: scale(20),
  },
  card: {
    width: '100%', maxWidth: scale(340), backgroundColor: CREAM,
    borderRadius: moderateScale(18), padding: scale(18), alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  closeBtn: {
    position: 'absolute', top: scale(8), right: scale(8),
    width: scale(22), height: scale(22), borderRadius: scale(11),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: RED, zIndex: 2,
  },
  hero: {
    width: scale(96), height: scale(96),
    marginTop: verticalScale(2), marginBottom: verticalScale(2),
  },
  title: {
    fontSize: moderateScale(21), fontWeight: '800', color: COLORS.AstroMaroon,
    marginTop: verticalScale(4), textAlign: 'center',
  },
  subtitle: {
    fontSize: moderateScale(12), color: '#6b584c', textAlign: 'center',
    marginTop: verticalScale(5), marginBottom: verticalScale(14),
    lineHeight: moderateScale(17),
  },
  // The astrologer's name, picked out from the rest of the subtitle sentence: orange
  // fill, thin brown outline. RN has no real text-stroke, so the outline is a
  // textShadow with a ZERO offset and a small radius — at offset (0,0) it traces the
  // glyph edges as a crisp thin line rather than casting a shadow in any direction, which
  // is what keeps this from reading as a drop shadow. No box, no elevation, nothing else.
  subtitleName: {
    fontWeight: '800',
    color: '#FF7A1A',
    textShadowColor: COLORS.AstroMaroon,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1,
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  // Three to a row: a percentage width rather than a fixed one, so the tiles stay tidy
  // on a small phone and on a tablet alike. `position: relative` is what the "mostly
  // used" tag is positioned against.
  giftTile: {
    width: '31%', position: 'relative',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    borderWidth: 1, borderColor: BORDER,
    alignItems: 'center',
    paddingTop: verticalScale(9), paddingBottom: verticalScale(6),
    paddingHorizontal: scale(4),
    marginBottom: verticalScale(9),
  },
  // The one the owner wants noticed: the skin fill the amount buttons used to have,
  // plus the maroon border, so it reads as chosen-by-default without a second colour.
  giftTilePopular: {
    backgroundColor: SKIN, borderColor: COLORS.AstroMaroon, borderWidth: 1.5,
  },
  giftTileOff: { opacity: 0.45 },
  giftImg: { width: scale(36), height: scale(36) },
  giftImgLarge: { width: scale(46), height: scale(46) },
  // Occupies exactly the image's box so the tile does not jump while paying.
  giftSpinner: { width: scale(36), height: scale(36) },
  giftName: {
    fontSize: moderateScale(10), color: '#6b584c', fontWeight: '600',
    marginTop: verticalScale(4), textAlign: 'center',
  },
  giftPrice: {
    fontSize: moderateScale(12), fontWeight: '800', color: COLORS.AstroMaroon,
    marginTop: verticalScale(1),
  },
  // Sits ON the tile's top edge rather than above it, so a tagged tile is exactly as
  // tall as every other one and the grid rows stay level.
  popularTag: {
    position: 'absolute', top: verticalScale(-7), alignSelf: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(7),
    paddingHorizontal: scale(5), paddingVertical: verticalScale(1),
    zIndex: 2,
  },
  popularTagTxt: {
    color: COLORS.white, fontSize: moderateScale(7.5), fontWeight: '800',
  },
  amountTxt: {
    color: COLORS.AstroMaroon, fontWeight: '800', fontSize: moderateScale(13),
  },
  // The ₹ one step down from the figure, so the number is what the eye lands on.
  rupee: { fontSize: moderateScale(11), fontWeight: '700' },
  noteRow: {
    // flex-END, not centre: the mascot is a STANDING figure, so it reads correctly only
    // when its feet sit on the same line as the bottom of the bubble. Centring a figure
    // this tall leaves it floating with its head above the card's content.
    flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'stretch',
    marginTop: verticalScale(4),
  },
  // NOT a circular crop — the whole standing figure, at its own 145x281 proportions
  // (owner, 2026-10-03). Width is the only dimension set; the height follows from
  // aspectRatio, so making it bigger here can never squash or crop it.
  avatar: { width: scale(72), aspectRatio: AVATAR_ASPECT },
  bubble: {
    flex: 1, marginLeft: scale(6), marginBottom: verticalScale(14),
    backgroundColor: COLORS.white,
    // Brown boundary (owner, 2026-10-03), replacing the cream one.
    borderRadius: moderateScale(12), borderWidth: 1.5, borderColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(9), paddingHorizontal: scale(11),
  },
  // Left-pointing tail, same construction as GuideAvatar's bubbleTailLeft: a CSS
  // triangle made from borders, not a rotated square — a rotated square shows its own
  // two outer edges crossing the bubble's border on Android.
  bubbleTail: {
    position: 'absolute', left: scale(-7), top: '50%', marginTop: verticalScale(-6),
    width: 0, height: 0,
    borderTopWidth: verticalScale(6), borderBottomWidth: verticalScale(6),
    borderRightWidth: scale(7),
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderRightColor: COLORS.white,
  },
  // Yellow text with brown around it (owner, 2026-10-03) — done as a SOLID BAND, not as
  // a text outline. React Native has no text stroke, and the textShadow trick that is
  // usually reached for renders as a soft halo at this size rather than an edge: it made
  // the heading look blurred. A filled pill gives the same yellow-on-brown reading with
  // crisp glyphs, and it is what makes yellow legible at all here — on the white bubble
  // this text would otherwise nearly vanish.
  bubbleTitleWrap: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(7),
    paddingHorizontal: scale(7), paddingVertical: verticalScale(2.5),
    marginBottom: verticalScale(5),
  },
  bubbleTitle: {
    fontSize: moderateScale(12), fontWeight: '800', color: COLORS.AstroGold,
  },
  bubbleTxt: {
    fontSize: moderateScale(11.5), color: COLORS.AstroMaroon, fontWeight: '600',
    lineHeight: moderateScale(16),
  },
});
