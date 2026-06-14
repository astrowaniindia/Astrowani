import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  StyleSheet,
  Text,
  Alert,
  TouchableHighlight,
  View,
  Image,
  StatusBar,
  BackHandler,
  Platform,
  Animated,
  Easing,
} from 'react-native';

import {EnxRoom, Enx, EnxStream} from 'enx-rtc-react-native';
import axios from 'axios';
import messaging from '@react-native-firebase/messaging';
import {HEIGHT, WIDTH} from '../common/consts/config';
import VectorIcon from '../../common/component/VectorIcon';
// import {BASE_URL} from '../Api/Url';
// import {END_CALL} from '../Api/baseUrl';
import {CustomToast} from '../../common/component/CustomToast';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import color from '../../common/consts/color';
// import { scaleWidth } from '../../common/consts/size';
const VoiceCallScreen = ({route, navigation}: any) => {
  // Extract route params with defaults
  const {
    token = '',
    username = '',
    userToken = '',
    recieverName = '',
    recieverAge = '',
    recieverDistance = '',
    recieverImage = '',
    sessionId = '',
    receiverId = '',
    isIncoming = false, // New param to distinguish incoming calls
  } = route.params || {};
  // State management
  const [audioMuted, setAudioMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [localStreamId, setLocalStreamId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callAcceptanceDuration, setCallAcceptanceDuration] = useState(30);
  const [isCallAccepted, setIsCallAccepted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showIncomingCallUI, setShowIncomingCallUI] = useState(isIncoming); // Show accept/reject for incoming calls

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const acceptanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backHandlerRef = useRef<any>(null);
  const messageSubscriptions = useRef<any[]>([]);
  const roomRef = useRef<any>(null);
  const callDurationRef = useRef(callDuration);

  // Update the ref whenever callDuration changes
  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

  // Stream and room configuration
  const localStreamInfo = useMemo(
    () => ({
      audio: true,
      video: false,
      data: true,
      audioMuted: false,
      name: 'React Native',
      audio_only: true,
    }),
    [],
  );

  const enxRoomInfo = useMemo(
    () => ({
      allow_reconnect: false,
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
    }),
    [],
  );

  // Animation functions
  const startPulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  const startRingAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [ringAnim]);

  const stopAnimations = useCallback(() => {
    pulseAnim.stopAnimation();
    ringAnim.stopAnimation();
  }, [pulseAnim, ringAnim]);

  // Format time display
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }, []);

  // Timer management
  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAcceptanceTimer = useCallback(() => {
    stopAcceptanceTimer();

    acceptanceTimerRef.current = setInterval(() => {
      setCallAcceptanceDuration(prev => {
        if (prev <= 1) {
          stopAcceptanceTimer();
          if (!isCallAccepted) {
            handleCallNotAnswered();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isCallAccepted]);

  const stopAcceptanceTimer = useCallback(() => {
    if (acceptanceTimerRef.current) {
      clearInterval(acceptanceTimerRef.current);
      acceptanceTimerRef.current = null;
    }
  }, []);

  const handleCallNotAnswered = useCallback(() => {
    onPressDisconnect();
    CustomToast({
      type: 'error',
      title: 'Call not answered!',
      message: `${recieverName} did not accept your call`,
    });
  }, [recieverName]);

  // Accept call API
  const doAcceptCall = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await axios({
        url: `http://10.0.2.2:4500/api/call/accept-call`,
        method: 'POST',
        data: {
          receiverId,
          sessionId,
          duration: 0,
          rating: 5,
          feedback: 'Call accepted',
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('Accept call API response:', response.data);
      setShowIncomingCallUI(false); // Hide incoming call UI after accepting
      setIsCallAccepted(true);
      startTimer();
    } catch (error) {
      console.log('Accept call API error:', error);
    }
  }, [receiverId, sessionId, startTimer]);

  // Reject call API
  const doRejectCall = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await axios({
        url: `http://10.0.2.2:4500/api/call/reject-call`,
        method: 'POST',
        data: {
          sessionId,
          reason: 'User rejected the call',
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('Reject call API response:', response.data);
      cleanup(); // Disconnect after rejecting
      navigation.replace('DrawerNavigator');
    } catch (error) {
      console.log('Reject call API error:', error);
      cleanup();
      navigation.replace('DrawerNavigator');
    }
  }, [sessionId, navigation]);

  // End call API
  const doEndCall = useCallback(async () => {
    const durationInMinutes = Math.ceil(callDurationRef.current / 60);
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await axios({
        url: `http://10.0.2.2:4500/api/call/end`,
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
        navigation.replace('DrawerNavigator');
      }
    } catch (error) {
      console.log('End call API error:', error);
      navigation.replace('DrawerNavigator');
    }
  }, [callDuration, navigation, sessionId, userToken]);

  // Event handlers
  const roomEventHandlers = useMemo(
    () => ({
      roomConnected: (event: any) => {
        console.log('roomConnected', event);
        setIsConnected(true);
        Enx.getLocalStreamId((status: any) => {
          setLocalStreamId(status);
        });
        Enx.publish();
        startAcceptanceTimer();
        if (!isCallAccepted) {
          startPulseAnimation();
          startRingAnimation();
        }
      },
      roomError: (event: any) => {
        console.log('roomError', event);
        if (event.msg === 'Network disconnected') {
          doEndCall();
        }
      },
      streamPublished: (event: any) => {
        console.log('streamPublished', event);
      },
      streamAdded: (event: any) => {
        console.log('streamAdded', event);
        Enx.subscribe(event.streamId, (status: any) => {
          console.log('Subscription status:', status);
        });
      },
      activeTalkerList: (event: any) => {
        console.log('Active Talker List event:', event);
        if (event.length > 0 && !isCallAccepted) {
          setIsCallAccepted(true);
          doAcceptCall();
          stopAcceptanceTimer();
          stopAnimations();
          startTimer();
        }
      },
      roomDisconnected: (event: any) => {
        console.log('roomDisconnected', event);
        cleanup();
        doEndCall();
      },
      userDisconnected: (event: any) => {
        console.log('userDisconnected', event);
        cleanup();
        doEndCall();
      },
    }),
    [
      navigation,
      startAcceptanceTimer,
      stopAcceptanceTimer,
      startTimer,
      isCallAccepted,
      startPulseAnimation,
      startRingAnimation,
      stopAnimations,
      doEndCall,
      doAcceptCall,
    ],
  );

  const streamEventHandlers = useMemo(
    () => ({
      audioEvent: (event: any) => {
        if (event.result === '0') {
          const isMuted = event.msg === 'Audio Off';
          setAudioMuted(isMuted);
        }
      },
    }),
    [],
  );

  // Call controls
  const toggleMute = useCallback(() => {
    if (localStreamId) {
      Enx.muteSelfAudio(localStreamId, !audioMuted);
    }
  }, [localStreamId, audioMuted]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn(!speakerOn);
  }, [speakerOn]);

  const onPressDisconnect = useCallback(() => {
    if (isConnected) {
      Enx.disconnect();
    } else {
      cleanup();
      navigation.replace('DrawerNavigator');
    }
  }, [isConnected, navigation]);

  // Handle accept call for incoming calls
  const handleAcceptCall = useCallback(() => {
    doAcceptCall();
  }, [doAcceptCall]);

  // Handle reject call for incoming calls
  const handleRejectCall = useCallback(() => {
    doRejectCall();
  }, [doRejectCall]);

  // Handle back button
  const handleBackButton = useCallback(() => {
    Alert.alert(
      'Exit Call',
      'Are you sure you want to end the call?',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'End Call', onPress: onPressDisconnect},
      ],
      {cancelable: false},
    );
    return true;
  }, [onPressDisconnect]);

  // Handle remote messages
  const handleRemoteMessage = useCallback(
    (remoteMessage: any) => {
      if (!remoteMessage?.data) return;

      const {type, sessionId: messageSessionId} = remoteMessage.data;

      if (type === 'call_ended' && messageSessionId === sessionId) {
        CustomToast({
          type: 'error',
          title: 'Call Rejected',
          message: `${recieverName} rejected your call.`,
        });
        onPressDisconnect();
      }
    },
    [recieverName, sessionId, onPressDisconnect],
  );

  // Cleanup function
  const cleanup = useCallback(() => {
    stopTimer();
    stopAcceptanceTimer();
    stopAnimations();
    if (backHandlerRef.current) {
      backHandlerRef.current.remove();
    }
    messageSubscriptions.current.forEach(sub => sub());
    messageSubscriptions.current = [];
    setAudioMuted(false);
    setSpeakerOn(false);
    setIsConnected(false);
    setCallDuration(0);
    setCallAcceptanceDuration(30);
    setIsCallAccepted(false);
  }, [stopTimer, stopAcceptanceTimer, stopAnimations]);

  // Initialize room and set up listeners
  useEffect(() => {
    const initRoom = async () => {
      try {
        await Enx.initRoom();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize room:', error);
        navigation.goBack();
      }
    };
    initRoom();

    backHandlerRef.current = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButton,
    );

    const foregroundUnsubscribe = messaging().onMessage(handleRemoteMessage);
    const backgroundUnsubscribe =
      messaging().onNotificationOpenedApp(handleRemoteMessage);

    messageSubscriptions.current.push(
      foregroundUnsubscribe,
      backgroundUnsubscribe,
    );

    messaging().getInitialNotification().then(handleRemoteMessage);

    return cleanup;
  }, [handleBackButton, handleRemoteMessage, cleanup, navigation]);

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Initializing call...</Text>
      </View>
    );
  }

  // Ring animation interpolation
  const ringInterpolation = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor={'transparent'}
        barStyle={'light-content'}
      />

      {/* Background with blur effect */}
      <View style={styles.backgroundContainer}>
        <Image
          source={{
            uri:
              recieverImage ||
              'https://cdn-icons-png.flaticon.com/128/1077/1077012.png',
          }}
          style={styles.userImage}
          blurRadius={isCallAccepted ? 5 : 10}
        />

        {/* Dark overlay */}
        <View style={styles.overlay} />
      </View>

      {/* Incoming Call UI */}
      {showIncomingCallUI && (
        <View style={styles.incomingCallOverlay}>
          <View style={styles.incomingCallContainer}>
            <Text style={styles.incomingCallTitle}>Incoming Call</Text>
            <Text style={styles.incomingCallerName}>{recieverName}</Text>
            <View style={styles.incomingCallButtons}>
              <TouchableHighlight
                style={styles.rejectButton}
                underlayColor={color.reddeep}
                onPress={handleRejectCall}>
                <View style={styles.buttonContent}>
                  <VectorIcon
                    name="phone-hangup"
                    type="MaterialCommunityIcons"
                    size={24}
                    color={color.white}
                  />
                  <Text style={styles.buttonText}>Reject</Text>
                </View>
              </TouchableHighlight>
              <TouchableHighlight
                style={styles.acceptButton}
                underlayColor={color.green}
                onPress={handleAcceptCall}>
                <View style={styles.buttonContent}>
                  <VectorIcon
                    name="phone"
                    type="MaterialIcons"
                    size={24}
                    color={color.white}
                  />
                  <Text style={styles.buttonText}>Accept</Text>
                </View>
              </TouchableHighlight>
            </View>
          </View>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableHighlight
          underlayColor="rgba(255,255,255,0.1)"
          onPress={onPressDisconnect}
          style={styles.backButton}>
          <VectorIcon
            name="arrow-back"
            type="Ionicons"
            size={24}
            color={color.white}
          />
        </TouchableHighlight>

        <View style={styles.centerBox}>
          <Text style={styles.statusText}>
            {isCallAccepted ? 'In Call' : 'Calling...'}
          </Text>
        </View>

        <View style={styles.rightPlaceholder} />
      </View>

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {/* User Avatar with Animation */}
        <View style={styles.avatarContainer}>
          {!isCallAccepted && (
            <Animated.View
              style={[
                styles.ring,
                {
                  transform: [{scale: ringInterpolation}],
                  opacity: ringAnim,
                },
              ]}
            />
          )}

          <Animated.View
            style={[
              styles.avatarWrapper,
              {
                transform: [{scale: isCallAccepted ? 1 : pulseAnim}],
              },
            ]}>
            <Image
              source={{
                uri:
                  recieverImage ||
                  'https://cdn-icons-png.flaticon.com/128/1077/1077012.png',
              }}
              style={styles.avatar}
            />
          </Animated.View>
        </View>

        {/* User Info */}
        <View style={styles.userInfoContainer}>
          <Text style={styles.userName}>{recieverName}</Text>
          {recieverAge && (
            <Text style={styles.userDetails}>
              {recieverAge} years • {recieverDistance} away
            </Text>
          )}
          <Text style={styles.callStatus}>
            {isCallAccepted
              ? formatTime(callDuration)
              : `Ringing... ${callAcceptanceDuration}s`}
          </Text>
        </View>
      </View>

      {/* Enx Room Component */}
      <EnxRoom
        ref={roomRef}
        token={token}
        eventHandlers={roomEventHandlers}
        localInfo={localStreamInfo}
        roomInfo={enxRoomInfo}>
        <EnxStream key="stream" eventHandlers={streamEventHandlers} />
      </EnxRoom>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.controlRow}>
          {/* Speaker Button */}
          <TouchableHighlight
            style={[
              styles.controlButton,
              speakerOn && styles.controlButtonActive,
            ]}
            underlayColor="rgba(255,255,255,0.2)"
            onPress={toggleSpeaker}>
            <View style={styles.controlContent}>
              <Image
                source={
                  speakerOn
                    ? require('../../image_asset/speaker.png')
                    : require('../../image_asset/speaker.png')
                }
                style={styles.controlIcon}
              />
              <Text style={styles.controlText}>
                {speakerOn ? 'Speaker' : 'Speaker'}
              </Text>
            </View>
          </TouchableHighlight>

          {/* Mute Button */}
          <TouchableHighlight
            style={[
              styles.controlButton,
              audioMuted && styles.controlButtonActive,
            ]}
            underlayColor="rgba(255,255,255,0.2)"
            onPress={toggleMute}>
            <View style={styles.controlContent}>
              <Image
                source={
                  audioMuted
                    ? require('../../image_asset/mute.png')
                    : require('../../image_asset/unmute.png')
                }
                style={styles.controlIcon}
              />
              <Text style={styles.controlText}>
                {audioMuted ? 'Muted' : 'Mute'}
              </Text>
            </View>
          </TouchableHighlight>

          {/* End Call Button */}
          <TouchableHighlight
            style={styles.endCallButton}
            underlayColor={color.reddeep}
            onPress={onPressDisconnect}>
            <View style={styles.controlContent}>
              <View style={styles.endCallIcon}>
                <VectorIcon
                  name="phone-hangup"
                  type="MaterialCommunityIcons"
                  size={24}
                  color={color.white}
                />
              </View>
              <Text style={styles.endCallText}>End Call</Text>
            </View>
          </TouchableHighlight>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.black,
  },
  incomingCallOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  incomingCallContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 31,
    alignItems: 'center',
    minWidth: 300,
  },
  incomingCallTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: color.white,
    marginBottom: 10,
  },
  incomingCallerName: {
    fontSize: 20,
    color: color.white,
    marginBottom: 30,
  },
  incomingCallButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  rejectButton: {
    backgroundColor: color.reddeep,
    borderRadius: 50,
    padding: 15,
    marginHorizontal: 10,
  },
  acceptButton: {
    backgroundColor: color.green || '#34C759',
    borderRadius: 50,
    padding: 15,
    marginHorizontal: 10,
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonText: {
    color: color.white,
    fontSize: 14,
    marginTop: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.black,
  },
  loadingText: {
    color: color.white,
    fontSize: 18,
  },
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
    color: color.white,
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
    color: color.white,
    marginBottom: 8,
  },
  userDetails: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 20,
  },
  callStatus: {
    fontSize: 18,
    color: color.white,
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
  controlButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  controlContent: {
    alignItems: 'center',
  },
  controlIcon: {
    width: 24,
    height: 24,
    tintColor: color.white,
    marginBottom: 5,
  },
  controlText: {
    fontSize: 12,
    color: color.white,
    marginTop: 4,
  },
  endCallButton: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 30,
    backgroundColor: color.reddeep,
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
    color: color.white,
    fontWeight: '600',
  },
});

export default VoiceCallScreen;
