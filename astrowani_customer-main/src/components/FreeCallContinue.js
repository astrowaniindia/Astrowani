// "Want more time with them?" — the sheet that appears when a free introductory call
// ends, offering 5 / 10 / 15 more minutes with the SAME astrologer, paid in one tap.
//
// Mount <FreeCallContinueHost /> ONCE near the navigation root, then call
// showFreeCallContinue({ astrologerId, astrologerName, astrologerImage }).
//
// FIVE THINGS HERE ARE LOAD-BEARING:
//
// 1. PRICES COME FROM THE SERVER. This file never multiplies a rate by minutes. The
//    options arrive already priced from /api/free-call/continue/options, which reads
//    the astrologer's real rate — the same number the paid call will bill at.
//
// 2. THE ASTROLOGER IS RESERVED WHILE THIS IS OPEN. The backend placed a hold the
//    moment the call ended. Tapping an amount upgrades it to a payment hold that blocks
//    everyone else for three minutes; the ✕ releases it immediately, rather than making
//    the next customer wait out a reservation nobody wants.
//
// 5. THE COUNTDOWN IS THE HOLD, NOT A DECORATION. It counts the seconds the server says
//    are left on the reservation (expiresInSeconds), so what the customer sees and how
//    long the astrologer is actually held can never drift apart — and an admin changing
//    holdDecisionSeconds moves both at once. It is anchored to a deadline rather than
//    decremented on each tick: a throttled JS thread must not be able to keep a dead
//    reservation on screen (the timer-drift rule, see hooks/useElapsedSeconds).
//    At zero the sheet closes itself and lets the astrologer go, rather than leaving a
//    row of buttons that would 409 on the way to the gateway.
//
// 3. THE MONEY GOES TO THE WALLET, then the paid call bills from it per minute. If they
//    hang up after two of the five minutes they bought, the rest is still theirs. That
//    also means a failed connection never costs them anything — the worst case is money
//    sitting in their own wallet.
//
// 4. NOTHING IS STACKED ON TOP OF THIS. Two modals at once freezes iOS (see
//    utils/modalPresentation). The "Rate Astrowani" prompt waits for this to close.

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { describeRazorpayError } from '../utils/razorpayError';
import { razorpayPrefill } from '../utils/customerIdentity';
import { useDeferredPresent, useModalPresence } from '../utils/modalPresentation';
import { showStatusPopup } from './StatusPopup';
import { requestNotifyMe } from '../utils/notifyMe';
import { markReviewGoodMoment } from '../utils/appPrompts';
import { showRateAstrowani } from './RateAstrowaniPrompt';
import {
  getContinueOptions, startContinuePayment, releaseContinueHold, FREE_CALL_HOLD_WINDOW_KEY, abandonContinuePayment,
} from '../api/FreeCallApi';
import Instance from '../api/ApiCall';
import { navigationRef } from '../utils/NavigationService';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';

let listener = null;

/** 1:30 above a minute, plain seconds below it — "0:07" reads slower than "7s". */
const formatLeft = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Raise the sheet. No-op if the host isn't mounted. */
export const showFreeCallContinue = (opts) => { if (listener) listener(opts || {}); };

export function FreeCallContinueHost() {
  const { t } = useContext(LanguageContext);
  const [req, setReq] = useState(null);
  // Two-step on purpose (owner, 2026-09-29): the sheet opens with the QUESTION only.
  // The priced 5/10/15 options are revealed only when the customer says yes. Somebody
  // who taps ✕ never sees a price list, so the moment after a free call does not read
  // as an upsell ambush. The hold is running either way — revealing costs nothing.
  const [revealed, setRevealed] = useState(false);
  const [data, setData] = useState(null);     // server-priced options + hold state
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);            // latch: set synchronously, before any await
  const [secondsLeft, setSecondsLeft] = useState(null);
  // The deadline lives in BOTH a ref and state, on purpose.
  //   * the ref is read inside the interval and cleared synchronously by `choose`;
  //   * the state is what the countdown effect depends on.
  // It was ref-only, and that is why the clock sat still: assigning a ref does not
  // re-render, so the effect that starts the interval had already run (and bailed) with
  // a null deadline and had no reason to run again. Keep both in step.
  const [deadlineAt, setDeadlineAt] = useState(null);
  const deadlineRef = useRef(null);           // absolute ms, so a late tick cannot drift

  // ── THE SHEET IS NOT SHOWN UNTIL IT IS COMPLETE (owner, 2026-10-04) ────────────
  // It used to appear the instant it was asked for and then assemble itself in front of
  // the customer: avatar and title first, a spinner where the buttons go, and the
  // countdown pill popping in afterwards. Presentation now waits for the options, so it
  // arrives in one frame, fully drawn.
  //
  // `ready` is a FLOOR, not a promise of data: the safety timer below raises the sheet
  // even if the request never answers, because the rating step hangs off this sheet
  // closing and a dead fetch must not swallow the rest of the chain.
  const [ready, setReady] = useState(false);

  const visible = useDeferredPresent(!!req && ready);
  useModalPresence(visible);

  useEffect(() => {
    listener = (o) => { setReady(false); setReq(o); };
    return () => { listener = null; };
  }, []);

  // ── Recovering an offer the customer never got to see ──────────────────────
  //
  // The sheet is normally raised by the call screen's doEndCall. That code does not run
  // when the customer's app is not there to run it: the phone died mid-call, the OS
  // killed the app, they swiped it away, or they pressed Home while the offer was up and
  // came back after Android reclaimed the process. In every one of those the astrologer
  // IS held server-side for the full window, so the offer exists and only the app has
  // lost it — and an 11-minute conversation cut short by a flat battery is precisely the
  // customer most worth asking.
  //
  // Two refusals here are deliberate, not caution:
  //   * phase must be 'decision'. A 'payment' hold means they already tapped an amount
  //     and a Razorpay order is open or paid; re-offering the buttons is how somebody
  //     gets charged twice for the same five minutes.
  //   * a few seconds must actually be left, so the sheet cannot flash up and expire.
  const reqRef = useRef(null);
  reqRef.current = req;

  useEffect(() => {
    let alive = true;

    const recover = async () => {
      if (!alive || reqRef.current) return;             // already showing — the timer owns it
      // Cheap local gate first: only a device that rang a free call recently can have a
      // hold, so nobody else pays for this request. See FreeCallApi's window key.
      let until = 0;
      try { until = Number(await AsyncStorage.getItem(FREE_CALL_HOLD_WINDOW_KEY)) || 0; } catch (_) { return; }
      if (!until || Date.now() > until) return;
      if (!alive || reqRef.current) return;

      const res = await getContinueOptions();
      if (!alive || reqRef.current) return;
      if (!res?.active || res.phase !== 'decision') return;
      if (!(Number(res.expiresInSeconds) > 5)) return;

      captureEvent('free_call_continue_recovered', {
        astrologer_id: res.astrologerId || null,
        seconds_left: Number(res.expiresInSeconds) || null,
      });
      setReq({
        astrologerId: res.astrologerId,
        astrologerName: res.astrologerName,
        astrologerImage: res.astrologerImage,
        sessionId: res.sessionId || null,
        // ranFullLength is deliberately absent: this path cannot know how long the call
        // lasted, and arming the store prompt on a guess is exactly the gating the
        // rating design avoids.
      });
    };

    recover();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') recover(); });
    return () => { alive = false; sub.remove(); };
  }, []);

  const close = useCallback(() => {
    setRevealed(false); setReady(false);
    setReq(null); setData(null); setPaying(false); payingRef.current = false;
    setSecondsLeft(null); deadlineRef.current = null; setDeadlineAt(null);
    // This offer is settled one way or the other, so stop the foreground recovery above
    // from asking about it again for the rest of its window.
    AsyncStorage.removeItem(FREE_CALL_HOLD_WINDOW_KEY).catch(() => {});
  }, []);

  /**
   * The customer is finished with this offer (dismissed it, or fell through to the
   * waitlist). Close, then ask how Astrowani was.
   *
   * The delay is not cosmetic: raising a second root modal while this one is still
   * unmounting is the stacked-modal shape that freezes iOS. useDeferredPresent
   * serialises presentation, but the gap keeps the two visually distinct too.
   *
   * ARMING THE STORE PROMPT HAPPENS HERE, on `ranFullLength` — a behavioural signal —
   * and NOT on the stars the customer is about to tap. Filtering the store ask by their
   * answer is review gating; Play treats it as ratings manipulation and Apple rejects
   * it. Someone who just talked for eleven straight minutes is already happy, so the
   * same people reach the store either way.
   */
  const finish = useCallback(() => {
    const ctx = req;
    close();
    if (ctx?.ranFullLength) markReviewGoodMoment();

    // The sheet no longer raises the rating itself. The caller decides what comes next,
    // because after a 9+ minute call the sequence is
    //   "did you like it?" -> Dakshina -> rating
    // and only VoiceCallScreen knows that. Raising the rating from here as well would
    // put two root modals on screen at once, which freezes iOS.
    if (typeof ctx?.onDeclined === 'function') {
      // Let this modal finish dismissing before the next one is raised.
      setTimeout(() => ctx.onDeclined(), 450);
      return;
    }

    // No chain supplied (an older caller, or the crash-recovery path): fall back to the
    // previous behaviour so the customer is still asked.
    if (ctx?.sessionId) {
      setTimeout(() => {
        showRateAstrowani({ context: 'free_call', sessionId: ctx.sessionId });
      }, 450);
    }
  }, [req, close]);

  // Read through a ref from inside the load effect below. `finish` is recreated whenever
  // `req` changes, so depending on it directly there would re-run the fetch — and the
  // fetch is what opens the server-side hold.
  const finishRef = useRef(null);
  finishRef.current = finish;

  // Load the options as soon as the sheet is asked for. The prices are shown whatever
  // the astrologer is doing — busy is never surfaced before payment (owner, 2026-10-04)
  // — so the only reason this finds nothing to sell is an astrologer with no rate at
  // all, which skips the sheet entirely rather than drawing an empty one.
  useEffect(() => {
    if (!req) return;
    let cancelled = false;
    setLoading(true);
    // Never let an unanswered request mean no sheet at all. getContinueOptions resolves
    // rather than throwing, and caps itself at 8s (see the note there), so the worst
    // case is this floor firing and the request landing shortly after — not the
    // customer watching a spinner and never being rated.
    const floor = setTimeout(() => { if (!cancelled) setReady(true); }, 3500);
    (async () => {
      const res = await getContinueOptions();
      if (cancelled) return;

      // NOTHING PRICED -> DO NOT SHOW A SHEET AT ALL, and carry the chain straight on to
      // the rating. The server prices from the astrologer's own rate and no longer
      // withholds options for a busy astrologer, so this is now only reachable when
      // there is genuinely no rate to sell at. There is deliberately no "they have moved
      // on" card here any more: an empty sheet and a busy-state explanation are both
      // worse than simply moving on (owner, 2026-10-04).
      if (!(res?.options || []).length) {
        captureEvent('free_call_continue_nothing_to_sell', {
          astrologer_id: req.astrologerId || null,
          active: !!res?.active,
          mode: req.mode || null,
        });
        finishRef.current?.();
        return;
      }

      setData(res);
      setLoading(false);
      setReady(true);
      // The server's own remaining seconds, turned into an absolute deadline once. If
      // the app was backgrounded between the call ending and this opening, that number
      // is already smaller — which is correct, the reservation has been running.
      const left = Number(res?.expiresInSeconds);
      if (res?.active && Number.isFinite(left) && left > 0) {
        const at = Date.now() + left * 1000;
        deadlineRef.current = at;
        setDeadlineAt(at);
        setSecondsLeft(Math.ceil(left));
      }
      captureEvent('free_call_continue_shown', {
        astrologer_id: req.astrologerId || null,
        active: !!res.active,
        options: (res.options || []).length,
        mode: req.mode || null,
      });
    })();
    return () => { cancelled = true; clearTimeout(floor); };
  }, [req]);

  /** The ✕ — let the astrologer go now rather than at the end of the hold. */
  const dismiss = useCallback(() => {
    captureEvent('free_call_continue_dismissed', {
      astrologer_id: req?.astrologerId || null,
      seconds_left: secondsLeft,
      mode: req?.mode || null,
    });
    releaseContinueHold();
    finish();
  }, [req, finish, secondsLeft]);

  // FREE THE ASTROLOGER ON EVERY EXIT THAT IS NOT A PURCHASE.
  //
  // ✕ already releases. This covers the rest: Android back, swiping the app away,
  // backgrounding it, or the sheet being torn down for any other reason. Without it an
  // astrologer stays reserved — and invisible to other customers — until the hold
  // expires, for a decision the customer walked away from.
  //
  // `payingRef` is the one exemption: a hold must survive backgrounding while the
  // Razorpay sheet is open, because the gateway IS another app taking the foreground.
  useEffect(() => {
    if (!req) return undefined;
    const onAppState = (next) => {
      if (next === 'active' || payingRef.current) return;
      releaseContinueHold();
      finish();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
      // Unmounted without buying — let them go.
      if (!payingRef.current) releaseContinueHold();
    };
  }, [req, finish]);

  /** "Yes, I want more time" — only now are prices shown. */
  const reveal = useCallback(() => {
    captureEvent('free_call_continue_options_opened', {
      astrologer_id: req?.astrologerId || null,
      seconds_left: secondsLeft,
      mode: req?.mode || null,
    });
    setRevealed(true);
  }, [req, secondsLeft]);

  // The countdown. Held in a ref so the interval below never has to be torn down and
  // rebuilt as the handler's identity changes — a restarted interval drops a tick.
  const expireRef = useRef(null);
  expireRef.current = () => {
    captureEvent('free_call_continue_expired', { astrologer_id: req?.astrologerId || null, mode: req?.mode || null });
    releaseContinueHold();
    finish();
  };

  useEffect(() => {
    if (!req || paying || !deadlineAt) return undefined;
    const id = setInterval(() => {
      // Recomputed from the deadline every tick, never decremented, so a tick that
      // lands late (backgrounded app, a heavy render) corrects itself instead of
      // leaving the astrologer reserved on screen after the server has let them go.
      // Re-read the ref every tick rather than closing over it. `choose` clears it
      // synchronously, but the effect that owns this interval only tears down on the
      // NEXT render — a tick landing in that gap would otherwise compute a huge negative
      // and expire a payment that is already under way.
      if (!deadlineRef.current) { clearInterval(id); return; }
      const left = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(id);
        setSecondsLeft(0);
        expireRef.current?.();
        return;
      }
      setSecondsLeft(left);
    }, 500);
    return () => clearInterval(id);
    // `paying` stops the clock: once they tap an amount the hold becomes a three-minute
    // payment hold, and a decision timer still running behind the gateway would close
    // the sheet out from under a payment in flight.
  }, [req, paying, deadlineAt]);

  // ── "They have moved on" IS GONE, DELIBERATELY AND COMPLETELY (owner, 2026-10-04) ──
  //
  // There used to be an `offerWaitlist()` here that raised a "this astrologer has
  // started another consultation / Notify me" popup, from two places: the ✕-less
  // fallback body of this sheet, and a HOLD_EXPIRED refusal from /continue/start.
  //
  // NOTHING about the astrologer being busy may be shown BEFORE payment. The 5 / 10 /
  // 15 minute prices are offered unconditionally — a busy astrologer is not a reason to
  // withhold them, because the decision window no longer reserves the astrologer at all.
  // It is 60 seconds for the CUSTOMER to decide, nothing more; if the astrologer happens
  // to be free when the paid call rings, it connects, and if not, the customer is told
  // AFTER paying, by the paidBusy popup in `choose()` below — which is the single place
  // busy is ever mentioned, and the money is already safe in their own wallet by then.

  const choose = useCallback(async (option) => {
    // Set the latch BEFORE the first await. Every await yields the event loop, so a
    // check-then-set below the await lets a double-tap through and opens two Razorpay
    // orders. (Same bug class as the 401 interceptor's async latch.)
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);

    // Retire the decision countdown for good, not just for the duration of the gateway.
    // The hold is a three-minute PAYMENT hold from here on, and if this attempt fails or
    // is cancelled the sheet stays open so they can try again — with the old deadline
    // long past, a timer that merely paused would fire the instant `paying` cleared and
    // close the sheet out from under them.
    deadlineRef.current = null;
    setDeadlineAt(null);
    setSecondsLeft(null);

    const astrologerId = data?.astrologerId || req?.astrologerId;
    try {
      const start = await startContinuePayment(option.minutes);
      captureEvent('free_call_continue_started', { minutes: option.minutes, amount: start.amount, mode: req?.mode || null });

      const prefill = await razorpayPrefill();
      const rzp = await RazorpayCheckout.open({
        description: t('freeCallContinue.rzpDescription'),
        currency: start.currency || 'INR',
        key: start.keyId,
        amount: Math.round(Number(start.amount) * 100),
        order_id: start.orderId,
        name: 'Astrowani',
        prefill,
        theme: { color: COLORS.AstroMaroon },
      });

      // Verify server-side before doing anything else. A client-reported success is
      // never enough — this is the same trust boundary the wallet recharge uses, and
      // the backend's signature check is what actually credits the money.
      const authToken = await AsyncStorage.getItem('token');
      const verify = await Instance.post('/api/wallet/verify-payment', {
        razorpay_order_id: rzp.razorpay_order_id,
        razorpay_payment_id: rzp.razorpay_payment_id,
        razorpay_signature: rzp.razorpay_signature,
      }, { headers: { Authorization: `Bearer ${authToken}` } });

      if (!verify.data?.success) throw new Error(t('freeCallContinue.verifyFailed'));

      captureEvent('wallet_recharged', { amount: start.amount });
      captureEvent('free_call_continue_paid', { minutes: option.minutes, amount: start.amount, mode: req?.mode || null });

      // PAID — but they may have been taken while the gateway was open. The hold blocks
      // other FREE calls, not paid ones, and the customer was away in Razorpay for
      // however long it took them.
      //
      // THEIR MONEY IS NOT STUCK, which is why this is a message and not a refund path:
      // /continue/start deliberately creates an ordinary wallet recharge, so the amount
      // is already sitting in their wallet and will pay for this astrologer whenever they
      // do connect. Say that plainly and put them on the waitlist, instead of dropping
      // them onto a profile whose Call button will just fail.
      // `after.busy` / `after.offline` are the signals now, not an empty options list.
      // The server stopped withholding options (that is what used to put the "started
      // another consultation" card in front of customers BEFORE they paid), so an
      // unreachable astrologer still prices normally and has to be detected explicitly.
      //
      // TWO DIFFERENT MESSAGES, because they are two different facts (owner, 2026-10-04):
      //   offline -> they switched calls off, or were suspended. "Back online" is the
      //              thing to promise.
      //   busy    -> they are simply on another call right now. "Free" is the thing to
      //              promise.
      // The server makes them mutually exclusive, so this never has to rank them.
      const after = await getContinueOptions();
      const unreachable = !after?.active || !(after.options || []).length
        || after.busy || after.offline;
      if (unreachable) {
        const wentOffline = !!after?.offline;
        captureEvent('free_call_continue_paid_but_busy', {
          astrologer_id: astrologerId || null,
          minutes: option.minutes,
          reason: wentOffline ? 'offline' : 'busy',
          mode: req?.mode || null,
        });
        // Carry the chain ourselves rather than calling finish(): finish() raises the
        // next step on a timer, which would put the rating card on screen underneath
        // this popup — two root modals at once, the shape that freezes iOS.
        const ctx = req;
        close();
        // ONE button, and it reads "Notify me" (owner, 2026-10-04). requestNotifyMe is
        // fired from the button rather than the moment this appears: being put on a
        // waitlist is something the customer agrees to, and a single-button popup whose
        // action already happened silently is just an OK button wearing a label.
        showStatusPopup({
          variant: 'busy',
          title: t(wentOffline ? 'freeCallContinue.paidOfflineTitle' : 'freeCallContinue.paidBusyTitle'),
          message: t(wentOffline ? 'freeCallContinue.paidOfflineBody' : 'freeCallContinue.paidBusyBody'),
          buttonText: t('freeCallContinue.notifyMe'),
          onClose: () => {
            if (astrologerId) requestNotifyMe(astrologerId, 'audio', { t });
            if (typeof ctx?.onDeclined === 'function') setTimeout(() => ctx.onDeclined(), 450);
          },
        });
        return;
      }

      close();
      // Hand off to the ORDINARY paid call flow rather than reimplementing ringing,
      // acceptance and the Realtime backup a third time. AstrologerInfo's `autoAction`
      // exists for exactly this (it is what the list cards use), and it shows the
      // astrologer's profile while their phone rings. The hold lets THIS customer
      // through /api/call/initiate; it keeps blocking everyone else.
      const rate = Number(data?.ratePerMinute) || 0;
      navigationRef.navigate('AstrologerInfo', {
        person: {
          userId: astrologerId,
          _id: astrologerId,
          name: data?.astrologerName || req?.astrologerName || '',
          profileImage: data?.astrologerImage || req?.astrologerImage || '',
          chargePerMinute: rate,
          pricing: rate,
          isCallEnabled: true,
        },
        autoAction: 'call',
      });
    } catch (err) {
      payingRef.current = false;
      setPaying(false);

      // Nothing was paid, so stop blocking every OTHER customer. This drops the hold
      // from the payment phase back to the decision phase rather than releasing it, so
      // a retry is still possible but the astrologer is not held off the market for a
      // purchase that did not happen. Fire and forget: this is already an error path.
      abandonContinuePayment();

      // HOLD_EXPIRED used to be special-cased into the "they have moved on" waitlist
      // popup. That popup is gone (see above) and the server no longer refuses a
      // purchase because the astrologer is busy, so anything landing here now is an
      // ordinary failure — reported as one, with no mention of the astrologer's state.
      const rz = describeRazorpayError(err);
      // A cancelled payment is not a failure. Nothing was charged and they know they
      // pressed back; a red "Payment failed" only implies their money is in limbo.
      if (rz.cancelled) return;
      showStatusPopup({
        variant: rz.network ? 'error' : 'error',
        title: t('freeCallContinue.payFailedTitle'),
        message: rz.message || err?.message || t('freeCallContinue.payFailedBody'),
      });
    }
  }, [data, req, close, t]);

  if (!req) return null;

  const name = data?.astrologerName || req.astrologerName || t('common.astrologer');
  const image = data?.astrologerImage || req.astrologerImage || '';
  const options = data?.options || [];
  // Only governs whether the countdown pill and the two-step reveal are drawn. It is NOT
  // a gate on the prices any more — those render unconditionally, busy or not. A sheet
  // with nothing priced is never presented at all (see the load effect), so by the time
  // anything renders there is always something to buy.
  const canBuy = options.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* A real button, not a bare glyph: this is the "no thanks" action and it has
              to be obviously tappable, or people press the phone's back instead and the
              astrologer stays reserved for the full minute. */}
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss} activeOpacity={0.8} disabled={paying}>
            <MaterialIcons name="close" size={moderateScale(18)} color={COLORS.AstroMaroon} />
          </TouchableOpacity>

          {/* Their photo, a dashed arrow, and a call icon — one row across the top of the
              card (owner's sketch, 2026-10-04). It says "you → back on a call with them"
              before a word is read, which is the whole job of this card. Decorative, so
              the row takes no touches at all. */}
          <View style={styles.headerRow} pointerEvents="none">
            {image ? (
              <Image source={{ uri: image }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <MaterialIcons name="person" size={moderateScale(32)} color={COLORS.AstroMaroon} />
              </View>
            )}

            <View style={styles.headerArrow}>
              <View style={styles.headerDot} />
              <View style={styles.headerDot} />
              <View style={styles.headerDot} />
              <MaterialIcons
                name="arrow-forward-ios"
                size={moderateScale(13)}
                color={COLORS.AstroMaroon}
                style={styles.headerArrowHead}
              />
            </View>

            <View style={styles.callCircle}>
              <MaterialIcons name="call" size={moderateScale(27)} color={COLORS.AstroMaroon} />
            </View>
          </View>

          <Text style={styles.title}>{t('freeCallContinue.title')}</Text>
          <Text style={styles.subtitle}>{t('freeCallContinue.subtitle', { name })}</Text>

          {/* The astrologer is genuinely sitting there for this long. Shown only while
              there is something to buy — a countdown next to "they're busy now" would
              be counting down to nothing. */}
          {canBuy && secondsLeft !== null && !paying ? (
            <View style={[styles.timerPill, secondsLeft <= 15 && styles.timerPillUrgent]}>
              <MaterialIcons
                name="timer"
                size={moderateScale(14)}
                color={secondsLeft <= 15 ? '#B03A1A' : COLORS.AstroMaroon}
              />
              <Text style={[styles.timerTxt, secondsLeft <= 15 && styles.timerTxtUrgent]}>
                {t('freeCallContinue.decideIn', { time: formatLeft(secondsLeft) })}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={COLORS.AstroMaroon} style={{ marginVertical: verticalScale(18) }} />
          ) : canBuy && !revealed ? (
            /* Step one: the question, and nothing priced. The ✕ in the corner is the
               ONLY way to say no (owner, 2026-10-04) — the "No thanks" text button under
               this was removed, because two declines on one card is one too many and the
               ✕ already releases the astrologer immediately. */
            <TouchableOpacity style={styles.revealBtn} onPress={reveal} activeOpacity={0.85}>
              <MaterialIcons name="add-circle-outline" size={moderateScale(18)} color={COLORS.white} />
              <Text style={styles.revealTxt}>{t('freeCallContinue.wantMore')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.minutes}
                  style={[styles.option, paying && styles.optionDisabled]}
                  onPress={() => choose(o)}
                  activeOpacity={0.85}
                  disabled={paying}
                >
                  <View style={styles.optionLeft}>
                    <MaterialIcons name="schedule" size={moderateScale(17)} color={COLORS.AstroMaroon} />
                    <Text style={styles.optionMins}>
                      {t('freeCallContinue.moreMinutes', { minutes: o.minutes })}
                    </Text>
                  </View>
                  <Text style={styles.optionPrice}>₹{o.amount}</Text>
                </TouchableOpacity>
              ))}
              {paying ? (
                <ActivityIndicator color={COLORS.AstroMaroon} style={{ marginTop: verticalScale(8) }} />
              ) : (
                <Text style={styles.note}>{t('freeCallContinue.walletNote')}</Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: scale(20) },
  card: {
    width: '100%', maxWidth: scale(340), backgroundColor: CREAM,
    borderRadius: moderateScale(18), padding: scale(20), alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  closeBtn: {
    position: 'absolute', top: scale(10), right: scale(10),
    width: scale(30), height: scale(30), borderRadius: scale(15),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0E2D4', borderWidth: 1, borderColor: BORDER,
    zIndex: 2,
  },
  // [ photo ]  · · ·›  [ call ]
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerArrow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: scale(10),
  },
  headerDot: {
    width: scale(4), height: scale(4), borderRadius: scale(2),
    backgroundColor: COLORS.AstroMaroon, opacity: 0.45, marginRight: scale(4),
  },
  headerArrowHead: { marginLeft: scale(-1), opacity: 0.75 },
  // Same diameter as the avatar so the two sit on one optical line.
  callCircle: {
    width: scale(62), height: scale(62), borderRadius: scale(31),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F6E9DC', borderWidth: 1, borderColor: BORDER,
  },
  avatar: { width: scale(62), height: scale(62), borderRadius: scale(31), backgroundColor: COLORS.AstroSoftOrange },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: moderateScale(17), fontWeight: '800', color: COLORS.AstroMaroon, marginTop: verticalScale(10) },
  subtitle: {
    fontSize: moderateScale(12), color: '#6b584c', textAlign: 'center',
    marginTop: verticalScale(4), marginBottom: verticalScale(11), lineHeight: moderateScale(18),
  },
  revealBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch', marginTop: verticalScale(16),
    backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(14),
    paddingVertical: verticalScale(13), paddingHorizontal: scale(16),
  },
  revealTxt: {
    color: COLORS.white, fontWeight: '800', fontSize: moderateScale(14),
    marginLeft: scale(8), includeFontPadding: false,
  },
  timerPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F6E9DC', borderWidth: 1, borderColor: BORDER,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(12), paddingVertical: verticalScale(5),
    marginTop: verticalScale(14), marginBottom: verticalScale(14),
  },
  timerPillUrgent: { backgroundColor: '#FBE3DA', borderColor: '#E9BBA8' },
  timerTxt: {
    fontSize: moderateScale(12), fontWeight: '700',
    color: COLORS.AstroMaroon, marginLeft: scale(6),
  },
  timerTxtUrgent: { color: '#B03A1A' },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', backgroundColor: COLORS.white, borderRadius: moderateScale(12),
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: scale(14), paddingVertical: verticalScale(12),
    marginBottom: verticalScale(9),
  },
  optionDisabled: { opacity: 0.5 },
  optionLeft: { flexDirection: 'row', alignItems: 'center' },
  optionMins: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.AstroMaroon, marginLeft: scale(8) },
  optionPrice: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.AstroMaroon },
  note: {
    fontSize: moderateScale(10.5), color: '#7a6a5e', textAlign: 'center',
    marginTop: verticalScale(4), lineHeight: moderateScale(16),
  },
});
