import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Clipboard,
  Alert,
  Share,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/FontAwesome';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';

const ReferAndEarnScreen = () => {
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

  const shareMessage = `Join me on Astrowani! Use my referral code ${code} when you sign up and we both earn rewards. Download: https://astrowani.onrender.com`;

  const copyToClipboard = () => {
    if (!code) return;
    Clipboard.setString(code);
    Alert.alert('Copied to clipboard', `Referral code ${code} copied!`);
  };

  const shareGeneric = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch (_) {}
  };

  const shareViaWhatsapp = () => {
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(shareMessage)}`).catch(() =>
      Alert.alert('WhatsApp not installed'),
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchReferralInfo(true)} />}>
      <View style={styles.imageContainer}>
        <Image
          source={{
            uri: 'https://th.bing.com/th?id=OIP.ncJKHY7TUu_M4mKZVBmwCQHaEK&w=333&h=187&c=8&rs=1&qlt=90&o=6&pid=3.1&rm=2',
          }}
          style={styles.image}
        />
      </View>

      <View style={styles.otherInfo}>
        <View style={styles.getRewardButton}>
          <Text style={styles.getRewardText}>Get ₹{rewardAmount}</Text>
        </View>

        <Text style={styles.infoText}>For every friend who completes their first session</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalReferred}</Text>
            <Text style={styles.statLabel}>Friends Referred</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>₹{totalEarned}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
        </View>

        <View style={styles.referralCodeContainer}>
          <Text style={styles.referralCodeText}>{`Your Referral Code : ${code || '—'}`}</Text>
          <TouchableOpacity onPress={copyToClipboard}>
            <Icon name="copy" size={22} color="#000" />
          </TouchableOpacity>
        </View>

        <Text style={styles.shareInfoText}>
          Share your referral code — you earn ₹{rewardAmount} when your friend completes their first session
        </Text>

        <TouchableOpacity style={styles.whatsappButton} onPress={shareViaWhatsapp}>
          <Icon name="whatsapp" size={24} color="#fff" style={styles.whatsappIcon} />
          <Text style={styles.whatsappButtonText}>Refer Via WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} onPress={shareGeneric}>
          <Icon name="share-alt" size={20} color={COLORS.AstroMaroon} style={styles.whatsappIcon} />
          <Text style={styles.shareButtonText}>Share via other apps</Text>
        </TouchableOpacity>

        <View style={styles.termsContainer}>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            1. Your friend must sign up on Astrowani using your referral code.
          </Text>
          <Text style={styles.termsText}>
            2. You receive the reward after your friend completes their first chat, call, or video session.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  imageContainer: {
    alignItems: 'center',
  },
  otherInfo: {
    paddingHorizontal: scale(15),
  },
  image: {
    width: '100%',
    height: verticalScale(200),
  },
  getRewardButton: {
    backgroundColor: COLORS.AstroGold,
    padding: scale(10),
    width: scale(150),
    borderBottomLeftRadius: moderateScale(6),
    borderBottomRightRadius: moderateScale(6),
    alignItems: 'center',
    alignSelf: 'center',
  },
  getRewardText: {
    color: '#000',
    fontSize: moderateScale(17),
    fontFamily: 'Lato-Bold',
  },
  infoText: {
    textAlign: 'center',
    fontSize: moderateScale(15),
    marginVertical: verticalScale(10),
    color: '#000',
    fontFamily: 'Lato-Regular',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: verticalScale(10),
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(20),
  },
  statValue: { fontSize: moderateScale(20), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  statLabel: { fontSize: moderateScale(12), color: '#777', marginTop: 2 },
  referralCodeContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.AstroSoftOrange,
    padding: scale(6),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(8),
  },
  referralCodeText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',

    marginRight: scale(10),
    color: '#000',
  },
  shareInfoText: {
    textAlign: 'center',
    fontSize: moderateScale(14),
    marginVertical: verticalScale(9),
    fontFamily: 'Lato-Regular',

    color: '#000',
  },
  whatsappButton: {
    flexDirection: 'row',
    backgroundColor: '#25D366',
    padding: scale(13),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  whatsappButtonText: {
    color: '#fff',
    fontSize: moderateScale(17),
    marginLeft: scale(10),
    fontFamily: 'Lato-Bold',
  },
  shareButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    padding: scale(12),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(10),
  },
  shareButtonText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(15),
    marginLeft: scale(10),
    fontFamily: 'Lato-Bold',
  },
  whatsappIcon: {},
  termsContainer: {
    marginTop: verticalScale(5),
    paddingVertical: verticalScale(10),
    borderTopWidth: verticalScale(2),
    borderTopColor: COLORS.AstroSoftOrange,
  },
  termsTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',

    color: '#000',
    marginBottom: verticalScale(13),
  },
  termsText: {
    fontSize: moderateScale(14),
    marginBottom: verticalScale(10),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
});

export default ReferAndEarnScreen;
