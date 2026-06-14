import {StyleSheet, Text, View, Image} from 'react-native';
import React, {version} from 'react';
import SessionDetails from '../component/SessionDetails';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const ChatSession = ({navigation}) => {
  const sessionData = {
    referenceId: 'O5HJTizENaYSwTtDEvG',
    name: 'Meenakshik',
    chatType: 'Free Session',
    time: 'Aug 27, 2024, 11:02 AM',
    rate: '45.0',
    duration: '1',
    deduction: '0',
    image:
      'https://th.bing.com/th/id/OIP.6VsfIq35PtqvwJQQHsHqgAHaF6?w=229&h=183&c=7&r=0&o=5&pid=1.7', // Replace with actual image URL
  };
  const hasSessionData = sessionData && Object.keys(sessionData).length > 0;
  const handleProfile = session => {
    navigation.navigate('AstrologerProfile', {person: session});
  };
  return (
    <View>
      {hasSessionData ? (
        <SessionDetails session={sessionData} handleprofile={handleProfile} />
      ) : (
        <View style={styles.noSessionContainer}>
          <Text style={styles.noSessionText}>
            Nothing found here, you have not chatted with our Astrologers
          </Text>
        </View>
      )}
    </View>
  );
};
export default ChatSession;
const styles = StyleSheet.create({
  noSessionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(500),
  },
  noSessionText: {
    fontSize: moderateScale(15),
    color: '#000',
    textAlign: 'center',
  },
});
