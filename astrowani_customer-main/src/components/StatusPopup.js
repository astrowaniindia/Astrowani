// Themed, app-wide status popup (replaces the default Android Alert for
// call/chat outcomes like "missed" / "busy"). Imperative API so any screen or
// hook can show it without wiring local state:
//
//   import { showStatusPopup } from '../../components/StatusPopup';
//   showStatusPopup({ variant: 'missed', title: 'Not Answered', message: '…' });
//
// Mount <StatusPopupHost /> ONCE near the navigation root.
import React, { useEffect, useState, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

let listener = null;
export const showStatusPopup = (opts) => {
  if (listener) listener(opts || {});
};

const VARIANTS = {
  missed: { icon: 'phone-missed', color: '#C0392B', tint: 'rgba(192,57,43,0.12)' },
  busy:   { icon: 'schedule',     color: COLORS.AstroGold, tint: 'rgba(212,160,23,0.15)' },
  info:   { icon: 'info-outline', color: COLORS.AstroMaroon, tint: 'rgba(107,31,42,0.12)' },
  success:{ icon: 'check-circle', color: '#1a8f4c', tint: 'rgba(26,143,76,0.12)' },
};

export function StatusPopupHost() {
  const [state, setState] = useState(null); // { title, message, variant, buttonText }
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    listener = (opts) => {
      setState({
        title: opts.title || 'Notice',
        message: opts.message || '',
        variant: opts.variant || 'info',
        buttonText: opts.buttonText || 'OK',
      });
    };
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (state) {
      scaleAnim.setValue(0.9);
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }).start();
    }
  }, [state]);

  if (!state) return null;
  const v = VARIANTS[state.variant] || VARIANTS.info;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => setState(null)}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.iconCircle, { backgroundColor: v.tint }]}>
            <MaterialIcons name={v.icon} size={moderateScale(34)} color={v.color} />
          </View>
          <Text style={styles.title}>{state.title}</Text>
          <Text style={styles.message}>{state.message}</Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={() => setState(null)}>
            <Text style={styles.buttonText}>{state.buttonText}</Text>
          </TouchableOpacity>
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
});

export default StatusPopupHost;
