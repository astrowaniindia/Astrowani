import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Share, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
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
      await AsyncStorage.clear();
      props.navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // Helper function to render drawer icons inside a stylish circular container
  const renderIcon = (IconComponent, name, size = 20) => (
    <View style={styles.iconWrapper}>
      <IconComponent name={name} size={moderateScale(size)} color={COLORS.AstroMaroon} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Unified Header & Profile Section */}
      <View style={styles.headerBlock}>
        <View style={styles.headerTopRow}>
          <Text style={styles.drawerTitle}>Astrowani</Text>
          <TouchableOpacity onPress={() => props.navigation.closeDrawer()} style={styles.closeBtn}>
            <Icon name="close" size={moderateScale(24)} color="#fff" />
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
              <Icon name="account-circle" size={moderateScale(60)} color={COLORS.AstroGold} />
            )}
          </View>
          <View style={styles.profileTextContainer}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.firstName || user?.phoneNumber || 'Welcome!'}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email || 'Update your profile'}
            </Text>
          </View>
          <Icon name="chevron-right" size={moderateScale(24)} color={COLORS.AstroGold} />
        </TouchableOpacity>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.drawerItemsWrapper}>
          <DrawerItem
            label="My Wallet"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'account-balance-wallet')}
            onPress={() => props.navigation.navigate('Wallet')}
          />
          <DrawerItem
            label="My Sessions"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'phone-in-talk')}
            onPress={() => props.navigation.navigate('SessionStack')}
          />
          <DrawerItem
            label="Gemstones"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(FontAwesome6, 'gem', 18)}
            onPress={() => props.navigation.navigate('GemstoneDetails')}
          />
          <DrawerItem
            label="Remedies"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'spa')}
            onPress={() => props.navigation.navigate('DrawerRemedies')}
          />
          <DrawerItem
            label="Chat With Astrologer"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'question-answer')}
            onPress={() => props.navigation.navigate('DrawerChat')}
          />
          <DrawerItem
            label="Astrowani Blogs"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'menu-book')}
            onPress={() => props.navigation.navigate('BlogList')}
          />
          <DrawerItem
            label="My Favorites"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'favorite')}
            onPress={() => props.navigation.navigate('FavoriteScreen')}
          />
          
          <View style={styles.divider} />
          
          <DrawerItem
            label="Refer A Friend"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'card-giftcard')}
            onPress={() => props.navigation.navigate('ReferFriend')}
          />
          <DrawerItem 
            label="Settings" 
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'settings')} 
            onPress={() => props.navigation.navigate('Settings')} 
          />
          <DrawerItem 
            label="Support" 
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'support-agent')} 
            onPress={() => props.navigation.navigate('SupportScreen')} 
          />
          <DrawerItem
            label="Share App"
            labelStyle={styles.drawerLabel}
            icon={() => renderIcon(Icon, 'share')}
            onPress={handleShareApp}
          />
          <DrawerItem
            label="Logout"
            labelStyle={[styles.drawerLabel, { color: 'red' }]}
            icon={() => (
              <View style={[styles.iconWrapper, { backgroundColor: 'rgba(255,0,0,0.1)' }]}>
                <Icon name="logout" size={moderateScale(20)} color="red" />
              </View>
            )}
            onPress={handleLogout}
          />
        </View>

        <View style={styles.socialContainer}>
          <Text style={styles.socialHeading}>Connect With Us</Text>
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
        </View>
      </DrawerContentScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  headerBlock: {
    backgroundColor: COLORS.AstroMaroon,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + verticalScale(10) : verticalScale(30),
    paddingBottom: verticalScale(25),
    paddingHorizontal: scale(20),
    borderBottomLeftRadius: moderateScale(30),
    borderBottomRightRadius: moderateScale(30),
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  drawerTitle: { color: COLORS.AstroGold, fontSize: moderateScale(22), fontFamily: 'Lato-Bold' },
  closeBtn: { padding: scale(5) },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRing: {
    width: scale(64), height: scale(64),
    borderRadius: moderateScale(32),
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.AstroGold,
  },
  profileImage: { width: '100%', height: '100%', borderRadius: moderateScale(32) },
  profileTextContainer: { flex: 1, marginLeft: scale(15) },
  profileName: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: '#fff', marginBottom: verticalScale(4) },
  profileEmail: { fontSize: moderateScale(13), fontFamily: 'Lato-Regular', color: 'rgba(255,255,255,0.8)' },
  scrollContent: { paddingTop: verticalScale(15), paddingBottom: verticalScale(30) },
  drawerItemsWrapper: { paddingHorizontal: scale(10) },
  iconWrapper: {
    width: scale(38), height: scale(38),
    borderRadius: moderateScale(19),
    backgroundColor: COLORS.AstroSoftOrange,
    justifyContent: 'center', alignItems: 'center',
  },
  drawerLabel: {
    fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: '#333',
    marginLeft: -scale(10), // brings text closer to the circular icon
  },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: verticalScale(10), marginHorizontal: scale(20) },
  socialContainer: {
    marginTop: verticalScale(15),
    paddingTop: verticalScale(20),
    borderTopWidth: 1, borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  socialHeading: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: '#666', marginBottom: verticalScale(15) },
  socialIconsRow: { flexDirection: 'row', justifyContent: 'center', gap: scale(15) },
  socialBtn: {
    width: scale(40), height: scale(40),
    borderRadius: moderateScale(20),
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
});

export default CustomDrawerContent;
