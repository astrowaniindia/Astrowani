import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Dropdown, MultiSelect } from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { COLORS } from '../Theme/Colors';
import ImagePicker from 'react-native-image-crop-picker';
import { supabase } from '../api/SupabaseClient';
import Instance from '../api/ApiCall';
import { getFCMToken } from '../utils/Firebase';

const Registration = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [fcmToken, setFcmToken] = useState('');

  const [skillsOptions, setSkillsOptions] = useState([]);
  const [error, setError] = useState('');


  useEffect(() => {
    // Use the shared getFCMToken (utils/Firebase.js), not a raw messaging().getToken():
    // it reads the cached token from AsyncStorage first and only asks Firebase when there
    // isn't one, and it catches its own errors. The local copy this replaced did neither,
    // so once a device hit Firebase's per-project registration cap the rejected promise
    // went unhandled and crashed this screen (Sentry ASTROWANI-VENDOR-1,
    // [messaging/unknown] TOO_MANY_REGISTRATIONS).
    getFCMToken().then(token => {
      if (token) setFcmToken(token);
    });
  }, []);
  
  const [user, setUser] = useState({
    profilePic: '',
    email: '',
    fullName: '',
    gender: '',
    skills: [],
    languages: [],
    phoneNumber: '',
    experience: '',
  });


  const handleInputChange = (field, value) => {
    setUser(prevState => ({
      ...prevState,
      [field]: value,
    }));
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase.from('categories').select('*');
        if (error) throw error;
        
        const formattedSkills = data.map(skill => ({ label: skill.name, value: skill.id }));
        setSkillsOptions(formattedSkills);
      } catch (err) {
        setError(err.message);
        console.log(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);


  const handleImageUpload = async () => {
    try {
      const image = await ImagePicker.openPicker({
        width: 300,
        height: 300,
        cropping: true,
        includeBase64: true,
      });
      // A local file:// path is only valid on this device and this screen has no
      // auth token yet (signup isn't OTP-verified), so it can't be uploaded here —
      // base64 data URI travels through registrationData and VerifyOtp.js uploads
      // it once OTP verification hands back a usable token.
      const base64Uri = `data:${image.mime || 'image/jpeg'};base64,${image.data}`;
      handleInputChange('profilePic', base64Uri);
    } catch (error) {
      console.log('Image picking error: ', error);
    }
  };

  const handleSubmit = async () => {
    const trimmedName = (user.fullName || '').trim();
    if (!trimmedName || !user.phoneNumber) {
      Alert.alert('Missing info', 'Please enter at least your full name and phone number.');
      return;
    }
    if (user.phoneNumber.length < 10) {
      Alert.alert('Missing info', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      // If fcmToken is missing (e.g. on emulator), log a warning but continue registration
      if (!fcmToken) {
        console.warn('FCM token not available. Registering without push notifications.');
      }

      // Store the full name; split into first/last so the rest of the app (which
      // still reads first_name/last_name) keeps working.
      const [firstName, ...rest] = trimmedName.split(/\s+/);
      const lastName = rest.join(' ');

      // The actual astrologers row is only created after the phone number is OTP-verified
      // (see VerifyOtp.js's finishRegistration) — this just requests the OTP.
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber: user.phoneNumber,
        role: 'astrologer',
        intent: 'signup',
      });
      if (!res?.data?.success) {
        Alert.alert('Registration Failed', res?.data?.message || 'Could not send OTP. Please try again.');
        return;
      }

      navigation.navigate('VerifyOtp', {
        phoneNumber: user.phoneNumber,
        role: 'astrologer',
        registrationData: {
          email: user.email,
          first_name: firstName,
          last_name: lastName,
          phone_number: user.phoneNumber,
          gender: user.gender,
          experience: parseInt(user.experience) || 0,
          languages: user.languages,
          fcm_token: fcmToken,
          specialties: user.skills,
          // Uploaded to Supabase Storage in VerifyOtp.js's finishRegistration, once
          // OTP verification has produced a token this screen doesn't have yet.
          profile_pic_base64: user.profilePic || null,
          // New signups await admin approval before reaching their dashboard.
          approval_status: 'pending',
          // Service toggles + charges — start disabled/zero so the astrologer is hidden
          // everywhere until they set charges (EditProfile) and enable services (HomeScreen).
          is_chat_enabled: false,
          is_call_enabled: false,
          is_video_call_enabled: false,
          is_available: false,
          chat_charge_per_minute: 0,
          call_charge_per_minute: 0,
          video_charge_per_minute: 0,
        },
      });
    } catch (error) {
      if (error?.response?.data?.code === 'ACCOUNT_EXISTS') {
        Alert.alert(
          'Account Already Exists',
          'An account already exists for this number. Please log in instead.'
        );
        navigation.navigate('Login');
      } else {
        // Prefer the server's own message — axios's error.message is the raw
        // "Request failed with status code NNN", which told the astrologer
        // nothing and was reported as confusing in production 2026-08-15.
        // The backend already sends a human-readable reason (e.g. the OTP SMS
        // could not be sent); surface that instead and keep the status code
        // out of the user's face.
        console.error('Registration error:', error?.response?.status, error?.response?.data || error.message);
        Alert.alert(
          'Registration Failed',
          error?.response?.data?.message || 'Something went wrong. Please try again.',
        );
      }
    } finally {
      setLoading(false);
    }
  };
  console.log("Dropdown Options:", skillsOptions);

  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];

  const languageOptions = [
    { label: 'Hindi', value: 'Hindi' },
    { label: 'English', value: 'English' },
  ];

  const mobileOptions = [
    { label: 'IOS', value: 'ios' },
    { label: 'Android', value: 'android' },
  ];

  return (
    <View style={styles.container}>
      {/* Profile Picture Upload */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.imageContainer}>
          {user.profilePic ? (
            <Image
              source={{ uri: user.profilePic }}
              style={styles.profileImage}
            />
          ) : (
            <Image
              source={{
                uri: 'https://cdn-icons-png.flaticon.com/128/149/149071.png',
              }}
              style={styles.profileImage}
            />
          )}
          <TouchableOpacity style={styles.editIcon} onPress={handleImageUpload}>
            <Ionicons name="pencil" size={16} color={COLORS.orange} />
          </TouchableOpacity>
        </View>
        <Text style={styles.uploadText}>Upload Image (below 5MB)</Text>

        <View style={styles.profileView}>
          <TextInput
            placeholder="Full Name"
            placeholderTextColor="gray"
            style={styles.input}
            value={user.fullName}
            onChangeText={text => handleInputChange('fullName', text)}
          />
          <View style={styles.dropdownContainer}>
            <MultiSelect
              style={styles.dropdown}
              data={skillsOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Skills"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={user.skills}
              onChange={value => handleInputChange('skills', value)}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={(item, selected) => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>
                    {item.label} {selected ? '✔️' : ''}
                  </Text>
                </View>
              )}
            />
          </View>

          <TextInput
            placeholder="Total Experience"
            placeholderTextColor="gray"
            style={styles.input}
            keyboardType="number-pad"
            value={user.experience}
            onChangeText={text => handleInputChange('experience', text)}
          />

          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={genderOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Gender"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={user.gender}
              onChange={item => {
                handleInputChange('gender', item.value);
              }}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
            />
          </View>

          {/* Multiselect for Languages */}
          <View style={styles.dropdownContainer}>
            <MultiSelect
              style={styles.dropdown}
              data={languageOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Languages"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={user.languages}
              onChange={value => handleInputChange('languages', value)}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={(item, selected) => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>
                    {item.label} {selected ? '✔️' : ''}
                  </Text>
                </View>
              )}
            />
          </View>

          <TextInput
            placeholder="Enter Email ID"
            placeholderTextColor="gray"
            style={styles.input}
            keyboardType="email-address"
            value={user.email}
            onChangeText={text => handleInputChange('email', text)}
          />
          <TextInput
            placeholder="Enter Phone number"
            placeholderTextColor="gray"
            style={styles.input}
            keyboardType="number-pad"
            value={user.phoneNumber}
            onChangeText={text => handleInputChange('phoneNumber', text)}
          />
        </View>
        <TouchableOpacity onPress={handleSubmit} style={styles.submitButton} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={COLORS.AstroMaroon} />
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.signin}>Already have an Account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: scale(20),
  },
  imageContainer: {
    alignItems: 'center',
    marginVertical: verticalScale(9),
    width: scale(60),
    alignSelf: 'center',
  },
  profileImage: {
    width: scale(60),
    height: scale(60),
    borderRadius: moderateScale(30),
  },
  editIcon: {
    position: 'absolute',
    bottom: verticalScale(-10),
    right: 0,
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    padding: scale(5),
  },
  uploadText: {
    color: 'blue',
    marginVertical: verticalScale(10),
    textAlign: 'center',
  },

  submitButton: {
    backgroundColor: COLORS.AstroGold,
    padding: moderateScale(14),
    alignItems: 'center',
    borderRadius: moderateScale(7),
  },
  submitButtonText: {
    fontWeight: 'bold',
    color: '#000',
  },
  profileView: {},
  input: {
    flexDirection: 'row',
    height: verticalScale(50),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
    fontFamily: 'Lato-Regular',
    // No explicit text color meant Android fell back to the app theme's default
    // textColorPrimary — on this app's dark theme that resolved to white, making
    // typed text invisible against this form's white input background. Pin it
    // explicitly instead of relying on the platform default.
    color: COLORS.black || '#000',
  },
  dropdownText: {
    fontSize: moderateScale(14),
    color: COLORS.gray,
  },
  dropdownTextSelected: {
    fontSize: moderateScale(14),
    color: COLORS.black,
  },
  item: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
  },
  itemText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000', // Black color for dropdown items
  },
  selectedItemText: {
    fontSize: moderateScale(14),
    color: '#000',
  },
  errorText: {
    color: 'red',
    marginBottom: verticalScale(10),
    textAlign: 'center',
  },
  LastInput: {
    height: verticalScale(50),
    paddingHorizontal: scale(10),

    justifyContent: 'center',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
  },
  dropdownContainer: {
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
  },
  dropdown: {
    width: '100%',
    height: verticalScale(50),
  },
  signin: {
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    marginVertical: verticalScale(5),
    fontWeight: 'bold',
  },
});

export default Registration;
