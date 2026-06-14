import React, {useState, useEffect} from 'react';
import {View, Text, ActivityIndicator} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createDrawerNavigator} from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import Registration from '../screens/Registration';
import Login from '../screens/Login/Login';
import OtpScreen from '../screens/OtpScreen/OtpScreen';
import EmailOtpScreen from '../screens/OtpScreen/EmailOtpScreen';
import Thankyou from '../screens/Thankyou';
import CustomDrawer from './CustomDrawer';
import Bottom from '../screens/Bottom/Bottom';
import CustomHeader from './CustomHeader';
import HomeScreen from '../screens/Home/HomeScreen';
import Dashboard from '../screens/Drawer/Dashboard';
import ChatHistory from '../screens/Drawer/ChatHistory';
import MyCustomers from '../screens/Drawer/MyCustomers';
import DetailedChat from '../screens/Drawer/DetailedChat';
import AstrologersListScreen from '../screens/AstrologersScreen';
import EnxJoinScreen from '../utils/EnxJoinScreen';
import EnxConferenceScreen from '../utils/EnxConferenceScreen';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import VideoCall from '../screens/VideoCall';
import AudioCall from '../screens/AudioCall';
import Profile from '../screens/Profile/Profile';
import EditProfile from '../screens/Profile/EditProfile';
import Notification from '../screens/Notification/Notification';
import Appointments from '../screens/Home/Appointments';
import Consultation from '../screens/Home/Consultation';
import Wallet from '../screens/Home/Report';
import MobileOtpScreen from '../screens/OtpScreen/MobileOtpScreen';
import Registration from '../screens/Registration';
import ProfileViewScreen from '../screens/Login/ProfileViewScreen';
import Chat from '../screens/Chat/Chat';
import VoiceCallScreen from '../screens/Video/VoiceCallScreen';
import JoinRoom from '../utils/JoinRoom';
import RealChat from '../screens/Chat/RealChat';
import ChatHistoryTwo from '../screens/Drawer/ChatHistoryTwo';
import Register from '../screens/Register/Register';
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
function NavigationScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);
  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      setUserToken(token);
    } catch (error) {
      console.log('Error checking token:', error);
    } finally {
      setIsLoading(false);
    }
  };
  if (isLoading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={userToken ? 'DrawerNavigator' : 'Login'}>
        <Stack.Screen
          options={{headerShown: false}}
          name="Login"
          component={Login}
        />
        <Stack.Screen
          options={{
            title: 'Verify ',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
              fontWeight: 'bold',
            },
          }}
          name="OtpScreen"
          component={OtpScreen}
        />
        <Stack.Screen
          options={{
            title: 'Verify Email',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
              fontWeight: 'bold',
            },
          }}
          name="EmailOtpScreen"
          component={EmailOtpScreen}
        />
       <Stack.Screen
          options={{headerShown: false}}
          name="DrawerNavigator"
          component={DrawerNavigator}
        /> 
        <Stack.Screen
          options={{headerShown: false}}
          name="ProfileViewScreen"
          component={ProfileViewScreen}
        />
        <Stack.Screen
          options={{
            title: 'Counsellor Registration',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
              fontWeight: 'bold',
            },
          }}
          name="Registration"
          component={Registration}
        />
        <Stack.Screen
          options={{
            title: 'Thank you',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
              fontWeight: 'bold',
            },
          }}
          name="Thankyou"
          component={Thankyou}
        />
        <Stack.Screen
          name="Dashboard"
          component={Dashboard}
          options={({route}) => ({
            title: 'Dashboard',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
            },
          })}
        />
        <Stack.Screen
          name="ChatHistory"
          component={ChatHistory}
          options={({route}) => ({
            title: 'Chat History',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
            },
          })}
        />
         <Stack.Screen
          name="ChatHistoryTwo"
          component={ChatHistoryTwo}
          options={({route}) => ({
            title: 'Chat History',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
            },
          })}
        />
        <Stack.Screen
          name="MyCustomers"
          component={MyCustomers}
          options={({route}) => ({
            title: 'My Customers',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
            },
          })}
        />
        <Stack.Screen
          name="DetailedChat"
          component={DetailedChat}
          options={({route}) => ({
            title: 'Chat Summary',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
            },
          })}
        />
        <Stack.Screen
          name="AstrologerScreen"
          component={AstrologersListScreen}
          options={({route}) => ({
            title: 'Customer Details',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(16),
            },
          })}
        />
        <Stack.Screen
          name="VideoCall"
          component={VideoCall}
          options={({route}) => ({
            headerShown: false,
          })}
        />
        <Stack.Screen
          name="Profile"
          component={Profile}
          options={({route}) => ({
            headerShown: true,
          })}
        />
              <Stack.Screen
          name="Register"
          component={Register}
          options={({route}) => ({
            headerShown: true,
          })}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfile}
          options={({route}) => ({
            headerShown: true,
          })}
        />
        <Stack.Screen
          name="AudioCall"
          component={AudioCall}
          options={({route}) => ({
            headerShown: false,
          })}
        />
         <Stack.Screen
          name="Chat"
          component={Chat}
          options={({route}) => ({
            headerShown: false,
          })}
        />
        <Stack.Screen
          name="Notification"
          component={Notification}
          options={({route}) => ({
            headerShown: true,
          })}
        />
        <Stack.Screen
          name="MobileOtpScreen"
          component={MobileOtpScreen}
          options={({route}) => ({
            headerShown: true,
          })}
        />
        <Stack.Screen
          name="Wallet"
          component={Wallet}
          options={({route}) => ({
            headerShown: true,
          })}
        />
        <Stack.Screen
          name="Appointments"
          component={Appointments}
          options={({route}) => ({
            headerShown: true,
          })}
        />
        <Stack.Screen
          name="Consultation"
          component={Consultation}
          options={({route}) => ({
            headerShown: true,
          })}
        />
              <Stack.Screen name="EnxJoinScreen" component={EnxJoinScreen} />
              <Stack.Screen name="EnxConferenceScreen" component={EnxConferenceScreen} />
              <Stack.Screen name="VoiceCallScreen" component={VoiceCallScreen} />
              <Stack.Screen name="JoinRoom" component={JoinRoom} />
              <Stack.Screen  options={({route}) => ({
            headerShown: false,
          })} name="RealChat" component={RealChat} />




              
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function DrawerNavigator({navigation}) {
  return (
    <Drawer.Navigator
      drawerContent={props => <CustomDrawer {...props} />}
      screenOptions={{headerShown: false}}>
      <Drawer.Screen
        name="HomeStack"
        component={HomeStack}
        options={{headerShown: false}}
      />
    </Drawer.Navigator>
  );
}

function HomeStack({navigation}) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{
          header: () => <CustomHeader title="QuikSeek" />,
        }}
      />
    </Stack.Navigator>
  );
}

export default NavigationScreen;
