import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Image,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../api/SupabaseClient';
import {fetchAstrologerRow} from '../utils/vendorProfile';
import useNotificationBadgeSync from '../utils/useNotificationBadgeSync';
import {LanguageContext} from '../context/LanguageContext';

const CustomHeader = ({title, showLanguage}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {language, changeLanguage, t} = React.useContext(LanguageContext);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [profileImage, setProfileImage] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [astroId, setAstroId] = useState(null);

  // Via the backend, not a direct `astrologers` read — wallet_balance is not in
  // the anon SELECT grant (it excludes anything money-related), so this table
  // can no longer be read directly for it. See
  // DATABASE_HARDENING_HANDOFF.md §3.1/§3.2. Polling replaces the old Realtime
  // subscription on the same grounds.
  const fetchBalance = async () => {
    const data = await fetchAstrologerRow();
    if (data) {
      setWalletBalance(data.wallet_balance);
      setProfileImage(data.profile_pic_url || data.profile_image || null);
    }
  };

  useEffect(() => {
    fetchBalance();
    const timer = setInterval(fetchBalance, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async (id) => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('astrologer_id', id)
        .eq('is_read', false);
      if (!cancelled) setUnreadCount(count || 0);
    };

    const setup = async () => {
      const id = await AsyncStorage.getItem('astroId');
      if (!id) return;
      if (!cancelled) setAstroId(id);
      await fetchCount(id);
    };

    setup();
    const unsubscribe = navigation.addListener('focus', setup);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigation]);

  // Live badge updates via the backend's existing socket event (see
  // utils/useNotificationBadgeSync.js) instead of this component's own direct,
  // per-mount Supabase Realtime subscription — this header mounts on nearly every
  // screen, so that pattern meant an always-on Realtime connection per vendor.
  useNotificationBadgeSync(astroId, () => {
    if (!astroId) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('astrologer_id', astroId)
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count || 0));
  });

  const toggleLanguageModal = () => {
    setLanguageModalVisible(!languageModalVisible);
  };

  const selectLanguage = (lang) => {
    changeLanguage(lang);
    toggleLanguageModal();
  };
  return (
    <View>
      <StatusBar backgroundColor={COLORS.AstroMaroon}/>
      <View style={[styles.headerContainer, {paddingTop: insets.top + verticalScale(5)}]}>
        <View style={styles.titleContainer}>
          <TouchableOpacity onPress={() => navigation.openDrawer()}>
            <Ionicons name="menu" color="white" size={28} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={[styles.notificationView]}>
          <TouchableOpacity onPress={() => navigation.navigate('MyCustomers')} style={{ marginRight: 12 }}>
            <Ionicons name="people-outline" color="white" size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Notification')} style={{ marginRight: 12, position: 'relative' }}>
            <MaterialIcons name="notifications-none" color="white" size={24} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ marginRight: 12 }}>
            {profileImage ? (
              <Image source={{uri: profileImage}} style={styles.avatar} />
            ) : (
              <Ionicons name="person-circle-outline" color="white" size={26} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Wallet')} style={[styles.walletBtn, { marginRight: showLanguage ? 12 : 0 }]}>
            <Ionicons name="wallet-outline" color="white" size={22} />
            {walletBalance !== null && (
              <Text style={styles.walletAmount}>₹{walletBalance}</Text>
            )}
          </TouchableOpacity>
          {showLanguage && (
            <TouchableOpacity onPress={toggleLanguageModal}>
              <MaterialIcons name="language" color="white" size={24} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Language Selection Modal */}
      <Modal
        transparent={true}
        visible={languageModalVisible}
        animationType="slide"
        onRequestClose={toggleLanguageModal}>
        <TouchableOpacity
          style={styles.modalContainer}
          activeOpacity={1}
          onPressOut={toggleLanguageModal}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1}>
            <Text style={styles.modalTitle}>{t('drawer.language')}</Text>

            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => selectLanguage('English')}>
              <View style={styles.roundIcon}>
                {language === 'English' && (
                  <View style={styles.point} />
                )}
              </View>
              <Text style={styles.languageText}>English</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => selectLanguage('Hindi')}>
              <View style={styles.roundIcon}>
                {language === 'Hindi' && <View style={styles.point} />}
              </View>
              <Text style={styles.languageText}>हिंदी</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: scale(15),
    paddingBottom: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.AstroMaroon,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: moderateScale(17),
    marginLeft: scale(10),
    color: 'white',
    fontFamily: 'Lato-Bold',
  },
  notificationView: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(14),
    gap: scale(4),
  },
  walletAmount: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
  avatar: {
    width: moderateScale(26),
    height: moderateScale(26),
    borderRadius: moderateScale(13),
    borderWidth: 1,
    borderColor: 'white',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#E53935',
    borderRadius: moderateScale(8),
    minWidth: moderateScale(16),
    height: moderateScale(16),
    paddingHorizontal: scale(3),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
  },
  badgeText: {
    color: 'white',
    fontSize: moderateScale(9),
    fontFamily: 'Lato-Bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    marginHorizontal: scale(20),
    padding: scale(20),
    backgroundColor: 'white',
    borderRadius: moderateScale(10),
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    marginBottom: verticalScale(15),
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(15),
  },
  languageText: {
    fontSize: moderateScale(16),
    marginLeft: scale(10),
  },
  roundIcon: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    borderWidth: 2,
    borderColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: {
    width: moderateScale(10),
    height: moderateScale(10),
    borderRadius: moderateScale(5),
    backgroundColor: 'red',
  },
});

export default CustomHeader;
