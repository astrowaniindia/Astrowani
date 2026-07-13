import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Alert,
  PermissionsAndroid,
  SafeAreaView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { Dropdown } from 'react-native-element-dropdown';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { showAlert } from '../../Component/CustomAlert';
import { COLORS } from '../../Theme/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';

export default function Register({ navigation }) {
  const { t } = React.useContext(LanguageContext);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState(new Date());
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [timeOfBirth, setTimeOfBirth] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [place, setPlace] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [image, setImage] = useState(null); // data-URI, for the preview
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Request camera permission on Android
    if (Platform.OS === 'android') {
      requestCameraPermission();
    }
  }, []);

  const requestCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: t('register.cameraPermTitle'),
          message: t('register.cameraPermMsg'),
          buttonNeutral: t('register.askLater'),
          buttonNegative: t('common.cancel'),
          buttonPositive: t('common.ok'),
        }
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Camera permission granted');
      } else {
        console.log('Camera permission denied');
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const onChangeDOB = (event, selectedDate) => {
    setShowDobPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDob(selectedDate);
    }
  };

  const onChangeTime = (event, selectedTime) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setTimeOfBirth(selectedTime);
    }
  };

  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  const selectImage = () => {
    setShowImagePickerModal(true);
  };

  const handleImageLibraryLaunch = () => {
    setShowImagePickerModal(false);
    let options = {
      mediaType: 'photo',
      quality: 1,
      includeBase64: true,
    };

    launchImageLibrary(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.errorCode) {
        console.log('ImagePicker Error: ', response.errorMessage);
      } else if (response.assets && response.assets.length > 0) {
        const source = response.assets[0];
        setImage(`data:${source.type || 'image/jpeg'};base64,${source.base64}`);
      }
    });
  };

  const handleCameraLaunch = () => {
    setShowImagePickerModal(false);
    let options = {
      mediaType: 'photo',
      quality: 1,
      includeBase64: true,
      saveToPhotos: true,
      cameraType: 'back',
    };

    launchCamera(options, (response) => {
      if (response.didCancel) {
        console.log('User cancelled camera');
      } else if (response.errorCode) {
        console.log('Camera Error: ', response.errorMessage);
      } else if (response.assets && response.assets.length > 0) {
        const source = response.assets[0];
        setImage(`data:${source.type || 'image/jpeg'};base64,${source.base64}`);
      }
    });
  };

  const handleSubmit = async () => {
    if (!name || !mobile) {
      showAlert(t('common.error'), t('register.fillNameMobile'), 'error');
      return;
    }
    if (mobile.length < 10) {
      showAlert(t('common.error'), t('register.validMobile'), 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber: mobile,
        role: 'customer',
        intent: 'signup',
      });
      if (res?.data?.success) {
        navigation.navigate('VerifyOtp', {
          phoneNumber: mobile,
          role: 'customer',
          // Applied to the new account via PUT /api/users/profile right after OTP verify.
          profileData: {
            name,
            gender,
            dob: dob.toISOString().split('T')[0],
            time_of_birth: timeOfBirth.toTimeString().split(' ')[0],
            place_of_birth: place,
            email,
            profilePic: image || null,
          },
        });
      } else {
        showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
      }
    } catch (error) {
      if (error?.response?.data?.code === 'ACCOUNT_EXISTS') {
        showAlert(
          t('register.accountExists'),
          t('register.accountExistsMsg'),
          'error',
          () => navigation.navigate('Login')
        );
      } else {
        console.error(error);
        showAlert(t('common.error'), t('login.somethingWrong'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('register.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Image Upload Section */}
        <TouchableOpacity style={styles.imageContainer} onPress={selectImage}>
          {image ? (
            <Image source={{ uri: image }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>{t('register.tapToAddPhoto')}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder={t('register.fullName')}
          value={name}
          onChangeText={setName}
        />


        <View style={styles.pickerContainer}>
          <Dropdown
            style={styles.dropdown}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            data={[
              { label: t('register.male'), value: 'Male' },
              { label: t('register.female'), value: 'Female' },
              { label: t('register.other'), value: 'Other' },
            ]}
            maxHeight={300}
            labelField="label"
            valueField="value"
            placeholder={t('register.selectGender')}
            value={gender}
            onChange={item => {
              setGender(item.value);
            }}
            containerStyle={styles.dropdownContainer}
            itemTextStyle={styles.dropdownItemText}
            activeColor={COLORS.lightGray || '#f0f0f0'}
          />
        </View>

        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDobPicker(true)}
        >
          <Text style={styles.dateButtonText}>
            {dob.toDateString()}
          </Text>
        </TouchableOpacity>

        {showDobPicker && (
          <DateTimePicker
            value={dob}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChangeDOB}
            maximumDate={new Date()}
          />
        )}

        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={styles.dateButtonText}>
            {timeOfBirth.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </TouchableOpacity>

        {showTimePicker && (
          <DateTimePicker
            value={timeOfBirth}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChangeTime}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder={t('register.placeOfBirth')}
          value={place}
          onChangeText={setPlace}
        />

        <TextInput
          style={styles.input}
          placeholder={t('register.mobileNumber')}
          value={mobile}
          keyboardType="phone-pad"
          onChangeText={setMobile}
          maxLength={15}
        />

        <TextInput
          style={styles.input}
          placeholder={t('register.emailAddress')}
          value={email}
          keyboardType="email-address"
          autoCapitalize="none"
          onChangeText={setEmail}
        />

            <TouchableOpacity
              style={[styles.submitButton, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}>
              <Text style={styles.submitButtonText}>{submitting ? t('register.sendingOtp') : t('register.submit')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    padding: 20,
    paddingBottom: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 15 : 15,
    paddingBottom: 15,
    backgroundColor: '#f5f5f5',
  },
  backButton: {
    padding: 5,
    marginRight: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 15,
    overflow: 'hidden',
    elevation: 3,
  },
  picker: {
    height: 50,
    width: '100%',
  },
  dateButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    justifyContent: 'center',
    elevation: 3,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  submitButton: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
    elevation: 3,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: COLORS.AstroMaroon,
  },
  imagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.AstroMaroon,
  },
  imagePlaceholderText: {
    color: '#666',
    textAlign: 'center',
  },
  dropdown: {
    height: 50,
    paddingHorizontal: 15,
  },
  placeholderStyle: {
    fontSize: 16,
    color: '#999',
  },
  selectedTextStyle: {
    fontSize: 16,
    color: '#333',
  },
  dropdownContainer: {
    borderRadius: 10,
    backgroundColor: '#fff',
    borderColor: COLORS.AstroMaroon,
    borderWidth: 1,
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
  },
});