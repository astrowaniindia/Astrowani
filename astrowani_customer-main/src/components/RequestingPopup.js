// src/components/RequestingPopup.js
// Drop-in request-waiting modal for any screen (chat / call / video).
// Uses the Astrowani brown theme so every "requesting…" popup looks identical.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import {useModalPresence} from '../utils/modalPresentation';
import { captureEvent } from '../utils/Analytics';

// `context` names the screen that raised the request, since this popup is shared by five
// of them (Home, Chat, Search, AstrologerInfo, ExpertsList).
const RequestingPopup = ({ visible, astro, onCancel, context = 'unknown' }) => {
  const { t } = React.useContext(LanguageContext);
  // Declares this modal to the presentation registry so root-level popups wait
  // for it instead of colliding with it on iOS (utils/modalPresentation).
  useModalPresence(visible);

  if (!visible) return null;
  const name = astro?.name || astro?.firstName || 'the astrologer';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={COLORS.AstroGold} />
          <Text style={styles.title}>{t('home.requestSent')}</Text>
          <Text style={styles.sub}>{t('home.waitingFor', { name })}</Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              // Giving up while waiting for an astrologer to answer. Distinct from the
              // request being rejected or timing out, and the only one of the three
              // that is a decision by the customer.
              captureEvent('request_cancelled_by_customer', {
                context,
                astrologer_id: astro?.userId || astro?._id || null,
              });
              if (onCancel) onCancel();
            }}
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
    width: '85%',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(15),
    padding: scale(25),
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
