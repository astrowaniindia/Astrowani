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
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ImageCropPicker from 'react-native-image-crop-picker';
import { COLORS } from '../../Theme/Colors'; // Replace with your color scheme
import { moderateScale, scale, verticalScale } from '../../utils/Scaling'; // Replace with your scaling utils
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../api/SupabaseClient';

export default function EditProfile() {
  const Navigation=useNavigation()
  const [name, setName] = useState('John Doe');
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [experience, setExperience] = useState('');
  const [chatCharge, setChatCharge] = useState('');
  const [callCharge, setCallCharge] = useState('');
  const [videoCharge, setVideoCharge] = useState('');
  const [language, setLanguage] = useState('');
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
    try {
      const image = await ImageCropPicker.openCamera({
        width: 800,
        height: 800,
        cropping: true,
        includeBase64: true,
        mediaType: 'photo',
      });
      const base64Uri = `data:${image.mime || 'image/jpeg'};base64,${image.data}`;
      setProfileImage(base64Uri);
    } catch (e) {
      console.log(e);
    }
  };

  const openGallery = async () => {
    try {
      const image = await ImageCropPicker.openPicker({
        width: 800,
        height: 800,
        cropping: true,
        includeBase64: true,
        mediaType: 'photo',
      });
      const base64Uri = `data:${image.mime || 'image/jpeg'};base64,${image.data}`;
      setProfileImage(base64Uri);
    } catch (e) {
      console.log(e);
    }
  };
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
        setData(astroData);
        setName(`${astroData.first_name || ''} ${astroData.last_name || ''}`.trim());
        setEmail(astroData.email || '');
        setPhone(astroData.phone_number || astroData.mobile || '');
        setGender(astroData.gender || '');
        setExperience((astroData.experience || astroData.years_of_experience || '').toString());
        setChatCharge((astroData.chat_charge_per_minute || '').toString());
        setCallCharge((astroData.call_charge_per_minute || '').toString());
        setVideoCharge((astroData.video_charge_per_minute || '').toString());
        setLanguage(Array.isArray(astroData.languages) ? astroData.languages.join(', ') : (astroData.languages || ''));
        setProfileImage(astroData.profile_pic_url || astroData.profile_image || null);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'An unexpected error occurred while fetching your profile.');
    } finally {
      setLoading(false);
    }
  };

  //update
  const updateData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        Alert.alert('Error', 'Session is missing. Please log in again.');
        return;
      }

      const [firstName, ...lastNameParts] = name.trim().split(' ');
      const lastName = lastNameParts.join(' ');

      const langArray = language.split(',').map(l => l.trim()).filter(l => l);
      
      const { error } = await supabase
        .from('astrologers')
        .update({ 
          first_name: firstName, 
          last_name: lastName, 
          email: email, 
          phone_number: phone,
          gender: gender,
          experience: parseInt(experience) || 0,
          chat_charge_per_minute: parseInt(chatCharge) || 0,
          call_charge_per_minute: parseInt(callCharge) || 0,
          video_charge_per_minute: parseInt(videoCharge) || 0,
          languages: langArray,
          profile_pic_url: profileImage
        })
        .eq('id', astroId);

      if (!error) {
        ToastAndroid.showWithGravity(
          'Profile updated successfully!',
          ToastAndroid.SHORT,
          ToastAndroid.CENTER,
        );
        Navigation.goBack();
      } else {
        throw error;
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const removeProfileImage = () => {
    setProfileImage(null);
  };

useEffect(()=>{
fetchData()
},[])
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        {/* Profile Image Section */}
        <View style={styles.imageContainer}>
          <View style={styles.profileWrapper}>
            <Image resizeMode='cover'
              source={
                profileImage && profileImage.length > 0
                  ? { uri: profileImage }
                  : require('../../assets/images/esoteric.png')
              }
              style={styles.profileImage}
            />
            <TouchableOpacity style={styles.editIcon} onPress={handleImagePicker}>
              <Icon name="camera-alt" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.removeTextButton} onPress={removeProfileImage}>
            <Text style={styles.removeText}>Remove Photo</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.sectionTitle}>Personal Details</Text>
        
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Enter your full name"
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

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={phone}
          onChangeText={setPhone}
          placeholder="Enter your phone number"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Gender</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={gender}
          onChangeText={setGender}
          placeholder="e.g. Male, Female"
        />

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Professional Details</Text>

        <Text style={styles.label}>Experience (Years)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={experience}
          onChangeText={setExperience}
          placeholder="e.g. 5"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Chat Charges (₹/min)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={chatCharge}
          onChangeText={setChatCharge}
          placeholder="e.g. 15"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Call Charges (₹/min)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={callCharge}
          onChangeText={setCallCharge}
          placeholder="e.g. 20"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Video Charges (₹/min)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={videoCharge}
          onChangeText={setVideoCharge}
          placeholder="e.g. 25"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Languages (comma separated)</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.lightGrey}
          value={language}
          onChangeText={setLanguage}
          placeholder="e.g. English, Hindi"
        />
        
        <TouchableOpacity style={styles.submitButton} onPress={updateData}>
          <Text style={styles.submitButtonText}>Save Changes</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA', 
    padding: scale(15),
    paddingBottom: verticalScale(30),
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: scale(20),
    marginBottom: verticalScale(20),
    elevation: 4,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(25),
  },
  profileWrapper: {
    position: 'relative',
    width: scale(110),
    height: scale(110),
  },
  profileImage: {
    width: scale(110),
    height: scale(110),
    borderRadius: moderateScale(55),
    backgroundColor: COLORS.gray,
    borderWidth: 3,
    borderColor: COLORS.AstroMaroon,
  },
  editIcon: {
    position: 'absolute',
    bottom: 0,
    right: scale(0),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(18),
    padding: moderateScale(8),
    borderWidth: 2,
    borderColor: COLORS.white,
    elevation: 3,
  },
  removeTextButton: {
    marginTop: verticalScale(12),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    backgroundColor: 'rgba(255,0,0,0.05)',
    borderRadius: moderateScale(8),
  },
  removeText: {
    color: '#D32F2F',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(15),
    marginTop: verticalScale(5),
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: verticalScale(15),
  },
  label: {
    fontSize: moderateScale(14),
    fontWeight: 'bold',
    color: '#555',
    marginBottom: verticalScale(8),
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
    borderRadius: moderateScale(12),
    padding: verticalScale(12),
    paddingHorizontal: scale(15),
    marginBottom: verticalScale(20),
    fontSize: moderateScale(15),
    color: COLORS.black,
    backgroundColor: '#FAFAFA',
  },
  submitButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    marginTop: verticalScale(10),
    elevation: 3,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(16),
    fontWeight: 'bold',
  },
});
