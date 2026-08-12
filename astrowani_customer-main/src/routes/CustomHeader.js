import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import useNotificationBadgeSync from '../hooks/useNotificationBadgeSync';
import useWalletBalance, { refreshWalletBalance } from '../hooks/useWalletBalance';

import { LanguageContext } from '../context/LanguageContext';

const CustomHeader = ({title, showLanguage}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Shared poll (see hooks/useWalletBalance.js) — this header mounts on 6 main
  // tabs, and used to run its own independent 20s interval on top of the tab
  // bar's and the Wallet screen's, up to 3x the necessary /api/wallet traffic
  // at once. refreshWalletBalance() below still forces an immediate refetch on
  // focus without starting a second timer.
  const walletBalanceValue = useWalletBalance();
  const walletBalance = walletBalanceValue === null ? 0 : walletBalanceValue;
  const [unreadCount, setUnreadCount] = useState(0);
  const [customerId, setCustomerId] = useState(null);
  const { language, changeLanguage } = React.useContext(LanguageContext);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refreshWalletBalance);
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async (id) => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', id)
        .eq('is_read', false);
      if (!cancelled) setUnreadCount(count || 0);
    };

    const setup = async () => {
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (!userDataStr) return;
        const userData = JSON.parse(userDataStr);
        if (!userData?.id) return;
        if (!cancelled) setCustomerId(userData.id);
        await fetchCount(userData.id);
      } catch (e) {
        console.log('Error fetching unread notification count:', e.message);
      }
    };

    setup();
    const unsubscribe = navigation.addListener('focus', setup);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigation]);

  // Live badge updates via the backend's existing socket event (see
  // hooks/useNotificationBadgeSync.js) instead of this component's own direct,
  // per-mount Supabase Realtime subscription — this header mounts on nearly every
  // screen, so that pattern meant an always-on Realtime connection per customer.
  useNotificationBadgeSync(customerId, () => {
    if (!customerId) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count || 0));
  });

  const toggleLanguage = () => {
    changeLanguage(language === 'Hindi' ? 'English' : 'Hindi');
  };

  // This header is shared between bottom-tab screens (Chat/Video/Call/Live — no back
  // needed, they're tab roots) and the SAME screens reached as a drawer detour
  // (DrawerChat/DrawerRemedies — a back button IS needed there, since the user came
  // from somewhere and had no way back before this fix). Detected by checking whether
  // the immediate parent navigator is the Drawer, rather than a prop, since both
  // routes render the exact same component with no way to tell them apart otherwise.
  const parentState = navigation.getParent()?.getState?.();
  const isDrawerDetour = parentState?.type === 'drawer';

  return (
    <View style={{backgroundColor: COLORS.AstroMaroon, paddingTop: insets.top}}>
      <View style={styles.headerContainer}>
        <View style={styles.titleContainer}>
          <TouchableOpacity onPress={() => (isDrawerDetour ? navigation.getParent().goBack() : navigation.openDrawer())}>
            <Ionicons name={isDrawerDetour ? 'arrow-back' : 'menu'} color="white" size={28} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
        </View>
        {showLanguage && (
          <View style={styles.notificationView}>
            <TouchableOpacity onPress={() => navigation.navigate('Wallet')} style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.balanceText}>₹ {walletBalance}</Text>
              <Ionicons name="wallet-outline" color="white" size={24} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleLanguage} style={styles.langPill} activeOpacity={0.7}>
              <Text style={[styles.langPillText, language === 'English' && styles.langPillTextActive]}>EN</Text>
              <Text style={styles.langPillDivider}>|</Text>
              <Text style={[styles.langPillText, language === 'Hindi' && styles.langPillTextActive]}>हिं</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('NotificationScreen')} style={{position: 'relative'}}>
              <MaterialIcons
                name="notifications-none"
                color="white"
                size={24}
              />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  headerContainer: {
    paddingTop: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(15),
    paddingBottom: verticalScale(10),
    backgroundColor: COLORS.AstroMaroon,
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
    width: scale(150),
    justifyContent: 'space-between',
  },
  balanceText: {
    color: 'white',
    fontWeight: 'bold',
    marginRight: scale(5),
    fontSize: moderateScale(14),
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
  },
  langPillText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Bold',
  },
  langPillTextActive: {
    color: 'white',
  },
  langPillDivider: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateScale(11),
    marginHorizontal: scale(3),
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
});

export default CustomHeader;
