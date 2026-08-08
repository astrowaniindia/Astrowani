import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { COLORS } from '../Theme/Colors';
import Instance from '../api/ApiCall';
import { LanguageContext } from '../context/LanguageContext';
import { resetAnalyticsIdentity } from '../utils/Analytics';

function CustomDrawerContent(props, navigation) {
  const { t } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchUserProfile();
    }, []),
  );

  const handleShareApp = async () => {
    try {
      const shareOptions = {
        message: 'Check out this awesome astrology app! Connect with top astrologers today.',
      };
      await Share.share(shareOptions);
    } catch (error) {
      console.error('Error sharing:', error.message);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');

      const response = await Instance.get('/api/users/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data) setUser(response.data.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      resetAnalyticsIdentity();
      await AsyncStorage.clear();
      props.navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const renderSectionLabel = (label) => (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionLabelLine} />
    </View>
  );

  // Fully custom row (replacing react-navigation's DrawerItem) — gives control over
  // a trailing chevron and a hairline separator, neither of which DrawerItem supports.
  const DrawerRow = ({ iconName, IconComponent = Icon, label, onPress, danger, isLast }) => (
    <TouchableOpacity
      activeOpacity={0.6}
      style={[styles.row, !isLast && styles.rowSeparator]}
      onPress={onPress}
    >
      <View style={[styles.iconRing, danger && styles.iconRingDanger]}>
        <View style={[styles.iconWrapper, danger && styles.iconWrapperDanger]}>
          <IconComponent name={iconName} size={moderateScale(18)} color={danger ? '#C0392B' : COLORS.AstroMaroon} />
        </View>
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>{label}</Text>
      <Icon name="chevron-right" size={moderateScale(20)} color={danger ? 'rgba(192,57,43,0.4)' : 'rgba(89,42,25,0.28)'} />
    </TouchableOpacity>
  );

  const accountRows = [
    { iconName: 'account-balance-wallet', label: t('drawer.myWallet'), onPress: () => props.navigation.navigate('Wallet') },
    { iconName: 'phone-in-talk', label: t('drawer.mySessions'), onPress: () => props.navigation.navigate('SessionStack') },
    { iconName: 'favorite', label: t('drawer.myFavorites'), onPress: () => props.navigation.navigate('FavoriteScreen') },
    { iconName: 'shopping-bag', label: t('drawer.myOrders'), onPress: () => props.navigation.navigate('MyOrders') },
  ];
  const exploreRows = [
    { iconName: 'spa', label: t('drawer.remedies'), onPress: () => props.navigation.navigate('DrawerRemedies') },
    { iconName: 'question-answer', label: t('drawer.chatWithAstrologer'), onPress: () => props.navigation.navigate('DrawerChat') },
    { iconName: 'menu-book', label: t('drawer.blogs'), onPress: () => props.navigation.navigate('BlogList') },
    { iconName: 'mic', label: t('drawer.voiceNotes'), onPress: () => props.navigation.navigate('VoiceNotes') },
  ];
  const moreRows = [
    { iconName: 'card-giftcard', label: t('drawer.referFriend'), onPress: () => props.navigation.navigate('ReferFriend') },
    { iconName: 'settings', label: t('drawer.settings'), onPress: () => props.navigation.navigate('Settings') },
    { iconName: 'support-agent', label: t('drawer.support'), onPress: () => props.navigation.navigate('SupportScreen') },
    { iconName: 'share', label: t('drawer.shareApp'), onPress: handleShareApp },
  ];

  return (
    <View style={styles.container}>
      {/* Unified Header & Profile Section — SVG gradient gives real depth instead of a flat fill */}
      <View style={[styles.headerBlock, { paddingTop: insets.top + verticalScale(10) }]}>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#7a3d26" stopOpacity="1" />
              <Stop offset="1" stopColor="#40190d" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerGrad)" />
        </Svg>

        <View style={styles.headerTopRow}>
          <View style={styles.brandRow}>
            <Icon name="auto-awesome" size={moderateScale(16)} color="rgba(255,255,255,0.55)" style={styles.brandIcon} />
            <Text style={styles.drawerTitle}>Astrowani</Text>
          </View>
          <TouchableOpacity onPress={() => props.navigation.closeDrawer()} style={styles.closeBtn}>
            <Icon name="close" size={moderateScale(22)} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.profileSection}
          activeOpacity={0.8}
          onPress={() => props.navigation.navigate('UserProfileScreen', { user: user })}
        >
          <View style={styles.avatarRing}>
            {user?.profilePic ? (
              <Image source={{ uri: user?.profilePic }} style={styles.profileImage} />
            ) : (
              <Icon name="account-circle" size={moderateScale(60)} color="rgba(255,255,255,0.9)" />
            )}
          </View>
          <View style={styles.profileTextContainer}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.firstName || user?.phoneNumber || t('drawer.welcome')}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email || t('drawer.updateProfile')}
            </Text>
          </View>
          <View style={styles.chevronCircle}>
            <Icon name="chevron-right" size={moderateScale(18)} color={COLORS.white} />
          </View>
        </TouchableOpacity>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.drawerItemsWrapper}>
          {renderSectionLabel('MY ACCOUNT')}
          <View style={styles.sectionCard}>
            {accountRows.map((r, i) => (
              <DrawerRow key={r.label} {...r} isLast={i === accountRows.length - 1} />
            ))}
          </View>

          {renderSectionLabel('EXPLORE')}
          <View style={styles.sectionCard}>
            {exploreRows.map((r, i) => (
              <DrawerRow key={r.label} {...r} isLast={i === exploreRows.length - 1} />
            ))}
          </View>

          {renderSectionLabel('MORE')}
          <View style={styles.sectionCard}>
            {moreRows.map((r, i) => (
              <DrawerRow key={r.label} {...r} isLast={i === moreRows.length - 1} />
            ))}
          </View>

          <View style={[styles.sectionCard, { marginTop: verticalScale(14) }]}>
            <DrawerRow iconName="logout" label={t('drawer.logout')} onPress={handleLogout} danger isLast />
          </View>
        </View>

        <View style={styles.socialContainer}>
          <Text style={styles.socialHeading}>{t('drawer.connectWithUs')}</Text>
          <View style={styles.socialIconsRow}>
            <TouchableOpacity style={styles.socialBtn}>
              <FontAwesome name="facebook" size={moderateScale(20)} color="#3b5998" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn}>
              <FontAwesome name="twitter" size={moderateScale(20)} color="#00acee" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn}>
              <FontAwesome name="instagram" size={moderateScale(20)} color="#C13584" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn}>
              <FontAwesome name="whatsapp" size={moderateScale(20)} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn}>
              <FontAwesome name="youtube-play" size={moderateScale(20)} color="#FF0000" />
            </TouchableOpacity>
          </View>
          <Text style={styles.tagline}>✦ Guidance for every step of your journey ✦</Text>
        </View>
      </DrawerContentScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBF6EF' },
  headerBlock: {
    backgroundColor: COLORS.AstroMaroon,
    paddingBottom: verticalScale(25),
    paddingHorizontal: scale(20),
    borderBottomLeftRadius: moderateScale(30),
    borderBottomRightRadius: moderateScale(30),
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(22),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandIcon: { marginRight: scale(7) },
  drawerTitle: { color: COLORS.white, fontSize: moderateScale(22), fontFamily: 'Lato-Bold', letterSpacing: 0.3 },
  closeBtn: {
    padding: scale(6),
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: moderateScale(16),
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRing: {
    width: scale(64), height: scale(64),
    borderRadius: moderateScale(32),
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  profileImage: { width: '100%', height: '100%', borderRadius: moderateScale(32) },
  profileTextContainer: { flex: 1, marginLeft: scale(15) },
  profileName: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: '#fff', marginBottom: verticalScale(4) },
  profileEmail: { fontSize: moderateScale(13), fontFamily: 'Lato-Regular', color: 'rgba(255,255,255,0.75)' },
  chevronCircle: {
    width: scale(30), height: scale(30),
    borderRadius: moderateScale(15),
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  scrollContent: { paddingTop: verticalScale(18), paddingBottom: verticalScale(30) },
  drawerItemsWrapper: { paddingHorizontal: scale(16) },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(16),
    marginBottom: verticalScale(8),
    marginLeft: scale(4),
  },
  sectionLabel: {
    fontSize: moderateScale(11.5),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: '#A15A3B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginRight: scale(10),
  },
  sectionLabelLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(89,42,25,0.15)',
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(18),
    elevation: 2,
    shadowColor: COLORS.AstroMaroon, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(12),
  },
  rowSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(89,42,25,0.06)',
  },
  iconRing: {
    width: scale(40), height: scale(40),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(89,42,25,0.06)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: scale(13),
  },
  iconRingDanger: {
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  iconWrapper: {
    width: scale(32), height: scale(32),
    borderRadius: moderateScale(16),
    backgroundColor: COLORS.AstroSoftOrange,
    justifyContent: 'center', alignItems: 'center',
  },
  iconWrapperDanger: {
    backgroundColor: 'rgba(192,57,43,0.12)',
  },
  rowLabel: {
    flex: 1,
    fontSize: moderateScale(14.5),
    fontFamily: 'Lato-Bold',
    color: '#4A3B32',
  },
  rowLabelDanger: { color: '#C0392B' },
  socialContainer: {
    marginTop: verticalScale(22),
    paddingTop: verticalScale(20),
    paddingHorizontal: scale(16),
    borderTopWidth: 1, borderTopColor: 'rgba(89,42,25,0.12)',
    alignItems: 'center',
  },
  socialHeading: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    color: '#A15A3B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: verticalScale(15),
  },
  socialIconsRow: { flexDirection: 'row', justifyContent: 'center', gap: scale(14) },
  socialBtn: {
    width: scale(42), height: scale(42),
    borderRadius: moderateScale(21),
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    elevation: 3, shadowColor: COLORS.AstroMaroon, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6,
  },
  tagline: {
    marginTop: verticalScale(18),
    fontSize: moderateScale(11.5),
    fontFamily: 'Lato-Regular',
    color: '#B3A296',
    letterSpacing: 0.3,
  },
});

export default CustomDrawerContent;
