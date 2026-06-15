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
import {useNavigation} from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

import { LanguageContext } from '../context/LanguageContext';

const CustomHeader = ({title, showLanguage}) => {
  const navigation = useNavigation();
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const { language, changeLanguage, t } = React.useContext(LanguageContext);

  useEffect(() => {
    let subscription = null;
    const fetchBalance = async () => {
      try {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          const mobile = userData.phoneNumber || userData.mobile;
          const email = userData.email;
          
          if (mobile || email) {
            // Fetch initial balance
            let query = supabase.from('customers').select('wallet_balance');
            
            if (mobile) {
              query = query.eq('mobile', mobile);
            } else {
              query = query.eq('email', email);
            }
            
            const { data, error } = await query.single();
              
            if (data && data.wallet_balance !== undefined) {
              setWalletBalance(data.wallet_balance);
            }

            // Subscribe to realtime updates
            const filterKey = mobile ? `mobile=eq.${mobile}` : `email=eq.${email}`;
            subscription = supabase
              .channel('public:customers_header')
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'customers', filter: filterKey }, payload => {
                if (payload.new && payload.new.wallet_balance !== undefined) {
                  setWalletBalance(payload.new.wallet_balance);
                }
              })
              .subscribe();
          }
        }
      } catch (e) {
        console.log('Error fetching wallet balance:', e);
      }
    };

    fetchBalance();

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  const toggleLanguageModal = () => {
    setLanguageModalVisible(!languageModalVisible);
  };
  const selectLanguage = lang => {
    changeLanguage(lang);
    toggleLanguageModal();
  };
  return (
    <View style={{backgroundColor: COLORS.AstroMaroon}}>
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
            <TouchableOpacity onPress={toggleLanguageModal}>
              <MaterialIcons name="translate" color="white" size={24} />
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
            <Text style={[styles.modalTitle, {color: 'black'}]}>{t('language')}</Text>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => selectLanguage('English')}>
              <View style={styles.roundIcon}>
                {language === 'English' && (
                  <View style={styles.point} />
                )}
              </View>
              <Text style={[styles.languageText, {color: 'black'}]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => selectLanguage('Hindi')}>
              <View style={styles.roundIcon}>
                {language === 'Hindi' && <View style={styles.point} />}
              </View>
              <Text style={[styles.languageText, {color: 'black'}]}>Hindi</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    width: scale(120),
    justifyContent: 'space-between',
  },
  balanceText: {
    color: 'white',
    fontWeight: 'bold',
    marginRight: scale(5),
    fontSize: moderateScale(14),
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
