// Post-free-chat referral nudge — replaces the old ₹20 completion bonus.
// Imperative API mirroring ReviewPrompt.js so any screen can trigger it
// without wiring local state:
//
//   import { showReferralPrompt } from '../../components/ReferralPromptHost';
//   showReferralPrompt();
//
// Mount <ReferralPromptHost /> ONCE near the navigation root.
import React, { useEffect, useState, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Share } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import Instance from '../api/ApiCall';

let listener = null;
// Both args optional — an admin-triggered popup (see Home.js's 'show_referral_popup'
// socket listener) passes its own title/message; the normal post-free-chat nudge calls
// this with no args and falls back to the default "Invite friends, earn ₹X!" copy below.
export const showReferralPrompt = (customTitle, customMessage) => {
  if (listener) listener(customTitle, customMessage);
};

export function ReferralPromptHost() {
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState(null);
  const [rewardAmount, setRewardAmount] = useState(25);
  const [overrideTitle, setOverrideTitle] = useState(null);
  const [overrideMessage, setOverrideMessage] = useState(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    listener = async (customTitle, customMessage) => {
      setOverrideTitle(customTitle || null);
      setOverrideMessage(customMessage || null);
      setVisible(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await Instance.get('/api/customer/referral-info', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data?.success) {
          setCode(res.data.data.code);
          setRewardAmount(res.data.data.rewardAmount);
        }
      } catch (_) {
        // Card still shows without a code — Share still works with generic wording.
      }
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

  const share = async () => {
    const message = code
      ? `Join me on Astrowani! Use my referral code ${code} when you sign up — download: https://play.google.com/store/apps/details?id=com.astrowanicustomer`
      : `Join me on Astrowani! Download: https://play.google.com/store/apps/details?id=com.astrowanicustomer`;
    try {
      await Share.share({ message });
    } catch (_) {}
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="card-giftcard" size={moderateScale(32)} color="#fff" />
          </View>
          <Text style={styles.title}>{overrideTitle || `Invite friends, earn ₹${rewardAmount}!`}</Text>
          <Text style={styles.subtitle}>
            {overrideMessage || `Share your code — you get ₹${rewardAmount} when a friend joins and completes their first session.`}
          </Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{code || '…'}</Text>
          </View>

          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={share}>
            <MaterialIcons name="share" size={moderateScale(18)} color="#fff" style={{ marginRight: scale(8) }} />
            <Text style={styles.buttonText}>Share my code</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={close} style={styles.skipBtn}>
            <Text style={styles.skipText}>Maybe later</Text>
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
  codeBox: {
    borderWidth: 1.5, borderColor: COLORS.AstroGold, borderStyle: 'dashed',
    borderRadius: moderateScale(12), paddingVertical: verticalScale(10),
    paddingHorizontal: scale(24), marginBottom: verticalScale(18),
  },
  codeText: {
    fontSize: moderateScale(20), fontWeight: 'bold', color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold', letterSpacing: scale(2),
  },
  button: {
    flexDirection: 'row', backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(25),
    paddingVertical: verticalScale(12), paddingHorizontal: scale(20),
    width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15), fontFamily: 'Lato-Bold' },
  skipBtn: { marginTop: verticalScale(12) },
  skipText: { color: '#999', fontSize: moderateScale(13), fontFamily: 'Lato-Regular' },
});

export default ReferralPromptHost;
