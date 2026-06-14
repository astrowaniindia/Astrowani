import { View, Text, StyleSheet, Image } from 'react-native'
import React from 'react'
// @ts-ignore
import { ZegoUIKitPrebuiltCall, ONE_ON_ONE_VIDEO_CALL_CONFIG } from '@zegocloud/zego-uikit-prebuilt-call-rn'
import { useNavigation } from '@react-navigation/native'

const AudioCall = () => {
  const navigation = useNavigation()
  return (
    <View style={styles.container}>
      <ZegoUIKitPrebuiltCall
        appID={85994579}
        appSign={'f87a4bb3598d9718d517e14b956045d6e5b3949bf97800781400b33ec0f18dfa'}
        userID={'user1'} // userID can be something like a phone number or the user id on your own user system. 
        userName={'user1'}
        callID={'testCallAudioId1'} // callID can be any unique string. 

        config={{
          // You can also use ONE_ON_ONE_VOICE_CALL_CONFIG/GROUP_VIDEO_CALL_CONFIG/GROUP_VOICE_CALL_CONFIG to make more types of calls.
          ...ONE_ON_ONE_VIDEO_CALL_CONFIG,
          onCallEnd: (callID, reason, duration) => {
            navigation.goBack()
          },
          avatarBuilder: ({userInfo}) => {
            return <View style={{width: '100%', height: '100%'}}>
             <Image
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              source={{ uri: `https://cdn5.vectorstock.com/i/1000x1000/82/34/call-center-agent-avatar-character-vector-19078234.jpg` }}
              />
            </View>
          },
          turnOnCameraWhenJoining: false,
          turnOnMicrophoneWhenJoining: false,
          useSpeakerWhenJoining: true,
        }}
      />
    </View>
  )
}

export default AudioCall

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
});