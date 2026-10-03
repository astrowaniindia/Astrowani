// "Shagun Recharge" — the voluntary thank-you sheet shown after the free 11-minute call
// (owner, 2026-10-03). This REPLACES the older Dakshina sheet's UI for that moment —
// three rows of amounts plus a custom field — with a 3x3 grid of nine fixed amounts and
// the astrologer's own avatar + a short note underneath, asking in Hinglish.
//
// THE MONEY PATH IS UNCHANGED, ON PURPOSE. This is a new skin, not a new payment system:
// it calls the exact same /api/dakshina/* endpoints as the old sheet (getDakshinaOptions,
// createDakshinaOrder, verifyDakshinaPayment — see api/DakshinaApi.js and
// astrowani-backend/src/dakshinaRoutes.js). The server still prices the order, the
// signature is still verified before anyone is credited, and the astrologer still gets
// 50% via DAKSHINA_VENDOR_SHARE. Building a second payment pipeline for the same "give the
// astrologer a token thank-you" flow would be the wrong kind of ambition — only the
// amounts offered (now server-configured to the owner's nine) and the layout changed.
//
// THE RULES CARRIED OVER FROM DAKSHINA, because they are not Dakshina-specific — they are
// what makes ANY optional post-free-call ask acceptable to show at all:
//
// 1. IT MUST LOOK OPTIONAL. The red ✕ is large and obvious, dismissing costs nothing, and
//    the footnote says plainly that the free call stays free either way.
// 2. STRAIGHT TO RAZORPAY, no wallet top-up. The money never lands in the customer's
//    wallet — it goes gateway -> split, same as Dakshina.
// 3. THE SERVER PRICES IT. The grid renders exactly `cfg.amounts` from
//    /api/dakshina/options (admin-editable via app_settings.dakshina_config) — this file
//    multiplies nothing and does not hardcode the ladder, so an admin change needs no app
//    release.
// 4. `onDone` RUNS EXACTLY ONCE — paid, dismissed, cancelled at the gateway, or failed.
//    It is what carries the customer onward (today: nothing, since the rest of the
//    post-call chain is switched off — see utils/featureFlags).
//
// PLACEHOLDER COPY: `shagun.title` and `shagun.astrologerNote` below are PLACEHOLDERS,
// clearly marked, pending the owner's actual Hinglish text. Swap them in
// context/LanguageContext.js (both the 'en' — Hinglish — and 'hi' blocks) once given;
// nothing else in this file needs to change.
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

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';
const RED = '#D32F2F';

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
  const [paying, setPaying] = useState(null); // the amount currently in flight, or null
  // onDone must fire once and only once, from whichever path finishes first.
  const doneRef = useRef(false);

  useEffect(() => {
    listener = (opts) => {
      doneRef.current = false;
      setReq(opts);
    };
    return () => { listener = null; };
  }, []);

  const visible = useDeferredPresent(!!req);
  useModalPresence(visible);

  const finish = useCallback(() => {
    const cb = req?.onDone;
    setReq(null); setCfg(null); setPaying(null);
    if (!doneRef.current) {
      doneRef.current = true;
      if (typeof cb === 'function') cb();
    }
  }, [req]);

  // Load the amounts. A disabled or unreachable config skips the sheet entirely rather
  // than showing an empty one — and still hands the customer onward via onDone.
  useEffect(() => {
    if (!req) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await getDakshinaOptions();
      if (cancelled) return;
      setLoading(false);
      if (!res?.enabled || !res?.paymentsAvailable || !(res.amounts || []).length) {
        captureEvent('shagun_recharge_skipped', { reason: res?.enabled ? 'payments_unavailable' : 'disabled' });
        finish();
        return;
      }
      setCfg(res);
      captureEvent('shagun_recharge_shown', { astrologer_id: req.astrologerId || null });
    })();
    return () => { cancelled = true; };
  }, [req, finish]);

  const dismiss = useCallback(() => {
    if (paying) return;
    captureEvent('shagun_recharge_dismissed', { astrologer_id: req?.astrologerId || null });
    finish();
  }, [paying, req, finish]);

  const pay = useCallback(async (amount) => {
    if (paying) return;
    const amt = Math.round(Number(amount));
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
      captureEvent('shagun_recharge_paid', { amount: amt, astrologer_id: req.astrologerId || null });
      finish();
      // Said after the sheet closes, so the thank-you is not competing with it.
      showStatusPopup({
        variant: 'success',
        title: t('shagun.thanksTitle'),
        message: t('shagun.thanksBody', { amount: amt }),
      });
    } catch (err) {
      setPaying(null);
      const rz = describeRazorpayError(err);
      // Backing out of the gateway is not a failure and nothing was charged. Leave the
      // sheet open so they can pick a different amount; say nothing.
      if (rz.cancelled) return;
      captureEvent('shagun_recharge_failed', { amount: amt, reason: rz.message || err?.message || 'unknown' });
      showStatusPopup({
        variant: 'error',
        title: t('shagun.failedTitle'),
        message: rz.message || err?.message || t('shagun.failedBody'),
      });
    }
  }, [paying, req, finish, t]);

  if (!req) return null;

  const amounts = cfg?.amounts || [];
  const astrologerName = req.astrologerName || t('common.astrologer');

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

          {/* PLACEHOLDER — owner's Hinglish text goes in shagun.title / shagun.subtitle. */}
          <Text style={styles.title}>{t('shagun.title')}</Text>
          <Text style={styles.subtitle}>{t('shagun.subtitle', { name: astrologerName })}</Text>

          {loading || !cfg ? (
            <ActivityIndicator color={RED} style={{ marginVertical: verticalScale(28) }} />
          ) : (
            <>
              <View style={styles.grid}>
                {amounts.map((a) => {
                  const isPaying = paying === a;
                  const disabled = !!paying;
                  return (
                    <TouchableOpacity
                      key={a}
                      style={[styles.amountBtn, disabled && !isPaying && styles.amountBtnOff]}
                      onPress={() => pay(a)}
                      activeOpacity={0.85}
                      disabled={disabled}
                    >
                      {isPaying
                        ? <ActivityIndicator color={COLORS.AstroMaroon} size="small" />
                        : (
                          <Text style={styles.amountTxt}>
                            <Text style={styles.rupee}>₹</Text>{a}
                          </Text>
                        )}
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
  title: {
    fontSize: moderateScale(17), fontWeight: '800', color: COLORS.AstroMaroon,
    marginTop: verticalScale(4), textAlign: 'center',
  },
  subtitle: {
    fontSize: moderateScale(12), color: '#6b584c', textAlign: 'center',
    marginTop: verticalScale(5), marginBottom: verticalScale(14),
    lineHeight: moderateScale(17),
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  // Three to a row: a percentage width rather than a fixed one, so nine buttons stay in
  // a tidy 3x3 on a small phone and on a tablet alike.
  amountBtn: {
    width: '29.5%', height: verticalScale(34),
    backgroundColor: SKIN,
    borderRadius: moderateScale(9),
    borderWidth: 1, borderColor: COLORS.AstroMaroon,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  amountBtnOff: { opacity: 0.45 },
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
    borderRadius: moderateScale(12), borderWidth: 1, borderColor: BORDER,
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
  bubbleTxt: {
    fontSize: moderateScale(11.5), color: COLORS.AstroMaroon, fontWeight: '600',
    lineHeight: moderateScale(16),
  },
});
