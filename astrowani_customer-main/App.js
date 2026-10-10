import React, { useState, useEffect } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navigation from './src/routes/Navigation';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import IntroSplash from './src/screens/Splash/IntroSplash';
import PreparingScreen from './src/screens/Splash/PreparingScreen';
import { requestUserPermission } from './src/utils/PushNotification';
import CustomAlert, { showAlert } from './src/Component/CustomAlert';
import { alertTone } from './src/utils/alertTone';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LanguageProvider } from './src/context/LanguageContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import { hydrateHomeCache, prefetchHomeData } from './src/utils/homePreload';
import { loadMascotTips } from './src/utils/mascotTips';
import { prefetchFreeCallOffer } from './src/api/FreeCallApi';
import {
  reportFirstOpen,
  isTargetCampaignFirstOpen,
  getCampaignVariant,
  setCampaignVariant as rememberCampaignVariant,
} from './src/utils/acquisition';
import { CAMPAIGN_GIFT_REVEAL_ENABLED } from './src/utils/featureFlags';
import PendingGiftBubbleHost from './src/components/PendingGiftBubbleHost';
import SignupNudgeHost from './src/components/SignupNudgeHost';
import Instance from './src/api/ApiCall';
import { resetAnalyticsIdentity } from './src/utils/Analytics';
import { COLORS } from './src/Theme/Colors';
import { onHomeReady } from './src/utils/appReady';
import { hydrateWalletBalance } from './src/hooks/useWalletBalance';

// Which pre-login screen a targeted-campaign install opens on. The older
// speech-bubble prompt is hidden rather than deleted — see featureFlags.js.
const CAMPAIGN_PROMPT_ROUTE = CAMPAIGN_GIFT_REVEAL_ENABLED
  ? 'CampaignGiftReveal'
  : 'CampaignFreeCallPrompt';

// Hard ceiling on the whole cold-start cover (brand animation + avatar screen),
// measured from app start — NOT an extra delay added after bootstrap, or a slow
// boot and a slow Home would stack into double this. Past it the app is revealed
// regardless: a section that fails or hangs must never strand the customer, and a
// half-built Home beats no app at all.
const MAX_SPLASH_MS = 5000;

// Signed in with a saved token: does that account still exist? Resolves true only
// on the server's explicit 410 ACCOUNT_GONE (deleted from the admin or another
// phone). Anything else, including no network or a slow answer, counts as "still
// there": signing a real customer out by mistake is far worse than a stale screen.
const ACCOUNT_CHECK_MS = 2500;
// Hard deadline around the call above, independent of axios's own timeout — see
// the race at its call site for why that timeout alone was not enough.
const ACCOUNT_CHECK_DEADLINE_MS = 1200;
async function accountIsGone(token) {
  try {
    await Instance.get('/api/account/status', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: ACCOUNT_CHECK_MS,
    });
    return false;
  } catch (e) {
    return e?.response?.status === 410;
  }
}

// Override global Alert.alert to render our CustomAlert component globally
const originalAlert = Alert.alert;
Alert.alert = (title, message, buttons, options) => {
  if (!buttons || buttons.length === 0 || (buttons.length === 1 && buttons[0].style !== 'cancel')) {
    const type = alertTone(title, message);
    const onClose = (buttons && buttons[0]?.onPress) ? buttons[0].onPress : undefined;
    const buttonText = (buttons && buttons[0]?.text) ? buttons[0].text : 'OK';
    
    showAlert(title || 'Alert', message || '', type, onClose, buttonText);
  } else {
    originalAlert(title, message, buttons, options);
  }
};

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);
  // True only for a signed-out visitor whose install referrer carries the "11 min
  // call better geolocations" campaign id, and only until the prompt has been shown
  // once (utils/acquisition.js isTargetCampaignFirstOpen). Decided once, during
  // bootstrap, alongside userToken — see the initialRoute prop below.
  const [showCampaignPrompt, setShowCampaignPrompt] = useState(false);
  // 'gift' (Hinglish reveal → astrologer picker) or 'metro' (English reveal → one
  // astrologer chosen for them). Decided from the install referrer, once.
  const [campaignVariant, setCampaignVariant] = useState('gift');
  // Gates on the intro animation's own onFinish, not a timer here, so the
  // animation always plays to completion even if the AsyncStorage bootstrap
  // below resolves first (the common case — a token read is near-instant).
  const [introDone, setIntroDone] = useState(false);
  // The navigator has mounted, and Home has real content. Both are needed before
  // the splash may lift: mounting the navigator tree and painting Home's first
  // frame takes seconds on a slow device, and that gap used to be uncovered —
  // the customer saw an empty screen, then banners and cards popping in.
  const [navReady, setNavReady] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  // MAX_SPLASH_MS has elapsed. Overrides navReady/contentReady, so a Home section
  // that never resolves cannot hold the cover past the ceiling.
  const [coverExpired, setCoverExpired] = useState(false);

  // Set on the first render, so the ceiling below covers the whole launch
  // (bootstrap + navigator mount + Home's data), not just the part after bootstrap.
  const startedAtRef = React.useRef(Date.now());

  // The ceiling runs from app start and is armed immediately — NOT once bootstrap
  // finishes. Arming it later was the bug that let a slow launch run well past it
  // (2026-10-02): the clock only started once the thing being waited on was done.
  useEffect(() => {
    const remaining = Math.max(0, MAX_SPLASH_MS - (Date.now() - startedAtRef.current));
    const cap = setTimeout(() => setCoverExpired(true), remaining);
    return () => clearTimeout(cap);
  }, []);

  useEffect(() => {
    if (isLoading) return undefined;
    // Signed out goes to Login, which fetches nothing — there is no Home to wait for.
    if (!userToken) {
      setContentReady(true);
      return undefined;
    }
    return onHomeReady(() => setContentReady(true));
  }, [isLoading, userToken]);

  useEffect(() => {
    // Get Home ready while the splash (and then login/signup) is on screen: fresh
    // data and images start downloading now, in the background.
    prefetchHomeData({ force: true });
    // Guide mascot tips: admin config + "already seen" memory, ready before any screen.
    loadMascotTips();
    // QR poster funnel: report this install's first launch (before any signup). Background,
    // never blocks or fails anything; a no-op for installs not from a poster.
    reportFirstOpen();
    // Free call offer for a signed-in customer, so Home can open its popup the moment
    // it appears (the welcome screen does the same right after signup).
    AsyncStorage.getItem('token')
      .then((token) => { if (token) prefetchFreeCallOffer(); })
      .catch(() => {});

    const bootstrapAsync = async () => {
      // Last time's Home data into memory before the first screen renders, so Home
      // draws it on its very first frame. Capped, so a slow storage read can never
      // hold the app on the splash.
      await Promise.race([
        hydrateHomeCache(),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);

      let token;
      try {
        token = await AsyncStorage.getItem('token');
      } catch (e) {
        console.log('Failed to get token from AsyncStorage', e);
      }

      // A deleted account must not keep opening onto its old Home. Same cleanup as
      // logout, then the app starts on signup like any signed-out visitor.
      //
      // Raced against a hard deadline as well as its own axios timeout: on a weak
      // connection this call was measured holding the cold start for 7.8s, which the
      // axios timeout alone did not bound (2026-10-02). Losing the race counts as
      // "account still there", which is already what every non-410 answer means here
      // — a deleted account is simply caught on the next launch instead.
      const accountGone = token
        ? await Promise.race([
            accountIsGone(token),
            new Promise((resolve) => setTimeout(() => resolve(false), ACCOUNT_CHECK_DEADLINE_MS)),
          ])
        : false;
      if (token && accountGone) {
        try {
          resetAnalyticsIdentity();
          await AsyncStorage.clear();
        } catch (_) {}
        token = null;
      }

      // Last known wallet balance onto the screen with the first frame, instead of
      // 0/… for one poll. Only for a signed-in customer, and only once the deleted-
      // account branch above has settled, so a cleared account never gets one.
      if (token) await hydrateWalletBalance();

      // Signed-out only: is this a first open from the targeted Google Ads campaign?
      // getAcquisition() caches its native read, so this costs nothing on every launch
      // after the first — only the one cold start where it isn't cached yet pays for it,
      // and isTargetCampaignFirstOpen() never throws.
      if (!token) {
        // TEMP DEV-ONLY PREVIEW (remove before any real build/push): the emulator has
        // no real Play install referrer to detect, so force the campaign prompt on
        // every signed-out cold start in __DEV__ so the owner can review it now.
        const showPrompt = __DEV__ ? true : await isTargetCampaignFirstOpen();
        if (showPrompt) setShowCampaignPrompt(true);
        // TEMP DEV-ONLY (remove with the override above): an emulator has no Play
        // install referrer, so getCampaignVariant() can never answer 'metro' there.
        // Set this to 'metro' to review the English single-astrologer flow, or
        // 'gift' for the Hinglish one.
        const DEV_VARIANT = 'metro';
        const variant = __DEV__ ? DEV_VARIANT : await getCampaignVariant();
        if (variant) {
          setCampaignVariant(variant);
          // PERSIST IT TOO, not just this component's state. Everything downstream of
          // the reveal — the sign-up nudge above the navigator, the chosen-astrologer
          // screen — reads the variant from storage rather than from a prop, because
          // they are not children of the screen that knows it. Without this the dev
          // override drove the reveal and nothing else, so the reveal was English and
          // the nudge after it was still Hinglish.
          await rememberCampaignVariant(variant);
        }
      }

      setUserToken(token);
      setIsLoading(false);

      // Notification permission: only for a signed-in customer here. A first-time
      // visitor is asked right after booking the free call instead (FreeCallOffer),
      // where "we'll remind you before your call" gives the prompt a reason, rather
      // than during the splash where it gets a reflex "Don't allow" (2026-09-20).
      //
      // Deliberately AFTER setIsLoading(false) and not awaited: getting an FCM token
      // is a network call, and on a weak connection it ran for 10s+ while the splash
      // sat there waiting on it — yet nothing about which screen to open depends on
      // it (2026-10-02). It finishes in the background while the app is already up.
      if (token) {
        requestUserPermission()
          .then((fcmToken) => (fcmToken ? AsyncStorage.setItem('fcmToken', fcmToken) : null))
          .catch(() => {});
      }
    };

    bootstrapAsync();
  }, []);

  // The navigator renders as soon as bootstrap knows which route to open, but the
  // cover stays OVER it until everything behind is actually drawn. Mounting the
  // navigator and loading Home therefore happen while the brand screen is still up,
  // instead of in front of the customer.
  //
  // isLoading is the one gate the ceiling cannot override: until the token read
  // resolves there is no route to open, so there is nothing to reveal.
  const appReady = !isLoading && (coverExpired || (navReady && contentReady));

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        {/* Cream, not transparent-over-native-white — the backstop behind
            Navigation.js's own per-screen contentStyle/sceneContainerStyle, for
            the one frame before any of those have painted. */}
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.AstroSoftOrange }}>
          {/* Root boundary. Inside LanguageProvider so the fallback renders in the
              customer's own language, and inside GestureHandlerRootView so the
              fallback's buttons are actually tappable.

              isRoot: this wraps the navigator itself, so a crash here means there is
              no navigator left to send anyone "home" with — the fallback offers only
              Retry. Screen-level boundaries mounted lower down should NOT pass it. */}
          {!isLoading && (
            <ErrorBoundary name="AppRoot" isRoot>
              {/* Signed out: the Login screen, which also signs up a new number
                  (Login.js handleGetOtp), so one screen serves everyone (2026-09-20). */}
              <Navigation
                initialRoute={userToken
                  ? 'DrawerNavigator'
                  : (showCampaignPrompt ? CAMPAIGN_PROMPT_ROUTE : 'Login')}
                initialParams={showCampaignPrompt ? { variant: campaignVariant } : undefined}
                onReady={() => setNavReady(true)}
              />
            </ErrorBoundary>
          )}
          {/* Above the navigator on purpose: the gift the campaign reveal collapses
              into has to survive Login/OTP/name and still be in the corner when Home
              opens. A screen cannot draw something that outlives it. */}
          <PendingGiftBubbleHost />
          {/* Also above the navigator: it is raised on the way OUT of a screen, so a
              screen-owned version would unmount with the screen that raised it. */}
          <SignupNudgeHost />
          <CustomAlert />
          {/* The cold-start cover, on top of everything until the app behind it is
              drawn. Covering rather than replacing is the point: the navigator below
              is mounting and Home is loading the whole time this is up, so Home is
              revealed complete instead of assembling in front of the customer.

              Two stages on one unchanging brown — stage 1 is the brand animation,
              stage 2 the guide avatar, and the second only appears when the app
              genuinely isn't ready yet. With Home's data already cached (the normal
              repeat open) appReady is true before stage 1 ends, so the avatar screen
              never shows and the whole cover is just the brand animation. */}
          {!appReady || !introDone ? (
            <View style={StyleSheet.absoluteFill}>
              {introDone ? (
                <PreparingScreen />
              ) : (
                <IntroSplash onFinish={() => setIntroDone(true)} />
              )}
            </View>
          ) : null}
        </GestureHandlerRootView>
      </LanguageProvider>
    </SafeAreaProvider>
  );
};

export default App;