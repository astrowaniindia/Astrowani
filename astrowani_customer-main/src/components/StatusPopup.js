// Themed, app-wide status popup (replaces the default Android Alert for
// call/chat outcomes like "missed" / "busy"). Imperative API so any screen or
// hook can show it without wiring local state:
//
//   import { showStatusPopup } from '../../components/StatusPopup';
//   showStatusPopup({ variant: 'missed', title: 'Not Answered', message: '…' });
//
// Also supports a two-button confirm (e.g. "pay to send this gift" / "end this
// call?") by passing onConfirm — a single onPress button is shown otherwise,
// exactly as before:
//
//   showStatusPopup({
//     variant: 'confirmPay', title: 'Confirm', message: '…',
//     confirmText: 'Pay ₹25', cancelText: 'Cancel', onConfirm: () => { … },
//   });
//
// And a three-button stacked layout (e.g. "insufficient balance — recharge, or
// refer a friend instead?") by additionally passing onExtra/extraText:
//
//   showStatusPopup({
//     variant: 'insufficient', title: 'Insufficient Balance', message: '…',
//     confirmText: 'Recharge', onConfirm: () => { … },
//     extraText: 'Refer & Earn ₹50', onExtra: () => { … },
//     cancelText: 'Cancel', onCancel: () => { … },
//   });
//
// Mount <StatusPopupHost /> ONCE near the navigation root.
import React, { useEffect, useState, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import {useDeferredPresent, useModalPresence} from '../utils/modalPresentation';

let listener = null;
// Reasons a consult never became a request row at all. These attempts leave NO trace
// in Postgres — call_requests/chat_requests are only written after these checks pass —
// so without an event here they were invisible everywhere, including the low-balance
// case, which is a direct revenue leak. Instrumented centrally on the popup rather
// than at the ~21 individual call sites, because every one of those paths ends here.
const BLOCK_REASON_BY_VARIANT = {
  busy: 'astrologer_busy',
  insufficient: 'low_balance',
  unavailable: 'service_off',
};

export const showStatusPopup = (opts) => {
  const o = opts || {};
  const reason = o.blockedReason || BLOCK_REASON_BY_VARIANT[o.variant];
  if (reason) {
    captureEvent('consult_blocked', {
      reason,
      // 'chat' | 'call' | 'video' where the caller knows it. Not every path can say
      // (some popups are shown from shared list components), hence the fallback.
      intent: o.intent || 'unknown',
      ...(o.blockedMeta || {}),
    });
  }
  if (listener) listener(o);
};

const VARIANTS = {
  missed: { icon: 'phone-missed', color: '#C0392B', tint: 'rgba(192,57,43,0.12)' },
  busy:   { icon: 'schedule',     color: COLORS.AstroGold, tint: 'rgba(212,160,23,0.15)' },
  info:   { icon: 'info-outline', color: COLORS.AstroMaroon, tint: 'rgba(107,31,42,0.12)' },
  success:{ icon: 'check-circle', color: '#1a8f4c', tint: 'rgba(26,143,76,0.12)' },
  insufficient: { icon: 'account-balance-wallet', color: '#C0392B', tint: 'rgba(192,57,43,0.12)' },
  confirmPay:   { icon: 'payments', color: COLORS.AstroMaroon, tint: 'rgba(107,31,42,0.12)' },
  endCall:      { icon: 'call-end', color: '#C0392B', tint: 'rgba(192,57,43,0.12)' },
};

export function StatusPopupHost() {
  const { t } = React.useContext(LanguageContext);
  const [state, setState] = useState(null); // { title, message, variant, buttonText }
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    listener = (opts) => {
      setState({
        title: opts.title || 'Notice',
        message: opts.message || '',
        variant: opts.variant || 'info',
        buttonText: opts.buttonText || t('common.ok'),
        // Two-button confirm mode — only active when the caller passes onConfirm.
        onConfirm: typeof opts.onConfirm === 'function' ? opts.onConfirm : null,
        onCancel: typeof opts.onCancel === 'function' ? opts.onCancel : null,
        confirmText: opts.confirmText || t('common.ok'),
        cancelText: opts.cancelText || t('common.cancel'),
        // Three-button stacked mode — only active when the caller ALSO passes
        // onExtra (on top of onConfirm above), e.g. "Recharge" / "Refer & Earn" / "Cancel".
        onExtra: typeof opts.onExtra === 'function' ? opts.onExtra : null,
        extraText: opts.extraText || '',
        onClose: typeof opts.onClose === 'function' ? opts.onClose : null,
      });
    };
    return () => { listener = null; };
  }, [t]);

  useEffect(() => {
    if (state) {
      scaleAnim.setValue(0.9);
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }).start();
    }
  }, [state]);

  // Root-level popup: this component sits BELOW any screen modal, so presenting
  // while one is up is exactly the case iOS refuses — see utils/modalPresentation.
  const ready = useDeferredPresent(!!state);
  useModalPresence(ready);

  if (!state) return null;
  const v = VARIANTS[state.variant] || VARIANTS.info;
  const isConfirm = !!state.onConfirm;
  const isThreeButton = isConfirm && !!state.onExtra;

  const close = () => {
    const { onClose } = state;
    setState(null);
    onClose?.();
  };
  const handleConfirm = () => {
    const { onConfirm } = state;
    close();
    onConfirm?.();
  };
  const handleCancel = () => {
    const { onCancel } = state;
    close();
    onCancel?.();
  };
  const handleExtra = () => {
    const { onExtra } = state;
    close();
    onExtra?.();
  };

  return (
    <Modal transparent visible={ready} animationType="fade" onRequestClose={isConfirm ? handleCancel : close}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.iconCircle, { backgroundColor: v.tint }]}>
            <MaterialIcons name={v.icon} size={moderateScale(34)} color={v.color} />
          </View>
          <Text style={styles.title}>{state.title}</Text>
          <Text style={styles.message}>{state.message}</Text>
          {isThreeButton ? (
            <View style={styles.stackedButtons}>
              <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={handleConfirm}>
                <Text style={styles.buttonText}>{state.confirmText}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} activeOpacity={0.85} onPress={handleExtra}>
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>{state.extraText}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostButton} activeOpacity={0.7} onPress={handleCancel}>
                <Text style={styles.ghostButtonText}>{state.cancelText}</Text>
              </TouchableOpacity>
            </View>
          ) : isConfirm ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} activeOpacity={0.85} onPress={handleCancel}>
                <Text style={[styles.buttonText, styles.cancelButtonText]}>{state.cancelText}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.confirmButton]} activeOpacity={0.85} onPress={handleConfirm}>
                <Text style={styles.buttonText}>{state.confirmText}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={close}>
              <Text style={styles.buttonText}>{state.buttonText}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(30),
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(24),
    paddingHorizontal: scale(22),
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  iconCircle: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    marginBottom: verticalScale(6),
    textAlign: 'center',
  },
  message: {
    fontSize: moderateScale(14),
    color: '#555',
    fontFamily: 'Lato-Regular',
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(20),
  },
  button: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
    paddingVertical: verticalScale(11),
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    marginLeft: scale(6),
  },
  cancelButton: {
    flex: 1,
    marginRight: scale(6),
    backgroundColor: '#f1f1f1',
  },
  cancelButtonText: {
    color: '#666',
  },
  stackedButtons: {
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: COLORS.AstroGold,
    marginTop: verticalScale(10),
  },
  secondaryButtonText: {
    color: COLORS.AstroGold,
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: verticalScale(11),
    marginTop: verticalScale(4),
  },
  ghostButtonText: {
    color: '#888',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
});

export default StatusPopupHost;
