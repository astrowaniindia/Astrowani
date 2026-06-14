import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Switch,
  ToastAndroid,
  Alert,
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
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { supabase } from '../api/SupabaseClient';
function CustomDrawer(props) {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ids, setIds] = useState('');
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
          profileImage: astrologerData.profile_image // Add this column later if needed
        });
        setIsOnline(astrologerData.is_available);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOnlineStatus = async () => {
    try {
      const newStatus = !isOnline;
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { error } = await supabase
        .from('astrologers')
        .update({ is_available: newStatus })
        .eq('id', astroId);

      if (!error) {
        setIsOnline(newStatus);
        ToastAndroid.show(`You are now ${newStatus ? 'Online' : 'Offline'}.`, ToastAndroid.SHORT);
      } else {
        Alert.alert('Error', 'Failed to update status.');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
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
    <DrawerContentScrollView {...props}>
      {/* Header Section */}
      <LinearGradient
        colors={['#592a19', '#800000']}
        style={styles.headerSection}>
        <TouchableOpacity
          style={styles.userInfoSection}
          onPress={() => props.navigation.navigate('UserProfileScreen')}>
          {data?.profileImage ? (
            <Image
              resizeMode="contain"
              source={{uri: data.profileImage}}
              style={styles.profile}
            />
          ) : (
            <Icon name="account-circle" size={80} color={COLORS.white} />
          )}
          <View style={styles.nameContainer}>
            <Text style={styles.userName}>
              {data?.name || 'Name not available'}
            </Text>
            <Text style={styles.userEmail}>
              {data?.email || 'Email not available'}
            </Text>
          </View>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.drawerItems}>
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
          label="Chat History"
          icon={() => (
            <Icon name="message" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('ChatHistory')}
        />
        <DrawerItem
          label="Call History"
          icon={() => <Icon name="call" size={24} color={COLORS.AstroMaroon} />}
          onPress={() => props.navigation.navigate('CallHistory')}
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
        />
        <DrawerItem
          label="Today Earning"
          icon={() => (
            <Icon name="money" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('TodayEarning')}
        />
        <DrawerItem
          label="Total Earning"
          icon={() => (
            <Icon name="money" size={24} color={COLORS.AstroMaroon} />
          )}
          onPress={() => props.navigation.navigate('TotalEarning')}
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
        <View style={styles.onlineSwitchContainer}>
          <View style={styles.switchMain}>
            <MaterialIcons
              name="online-prediction"
              size={24}
              color={COLORS.AstroMaroon}
            />
            <Text style={styles.onlineStatusText}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnlineStatus}
            trackColor={{false: COLORS.AshGray, true: COLORS.AstroMaroon}}
            thumbColor={isOnline ? COLORS.AstroMaroon : COLORS.white}
          />
        </View>
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
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(15),
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.white,
    marginTop: -10,
  },
  userInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
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
    // flex: 1,
    width: 200,
  },
  userName: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: COLORS.white,
    width: 150,
  },
  userEmail: {
    fontSize: moderateScale(14),
    color: COLORS.white,
  },
  drawerItems: {
    marginTop: verticalScale(10),
  },
  socialSection: {
    marginTop: verticalScale(20),
    padding: moderateScale(10),
    backgroundColor: COLORS.AshGray,
    borderRadius: scale(10),
    alignItems: 'center',
    marginHorizontal: 10,
  },
  socialHeading: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    marginBottom: verticalScale(10),
  },
  socialIcons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  onlineSwitchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: scale(14),
  },
  switchMain: {
    flexDirection: 'row',
    gap: scale(26),
  },
});

export default CustomDrawer;
