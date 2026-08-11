// astrowani_vendors-main/src/components/ReferralPopupHost.js
//
// Vendor-side counterpart to the customer app's ReferralPromptHost — same imperative
// "show once" pattern (mirrors StatusPopup.js's showStatusPopup), but astrologers have
// no referral code of their own, so this is purely a generic admin-authored message
// (no code box, no share button). Only ever shown via the admin's Referral Popup page
// (astrowani-admin), never triggered locally by app logic.
//
//   import { showReferralPopup } from '../components/ReferralPopupHost';
//   showReferralPopup(title, body);
//
// Mount <ReferralPopupHost /> ONCE near the navigation root.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

let listener = null;
export const showReferralPopup = (title, body) => {
  if (listener) listener(title, body);
};

export function ReferralPopupHost() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    listener = (t, b) => {
      setTitle(t || 'Astrowani');
      setBody(b || '');
      setVisible(true);
    };
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      Animated.timing(scaleAnim, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const close = () => setVisible(false);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="campaign" size={moderateScale(30)} color="#fff" />
          </View>
          <Text style={styles.title}>{title}</Text>
          {!!body && <Text style={styles.subtitle}>{body}</Text>}

          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={close}>
            <Text style={styles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(30),
  },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: moderateScale(20),
    paddingVertical: verticalScale(24), paddingHorizontal: scale(22), alignItems: 'center',
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16,
  },
  iconCircle: {
    width: scale(60), height: scale(60), borderRadius: scale(30),
    backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center',
    marginBottom: verticalScale(12),
  },
  title: {
    fontSize: moderateScale(18), fontWeight: 'bold', color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold', textAlign: 'center',
  },
  subtitle: {
    fontSize: moderateScale(13), color: '#777', fontFamily: 'Lato-Regular',
    textAlign: 'center', marginTop: verticalScale(6), marginBottom: verticalScale(16),
  },
  button: {
    backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(25),
    paddingVertical: verticalScale(12), paddingHorizontal: scale(30),
    width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: verticalScale(4),
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15), fontFamily: 'Lato-Bold' },
});

export default ReferralPopupHost;
