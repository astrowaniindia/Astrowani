// Incoming chat/call request, rendered INLINE on the dashboard — deliberately NOT a Modal.
//
// WHY NOT A MODAL (reported 2026-09-28, costing real consultations): the old
// NotificationPopup was a `<Modal>` with no onRequestClose. On Android, RN tears that
// dialog down natively on a back press while JS still believes `visible === true`, so the
// request could never be shown again — the astrologer tapped once by accident and the
// request was gone for good while the customer's phone kept ringing. The same trap is
// already documented in CLAUDE.md for the forced-update prompt, whose fix was likewise to
// stop using a Modal.
//
// Rendered as an ordinary view at the top of the dashboard, there is nothing to dismiss:
// no backdrop to mis-tap, no dialog for the OS to tear down. It stays until the astrologer
// accepts or declines, or the request is cancelled/times out server-side.
import React, { useContext, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LanguageContext } from '../context/LanguageContext';
import { COLORS } from '../Theme/Colors';

const IncomingRequestCard = ({ data, onAccept, onCancel, queueCount = 0 }) => {
  const { t } = useContext(LanguageContext);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const visible = !!data;

  useEffect(() => {
    if (!visible) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    // Stop on hide, or the animation keeps running against an unmounted card.
    return () => { loop.stop(); pulseAnim.setValue(1); };
  }, [visible, pulseAnim]);

  if (!visible) return null;

  const isChat = data.callType === 'chat' || data.table === 'chat_requests';
  const isVideo = data.callType === 'video';
  const title = isVideo
    ? t('popup.incomingVideoCall')
    : isChat
      ? t('popup.incomingChat')
      : t('popup.incomingCall');
  const icon = isVideo ? 'videocam' : isChat ? 'chatbubble-ellipses' : 'call';

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <Text style={styles.title}>{title}</Text>
        {queueCount > 0 && (
          <View style={styles.queueBadge}>
            <Text style={styles.queueBadgeText}>+{queueCount}</Text>
          </View>
        )}
      </View>

      <Text style={styles.callerName} numberOfLines={1}>
        {data.callerName || t('common.customer')}
      </Text>
      <Text style={styles.message}>{t('popup.requesting')}</Text>

      {/* NOTE: the free-intro-call tag ("Free intro call · N min") that the old popup
          carried is deliberately NOT here. It belongs to the free-intro-call feature,
          which is not shipped yet, and its i18n keys ship with it. Add it back as part
          of that feature — labelling a free call plainly matters, because dressing it up
          as an ordinary paid call raises pick-up exactly once and then the astrologer
          finds out from their earnings. */}

      {queueCount > 0 && (
        <Text style={styles.queueNote}>
          +{queueCount} {t('popup.moreWaiting')}
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.declineButton} onPress={onCancel} activeOpacity={0.85}>
          <Ionicons name="close" size={22} color="#fff" />
          <Text style={styles.buttonText}>{t('popup.decline')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.acceptButton} onPress={onAccept} activeOpacity={0.85}>
          <Ionicons name={isChat ? 'chatbubble' : 'call'} size={22} color="#fff" />
          <Text style={styles.buttonText}>{t('common.accept')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#4CAF50',
    padding: 18,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  queueBadge: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  queueBadgeText: {
    color: COLORS.AstroMaroon,
    fontWeight: '800',
    fontSize: 12,
  },
  callerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  message: {
    fontSize: 15,
    color: '#bbb',
    marginBottom: 16,
  },
  queueNote: {
    fontSize: 13,
    color: '#FFD700',
    marginTop: -8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 30,
    width: '48%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    elevation: 4,
  },
  declineButton: {
    backgroundColor: '#F44336',
    paddingVertical: 14,
    borderRadius: 30,
    width: '48%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
});

export default IncomingRequestCard;
