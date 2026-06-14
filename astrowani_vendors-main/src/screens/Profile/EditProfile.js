import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  ActionSheetIOS,
  Platform,
  Alert,
  ToastAndroid,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'react-native-image-picker'; // Ensure you install this package
import { COLORS } from '../../Theme/Colors'; // Replace with your color scheme
import { moderateScale, scale, verticalScale } from '../../utils/Scaling'; // Replace with your scaling utils
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { useNavigation } from '@react-navigation/native';

export default function EditProfile() {
  const Navigation=useNavigation()
  const [name, setName] = useState('John Doe');
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('john.doe@example.com');
  const [loading, setLoading] = useState(false);
  const [profileImage, setProfileImage] = useState(null);

  const handleImagePicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Camera', 'Gallery'],
          cancelButtonIndex: 0,
        },
        buttonIndex => {
          if (buttonIndex === 1) {
            openCamera();
          } else if (buttonIndex === 2) {
            openGallery();
          }
        }
      );
    } else {
      Alert.alert(
        'Choose an option',
        '',
        [
          { text: 'Camera', onPress: openCamera },
          { text: 'Gallery', onPress: openGallery },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
    }
  };

  const openCamera = async () => {
    const result = await ImagePicker.launchCamera({
      mediaType: 'photo',
      includeBase64: false,
    });
    if (!result.didCancel) {
      setProfileImage(result.assets[0]?.uri);
    }
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      includeBase64: false,
    });
    if (!result.didCancel) {
      setProfileImage(result.assets[0]?.uri);
    }
  };
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
//update
const updateData = async (type, status) => {
  setLoading(true);
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      Alert.alert('Error', 'Token is missing. Please log in again.');
      return;
    }
    const response = await Instance.put(
      '/api/astrologers/update-astrologer',
      {name,email,profileImage},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.data.success) {
      ToastAndroid.showWithGravity(
        'status updated successfully.',
        ToastAndroid.SHORT,
        ToastAndroid.CENTER,
      );
      Navigation.navigate("Profile")
    } else {
      Alert.alert('Error', response.data.message || 'Failed to update status.');
      ToastAndroid.showWithGravity(
        response.data.message || 'Failed to update status.',
        ToastAndroid.SHORT,
        ToastAndroid.CENTER,
      );
    }
  } catch (error) {
    console.error(`Error updating ${type} status:`, error);
  
  } finally {
    setLoading(false);
  }
};

useEffect(()=>{
fetchData()
},[])
  return (
    <View style={styles.container}>
      {/* Profile Image Section */}
      <View style={styles.imageContainer}>
        <Image resizeMode='contain'
          source={
            profileImage
              ? { uri: profileImage }
              : require('../../assets/images/esoteric.png')
              // :{ uri: data.profileImage }
          }
          style={styles.profileImage}
        />
        <TouchableOpacity style={styles.editIcon} onPress={handleImagePicker}>
          <Icon name="edit" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
        placeholderTextColor={COLORS.lightGrey}
      />
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={COLORS.lightGrey}
        value={email}
        onChangeText={setEmail}
        placeholder="Enter your email"
        keyboardType="email-address"
      />
      <TouchableOpacity  style={styles.submitButton} onPress={updateData}>
        <Text style={styles.submitButtonText}>Submit</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white, 
    padding: scale(20),
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(20),
  },
  profileImage: {
    width: scale(100),
    height: scale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.gray,
  },
  editIcon: {
    position: 'absolute',
    bottom: 0,
    // right: scale(10),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(15),
    padding: moderateScale(5),
  },
  label: {
    fontSize: moderateScale(14),
    fontWeight: 'bold',
    color: COLORS.black,
    marginBottom: verticalScale(5),
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray,
    borderRadius: moderateScale(8),
    padding: verticalScale(10),
    marginBottom: verticalScale(15),
    fontSize: moderateScale(14),
    color:COLORS.black
  },
  submitButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    marginTop: verticalScale(10),
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(16),
    fontWeight: 'bold',
  },
});
