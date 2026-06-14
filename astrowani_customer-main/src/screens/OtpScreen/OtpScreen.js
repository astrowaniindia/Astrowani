import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import React, { useState, useEffect } from 'react';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { OtpInput } from 'react-native-otp-entry';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestUserPermission } from '../../utils/PushNotification';
// import { requestUserPermission } from '../../utils/PushNotification';

// import Instance from '../../api/ApiCall';

const OtpScreen = ({ navigation, route }) => {
  const [timer, setTimer] = useState(180);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fcmToken, setFcmToken] = useState('');

  // const [fcmToken,setFcmToken]=useState()
  //   const getFCMToken = async () => {
  //     let token = await messaging().getToken();
  //     setFcmToken(token);
  //     console.log(fcmToken,"this is fcmtoken")
     
  //   };
    // useEffect(() => {
    //   requestUserPermission();
    //   getFCMToken();
    // }, []);
  // console.log('.....route...', route.params);
  console.log("route: ", route.params);
  const { phone } = route?.params
  const { sessionId } = route?.params
  const { type } = route?.params
  const formatTime = time => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleResendOTP = async () => {
    setTimer(180);
    setLoading(true);

    if (code) {
      setLoading(false);
    } else {
      // Simulate an API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
 
    try {
      setLoading(true)
      // const res = await Instance.post('/api/users/otp-verify', { mobile: phone, otp: code, sessionId, fcm: "kjfhsdkjhfkjdfjkfhsjkfhdj" });
      const res = await Instance.post('/api/users/mobile-otp-verify', { phoneNumber: phone, otp: code,fcmToken: fcmToken,role:"customer" || ''});
      if (res?.data) {
        console.log('OTP verification successful', res.data);
        await AsyncStorage.setItem('token', res.data.token);
        navigation.reset({
          index: 0,
          routes: [{ name: 'DrawerNavigator' }],
        });
        setLoading(false)
      } else {
        Alert.alert('Error', 'Invalid OTP. Please try again.');
        setLoading(false)
      }
    } catch (error) {
      setLoading(false)
      console.log(error);
      Alert.alert('Error', 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer(prevTime => prevTime - 1);
      }, 1000);
    } else if (timer === 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const getToken = async () => {
      const token = await AsyncStorage.getItem('fcmToken');
      setFcmToken(token);
    };
    getToken();
  }, []);
  return (
    <View style={styles.VerifyotpSection}>
      <StatusBar
        translucent
        backgroundColor={COLORS.AstroMaroon}
        barStyle="Light-content"
      />

      <Text style={styles.Verifytitle}>OTP sent to your Number</Text>
      <View style={styles.OTptimeingView}>
        <Text style={styles.VerifyotpTimer}>
          OTP expires in {formatTime(timer)}
        </Text>
      </View>
      <View style={styles.OtpInputView}>
        <OtpInput
          numberOfDigits={6}
          onTextChange={text => setCode(text)}
          value={code}
          focusColor={COLORS.AstroMaroon}
          theme={{
            pinCodeTextStyle: { color: '#000' },
          }}
        />
      </View>
      <TouchableOpacity
        style={styles.Verifybutton2}
        onPress={handleVerifyOTP}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.AntiFlashWhite} />
        ) : (
          <Text style={styles.VerifybuttonText}>Verify OTP</Text>
        )}
      </TouchableOpacity>
      <View style={styles.VerifyResendOtpView}>
        <Text style={styles.VerifyResendOtpTXt}>Didn't receive the OTP? </Text>
        <TouchableOpacity onPress={handleResendOTP} disabled={loading}>
          <Text style={styles.VerifyResendOtpTXt2}>Resend OTP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OtpScreen;
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
    color: COLORS.AstroMaroon,
    textAlign: 'center',
  },
  Verifybutton2: {
    width: scale(250),
    height: verticalScale(45),
    backgroundColor: COLORS.AstroMaroon,
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
    color: COLORS.AstroMaroon,
  },
  OtpInputView: {
    width: '80%',
    marginHorizontal: scale(5),
  },
});
