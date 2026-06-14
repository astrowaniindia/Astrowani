import React, {useState, useEffect} from 'react';
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
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '@react-native-community/datetimepicker';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchImageLibrary, launchCamera} from 'react-native-image-picker';
import { supabase } from '../../api/SupabaseClient';
const StatesOfIndia = [
  {label: 'Andhra Pradesh', value: 'Andhra Pradesh'},
  {label: 'Arunachal Pradesh', value: 'Arunachal Pradesh'},
  {label: 'Assam', value: 'Assam'},
  {label: 'Bihar', value: 'Bihar'},
  {label: 'Chhattisgarh', value: 'Chhattisgarh'},
  {label: 'Delhi', value: 'Delhi'},
  {label: 'Goa', value: 'Goa'},
  {label: 'Gujarat', value: 'Gujarat'},
  {label: 'Haryana', value: 'Haryana'},
  {label: 'Himachal Pradesh', value: 'Himachal Pradesh'},
  {label: 'Jharkhand', value: 'Jharkhand'},
  {label: 'Karnataka', value: 'Karnataka'},
  {label: 'Kerala', value: 'Kerala'},
  {label: 'Madhya Pradesh', value: 'Madhya Pradesh'},
  {label: 'Maharashtra', value: 'Maharashtra'},
  {label: 'Manipur', value: 'Manipur'},
  {label: 'Meghalaya', value: 'Meghalaya'},
  {label: 'Mizoram', value: 'Mizoram'},
  {label: 'Nagaland', value: 'Nagaland'},
  {label: 'Odisha', value: 'Odisha'},
  {label: 'Punjab', value: 'Punjab'},
  {label: 'Rajasthan', value: 'Rajasthan'},
  {label: 'Sikkim', value: 'Sikkim'},
  {label: 'Tamil Nadu', value: 'Tamil Nadu'},
  {label: 'Telangana', value: 'Telangana'},
  {label: 'Tripura', value: 'Tripura'},
  {label: 'Uttar Pradesh', value: 'Uttar Pradesh'},
  {label: 'Uttarakhand', value: 'Uttarakhand'},
  {label: 'West Bengal', value: 'West Bengal'},
];

const UserProfileScreen = ({navigation, route}) => {
  const user = route.params?.user || {};
  const [activeTab, setActiveTab] = useState('Update Profile');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [genderError, setGenderError] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState({
    profilePic: user.profilePic || '',
    email: user.email || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    gender: user.gender || '',
    state: user.state || '',
    maritalStatus: user.maritalStatus || '',
    dateOfBirth: '',
    timeOfBirth: '',
    phoneNumber: user.phoneNumber || '',
    address: {
      city: (user.address && user.address.city) || '',
      pinCode: (user.address && user.address.pinCode) || '',
      location: (user.address && user.address.location) || '',
      State: (user.address && user.address.State) || '',
    },
  });

  useEffect(() => {
    const fetchSupabaseProfile = async () => {
      if (user.phoneNumber || userProfile.phoneNumber) {
        try {
          const mobileNumber = user.phoneNumber || userProfile.phoneNumber;
          // Format mobile number to match Supabase if needed, usually it's plain
          const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('mobile', mobileNumber)
            .single();

          if (data && !error) {
            console.log('Found Supabase Profile:', data);
            setUserProfile(prev => ({
              ...prev,
              firstName: prev.firstName || data.name || '',
              gender: prev.gender || data.gender || '',
              email: prev.email || data.email || '',
              // Convert date string back to Date object if it exists
              dateOfBirth: data.dob ? new Date(data.dob) : prev.dateOfBirth,
              // Try to map state and city if they exist
              address: {
                ...prev.address,
                city: prev.address.city || data.place_of_birth || '',
              }
            }));
          }
        } catch (err) {
          console.log('Supabase fetch error:', err);
        }
      }
    };
    fetchSupabaseProfile();
  }, [user.phoneNumber]);

  const handleEditPress = () => {
    const options = {
      title: 'Select Image',
      mediaType: 'photo',
      includeBase64: false,
      quality: 1,
    };

    // Choose between Camera or Gallery
    const openImagePicker = () => {
      launchImageLibrary(options, response => {
        if (response.didCancel) {
          console.log('User cancelled image picker');
        } else if (response.error) {
          console.log('ImagePicker Error: ', response.error);
        } else {
          const source = {uri: response.assets[0].uri};
          console.log(source.uri);
          handleInputChange('profilePic', source.uri);
        }
      });
    };

    const openCamera = () => {
      launchCamera(options, response => {
        if (response.didCancel) {
          console.log('User cancelled camera');
        } else if (response.error) {
          console.log('Camera Error: ', response.error);
        } else {
          const source = {uri: response.assets[0].uri};
          handleInputChange('profilePic', source);
        }
      });
    };

    // For this example, opening just the image picker, you can replace it with an action sheet to choose camera/gallery.
    openImagePicker(); // or call openCamera() based on user choice
  };
  const handleUpdate = async () => {
    console.log(userProfile);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!userProfile.email) {
      setEmailError('Email cannot be empty');
      return;
    } else if (!emailRegex.test(userProfile.email)) {
      setEmailError('Please enter a valid email address');
      return;
    } else {
      setEmailError(null);
    }
    if (!userProfile.gender) {
      setGenderError('Please select a gender');
      return;
    } else {
      setGenderError(null);
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        throw new Error('Token not found');
      }

      const response = await Instance.put('/api/users/profile', userProfile, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.data) {
        Alert.alert('Updated successfully');
        navigation.goBack();
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.response?.data?.message || err.message);
      Alert.alert('Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value, nestedField = null) => {
    if (nestedField) {
      setUserProfile(prevState => ({
        ...prevState,
        address: {
          ...prevState.address,
          [nestedField]: value,
        },
      }));
    } else {
      setUserProfile(prevState => ({
        ...prevState,
        [field]: value,
      }));
    }
  };

  const genderOptions = [
    {label: 'Male', value: 'male'},
    {label: 'Female', value: 'female'},
    {label: 'Other', value: 'other'},
  ];
  const MarriedOptions = [
    {label: 'Married', value: 'married'},
    {label: 'Unmarried', value: 'unmarried'},
  ];

  const onChangeDate = (event, selectedDate) => {
    const currentDate = selectedDate || userProfile.dateOfBirth;
    setShowDatePicker(Platform.OS === 'ios');
    handleInputChange('dateOfBirth', currentDate);
  };

  const onChangeTime = (event, selectedTime) => {
    const currentTime = selectedTime || userProfile.timeOfBirth;
    setShowTimePicker(Platform.OS === 'ios');
    handleInputChange('timeOfBirth', currentTime);
  };

  const renderContent = () => {
    if (activeTab === 'Update Profile') {
      return (
        <View style={styles.profileView}>
          <TextInput
            placeholder="Full Name"
            placeholderTextColor="gray"
            style={styles.input}
            value={userProfile.firstName}
            onChangeText={text => handleInputChange('firstName', text)}
          />
          {/* <TextInput
            placeholder="Enter Last Name (Optional)"
            placeholderTextColor="gray"
            style={styles.input}
            value={userProfile.lastName}
            onChangeText={text => handleInputChange('lastName', text)}
          /> */}
          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={genderOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Gender"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={userProfile.gender}
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
              renderItem={item => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>{item.label}</Text>
                </View>
              )}
            />
          </View>
          {genderError && <Text style={styles.errorText}>{genderError}</Text>}
          <TextInput
            placeholder="+91 00000000"
            placeholderTextColor="gray"
            style={styles.input}
            maxLength={10}
            keyboardType="phone-pad"
            value={userProfile.phoneNumber}
            onChangeText={text => handleInputChange('phoneNumber', text)}
          />
          <TextInput
            placeholder="Email ID"
            placeholderTextColor="gray"
            style={styles.input}
            keyboardType="email-address"
            value={userProfile.email}
            onChangeText={text => handleInputChange('email', text)}
          />
          {emailError && <Text style={styles.errorText}>{emailError}</Text>}

          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={MarriedOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Martial Status"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={userProfile.maritalStatus}
              onChange={item => {
                handleInputChange('maritalStatus', item.value);
              }}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={item => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>{item.label}</Text>
                </View>
              )}
            />
          </View>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dropdownText}>
              {userProfile.dateOfBirth
                ? userProfile.dateOfBirth.toLocaleDateString()
                : 'Select Date of Birth'}
            </Text>
            <Ionicons name="calendar" color={COLORS.orange} size={25} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowTimePicker(true)}>
            <Text style={styles.dropdownText}>
              {userProfile.timeOfBirth
                ? userProfile.timeOfBirth.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Select Time of Birth'}
            </Text>
            <Ionicons name="alarm-outline" color={COLORS.orange} size={25} />
          </TouchableOpacity>

          <TextInput
            placeholder="Enter City"
            placeholderTextColor="gray"
            style={styles.input}
            value={userProfile.address.city}
            onChangeText={text => handleInputChange('address', text, 'city')}
          />
          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={StatesOfIndia}
              labelField="label"
              valueField="value"
              placeholder="Select State"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={userProfile.address.state} // Use your state field here
              onChange={item => {
                handleInputChange('state', item.value, 'state');
              }}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={item => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>{item.label}</Text>
                </View>
              )}
            />
          </View>
        </View>
      );
    } else if (activeTab === 'Change Picture') {
      return (
        <View style={styles.changePictureContainer}>
          <View style={styles.iconContainer}>
            <Image
              source={
                userProfile.profilePic
                  ? {uri: userProfile.profilePic}
                  : {
                      uri: 'https://cdn-icons-png.flaticon.com/128/149/149071.png',
                    }
              }
              style={styles.userIcon}
            />
            <TouchableOpacity
              onPress={handleEditPress}
              style={styles.editButton}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{user.firstName || 'user'}</Text>
        </View>
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'Update Profile' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('Update Profile')}>
          <Text
            style={
              activeTab === 'Update Profile'
                ? styles.tabTextActive
                : styles.tabTextInactive
            }>
            Update Profile
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'Change Picture' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('Change Picture')}>
          <Text
            style={
              activeTab === 'Change Picture'
                ? styles.tabTextActive
                : styles.tabTextInactive
            }>
            Hand Photo
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollContainer}>
        {/* Render Content Based on Active Tab */}
        {renderContent()}
      </ScrollView>

      {activeTab === 'Update Profile' ? (
        <TouchableOpacity onPress={handleUpdate} style={styles.updateButton}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.updateButtonText}>Update Profile</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handleUpdate} style={styles.updateButton}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.updateButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={userProfile.dateOfBirth || new Date()}
          mode="date"
          display="default"
          onChange={onChangeDate}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={userProfile.timeOfBirth || new Date()}
          mode="time"
          display="default"
          onChange={onChangeTime}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: scale(15),
    paddingTop: verticalScale(3),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  tabsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(5),
    borderBottomWidth: verticalScale(1),
    borderBottomColor: COLORS.AshGray,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    marginVertical: verticalScale(2),
    paddingVertical: verticalScale(8),
  },
  activeTab: {
    borderWidth: verticalScale(0.5),
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
    backgroundColor: 'white',
  },
  tabTextActive: {
    color: COLORS.orange,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
  },
  tabTextInactive: {
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(15),
  },
  scrollContainer: {
    flex: 1,
    marginTop: verticalScale(60),
  },
  profileView: {
    paddingHorizontal: scale(5),
  },
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
    fontFamily: 'Lato-Regular',
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
  updateButton: {
    height: verticalScale(45),
    marginVertical: verticalScale(5),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: moderateScale(8),
    backgroundColor: COLORS.AstroMaroon,
  },
  updateButtonText: {
    color: COLORS.white,
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
  },
  changePictureContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: scale(150),
    height: scale(150),
    borderRadius: moderateScale(75),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: moderateScale(1),
    borderColor: COLORS.white,
  },
  userIcon: {
    width: scale(150),
    height: scale(150),
    borderRadius: moderateScale(75),
  },
  editButton: {
    paddingVertical: verticalScale(6),
    position: 'absolute',
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(15),
    backgroundColor: COLORS.AstroMaroon,
    bottom: 0,
    right: scale(10),
    bottom: 0,
  },
  editButtonText: {
    fontSize: moderateScale(12),
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
  },
  userName: {
    fontSize: moderateScale(20),
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(5),
    color: COLORS.AstroMaroon,
  },
});

export default UserProfileScreen;
