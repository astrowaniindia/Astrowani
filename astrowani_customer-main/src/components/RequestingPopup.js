// src/components/RequestingPopup.js
// Drop-in request-waiting modal for any screen (chat / call / video).
// Uses the Astrowani brown theme so every "requesting…" popup looks identical.
//
// The guide mascot keeps the customer company while they wait (utils/mascotTips.js,
// tip `waiting_astrologer`). Customers were cancelling requests part-way through the
// wait, so its message changes as time passes, and after SEE_OTHERS_AFTER_S it offers
// other online astrologers instead of leaving them to give up. Switched off from the
// admin, the popup falls back to the plain version.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import {useModalPresence} from '../utils/modalPresentation';
import { captureEvent } from '../utils/Analytics';
import useElapsedSeconds from '../hooks/useElapsedSeconds';
import MascotTip from './MascotTip';
import { canShowTip, tipText, trackTipShown, trackTipAction, TIP_IDS } from '../utils/mascotTips';

const SECOND_MESSAGE_AFTER_S = 12;
// A request now rings for 5 minutes (utils/requestTimeouts.js), so "the astrologer seems
// busy, try someone else" appears at the START OF THE 4TH MINUTE — 180s — not before.
// It was 25s, tuned for the old 60-second ring, which offered other astrologers to
// someone who had barely started waiting. Keep it inside the ring: it must stay well
// below REQUEST_RING_TIMEOUT_MS or it would never be seen.
const SEE_OTHERS_AFTER_S = 180;

// `context` names the screen that raised the request, since this popup is shared by five
// of them (Home, Chat, Search, AstrologerInfo, ExpertsList).
const RequestingPopup = ({ visible, astro, onCancel, context = 'unknown' }) => {
  const { t } = React.useContext(LanguageContext);
  const navigation = useNavigation();
  // Declares this modal to the presentation registry so root-level popups wait
  // for it instead of colliding with it on iOS (utils/modalPresentation).
  useModalPresence(visible);

  // A fresh start time each time the popup opens, so the messages restart per request.
  const [startMs, setStartMs] = React.useState(null);
  React.useEffect(() => {
    setStartMs(visible ? Date.now() : null);
  }, [visible]);
  const elapsed = useElapsedSeconds(startMs, visible);

  const mascotOn = visible && canShowTip(TIP_IDS.waiting);
  React.useEffect(() => {
    if (mascotOn) trackTipShown(TIP_IDS.waiting, { context });
  }, [mascotOn, context]);

  if (!visible) return null;
  const name = astro?.name || astro?.firstName || 'the astrologer';

  const cancel = (reason) => {
    // Giving up while waiting for an astrologer to answer. Distinct from the
    // request being rejected or timing out, and the only one of the three
    // that is a decision by the customer.
    captureEvent('request_cancelled_by_customer', {
      context,
      astrologer_id: astro?.userId || astro?._id || null,
      reason,
    });
    if (onCancel) onCancel();
  };

  // Cancels this request and opens the list of astrologers for the same kind of
  // consultation, so a customer whose astrologer is not answering keeps going.
  const seeOthers = () => {
    trackTipAction(TIP_IDS.waiting, 'see_others');
    cancel('see_others');
    const tab = /call/i.test(context) ? 'Call' : 'Chat';
    try {
      navigation.navigate('DrawerNavigator', { screen: 'BottomTabs', params: { screen: tab } });
    } catch (_) {}
  };

  const mascotLine = elapsed >= SEE_OTHERS_AFTER_S
    ? tipText(TIP_IDS.waiting)
    : elapsed >= SECOND_MESSAGE_AFTER_S
      ? t('mascot.waiting_2')
      : t('mascot.waiting_1');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => cancel('back')}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={COLORS.AstroGold} />
          <Text style={styles.title}>{t('home.requestSent')}</Text>
          <Text style={[styles.sub, mascotOn && styles.subCompact]}>{t('home.waitingFor', { name })}</Text>

          {mascotOn && (
            <MascotTip
              key={elapsed >= SEE_OTHERS_AFTER_S ? 'late' : elapsed >= SECOND_MESSAGE_AFTER_S ? 'mid' : 'early'}
              tone="dark"
              text={mascotLine}
              avatarWidth={scale(40)}
              style={styles.mascot}
              actions={elapsed >= SEE_OTHERS_AFTER_S
                ? [{ label: t('mascot.action.seeOthers'), onPress: seeOthers }]
                : []}
            />
          )}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => cancel('cancel_button')}
            activeOpacity={0.85}>
            <Text style={styles.cancelText}>{t('home.cancelRequest')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '88%',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(15),
    padding: scale(22),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.AstroSoftOrange,
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: COLORS.AstroGold,
    marginTop: verticalScale(20),
    marginBottom: verticalScale(10),
  },
  sub: {
    fontSize: moderateScale(16),
    color: COLORS.AstroSoftOrange,
    textAlign: 'center',
    marginBottom: verticalScale(25),
    lineHeight: moderateScale(22),
  },
  subCompact: { marginBottom: verticalScale(14) },
  mascot: { alignSelf: 'stretch', marginBottom: verticalScale(14) },
  cancelBtn: {
    backgroundColor: COLORS.AstroSoftOrange,
    paddingHorizontal: scale(30),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(25),
    width: '100%',
    alignItems: 'center',
  },
  cancelText: {
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: moderateScale(16),
  },
});

export default RequestingPopup;
