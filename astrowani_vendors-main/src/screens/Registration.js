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
import { Dropdown } from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { COLORS } from '../Theme/Colors';
import DateTimePicker from '@react-native-community/datetimepicker';
import ImagePicker from 'react-native-image-crop-picker';
import { supabase } from '../api/SupabaseClient';
import messaging from '@react-native-firebase/messaging';

const Registration = ({ navigation }) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fcmToken, setFcmToken] = useState('');

  const [skillsOptions, setSkillsOptions] = useState([]);
  const [error, setError] = useState('');


  const getFCMToken = async () => {
    // Silence the modular deprecation warning from Firebase
    globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;
    let token = await messaging().getToken();
    setFcmToken(token);
  };

  useEffect(() => {
    getFCMToken();
  }, []);
  
  const [user, setUser] = useState({
    profilePic: '',
    email: '',
    firstName: '',
    lastName: '',
    gender: '',
    skills: [],
    dateOfBirth: '',
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
      const image = await ImagePicker.openPicker({ width: 300, height: 300, cropping: true, });
      handleInputChange('profilePic', image.path);
    } catch (error) {
      console.log('Image picking error: ', error);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (!fcmToken) {
        Alert.alert('Error', 'FCM token not available. Please try again.');
        setLoading(false);
        return;
      }
      
      const { error } = await supabase.from('astrologers').insert([
        {
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          phone_number: user.phoneNumber,
          date_of_birth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString() : null,
          gender: user.gender,
          experience: parseInt(user.experience) || 0,
          languages: user.languages,
          fcm_token: fcmToken,
          specialties: user.skills.map(skillLabel => {
            const skill = skillsOptions.find(opt => opt.label === skillLabel);
            return skill ? skill.value : skillLabel;
          }),
        }
      ]);

      if (error) {
        throw error;
      }

      console.log('Registered successfully in Supabase!');
      navigation.navigate('Thankyou');
      
    } catch (error) {
      console.error('Error Message:', error.message);
      Alert.alert('Registration Failed', error.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };
  const onChangeDate = (event, selectedDate) => {
    const currentDate = selectedDate || user.dateOfBirth;
    setShowDatePicker(Platform.OS === 'ios');
    handleInputChange('dateOfBirth', currentDate);
  };
  console.log("Dropdown Options:", skillsOptions);

  const toggleSelection = (field, item) => {
    const selectedValues = user[field];

    const updatedValues = selectedValues.includes(item.label)
      ? selectedValues.filter(val => val !== item.label)
      : [...selectedValues, item.label];

    handleInputChange(field, updatedValues);
  };

  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];

  const languageOptions = [
    { label: 'Hindi', value: 'hindi' },
    { label: 'English', value: 'english' },
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
            placeholder="First Name"
            placeholderTextColor="gray"
            style={styles.input}
            value={user.firstName}
            onChangeText={text => handleInputChange('firstName', text)}
          />
          <TextInput
            placeholder="Last Name"
            placeholderTextColor="gray"
            style={styles.input}
            value={user.lastName}
            onChangeText={text => handleInputChange('lastName', text)}
          />
          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={skillsOptions}
              labelField="label"
              valueField="value"
              placeholder={
                user.skills.length > 0
                  ? user.skills.join(', ')
                  : 'Select Skills'
              }
              placeholderStyle={
                user.skills.length > 0
                  ? styles.dropdownTextSelected
                  : styles.dropdownText
              }
              selectedTextStyle={styles.selectedItemText}
              value={user.skills} // Ensure this is an array of selected values
              onChange={item => toggleSelection('skills', item)}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={item => (
                <TouchableOpacity
                  onPress={() => toggleSelection('skills', item)}>
                  <View style={styles.item}>
                    <Text style={styles.itemText}>
                      {item.label} {user.skills.includes(item.value) ? '✔️' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
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

          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dropdownText}>
              {user.dateOfBirth
                ? user.dateOfBirth.toLocaleDateString()
                : 'Select Date of Birth'}
            </Text>
            <Ionicons name="calendar" color={COLORS.orange} size={25} />
          </TouchableOpacity>

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
            <Dropdown
              style={styles.dropdown}
              data={languageOptions}
              labelField="label"
              valueField="value"
              placeholder={
                user.languages.length > 0
                  ? user.languages.join(', ')
                  : 'Select Languages'
              }
              placeholderStyle={
                user.languages.length > 0
                  ? styles.dropdownTextSelected
                  : styles.dropdownText
              }
              selectedTextStyle={styles.selectedItemText}
              value={user.languages}
              onChange={item => toggleSelection('languages', item)}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={item => (
                <TouchableOpacity
                  onPress={() => toggleSelection('languages', item)}>
                  <View style={styles.item}>
                    <Text style={styles.itemText}>
                      {item.label}{' '}
                      {user.languages.includes(item.label) ? '✔️' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* Multiselect for Skills */}

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

        {showDatePicker && (
          <DateTimePicker
            value={user.dateOfBirth || new Date()}
            mode="date"
            display="default"
            onChange={onChangeDate}
          />
        )}
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
