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
  Modal,
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
import { LanguageContext } from '../../context/LanguageContext';

// Indian state names are proper nouns — intentionally not translated (kept English/Roman
// script, which is how they're commonly written even in Hindi-language Indian UIs).
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

const UserProfileScreen = ({navigation, route}) => {
  const { t } = React.useContext(LanguageContext);
  const genderOptions = [
    {label: t('register.male'), value: 'male'},
    {label: t('register.female'), value: 'female'},
    {label: t('register.other'), value: 'other'},
  ];
  const MarriedOptions = [
    {label: t('userProfile.married'), value: 'married'},
    {label: t('userProfile.unmarried'), value: 'unmarried'},
  ];
  const user = route.params?.user || {};
  const [activeTab, setActiveTab] = useState('Profile');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [genderError, setGenderError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editableFields, setEditableFields] = useState({
    firstName: false,
    phoneNumber: false,
    email: false,
    gender: false,
    maritalStatus: false,
    dateOfBirth: false,
    timeOfBirth: false,
    city: false,
    state: false,
  });

  const [customAlert, setCustomAlert] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    isError: false,
  });

  const showCustomAlert = (title, message, buttons = [], isError = null) => {
    const finalButtons = buttons.length > 0 ? buttons : [{ text: t('common.ok'), onPress: () => {} }];
    // isError drives the modal icon — computed explicitly rather than sniffing the
    // (now-translatable) title string, since "includes('error')" breaks once titles are Hindi.
    const resolvedIsError = isError !== null ? isError : ![t('userProfile.removePhoto'), t('userProfile.success')].includes(title);
    setCustomAlert({
      visible: true,
      title,
      message,
      buttons: finalButtons,
      isError: resolvedIsError,
    });
  };

  const toggleEditable = (fieldKey) => {
    setEditableFields(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };
  
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
    const options = { title: t('userProfile.selectImage'), mediaType: 'photo', includeBase64: true, quality: 0.6, maxWidth: 1000, maxHeight: 1000 };
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
    showCustomAlert(t('userProfile.removePhoto'), t('userProfile.removePhotoConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('userProfile.remove'), style: 'destructive', onPress: () => handleInputChange(type, '') },
    ]);
  };

  const handleUpdate = async () => {
    // 1. Profile Picture validation
    if (!userProfile.profilePic) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.uploadProfilePhoto'));
      return;
    }

    // 2. Name validation
    if (!userProfile.firstName || !userProfile.firstName.trim()) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.enterFullName'));
      return;
    }

    // 3. Mobile Number validation
    if (!userProfile.phoneNumber || !userProfile.phoneNumber.trim()) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.enterMobile'));
      return;
    }

    // 4. Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!userProfile.email || !userProfile.email.trim()) {
      setEmailError(t('userProfile.emailEmpty'));
      showCustomAlert(t('userProfile.validationError'), t('userProfile.emailEmpty'));
      return;
    } else if (!emailRegex.test(userProfile.email)) {
      setEmailError(t('userProfile.emailInvalid'));
      showCustomAlert(t('userProfile.validationError'), t('userProfile.emailInvalid'));
      return;
    } else {
      setEmailError(null);
    }

    // 5. Gender validation
    if (!userProfile.gender) {
      setGenderError(t('userProfile.selectGender'));
      showCustomAlert(t('userProfile.validationError'), t('userProfile.selectGender'));
      return;
    } else {
      setGenderError(null);
    }

    // 6. Marital Status validation
    if (!userProfile.maritalStatus) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.selectMaritalStatus'));
      return;
    }

    // 7. Date of Birth validation
    if (!userProfile.dateOfBirth) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.selectDob'));
      return;
    }

    // 8. Time of Birth validation
    if (!userProfile.timeOfBirth) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.selectTob'));
      return;
    }

    // 9. City validation
    if (!userProfile.city || !userProfile.city.trim()) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.enterCity'));
      return;
    }

    // 10. State validation
    if (!userProfile.state) {
      showCustomAlert(t('userProfile.validationError'), t('userProfile.selectState'));
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');

      const tob = userProfile.timeOfBirth
        ? new Date(userProfile.timeOfBirth).toTimeString().slice(0, 5) // "HH:MM"
        : null;

      // Only newly-picked images are base64 (data-URI) — upload those to Storage
      // and use the resulting URL instead, so we never write base64 into the DB.
      const uploadIfNeeded = async (value) => {
        if (!value || !value.startsWith('data:')) return value || null;
        const uploadRes = await Instance.post(
          '/api/upload-image',
          { base64: value, folder: 'customer-profiles' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return uploadRes.data.url;
      };
      const [profilePicUrl, handPicUrl] = await Promise.all([
        uploadIfNeeded(userProfile.profilePic),
        uploadIfNeeded(userProfile.handPic),
      ]);

      const payload = {
        name: userProfile.firstName,
        email: userProfile.email,
        gender: userProfile.gender,
        maritalStatus: userProfile.maritalStatus || null,
        dob: userProfile.dateOfBirth ? new Date(userProfile.dateOfBirth).toISOString() : null,
        timeOfBirth: tob,
        city: userProfile.city || null,
        state: userProfile.state || null,
        profilePic: profilePicUrl,
        handPic: handPicUrl,
      };

      const response = await Instance.put('/api/users/profile', payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      const updated = response?.data?.data;
      if (updated) {
        // Refresh the cached user so the profile gate unlocks immediately everywhere.
        await AsyncStorage.setItem('userData', JSON.stringify(updated));
        showCustomAlert(t('userProfile.success'), t('userProfile.updatedSuccessfully'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() }
        ]);
      } else {
        throw new Error('Update failed');
      }
    } catch (err) {
      showCustomAlert(t('common.error'), err.response?.data?.message || t('userProfile.updateError'));
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

  const renderField = (fieldKey, icon, placeholder, value, onChange, type = 'text', extraProps = {}) => {
    const isEditable = editableFields[fieldKey];
    return (
      <View style={[styles.inputWrapper, !isEditable && { opacity: 0.85 }]}>
        <View style={styles.inputIcon}>
          <Ionicons name={icon} size={moderateScale(20)} color={COLORS.AstroMaroon} />
        </View>
        <View style={styles.inputContent}>
          <Text style={styles.inputLabel}>{placeholder}</Text>
          {type === 'text' && (
            <TextInput
              style={[styles.textInput, !isEditable && { color: '#666' }]}
              value={value}
              onChangeText={onChange}
              placeholder={t('userProfile.enterField', { field: placeholder })}
              placeholderTextColor="#999"
              editable={isEditable}
              {...extraProps}
            />
          )}
          {type === 'dropdown' && (
            <Dropdown
              style={styles.dropdownInput}
              data={extraProps.data}
              labelField="label"
              valueField="value"
              placeholder={t('userProfile.selectField', { field: placeholder })}
              placeholderStyle={{ color: '#999', fontSize: moderateScale(14) }}
              selectedTextStyle={{ color: isEditable ? '#000' : '#666', fontSize: moderateScale(14) }}
              containerStyle={styles.dropdownContainer}
              itemTextStyle={styles.dropdownItemText}
              activeColor="#f0f0f0"
              disable={!isEditable}
              value={value}
              onChange={item => onChange(item.value)}
            />
          )}
          {type === 'date' && (
            <TouchableOpacity 
              onPress={() => { if (isEditable) extraProps.onPress(); }} 
              disabled={!isEditable} 
              style={styles.datePickerBtn}
            >
              <Text style={{ color: value ? (isEditable ? '#000' : '#666') : '#999', fontSize: moderateScale(14) }}>
                {value || t('userProfile.selectField', { field: placeholder })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.editIconBadge} onPress={() => toggleEditable(fieldKey)}>
          <MaterialIcons name="edit" size={moderateScale(16)} color={isEditable ? COLORS.AstroMaroon : '#888'} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'Profile' && styles.activeTab]} onPress={() => setActiveTab('Profile')}>
          <Text style={activeTab === 'Profile' ? styles.tabTextActive : styles.tabTextInactive}>{t('userProfile.personalInfo')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'Hand Photo' && styles.activeTab]} onPress={() => setActiveTab('Hand Photo')}>
          <Text style={activeTab === 'Hand Photo' ? styles.tabTextActive : styles.tabTextInactive}>{t('userProfile.palmHandPhoto')}</Text>
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
                  <Text style={styles.removePicTxt}>{t('userProfile.removePhoto')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Form Fields */}
            <View style={styles.formCard}>
              <Text style={styles.formSectionTitle}>{t('userProfile.basicDetails')}</Text>
              {renderField('firstName', 'person-outline', t('userProfile.fullName'), userProfile.firstName, v => handleInputChange('firstName', v))}
              {renderField('phoneNumber', 'call-outline', t('userProfile.mobileNumber'), userProfile.phoneNumber, v => handleInputChange('phoneNumber', v), 'text', { keyboardType: 'phone-pad', maxLength: 10 })}

              {renderField('email', 'mail-outline', t('userProfile.emailAddress'), userProfile.email, v => handleInputChange('email', v), 'text', { keyboardType: 'email-address' })}
              {emailError && <Text style={styles.errorText}>{emailError}</Text>}

              {renderField('gender', 'male-female-outline', t('userProfile.gender'), userProfile.gender, v => handleInputChange('gender', v), 'dropdown', { data: genderOptions })}
              {genderError && <Text style={styles.errorText}>{genderError}</Text>}

              {renderField('maritalStatus', 'heart-outline', t('userProfile.maritalStatus'), userProfile.maritalStatus, v => handleInputChange('maritalStatus', v), 'dropdown', { data: MarriedOptions })}

              <View style={styles.divider} />
              <Text style={styles.formSectionTitle}>{t('userProfile.birthDetails')}</Text>
              {renderField('dateOfBirth', 'calendar-outline', t('userProfile.dateOfBirth'), userProfile.dateOfBirth ? userProfile.dateOfBirth.toLocaleDateString() : '', null, 'date', { onPress: () => setShowDatePicker(true) })}
              {renderField('timeOfBirth', 'time-outline', t('userProfile.timeOfBirth'), userProfile.timeOfBirth ? userProfile.timeOfBirth.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '', null, 'date', { onPress: () => setShowTimePicker(true) })}

              <View style={styles.divider} />
              <Text style={styles.formSectionTitle}>{t('userProfile.location')}</Text>
              {renderField('city', 'business-outline', t('userProfile.cityPlaceOfBirth'), userProfile.city, v => handleInputChange('city', v))}
              {renderField('state', 'map-outline', t('userProfile.state'), userProfile.state, v => handleInputChange('state', v), 'dropdown', { data: StatesOfIndia })}
            </View>
          </View>
        )}

        {activeTab === 'Hand Photo' && (
          <View style={styles.formCard}>
            <Text style={styles.formSectionTitle}>{t('userProfile.uploadPalmPhoto')}</Text>
            <Text style={styles.infoText}>{t('userProfile.palmPhotoInfo')}</Text>

            <View style={[styles.avatarWrapper, { width: scale(200), height: verticalScale(250), borderRadius: moderateScale(15), alignSelf: 'center', marginTop: verticalScale(20) }]}>
              {userProfile.handPic ? (
                <Image source={{ uri: userProfile.handPic }} style={{ width: '100%', height: '100%', borderRadius: moderateScale(15) }} resizeMode="cover" />
              ) : (
                <View style={styles.placeholderHand}>
                  <Ionicons name="hand-right-outline" size={moderateScale(60)} color="#ccc" />
                  <Text style={styles.placeholderTxt}>{t('userProfile.noPhotoUploaded')}</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.cameraBadge, { bottom: 10, right: 10 }]} onPress={() => handleEditPic('handPic')}>
                <Ionicons name="camera" size={moderateScale(20)} color="#fff" />
              </TouchableOpacity>
            </View>

            {userProfile.handPic ? (
              <TouchableOpacity style={[styles.removePicBtn, { alignSelf: 'center', marginTop: verticalScale(15) }]} onPress={() => removePic('handPic')}>
                <Ionicons name="trash-outline" size={moderateScale(14)} color="red" />
                <Text style={styles.removePicTxt}>{t('userProfile.removePhoto')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Save Button */}
      <View style={styles.bottomFooter}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.saveBtnTxt}>{t('userProfile.saveChanges')}</Text>}
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

      {/* Custom Themed Popup Modal */}
      <Modal
        visible={customAlert.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCustomAlert(prev => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Ionicons
              name={customAlert.isError ? "warning-outline" : "information-circle-outline"}
              size={moderateScale(40)}
              color={customAlert.isError ? '#d9534f' : COLORS.AstroMaroon}
              style={{ marginBottom: verticalScale(12) }}
            />
            <Text style={styles.modalTitle}>{customAlert.title}</Text>
            <Text style={styles.modalMessage}>{customAlert.message}</Text>
            <View style={styles.modalButtonsContainer}>
              {customAlert.buttons.map((btn, index) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.modalButton,
                      isCancel && styles.modalCancelButton,
                      isDestructive && styles.modalDestructiveButton,
                      customAlert.buttons.length > 1 && { flex: 1, marginHorizontal: scale(5) }
                    ]}
                    onPress={() => {
                      setCustomAlert(prev => ({ ...prev, visible: false }));
                      if (btn.onPress) btn.onPress();
                    }}
                  >
                    <Text style={[
                      styles.modalButtonText,
                      isCancel && styles.modalCancelButtonText,
                      isDestructive && styles.modalDestructiveButtonText
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
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
  dropdownContainer: {
    borderRadius: 10,
    backgroundColor: '#fff',
    borderColor: COLORS.AstroMaroon,
    borderWidth: 1,
  },
  dropdownItemText: {
    fontSize: moderateScale(14),
    color: '#000',
  },

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
  placeholderTxt: { color: '#888', marginTop: verticalScale(10), fontFamily: 'Lato-Regular' },

  // Custom Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: scale(20),
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(10),
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: moderateScale(14),
    color: '#333',
    textAlign: 'center',
    marginBottom: verticalScale(20),
    lineHeight: verticalScale(20),
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  modalButton: {
    backgroundColor: COLORS.AstroGold,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(8),
    minWidth: scale(100),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    color: COLORS.AstroMaroon || '#000',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  modalCancelButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  modalCancelButtonText: {
    color: '#333',
  },
  modalDestructiveButton: {
    backgroundColor: '#d9534f',
  },
  modalDestructiveButtonText: {
    color: '#fff',
  },
});

export default UserProfileScreen;
