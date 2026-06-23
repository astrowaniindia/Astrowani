import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Registration from '../screens/Registration';
import Login from '../screens/Login/Login';
import OtpScreen from '../screens/OtpScreen/OtpScreen';
import EmailOtpScreen from '../screens/OtpScreen/EmailOtpScreen';
import Thankyou from '../screens/Thankyou';
import PendingApproval from '../screens/PendingApproval';
import { supabase } from '../api/SupabaseClient';
import CustomDrawer from './CustomDrawer';
import Bottom from '../screens/Bottom/Bottom';
import CustomHeader from './CustomHeader';
import HomeScreen from '../screens/Home/HomeScreen';
import Dashboard from '../screens/Drawer/Dashboard';
import ChatHistory from '../screens/Drawer/ChatHistory';
import LiveCallHistory from '../screens/HIstory/LiveCallHistory';
import VideoCallHistory from '../screens/HIstory/VideoCallHistory';
import MyCustomers from '../screens/Drawer/MyCustomers';
import DetailedChat from '../screens/Drawer/DetailedChat';
import AstrologersListScreen from '../screens/AstrologersScreen';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import VideoCall from '../screens/VideoCall';
import AudioCall from '../screens/AudioCall';
import GoLiveScreen from '../screens/GoLive/GoLiveScreen';
import Profile from '../screens/Profile/Profile';
import EditProfile from '../screens/Profile/EditProfile';
import Notification from '../screens/Notification/Notification';
import Appointments from '../screens/Home/Appointments';
import Consultation from '../screens/Home/Consultation';
import Wallet from '../screens/Home/Report';
import Chat from '../Chating/Chat';
import EnxScreenVoice from '../utils/EnxScreenVoice';
import Support from '../screens/Support';
import CallHistory from '../screens/HIstory/CallHistory';
import ChatHistorys from '../screens/HIstory/ChatHiostory';
import SessionHistory from '../screens/HIstory/SessionHistory';
import MissedSessions from '../screens/HIstory/MissedSessions';
import TodayEarning from '../screens/Earning/TodayEarning';
import TotalEarning from '../screens/Earning/TotalEarning';
import RatingReview from '../screens/Review/RatingReview';
import VendorChatSession from '../screens/VendorChatSession';
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function NavigationScreen() {
  const [isLoading, setIsLoading] = useState(true);
  // Resolved landing route: 'Login' | 'PendingApproval' | 'DrawerNavigator'
  const [initialRoute, setInitialRoute] = useState('Login');

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setInitialRoute('Login');
        return;
      }
      // TEMPORARY: approval gate removed — go straight to dashboard
      setInitialRoute('DrawerNavigator');
    } catch (error) {
      console.log('Error checking token:', error);
      setInitialRoute('Login');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen
          options={{ headerShown: false }}
          name="Login"
          component={Login}
        />
        <Stack.Screen
          options={{ headerShown: false }}
          name="PendingApproval"
          component={PendingApproval}
        />
        <Stack.Screen
          options={{
            title: 'Verify ',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
          name="OtpScreen"
          component={OtpScreen}
        />
        <Stack.Screen
          options={{
            title: 'Verify Email',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
          name="EmailOtpScreen"
          component={EmailOtpScreen}
        />
        <Stack.Screen
          options={{ headerShown: false }}
          name="DrawerNavigator"
          component={DrawerNavigator}
        />
        <Stack.Screen
          options={{ headerShown: false }}
          name="Support"
          component={Support}
        />
        {/* <Stack.Screen
          options={{headerShown: false}}
          name="ChatHistory"
          component={ChatHistorys}
        /> */}
        <Stack.Screen
          name="CallHistory"
          component={CallHistory}
          options={{
            title: 'Call History',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          }}
        />
        <Stack.Screen
          name="SessionHistory"
          component={SessionHistory}
          options={{
            title: 'Session History',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
        />
        <Stack.Screen
          name="MissedSessions"
          component={MissedSessions}
          options={{
            title: 'Missed Sessions',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
        />
        <Stack.Screen
          options={{
            title: 'Astrologer Registration',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
          name="Registration"
          component={Registration}
        />
        <Stack.Screen
          options={{
            title: 'Thank you',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
          name="Thankyou"
          component={Thankyou}
        />
        <Stack.Screen
          name="Dashboard"
          component={Dashboard}
          options={({ route }) => ({
            title: 'Dashboard',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="ChatHistory"
          component={ChatHistory}
          options={({ route }) => ({
            title: 'Chat History',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        
        <Stack.Screen
          name="LiveCallHistory"
          component={LiveCallHistory}
          options={({ route }) => ({
            title: 'Live Call History',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />

        <Stack.Screen
          name="VideoCallHistory"
          component={VideoCallHistory}
          options={({ route }) => ({
            title: 'Video Call History',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        
        <Stack.Screen
          name="MyCustomers"
          component={MyCustomers}
          options={({ route }) => ({
            title: 'My Customers',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="DetailedChat"
          component={DetailedChat}
          options={({ route }) => ({
            title: 'Chat Summary',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="AstrologerScreen"
          component={AstrologersListScreen}
          options={({ route }) => ({
            title: 'Astrologer Details',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="VideoCall"
          component={VideoCall}
          options={({ route }) => ({ headerShown: false })}
        />
        <Stack.Screen
          name="GoLiveScreen"
          component={GoLiveScreen}
          options={({ route }) => ({ headerShown: false })}
        />
        <Stack.Screen
          name="Profile"
          component={Profile}
          options={({ route }) => ({ headerShown: true })}
        />
          <Stack.Screen
          name="TodayEarning"
          component={TodayEarning}
          options={({ route }) => ({ headerShown: true })}
        />
              <Stack.Screen
          name="RatingReview"
          component={RatingReview}
          options={({ route }) => ({ headerShown: true })}
        />
           <Stack.Screen
          name="TotalEarning"
          component={TotalEarning}
          options={({ route }) => ({ headerShown: true })}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfile}
          options={({ route }) => ({ headerShown: true })}
        />
        <Stack.Screen
          name="AudioCall"
          component={AudioCall}
          options={({ route }) => ({ headerShown: false })}
        />
        <Stack.Screen
          name="Notification"
          component={Notification}
          options={({ route }) => ({ headerShown: true })}
        />
        <Stack.Screen
          name="Wallet"
          component={Wallet}
          options={{ headerShown: true, title: 'My Wallet', headerStyle: { backgroundColor: COLORS.AstroMaroon }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="VendorChatSession"
          component={VendorChatSession}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Appointments"
          component={Appointments}
          options={({ route }) => ({ headerShown: true })}
        />
        <Stack.Screen
          name="Chat"
          component={Chat}
          options={({ route }) => ({ headerShown: false })}
        />
        <Stack.Screen
          name="Consultation"
          component={Consultation}
          options={({ route }) => ({ headerShown: true })}
        />
        <Stack.Screen
          name="EnxScreenVoice"
          component={EnxScreenVoice}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function DrawerNavigator({ navigation }) {
  return (
    <Drawer.Navigator
      drawerContent={props => <CustomDrawer {...props} />}
      screenOptions={{ headerShown: false }}>
      <Drawer.Screen
        name="HomeStack"
        component={HomeStack}
        options={{ headerShown: false }}
      />
      <Drawer.Screen
        name="Wallet"
        component={Wallet}
        options={{ headerShown: true, title: 'Wallet' }}
      />
    </Drawer.Navigator>
  );
}

function HomeStack({ navigation }) {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen
          name="HomeScreen"
          component={HomeScreen}
          options={{
            header: () => <CustomHeader title="Astrowani" />,
          }}
        />
        <Stack.Screen
          name="Wallet"
          component={Wallet}
          options={{ headerShown: true, title: 'Wallet' }}
        />
      </Stack.Navigator>
  );
}

export default NavigationScreen;
