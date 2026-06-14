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

export default function Profile() {
  const navigation = useNavigation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Token is missing. Please log in again.');
        return;
      }
      const response = await Instance.get('/api/astrologers/get-astrologer', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      // console.log("response: ", response?.data);

      if (response.data.success) {
        setData(response.data.data);
        console.log(response.data.data, 'Profile data fetched successfully');
      } else {
        Alert.alert('Error', response.data.message || 'Failed to fetch data.');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
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
      props.navigation.navigate('Login');
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
    <ScrollView >
      <View style={styles.container}>
        {/* Profile Details */}
        <View style={styles.profileSection}>
          <TouchableOpacity style={{ borderWidth: 1, borderRadius: scale(40) }} onPress={() => navigation.navigate('EditProfile')}>{data?.profileImage && data.profileImage.length > 0 ? (<Image source={{ uri: data.profileImage }} style={styles.profileImage} />) : (<Icon name="account-circle" size={80} color={COLORS.AstroMaroon} />)}</TouchableOpacity>
          <Text style={styles.profileName}>{data?.name || 'Name not available'}</Text>
          <Text style={styles.profileEmail}>{data?.email || 'Email not available'}</Text>

        </View>
        <View>
          <Text style={styles.profileName}>Profile Details</Text>

          <Text style={styles.profileName}>{data?.userId?.firstName || 'First Name not available'}</Text>
          <Text style={styles.profileEmail}>{data?.userId?.lastName || 'Last Name not available'}</Text>

          <Text style={[styles.profileName, { textTransform: 'capitalize' }]}>{data?.userId?.gender || 'Gender is not available'}</Text>
          <Text style={styles.profileEmail}>{data?.userId?.phoneNumber || 'Phone Number not available'}</Text>

          <Text style={[styles.profileName, { textTransform: 'capitalize' }]}>Experience</Text>
          <Text style={styles.profileEmail}>{data?.experience || '0'} Years</Text>

          <Text style={[styles.profileName, { textTransform: 'capitalize' }]}>Chat charges</Text>
          <Text style={styles.profileEmail}>{data?.chatChargePerMinute || '0'}/min</Text>

          <Text style={[styles.profileName, { textTransform: 'capitalize' }]}>Call Charges</Text>
          <Text style={styles.profileEmail}>{data?.callChargePerMinute || '0'}/min</Text>
        </View>
        <View>
          <Text style={styles.profileName}>Language</Text>
          {data?.language?.map((item, index) => (
            <Text key={index} style={styles.profileEmail}>{item}</Text>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => setLogoutModalVisible(true)}>
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
    backgroundColor: COLORS.background,
    padding: scale(20),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileSection: {
    alignItems: 'center',
    marginVertical: verticalScale(30),
  },
  profileName: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: COLORS.black,
    marginTop: verticalScale(10),
  },
  profileEmail: {
    fontSize: moderateScale(14),
    color: COLORS.gray,
    marginTop: verticalScale(5),
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoutButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    marginTop: verticalScale(20),
  },
  logoutButtonText: {
    fontSize: moderateScale(16),
    color: COLORS.white,
    fontWeight: 'bold',
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
    borderRadius: moderateScale(10),
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: verticalScale(15),
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(5),
    marginHorizontal: scale(5),
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.gray,
  },
  confirmButton: {
    backgroundColor: COLORS.AstroMaroon,
  },
  cancelButtonText: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
});
