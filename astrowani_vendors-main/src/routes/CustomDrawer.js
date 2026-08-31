import React, {useCallback, useContext, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {DrawerContentScrollView, DrawerItem} from '@react-navigation/drawer';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {COLORS} from '../Theme/Colors';
import EvilIcons from 'react-native-vector-icons/EvilIcons';
import Instance from '../api/ApiCall';
import {useFocusEffect} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {resetAnalyticsIdentity} from '../utils/Analytics';
import { supabase } from '../api/SupabaseClient';
import { fetchAstrologerRow } from '../utils/vendorProfile';
import { LanguageContext } from '../context/LanguageContext';
function CustomDrawer(props) {
  const insets = useSafeAreaInsets();
  const { language, changeLanguage, t } = useContext(LanguageContext);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ids, setIds] = useState('');
  const [missedCount, setMissedCount] = useState(0);

  // Count missed call/chat requests created since the vendor last opened the Missed screen.
  const fetchMissedCount = async () => {
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;
      const seenAt = (await AsyncStorage.getItem('missed_seen_at')) || '1970-01-01T00:00:00.000Z';
      const [callRes, chatRes] = await Promise.all([
        supabase.from('call_requests').select('id', { count: 'exact', head: true })
          .eq('astrologer_id', astroId).eq('status', 'missed').gt('created_at', seenAt),
        supabase.from('chat_requests').select('id', { count: 'exact', head: true })
          .eq('receiver_id', astroId).eq('status', 'missed').gt('created_at', seenAt),
      ]);
      setMissedCount((callRes.count || 0) + (chatRes.count || 0));
    } catch (e) {
      // non-fatal
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      // Via the backend, not a direct `astrologers` read — see
      // DATABASE_HARDENING_HANDOFF.md §3.1/§3.2, sql/hardening_02_access_control.sql.
      const astrologerData = await fetchAstrologerRow();

      if (astrologerData) {
        setData({
          name: astrologerData.first_name + ' ' + astrologerData.last_name,
          email: astrologerData.email,
          profileImage: astrologerData.profile_pic_url || astrologerData.profile_image
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      fetchMissedCount();
    }, []),
  );
  const handleLogout = async () => {
    try {
      resetAnalyticsIdentity();
      await AsyncStorage.clear();
      props.navigation.navigate('Login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // console.log("data: ", data);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
      {/* Header Section */}
      <LinearGradient
        colors={['#3d1c11', COLORS.AstroMaroon]}
        style={[styles.headerSection, {paddingTop: insets.top + verticalScale(20)}]}>
        <Text style={styles.appTitle}>Astrowani Vendors</Text>
        <TouchableOpacity
          style={styles.userInfoSection}
          onPress={() => props.navigation.navigate('Profile')}>
          {data?.profileImage ? (
            <Image
              resizeMode="cover"
              source={{uri: data.profileImage}}
              style={styles.profile}
            />
          ) : (
            <Icon name="account-circle" size={80} color={COLORS.white} />
          )}
          <View style={styles.nameContainer}>
            <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">
              {data?.name || 'Name not available'}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="tail">
              {data?.email || 'Email not available'}
            </Text>
          </View>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.drawerItemsContainer}>
        <DrawerItem
          label={t('drawer.dashboard')}
          icon={() => (
            <Icon name="dashboard" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('HomeScreen')}
        />
        <DrawerItem
          label={t('drawer.myCustomers')}
          icon={() => (
            <Icon name="group" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('MyCustomers')}
        />
        <DrawerItem
          label={t('drawer.profile')}
          icon={() => (
            <EvilIcons name="user" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('Profile')}
        />
        <DrawerItem
          label="My Free Calls"
          icon={() => (
            <Icon name="event-available" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('FreeCalls')}
        />
        <DrawerItem
          label="Referrals & Commission"
          icon={() => (
            <Icon name="card-giftcard" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('RemedyReferrals')}
        />
        <DrawerItem
          label={t('drawer.sessionHistory')}
          icon={() => (
            <Icon name="history" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('SessionHistory')}
        />
        <DrawerItem
          label={() => (
            <View style={styles.missedLabelRow}>
              <Text style={styles.missedLabel}>{t('drawer.missedSessions')}</Text>
              {missedCount > 0 && (
                <View style={styles.missedBadge}>
                  <Text style={styles.missedBadgeText}>{missedCount > 99 ? '99+' : missedCount}</Text>
                </View>
              )}
            </View>
          )}
          icon={() => (
            <Icon name="phone-missed" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => {
            setMissedCount(0);
            props.navigation.navigate('MissedSessions');
          }}
        />
        <DrawerItem
          label={t('drawer.support')}
          icon={() => <Icon name="help" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('Support')}
        />
        <DrawerItem
          label={t('drawer.notification')}
          icon={() => (
            <EvilIcons name="bell" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('Notification')}
        />
        <DrawerItem
          label={t('drawer.settings')}
          icon={() => (
            <Icon
              name="settings-suggest"
              size={24}
              color={COLORS.AstroMaroon}
            />
          )}
          onPress={() => props.navigation.navigate('Settings')}
        />
        <DrawerItem
          label={t('drawer.ratingReview')}
          icon={() => <Icon name="help" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('RatingReview')}
        />
        <DrawerItem
          label={t('drawer.performance')}
          icon={() => <Icon name="insights" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('PerformanceDashboard')}
        />
        <DrawerItem
          label={t('drawer.wallet')}
          icon={() => <Icon name="account-balance-wallet" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('Wallet')}
        />
        <DrawerItem
          label={t('drawer.logout')}
          icon={() => (
            <Icon name="logout" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={handleLogout}
        />
      </View>

      {/* Language toggle */}
      <View style={styles.languageSection}>
        <Text style={styles.languageLabel}>{t('drawer.language')}</Text>
        <View style={styles.languageButtons}>
          <TouchableOpacity
            style={[styles.langBtn, language === 'English' && styles.langBtnActive]}
            onPress={() => changeLanguage('English')}>
            <Text style={[styles.langBtnText, language === 'English' && styles.langBtnTextActive]}>English</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === 'Hindi' && styles.langBtnActive]}
            onPress={() => changeLanguage('Hindi')}>
            <Text style={[styles.langBtnText, language === 'Hindi' && styles.langBtnTextActive]}>हिंदी</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Social Media Section */}
      <View style={styles.socialSection}>
        <Text style={styles.socialHeading}>Follow Us</Text>
        <View style={styles.socialIcons}>
          <FontAwesome name="facebook-square" size={28} color="#3b5998" />
          <FontAwesome name="twitter-square" size={28} color="#00acee" />
          <FontAwesome name="instagram" size={28} color="#C13584" />
          <FontAwesome name="whatsapp" size={28} color="#25D366" />
          <FontAwesome name="youtube-square" size={28} color="#FF0000" />
        </View>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    paddingBottom: verticalScale(20),
    paddingHorizontal: scale(15),
    borderBottomWidth: 0,
    elevation: 5,
  },
  appTitle: {
    color: '#F0D4A3', // AstroGold or similar
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    marginBottom: verticalScale(15),
    textAlign: 'center',
    letterSpacing: 1,
  },
  userInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    padding: scale(10),
    borderRadius: moderateScale(12),
  },
  profile: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(40),
    borderWidth: 2,
    borderColor: COLORS.white,
    marginRight: scale(10),
  },
  nameContainer: {
    flex: 1,
  },
  userName: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
  },
  userEmail: {
    fontSize: moderateScale(13),
    color: '#EEEEEE',
    marginTop: verticalScale(2),
  },
  drawerItemsContainer: {
    marginTop: verticalScale(10),
    paddingHorizontal: scale(10),
  },
  languageSection: {
    marginTop: verticalScale(10),
    paddingHorizontal: scale(20),
  },
  languageLabel: {
    fontSize: moderateScale(13),
    fontWeight: 'bold',
    color: '#888',
    marginBottom: verticalScale(8),
  },
  languageButtons: {
    flexDirection: 'row',
    gap: scale(10),
  },
  langBtn: {
    flex: 1,
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    alignItems: 'center',
  },
  langBtnActive: {
    backgroundColor: COLORS.AstroMaroon,
  },
  langBtnText: {
    color: COLORS.AstroMaroon,
    fontWeight: '600',
    fontSize: moderateScale(13),
  },
  langBtnTextActive: {
    color: COLORS.white,
  },
  socialSection: {
    marginTop: verticalScale(20),
    paddingTop: moderateScale(15),
    paddingBottom: moderateScale(30), // Extra padding for system nav bar
    paddingHorizontal: moderateScale(10),
    backgroundColor: COLORS.AshGray,
    borderRadius: scale(15),
    alignItems: 'center',
    marginHorizontal: scale(15),
    marginBottom: verticalScale(20), // Bottom margin
  },
  socialHeading: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    marginBottom: verticalScale(15),
    color: '#333',
  },
  socialIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: scale(10),
  },
  missedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
    marginLeft: scale(-16), // align with other DrawerItem labels
  },
  missedLabel: {
    fontSize: moderateScale(14),
    fontWeight: '500',
    color: '#1c1c1e',
  },
  missedBadge: {
    backgroundColor: COLORS.red,
    borderRadius: moderateScale(12),
    minWidth: scale(20),
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(1),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(8),
  },
  missedBadgeText: {
    color: '#fff',
    fontSize: moderateScale(11),
    fontWeight: 'bold',
  },
});

export default CustomDrawer;
