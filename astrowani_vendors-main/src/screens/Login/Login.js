import React, {useEffect, useState} from 'react';
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
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {countries} from './Country';
import {requestUserPermission} from '../../utils/Firebase';
import messaging from '@react-native-firebase/messaging';
import {OtplessHeadlessModule} from 'otpless-react-native';
import showToast from '../../utils/showToast';
import { supabase } from '../../api/SupabaseClient';
import axios from 'axios';

const Login = ({navigation}) => {
  const headlessModule = new OtplessHeadlessModule();
  const [countryCode, setCountryCode] = useState('IN');
  const [callingCode, setCallingCode] = useState('91');
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [toggle, setToggle] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, SetLoading] = useState(false);
  const [fcmToken, setFcmToken] = useState('');

  const togglePicker = () => {
    setPickerVisible(!isPickerVisible);
  };
  useEffect(() => {
    headlessModule.initHeadless('XEI0EKAE23XPDNHKAQRJ');
    headlessModule.setHeadlessCallback(result => {
      handleGetOtpResponse(result);
    });
    return () => {
      headlessModule.clearListener();
    };
  }, []);
  const handleGetOtps = async () => {
    if (!validateFields()) return;
    const headlessRequest = {
      phone: phoneNumber,
      countryCode: '+91',
    };
    try {
      const result = headlessModule.startHeadless(headlessRequest);
      if (!result) {
        console.error('No result returned from OTP module');
        return;
      }
      if (result.statusCode === 200 && result.response?.otp) {
        console.log('Headless Result:', result);
      } else {
        console.error('Unexpected result or statusCode:', result);
        ToastAndroid.showWithGravity(
          'Failed to send OTP, try again later.',
          ToastAndroid.LONG,
          ToastAndroid.CENTER,
        );
        92;
      }
    } catch (error) {
      console.error('OTPless Error:', error);
      ToastAndroid.showWithGravity(
        'Failed to send OTP, try again later.',
        ToastAndroid.LONG,
        ToastAndroid.CENTER,
      );
    }
  };
  const handleGetOtpResponse = result => {
    console.log('Headless Result:', result);
    if (result?.statusCode === 200) {
      navigation.navigate('OtpScreen', {
        otp: result?.response?.otp,
        phone: phoneNumber,
        requestID: result?.requestID,
      });
      const responseType = result?.responseType;
      switch (responseType) {
        case 'INITIATE':
          console.log('Headless authentication initiated');
          break;
        case 'VERIFY':
          console.log('Verification completed');
          break;
        case 'OTP_AUTO_READ':
          if (Platform.OS === 'android') {
            const otp = result;
            console.log(`OTP Received: ${otp}`);
          }
          break;
        case 'ONETAP':
          console.log(`Token: ${result.token}`);
          navigation.navigate('EmailOtpScreen', {token: result.token});
          break;
        default:
          console.warn(`Unknown response type: ${responseType}`);
          break;
      }
    } else {
      Alert.alert(
        'Error',
        `Failed with status: ${result?.statusCode || 'unknown'}`,
      );
    }
  };
  const getFCMToken = async () => {
    try {
      let token = await messaging().getToken();
      setFcmToken(token);
      console.log('FCM Token:', token);
    } catch (error) {
      console.error('Error fetching FCM Token:', error);
    }
  };

  useEffect(() => {
    requestUserPermission();
    getFCMToken();
  }, []);
  const selectCountry = country => {
    setCountryCode(country.code);
    setCallingCode(country.callingCode);
    setPickerVisible(false);
  };

  const validateFields = () => {
    if (toggle) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email) {
        Alert.alert('Validation Error', 'Email address cannot be empty.');
        return false;
      }
      if (!emailRegex.test(email)) {
        Alert.alert('Validation Error', 'Please enter a valid email address.');
        return false;
      }
    } else {
      if (!phoneNumber) {
        Alert.alert('Validation Error', 'Phone number cannot be empty.');
        return false;
      }
      if (phoneNumber.length < 10) {
        Alert.alert(
          'Validation Error',
          'Phone number must be at least 10 digits long.',
        );
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    requestUserPermission();
    getFCMToken();
  }, []);
  const handleGetOtp = async () => {
    if (!validateFields()) return;

    SetLoading(true);
    try {
      if (toggle) {
        // Send OTP to Email
        const { error } = await supabase.auth.signInWithOtp({
          email: email,
        });

        if (error) throw error;
        navigation.navigate('EmailOtpScreen', {email});
      } else {
        navigation.navigate('OtpScreen');
      }
    } catch (error) {
      console.log('API Error Message:', error.message);
      Alert.alert('Login Error', error.message);
    } finally {
      SetLoading(false);
    }
  };

  const getMobileOtp = async () => {
    if (!phoneNumber) {
      Alert.alert('Validation Error', 'Phone number cannot be empty.');
      return;
    }
    SetLoading(true);
    
    // Format phone number with country code
    const formattedPhone = `+${callingCode}${phoneNumber}`;
    
    // Hardcoded OTP for easy testing since SMS may not deliver properly
    const generatedOtp = '1234';

    try {
      // Direct API call to EnableX to send SMS
      const response = await axios.post(
        'https://api.enablex.io/sms/v1/messages',
        {
          type: 'sms',
          to: [formattedPhone],
          from: 'ASTRO', // Placeholder sender ID
          body: `Your Astrowani login OTP is ${generatedOtp}. Do not share this with anyone.`,
        },
        {
          auth: {
            username: '6a2a6625054e8b26860b4aa8',
            password: 'RuBaju6yUyaeBuSuHavaguaaDadaguveNaNu\\',
          },
        }
      );

      console.log('EnableX Response:', response.data);

      showToast('OTP sent successfully to your registered mobile');
      
      // Pass the generated OTP to the next screen for verification
      navigation.navigate('OtpScreen', {
        phone: formattedPhone,
        expectedOtp: generatedOtp, // We pass it so the next screen can check it!
      });
      
    } catch (error) {
      console.log('EnableX Error:', error.response?.data || error.message);
      
      // If EnableX fails (e.g. because of strict Indian DLT rules or missing campaign),
      // we can still let you login with a bypass for testing!
      Alert.alert(
        'SMS Failed', 
        'EnableX failed to send SMS (you may need to configure a Campaign/Sender ID in EnableX). For testing, use OTP: ' + generatedOtp,
        [
          {
            text: 'Continue with Bypass',
            onPress: () => {
              navigation.navigate('OtpScreen', {
                phone: formattedPhone,
                expectedOtp: generatedOtp,
              });
            }
          }
        ]
      );
    } finally {
      SetLoading(false);
    }
  };

  // console.log("phoneNumber: ", phoneNumber);

  return (
    <View style={styles.main}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <Image
        source={require('../../assets/images/logo1.png')}
        style={styles.logo}
      />
      <Text style={styles.title}>Astrowani</Text>

      <Text style={styles.subTitle}>For Astrologers</Text>
      <View style={styles.loginContainer}>
        {toggle ? (
          <View style={styles.numberInput}>
            <Icon
              name="email"
              size={24}
              color="gray"
              style={styles.emailIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Enter Email Address"
              keyboardType="email-address"
              value={email}
              placeholderTextColor={COLORS.lightGrey}
              onChangeText={setEmail}
            />
          </View>
        ) : (
          <View style={styles.numberInput}>
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
              style={styles.input}
              maxLength={10}
              placeholder="Phone number"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </View>
        )}

        {toggle ? (
          <>
            <TouchableOpacity
              style={[styles.otpBtn, loading && styles.disabledBtn]}
              disabled={loading}
              onPress={handleGetOtp}>
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.btnTxt}>Get OTP</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.otpBtn, loading && styles.disabledBtn]}
              disabled={loading}
              onPress={getMobileOtp}>
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.btnTxt}>Get OTP Mobile</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.termsView}>
          <Text style={styles.termsText}>By signing up, you agree to our</Text>
          <TouchableOpacity style={styles.termsLink}>
            <Text style={styles.linktext}>Terms of use</Text>
          </TouchableOpacity>
          <Text style={styles.termsText}>&</Text>
          <TouchableOpacity style={styles.termsLink}>
            <Text style={styles.linktext}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setToggle(!toggle)}
          style={styles.signInBtn}>
          {toggle ? (
            <Text style={styles.signInTxt}>Sign in with Mobile Number</Text>
          ) : (
            <Text style={styles.signInTxt}>Sign in with Email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Registration')}>
          <Text style={styles.register}>Don't have an Account ? Register</Text>
        </TouchableOpacity>
      </View>
      <Modal
        visible={isPickerVisible}
        onRequestClose={togglePicker}
        transparent={true}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
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
            <TouchableOpacity onPress={togglePicker}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Login;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  logo: {
    alignSelf: 'center',
    marginTop: verticalScale(60),
    marginBottom: verticalScale(10),
    width: scale(100),
    height: verticalScale(100),
  },
  title: {
    textAlign: 'center',
    color: 'white',
    fontWeight: 'bold',
    fontSize: moderateScale(24),
    letterSpacing: scale(1),
  },
  subTitle: {
    textAlign: 'center',
    color: 'white',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
  },
  loginContainer: {
    backgroundColor: 'white',
    flex: 1,
    width: '100%',
    borderTopLeftRadius: moderateScale(25),
    borderTopRightRadius: moderateScale(25),
    marginTop: verticalScale(35),
  },
  tagline: {
    alignSelf: 'center',
    color: 'black',
    fontWeight: 'bold',
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(7),
    borderRadius: moderateScale(5),
    borderWidth: moderateScale(1),
    borderColor: COLORS.AstroMaroon,
    marginTop: verticalScale(-20),
    backgroundColor: 'white',
    fontSize: moderateScale(12),
  },
  numberInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: scale(15),
    borderWidth: moderateScale(1),
    height: verticalScale(42),
    borderColor: COLORS.AshGray,
    marginVertical: verticalScale(30),
    borderRadius: moderateScale(25),
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryPickerButton: {
    marginLeft: scale(10),
  },
  callingCode: {
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
  },
  input: {
    flex: 1,
    paddingVertical: verticalScale(1),
    marginLeft: scale(10),
    color: COLORS.black,
    fontSize: moderateScale(14),
  },
  otpBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(45),
    marginHorizontal: scale(15),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
  },
  disabledBtn: {
    backgroundColor: COLORS.gray,
  },
  btnTxt: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  termsView: {
    marginVertical: verticalScale(10),
    marginHorizontal: scale(15),
    alignItems: 'center',
    flexDirection: 'row',
    alignSelf: 'center',
  },
  termsText: {
    fontSize: moderateScale(11),
  },
  termsLink: {
    marginHorizontal: scale(2),
    padding: scale(1),
  },
  linktext: {fontSize: moderateScale(10), color: COLORS.AstroMaroon},
  signInTxt: {
    color: COLORS.DODGERBLUE,
    textAlign: 'center',

    fontWeight: 'bold',
  },
  register: {
    color: COLORS.AstroMaroon,
    textAlign: 'center',

    fontWeight: 'bold',
  },
  signInBtn: {
    marginVertical: verticalScale(35),
  },
  emailIcon: {
    paddingLeft: scale(10),
  },
  flag: {
    fontSize: moderateScale(20),
    marginHorizontal: scale(8),
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryPickerButton: {
    marginLeft: scale(10),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: 'white',
    padding: scale(20),
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  countryName: {
    fontSize: moderateScale(16),
    marginLeft: scale(10),
  },
  closeText: {
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    marginTop: verticalScale(20),
    fontSize: moderateScale(16),
  },
});
