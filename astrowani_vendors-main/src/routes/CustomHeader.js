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
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../api/SupabaseClient';

const CustomHeader = ({title, showLanguage}) => {
  const navigation = useNavigation();
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [profileImage, setProfileImage] = useState(null);
  let subscription = null;

  const fetchBalance = async () => {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;
    if (subscription) {
      supabase.removeChannel(subscription);
      subscription = null;
    }
    const {data} = await supabase
      .from('astrologers')
      .select('wallet_balance, profile_pic_url, profile_image')
      .eq('id', astroId)
      .single();
    if (data) {
      setWalletBalance(data.wallet_balance);
      setProfileImage(data.profile_pic_url || data.profile_image || null);
    }

    subscription = supabase
      .channel(`vendor_wallet_header_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'astrologers', filter: `id=eq.${astroId}`}, payload => {
        if (payload.new?.wallet_balance !== undefined) {
          setWalletBalance(payload.new.wallet_balance);
        }
      })
      .subscribe();
  };

  useEffect(() => {
    fetchBalance();
    return () => {
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  const toggleLanguageModal = () => {
    setLanguageModalVisible(!languageModalVisible);
  };

  const selectLanguage = language => {
    setSelectedLanguage(language);
    toggleLanguageModal();
  };
  return (
    <View>
      <StatusBar backgroundColor={COLORS.AstroMaroon}/>
      <View style={styles.headerContainer}>
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
          <TouchableOpacity onPress={() => navigation.navigate('Notification')} style={{ marginRight: 12 }}>
            <MaterialIcons name="notifications-none" color="white" size={24} />
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
            <Text style={styles.modalTitle}>Choose Language</Text>

            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => selectLanguage('English')}>
              <View style={styles.roundIcon}>
                {selectedLanguage === 'English' && (
                  <View style={styles.point} />
                )}
              </View>
              <Text style={styles.languageText}>English</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => selectLanguage('Hindi')}>
              <View style={styles.roundIcon}>
                {selectedLanguage === 'Hindi' && <View style={styles.point} />}
              </View>
              <Text style={styles.languageText}>Hindi</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingTop: (StatusBar.currentHeight || 0) + verticalScale(5),
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
