import React, {useState, useEffect} from 'react';
import { View, Text, TouchableOpacity, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { PostHogProvider } from 'posthog-react-native';
import { posthog, applySessionReplaySetting, loadAnalyticsEnvironment, getAnalyticsEnvironment } from '../utils/Analytics';
import { navigationRef } from '../utils/NavigationService';
import useWalletBalance from '../hooks/useWalletBalance';
import Splash from '../screens/Splash/Splash';
import Login from '../screens/Login/Login';
import OtpScreen from '../screens/OtpScreen/OtpScreen';
import VerifyOtp from '../screens/OtpScreen/VerifyOtp';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import EmailOtpScreen from '../screens/OtpScreen/EmailOtpScreen';
import CustomHeader from './CustomHeader';
import Chat from '../screens/chat/Chat';
import CustomDrawerContent from './CustomDrawerContent'; // Your custom drawer content
import UserProfileScreen from '../screens/drawerScreens/UserProfileScreen';
import ChatSessionScreen from '../screens/ChatSessionScreen';
import FreeBotChatScreen from '../screens/FreeBotChat/FreeBotChatScreen';
import Video from '../screens/Video/Video';
import Call from '../screens/Call/Call';
import Live from '../screens/Live/Live';
import LiveViewerScreen from '../screens/Live/LiveViewerScreen';
import { StatusPopupHost } from '../components/StatusPopup';
import { ReviewPromptHost } from '../components/ReviewPrompt';
import { ReferralPromptHost } from '../components/ReferralPromptHost';
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
import RemedyShop from '../screens/Remedies/RemedyShop';
import CategoryAstrologers from '../screens/Category/CategoryAstrologers';
import MySessionScreen from '../screens/drawerScreens/MySessionScreen';
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
// These 18 astro-service report screens (9 input/result pairs + Tarot) are
// deliberately NOT statically imported here — see the getComponent loop below
// (2026-08-13 perf audit, finding H1). Each is only require()'d the first time
// a customer actually navigates to it, instead of every one being evaluated
// on cold start alongside the ~70 screens that are actually common paths.
import Home from '../screens/Home/Home';
import ReferAndEarnScreen from '../screens/drawerScreens/ReferAndEarnScreen';
import MyOrdersScreen from '../screens/drawerScreens/MyOrdersScreen';
import VoiceNotesScreen from '../screens/drawerScreens/VoiceNotesScreen';
import Settings from '../screens/drawerScreens/Settings';
import AboutUsScreen from '../screens/drawerScreens/AboutUsScreen';
import FaqScreen from '../screens/drawerScreens/FaqScreen';
import SupportScreen from '../screens/drawerScreens/SupportScreen';
// import GemstoneDetails from '../screens/Remedies/GemstoneDetails';
import GemstoneList from '../screens/Remedies/GemstoneList';
import KundaliMatchingReportDetails from '../screens/drawerScreens/FreeSeviceScreen/KundaliMatchingResultDetails';

import VoiceCallScreen from '../screens/Video/VoiceCallScreen';
import VideoCallScreen from '../screens/Video/VideoCallScreen';
import GemstoneDetails from '../screens/Home/GemStoneBuy';
import VipPuja from '../screens/Home/VipPuja';
import Register from '../screens/Register/Register';
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

export default function Navigation({ initialRoute }) {
  useEffect(() => {
    applySessionReplaySetting();
    loadAnalyticsEnvironment();
  }, []);

  // Written by PushNotification.js's handleActiveSessionTap when the persistent
  // "call/chat in progress" notification is tapped while the app process is dead —
  // gets the customer straight back into the live session instead of the normal start
  // screen. Checked in two places for the same reason as the vendor app's equivalent:
  // a genuine cold start (NavigationContainer mounts fresh → onReady fires) vs. simply
  // resuming an app that was only backgrounded (JS engine never died, onReady does NOT
  // fire again — only the AppState 'active' transition below catches that case).
  const consumePendingSessionNavigation = async () => {
    try {
      const raw = await AsyncStorage.getItem('pendingSessionNavigation');
      if (!raw) return false;
      await AsyncStorage.removeItem('pendingSessionNavigation');
      const { screen, params } = JSON.parse(raw);
      if (screen && navigationRef.isReady()) {
        navigationRef.navigate(screen, params);
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  // The write (handleActiveSessionTap) and this read can race — retry briefly rather
  // than checking only once, same reasoning as the vendor app's equivalent retry.
  const consumePendingSessionNavigationWithRetry = async (attempt = 0) => {
    const found = await consumePendingSessionNavigation();
    if (!found && attempt < 6) {
      setTimeout(() => consumePendingSessionNavigationWithRetry(attempt + 1), 400);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        consumePendingSessionNavigationWithRetry();
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
    <NavigationContainer ref={navigationRef} onReady={() => consumePendingSessionNavigationWithRetry()}>
      {/* Must be inside NavigationContainer — PostHog's screen-autocapture hook reads
          navigation state via @react-navigation/native's own hooks, which only work
          for descendants of NavigationContainer. */}
      <PostHogProvider
        client={posthog}
        autocapture={{
          captureScreens: true,
          captureTouches: false,
          navigation: { routeToProperties: (name, params) => ({ app: 'customer', environment: getAnalyticsEnvironment() }) },
        }}
      >
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen options={{ headerShown: false }} name="Splash" component={Splash} />
        <Stack.Screen options={{ headerShown: false }} name="Login" component={Login} />
        <Stack.Screen options={{ headerShown: false }} name="Register" component={Register} />

        <Stack.Screen options={{ headerShown: false }} name="VerifyOtp" component={VerifyOtp} />
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
          name="MyOrders"
          component={MyOrdersScreen}
          options={{
            title: 'My Orders',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(18) },
          }}
        />
        <Stack.Screen
          name="VoiceNotes"
          component={VoiceNotesScreen}
          options={{
            title: 'Voice Notes',
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(18) },
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
        {[
          ['KundliInputScreen', () => require('../screens/drawerScreens/AstroServices/KundliInputScreen').default, 'Kundli Report'],
          ['KundliResultScreen', () => require('../screens/drawerScreens/AstroServices/KundliResultScreen').default, 'Kundli Report'],
          ['MatchingInputScreen', () => require('../screens/drawerScreens/AstroServices/MatchingInputScreen').default, 'Kundli Matching'],
          ['MatchingResultScreen', () => require('../screens/drawerScreens/AstroServices/MatchingResultScreen').default, 'Match Result'],
          ['ChartInputScreen', () => require('../screens/drawerScreens/AstroServices/ChartInputScreen').default, 'Divisional Chart'],
          ['ChartResultScreen', () => require('../screens/drawerScreens/AstroServices/ChartResultScreen').default, 'Chart'],
          ['DashaInputScreen', () => require('../screens/drawerScreens/AstroServices/DashaInputScreen').default, 'Dasha Report'],
          ['DashaResultScreen', () => require('../screens/drawerScreens/AstroServices/DashaResultScreen').default, 'Dasha Report'],
          ['DoshInputScreen', () => require('../screens/drawerScreens/AstroServices/DoshInputScreen').default, 'Dosh Report'],
          ['DoshResultScreen', () => require('../screens/drawerScreens/AstroServices/DoshResultScreen').default, 'Dosh Report'],
          ['NumerologyInputScreen', () => require('../screens/drawerScreens/AstroServices/NumerologyInputScreen').default, 'Numerology Report'],
          ['NumerologyResultScreen', () => require('../screens/drawerScreens/AstroServices/NumerologyResultScreen').default, 'Numerology Report'],
          ['LalKitabInputScreen', () => require('../screens/drawerScreens/AstroServices/LalKitabInputScreen').default, 'Lal Kitab Report'],
          ['LalKitabResultScreen', () => require('../screens/drawerScreens/AstroServices/LalKitabResultScreen').default, 'Lal Kitab Report'],
          ['KPAstrologyInputScreen', () => require('../screens/drawerScreens/AstroServices/KPAstrologyInputScreen').default, 'KP Astrology Report'],
          ['KPAstrologyResultScreen', () => require('../screens/drawerScreens/AstroServices/KPAstrologyResultScreen').default, 'KP Astrology Report'],
          ['TarotScreen', () => require('../screens/drawerScreens/AstroServices/TarotScreen').default, 'Tarot Reading'],
          ['PdfReportInputScreen', () => require('../screens/drawerScreens/AstroServices/PdfReportInputScreen').default, 'PDF Report'],
          ['PdfReportResultScreen', () => require('../screens/drawerScreens/AstroServices/PdfReportResultScreen').default, 'PDF Report'],
        ].map(([name, getComponent, title]) => (
          <Stack.Screen
            key={name}
            name={name}
            // getComponent (not `component`) defers the require() until this
            // screen is actually navigated to, instead of at app start —
            // Metro still bundles the module, but its JS no longer has to be
            // evaluated on cold start alongside every commonly-used screen.
            // (Metro needs a static, literal require() per module — a
            // template-string path is not statically analyzable, hence one
            // explicit require() per row instead of building the path from fileName.)
            getComponent={getComponent}
            options={({ route }) => ({
              title,
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
        ))}
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
          name="LiveViewerScreen"
          component={LiveViewerScreen}
          options={{ headerShown: false, tabBarStyle: { display: 'none' } }}
        />
        <Stack.Screen
          name="CategoryAstrologers"
          component={CategoryAstrologers}
          options={({ route }) => ({
            title: route?.params?.categoryName || 'Astrologers',
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
          name="RemedyShop"
          component={RemedyShop}
          options={({ route }) => ({
            title: route?.params?.title || 'Remedies',
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
            headerTitle: () => <WalletBalanceHeaderTitle />,
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
        <Stack.Screen name="VoiceCallScreen" component={VoiceCallScreen} options={{ headerShown: false }} />
        <Stack.Screen name="VideoCallScreen" component={VideoCallScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="ChatSessionScreen"
          component={ChatSessionScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FreeBotChatScreen"
          component={FreeBotChatScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
      </PostHogProvider>
    </NavigationContainer>
    <StatusPopupHost />
    <ReviewPromptHost />
    <ReferralPromptHost />
    </>
  );
}

function DrawerNavigator({ navigation }) {
  return (
    <Drawer.Navigator
      drawerContent={props => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        // Default swipeEdgeWidth (32dp) requires starting the swipe almost
        // exactly on the screen edge — easy to miss and reads as "swipe
        // doesn't open the drawer" even though it technically works. Widened
        // so a left-to-right swipe starting anywhere in the left third of the
        // screen opens it, alongside the existing hamburger-icon tap.
        swipeEnabled: true,
        swipeEdgeWidth: scale(140),
      }}>
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

// Wallet screen's header used to hardcode "Balance: ₹ 0" regardless of the real
// balance — this fetches the actual value the same way BottomTabNavigator's tab
// label does. Both now share ONE poll via useWalletBalance() instead of each
// running an independent 20s interval against the same endpoint (previously
// this header, the tab bar, and CustomHeader.js on 6 screens each polled
// separately — up to 3x the necessary /api/wallet traffic at once).
function WalletBalanceHeaderTitle() {
  const balance = useWalletBalance();

  return (
    <Text style={{ color: '#fff', fontSize: moderateScale(17), fontWeight: '600' }}>
      Balance: ₹ {balance === null ? '…' : balance}
    </Text>
  );
}

function BottomTabNavigator() {
  // Shared poll (see useWalletBalance.js) — 20s means this display can lag a
  // live per-minute billing tick briefly, which is an acceptable trade for
  // not reading `customers` directly (see DATABASE_HARDENING_HANDOFF.md §3.1/§3.2).
  const walletBalance = useWalletBalance();

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

          return (
            <Icon name={iconName} size={moderateScale(22)} color={color} />
          );
        },
        tabBarLabel: ({ focused }) => {
          if (route.name === 'Home') {
            return (
              <View style={{alignItems: 'center'}}>
                <Text
                  style={{
                    fontSize: focused ? moderateScale(11) : moderateScale(10),
                    color: focused ? COLORS.AstroMaroon : 'black',
                    lineHeight: moderateScale(13),
                  }}>
                  Home
                </Text>
                {walletBalance !== null && (
                  <Text
                    style={{
                      fontSize: moderateScale(8),
                      color: '#2E7D32',
                      fontWeight: 'bold',
                      lineHeight: moderateScale(10),
                    }}>
                    ₹{walletBalance}
                  </Text>
                )}
              </View>
            );
          }
          return <TabBarLabel focused={focused}>{route.name}</TabBarLabel>;
        },
        tabBarActiveTintColor: COLORS.AstroMaroon,
        tabBarInactiveTintColor: 'gray',
        // The Live tab's nested stack pushes LiveViewerScreen (the full-screen live video +
        // chat + gifting overlay) on top of LiveStack — being a NESTED stack screen (not a
        // sibling of DrawerNavigator in the root stack), it does not automatically cover the
        // tab bar the way most other full-screen routes in this app do, so the bar was left
        // floating over the live viewer's chat box. Hide it only for that one nested route.
        tabBarStyle: getFocusedRouteNameFromRoute(route) === 'LiveViewerScreen'
          ? { display: 'none' }
          : {
            backgroundColor: '#fff',
            borderRadius: 30,
            position: 'absolute',
            bottom: verticalScale(12),
            marginHorizontal: scale(12),
            elevation: 15,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -5 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            borderTopWidth: 0,
            height: verticalScale(70),
            paddingBottom: verticalScale(8),
          },
      })}>
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Chat" component={ChatStack} />
      <Tab.Screen name="Call" component={CallStack} />
      <Tab.Screen name="Video" component={VideoStack} />
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
      <Stack.Screen
        name="LiveViewerScreen"
        component={LiveViewerScreen}
        options={{ headerShown: false }}
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
        component={MySessionScreen}
        options={({ navigation }) => ({
          title: 'My Sessions',
          headerBackTitleVisible: true,
          headerTitleAlign: 'center',
          headerStyle: {
            backgroundColor: COLORS.AstroMaroon,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontSize: moderateScale(18),
          },
          // SessionStack is a Drawer.Screen directly (see DrawerNavigator below) —
          // this screen is the first (and only) one in its own nested stack, so
          // React Navigation's default header never shows a back button on its own.
          // The drawer itself still remembers what was open before, so goBack() on
          // the PARENT (drawer) navigator returns there correctly.
          headerLeft: () => (
            <TouchableOpacity onPress={() => navigation.getParent()?.goBack()} style={{ marginLeft: scale(12) }}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        })}
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