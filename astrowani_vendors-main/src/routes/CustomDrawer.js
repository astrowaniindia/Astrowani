import React, {useCallback, useEffect, useState} from 'react';
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
import { supabase } from '../api/SupabaseClient';
function CustomDrawer(props) {
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

      const { data: astrologerData, error } = await supabase
        .from('astrologers')
        .select('*')
        .eq('id', astroId)
        .single();

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
        style={styles.headerSection}>
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
          label="Dashboard"
          icon={() => (
            <Icon name="dashboard" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('HomeScreen')}
        />
        <DrawerItem
          label="My Customers"
          icon={() => (
            <Icon name="group" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('MyCustomers')}
        />
        <DrawerItem
          label="Profile"
          icon={() => (
            <EvilIcons name="user" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('Profile')}
        />
        <DrawerItem
          label="Session History"
          icon={() => (
            <Icon name="history" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('SessionHistory')}
        />
        <DrawerItem
          label={() => (
            <View style={styles.missedLabelRow}>
              <Text style={styles.missedLabel}>Missed Sessions</Text>
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
          label="Support"
          icon={() => <Icon name="help" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('Support')}
        />
        <DrawerItem
          label="Notification"
          icon={() => (
            <EvilIcons name="bell" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('Notification')}
        />
        <DrawerItem
          label="Settings"
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
          label="Rating & Review"
          icon={() => <Icon name="help" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('RatingReview')}
        />
        <DrawerItem
          label="Wallet"
          icon={() => <Icon name="account-balance-wallet" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('Wallet')}
        />
        <DrawerItem
          label="Logout"
          icon={() => (
            <Icon name="logout" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={handleLogout}
        />
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
    paddingTop: (StatusBar.currentHeight || 0) + verticalScale(20),
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
