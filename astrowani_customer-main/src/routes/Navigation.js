import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { NavigationContainer } from '@react-navigation/native';
import Splash from '../screens/Splash/Splash';
import Login from '../screens/Login/Login';
import OtpScreen from '../screens/OtpScreen/OtpScreen';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import EmailOtpScreen from '../screens/OtpScreen/EmailOtpScreen';
import CustomHeader from './CustomHeader';
import Chat from '../screens/chat/Chat';
import CustomDrawerContent from './CustomDrawerContent'; // Your custom drawer content
import UserProfileScreen from '../screens/drawerScreens/UserProfileScreen';
import Video from '../screens/Video/Video';
import Call from '../screens/Call/Call';
import Live from '../screens/Live/Live';
import Remedies from '../screens/Remedies/Remedies';
import Icon from 'react-native-vector-icons/Ionicons';
import Wallet from '../screens/Home/Wallet/Wallet';
import History from '../screens/Home/Wallet/History';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import AstrologerInfo from '../screens/Home/AstrologerInfo';

import BlogList from '../screens/Home/BlogList';
import BlogScreen from '../screens/Home/BlogScreen';
import SearchScreen from '../screens/Home/SearchScreen';
import NotificationScreen from '../screens/Home/NotificationScreen';
import AddReview from '../screens/Home/AddReview';
import BookPujaScreen from '../screens/Remedies/BookPujaScreen';
import PujaDetails from '../screens/Remedies/PujaDetails';
import ChatIntakeForm from '../screens/component/ChatIntakeForm';
import MySessionScreen from '../screens/drawerScreens/MySessionScreen';
import ChatSession from '../screens/drawerScreens/ChatSession';
import CallSession from '../screens/drawerScreens/CallSession';
import VideoSession from '../screens/drawerScreens/VideoSession';
import MyPackages from '../screens/drawerScreens/MyPackages';
import FavoriteScreen from '../screens/drawerScreens/FavoriteScreen';
import FreeServicesScreen from '../screens/drawerScreens/FreeSeviceScreen/FreeServicesScreen';
import PanchangScreen from '../screens/drawerScreens/FreeSeviceScreen/PanchangScreen';
import JanamKundaliScreen from '../screens/drawerScreens/FreeSeviceScreen/JanamKundaliScreen';
import KundaliDetails from '../screens/drawerScreens/FreeSeviceScreen/KundaliDetails';
import KundaliMatchScreen from '../screens/drawerScreens/FreeSeviceScreen/KundaliMatchScreen';
import KundaliMatchingReport from '../screens/drawerScreens/FreeSeviceScreen/KundaliMatchingReport';
import Horoscope from '../screens/drawerScreens/FreeSeviceScreen/Horoscope';
import HoroscopeDetails from '../screens/drawerScreens/FreeSeviceScreen/HoroscopeDetails';
import ShubhMuhurat from '../screens/drawerScreens/FreeSeviceScreen/ShubhMuhurat';
import VrataUpvaas from '../screens/drawerScreens/FreeSeviceScreen/VrataUpvaas';
import Home from '../screens/Home/Home';
import ReferAndEarnScreen from '../screens/drawerScreens/ReferAndEarnScreen';
import Settings from '../screens/drawerScreens/Settings';
import AboutUsScreen from '../screens/drawerScreens/AboutUsScreen';
import FaqScreen from '../screens/drawerScreens/FaqScreen';
import SupportScreen from '../screens/drawerScreens/SupportScreen';
import RefundAndCancel from '../screens/drawerScreens/RefundAndCancel';
import PrivacyPolicy from '../screens/drawerScreens/PrivacyPolicy';
import TermsOfUse from '../screens/drawerScreens/TermsOfUse';
import PersonToPersonChat from '../screens/component/PersonToPersonChat';
// import GemstoneDetails from '../screens/Remedies/GemstoneDetails';
import GemstoneList from '../screens/Remedies/GemstoneList';
import KundaliMatchingReportDetails from '../screens/drawerScreens/FreeSeviceScreen/KundaliMatchingResultDetails';

// import AudioCall from '../screens/Call/AudioCall';
// import InCallScreen from '../screens/Call/InCallScreen';
// mport { ZegoUIKitPrebuiltCallFloatingMinimizedView } from '@zegocloud/zego-uikit-prebuilt-call-rn';
import VoiceCallScreen from '../screens/Video/VoiceCallScreen';
import JoinRoom from '../utils/JoinRoom';
import EnxJoinScreen from '../utils/EnxJoinScreen';
import EnxConferenceScreen from '../utils/EnxConferenceScreen';
import GemstoneDetails from '../screens/Home/GemStoneBuy';
import VipPuja from '../screens/Home/VipPuja';
import Register from '../screens/Register/Register';
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const TopTab = createMaterialTopTabNavigator();

export default function Navigation({ initialRoute }) {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen options={{ headerShown: false }} name="Splash" component={Splash} />
        <Stack.Screen options={{ headerShown: false }} name="Login" component={Login} />
        <Stack.Screen options={{ headerShown: false }} name="Register" component={Register} />

        <Stack.Screen options={{ title: 'Verify Phone', headerStyle: { backgroundColor: COLORS.AstroMaroon, }, headerTintColor: '#fff', headerTitleStyle: { fontSize: moderateScale(18), }, }} name="OtpScreen" component={OtpScreen} />
        <Stack.Screen options={{ title: 'Verify Email', headerStyle: { backgroundColor: COLORS.AstroMaroon, }, headerTintColor: '#fff', headerTitleStyle: { fontSize: moderateScale(18), }, }} name="EmailOtpScreen" component={EmailOtpScreen} />
        <Stack.Screen options={{ headerShown: false }} name="DrawerNavigator" component={DrawerNavigator} />

        <Stack.Screen name="UserProfileScreen" component={UserProfileScreen} options={{ title: 'Profile', headerBackTitleVisible: true, headerStyle: { backgroundColor: COLORS.AstroMaroon, }, headerTintColor: '#fff', headerTitleStyle: { fontSize: moderateScale(18), }, }} />

        <Stack.Screen name="AstrologerInfo" component={AstrologerInfo} options={({ route }) => ({ title: route.params?.person.name, headerStyle: { backgroundColor: COLORS.AstroMaroon, }, headerTintColor: '#fff', headerTitleStyle: { fontSize: moderateScale(18), }, tabBarStyle: { display: 'none' }, })} />
        <Stack.Screen name="AddReview" component={AddReview} options={{ title: 'Add Review', headerStyle: { backgroundColor: COLORS.AstroMaroon }, headerTintColor: '#fff' }} />
        <Stack.Screen name="Kundali Details" component={KundaliDetails} options={({ route }) => ({ title: 'Kundali Details', headerStyle: { backgroundColor: COLORS.AstroMaroon, }, headerTintColor: '#fff', headerTitleStyle: { fontSize: moderateScale(18), }, tabBarStyle: { display: 'none' }, })} />
        <Stack.Screen name="KundaliMatchScreen" component={KundaliMatchScreen} options={({ route }) => ({ title: 'Match Kundali', headerStyle: { backgroundColor: COLORS.AstroMaroon, }, headerTintColor: '#fff', headerTitleStyle: { fontSize: moderateScale(18), }, tabBarStyle: { display: 'none' }, })} />
        <Stack.Screen
          name="KundaliMatchingReport"
          component={KundaliMatchingReport}
          options={({ route }) => ({
            title: 'Match Result',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="KundaliMatchingDetailsResult"
          component={KundaliMatchingReportDetails}
          options={({ route }) => ({
            title: 'Kundali Deatils',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="Horoscope"
          component={Horoscope}
          options={({ route }) => ({
            title: 'Horoscope',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="HoroscopeDetails"
          component={HoroscopeDetails}
          options={({ route }) => ({
            title: 'Horoscope Details',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="ShubhMuhurat"
          component={ShubhMuhurat}
          options={({ route }) => ({
            title: 'Shubh Muhurat',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="VrataUpvaas"
          component={VrataUpvaas}
          options={({ route }) => ({
            title: 'Vrat and Upvaas',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />

        <Stack.Screen
          name="ReferFriend"
          component={ReferAndEarnScreen}
          options={{
            title: 'Refer a friend',

            headerBackTitleVisible: true,
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
          }}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={({ route }) => ({
            title: 'Settings',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="FreeService"
          component={FreeServicesScreen}
          options={{
            title: 'Free Astrology ',

            headerBackTitleVisible: true,
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
          }}
        />
        <Stack.Screen
          name="PanchangScreen"
          component={PanchangScreen}
          options={({ route }) => ({
            title: 'Punchang',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="JanamKundaliScreen"
          component={JanamKundaliScreen}
          options={({ route }) => ({
            title: 'Janam Kundali',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="AboutUsScreen"
          component={AboutUsScreen}
          options={({ route }) => ({
            title: 'About us',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="FaqScreen"
          component={FaqScreen}
          options={({ route }) => ({
            title: 'FAQs',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="SpecificPuja"
          component={VipPuja}
          options={({ route }) => ({
            title: 'Specific Puja',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="SupportScreen"
          component={SupportScreen}
          options={({ route }) => ({
            title: 'Support',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="RefundAndCancel"
          component={RefundAndCancel}
          options={({ route }) => ({
            title: 'Refund & Cancellation',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicy}
          options={({ route }) => ({
            title: 'Privacy Policy',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="TermsOfUse"
          component={TermsOfUse}
          options={({ route }) => ({
            title: 'Terms of Use',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="ChatIntakeForm"
          component={ChatIntakeForm}
          options={({ route }) => ({
            title: 'Chat Intake Form',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
          })}
        />
        <Stack.Screen
          name="PersonToPersonChat"
          component={PersonToPersonChat}
          options={({ route }) => ({
            headerShown: false,
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
          })}
        />
        <Stack.Screen
          name="BlogScreen"
          component={BlogScreen}
          options={({ route }) => ({
            title: route.params?.blog?.category?.name || 'Blog',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="BookPujaScreen"
          component={BookPujaScreen}
          options={({ route }) => ({
            title: 'Book Puja',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="PujaDetails"
          component={PujaDetails}
          options={({ route }) => ({
            title: 'Puja Details',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="GemstoneDetails"
          component={GemstoneDetails}
          options={({ route }) => ({
            title: 'Gemstone Details',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="GemstoneList"
          component={GemstoneList}
          options={({ route }) => ({
            title: 'Gemstones',
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
            tabBarStyle: { display: 'none' },
          })}
        />
        <Stack.Screen
          name="FavoriteScreen"
          component={FavoriteScreen}
          options={{
            title: 'My Favorites',

            headerBackTitleVisible: true,
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontSize: moderateScale(18),
            },
          }}
        />
        <Stack.Screen
          name="Wallet"
          component={Wallet}
          options={({ navigation }) => ({
            headerTitle: 'Balance: ₹ 0',
            headerRight: () => (
              <TouchableOpacity
                style={{ marginRight: scale(15) }}
                onPress={() => navigation.navigate('History')}>
                <MaterialIcons name="history" size={24} color="#fff" />
              </TouchableOpacity>
            ),
            headerBackTitleVisible: true,
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
          })}
        />

        <Stack.Screen
          name="History"
          component={History}
          options={{
            title: 'Transaction History',

            headerBackTitleVisible: true,
            headerStyle: {
              backgroundColor: COLORS.AstroMaroon,
            },
            headerTintColor: '#fff',
          }}
        />
        {/* <Stack.Screen
          name="VideoCall"
          component={VideoCall}
          options={{
            headerShown: false,
          }}
        /> */}
        {/* <Stack.Screen
          name="AudioCall"
          component={AudioCall}
          options={{
            headerShown: false,
          }}
        /> */}
        <Stack.Screen name="EnxJoinScreen" component={EnxJoinScreen} />
        <Stack.Screen
          name="EnxConferenceScreen"
          component={EnxConferenceScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="VoiceCallScreen" component={VoiceCallScreen} />
        <Stack.Screen name="JoinRoom" component={JoinRoom} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function DrawerNavigator({ navigation }) {
  return (
    <Drawer.Navigator
      drawerContent={props => <CustomDrawerContent {...props} />}
      screenOptions={{ headerShown: false }}>
      <Drawer.Screen
        name="BottomTabs"
        component={BottomTabNavigator}
        options={{ headerShown: false }}
      />
      {/* <Drawer.Screen
        name="UserProfileStack"
        component={UserProfileStack}
        options={{headerShown: false}}
      /> */}
      <Drawer.Screen name="SessionStack" component={SessionStack} />
      <Drawer.Screen
        name="PackageStack"
        component={MyPackages}
        options={{ headerShown: false }}
      />
      {/* <Drawer.Screen
        name="MessageScreen"
        component={UserProfileStack}
        options={{headerShown: false}}
      /> */}
      <Drawer.Screen
        name="DrawerRemedies"
        component={RemediesStack}
        options={{ headerShown: false }}
      />
      <Drawer.Screen
        name="DrawerChat"
        component={ChatStack}
        options={{ headerShown: false }}
      />
    </Drawer.Navigator>
  );
}

function BottomTabNavigator() {
  const TabBarLabel = ({ focused, children }) => {
    return (
      <Text
        style={{
          fontSize: focused ? moderateScale(11) : moderateScale(10),
          color: focused ? COLORS.AstroMaroon : 'black',
        }}>
        {children}
      </Text>
    );
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Chat':
              iconName = focused
                ? 'chatbox-ellipses'
                : 'chatbox-ellipses-outline';
              break;
            case 'Video':
              iconName = focused ? 'videocam' : 'videocam-outline';
              break;
            case 'Call':
              iconName = focused ? 'call' : 'call-outline';
              break;
            case 'Live':
              iconName = focused ? 'film' : 'film-outline';
              break;
            case 'Remedies':
              iconName = focused ? 'pricetags' : 'pricetags-outline';
              break;
            default:
              iconName = 'help';
          }

          // You can return any component that you like here, such as Icon from a library
          return (
            <Icon name={iconName} size={moderateScale(22)} color={color} />
          );
        },
        tabBarLabel: ({ focused }) => (
          <TabBarLabel focused={focused}>{route.name}</TabBarLabel>
        ),
        tabBarActiveTintColor: COLORS.AstroMaroon,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          position: 'absolute',
          bottom: 0,
          elevation: 15,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -5 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          borderTopWidth: 0,
        },
      })}>
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Chat" component={ChatStack} />
      <Tab.Screen name="Video" component={VideoStack} />
      <Tab.Screen name="Call" component={CallStack} />
      <Tab.Screen name="Live" component={LiveStack} />
      <Tab.Screen name="Remedies" component={RemediesStack} />
    </Tab.Navigator>
  );
}

function HomeStack({ navigation }) {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="HomeScreen"
        component={Home}
        options={{
          header: () => <CustomHeader title="Astrowani" showLanguage={true} />,
        }}
      />
     <Stack.Screen
          name="EnxConferenceScreen"
          component={EnxConferenceScreen}
          options={{ headerShown: false }}
        />
      <Stack.Screen
        name="NotificationScreen"
        component={NotificationScreen}
        options={{
          headerShown: true,
          title: 'Notifications',
          headerStyle: { backgroundColor: COLORS.AstroMaroon },
          headerTintColor: '#fff'
        }}
      />
      <Stack.Screen
        name="BlogList"
        component={BlogList}
        options={{
          title: 'Our Blogs',

          headerBackTitleVisible: true,
          headerStyle: {
            backgroundColor: COLORS.AstroMaroon,
          },
          headerTitleStyle: {
            fontSize: moderateScale(18),
          },
          headerTintColor: '#fff',
        }}
      />

      <Stack.Screen
        name="SearchScreen"
        component={SearchScreen}
        // options={{headerShown: false}}
        options={({ route }) => ({
          title: 'Search Astrologer',
          headerStyle: {
            backgroundColor: COLORS.AstroMaroon,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontSize: moderateScale(18),
          },
          tabBarStyle: { display: 'none' },
        })}
      />
    </Stack.Navigator>
  );
}

function ChatStack({ route }) {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="ChatScreen"
        component={Chat}
        options={{
          header: () => <CustomHeader title="Chat With Experts" />,
        }}
        initialParams={route.params}
      />
    </Stack.Navigator>
  );
}
function VideoStack() {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="VideoScreen"
        component={Video}
        options={{
          header: () => <CustomHeader title="Video With Experts" />,
        }}
      />
    </Stack.Navigator>
  );
}
function CallStack() {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="CallScreen"
        component={Call}
        options={{
          header: () => <CustomHeader title="Talk To Experts" />,
        }}
      />
      {/* <Stack.Screen
        name="InCallScreen"
        component={InCallScreen}
        options={{
          headerShown: false, 
        }}
      /> */}
    </Stack.Navigator>
  );
}
function LiveStack() {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="LiveScreen"
        component={Live}
        options={{
          header: () => <CustomHeader title="Live Sessions" />,
        }}
      />
    </Stack.Navigator>
  );
}
function RemediesStack() {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="RemediesScreen"
        component={Remedies}
        options={{
          header: () => <CustomHeader title="Services" />,
        }}
      />
    </Stack.Navigator>
  );
}

function SessionStack() {
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
      <Stack.Screen
        name="SessionScreen"
        component={TopTabStack}
        options={{
          title: 'My Sessions',

          headerBackTitleVisible: true,
          headerStyle: {
            backgroundColor: COLORS.AstroMaroon,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontSize: moderateScale(18),
          },
        }}
      />
    </Stack.Navigator>
  );
}

function TopTabStack() {
  return (
    <TopTab.Navigator
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
      <TopTab.Screen
        name="ChatSession"
        component={ChatSessionStack}
        options={{ title: 'Chat Session' }}
      />
      <TopTab.Screen
        name="CallSession"
        component={CallSessionStack}
        options={{ title: 'Call Session' }}
      />
      <TopTab.Screen
        name="VideoSession"
        component={VideoSessionStack}
        options={{ title: 'Video Session' }}
      />
    </TopTab.Navigator>
  );
}

function ChatSessionStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ChatSessionStack"
        component={ChatSession}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AstrologerProfile"
        component={AstrologerInfo}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
function CallSessionStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CallSessionStack"
        component={CallSession}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AstrologerProfile"
        component={AstrologerInfo}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
function VideoSessionStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="VideoSessionStack"
        component={VideoSession}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AstrologerProfile"
        component={AstrologerInfo}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function UserProfileStack() {
  return <Stack.Navigator></Stack.Navigator>;
}

function WalletStack({ navigation }) {
  return <Stack.Navigator></Stack.Navigator>;
}