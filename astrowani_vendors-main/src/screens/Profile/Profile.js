import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { supabase } from '../../api/SupabaseClient';

export default function Profile({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        Alert.alert('Error', 'Session missing. Please log in again.');
        return;
      }

      const { data: astroData, error } = await supabase
        .from('astrologers')
        .select('*')
        .eq('id', astroId)
        .single();

      if (error) throw error;

      if (astroData) {
        setData({
          name: `${astroData.first_name || ''} ${astroData.last_name || ''}`.trim(),
          email: astroData.email,
          profileImage: astroData.profile_image || astroData.image || '',
          experience: astroData.experience || astroData.years_of_experience || 0,
          chatChargePerMinute: astroData.chat_charge_per_minute || 0,
          callChargePerMinute: astroData.call_charge_per_minute || 0,
          language: Array.isArray(astroData.language) ? astroData.language : (astroData.language ? [astroData.language] : []),
          userId: {
            firstName: astroData.first_name || '',
            lastName: astroData.last_name || '',
            gender: astroData.gender || 'Not specified',
            phoneNumber: astroData.phone_number || astroData.mobile || 'Not specified',
          }
        });
      } else {
        Alert.alert('Error', 'Profile not found.');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'An unexpected error occurred while fetching your profile.');
    } finally {
      setLoading(false);
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
      navigation.replace('Login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };
  // Loading Indicator
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }
  // console.log("data: ", data);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Top Banner & Profile Header */}
      <View style={styles.headerBackground}>
        <View style={styles.profileHeaderContent}>
          <View style={styles.profileImageContainer}>
            {data?.profileImage && data.profileImage.length > 0 ? (
              <Image source={{ uri: data.profileImage }} style={styles.profileImage} />
            ) : (
              <Icon name="account-circle" size={100} color={COLORS.AstroMaroon} />
            )}
          </View>
          <Text style={styles.profileName}>{data?.name || 'Name not available'}</Text>
          <Text style={styles.profileEmail}>{data?.email || 'Email not available'}</Text>
          
          <TouchableOpacity style={styles.editButton} onPress={() => navigation.navigate('EditProfile')}>
            <Icon name="edit" size={16} color={COLORS.white} />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bodyContainer}>
        {/* Personal Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Details</Text>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>First Name</Text>
            <Text style={styles.infoValue}>{data?.userId?.firstName || 'Not available'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Name</Text>
            <Text style={styles.infoValue}>{data?.userId?.lastName || 'Not available'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Gender</Text>
            <Text style={[styles.infoValue, { textTransform: 'capitalize' }]}>{data?.userId?.gender || 'Not specified'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{data?.userId?.phoneNumber || 'Not available'}</Text>
          </View>
        </View>

        {/* Professional Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Professional Details</Text>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Experience</Text>
            <Text style={styles.infoValue}>{data?.experience || '0'} Years</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Chat Charges</Text>
            <Text style={styles.infoValue}>₹{data?.chatChargePerMinute || '0'}/min</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Call Charges</Text>
            <Text style={styles.infoValue}>₹{data?.callChargePerMinute || '0'}/min</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Language</Text>
            <Text style={styles.infoValue}>
              {data?.language && data.language.length > 0 ? data.language.join(', ') : 'Not specified'}
            </Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => setLogoutModalVisible(true)}>
          <Icon name="logout" size={20} color={COLORS.white} />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        {/* Logout Confirmation Modal */}
        <Modal
          transparent={true}
          animationType="fade"
          visible={logoutModalVisible}
          onRequestClose={() => setLogoutModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>
                Are you sure you want to logout?
              </Text>
              <View style={styles.modalButtonContainer}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setLogoutModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleLogout}>
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerBackground: {
    backgroundColor: COLORS.AstroMaroon,
    paddingTop: verticalScale(30),
    paddingBottom: verticalScale(40),
    borderBottomLeftRadius: moderateScale(30),
    borderBottomRightRadius: moderateScale(30),
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  profileHeaderContent: {
    alignItems: 'center',
  },
  profileImageContainer: {
    width: scale(100),
    height: scale(100),
    borderRadius: scale(50),
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    borderWidth: 3,
    borderColor: COLORS.white,
    marginBottom: verticalScale(10),
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: scale(50),
  },
  profileName: {
    fontSize: moderateScale(22),
    fontWeight: 'bold',
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
  },
  profileEmail: {
    fontSize: moderateScale(14),
    color: '#EEEEEE',
    marginTop: verticalScale(4),
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    marginTop: verticalScale(15),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  editButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(14),
    fontWeight: 'bold',
    marginLeft: scale(5),
  },
  bodyContainer: {
    padding: scale(15),
    marginTop: verticalScale(-20),
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: scale(20),
    marginBottom: verticalScale(15),
    elevation: 4,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  cardTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: verticalScale(12),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(6),
  },
  infoLabel: {
    fontSize: moderateScale(14),
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: moderateScale(14),
    color: COLORS.black,
    fontWeight: 'bold',
    maxWidth: '60%',
    textAlign: 'right',
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingVertical: verticalScale(15),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(10),
    marginBottom: verticalScale(30),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    elevation: 2,
  },
  logoutButtonText: {
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    marginLeft: scale(8),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    padding: scale(20),
    borderRadius: moderateScale(15),
    width: '80%',
    alignItems: 'center',
    elevation: 5,
  },
  modalTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: verticalScale(20),
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
    marginHorizontal: scale(8),
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
  },
  confirmButton: {
    backgroundColor: COLORS.AstroMaroon,
  },
  cancelButtonText: {
    color: COLORS.black,
    fontSize: moderateScale(15),
    fontWeight: 'bold',
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(15),
    fontWeight: 'bold',
  },
});
