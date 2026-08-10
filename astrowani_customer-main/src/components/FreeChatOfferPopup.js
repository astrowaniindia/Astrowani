// Welcome-offer card shown once to new customers on Home, offering a free
// 5-minute scripted "bot chat" (see screens/FreeBotChat/FreeBotChatScreen.js).
// Plain presentational Modal — Home.js owns the `visible` state and the
// eligibility check (new customer + not yet used, see freeConsultation.js and
// GET /api/users/profile's `freeBotChatCredited` flag).
import React from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { FREE_CHAT_PERSONA } from '../data/freeBotChatPersona';

const FreeChatOfferPopup = ({ visible, onStart, onDismiss }) => {
  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.header}>🎁 Here's your free chat for 5 minutes with an astrologer!</Text>

          <Image source={FREE_CHAT_PERSONA.image} style={styles.avatar} />
          <Text style={styles.name}>{FREE_CHAT_PERSONA.name}</Text>
          <Text style={styles.meta}>{FREE_CHAT_PERSONA.experience} experience</Text>
          <Text style={styles.specialities}>{FREE_CHAT_PERSONA.specialities}</Text>

          <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={onStart}>
            <Text style={styles.ctaText}>Start Free Chat Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default FreeChatOfferPopup;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(28),
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(26),
    paddingHorizontal: scale(20),
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: verticalScale(12),
    right: scale(14),
    zIndex: 1,
    padding: scale(4),
  },
  closeText: {
    fontSize: moderateScale(18),
    color: '#999',
  },
  header: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    marginBottom: verticalScale(16),
    paddingHorizontal: scale(10),
  },
  avatar: {
    width: scale(90),
    height: scale(90),
    borderRadius: scale(45),
    borderWidth: 2,
    borderColor: COLORS.AstroGold,
    marginBottom: verticalScale(10),
  },
  name: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: COLORS.textDark,
  },
  meta: {
    fontSize: moderateScale(13),
    color: '#777',
    marginTop: verticalScale(2),
  },
  specialities: {
    fontSize: moderateScale(12),
    color: '#999',
    marginTop: verticalScale(4),
    textAlign: 'center',
    marginBottom: verticalScale(18),
  },
  cta: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
    paddingVertical: verticalScale(13),
    width: '100%',
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
  },
});
