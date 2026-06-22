import { StyleSheet, TouchableOpacity, Text, View, Image, Alert, ActivityIndicator, StatusBar, } from 'react-native';
import React, { useState, useEffect } from 'react';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { OtpInput } from 'react-native-otp-entry';
import { OtplessHeadlessModule } from 'otpless-react-native';
import Instance from '../../api/ApiCall';
import { supabase } from '../../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OtpScreen = ({ navigation, route }) => {
  // const {}
  const { phone, otp, expectedOtp } = route?.params

  // console.log("mobile: ", phone);
  // console.log("otp: ", otp);


  const [timer, setTimer] = useState(180);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

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

  // Headless module removed

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      if (code === expectedOtp) {
        console.log('OTP verification successful');
        
        // Fetch the astrologer from Supabase
        // Hardcoded to log in as Ansh Sharma regardless of what phone number was typed
        const { data: exactUser } = await supabase
          .from('astrologers')
          .select('id, approval_status')
          .eq('phone_number', '1234567890')
          .single();

        if (exactUser) {
          await AsyncStorage.setItem('astroId', String(exactUser.id));
        }

        await AsyncStorage.setItem('userToken', 'dummy_token_for_now');
        await AsyncStorage.setItem('token', 'dummy_token_for_now');

        // Gate on admin approval — pending/rejected vendors can't reach the dashboard.
        if (exactUser && exactUser.approval_status !== 'approved') {
          navigation.reset({ index: 0, routes: [{ name: 'PendingApproval' }] });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' }] });
        }
      } else {
        Alert.alert('Error', 'Invalid OTP. Please try again.');
      }
    } catch (error) {
      console.log('CRASH in verify:', error);
      Alert.alert('Debug Error', error?.message || JSON.stringify(error) || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

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
  }, [timer]);

  // handleGetOtpResponse removed

  const handleOtpVerify = async () => {
    // Using our new Supabase function instead of headlessModule
    handleVerifyOTP();
  }


  return (
    <View style={styles.VerifyotpSection}>
      <StatusBar translucent backgroundColor={COLORS.AstroMaroon} barStyle="Light-content" />

      <Text style={styles.Verifytitle}>OTP sent to your Number</Text>
      <View style={styles.OTptimeingView}>
        <Text style={styles.VerifyotpTimer}>OTP expires in {formatTime(timer)}        </Text>
      </View>
      <View style={styles.OtpInputView}>
        <OtpInput umberOfDigits={4} onTextChange={text => setCode(text)} value={code} focusColor={COLORS.DODGERBLUE} />
      </View>

      {/* <TouchableOpacity style={styles.Verifybutton2} onPress={handleVerifyOTP} disabled={loading}> */}
      <TouchableOpacity style={styles.Verifybutton2} onPress={handleOtpVerify} disabled={loading}>
        {loading ? (<ActivityIndicator size="small" color={COLORS.AntiFlashWhite} />) : (<Text style={styles.VerifybuttonText}>Verify OTP</Text>)}
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
    width: '60%',
    marginHorizontal: scale(5),
  },
});
