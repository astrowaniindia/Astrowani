import { StyleSheet, TouchableOpacity, Text, View, Image, Alert, ActivityIndicator, StatusBar, } from 'react-native';
import React, { useState, useEffect } from 'react';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { OtpInput } from 'react-native-otp-entry';
import Instance from '../../api/ApiCall';
// import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';

const EmailOtpScreen = ({ navigation, route }) => {
  const { email, sessionId, type, mobile } = route.params;
  const [timer, setTimer] = useState(180);
  const [code, setCode] = useState('');
  const [fcmToken, setFcmToken] = useState('');

  console.log("route.params: ", route?.params);

  const [loading, setLoading] = useState(false);
  const formatTime = time => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const getFCMToken = async () => {
    let token = await messaging().getToken();
    console.log("FCM Token:", token); 
    setFcmToken(token);
  };

  const handleResendOTP = async () => {
    setTimer(180);
    setLoading(true);
    if (code) {
      setLoading(false);
    } else {
      try {
        console.log('Requesting OTP for email:', email);
        const response = await Instance.post('/api/users/sign-in', { email: email, });
        if (response.data.success) {
          // console.log(response.data);
        } else {
          Alert.alert('Login Failed', response.data.message);
        }
      } catch (error) {
        console.error('API call error:', error);
        Alert.alert('Login Error', 'Something went wrong. Please try again.');
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      const res = await Instance.post('/api/users/verify-otp', { email: email, otp: code, fcmToken: fcmToken,role763451: "astrologer" });
      if (res?.data) {
        // console.log('OTP verification successful', res.data);
        await AsyncStorage.setItem('token', res.data.token);
        navigation.navigate('DrawerNavigator');
      } else {
        Alert.alert('Error', 'Invalid OTP. Please try again.');
      }
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getFCMToken()
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer(prevTime => prevTime - 1);
      }, 1000);
    } else if (timer === 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handlMobileOTPVerify = async () => {
    try {
      setLoading(true)
      // const res = await Instance.post('/api/users/otp-verify', { mobile: mobile, otp: code, sessionId, fcm: fcmToken, });
      const res = await Instance.post('/api/users/mobile-otp-verify', { phoneNumber: mobile, otp: code,  fcmToken: fcmToken,role: "astrologer", });
      // const res = await Instance.post('/api/users/mobile-otp-verify', { mobile: mobile, otp: code, sessionId: sessionId ? sessionId : null, fcm: fcmToken, });
      // console.log(" =========================== handlMobileOTPVerify ===========================");
      // console.log("res: ", res?.data);
      if (res?.data) {
        // console.log('OTP verification successful', res.data);
        await AsyncStorage.setItem('token', res.data.token);
        navigation.navigate('DrawerNavigator');
        setLoading(false)
      } else {
        Alert.alert('Error', 'Invalid OTP. Please try again.');
        setLoading(false)
      }
    } catch (error) {
      console.log(" =========================== handlMobileOTPVerify ===========================");
      setLoading(false)
      // console.log("error on handlMobileOTPVerify", error);
      // console.log("error on handlMobileOTPVerify", error);
      Alert.alert('Error', 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.VerifyotpSection}>
      <StatusBar translucent backgroundColor={COLORS.AstroMaroon} barStyle="Light-content" />
      <Text style={styles.Verifytitle}>OTP sent to your {type == "mobile" ? "Mobile No." : "Email"}</Text>
      <View style={styles.OTptimeingView}>
        <Text style={styles.VerifyotpTimer}>OTP expires in {formatTime(timer)}</Text>
      </View>

      <View style={styles.OtpInputView}>
        <OtpInput
          numberOfDigits={6}
          onTextChange={text => setCode(text)}
          value={code}
          focusColor={COLORS.DODGERBLUE}
          textStyle={{ COLORS: 'black' }}
        />
      </View>

      {type == "mobile" ? <TouchableOpacity style={styles.Verifybutton2} onPress={handlMobileOTPVerify} disabled={loading}>
        {loading ? (<ActivityIndicator size="small" color={COLORS.AntiFlashWhite} />) : (<Text style={styles.VerifybuttonText}>Verify OTP</Text>)}
      </TouchableOpacity> :
        <TouchableOpacity style={styles.Verifybutton2} onPress={handleVerifyOTP} disabled={loading}>
          {loading ? (<ActivityIndicator size="small" color={COLORS.AntiFlashWhite} />) : (<Text style={styles.VerifybuttonText}>Verify OTP</Text>)}
        </TouchableOpacity>
      }

      <View style={styles.VerifyResendOtpView}>
        <Text style={styles.VerifyResendOtpTXt}>Didn't receive the OTP? </Text>
        <TouchableOpacity onPress={handleResendOTP} disabled={loading}><Text style={styles.VerifyResendOtpTXt2}>Resend OTP</Text></TouchableOpacity>
      </View>
    </View>
  );
};

export default EmailOtpScreen;
const styles = StyleSheet.create({
  VerifyotpSection: {
    flex: 1,
    paddingVertical: scale(40),
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  Verifyimage: {
    height: verticalScale(240),
    width: scale(250),
    marginBottom: verticalScale(5),
  },
  Verifytitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: COLORS.DODGERBLUE,
    textAlign: 'center',
  },
  Verifybutton2: {
    width: scale(250),
    height: verticalScale(45),
    backgroundColor: COLORS.DODGERBLUE,
    borderRadius: moderateScale(10),
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: verticalScale(20),
    elevation: scale(2),
  },
  VerifybuttonText: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: COLORS.AntiFlashWhite,
  },
  VerifyotpTimer: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    color: COLORS.midnightblue,
    marginBottom: verticalScale(20),
  },
  VerifyResendOtpView: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  VerifyResendOtpTXt: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: COLORS.ARSENIC,
  },
  VerifyResendOtpTXt2: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: COLORS.DODGERBLUE,
  },
  OtpInputView: {
    width: '80%',
    marginHorizontal: scale(5),
  },
});
