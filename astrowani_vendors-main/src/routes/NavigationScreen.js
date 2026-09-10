import React, { useState, useEffect, useContext } from 'react';
import { AppState, Dimensions} from 'react-native';
import IntroSplash from '../screens/Splash/IntroSplash';
import { NavigationContainer } from '@react-navigation/native';
import { PostHogProvider } from 'posthog-react-native';
import { posthog, applySessionReplaySetting, loadAnalyticsEnvironment, getAnalyticsEnvironment } from '../utils/Analytics';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../utils/navigationRef';
import Registration from '../screens/Registration';
import Login from '../screens/Login/Login';
import VerifyOtp from '../screens/OtpScreen/VerifyOtp';
import Thankyou from '../screens/Thankyou';
import PendingApproval from '../screens/PendingApproval';
import { supabase } from '../api/SupabaseClient';
import CustomDrawer from './CustomDrawer';
import ErrorBoundary from '../components/ErrorBoundary';
import CustomHeader from './CustomHeader';
import HomeScreen from '../screens/Home/HomeScreen';
import MyCustomers from '../screens/Drawer/MyCustomers';
import RemedyReferrals from '../screens/Drawer/RemedyReferrals';
import FreeCalls from '../screens/Drawer/FreeCalls';
import BlockedCustomers from '../screens/Drawer/BlockedCustomers';
import WhatsAppChats from '../screens/Drawer/WhatsAppChats';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import VideoCall from '../screens/VideoCall';
import AudioCall from '../screens/AudioCall';
import GoLiveScreen from '../screens/GoLive/GoLiveScreen';
import Profile from '../screens/Profile/Profile';
import EditProfile from '../screens/Profile/EditProfile';
import Notification from '../screens/Notification/Notification';
import Wallet from '../screens/Home/Report';
import EnxScreenVoice from '../utils/EnxScreenVoice';
import Support from '../screens/Support';
import SessionHistory from '../screens/HIstory/SessionHistory';
import MissedSessions from '../screens/HIstory/MissedSessions';
import RatingReview from '../screens/Review/RatingReview';
import PerformanceDashboard from '../screens/Review/PerformanceDashboard';
import VendorChatSession from '../screens/VendorChatSession';
import Settings from '../screens/Settings';
import ReferralPopupHost from '../components/ReferralPopupHost';
import { AppUpdatePromptHost } from '../components/AppUpdatePrompt';
import { RateAppPromptHost } from '../components/RateAppPrompt';
import useAppPromptSync from '../utils/useAppPromptSync';
import { StatusPopupHost } from '../components/StatusPopup';
import useReferralPopupSync from '../utils/useReferralPopupSync';
import { LanguageContext } from '../context/LanguageContext';
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function NavigationScreen() {
  const { t } = useContext(LanguageContext);
  const [isLoading, setIsLoading] = useState(true);
  // Gates on the intro animation's own onFinish, not a timer here, so the
  // animation always plays to completion even if the token check below
  // resolves first (the common case — an AsyncStorage read is near-instant).
  const [introDone, setIntroDone] = useState(false);
  // Resolved landing route: 'Login' | 'PendingApproval' | 'DrawerNavigator'
  const [initialRoute, setInitialRoute] = useState('Login');
  const [astroId, setAstroId] = useState(null);

  useEffect(() => {
    checkToken();
    AsyncStorage.getItem('astroId').then(setAstroId);
  }, []);

  // Admin-triggered referral popup (astrowani-admin's Referral Popup page) — lives at the
  // navigation root so it can fire regardless of which screen the vendor is currently on.
  useReferralPopupSync(astroId);
  // Admin-pushed "please update" / "please rate us" popups.
  useAppPromptSync(astroId);

  // Written by the notification Accept action (see index.js's notifee.onBackgroundEvent) so
  // the vendor lands straight in the live call/chat instead of just the dashboard. Checked in
  // two places because "tap Accept" can mean two different things to the OS: a genuine cold
  // start (app was killed — NavigationContainer mounts fresh, onReady fires) or simply resuming
  // an app that was only backgrounded (JS engine never died, NavigationContainer was already
  // mounted, onReady does NOT fire again — only the AppState 'active' transition below catches
  // this case). Returns true if a pending navigation was found and consumed.
  const consumePendingCallNavigation = async () => {
    try {
      const raw = await AsyncStorage.getItem('pendingCallNavigation');
      if (!raw) return false;
      await AsyncStorage.removeItem('pendingCallNavigation');
      const { screen, params } = JSON.parse(raw);
      if (screen && navigationRef.current?.isReady()) {
        navigationRef.current.navigate(screen, params);
      }
      return true;
    } catch (e) {
      console.log('Error consuming pending call navigation:', e);
      return false;
    }
  };

  // Verified on-device: the notifee background handler that writes the flag and the
  // AppState 'active' transition below both fire right after an Accept tap, but not in a
  // guaranteed order — the handler's Supabase round-trip can still be finishing when this
  // check runs. Retry briefly rather than only checking once.
  const consumePendingCallNavigationWithRetry = async (attempt = 0) => {
    const found = await consumePendingCallNavigation();
    if (!found && attempt < 6) {
      setTimeout(() => consumePendingCallNavigationWithRetry(attempt + 1), 400);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        consumePendingCallNavigationWithRetry();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    applySessionReplaySetting();
    loadAnalyticsEnvironment();
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

  if (isLoading || !introDone) {
    return <IntroSplash onFinish={() => setIntroDone(true)} />;
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={() => consumePendingCallNavigationWithRetry()}>
      {/* Must be inside NavigationContainer — PostHog's screen-autocapture hook reads
          navigation state via @react-navigation/native's own hooks, which only work
          for descendants of NavigationContainer. Independent of the onReady above. */}
      <PostHogProvider
        client={posthog}
        autocapture={{
          captureScreens: true,
          captureTouches: false,
          navigation: { routeToProperties: (name, params) => ({ app: 'vendor', environment: getAnalyticsEnvironment() }) },
        }}
      >
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
          options={{ headerShown: false }}
          name="VerifyOtp"
          component={VerifyOtp}
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
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={{
            headerShown: true,
            title: t('drawer.settings'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
        />
        <Stack.Screen
          name="SessionHistory"
          component={SessionHistory}
          options={{
            title: t('drawer.sessionHistory'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
        />
        <Stack.Screen
          name="MissedSessions"
          component={MissedSessions}
          options={{
            title: t('drawer.missedSessions'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
        />
        <Stack.Screen
          options={{
            title: t('nav.registration'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
          name="Registration"
          component={Registration}
        />
        <Stack.Screen
          options={{
            title: t('nav.thankYou'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16), fontWeight: 'bold' },
          }}
          name="Thankyou"
          component={Thankyou}
        />
        

        
        <Stack.Screen
          name="MyCustomers"
          component={MyCustomers}
          options={({ route }) => ({
            title: t('drawer.myCustomers'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="WhatsAppChats"
          component={WhatsAppChats}
          options={() => ({
            title: t('drawer.whatsapp'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="BlockedCustomers"
          component={BlockedCustomers}
          // headerShown:false — the screen draws its own header so it can apply the
          // safe-area inset itself, the same fix Support.tsx needed.
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="FreeCalls"
          component={FreeCalls}
          options={() => ({
            title: t('drawer.freeCalls'),
            headerStyle: { backgroundColor: COLORS.AstroMaroon },
            headerTintColor: '#fff',
            headerTitleStyle: { fontSize: moderateScale(16) },
          })}
        />
        <Stack.Screen
          name="RemedyReferrals"
          component={RemedyReferrals}
          options={() => ({
            title: t('drawer.referrals'),
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
          name="RatingReview"
          component={RatingReview}
          options={({ route }) => ({ headerShown: true })}
        />
        <Stack.Screen
          name="PerformanceDashboard"
          component={PerformanceDashboard}
          options={{ headerShown: true, title: t('drawer.performance') }}
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
          options={{ headerShown: true, title: t('nav.myWallet'), headerStyle: { backgroundColor: COLORS.AstroMaroon }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="VendorChatSession"
          component={VendorChatSession}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="EnxScreenVoice"
          component={EnxScreenVoice}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
      </PostHogProvider>
      <ReferralPopupHost />
      {/* Store-facing prompts. Both run their own launch check and stay silent
          unless the admin has configured them; the update prompt suppresses the
          review one so they can never stack. */}
      <AppUpdatePromptHost />
      <RateAppPromptHost />
      <StatusPopupHost />
    </NavigationContainer>
  );
}

function DrawerNavigator({ navigation }) {
  const { t } = useContext(LanguageContext);
  return (
    <Drawer.Navigator
      drawerContent={props => (
        <ErrorBoundary name="CustomDrawer">
          <CustomDrawer {...props} />
        </ErrorBoundary>
      )}
      screenOptions={{
        headerShown: false,
        // Give the drawer an explicit width. Left unset, react-navigation's default
        // sizing made it span almost the entire screen on a real phone, so opening it
        // read as a full-screen takeover rather than a side panel. Capped so it does
        // not become absurdly wide on a tablet.
        drawerStyle: { width: Math.min(Dimensions.get('window').width * 0.82, 330) },
      }}>
      <Drawer.Screen
        name="HomeStack"
        component={HomeStack}
        options={{ headerShown: false }}
      />
      <Drawer.Screen
        name="Wallet"
        component={Wallet}
        options={{ headerShown: true, title: t('drawer.wallet') }}
      />
    </Drawer.Navigator>
  );
}

function HomeStack({ navigation }) {
  const { t } = useContext(LanguageContext);
  return (
    <Stack.Navigator screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen
          name="HomeScreen"
          component={HomeScreen}
          options={{
            header: () => <CustomHeader title="Astrowani" showLanguage />,
          }}
        />
        <Stack.Screen
          name="Wallet"
          component={Wallet}
          options={{ headerShown: true, title: t('drawer.wallet') }}
        />
      </Stack.Navigator>
  );
}

export default NavigationScreen;
