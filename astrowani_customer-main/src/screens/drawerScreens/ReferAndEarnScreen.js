import React, { useContext, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Clipboard,
  Alert,
  Share,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import { PLAY_STORE_URL } from '../../config/api';

const ReferAndEarnScreen = () => {
  const { t } = useContext(LanguageContext);
  const [code, setCode] = useState(null);
  const [totalReferred, setTotalReferred] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [rewardAmount, setRewardAmount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReferralInfo = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/customer/referral-info', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setCode(res.data.data.code);
        setTotalReferred(res.data.data.totalReferred);
        setTotalEarned(res.data.data.totalEarned);
        setRewardAmount(res.data.data.rewardAmount);
      }
    } catch (e) {
      console.warn('Referral info fetch error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchReferralInfo();
    }, [])
  );

  const shareMessage = `Join me on Astrowani! Use my referral code ${code} when you sign up and we both earn rewards. Download: ${PLAY_STORE_URL}`;

  const copyToClipboard = () => {
    if (!code) return;
    Clipboard.setString(code);
    Alert.alert(t('refer.copiedTitle'), t('refer.copiedMsg', { code }));
  };

  const shareGeneric = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch (_) {}
  };

  const shareViaWhatsapp = () => {
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(shareMessage)}`).catch(() =>
      Alert.alert(t('refer.whatsappNotInstalled')),
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReferralInfo(true)} tintColor={COLORS.AstroMaroon} />}>
      {/* Gradient hero — same header language as the drawer, instead of a stock bing.com image */}
      <View style={styles.hero}>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="referralHeroGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#7a3d26" stopOpacity="1" />
              <Stop offset="1" stopColor="#40190d" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#referralHeroGrad)" />
        </Svg>

        <View style={styles.heroIconRing}>
          <MCIcon name="gift-outline" size={moderateScale(40)} color={COLORS.AstroGold} />
        </View>
        <Text style={styles.heroTitle}>{t('refer.title')}</Text>
        <Text style={styles.heroSubtitle}>{t('refer.subtitle')}</Text>

        <View style={styles.rewardPill}>
          <MCIcon name="star-four-points" size={moderateScale(14)} color={COLORS.AstroMaroon} />
          <Text style={styles.rewardPillText}>{t('refer.getPerFriend', { amount: rewardAmount })}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconRing}>
              <MCIcon name="account-group-outline" size={moderateScale(22)} color={COLORS.AstroMaroon} />
            </View>
            <Text style={styles.statValue}>{totalReferred}</Text>
            <Text style={styles.statLabel}>{t('refer.friendsReferred')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconRing}>
              <MCIcon name="wallet-outline" size={moderateScale(22)} color={COLORS.AstroMaroon} />
            </View>
            <Text style={styles.statValue}>₹{totalEarned}</Text>
            <Text style={styles.statLabel}>{t('refer.totalEarned')}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t('refer.yourCode')}</Text>
        <View style={styles.codeCard}>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{code || '—'}</Text>
          </View>
          <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard} activeOpacity={0.8}>
            <MCIcon name="content-copy" size={moderateScale(17)} color={COLORS.white} />
            <Text style={styles.copyButtonText}>{t('refer.copy')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.shareInfoText}>
          {t('refer.shareInfo', { amount: rewardAmount })}
        </Text>

        <TouchableOpacity style={styles.whatsappButton} onPress={shareViaWhatsapp} activeOpacity={0.85}>
          <Icon name="whatsapp" size={moderateScale(22)} color="#fff" />
          <Text style={styles.whatsappButtonText}>{t('refer.viaWhatsapp')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} onPress={shareGeneric} activeOpacity={0.85}>
          <MCIcon name="share-variant-outline" size={moderateScale(19)} color={COLORS.AstroMaroon} />
          <Text style={styles.shareButtonText}>{t('refer.viaOtherApps')}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>{t('refer.howItWorks')}</Text>
        <View style={styles.stepsCard}>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={styles.stepText}>{t('refer.step1')}</Text>
          </View>
          <View style={styles.stepDivider} />
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={styles.stepText}>{t('refer.step2', { amount: rewardAmount })}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.AstroSoftOrange,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  hero: {
    alignItems: 'center',
    paddingTop: verticalScale(28),
    paddingBottom: verticalScale(26),
    paddingHorizontal: scale(20),
    borderBottomLeftRadius: moderateScale(30),
    borderBottomRightRadius: moderateScale(30),
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
    overflow: 'hidden',
  },
  heroIconRing: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: moderateScale(22),
    fontFamily: 'Lato-Bold',
    marginBottom: verticalScale(6),
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    textAlign: 'center',
    marginBottom: verticalScale(16),
    paddingHorizontal: scale(10),
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroGold,
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(20),
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  rewardPillText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    marginLeft: scale(6),
  },

  body: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(30),
  },

  statsRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(20),
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    marginHorizontal: scale(5),
    elevation: 2,
    shadowColor: COLORS.AstroMaroon, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  statIconRing: {
    width: scale(44), height: scale(44),
    borderRadius: scale(22),
    backgroundColor: COLORS.AstroSoftOrange,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  statValue: { fontSize: moderateScale(19), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  statLabel: { fontSize: moderateScale(12), color: '#8a7a70', marginTop: 2, fontFamily: 'Lato-Regular' },

  sectionLabel: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    letterSpacing: 0.6,
    marginBottom: verticalScale(10),
  },

  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: scale(8),
    elevation: 2,
    shadowColor: COLORS.AstroMaroon, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  codeBox: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(89,42,25,0.35)',
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(12),
    alignItems: 'center',
    marginRight: scale(8),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  codeText: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    letterSpacing: 2,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    borderRadius: moderateScale(10),
  },
  copyButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    marginLeft: scale(6),
  },
  shareInfoText: {
    textAlign: 'center',
    fontSize: moderateScale(13),
    marginTop: verticalScale(10),
    marginBottom: verticalScale(18),
    fontFamily: 'Lato-Regular',
    color: '#6b5a4f',
    lineHeight: moderateScale(18),
  },

  whatsappButton: {
    flexDirection: 'row',
    backgroundColor: '#25D366',
    paddingVertical: verticalScale(13),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(10),
    elevation: 2,
    shadowColor: '#25D366', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  whatsappButtonText: {
    color: '#fff',
    fontSize: moderateScale(15),
    marginLeft: scale(10),
    fontFamily: 'Lato-Bold',
  },
  shareButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(24),
  },
  shareButtonText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(14),
    marginLeft: scale(10),
    fontFamily: 'Lato-Bold',
  },

  stepsCard: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: scale(16),
    elevation: 2,
    shadowColor: COLORS.AstroMaroon, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: scale(26),
    height: scale(26),
    borderRadius: scale(13),
    backgroundColor: COLORS.AstroSoftOrange,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(12),
  },
  stepBadgeText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
  },
  stepText: {
    flex: 1,
    fontSize: moderateScale(13.5),
    fontFamily: 'Lato-Regular',
    color: '#3a2e27',
    lineHeight: moderateScale(19),
  },
  stepDivider: {
    height: 1,
    backgroundColor: 'rgba(89,42,25,0.08)',
    marginVertical: verticalScale(12),
    marginLeft: scale(38),
  },
});

export default ReferAndEarnScreen;
