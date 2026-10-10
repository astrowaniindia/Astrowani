// Draws the carried-over gift bubble ABOVE the navigator, so it survives every screen
// change between the campaign reveal and Home. See utils/pendingGiftBubble.js for why
// this cannot live inside a screen.
//
// Geometry, colours and the label are deliberately identical to
// components/FreeCallGiftBubble (Home's own floating gift) and to the bubble
// CampaignGiftReveal collapses into — the three are meant to read as ONE object that
// the customer watched land in the corner and then carried with them.
//
// It IS tappable: tapping raises a small "your free call is reserved" sheet whose
// button takes the customer to whichever step they are actually missing — phone
// number, name, or (everything done) straight to the 11-minute astrologer picker.
// A reminder they cannot act on is just a sticker; this is the way back into the
// offer for someone who pressed ✕ on the reveal.
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { onPendingGiftChange, hidePendingGift } from '../utils/pendingGiftBubble';
import { queueFreeCallFromCampaign } from '../utils/freeCallInvite';
import { navigationRef } from '../utils/NavigationService';
import useDraggableBubble from '../hooks/useDraggableBubble';
import { captureEvent } from '../utils/Analytics';
import { showSignupNudge } from '../utils/signupNudge';
import { NUDGE_MS } from './SignupNudgeHost';
import ShineButton from './ShineButton';
// The REAL badge and face cluster from Home's own offer card, not copies — the card
// either is the same card or it isn't.
import { LiveBookedBadge, AstrologerCluster } from './FreeCallOffer';
import Instance from '../api/ApiCall';

// The free-call duration this pre-login card advertises. Home's own card reads it from
// the server's offer; there is no account here to fetch one against, and the campaign
// that leads to this screen is sold on eleven minutes throughout.
const FREE_MINUTES = 11;
// Home's card gets its faces from the server's offer roster, which needs an account.
// There is none here, so the faces come from the PUBLIC astrologer list (the same
// approved, visible astrologers that roster is built from) — real bookable people,
// never a placeholder. The card simply renders no cluster if the call fails.
const CLUSTER_FACES = 5;
// Matches the Home popup's own figure, so the same claim is not stated two ways.
const BOOKED_COUNT = 359;

const SIZE = scale(52);
// How far the bubble's own bottom edge sits off the screen bottom. The label hangs
// BELOW it (absolutely positioned), so this is also the room the label needs —
// CampaignGiftReveal's BUBBLE_BOTTOM must match, or the gift jumps at the hand-off.
const BOTTOM = verticalScale(48);
// The hint pill is wider than the bubble, so the wrap is the pill's width and the
// bubble is CENTRED in it — otherwise the circle hangs off to the right of the text
// it belongs to. CampaignGiftReveal derives its landing spot from the same numbers.
export const GIFT_LABEL_W = scale(126);
export const GIFT_EDGE = scale(14);

/**
 * Which part of signing up this customer still owes us. Read at tap time rather than
 * kept in state: the bubble outlives several screens and the answer changes under it.
 */
async function resolveStep() {
  let token = null;
  let name = null;
  try {
    token = await AsyncStorage.getItem('token');
  } catch (_) {}
  if (!token) return 'phone';
  try {
    const raw = await AsyncStorage.getItem('userData');
    if (raw) name = JSON.parse(raw)?.name;
  } catch (_) {}
  if (!name || !String(name).trim()) return 'name';
  return 'ready';
}

export default function PendingGiftBubbleHost() {
  const { t } = useContext(LanguageContext);
  const [visible, setVisible] = useState(false);
  const [sheet, setSheet] = useState(null); // null | 'phone' | 'name' | 'ready'
  const [faces, setFaces] = useState([]);
  const pulse = useRef(new Animated.Value(0)).current;
  // Drag it anywhere; it stays where it is put, here and on Home.
  const { panHandlers, dragStyle } = useDraggableBubble();

  useEffect(() => onPendingGiftChange(setVisible), []);

  // Fetched once the bubble appears, so the faces are already there when the card is
  // opened. Best effort in every direction: no token is needed, nothing waits on it,
  // and a failure just means AstrologerCluster renders nothing.
  useEffect(() => {
    if (!visible || faces.length) return;
    let alive = true;
    Instance.get('/api/astrologers')
      .then((res) => {
        if (!alive) return;
        const rows = Array.isArray(res?.data) ? res.data : (res?.data?.data || []);
        setFaces(
          rows
            .filter((a) => a?.name)
            .slice(0, CLUSTER_FACES)
            .map((a) => ({ name: a.name, image: a.profileImage || '' })),
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [visible, faces.length]);

  useEffect(() => {
    if (!visible) return undefined;
    // Starts AT scale 1, so the hand-off from the collapsing bubble is seamless —
    // an entrance animation here would make the bubble appear to land twice.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  const openSheet = async () => {
    const step = await resolveStep();
    captureEvent('campaign_gift_bubble_tapped', { step });
    setSheet(step);
  };

  const claim = () => {
    const step = sheet;
    setSheet(null);
    // Re-arms the campaign hand-off even for someone who pressed ✕ on the reveal
    // (which queued a decline): SignupWelcome reads this and sends them straight to
    // the 11-minute picker instead of showing its own offer card.
    queueFreeCallFromCampaign();
    captureEvent('campaign_gift_bubble_claimed', { step });
    if (!navigationRef.isReady()) return;
    // Still owes us a sign-up step: say so warmly first, then move them there by
    // itself. Dropping someone onto a phone-number field straight off "claim my free
    // call" is what reads as a catch (see components/SignupNudgeHost).
    if (step === 'phone' || step === 'name') {
      const route = step === 'phone' ? 'Login' : 'SignupName';
      showSignupNudge();
      setTimeout(() => {
        if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: route }] });
      }, NUDGE_MS);
      return;
    }
    // Nothing left to collect — the offer itself.
    hidePendingGift();
    navigationRef.navigate('InstantAstrologers');
  };

  if (!visible) return null;

  const scaleAnim = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });

  // NOTE: `sheet` still carries which step this customer owes us — it decides where
  // the button goes — but the card no longer SAYS it. The card is Home's card; a line
  // about phone numbers on it is a sign-up instruction sitting inside an offer.

  return (
    <>
      <Animated.View style={[styles.wrap, dragStyle]} pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
        />
        {/* The drag handle is the CIRCLE, not the wrap: the wrap is box-none so the
            rest of the screen stays usable around the bubble, and a box-none view
            never receives the gesture itself. */}
        <View {...panHandlers}>
          <TouchableOpacity activeOpacity={0.8} onPress={openSheet} accessibilityRole="button">
            <Animated.View style={[styles.bubble, { transform: [{ scale: scaleAnim }] }]}>
              <MaterialIcons name="card-giftcard" size={moderateScale(24)} color={COLORS.AstroGold} />
            </Animated.View>
          </TouchableOpacity>
        </View>
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={styles.label} numberOfLines={2}>{t('freeCall.giftHint')}</Text>
        </View>
      </Animated.View>

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          {/* Swallows taps on the card itself, so only the backdrop dismisses. */}
          {/* Deliberately the SAME card Home raises from its own gift bubble
              (components/FreeCallOffer's intro step): maroon header with the gold
              "limited offer" tag and the minutes line, cream body, one big button,
              the green trust line. The offer is one offer, so it must not have two
              different faces either side of signing up. The slot picker underneath it
              there is server-driven and has nothing to pick from before there is an
              account, so this card's button leads into the sign-up instead. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.cardHeader}>
              <LiveBookedBadge count={BOOKED_COUNT} />
              <View style={styles.limitedTag}>
                <MaterialIcons name="card-giftcard" size={moderateScale(19)} color={COLORS.AstroMaroon} />
                <Text style={styles.limitedTagText}>{t('freeCall.limitedOffer')}</Text>
              </View>
              <Text style={styles.freeSub}>
                {t('freeCall.minutesCall', { count: FREE_MINUTES })}
              </Text>
            </View>

            <View style={styles.cardBody}>
              <AstrologerCluster list={faces} t={t} instant />
              <ShineButton style={styles.cardCta} onPress={claim}>
                <Text style={styles.cardCtaText}>{t('freeCall.claimFree')}</Text>
              </ShineButton>
              <Text style={styles.trustLine}>{t('freeCall.trustLine')}</Text>
              <TouchableOpacity onPress={() => setSheet(null)} activeOpacity={0.7}>
                <Text style={styles.cardLater}>{t('campaignGift.claimLater')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Lower than Home's own bubble (verticalScale(86)) on purpose: that clearance exists
  // to stay off Home's bottom tab bar, and there is no tab bar on Login/OTP/name — up
  // there it floated into the middle of those screens instead of sitting in the corner.
  // The BUBBLE is what is anchored here (the label hangs below it absolutely), which is
  // what lets CampaignGiftReveal's collapse land on exactly the same spot.
  wrap: {
    position: 'absolute',
    right: GIFT_EDGE,
    bottom: BOTTOM,
    width: GIFT_LABEL_W,
    alignItems: 'center',
    zIndex: 90,
  },
  ring: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.AstroMaroon,
  },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  labelWrap: {
    position: 'absolute',
    top: SIZE + verticalScale(5),
    left: 0,
    right: 0,
    backgroundColor: '#FFF9F3',
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    borderWidth: 1,
    borderColor: '#E9D9C9',
  },
  label: {
    fontSize: moderateScale(9),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: moderateScale(12),
  },

  // All of the below mirrors components/FreeCallOffer's own card styles — keep the two
  // in step if that card is restyled.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,12,6,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(20),
  },
  card: {
    width: '100%',
    maxWidth: scale(360),
    backgroundColor: '#FFF8EE',
    borderRadius: moderateScale(22),
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  cardHeader: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(18),
    alignItems: 'center',
  },
  limitedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(24),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(7),
  },
  limitedTagText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(15),
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  freeSub: {
    color: '#fff',
    fontSize: moderateScale(22),
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: moderateScale(29),
    marginTop: verticalScale(12),
  },
  cardBody: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(16),
    alignItems: 'center',
  },
  cardCta: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(16),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: verticalScale(16),
  },
  cardCtaText: { color: '#fff', fontWeight: '800', fontSize: moderateScale(18) },
  trustLine: {
    color: '#2E7D4F',
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    marginTop: verticalScale(10),
    textAlign: 'center',
  },
  cardLater: {
    color: '#8A6A58',
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(14),
  },
});
