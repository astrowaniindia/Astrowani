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
      sessionId: string;
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
  receiverImage: string;
  sessionId: string;
}
class App extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    const {name, roomId, callType, userId, receiverId, callingCondition, callerRole, userToken, sessionId } = props.route.params;
    console.log(name, roomId, callType, userId, receiverId, callingCondition, callerRole, userToken, sessionId,'========================+++++++++++++++++++++++++++++++++++++++++');

    this.state = {
      userName: name || '',
      roomID: roomId || '',
      callType: callType || '',
      userId: userId || '',
      receiverId: receiverId || '',
      callingCondition: callingCondition || '',
      callerRole: callerRole || '',
      userToken: userToken || '',
      receiverImage: '',
      sessionId: sessionId || '',
    };
  }
  componentDidMount() {
    this.getRoomTokenWebCall();
    this.fetchReceiverImage();
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

  fetchReceiverImage = async () => {
    try {
      const response = await axios.get(`https://astrowani-fb6pi.ondigitalocean.app/api/users/${this.state.receiverId}`, {
        headers: { Authorization: `Bearer ${this.state.userToken}` }
      });
      this.setState({receiverImage: response.data.data.profilePic});
    } catch (error) {
      console.log('Error fetching receiver image:', error);
      this.setState({receiverImage: 'https://via.placeholder.com/100'});
    }
  };

  getRoomTokenWebCall = async (): Promise<string | null> => {
    // const {userName, roomID, astroId, userId, callType} = this.state;
    const {roomID, userId, callerRole, userToken, sessionId, callType} = this.state;
    console.log(sessionId, '55555555555555555');
    try {
      const response = await axios.post(
        `https://astrowani-fb6pi.ondigitalocean.app/api/call/accept-call`,
        {
          receiverId: userId,
          callType: callType,
          callerRole: callerRole,
          sessionId: sessionId,
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
      // console.log("here call breaks....123")     
       console.error('Error joining room:', error?.response?.data);

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
    this.props.navigation.navigate('EnxScreenVoice', {
      token,
      sessionId: this.state.sessionId,
      callType: this.state.callType,
      receiverImage: this.state.receiverImage,
    });
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
