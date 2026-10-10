// Free INSTANT call — pick an astrologer who is free right now.
//
// THE DIFFERENCE FROM THE BOOKING FLOW: no slots, no coming back later. Tapping a card
// rings that astrologer's phone immediately, exactly as a paid call does, and the
// customer waits on a "calling…" screen.
//
// BUSY ASTROLOGERS ARE SHOWN, DELIBERATELY. Hiding them would make the panel look empty
// at precisely the busiest moments, and the customer would have no way to ask for the
// one they wanted. Visible, the busy pill doubles as the "notify me" button. The server
// decides who is busy (it is the only thing that can); this screen sorts them last.
//
// The server owns everything else too: who is in the pool, how long the call is, how
// long to ring, how many astrologers one customer may try. This screen renders answers.

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, RefreshControl, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';

import { SOCKET_URL } from '../../config/api';
import { supabase } from '../../api/SupabaseClient';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { getInstantAstrologers, ringInstantAstrologer, giveUpInstantRing } from '../../api/FreeCallApi';
import { showStatusPopup } from '../../components/StatusPopup';
import StarRating from '../../components/StarRating';
import AstrologerBadge from '../../components/AstrologerBadge';
import RequestingPopup from '../../components/RequestingPopup';
import { formatBusyLabel } from '../../utils/busyLabel';
import { requestNotifyMe } from '../../utils/notifyMe';
import { captureEvent } from '../../utils/Analytics';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';
const BUSY = '#E67E22';
// The primary action here is GREEN, not the brand maroon used for paid buttons.
// On a screen whose whole point is that the call costs nothing, a dark red-brown
// button reads as "commit / pay" — the same colour the app puts on every wallet and
// checkout action. Green is already this screen's language for "free and available"
// (the ring around an idle photo, the status dot, the no-payment line), so the button
// finishing that thought is what makes the offer legible at a glance.
// Deliberately NOT the theme's #008000, which is a pure web green and clashes with the
// cream; this is the same green as the availability ring, darkened for AA contrast
// against white text (5.3:1).
const FREE_GREEN = '#137A43';

export default function InstantAstrologers({ navigation, route }) {
  const { t } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({ astrologers: [], durationMinutes: 11 });
  const [blocked, setBlocked] = useState(null); // { code, message } when the server refuses
  const [notified, setNotified] = useState({}); // astrologerId -> true

  // The in-flight ring. A ref rather than state because the ring timeout and the
  // unmount cleanup both read it from inside closures that must not go stale.
  const ringRef = useRef(null);
  const [ringing, setRinging] = useState(null); // { astrologerId, name, image }
  const ringTimerRef = useRef(null);
  const busyRef = useRef(false); // guards double-taps while a ring is being set up

  // A MOUNT-TIME socket, joined to the customer's personal room before any ring goes
  // out. Creating it inside the ring handler instead would connect too late and miss
  // an astrologer who accepts within a second or two — the exact bug that was fixed in
  // the paid Talk-To-Experts flow (CLAUDE.md, round 3).
  const socketRef = useRef(null);
  const channelRef = useRef(null);
  const navigatedRef = useRef(false);

  // ── Journey tracking ───────────────────────────────────────────────────────
  // This one screen serves two completely different experiences — the ordinary
  // multi-astrologer picker, and the campaign's single chosen astrologer — and every
  // event below used to be indistinguishable between them. Each is now stamped with
  // `variant`, so "did people call the astrologer we hand-picked for them" is a
  // question the data can actually answer.
  //
  // Refs, not state: onCall/onNotifyMe are useCallbacks that must not be rebuilt
  // (and must not read a stale `data`) every time the list refreshes on focus.
  const variantRef = useRef('picker');
  const chosenSeenRef = useRef(false);
  const screenAtRef = useRef(Date.now());
  const rangRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const res = await getInstantAstrologers();
    // A code on a successful-looking response means the server refused: not eligible,
    // offer switched off, wrong platform. Say which rather than showing an empty list.
    if (res.code) {
      setBlocked({ code: res.code, message: res.message });
    } else {
      setBlocked(null);
      setData(res);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Re-read on every focus: an astrologer who was free when the screen opened may not
  // be by the time the customer has finished reading. The ring re-checks server-side
  // regardless, so a stale list can only ever cost one polite refusal.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Fires ONCE, the first time the server's answer resolves to a chosen astrologer —
  // this is "the customer actually saw the name we picked for them", which is the
  // step every later number on this screen has to be read against. Kept out of
  // `load()` so a focus-refresh does not count as a second viewing.
  useEffect(() => {
    if (data.chosen && !chosenSeenRef.current) {
      chosenSeenRef.current = true;
      variantRef.current = 'chosen';
      captureEvent('free_call_chosen_shown', {
        astrologer_id: data.chosen.id,
        astrologer_name: data.chosen.name,
        is_busy: !!data.chosen.isBusy,
        duration_minutes: data.durationMinutes || 11,
      });
    } else if (data.chosenOffline && !chosenSeenRef.current) {
      // The reserved astrologer was offline or hidden. A campaign customer who hits
      // this sees a dead end where the whole ad promised a person, so it is tracked
      // as its own outcome rather than vanishing into "opened but never rang".
      chosenSeenRef.current = true;
      variantRef.current = 'chosen';
      captureEvent('free_call_chosen_offline');
    }
  }, [data]);

  useEffect(() => {
    captureEvent('free_call_instant_opened');
    // Copied into the effect so the cleanup below is not reading a ref (the lint rule
    // is right in general; this one is a mount timestamp that never changes).
    const openedAt = screenAtRef.current;
    let cancelled = false;
    (async () => {
      const authToken = await AsyncStorage.getItem('token');
      if (cancelled) return;
      socketRef.current = io(SOCKET_URL, { auth: { token: authToken } });
      socketRef.current.on('connect', async () => {
        const userStr = await AsyncStorage.getItem('userData');
        const user = userStr ? JSON.parse(userStr) : null;
        // Joining on every connect, not just the first, so a reconnect mid-ring still
        // receives call_accepted.
        if (user?.id) socketRef.current.emit('join_room', user.id);
      });
      socketRef.current.on('connect_error', (e) => console.log('[InstantFreeCall] socket:', e.message));
    })();
    return () => {
      cancelled = true;
      // Left the screen. `navigatedRef` is the one thing that separates "went into
      // the call" from "walked away", and without this the drop-off between seeing
      // the chosen astrologer and ringing them is invisible.
      if (!navigatedRef.current) {
        captureEvent('free_call_left_without_calling', {
          variant: variantRef.current,
          rang: rangRef.current,
          seconds_on_screen: Math.round((Date.now() - openedAt) / 1000),
        });
      }
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      // Leaving the screen mid-ring must not leave the astrologer's phone ringing for a
      // customer who has gone. Fire-and-forget: the server sweeps it anyway.
      if (ringRef.current && !navigatedRef.current) giveUpInstantRing(ringRef.current.requestId, 'cancelled');
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  /** Tear down one ring attempt. `status` is what the request row is marked as. */
  const stopRinging = useCallback((status) => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    socketRef.current?.off('call_accepted');
    socketRef.current?.off('call_rejected');
    const active = ringRef.current;
    ringRef.current = null;
    setRinging(null);
    busyRef.current = false;
    if (active && status) giveUpInstantRing(active.requestId, status);
    return active;
  }, []);

  /* The customer tapped an idle astrologer. */
  const onCall = useCallback(async (astro) => {
    if (busyRef.current || ringRef.current) return;
    busyRef.current = true;
    try {
      const res = await ringInstantAstrologer(astro.id);
      ringRef.current = { requestId: res.requestId, sessionId: res.sessionId, astrologerId: astro.id };
      navigatedRef.current = false;
      setRinging({ astrologerId: astro.id, name: astro.name, image: astro.image });
      rangRef.current = true;
      captureEvent('free_call_instant_ring', {
        astrologer_id: astro.id,
        variant: variantRef.current,
        seconds_to_ring: Math.round((Date.now() - screenAtRef.current) / 1000),
      });

      const freeSeconds = (Number(res.durationMinutes) || 11) * 60;

      // Accepted → straight into the same call screen the paid flow uses. `freeCall`
      // and `freeCallSeconds` are what put it in free mode and start its countdown.
      const goToCall = (sessionId) => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        // Closes the funnel: shown -> rang -> ANSWERED. Without it the only signals
        // are the two failures (rejected / no_answer), so a variant that connects
        // well and one that is simply never tried look the same from here.
        captureEvent('free_call_instant_answered', {
          astrologer_id: astro.id,
          variant: variantRef.current,
        });
        stopRinging(null); // accepted: do NOT mark the request cancelled
        // REPLACE, not navigate. The free call is once per customer, so this screen must
        // not be underneath the call waiting to be returned to: `goBack()` at the end of
        // the call was landing back on this grid and then drawing the "more minutes"
        // sheet and the rating prompt on top of a list of "Call free" buttons the
        // customer can no longer use. Replacing pops it, so the call ends onto whatever
        // they were on before (Home), and there is no route back to a spent offer.
        navigation.replace('VoiceCallScreen', {
          sessionId: sessionId || res.sessionId,
          recieverName: astro.name,
          recieverImage: astro.image || '',
          recieverId: astro.id,
          perMinuteCharge: 0,
          freeCall: true,
          freeCallSeconds: freeSeconds,
          freeCallMode: 'instant',
        });
      };

      const rejected = () => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        // 'rejected' is already the row's status — marking it again would overwrite
        // the astrologer's own decision with ours.
        stopRinging(null);
        captureEvent('free_call_instant_rejected', { astrologer_id: astro.id, variant: variantRef.current });
        showStatusPopup({
          variant: 'busy',
          title: t('freeCallInstant.declinedTitle'),
          message: t('freeCallInstant.declinedBody'),
        });
        load();
      };

      socketRef.current?.once('call_accepted', (d) => goToCall(d?.sessionId));
      socketRef.current?.on('call_rejected', rejected);

      // Realtime backup, in case the socket misses it. Unique channel name per attempt —
      // a fixed one returns the already-subscribed channel and the .on() then throws
      // (CLAUDE.md, round 6).
      channelRef.current = supabase
        .channel(`fc_instant_${res.requestId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'call_requests', filter: `id=eq.${res.requestId}`,
        }, (payload) => {
          if (payload.new.status === 'accepted') goToCall(payload.new.session_id);
          else if (payload.new.status === 'rejected') rejected();
        })
        .subscribe();

      // Ring for the server-set window, then hand them back to the list so they can try
      // somebody else. 'missed' rather than 'cancelled': the astrologer did not answer,
      // and that distinction is the one the admin dashboard reports on.
      const ms = (Number(res.ringTimeoutSeconds) || 60) * 1000;
      ringTimerRef.current = setTimeout(() => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        stopRinging('missed');
        captureEvent('free_call_instant_no_answer', { astrologer_id: astro.id, variant: variantRef.current });
        showStatusPopup({
          variant: 'missed',
          title: t('freeCallInstant.noAnswerTitle'),
          message: t('freeCallInstant.noAnswerBody'),
        });
        load();
      }, ms);
    } catch (err) {
      busyRef.current = false;
      if (err.code === 'ASTROLOGER_BUSY') {
        showStatusPopup({
          variant: 'busy',
          title: t('freeCallInstant.justBusyTitle'),
          message: t('freeCallInstant.justBusyBody'),
        });
        load();
        return;
      }
      if (err.code === 'TOO_MANY_ATTEMPTS' || err.code === 'ALREADY_USED' || err.code === 'NOT_ELIGIBLE') {
        setBlocked({ code: err.code, message: err.message });
        return;
      }
      showStatusPopup({ variant: 'error', title: t('freeCallInstant.failedTitle'), message: err.message });
    }
  }, [load, stopRinging, t, navigation]);

  /* The customer tapped a busy astrologer's pill. */
  const onNotifyMe = useCallback(async (astro) => {
    if (notified[astro.id]) return;
    // Optimistic: the button says "we'll tell you" straight away. requestNotifyMe asks
    // for notification permission first — see src/utils/notifyMe.js.
    const res = await requestNotifyMe(astro.id, 'audio', { t });
    if (res?.ok) {
      setNotified((prev) => ({ ...prev, [astro.id]: true }));
      captureEvent('free_call_instant_notify_me', { astrologer_id: astro.id, variant: variantRef.current });
    }
  }, [notified, t]);

  const renderCard = ({ item }) => {
    // An odd-length list gets one padding entry (see gridData). Without it a lone card
    // stretches to the full row and looks like the old wide card — flex:1 fills whatever
    // space the row gives it, and a one-item row gives it everything.
    if (item.__spacer) return <View style={styles.cardSpacer} />;

    const busy = item.isBusy;
    const elapsed = item.busySince
      ? Math.max(0, Math.round((Date.now() - new Date(item.busySince).getTime()) / 1000))
      : 0;
    const press = () => (busy ? onNotifyMe(item) : onCall(item));

    return (
      // THE WHOLE CARD IS THE BUTTON. Only the small pill was tappable before, which is
      // the thing that made this screen feel inert — people aim at the face and the name.
      <TouchableOpacity
        style={[styles.card, busy && styles.cardBusy]}
        onPress={press}
        activeOpacity={0.85}
      >
        {/* Two tiles per row, so a pool of six reads as a grid you can scan at a glance
            rather than six full-width slabs you have to scroll through. Everything the
            wide card carried is still here — photo, badge, name, live status, rating,
            experience, languages — just stacked instead of spread, because at half width
            there is no room for a side-by-side arrangement. */}
        <View style={styles.cardTop}>
          <View style={styles.avatarWrap}>
            {/* A live ring around the photo: green when they can be called right now,
                amber when they are mid-consultation. It is the fastest read on the card. */}
            <View style={[styles.avatarRing, busy && styles.avatarRingBusy]}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Icon name="person" size={moderateScale(28)} color={COLORS.AstroMaroon} />
                </View>
              )}
            </View>
            <AstrologerBadge type={item.badgeType} size={scale(58)} />
          </View>

          {/* Two lines, not one: at half width plenty of real names wrap, and truncating
              an astrologer's name to "Acharya Vish..." is a poor way to ask someone to
              pick them. */}
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>

          <View style={styles.statusRow}>
            <View style={[styles.dot, busy && styles.dotBusy]} />
            <Text style={[styles.statusTxt, busy && styles.statusTxtBusy]} numberOfLines={1}>
              {busy ? formatBusyLabel(elapsed) : t('freeCallInstant.availableNow')}
            </Text>
          </View>

          {item.rating > 0 && (
            <View style={styles.ratingRow}>
              <StarRating rating={item.rating} size={moderateScale(10)} />
              {item.totalReviews > 0 && (
                <Text style={styles.reviews}>({item.totalReviews})</Text>
              )}
            </View>
          )}

          <View style={styles.chipRow}>
            {item.experience > 0 && (
              <View style={styles.chip}>
                <Text style={styles.chipTxt} numberOfLines={1}>
                  {item.experience} {t('freeCallInstant.yearsExp')}
                </Text>
              </View>
            )}
            {!!item.languages?.length && (
              <View style={styles.chip}>
                {/* Languages are joined and clipped to one line. A tile cannot show four
                    languages without pushing the button off the bottom, and the button is
                    the point of the tile. */}
                <Text style={styles.chipTxt} numberOfLines={1}>{item.languages.join(' · ')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* An action bar the full width of the tile rather than a small pill. It is the
            only thing to do on this card, so it should look like it. The chevron the wide
            card carried is dropped here: at half width it stole room from the label and
            the whole tile is the button anyway, so it pointed at nothing. */}
        <View style={[styles.actionBar, busy && styles.actionBarBusy]}>
          <Icon
            name={busy ? (notified[item.id] ? 'notifications-active' : 'notifications-none') : 'call'}
            size={moderateScale(16)}
            color={COLORS.white}
          />
          <Text style={styles.actionTxt} numberOfLines={1}>
            {busy
              ? (notified[item.id] ? t('freeCallInstant.notified') : t('freeCallInstant.notifyMe'))
              : t('freeCallInstant.callFree')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Pad to an even count so every row has two cells. Cheaper and more predictable than
  // giving the card a percentage maxWidth, which has to be kept in step with the row gap
  // by hand and drifts the moment either changes.
  /* ── One astrologer, chosen for this customer ───────────────────────────────
   * A campaign customer is not shown a panel to choose from: the server answers
   * `chosen` instead of a list (see /api/free-call/instant/astrologers), and this
   * screen renders that one astrologer as a full-width hero.
   *
   * It reuses onCall/onNotifyMe unchanged. The ringing, the waiting popup, the
   * accept socket and the navigation into the call are identical to the picker's —
   * only the choosing is removed, so there is no second call path to keep working.
   */
  const chosen = data.chosen || null;

  const renderChosen = () => {
    const busy = chosen.isBusy;
    return (
      <View style={styles.chosenPage}>
        <View style={styles.chosenBadge}>
          <Icon name="timer" size={moderateScale(14)} color={COLORS.AstroMaroon} />
          <Text style={styles.chosenBadgeTxt}>
            {t('metroChosen.badge', { minutes: data.durationMinutes || 11 })}
          </Text>
        </View>

        <Text style={styles.chosenHead}>{t('metroChosen.chosenForYou')}</Text>

        <View style={styles.chosenCard}>
          <View style={[styles.chosenRing, busy && styles.chosenRingBusy]}>
            {chosen.image ? (
              <Image source={{ uri: chosen.image }} style={styles.chosenAvatar} />
            ) : (
              <View style={[styles.chosenAvatar, styles.avatarFallback]}>
                <Icon name="person" size={moderateScale(54)} color={COLORS.AstroMaroon} />
              </View>
            )}
          </View>
          {/* Bigger than the avatar's own size (118) on purpose -- this card is the
              one place the ribbon is the only badge on screen, so it can afford to
              read larger than the shared sizing used on list tiles/profile. */}
          <AstrologerBadge type={chosen.badgeType} size={scale(168)} />

          <Text style={styles.chosenName} numberOfLines={2}>{chosen.name}</Text>

          <View style={styles.statusRow}>
            <View style={[styles.dot, busy && styles.dotBusy]} />
            <Text style={[styles.statusTxt, busy && styles.statusTxtBusy]}>
              {busy ? t('metroChosen.busyNow') : t('metroChosen.availableNow')}
            </Text>
          </View>

          {chosen.rating > 0 && (
            <View style={styles.ratingRow}>
              <StarRating rating={chosen.rating} size={moderateScale(13)} />
              {chosen.totalReviews > 0 && <Text style={styles.reviews}>({chosen.totalReviews})</Text>}
            </View>
          )}

          {chosen.experience > 0 && (
            <Text style={styles.chosenExp}>
              {chosen.experience} {t('metroChosen.yearsExp')}
            </Text>
          )}

          <Text style={styles.chosenSub}>{t('metroChosen.subline')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.chosenCta, busy && styles.chosenCtaBusy]}
          activeOpacity={0.88}
          onPress={() => (busy ? onNotifyMe(chosen) : onCall(chosen))}
        >
          <Icon name={busy ? 'notifications-none' : 'call'} size={moderateScale(20)} color={COLORS.white} />
          <Text style={styles.chosenCtaTxt}>
            {busy
              ? (notified[chosen.id] ? t('freeCallInstant.notified') : t('metroChosen.ctaBusy'))
              : t('metroChosen.cta')}
          </Text>
        </TouchableOpacity>

        <View style={styles.trustRow}>
          <Icon name="verified-user" size={moderateScale(13)} color="#1E6B45" />
          <Text style={styles.trustTxt}>{t('metroChosen.trustLine')}</Text>
        </View>
      </View>
    );
  };

  const gridData = useMemo(() => {
    const list = data.astrologers || [];
    return list.length % 2 === 1 ? [...list, { id: '__spacer__', __spacer: true }] : list;
  }, [data.astrologers]);

  // Sent back here because the astrologer hung up before the call was really under
  // way. Their free call was NOT spent (the server unlinks the booking for exactly
  // this), so the honest thing is to say what happened and let them pick again.
  // Shown once per arrival — a flag on the route, cleared immediately so a re-render
  // or a focus event cannot raise it twice.
  const busyNoticeShown = useRef(false);
  useEffect(() => {
    if (!route?.params?.astrologerBusy || busyNoticeShown.current) return;
    busyNoticeShown.current = true;
    navigation.setParams({ astrologerBusy: false });
    showStatusPopup({
      variant: 'busy',
      title: t('freeCallInstant.droppedTitle'),
      message: t('freeCallInstant.droppedBody'),
    });
  }, [route?.params?.astrologerBusy, navigation, t]);

  const idleCount = (data.astrologers || []).filter((a) => !a.isBusy).length;
  const anyIdle = idleCount > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.AstroMaroon} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-back" size={moderateScale(22)} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('freeCallInstant.title', { minutes: data.durationMinutes || 11 })}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centre}><ActivityIndicator size="large" color={COLORS.AstroMaroon} /></View>
      ) : chosen ? (
        renderChosen()
      ) : data.chosenOffline ? (
        <View style={styles.centre}>
          <Icon name="schedule" size={moderateScale(42)} color={COLORS.AstroMaroon} />
          <Text style={styles.blockedTxt}>{t('metroChosen.offline')}</Text>
        </View>
      ) : blocked ? (
        <View style={styles.centre}>
          <Icon name="info-outline" size={moderateScale(42)} color={COLORS.AstroMaroon} />
          <Text style={styles.blockedTxt}>{blocked.message || t('freeCallInstant.notAvailable')}</Text>
        </View>
      ) : !data.astrologers?.length ? (
        <View style={styles.centre}>
          <Icon name="schedule" size={moderateScale(42)} color={COLORS.AstroMaroon} />
          {/* Honest rather than hopeful. Pretending somebody is about to appear is worse
              than saying the panel is offline and giving them a reason to come back. */}
          <Text style={styles.blockedTxt}>{t('freeCallInstant.nobodyOnline')}</Text>
        </View>
      ) : (
        <>
          {/* A short hero instead of a bare sentence on cream. It restates what is being
              given away and how many people can take it right now — the screen previously
              opened with one grey line above a lot of empty space. */}
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              {/* A stopwatch, not a gift box. What is being handed over is TIME with a
                  real astrologer; a present icon reads as a coupon or a giveaway and
                  undersells it. It also pairs with the minutes figure beside it. */}
              <Icon name="timer" size={moderateScale(14)} color={COLORS.AstroMaroon} />
              <Text style={styles.heroBadgeTxt}>
                {t('freeCallInstant.minutesOnUs', { minutes: data.durationMinutes || 11 })}
              </Text>
            </View>
            <Text style={styles.heroLine}>
              {anyIdle ? t('freeCallInstant.pickAnyone') : t('freeCallInstant.allBusy')}
            </Text>
            <Text style={styles.heroCount}>
              {idleCount > 0
                ? t('freeCallInstant.availableCount', { count: idleCount })
                : t('freeCallInstant.everyoneBusy')}
            </Text>
          </View>

          <FlatList
            data={gridData}
            keyExtractor={(a) => String(a.id)}
            renderItem={renderCard}
            // Two per row. `columnWrapperStyle` spaces the pair; the tile itself uses
            // flex:1 rather than a hard width, so it adapts to the screen instead of
            // overflowing on a narrow device or leaving a gap on a wide one.
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[COLORS.AstroMaroon]} />
            }
            ListFooterComponent={(
              // Fills the dead space under a short list with the reassurance that
              // actually matters at this moment.
              <View style={styles.trustRow}>
                <Icon name="verified-user" size={moderateScale(13)} color="#1E6B45" />
                <Text style={styles.trustTxt}>{t('freeCallInstant.trustLine')}</Text>
              </View>
            )}
          />
        </>
      )}

      {/* The same waiting popup the paid call flow uses, so "calling…" looks identical
          whichever way the customer got here. */}
      <RequestingPopup
        visible={!!ringing}
        astro={ringing ? { name: ringing.name, profileImage: ringing.image } : null}
        onCancel={() => { stopRinging('cancelled'); load(); }}
        context="free_call_instant"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
  },
  back: { marginRight: scale(10) },
  headerTitle: { flex: 1, color: COLORS.white, fontSize: moderateScale(16), fontWeight: '700' },
  hero: { paddingHorizontal: scale(16), paddingTop: verticalScale(14), paddingBottom: verticalScale(6) },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: COLORS.AstroGold, borderRadius: moderateScale(12),
    paddingHorizontal: scale(9), paddingVertical: verticalScale(3),
    marginBottom: verticalScale(7),
  },
  heroBadgeTxt: {
    fontSize: moderateScale(10.5), fontWeight: '800',
    color: COLORS.AstroMaroon, marginLeft: scale(4),
  },
  heroLine: {
    fontSize: moderateScale(14), fontWeight: '700',
    color: COLORS.AstroMaroon, lineHeight: moderateScale(20),
  },
  heroCount: { fontSize: moderateScale(11), color: '#8a7668', marginTop: verticalScale(3) },

  list: { paddingHorizontal: scale(14), paddingTop: verticalScale(8), paddingBottom: verticalScale(24) },

  // Each pair of tiles in a row. The gap between them is created here so the tiles
  // themselves stay plain flex:1 boxes.
  row: { gap: scale(11) },
  // Invisible half-row filler. Same flex as a card so the real one keeps its width.
  cardSpacer: { flex: 1 },

  card: {
    // flex:1 inside a 2-column row, NOT a fixed width — a hard width computed from
    // Dimensions overflows on a small phone and leaves a dead gutter on a large one.
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: BORDER,
    padding: scale(10),
    marginBottom: verticalScale(11),
    // A real lift, so the card reads as a raised, pressable surface rather than a
    // hairline box on a cream background.
    shadowColor: '#5b3a22',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardBusy: { backgroundColor: '#FFFDF8' },
  // Centred column: at half width a left-aligned block looks lopsided next to a
  // centred photo, and centring keeps the two tiles in a row visually paired.
  cardTop: { alignItems: 'center' },

  // AstrologerBadge's 'corner' variant is absolutely positioned, so its parent needs
  // position: relative — without it the badge lands in the wrong place on Android.
  avatarWrap: { position: 'relative', marginBottom: verticalScale(7) },
  avatarRing: {
    width: scale(58), height: scale(58), borderRadius: scale(29),
    borderWidth: 2, borderColor: '#1E9E5A',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarRingBusy: { borderColor: BUSY },
  avatar: { width: scale(50), height: scale(50), borderRadius: scale(25), backgroundColor: COLORS.AstroSoftOrange },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },

  name: {
    fontSize: moderateScale(13), fontWeight: '800', color: COLORS.AstroMaroon,
    textAlign: 'center', lineHeight: moderateScale(17),
    // Reserve both lines so a one-line name and a two-line name produce tiles of the
    // same height — otherwise the two buttons in a row sit at different heights.
    minHeight: moderateScale(34),
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(2) },
  dot: {
    width: scale(6), height: scale(6), borderRadius: scale(3),
    backgroundColor: '#1E9E5A', marginRight: scale(4),
  },
  dotBusy: { backgroundColor: BUSY },
  statusTxt: { fontSize: moderateScale(10), fontWeight: '700', color: '#1E9E5A' },
  statusTxtBusy: { color: BUSY },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(3) },
  reviews: { fontSize: moderateScale(9), color: '#9b8a7c', marginLeft: scale(3) },
  // Experience and languages are FACTS ABOUT the astrologer, not actions. Giving them a
  // filled rounded background made them read as buttons sitting directly above the one
  // real button on the card, which is the worst place to put something that looks
  // tappable but is not. Plain centred text.
  chipRow: { alignSelf: 'stretch', alignItems: 'center', marginTop: verticalScale(4), marginBottom: verticalScale(8) },
  chip: { alignSelf: 'stretch', paddingHorizontal: scale(2), marginBottom: verticalScale(1) },
  chipTxt: {
    fontSize: moderateScale(9.5), color: '#8a7668', fontWeight: '500',
    textAlign: 'center', lineHeight: moderateScale(14),
  },

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FREE_GREEN,
    borderRadius: moderateScale(12),
    // A real tap target with the label centred in it. NOTE: do not add a separate
    // `paddingTop` after this — an earlier version set `paddingTop: 0` below, which
    // silently overrode the top half of `paddingVertical` and pushed the label off
    // centre inside the button. That is what "the text isn't sitting in the button"
    // was.
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(6),
    minHeight: verticalScale(44),
    alignSelf: 'stretch',
    // 'auto' (not a fixed gap) pushes the button to the bottom of the tile, so the two
    // buttons in a row line up even when one astrologer has a rating row and the other
    // does not. The row stretches both tiles to the taller of the pair.
    marginTop: 'auto',
  },
  // Orange, not the red used for a switched-off service: busy is temporary and the
  // action still does something useful.
  actionBarBusy: { backgroundColor: BUSY },
  actionTxt: {
    color: COLORS.white, fontSize: moderateScale(14.5), fontWeight: '800',
    marginLeft: scale(6), includeFontPadding: false,
  },

  /* ── The single chosen astrologer (campaign flow) ───────────────────────── */
  chosenPage: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(14),
    paddingBottom: verticalScale(18),
  },
  chosenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(13),
    paddingVertical: verticalScale(5),
  },
  chosenBadgeTxt: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(12),
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  chosenHead: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(20),
    fontWeight: '900',
    textAlign: 'center',
    marginTop: verticalScale(12),
    paddingHorizontal: scale(10),
  },
  // ONE card filling the width, not a tile in a grid: there is nothing to compare
  // it against, and a half-width card would read as the first of several.
  chosenCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: CREAM,
    borderRadius: moderateScale(22),
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(18),
    marginTop: verticalScale(14),
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  chosenRing: {
    width: scale(132),
    height: scale(132),
    borderRadius: scale(66),
    borderWidth: 3,
    borderColor: FREE_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chosenRingBusy: { borderColor: BUSY },
  chosenAvatar: {
    width: scale(118),
    height: scale(118),
    borderRadius: scale(59),
    backgroundColor: '#EFE2D6',
  },
  chosenName: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(22),
    fontWeight: '900',
    textAlign: 'center',
    marginTop: verticalScale(10),
  },
  chosenExp: {
    color: '#7a675a',
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    marginTop: verticalScale(5),
  },
  chosenSub: {
    color: '#6A4A38',
    fontSize: moderateScale(13),
    fontWeight: '600',
    lineHeight: moderateScale(19),
    textAlign: 'center',
    marginTop: verticalScale(11),
  },
  chosenCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(9),
    alignSelf: 'stretch',
    backgroundColor: FREE_GREEN,
    borderRadius: moderateScale(28),
    paddingVertical: verticalScale(16),
    marginTop: verticalScale(18),
    elevation: 6,
  },
  chosenCtaBusy: { backgroundColor: BUSY },
  chosenCtaTxt: {
    color: COLORS.white,
    fontSize: moderateScale(17),
    fontWeight: '900',
  },

  trustRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: verticalScale(6),
  },
  trustTxt: { fontSize: moderateScale(10.5), color: '#1E6B45', marginLeft: scale(5), fontWeight: '600' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(32) },
  blockedTxt: {
    marginTop: verticalScale(12),
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(13),
    lineHeight: moderateScale(19),
  },
});
