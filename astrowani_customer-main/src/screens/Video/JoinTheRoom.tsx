import React, {useEffect, useState} from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  Alert,
  TextInput,
  View,
  ScrollView,
  PermissionsAndroid,
} from 'react-native';
import axios from 'axios';

import {INITIATE_CALL} from '../Api/baseUrl';
import {scaleWidth} from '../common/consts/size';
import color from '../common/consts/color';
import {useNavigation} from '@react-navigation/native';
import { CustomToast } from '../common/component/CustomToast';
import Instance from '../../api/ApiCall';

const JoinTheRoom = ({route}: any) => {
  const {
    userToken,
    roomId,
    astroId,
    callType,
    userId,
    receiverId,
    callingCondition,
    callerRole,
    userName,
  } = route.params;
    const navigation = useNavigation<any>();
  

  const [usertoken, setUserToken] = useState(userToken || '');
  const [roomID, setRoomID] = useState(roomId || '');
  const [astroID, setAstroID] = useState(astroId || '');
  const [callTypeState, setCallTypeState] = useState(callType || '');
  const [receiverID, setReceiverID] = useState(receiverId || '');
  const [callingCond, setCallingCond] = useState(callingCondition || '');
  const [callerRoleState, setCallerRoleState] = useState(callerRole || '');

  useEffect(() => {
    getRoomTokenWebCall();
  }, []);

  const checkAndroidPermissions = async () => {
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);

      const deniedPermissions = Object.entries(result).filter(
        ([, value]) => value === 'denied',
      );

      if (deniedPermissions.length > 0) {
        throw new Error(
          `Permissions denied: ${deniedPermissions
            .map(([key]) => key)
            .join(', ')}`,
        );
      }
    } catch (error) {
      console.error('Permissions error:', error);
      throw error;
    }
  };

  const getRoomTokenWebCall = async () => {
    console.log('INITIATE CALL API calling....');
    console.log('userId....', userId);
    console.log('callerRoleState....', callerRoleState);
    console.log('usertoken....', usertoken);
    try {
      const response = await axios({
        url: `${Instance}/api/call/initiate`,
        method:"POST",
        data: {
          receiverId: userId,
          callType: 'voice',
          callerRole: callerRoleState,
        },
        headers: {
          Authorization: `Bearer ${usertoken}`,
        },
      });
      console.log('-----INITIATE CALL API response----', response.data.data);
      if (response.status === 200) {
        navigateToVoice(response.data.data);
      }
      // else {
      //   console.log('here call breaks....');
      //   Alert.alert('Error', response.data.error || 'Unexpected Error');
      // }
    } catch (error) {
      console.log('here call breaks....123');
      handleError(error);
    }
  };

  const handleError = (error: any) => {
    console.log('===error ===', error.response);
    if (error.response) {
      const errorMessage = error.response.data?.message || 'An error occurred on the server.';
      CustomToast({
        type: 'error',
        title: 'Oops!',
        message: errorMessage,
      });
      if(error.response.data?.message.includes("enough points")){
        navigation.navigate('BuyPoints');
        return;
      }
      navigation.goBack();
      return;
    } else if (error.request) {
      CustomToast({
        type: 'error',
        title: 'Oops!',
        message: "No response from the server. Please check your connection.",
      });
      navigation.goBack();
      return;
      // Alert.alert(
      //   'Network Error',
      //   'No response from the server. Please check your connection.',
      // );
    } else {
      const errorMessage = error.message || 'An unknown error occurred.';
      CustomToast({
        type: 'error',
        title: 'Oops!',
        message: errorMessage,
      });
      navigation.goBack();
      return;
      // Alert.alert('Error', error.message || 'An unknown error occurred.');
    }
  };

  const navigateToVoice = (data: any) => {
    console.log('Token recived here -> ', data);
    navigation.navigate('VoiceCallScreen', {
      username: userName,
      token: data.token.token,
      recieverName: data.receiver?.name,
      recieverAge: data.receiver?.age,
      recieverDistance: data.receiver?.distance,
      recieverImage: data.receiver?.image,
      userToken: usertoken,
      sessionId: data.sessionId
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <View style={{marginTop: 10, marginBottom: 20}}>
        {/* <TextInput
          style={styles.input}
          placeholder="Enter name"
          value={userName}
          editable={false}
          placeholderTextColor={color.mainGrey}
        /> */}
      </View>
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    </ScrollView>
  );
};

export default JoinTheRoom;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: scaleWidth(20),
    paddingTop: scaleWidth(40),
    backgroundColor: color.black,
  },
  input: {
    height: scaleWidth(40),
    borderColor: color.deepBlue,
    backgroundColor: 'transparent',
    borderWidth: scaleWidth(2),
    borderRadius: scaleWidth(10),
    marginBottom: scaleWidth(20),
    paddingHorizontal: scaleWidth(10),
  },
  loadingContainer: {
    marginTop: scaleWidth(20),
    alignItems: 'center',
  },
  loadingText: {
    fontSize: scaleWidth(18),
    color: color.mainGrey,
  },
});
