import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../api/SupabaseClient';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

import { LanguageContext } from '../context/LanguageContext';
import showToast from '../utils/showToast';
// Shown after signup (and on every app open) until the admin approves the account.
const PendingApproval = ({ navigation }) => {
  const { t } = useContext(LanguageContext);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      const { data } = await supabase
        .from('astrologers')
        .select('approval_status')
        .eq('id', astroId)
        .single();

      if (data?.approval_status === 'approved') {
        navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' }] });
      } else if (data?.approval_status === 'rejected') {
        showToast(t('pending.rejected'), { long: true });
      } else {
        showToast(t('pending.stillReview'));
      }
    } catch (e) {
      showToast(t('pending.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'userToken', 'astroId']);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="hourglass-outline" size={moderateScale(56)} color={COLORS.AstroMaroon} />
      </View>
      <Text style={styles.title}>{t('pending.title')}</Text>
      <Text style={styles.message}>{t('pending.message')}</Text>
      <Text style={styles.subMessage}>{t('pending.subMessage')}</Text>

      <TouchableOpacity style={styles.checkBtn} activeOpacity={0.85} onPress={checkStatus} disabled={checking}>
        {checking ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.checkBtnText}>{t('pending.checkStatus')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>{t('pending.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default PendingApproval;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(30),
  },
  iconCircle: {
    width: scale(110),
    height: scale(110),
    borderRadius: scale(55),
    backgroundColor: 'rgba(107,31,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(24),
  },
  title: {
    fontSize: moderateScale(22),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(12),
    textAlign: 'center',
  },
  message: {
    fontSize: moderateScale(15),
    color: '#444',
    textAlign: 'center',
    lineHeight: moderateScale(22),
    marginBottom: verticalScale(10),
  },
  subMessage: {
    fontSize: moderateScale(13),
    color: '#888',
    textAlign: 'center',
    marginBottom: verticalScale(34),
  },
  checkBtn: {
    backgroundColor: COLORS.AstroGold,
    paddingVertical: verticalScale(13),
    paddingHorizontal: scale(40),
    borderRadius: moderateScale(28),
    alignItems: 'center',
    minWidth: scale(220),
  },
  checkBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
  },
  logoutBtn: {
    marginTop: verticalScale(18),
    paddingVertical: verticalScale(8),
  },
  logoutText: {
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: moderateScale(14),
  },
});
