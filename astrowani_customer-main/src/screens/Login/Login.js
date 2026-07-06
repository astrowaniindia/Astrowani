import React, {useState} from 'react';
import {
  StyleSheet,
  Image,
  Text,
  View,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {countries} from './Country';
import Instance from '../../api/ApiCall';
import { showAlert } from '../../Component/CustomAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Login = ({navigation}) => {
  const [countryCode, setCountryCode] = useState('IN');
  const [callingCode, setCallingCode] = useState('91');
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [toggle, setToggle] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, SetLoading] = useState(false);

  const togglePicker = () => {
    setPickerVisible(!isPickerVisible);
  };
  const selectCountry = country => {
    setCountryCode(country.code);
    setCallingCode(country.callingCode);
    setPickerVisible(false);
  };
  const validateFields = () => {
    if (toggle) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email) {
        showAlert('Validation Error', 'Email address cannot be empty.', 'error');
        return false;
      }
      if (!emailRegex.test(email)) {
        showAlert('Validation Error', 'Please enter a valid email address.', 'error');
        return false;
      }
    } else {
      if (!phoneNumber) {
        showAlert('Validation Error', 'Phone number cannot be empty.', 'error');
        return false;
      }
      if (phoneNumber.length < 10) {
        showAlert(
          'Validation Error',
          'Phone number must be at least 10 digits long.',
          'error'
        );
        return false;
      }
    }
    return true;
  };

  // TEMPORARY: OTP bypassed — navigate directly to dashboard
  const handleGetOtp = async () => {
    if (validateFields()) {
      SetLoading(true);
      try {
        await AsyncStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCIsInVzZXJJZCI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCIsInBob25lIjoiOTk5OTk5OTk5OSIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTc4MjQyMTczNCwiZXhwIjoxNzg1MDEzNzM0fQ.mBG3EXZi-gVDmjqH5xhwS27VjKiL2YNek133mP03O0Q');
        navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' }] });
      } catch (error) {
        console.log('Login error:', error);
        showAlert('Error', 'Something went wrong. Please try again.', 'error');
      } finally {
        SetLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.main}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo2.jpeg')}
            style={styles.logo}
          />
          <Text style={styles.title}>Astrowani</Text>
          <Text style={styles.subTitle}>Best Astrologer's Team</Text>
        </View>

        <View style={styles.loginContainer}>
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>Discover Your Cosmic Path</Text>
          </View>

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                !toggle && styles.activeToggleOption,
              ]}
              onPress={() => setToggle(false)}>
              <Text
                style={[styles.toggleText, !toggle && styles.activeToggleText]}>
                Mobile
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, toggle && styles.activeToggleOption]}
              onPress={() => setToggle(true)}>
              <Text
                style={[styles.toggleText, toggle && styles.activeToggleText]}>
                Email
              </Text>
            </TouchableOpacity>
          </View>

          {toggle ? (
            <View style={styles.inputContainer}>
              <Icon
                name="email"
                size={24}
                color={COLORS.AstroMaroon}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter Email Address"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <TouchableOpacity
                style={styles.countryPicker}
                onPress={togglePicker}>
                <Text style={styles.flag}>
                  {countries.find(c => c.code === countryCode).flag}
                </Text>
                <Text style={styles.callingCode}>+{callingCode}</Text>
                <Icon
                  name="keyboard-arrow-down"
                  size={24}
                  color={COLORS.AstroMaroon}
                />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                maxLength={10}
                placeholder="Phone number"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.otpBtn, loading && styles.disabledBtn]}
            disabled={loading}
            onPress={handleGetOtp}>
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.btnTxt}>Continue</Text>
            )}
          </TouchableOpacity>

          <View style={styles.termsView}>
            <Text style={styles.termsText}>
              By signing up, you agree to our{' '}
            </Text>
            <TouchableOpacity style={styles.termsLink}>
              <Text style={styles.linktext}>Terms of use</Text>
            </TouchableOpacity>
            <Text style={styles.termsText}> & </Text>
            <TouchableOpacity style={styles.termsLink}>
              <Text style={styles.linktext}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerText}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={isPickerVisible}
          onRequestClose={togglePicker}
          transparent={true}
          animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <FlatList
                data={countries}
                keyExtractor={item => item.code}
                showsVerticalScrollIndicator={false}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={styles.countryItem}
                    onPress={() => selectCountry(item)}>
                    <Text style={styles.flag}>{item.flag}</Text>
                    <Text style={styles.countryName}>
                      {item.name} (+{item.callingCode})
                    </Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity
                style={styles.closeButton}
                onPress={togglePicker}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default Login;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: verticalScale(60),
    paddingBottom: verticalScale(20),
  },
  logo: {
    width: scale(100),
    height: verticalScale(100),
    borderRadius: moderateScale(50),
    marginBottom: verticalScale(15),
  },
  title: {
    textAlign: 'center',
    color: 'white',
    fontWeight: '800',
    fontSize: moderateScale(32),
    letterSpacing: scale(1),
    marginBottom: verticalScale(5),
  },
  subTitle: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    fontSize: moderateScale(14),
  },
  loginContainer: {
    backgroundColor: 'white',
    flex: 1,
    width: '100%',
    borderTopLeftRadius: moderateScale(30),
    borderTopRightRadius: moderateScale(30),
    paddingTop: verticalScale(30),
    paddingHorizontal: scale(20),
  },
  taglineContainer: {
    alignSelf: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(25),
    marginTop: verticalScale(-45),
    marginBottom: verticalScale(20),
  },
  tagline: {
    color: 'white',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    borderRadius: moderateScale(25),
    marginBottom: verticalScale(25),
    padding: moderateScale(3),
  },
  toggleOption: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(22),
    alignItems: 'center',
  },
  activeToggleOption: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleText: {
    fontSize: moderateScale(14),
    fontWeight: '500',
    color: COLORS.darkGray,
  },
  activeToggleText: {
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: moderateScale(1),
    height: verticalScale(55),
    borderColor: COLORS.lightBorder,
    borderRadius: moderateScale(28),
    marginBottom: verticalScale(20),
    paddingHorizontal: scale(15),
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  inputIcon: {
    marginRight: scale(10),
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: scale(10),
    paddingRight: scale(10),
    borderRightWidth: 1,
    borderRightColor: COLORS.lightBorder,
  },
  callingCode: {
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
    fontWeight: '600',
    marginHorizontal: scale(5),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    color: COLORS.textDark,
  },
  phoneInput: {
    marginLeft: scale(10),
  },
  otpBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(55),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(28),
    marginBottom: verticalScale(15),
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  disabledBtn: {
    backgroundColor: COLORS.gray,
  },
  btnTxt: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: moderateScale(16),
  },
  termsView: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: verticalScale(25),
  },
  termsText: {
    fontSize: moderateScale(12),
    color: COLORS.textLight,
  },
  termsLink: {
    padding: scale(1),
  },
  linktext: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: '600',
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: verticalScale(30),
  },
  footerText: {
    fontSize: moderateScale(14),
    color: COLORS.textLight,
  },
  registerText: {
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
  flag: {
    fontSize: moderateScale(20),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: scale(20),
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: verticalScale(15),
    textAlign: 'center',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  countryName: {
    fontSize: moderateScale(16),
    marginLeft: scale(10),
    color: COLORS.textDark,
  },
  closeButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(15),
    borderRadius: moderateScale(10),
    marginTop: verticalScale(15),
  },
  closeText: {
    textAlign: 'center',
    color: 'white',
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
});
