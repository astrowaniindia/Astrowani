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
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '@react-native-community/datetimepicker';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchImageLibrary, launchCamera} from 'react-native-image-picker';
import { supabase } from '../../api/SupabaseClient';

const StatesOfIndia = [
  {label: 'Andhra Pradesh', value: 'Andhra Pradesh'}, {label: 'Arunachal Pradesh', value: 'Arunachal Pradesh'},
  {label: 'Assam', value: 'Assam'}, {label: 'Bihar', value: 'Bihar'}, {label: 'Chhattisgarh', value: 'Chhattisgarh'},
  {label: 'Delhi', value: 'Delhi'}, {label: 'Goa', value: 'Goa'}, {label: 'Gujarat', value: 'Gujarat'},
  {label: 'Haryana', value: 'Haryana'}, {label: 'Himachal Pradesh', value: 'Himachal Pradesh'},
  {label: 'Jharkhand', value: 'Jharkhand'}, {label: 'Karnataka', value: 'Karnataka'}, {label: 'Kerala', value: 'Kerala'},
  {label: 'Madhya Pradesh', value: 'Madhya Pradesh'}, {label: 'Maharashtra', value: 'Maharashtra'},
  {label: 'Manipur', value: 'Manipur'}, {label: 'Meghalaya', value: 'Meghalaya'}, {label: 'Mizoram', value: 'Mizoram'},
  {label: 'Nagaland', value: 'Nagaland'}, {label: 'Odisha', value: 'Odisha'}, {label: 'Punjab', value: 'Punjab'},
  {label: 'Rajasthan', value: 'Rajasthan'}, {label: 'Sikkim', value: 'Sikkim'}, {label: 'Tamil Nadu', value: 'Tamil Nadu'},
  {label: 'Telangana', value: 'Telangana'}, {label: 'Tripura', value: 'Tripura'}, {label: 'Uttar Pradesh', value: 'Uttar Pradesh'},
  {label: 'Uttarakhand', value: 'Uttarakhand'}, {label: 'West Bengal', value: 'West Bengal'},
];

const genderOptions = [
  {label: 'Male', value: 'male'},
  {label: 'Female', value: 'female'},
  {label: 'Other', value: 'other'},
];

const MarriedOptions = [
  {label: 'Married', value: 'married'},
  {label: 'Unmarried', value: 'unmarried'},
];

const UserProfileScreen = ({navigation, route}) => {
  const user = route.params?.user || {};
  const [activeTab, setActiveTab] = useState('Profile');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [genderError, setGenderError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [userProfile, setUserProfile] = useState({
    profilePic: user.profilePic || '',
    handPic: user.handPic || '',
    email: user.email || '',
    firstName: user.firstName || user.name || '',
    gender: user.gender || '',
    state: user.state || '',
    maritalStatus: user.maritalStatus || '',
    dateOfBirth: '',
    timeOfBirth: '',
    phoneNumber: user.phoneNumber || user.phone || '',
    city: user.city || user.placeOfBirth || '',
  });

  // Parse a "HH:MM[:SS]" string into a Date (today) for the time picker.
  const parseTime = (t) => {
    if (!t) return '';
    const [h, m] = String(t).split(':');
    const d = new Date();
    d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    return d;
  };

  // Load the full profile from the backend (single source of truth).
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) return;
        const res = await Instance.get('/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = res?.data?.data;
        if (d) {
          setUserProfile(prev => ({
            ...prev,
            firstName: d.name || prev.firstName,
            email: d.email || prev.email,
            gender: d.gender || prev.gender,
            maritalStatus: d.maritalStatus || prev.maritalStatus,
            state: d.state || prev.state,
            city: d.placeOfBirth || prev.city,
            phoneNumber: d.phone || prev.phoneNumber,
            profilePic: d.profilePic || prev.profilePic,
            handPic: d.handPic || prev.handPic,
            dateOfBirth: d.dob ? new Date(d.dob) : prev.dateOfBirth,
            timeOfBirth: d.timeOfBirth ? parseTime(d.timeOfBirth) : prev.timeOfBirth,
          }));
        }
      } catch (err) {
        console.log('Profile fetch error:', err?.message);
      }
    };
    fetchProfile();
  }, []);

  const handleEditPic = (type = 'profilePic') => {
    const options = { title: 'Select Image', mediaType: 'photo', includeBase64: true, quality: 0.6, maxWidth: 1000, maxHeight: 1000 };
    launchImageLibrary(options, response => {
      if (!response.didCancel && !response.error && response.assets?.length > 0) {
        const asset = response.assets[0];
        // Store as a base64 data-URI so it persists in the DB and renders cross-device.
        const value = asset.base64 ? `data:${asset.type || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
        handleInputChange(type, value);
      }
    });
  };

  const removePic = (type = 'profilePic') => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => handleInputChange(type, '') },
    ]);
  };

  const handleUpdate = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!userProfile.email) {
      setEmailError('Email cannot be empty'); return;
    } else if (!emailRegex.test(userProfile.email)) {
      setEmailError('Please enter a valid email address'); return;
    } else {
      setEmailError(null);
    }
    
    if (!userProfile.gender) {
      setGenderError('Please select a gender'); return;
    } else {
      setGenderError(null);
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');

      const tob = userProfile.timeOfBirth
        ? new Date(userProfile.timeOfBirth).toTimeString().slice(0, 5) // "HH:MM"
        : null;
      const payload = {
        name: userProfile.firstName,
        email: userProfile.email,
        gender: userProfile.gender,
        maritalStatus: userProfile.maritalStatus || null,
        dob: userProfile.dateOfBirth ? new Date(userProfile.dateOfBirth).toISOString() : null,
        timeOfBirth: tob,
        city: userProfile.city || null,
        state: userProfile.state || null,
        profilePic: userProfile.profilePic || null,
        handPic: userProfile.handPic || null,
      };

      const response = await Instance.put('/api/users/profile', payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      const updated = response?.data?.data;
      if (updated) {
        // Refresh the cached user so the profile gate unlocks immediately everywhere.
        await AsyncStorage.setItem('userData', JSON.stringify(updated));
        Alert.alert('Success', 'Profile updated successfully!');
        navigation.goBack();
      } else {
        throw new Error('Update failed');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value, nestedField = null) => {
    if (nestedField) {
      setUserProfile(prev => ({ ...prev, address: { ...prev.address, [nestedField]: value } }));
    } else {
      setUserProfile(prev => ({ ...prev, [field]: value }));
    }
  };

  const renderField = (icon, placeholder, value, onChange, type = 'text', extraProps = {}) => (
    <View style={styles.inputWrapper}>
      <View style={styles.inputIcon}>
        <Ionicons name={icon} size={moderateScale(20)} color={COLORS.AstroMaroon} />
      </View>
      <View style={styles.inputContent}>
        <Text style={styles.inputLabel}>{placeholder}</Text>
        {type === 'text' && (
          <TextInput
            style={styles.textInput}
            value={value}
            onChangeText={onChange}
            placeholder={`Enter ${placeholder}`}
            placeholderTextColor="#999"
            {...extraProps}
          />
        )}
        {type === 'dropdown' && (
          <Dropdown
            style={styles.dropdownInput}
            data={extraProps.data}
            labelField="label"
            valueField="value"
            placeholder={`Select ${placeholder}`}
            placeholderStyle={{ color: '#999', fontSize: moderateScale(14) }}
            selectedTextStyle={{ color: '#000', fontSize: moderateScale(14) }}
            value={value}
            onChange={item => onChange(item.value)}
          />
        )}
        {type === 'date' && (
          <TouchableOpacity onPress={extraProps.onPress} style={styles.datePickerBtn}>
            <Text style={{ color: value ? '#000' : '#999', fontSize: moderateScale(14) }}>
              {value || `Select ${placeholder}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.editIconBadge}>
        <MaterialIcons name="edit" size={moderateScale(16)} color="#888" />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'Profile' && styles.activeTab]} onPress={() => setActiveTab('Profile')}>
          <Text style={activeTab === 'Profile' ? styles.tabTextActive : styles.tabTextInactive}>Personal Info</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'Hand Photo' && styles.activeTab]} onPress={() => setActiveTab('Hand Photo')}>
          <Text style={activeTab === 'Hand Photo' ? styles.tabTextActive : styles.tabTextInactive}>Palm/Hand Photo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        
        {activeTab === 'Profile' && (
          <View>
            {/* Avatar Section */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                <Image
                  source={{ uri: userProfile.profilePic || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png' }}
                  style={styles.avatarImage}
                />
                <TouchableOpacity style={styles.cameraBadge} onPress={() => handleEditPic('profilePic')}>
                  <Ionicons name="camera" size={moderateScale(16)} color="#fff" />
                </TouchableOpacity>
              </View>
              {userProfile.profilePic ? (
                <TouchableOpacity style={styles.removePicBtn} onPress={() => removePic('profilePic')}>
                  <Ionicons name="trash-outline" size={moderateScale(14)} color="red" />
                  <Text style={styles.removePicTxt}>Remove Photo</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Form Fields */}
            <View style={styles.formCard}>
              <Text style={styles.formSectionTitle}>Basic Details</Text>
              {renderField('person-outline', 'Full Name', userProfile.firstName, t => handleInputChange('firstName', t))}
              {renderField('call-outline', 'Mobile Number', userProfile.phoneNumber, t => handleInputChange('phoneNumber', t), 'text', { keyboardType: 'phone-pad', maxLength: 10 })}
              
              {renderField('mail-outline', 'Email Address', userProfile.email, t => handleInputChange('email', t), 'text', { keyboardType: 'email-address' })}
              {emailError && <Text style={styles.errorText}>{emailError}</Text>}

              {renderField('male-female-outline', 'Gender', userProfile.gender, v => handleInputChange('gender', v), 'dropdown', { data: genderOptions })}
              {genderError && <Text style={styles.errorText}>{genderError}</Text>}
              
              {renderField('heart-outline', 'Marital Status', userProfile.maritalStatus, v => handleInputChange('maritalStatus', v), 'dropdown', { data: MarriedOptions })}

              <View style={styles.divider} />
              <Text style={styles.formSectionTitle}>Birth Details</Text>
              {renderField('calendar-outline', 'Date of Birth', userProfile.dateOfBirth ? userProfile.dateOfBirth.toLocaleDateString() : '', null, 'date', { onPress: () => setShowDatePicker(true) })}
              {renderField('time-outline', 'Time of Birth', userProfile.timeOfBirth ? userProfile.timeOfBirth.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '', null, 'date', { onPress: () => setShowTimePicker(true) })}
              
              <View style={styles.divider} />
              <Text style={styles.formSectionTitle}>Location</Text>
              {renderField('business-outline', 'City (Place of Birth)', userProfile.city, t => handleInputChange('city', t))}
              {renderField('map-outline', 'State', userProfile.state, v => handleInputChange('state', v), 'dropdown', { data: StatesOfIndia })}
            </View>
          </View>
        )}

        {activeTab === 'Hand Photo' && (
          <View style={styles.formCard}>
            <Text style={styles.formSectionTitle}>Upload Palm Photo</Text>
            <Text style={styles.infoText}>Uploading a clear photo of your palm helps our astrologers provide more accurate palmistry readings.</Text>
            
            <View style={[styles.avatarWrapper, { width: scale(200), height: verticalScale(250), borderRadius: moderateScale(15), alignSelf: 'center', marginTop: verticalScale(20) }]}>
              {userProfile.handPic ? (
                <Image source={{ uri: userProfile.handPic }} style={{ width: '100%', height: '100%', borderRadius: moderateScale(15) }} resizeMode="cover" />
              ) : (
                <View style={styles.placeholderHand}>
                  <Ionicons name="hand-right-outline" size={moderateScale(60)} color="#ccc" />
                  <Text style={styles.placeholderTxt}>No photo uploaded</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.cameraBadge, { bottom: 10, right: 10 }]} onPress={() => handleEditPic('handPic')}>
                <Ionicons name="camera" size={moderateScale(20)} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {userProfile.handPic ? (
              <TouchableOpacity style={[styles.removePicBtn, { alignSelf: 'center', marginTop: verticalScale(15) }]} onPress={() => removePic('handPic')}>
                <Ionicons name="trash-outline" size={moderateScale(14)} color="red" />
                <Text style={styles.removePicTxt}>Remove Photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Save Button */}
      <View style={styles.bottomFooter}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.saveBtnTxt}>Save Changes</Text>}
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={userProfile.dateOfBirth || new Date()} mode="date" display="default"
          onChange={(e, date) => { setShowDatePicker(Platform.OS === 'ios'); if(date) handleInputChange('dateOfBirth', date); }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={userProfile.timeOfBirth || new Date()} mode="time" display="default"
          onChange={(e, time) => { setShowTimePicker(Platform.OS === 'ios'); if(time) handleInputChange('timeOfBirth', time); }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  tabsContainer: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: verticalScale(15) },
  activeTab: { borderBottomWidth: 3, borderBottomColor: COLORS.AstroMaroon },
  tabTextActive: { color: COLORS.AstroMaroon, fontSize: moderateScale(15), fontFamily: 'Lato-Bold' },
  tabTextInactive: { color: '#888', fontFamily: 'Lato-Bold', fontSize: moderateScale(15) },
  scrollContainer: { paddingBottom: verticalScale(100) },
  
  avatarSection: { alignItems: 'center', marginTop: verticalScale(30), marginBottom: verticalScale(20) },
  avatarWrapper: {
    width: scale(110), height: scale(110), borderRadius: moderateScale(55),
    backgroundColor: '#fff', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6,
    borderWidth: 3, borderColor: '#fff'
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: moderateScale(55) },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: COLORS.AstroMaroon, width: scale(32), height: scale(32), borderRadius: moderateScale(16),
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff'
  },
  removePicBtn: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(10), backgroundColor: 'rgba(255,0,0,0.1)', paddingHorizontal: scale(12), paddingVertical: verticalScale(6), borderRadius: moderateScale(20) },
  removePicTxt: { color: 'red', fontSize: moderateScale(12), fontFamily: 'Lato-Bold', marginLeft: scale(4) },

  formCard: {
    backgroundColor: '#fff', marginHorizontal: scale(15), borderRadius: moderateScale(20), padding: scale(20),
    marginBottom: verticalScale(20), elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5
  },
  formSectionTitle: { fontSize: moderateScale(16), fontFamily: 'Lato-Bold', color: '#000', marginBottom: verticalScale(15) },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: verticalScale(20) },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA',
    borderWidth: 1, borderColor: '#E5E5E5', borderRadius: moderateScale(12),
    paddingHorizontal: scale(12), paddingVertical: verticalScale(8), marginBottom: verticalScale(15)
  },
  inputIcon: { width: scale(30), justifyContent: 'center', alignItems: 'center' },
  inputContent: { flex: 1, marginLeft: scale(5) },
  inputLabel: { fontSize: moderateScale(11), color: '#888', fontFamily: 'Lato-Bold', textTransform: 'uppercase', marginBottom: verticalScale(2) },
  textInput: { padding: 0, margin: 0, color: '#000', fontSize: moderateScale(14), fontFamily: 'Lato-Regular' },
  dropdownInput: { height: verticalScale(24), padding: 0, margin: 0 },
  datePickerBtn: { justifyContent: 'center', height: verticalScale(24) },
  editIconBadge: { width: scale(24), alignItems: 'flex-end' },

  errorText: { color: 'red', fontSize: moderateScale(11), marginTop: -verticalScale(10), marginBottom: verticalScale(10), marginLeft: scale(45) },

  bottomFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff',
    paddingHorizontal: scale(20), paddingVertical: verticalScale(15),
    borderTopWidth: 1, borderTopColor: '#eee', elevation: 20
  },
  saveBtn: { backgroundColor: COLORS.AstroGold, borderRadius: moderateScale(25), paddingVertical: verticalScale(12), alignItems: 'center' },
  saveBtnTxt: { color: COLORS.AstroMaroon, fontSize: moderateScale(16), fontFamily: 'Lato-Bold' },

  infoText: { color: '#666', fontSize: moderateScale(13), lineHeight: 20, textAlign: 'center', fontFamily: 'Lato-Regular' },
  placeholderHand: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: moderateScale(15) },
  placeholderTxt: { color: '#888', marginTop: verticalScale(10), fontFamily: 'Lato-Regular' }
});

export default UserProfileScreen;
