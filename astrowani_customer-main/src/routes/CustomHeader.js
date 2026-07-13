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
import Instance from '../api/ApiCall';

import { LanguageContext } from '../context/LanguageContext';

const CustomHeader = ({title, showLanguage}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [walletBalance, setWalletBalance] = useState(0);
  const { language, changeLanguage } = React.useContext(LanguageContext);

  useEffect(() => {
    let subscription = null;
    const fetchBalance = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        
        // 1. Initial fetch via backend API
        const res = await Instance.get('/api/wallet', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.success) {
          setWalletBalance(res.data.data.balance || 0);
        }

        // 2. Setup Real-time listener for live wallet updates.
        // fetchBalance runs again on every focus — tear down the previous channel and use a
        // unique name, else supabase.channel() returns the already-subscribed channel and
        // .on()-after-subscribe() throws ("cannot add postgres_changes ... after subscribe()").
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          const mobile = userData.phoneNumber || userData.mobile;
          if (mobile) {
            if (subscription) {
              supabase.removeChannel(subscription);
              subscription = null;
            }
            subscription = supabase
              .channel(`customers_header_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers', filter: `mobile=eq.${mobile}` }, payload => {
                if (payload.new && payload.new.wallet_balance !== undefined) {
                  setWalletBalance(payload.new.wallet_balance);
                }
              })
              .subscribe();
          }
        }
      } catch (e) {
        console.log('Error fetching wallet balance:', e.message);
      }
    };

    fetchBalance();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchBalance();
    });

    return () => {
      unsubscribe();
      if (subscription) supabase.removeChannel(subscription);
    };
  }, [navigation]);

  const toggleLanguage = () => {
    changeLanguage(language === 'Hindi' ? 'English' : 'Hindi');
  };
  return (
    <View style={{backgroundColor: COLORS.AstroMaroon, paddingTop: insets.top}}>
      <View style={styles.headerContainer}>
        <View style={styles.titleContainer}>
          <TouchableOpacity onPress={() => navigation.openDrawer()}>
            <Ionicons name="menu" color="white" size={28} />
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
            <TouchableOpacity onPress={() => navigation.navigate('NotificationScreen')}>
              <MaterialIcons
                name="notifications-none"
                color="white"
                size={24}
              />
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
});

export default CustomHeader;
