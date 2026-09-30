// Dakshina — "the call was free; thank the astrologer if you'd like to."
//
// THE RULES:
//
// 1. IT IS OPTIONAL AND MUST LOOK OPTIONAL. There is a ✕, the copy says plainly that
//    nothing is being charged and that it is their choice, and dismissing costs
//    nothing. The moment this reads as a bill for a call advertised as free, the
//    entire free-call funnel stops being worth running.
//
// 2. STRAIGHT TO RAZORPAY. Tapping an amount opens the gateway with that amount
//    already filled — no wallet top-up, no intermediate screen. The money never lands
//    in the customer's wallet; the server splits it 50/50 with the astrologer after
//    verifying the signature.
//
// 3. THE SERVER PRICES IT. The amounts come from /api/dakshina/options (admin-editable)
//    and the order is created server-side. This file multiplies nothing.
//
// 4. WHATEVER HAPPENS, `onDone` RUNS EXACTLY ONCE — paid, dismissed, cancelled at the
//    gateway or failed. It is what carries the customer on to the rating prompt and
//    then Home, so a path that forgets to call it strands them on a dead screen.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
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

let listener = null;

/**
 * Offer the Dakshina sheet.
 * @param {object} opts
 * @param {string} opts.astrologerId
 * @param {string} [opts.astrologerName]
 * @param {string} [opts.sessionId]
 * @param {Function} [opts.onDone] always called exactly once when the sheet is finished
 */
export const showDakshina = (opts) => { if (listener) listener(opts || {}); };

export function DakshinaPromptHost() {
  const { t } = useContext(LanguageContext);
  const [req, setReq] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  // onDone must fire once and only once, from whichever path finishes first.
  const doneRef = useRef(false);

  useEffect(() => {
    listener = (opts) => {
      doneRef.current = false;
      setCustom(false);
      setCustomValue('');
      setReq(opts);
    };
    return () => { listener = null; };
  }, []);

  const visible = useDeferredPresent(!!req);
  useModalPresence(visible);

  const finish = useCallback(() => {
    const cb = req?.onDone;
    setReq(null); setCfg(null); setCustom(false); setCustomValue(''); setPaying(false);
    if (!doneRef.current) {
      doneRef.current = true;
      if (typeof cb === 'function') cb();
    }
  }, [req]);

  // Load the amounts. A disabled or unreachable config skips the sheet entirely rather
  // than showing an empty one — and still hands the customer onward.
  useEffect(() => {
    if (!req) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await getDakshinaOptions();
      if (cancelled) return;
      setLoading(false);
      if (!res?.enabled || !res?.paymentsAvailable || !(res.amounts || []).length) {
        captureEvent('dakshina_skipped', { reason: res?.enabled ? 'payments_unavailable' : 'disabled' });
        finish();
        return;
      }
      setCfg(res);
      captureEvent('dakshina_shown', { astrologer_id: req.astrologerId || null });
    })();
    return () => { cancelled = true; };
  }, [req, finish]);

  const dismiss = useCallback(() => {
    if (paying) return;
    captureEvent('dakshina_dismissed', { astrologer_id: req?.astrologerId || null });
    finish();
  }, [paying, req, finish]);

  const pay = useCallback(async (amount) => {
    if (paying) return;
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) return;
    setPaying(true);
    try {
      const order = await createDakshinaOrder({
        astrologerId: req.astrologerId,
        amount: amt,
        sessionId: req.sessionId,
      });
      const prefill = await razorpayPrefill();
      const rzp = await RazorpayCheckout.open({
        description: t('dakshina.rzpDescription'),
        currency: order.currency || 'INR',
        key: order.keyId,
        amount: Math.round(Number(order.amount) * 100),
        order_id: order.orderId,
        name: 'Astrowani',
        prefill,
        theme: { color: COLORS.AstroMaroon },
      });

      await verifyDakshinaPayment({
        orderId: rzp.razorpay_order_id,
        paymentId: rzp.razorpay_payment_id,
        signature: rzp.razorpay_signature,
      });
      captureEvent('dakshina_paid', { amount: amt, astrologer_id: req.astrologerId || null });
      finish();
      // Said after the sheet closes, so the thank-you is not competing with it.
      showStatusPopup({
        variant: 'success',
        title: t('dakshina.thanksTitle'),
        message: t('dakshina.thanksBody', { amount: amt }),
      });
    } catch (err) {
      setPaying(false);
      const rz = describeRazorpayError(err);
      // Backing out of the gateway is not a failure and nothing was charged. Leave the
      // sheet open so they can pick a different amount; say nothing.
      if (rz.cancelled) return;
      captureEvent('dakshina_failed', { amount: amt, reason: rz.message || err?.message || 'unknown' });
      showStatusPopup({
        variant: 'error',
        title: t('dakshina.failedTitle'),
        message: rz.message || err?.message || t('dakshina.failedBody'),
      });
    }
  }, [paying, req, finish, t]);

  if (!req) return null;

  const amounts = cfg?.amounts || [];
  const customAmount = Math.round(Number(customValue));
  const customValid = cfg
    && Number.isFinite(customAmount)
    && customAmount >= cfg.minAmount
    && customAmount <= cfg.maxAmount;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss} activeOpacity={0.8} disabled={paying}>
            <MaterialIcons name="close" size={moderateScale(18)} color={COLORS.AstroMaroon} />
          </TouchableOpacity>

          <View style={styles.iconRing}>
            <MaterialIcons name="volunteer-activism" size={moderateScale(26)} color={COLORS.AstroMaroon} />
          </View>

          <Text style={styles.title}>{t('dakshina.title')}</Text>
          <Text style={styles.subtitle}>
            {t('dakshina.subtitle', { name: req.astrologerName || t('common.astrologer') })}
          </Text>

          {loading || !cfg ? (
            <ActivityIndicator color={COLORS.AstroMaroon} style={{ marginVertical: verticalScale(22) }} />
          ) : custom ? (
            <>
              <View style={styles.customRow}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  style={styles.customInput}
                  value={customValue}
                  onChangeText={(v) => setCustomValue(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder={String(cfg.minAmount)}
                  placeholderTextColor="#b6a495"
                  maxLength={6}
                  autoFocus
                  editable={!paying}
                />
              </View>
              <Text style={styles.rangeHint}>
                {t('dakshina.range', { min: cfg.minAmount, max: cfg.maxAmount })}
              </Text>
              <TouchableOpacity
                style={[styles.payBtn, (!customValid || paying) && styles.payBtnOff]}
                onPress={() => pay(customAmount)}
                activeOpacity={0.85}
                disabled={!customValid || paying}
              >
                {paying
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={styles.payTxt}>{t('dakshina.give', { amount: customValid ? customAmount : 0 })}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCustom(false)} disabled={paying} style={styles.linkBtn}>
                <Text style={styles.linkTxt}>{t('common.back')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {amounts.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.amountRow, paying && styles.amountRowOff]}
                  onPress={() => pay(a)}
                  activeOpacity={0.85}
                  disabled={paying}
                >
                  <Text style={styles.amountTxt}>₹{a}</Text>
                  <MaterialIcons name="chevron-right" size={moderateScale(20)} color={COLORS.AstroMaroon} />
                </TouchableOpacity>
              ))}

              {cfg.allowCustom ? (
                <TouchableOpacity
                  style={[styles.amountRow, styles.ownRow, paying && styles.amountRowOff]}
                  onPress={() => setCustom(true)}
                  activeOpacity={0.85}
                  disabled={paying}
                >
                  <Text style={styles.ownTxt}>{t('dakshina.chooseOwn')}</Text>
                  <MaterialIcons name="edit" size={moderateScale(17)} color={COLORS.AstroMaroon} />
                </TouchableOpacity>
              ) : null}

              {paying ? (
                <ActivityIndicator color={COLORS.AstroMaroon} style={{ marginTop: verticalScale(12) }} />
              ) : null}

              <Text style={styles.footnote}>{t('dakshina.footnote')}</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: scale(20),
  },
  card: {
    width: '100%', maxWidth: scale(330), backgroundColor: CREAM,
    borderRadius: moderateScale(18), padding: scale(22), alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  closeBtn: {
    position: 'absolute', top: scale(10), right: scale(10),
    width: scale(28), height: scale(28), borderRadius: scale(14),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0E2D4', borderWidth: 1, borderColor: BORDER, zIndex: 2,
  },
  iconRing: {
    width: scale(52), height: scale(52), borderRadius: scale(26),
    backgroundColor: '#F6EFE7', alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: moderateScale(17), fontWeight: '800', color: COLORS.AstroMaroon,
    marginTop: verticalScale(10), textAlign: 'center',
  },
  subtitle: {
    fontSize: moderateScale(12.5), color: '#6b584c', textAlign: 'center',
    marginTop: verticalScale(6), marginBottom: verticalScale(14), lineHeight: moderateScale(18),
  },
  amountRow: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: COLORS.white,
    borderRadius: moderateScale(14), borderWidth: 1, borderColor: BORDER,
    paddingVertical: verticalScale(13), paddingHorizontal: scale(16),
    marginBottom: verticalScale(9),
  },
  amountRowOff: { opacity: 0.5 },
  amountTxt: { fontSize: moderateScale(16), fontWeight: '800', color: COLORS.AstroMaroon },
  ownRow: { backgroundColor: '#F6EFE7' },
  ownTxt: { fontSize: moderateScale(13.5), fontWeight: '700', color: COLORS.AstroMaroon },
  customRow: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    borderWidth: 1, borderColor: BORDER, paddingHorizontal: scale(16),
  },
  rupee: { fontSize: moderateScale(20), fontWeight: '800', color: COLORS.AstroMaroon },
  customInput: {
    flex: 1, fontSize: moderateScale(20), fontWeight: '800',
    color: COLORS.AstroMaroon, paddingVertical: verticalScale(10), marginLeft: scale(6),
  },
  rangeHint: {
    fontSize: moderateScale(11), color: '#8a7668',
    marginTop: verticalScale(6), alignSelf: 'flex-start',
  },
  payBtn: {
    alignSelf: 'stretch', backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(14), paddingVertical: verticalScale(13),
    alignItems: 'center', justifyContent: 'center', marginTop: verticalScale(14),
  },
  payBtnOff: { opacity: 0.45 },
  payTxt: { color: COLORS.white, fontWeight: '800', fontSize: moderateScale(14.5) },
  linkBtn: { marginTop: verticalScale(12), paddingVertical: verticalScale(4) },
  linkTxt: { color: '#8a7668', fontSize: moderateScale(12.5), fontWeight: '600' },
  footnote: {
    fontSize: moderateScale(11), color: '#8a7668', textAlign: 'center',
    marginTop: verticalScale(6), lineHeight: moderateScale(16),
  },
});
