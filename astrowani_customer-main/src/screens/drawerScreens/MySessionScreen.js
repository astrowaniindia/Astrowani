import React, {useEffect} from 'react';
import {View, Text, ScrollView} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import {useNavigation, useRoute} from '@react-navigation/native';
import SessionDetails from '../component/SessionDetails';
import {moderateScale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';

const Tab = createMaterialTopTabNavigator();
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

const ChatSession = () => {
  return <SessionDetails session={sessionData} />;
};

const CallSession = () => {
  return <SessionDetails session={sessionData} />;
};

const VideoSession = () => {
  return <SessionDetails session={sessionData} />;
};

const MySessionsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  return (
    <Tab.Navigator
      initialRouteName="ChatSession"
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarLabelStyle: {
          fontSize: moderateScale(13),
          fontWeight: 'bold',
          textTransform: 'none',
        },
        tabBarIndicatorStyle: {
          backgroundColor: COLORS.AstroMaroon,
          height: verticalScale(3),
        },
        tabBarActiveTintColor: COLORS.AstroMaroon,
        tabBarInactiveTintColor: '#000',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderBottomWidth: verticalScale(1),
          borderBottomColor: '#ddd',
        },
        tabBarPressColor: COLORS.AstroSoftOrange,
      }}>
      <Tab.Screen
        name="ChatSession"
        component={ChatSession}
        options={{title: 'Chat Session'}}
      />
      <Tab.Screen
        name="CallSession"
        component={CallSession}
        options={{title: 'Call Session'}}
      />
      <Tab.Screen
        name="VideoSession"
        component={VideoSession}
        options={{title: 'Video Session'}}
      />
    </Tab.Navigator>
  );
};

export default MySessionsScreen;
