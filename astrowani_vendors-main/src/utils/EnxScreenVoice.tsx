import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  Alert,
  TouchableHighlight,
  View,
  Dimensions,
  Image,
  PermissionsAndroid,
  FlatList,
  BackHandler,
} from 'react-native';
import {
  EnxRoom,
  Enx,
  EnxStream,
  EnxPlayerView,
} from 'enx-rtc-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../Theme/Colors';
import { showAlert } from './CustomAlert';

interface Props {
  route: any;
  navigation: any;
}

interface LocalStreamInfo {
  audio: boolean;
  video: boolean;
  data: boolean;
  maxVideoBW: string;
  minVideoBW: string;
  audioMuted: boolean;
  videoMuted: boolean;
  name: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  audio_only: boolean;
}

interface VideoQual {
  streamType: string;
  videoQuality: string;
}

interface EnxRoomInfo {
  allow_reconnect: boolean;
  number_of_attempts: number;
  timeout_interval: number;
  playerConfiguration: {
    audiomute: boolean;
    videomute: boolean;
    bandwidth: boolean;
    screenshot: boolean;
    avatar: boolean;
    iconHeight: number;
    iconWidth: number;
    avatarHeight: number;
    avatarWidth: number;
    iconColor: string;
  };
}

interface AdvanceOptions {
  battery_updates: boolean;
  notify_video_resolution_change: boolean;
}

interface Chat {
  message: string;
  from: string;
  timestamp: number;
}

const calculateColoum = (data: any[]) => {
  if (data.length == 1 || data.length == 2) return 1;
  else return 2;
};

const calculateRow = (data: any[]) => {
  if (data.length == 1) return 1;
  else if (data.length == 2 || data.length == 3 || data.length == 4) return 2;
  else if (data.length == 5 || data.length == 6) return 3;
  else if (data.length == 7 || data.length == 8) return 4;
  else if (data.length == 9 || data.length == 10 || data.length > 10) return 5;
};

const EnxScreenVoice: React.FC<Props> = ({route, navigation}) => {
  const callDurationRef = useRef<number | null>(null);
  const callType = route.params ? route.params.callType : 'audio';

  const [screenHeight, setScreenHeight] = useState(Dimensions.get('window').height);
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [noOfColumn, setNoOfColumn] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [deviceList, setDeviceList] = useState<any[]>([]);
  const [base64Icon, setBase64Icon] = useState('');
  const [activeTalkerStreams, setActiveTalkerStreams] = useState<any[]>([]);
  const [isUpdated, setIsUpdated] = useState(false);
  const [recordingCheck, setRecordingCheck] = useState(false);
  const [screenShareCheck, setScreenShareCheck] = useState(false);
  const [toolBarCheck, setToolBarCheck] = useState(false);
  const [audioMuteUnmuteCheck, setAudioMuteUnmuteCheck] = useState(true);
  const [audioMuteUnmuteImage, setAudioMuteUnmuteImage] = useState(require('../image_asset/unmute.png'));
  const [videoMuteUnmuteCheck, setVideoMuteUnmuteCheck] = useState(true);
  const [videoMuteUnmuteImage, setVideoMuteUnmuteImage] = useState(require('../image_asset/startvideo.png'));
  const [rotateCamera, setRotateCamera] = useState(false);
  const [rotateCameraImage, setRotateCameraImage] = useState(require('../image_asset/switchcamera.png'));
  const [canvasCheck, setCanvasCheck] = useState(false);
  const [annotationCheck, setAnnotationCheck] = useState(false);
  const [localStreamId, setLocalStreamId] = useState('0');
  const [screenShareId, setScreenShareId] = useState<string | null>(null);
  const [canvasStreamId, setCanvasStreamId] = useState<string | null>(null);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [annotationStreamId, setAnnotationStreamId] = useState<string | null>(null);

  const [localStreamInfo, setLocalStreamInfo] = useState<LocalStreamInfo>({
    audio: true,
    video: callType === 'video',
    data: false,
    maxVideoBW: '400',
    minVideoBW: '300',
    audioMuted: false,
    videoMuted: callType === 'audio', // Mute video for audio calls
    name: 'React Native',
    minWidth: '720',
    minHeight: '480',
    maxWidth: '1280',
    maxHeight: '720',
    audio_only: callType === 'audio',
  });

  const [videoQual, setVideoQual] = useState<VideoQual>({
    streamType: 'talker',
    videoQuality: 'SD',
  });

  const [enxRoomInfo, setEnxRoomInfo] = useState<EnxRoomInfo>({
    allow_reconnect: true,
    number_of_attempts: 3,
    timeout_interval: 15,
    playerConfiguration: {
      audiomute: true,
      videomute: true,
      bandwidth: true,
      screenshot: true,
      avatar: true,
      iconHeight: 30,
      iconWidth: 30,
      avatarHeight: 50,
      avatarWidth: 50,
      iconColor: '#dfc0ef',
    },
  });

  const [advanceOptions, setAdvanceOptions] = useState<AdvanceOptions>({
    battery_updates: true,
    notify_video_resolution_change: true,
  });

  const [chat, setChat] = useState<Chat>({
    message: 'Test chat',
    from: 'React-Native',
    timestamp: Date.now(),
  });

  useEffect(() => {
    const checkPermissionsAndInit = async () => {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ]);

        if (
          granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
        ) {
          setPermissionError(false);
          Enx.initRoom();
        } else {
          setPermissionError(true);
          showAlert('Permissions Required', 'Please grant Camera and Microphone permissions to join the call.', 'error', () => {
            navigation.goBack();
          }, 'OK');
        }
      } catch (err) {
        console.warn(err);
      }
    };

    checkPermissionsAndInit();

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => {
      backHandler.remove();
      try {
        Enx.destroy();
      } catch (error) {
        console.log('Error cleaning up room:', error);
      }
    };
  }, []);

  const handleBackButton = useCallback(() => {
    Alert.alert(
      'Exit App',
      'Exiting the application?',
      [
        {
          text: 'Cancel',
          onPress: () => console.log('Cancel Pressed'),
          style: 'cancel',
        },
        {
          text: 'OK',
          onPress: () => BackHandler.exitApp(),
        },
      ],
      {
        cancelable: false,
      },
    );
    return true;
  }, []);

  const roomEventHandlers = {
    roomConnected: useCallback((event: any) => {
      console.log('roomConnected', event);
      setIsConnected(true);
      callDurationRef.current = Date.now();
      Enx.getLocalStreamId((status: any) => {
        setLocalStreamId(status);
      });
      Enx.publish();
    }, []),

    roomError: useCallback((event: any) => {
      console.log('roomError', event);
      if (event.msg == 'Network disconnected') {
        navigation.navigate("HomeScreen");
      } else if (event.msg == 'Token validation failed') {
        Alert.alert('Token validation failed', 'Please try again.');
        navigation.goBack();
      }
    }, [navigation]),

    availableFiles: useCallback((event: any) => {
      console.log('availableFiles', event);
    }, []),

    streamPublished: useCallback((event: any) => {
      console.log('streamPublished', event);
    }, []),

    eventError: useCallback((event: any) => {
      console.log('eventErrorrr', event);
      if (permissionError) {
        Alert.alert(
          'Kindly grant camera and microphone permission to continue.',
        );
      }
    }, [permissionError]),

    streamAdded: useCallback((event: any) => {
      console.log('streamAdded', event);
      Enx.subscribe(event.streamId, (error: any) => {
        console.log('streamAdded', error);
      });
    }, []),

    notifyDeviceUpdate: useCallback((event: any) => {
      console.log('NotifyDeviceUpdate', event);
    }, []),

    activeTalkerList: useCallback((event: any) => {
      console.log(event,"this is event|++++++++++++++++++++++")
      var tempArray = [];
      if (event.length == 0) {
        setActiveTalkerStreams([]);
        return;
      }
      if (event.lenght == activeTalkerStreams.length) return;
      if (activeTalkerStreams.length > 0) {
        setActiveTalkerStreams([]);
      }
      for (var i = 0; i < event.length; i++) {
        setActiveStreamId(event[0].streamId);
        tempArray.push(event[i]);
      }
      if (tempArray.length > 0) {
        setActiveTalkerStreams(tempArray);
      }
    }, [activeTalkerStreams.length]),

    streamSubscribed: useCallback((event: any) => {
      console.log('streamSubscribed', event);
    }, []),

    roomDisconnected: useCallback((event: any) => {
      console.log('disconnecteddddd', event);
      navigation.reset({
        index: 0,
        routes: [{ name: 'DrawerNavigator' }],
      });
    }, [navigation]),

    recordStarted: useCallback((event: any) => {
      console.log('recordStartedddddd', event.msg);
      setRecordingCheck(true);
    }, []),

    recordStopped: useCallback((event: any) => {
      console.log('recordStopped', event.msg);
      setRecordingCheck(false);
    }, []),

    startRecordingEvent: useCallback((event: any) => {
      console.log('startRecordingEvent', event);
      if (event.result == '0') {
        setRecordingCheck(true);
      }
    }, []),

    stopRecordingEvent: useCallback((event: any) => {
      console.log('stopRecordingEvent', event);
      if (event.result == '0') {
        setRecordingCheck(false);
      }
    }, []),

    receivedStats: useCallback((event: any) => {
      console.log('receivedStats', event);
    }, []),

    acknowledgeStats: useCallback((event: any) => {
      console.log('acknowledgeStats', event);
    }, []),

    bandWidthUpdated: useCallback((event: any) => {
      console.log('bandWidthUpdated', event);
    }, []),

    shareStateEvent: useCallback((event: any) => {
      console.log('shareStateEvent', event);
    }, []),

    canvasStateEvent: useCallback((event: any) => {
      console.log('canvasStateEvent', event);
    }, []),

    startScreenShareACK: useCallback((event: any) => {
      console.log('startScreenShareACK', event);
    }, []),

    stoppedScreenShareACK: useCallback((event: any) => {
      console.log('stoppedScreenShareACK', event);
    }, []),

    screenShareStarted: useCallback((event: any) => {
      console.log('screenShareStarted', event);
      setScreenShareId(String(event.streamId));
      setScreenShareCheck(true);
    }, []),

    sceenShareStopped: useCallback((event: any) => {
      console.log('sceenShareStoppedddd', event);
      setScreenShareCheck(false);
    }, []),

    canvasStarted: useCallback((event: any) => {
      setCanvasStreamId(String(event.streamId));
      setCanvasCheck(true);
    }, []),

    canvasStopped: useCallback((event: any) => {
      console.log('canvasStoppedddd', event);
      setCanvasCheck(false);
    }, []),

    mutedAllUser: useCallback((event: any) => {
      console.log('mutedAllUser', event);
    }, []),

    unmutedAllUser: useCallback((event: any) => {
      console.log('unmutedAllUser', event);
    }, []),

    hardMutedAll: useCallback((event: any) => {
      console.log('hardMutedAll', event);
    }, []),

    hardUnmuteAllUser: useCallback((event: any) => {
      console.log('hardUnmuteAllUser', event);
    }, []),

    userConnected: useCallback((event: any) => {
      console.log('userConnected', event);
    }, []),

    userDisconnected: useCallback((event: any) => {
      console.log('userDisconnected', event);
      navigation.reset({
        index: 0,
        routes: [{ name: 'DrawerNavigator' }],
      });
    }, [navigation]),

    reconnect: useCallback((event: any) => {
      console.log('reconnect', event);
    }, []),

    userReconnect: useCallback((event: any) => {
      console.log('userReconnect', event);
      setActiveTalkerStreams([]);
    }, []),

    connectionInterrupted: useCallback((event: any) => {
      console.log('connectionInterrupted', event);
    }, []),

    connectionLost: useCallback((event: any) => {
      console.log('connectionLost', event);
    }, []),

    capturedView: useCallback((event: any) => {
      console.log('capturedView', event);
      setBase64Icon(event);
    }, []),
  };

  const streamEventHandlers = {
    audioEvent: useCallback((event: any) => {
      console.log('audioEvent', event);
      if (event.result == '0') {
        if (event.msg == 'Audio Off') {
          setAudioMuteUnmuteCheck(false);
          setAudioMuteUnmuteImage(require('../image_asset/mute.png'));
        } else {
          setAudioMuteUnmuteCheck(true);
          setAudioMuteUnmuteImage(require('../image_asset/unmute.png'));
        }
      }
    }, []),

    playerStats: useCallback((event: any) => {
      console.log('playerStats', event);
    }, []),

    videoEvent: useCallback((event: any) => {
      if (event.result == '0') {
        if (event.msg == 'Video Off') {
          setVideoMuteUnmuteCheck(false);
          setVideoMuteUnmuteImage(require('../image_asset/stopvideo.png'));
        } else {
          setVideoMuteUnmuteCheck(true);
          setVideoMuteUnmuteImage(require('../image_asset/startvideo.png'));
        }
      }
    }, []),

    hardMuteAudio: useCallback((event: any) => {
      console.log('hardMuteAudio', event);
    }, []),

    hardUnmuteAudio: useCallback((event: any) => {
      console.log('hardUnmuteAudio', event);
    }, []),

    recievedHardMutedAudio: useCallback((event: any) => {
      console.log('recievedHardMutedAudio', event);
    }, []),

    recievedHardUnmutedAudio: useCallback((event: any) => {
      console.log('recievedHardUnmutedAudio', event);
    }, []),

    hardVideoMute: useCallback((event: any) => {
      console.log('hardVideoMute', event);
    }, []),

    hardVideoUnmute: useCallback((event: any) => {
      console.log('hardVideoUnmute', event);
    }, []),

    receivehardMuteVideo: useCallback((event: any) => {
      console.log('receivehardMuteVideo', event);
    }, []),

    recivehardUnmuteVideo: useCallback((event: any) => {
      console.log('recivehardUnmuteVideo', event);
    }, []),

    receiveData: useCallback((event: any) => {
      console.log('receiveData', event);
    }, []),

    remoteStreamAudioMute: useCallback((event: any) => {
      console.log('remoteStreamAudioMute', event);
    }, []),

    remoteStreamAudioUnMute: useCallback((event: any) => {
      console.log('remoteStreamAudioUnMute', event);
    }, []),

    remoteStreamVideoMute: useCallback((event: any) => {
      console.log('remoteStreamVideoMute', event);
    }, []),

    remoteStreamVideoUnMute: useCallback((event: any) => {
      console.log('remoteStreamVideoUnMute', event);
    }, []),
  };

  const requestPermission = useCallback(async () => {
    // Permission handled in useEffect now
  }, []);

  const _onLayout = useCallback((event: any) => {
    var {x, y, width, height} = event.nativeEvent.layout;
    setScreenHeight(height);
    setScreenWidth(width);
  }, []);

  const _onPressMute = useCallback(() => {
    Enx.muteSelfAudio(localStreamId, audioMuteUnmuteCheck);
    setAudioMuteUnmuteCheck(!audioMuteUnmuteCheck);
    setAudioMuteUnmuteImage(audioMuteUnmuteCheck ? require('../image_asset/mute.png') : require('../image_asset/unmute.png'));
  }, [localStreamId, audioMuteUnmuteCheck]);

  const _onPressVideoMute = useCallback(() => {
    Enx.muteSelfVideo(localStreamId, videoMuteUnmuteCheck);
    setVideoMuteUnmuteCheck(!videoMuteUnmuteCheck);
    setVideoMuteUnmuteImage(videoMuteUnmuteCheck ? require('../image_asset/stopvideo.png') : require('../image_asset/startvideo.png'));
  }, [localStreamId, videoMuteUnmuteCheck]);

  const _onPressSpeaker = useCallback(() => {
    console.log('_onPressSpeaker', 'clicked');
  }, []);

  const _onPressSwitchCamera = useCallback(() => {
    Enx.switchCamera(localStreamId);
    setRotateCamera(!rotateCamera);
  }, [localStreamId, rotateCamera]);

  const doEndCall = useCallback(async () => {
    const durationInMinutes = Math.ceil((Date.now() - (callDurationRef.current || 0)) / 60000);
    const sessionId = route.params ? route.params.sessionId : '';
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await axios({
        url: `https://astrowani-fb6pi.ondigitalocean.app/api/call/end`,
        method: 'POST',
        data: {
          sessionId,
          duration: durationInMinutes,
          rating: 5,
          feedback: 'Nice call',
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'DrawerNavigator' }],
        });
      }
    } catch (error) {
      console.log('End call API error:', error);
      navigation.reset({
        index: 0,
        routes: [{ name: 'DrawerNavigator' }],
      });
    }
  }, [route.params, navigation]);

  const _onPressDisconnect = useCallback(async () => {
    try {
      // First destroy the room connection
      Enx.destroy();

      // Then make the API call
      await doEndCall();
    } catch (error) {
      console.log('Error disconnecting call:', error);
      // Still try to navigate even if there's an error
      navigation.reset({
        index: 0,
        routes: [{ name: 'DrawerNavigator' }],
      });
    }
  }, [doEndCall, navigation]);

  const renderItem = useCallback(({item, index}: {item: any; index: number}) => {
    return (
      <EnxPlayerView
        style={{
          flex: 1,
          margin: 1,
          height:
            (screenHeight - 60) /
            (calculateRow(activeTalkerStreams) || 1),
          width:
            screenWidth /
            (calculateColoum(activeTalkerStreams) || 1),
        }}
        key={String(item.streamId)}
        streamId={String(item.streamId)}
        isLocal="remote"
      />
    );
  }, [screenHeight, screenWidth, activeTalkerStreams]);

  const renderAudioCall = useCallback(() => {
    const token = route.params ? route.params.token : '';

    return (
      <View style={styles.container}>
        <View style={styles.backgroundContainer}>
          <Image
            source={require('../assets/images/background.jpg')}
            style={styles.userImage}
            resizeMode="cover"
          />
          <View style={styles.overlay} />
        </View>

        <View style={styles.header}>
          <TouchableHighlight
            style={styles.backButton}
            underlayColor="rgba(255,255,255,0.1)"
            onPress={() => navigation.goBack()}>
            <Text style={{color: '#fff', fontSize: 16}}>←</Text>
          </TouchableHighlight>
          <View style={styles.centerBox}>
            <Text style={styles.statusText}>Connecting...</Text>
          </View>
          <View style={styles.rightPlaceholder} />
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.avatarContainer}>
            <View style={styles.ring} />
            <View style={styles.avatarWrapper}>
              <Image
                source={require('../assets/images/logo.jpeg')}
                style={styles.avatar}
                resizeMode="cover"
              />
            </View>
          </View>

          <View style={styles.userInfoContainer}>
            <Text style={styles.userName}>Astrologer</Text>
            <Text style={styles.userDetails}>Professional Consultation</Text>
            <Text style={styles.callStatus}>Ringing...</Text>
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <View style={styles.controlRow}>
            <TouchableHighlight
              style={styles.controlButton}
              underlayColor="rgba(255,255,255,0.1)"
              onPress={_onPressMute}>
              <View style={styles.controlContent}>
                <Image
                  source={audioMuteUnmuteImage}
                  style={styles.controlIcon}
                />
                <Text style={styles.controlText}>Mute</Text>
              </View>
            </TouchableHighlight>

            <TouchableHighlight
              style={styles.endCallButton}
              underlayColor="#cc0000"
              onPress={_onPressDisconnect}>
              <View style={styles.controlContent}>
                <View style={styles.endCallIcon}>
                  <Image
                    source={require('../image_asset/disconnect.png')}
                    style={{width: 20, height: 20, tintColor: '#fff'}}
                  />
                </View>
                <Text style={styles.endCallText}>End Call</Text>
              </View>
            </TouchableHighlight>

            <TouchableHighlight
              style={styles.controlButton}
              underlayColor="rgba(255,255,255,0.1)"
              onPress={_onPressSpeaker}>
              <View style={styles.controlContent}>
                <Image
                  source={require('../image_asset/speakermute.png')}
                  style={styles.controlIcon}
                />
                <Text style={styles.controlText}>Speaker</Text>
              </View>
            </TouchableHighlight>
          </View>
        </View>

        <View style={styles.selfView}>
          <EnxRoom
            token={token}
            eventHandlers={roomEventHandlers}
            localInfo={localStreamInfo}
            roomInfo={enxRoomInfo}>
            {isConnected ? (
              <EnxStream
                style={{}}
                eventHandlers={streamEventHandlers}
              />
            ) : (
              <View></View>
            )}
          </EnxRoom>
        </View>
      </View>
    );
  }, [route.params, navigation, _onPressMute, _onPressDisconnect, _onPressSpeaker, audioMuteUnmuteImage, roomEventHandlers, localStreamInfo, enxRoomInfo, streamEventHandlers, isConnected]);

  const renderVideoCall = useCallback(() => {
    const token = route.params ? route.params.token : '';

    return (
      <View style={styles.container}>
        <View style={{flex: 1}} onLayout={_onLayout}>
          {activeTalkerStreams.length > 0 ? (
            activeTalkerStreams.length < 3 ? (
              <FlatList
                key={'_'}
                data={activeTalkerStreams}
                contentContainerStyle={styles.flexList}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
                numColumns={calculateColoum(activeTalkerStreams)}
              />
            ) : (
              <FlatList
                key={'_'}
                data={activeTalkerStreams}
                contentContainerStyle={styles.flexList}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
                numColumns={calculateColoum(activeTalkerStreams)}
              />
            )
          ) : null}
          <View style={styles.selfView}>
            <EnxRoom
              token={token}
              eventHandlers={roomEventHandlers}
              localInfo={localStreamInfo}
              roomInfo={enxRoomInfo}>
              {isConnected ? (
                <EnxStream
                  style={{}}
                  eventHandlers={streamEventHandlers}
                />
              ) : (
                <View></View>
              )}
            </EnxRoom>
          </View>
          <View style={styles.bottomBar}>
            <View style={styles.rowContainer}>
              <TouchableHighlight
                underlayColor="transparent"
                onPress={_onPressMute}>
                <Image
                  source={audioMuteUnmuteImage}
                  style={styles.inlineImg1}
                />
              </TouchableHighlight>
              <TouchableHighlight
                underlayColor="transparent"
                onPress={_onPressVideoMute}>
                <Image
                  source={videoMuteUnmuteImage}
                  style={styles.inlineImg1}
                />
              </TouchableHighlight>
              <TouchableHighlight
                underlayColor="transparent"
                onPress={_onPressSwitchCamera}>
                <Image
                  source={rotateCameraImage}
                  style={styles.inlineImg1}
                />
              </TouchableHighlight>
              <TouchableHighlight
                underlayColor="transparent"
                onPress={_onPressDisconnect}>
                <Image
                  source={require('../image_asset/disconnect.png')}
                  style={styles.inlineImg1}
                />
              </TouchableHighlight>
            </View>
          </View>
        </View>
      </View>
    );
  }, [route.params, _onLayout, activeTalkerStreams, renderItem, roomEventHandlers, localStreamInfo, enxRoomInfo, isConnected, streamEventHandlers, _onPressMute, _onPressVideoMute, _onPressSwitchCamera, _onPressDisconnect, audioMuteUnmuteImage, videoMuteUnmuteImage, rotateCameraImage]);

  const render = useCallback(() => {
    if (callType === 'audio') {
      return renderAudioCall();
    } else {
      return renderVideoCall();
    }
  }, [callType, renderAudioCall, renderVideoCall]);

  return render();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0B05',
    justifyContent: 'center',
  },
  flexList: {
    flexDirection: 'column',
    flexWrap: 'wrap',
  },
  toolBarView: {
    height: 70,
    backgroundColor: '#0A0A0A',
  },
  toolBar: {
    height: 70,
    backgroundColor: '#0A0A0A',
  },
  logo: {
    marginBottom: 40,
  },
  inputContainer: {
    paddingTop: 15,
  },
  input: {
    marginBottom: 20,
  },
  btnContainer: {
    marginTop: 10,
  },
  selfView: {
    position: 'absolute',
    width: 110,
    height: 150,
    top: 40,
    right: 15,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: COLORS.AstroSoftOrange,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineImg: {
    width: 40,
    alignSelf: 'center',
    height: 40,
    zIndex: 50,
    top: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    height: 65,
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: 35,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.AstroSoftOrange,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  inlineImg1: {
    width: 28,
    height: 28,
    alignSelf: 'center',
    tintColor: COLORS.AstroSoftOrange,
  },
  // Audio call styles
  backgroundContainer: {
    flex: 1,
    height: '100%',
    width: '100%',
    position: 'absolute',
  },
  userImage: {
    height: '100%',
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  header: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: Platform.OS === 'ios' ? 100 : 80,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  centerBox: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  rightPlaceholder: {
    width: 40,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarWrapper: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  userInfoContainer: {
    alignItems: 'center',
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  userDetails: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 20,
  },
  callStatus: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    padding: 15,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: 70,
  },
  controlContent: {
    alignItems: 'center',
  },
  controlIcon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
    marginBottom: 5,
  },
  controlText: {
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 4,
  },
  endCallButton: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 30,
    backgroundColor: '#f20713',
    minWidth: 80,
  },
  endCallIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  endCallText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default EnxScreenVoice;