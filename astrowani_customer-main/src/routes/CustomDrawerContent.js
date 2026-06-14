import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';


import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { COLORS } from '../Theme/Colors';
import Instance from '../api/ApiCall';

function CustomDrawerContent(props, navigation) {
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
      message: 'Check out this awesome astrology app!', // Message to share
      url: 'https://your-app-link.com', // Replace with your app's URL
      title: 'Share App', // Title for the share dialog
    };

    await Share.share(shareOptions);
  } catch (error) {
    console.error('Error sharing:', error.message);
  }
};
  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        throw new Error('Token not found');
      }
      const response = await Instance.get('/api/users/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.data) {
        setUser(response.data.data);
        // console.log('user', response.data.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.clear();
      props.navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={styles.drawerHeader}>
        <TouchableOpacity onPress={() => props.navigation.closeDrawer()} style={styles.backButton}>
          <Icon name="arrow-back-ios" size={20} color="white" />
        </TouchableOpacity>
        <Text style={styles.drawerTitle}>Astrowani</Text>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
        <TouchableOpacity
          style={styles.userInfoSection}
          onPress={() =>
            props.navigation.navigate('UserProfileScreen', { user: user })
          }>
          {user?.profilePic ? (
            <Image source={{ uri: user?.profilePic }} style={styles.profile} />
          ) : (
            <Icon name="account-circle" size={60} color={COLORS.AstroMaroon} />
          )}

          <View style={styles.nameMobile}>
            <View style={styles.userNamerow}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.firstName || user?.phoneNumber || 'User'}
              </Text>
              <Icon
                style={styles.editIcon}
                name="edit"
                size={16}
                color={COLORS.AstroMaroon}
              />
            </View>
            <Text style={styles.phone} numberOfLines={1}>{user?.email || 'email'}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.drawerItemsContainer}>
          <DrawerItem
            label="My Wallet"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="account-balance-wallet" size={22} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('Wallet')}
          />
          <DrawerItem
            label="My Sessions"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="phone-in-talk" size={22} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('SessionStack')}
          />
          <DrawerItem
            label="Gemstone"
            labelStyle={styles.drawerLabel}
            icon={() => <FontAwesome6 name="gem" size={20} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('GemstoneDetails')}
          />
          <DrawerItem
            label="Remedies"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="spa" size={22} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('DrawerRemedies')}
          />
          <DrawerItem
            label="Chat With Astrologer"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="question-answer" size={22} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('DrawerChat')}
          />
          <DrawerItem
            label="My Favorites"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="favorite" size={22} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('FavoriteScreen')}
          />
          <DrawerItem
            label="Refer A friend"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="card-giftcard" size={22} color={COLORS.AstroMaroon} />}
            onPress={() => props.navigation.navigate('ReferFriend')}
          />
          <DrawerItem 
            label="Settings" 
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="settings" size={22} color={COLORS.AstroMaroon} />} 
            onPress={() => props.navigation.navigate('Settings')} 
          />
          <DrawerItem 
            label="Support" 
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="support-agent" size={22} color={COLORS.AstroMaroon} />} 
            onPress={() => props.navigation.navigate('SupportScreen')} 
          />
          <DrawerItem
            label="Share App"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="share" size={22} color={COLORS.AstroMaroon} />}
            onPress={handleShareApp}
          />
          <DrawerItem
            label="Logout"
            labelStyle={styles.drawerLabel}
            icon={() => <Icon name="logout" size={22} color={COLORS.AstroMaroon} />}
            onPress={handleLogout}
            style={styles.logoutButton}
          />
        </View>

        <View style={styles.socialSection}>
          <Text style={styles.socialheadig}>Available On</Text>
          <View style={styles.socialIconsRow}>
            <TouchableOpacity>
              <FontAwesome name="facebook-square" size={28} color="#3b5998" />
            </TouchableOpacity>
            <TouchableOpacity>
              <FontAwesome name="twitter-square" size={28} color="#00acee" style={styles.socialIcon} />
            </TouchableOpacity>
            <TouchableOpacity>
              <FontAwesome name="instagram" size={28} color="#C13584" style={styles.socialIcon} />
            </TouchableOpacity>
            <TouchableOpacity>
              <FontAwesome name="whatsapp" size={28} color="#25D366" style={styles.socialIcon} />
            </TouchableOpacity>
            <TouchableOpacity>
              <FontAwesome name="youtube-square" size={28} color="#FF0000" style={styles.socialIcon} />
            </TouchableOpacity>
          </View>
        </View>
      </DrawerContentScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    backgroundColor: COLORS.AstroMaroon,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + verticalScale(5) : verticalScale(15),
    paddingVertical: verticalScale(15),
    paddingHorizontal: scale(15),
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: scale(5),
    marginRight: scale(10),
  },
  drawerTitle: {
    color: 'white',
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
  },
  userInfoSection: {
    padding: moderateScale(15),
    backgroundColor: COLORS.AstroSoftOrange,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: scale(0.5),
    borderBottomColor: COLORS.AshGray,
    marginBottom: verticalScale(5),
  },
  drawerItemsContainer: {
    flex: 1,
  },
  drawerLabel: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: 'black',
    marginLeft: -scale(15),
  },
  logoutButton: {
    marginTop: verticalScale(10),
  },
  profile: {
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(30),
  },
  socialSection: {
    padding: moderateScale(10),
    margin: scale(25),

    alignItems: 'center',
    borderTopWidth: scale(0.5),
    borderTopColor: COLORS.AshGray,
  },
  socialheadig: {
    color: '#000',
  },
  userName: {
    fontSize: moderateScale(17),
    fontWeight: 'bold',
  },
  userNamerow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: scale(170),
  },
  editIcon: {
    paddingHorizontal: scale(7),
  },
  nameMobile: {
    marginLeft: scale(10),
  },
  socialIconsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginVertical: verticalScale(10),
  },
  socialIcon: {
    marginLeft: scale(5),
  },
  phone: {
    fontSize: moderateScale(12),
    color: COLORS.red,
    width: 200
  },
});

export default CustomDrawerContent;
