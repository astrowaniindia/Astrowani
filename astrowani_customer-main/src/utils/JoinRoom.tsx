import React, {Component} from 'react';
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
import { SOCKET_URL } from '../config/api';


// import Logo from '../assets/img/logo.png';


interface Props {
  navigation: any;
  route: {
    params: {
      userId: string;
      name: string;
      roomId?: string;
      astroId: string;
      callType: string;
      receiverId: string;
      callingCondition: string;
      callerRole: string;
      userToken: string;
    };
  };
}
interface State {
  userName: string;
  roomID: string;
  callType: string;
  userId: string;
  receiverId: string;
  callingCondition: string;
  callerRole: string;
  userToken: string;
}
class App extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    const {name, roomId, callType, userId, receiverId, callingCondition, callerRole, userToken } = props.route.params;
    console.log(name, roomId, callType, userId, receiverId, callingCondition, callerRole, userToken,'========================+++++++++++++++++++++++++++++++++++++++++');
    
    this.state = {
      userName: name || '',
      roomID: roomId || '',
      callType: callType || '',
      userId: userId || '',
      receiverId: receiverId || '',
      callingCondition: callingCondition || '',
      callerRole: callerRole || '',
      userToken: userToken || '',
    };
  }
  componentDidMount() {
    this.getRoomTokenWebCall();
  }
  checkAndroidPermissions = async (): Promise<void> => {
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

 

  getRoomTokenWebCall = async (): Promise<string | null> => {
    // const {userName, roomID, astroId, userId, callType} = this.state;
    const {roomID, userId, callerRole, userToken } = this.state;
    console.log(roomID, '55555555555555555');
    try {
      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {
          receiverId: userId,
          callType: "voice",
          callerRole: callerRole
        },
        {
          headers: {
            Authorization: `Bearer ${userToken}`
          }
        }
      );
      console.log('-----Joining room api response----', response);
      console.log(response,"+_===================================")
      if (response.status === 200) {
        this.navigateToVideo(response.data.token);
        return response.data.token;
      } else {
        console.log("here call breaks....")
        Alert.alert('Error', response.data.error || 'Unexpected Error');
        return null;
      }
     
    } catch (error: any) {
      console.log("here call breaks....123")
      this.handleError(error);
      return null;
    }
  };

  handleError = (error: any): void => {
    console.log("===error ===", error.response);
    if (error.response) {
      Alert.alert(
        'Server Error',
        error.response.data?.message || 'An error occurred on the server.',
      );
    } else if (error.request) {
      Alert.alert(
        'Network Error',
        'No response from the server. Please check your connection.',
      );
    } else {
      Alert.alert('Error', error.message || 'An unknown error occurred.');
    }
  };

  navigateToVideo = async (token:any): Promise<void> => {
 
    const {callType, userName,userId,roomID} = this.state;

    const resolvedCallType = callType || 'video'; // Default to 'video'
    console.log(resolvedCallType, '&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&');
    if (resolvedCallType === 'video') {
      this.props.navigation.navigate('VoiceCallScreen', {
        username: userName,
        token,
        roomID,
        userId,
        
      });
    } else {
      this.props.navigation.navigate('VoiceCallScreen', {
        username: userName,
        token,
      });
    }
  };



  render() {
    const {userName} = this.state;

    return (
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        {/* <Logo /> */}
        <View style={{marginTop: 10, marginBottom: 20}}>
          <TextInput
            style={styles.input}
            placeholder="Enter name"
            value={userName}
            editable={false} // Input is read-only
            placeholderTextColor="#757575"
          />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Creating Room...</Text>
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  input: {
    height: 40,
    borderColor: '#eae7e7',
    backgroundColor: '#eae7e7',
    borderWidth: 2,
    borderRadius: 10,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#534367',
  },
});

export default App;
