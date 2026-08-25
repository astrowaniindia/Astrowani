import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';

// Guarded require, NOT a static import. react-native-webview is a native module, and OTA
// (Hot Updater) ships only JS — it cannot add native code to a binary built before the
// module existed. A static import runs TurboModuleRegistry.getEnforcing('RNCWebViewModule')
// at require time, which fatally crashed every user on an older build the last time this
// mistake was made here (see the same guard in screens/Home/LiveAartiSection.js). This
// turns a missing native module into a normal, recoverable state.
let WebView = null;
try {
  // eslint-disable-next-line global-require
  WebView = require('react-native-webview').WebView;
} catch (_) {
  WebView = null;
}

// Same guarded-require reasoning as WebView above. This one is used to run Razorpay's
// NATIVE sheet on the store's behalf — see the payment bridge below.
let RazorpayCheckout = null;
try {
  // eslint-disable-next-line global-require
  RazorpayCheckout = require('react-native-razorpay').default || require('react-native-razorpay');
} catch (_) {
  RazorpayCheckout = null;
}

export const STORE_URL = 'https://shop.astrowani.com/';

// Anything not on this host is somebody else's site — a payment page, a social link, a
// mailto. Those belong in the real browser, not trapped inside our chrome with no address
// bar and no way out.
const STORE_HOST = 'shop.astrowani.com';

// Razorpay is allowed to stay inside the WebView. On a build that has the native payment
// bridge below this never comes up, but on one that does not, the page falls back to
// Razorpay's web widget — and kicking checkout.razorpay.com out to the system browser
// would abandon the payment mid-flow. This is the payment processor's own domain, loaded
// only from our own checkout, not a general widening of what the store may navigate to.
const PAYMENT_HOSTS = /(^|\.)razorpay\.com$/i;

function isInternal(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === STORE_HOST || PAYMENT_HOSTS.test(hostname);
  } catch (_) {
    // RN's URL polyfill can throw on schemes like tel: / mailto: / intent:
    return /^https?:\/\/([a-z0-9-]+\.)*(astrowani|razorpay)\.com/i.test(url);
  }
}

export default function StoreWebView() {
  const { t } = useContext(LanguageContext);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const webRef = useRef(null);
  const canGoBackRef = useRef(false);      // read by the hardware-back handler
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // undefined = still reading storage, null = signed out, string = the JWT.
  // The WebView is not mounted until this resolves: injectedJavaScriptBeforeContentLoaded
  // is captured once at mount, so mounting first and setting the token afterwards would
  // load the store permanently signed out.
  const [token, setToken] = useState(undefined);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem('token')
      .then((v) => { if (alive) setToken(v || null); })
      .catch(() => { if (alive) setToken(null); });
    return () => { alive = false; };
  }, []);

  // Android hardware back should walk the page's own history first, so a customer deep in
  // a product view goes back to the grid rather than straight out of the tab.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current && webRef.current) {
        webRef.current.goBack();
        return true; // consumed
      }
      return false; // let navigation handle it
    });
    return () => sub.remove();
  }, []);

  // Leaving the store is the page's own job now: its header is the only nav bar on this
  // screen and carries an exit button, which posts here. Only the app knows where "home"
  // is, so the page asks rather than trying to navigate itself.
  const leaveStore = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('BottomTabs', { screen: 'Home' });
  }, [navigation]);

  /**
   * Run Razorpay's native sheet for the store, and post the result back into the page.
   *
   * WHY THIS EXISTS. The storefront is perfectly capable of opening Razorpay's web widget,
   * and does on the open web. Inside a WebView it is the wrong tool: paying by UPI hands
   * off to an intent:// URL for GPay or PhonePe, which the WebView cannot follow, and
   * onShouldStartLoadWithRequest below would push it to the system browser — taking the
   * customer out of the app in the middle of a payment. The app already links
   * react-native-razorpay (Wallet.js, PaymentScreen.js), so it runs the sheet natively and
   * hands the signed response back.
   *
   * This bridge NEVER decides an order is paid. It returns Razorpay's response to the page,
   * which posts it to /api/orders/verify-payment, and only the server's signature check
   * confirms anything. A cancelled sheet is reported as cancelled, not as a failure — the
   * order stays pending_payment and nothing is charged.
   */
  const runNativePayment = useCallback(async (msg) => {
    const reply = (payload) => {
      const js = `if (window.__astrowaniPaymentResult) window.__astrowaniPaymentResult(${JSON.stringify({ id: msg.id, ...payload })}); true;`;
      webRef.current?.injectJavaScript(js);
    };
    if (!RazorpayCheckout) {
      reply({ status: 'error', message: 'Payments need an app update. Please update Astrowani.' });
      return;
    }
    try {
      const payment = await RazorpayCheckout.open(msg.options || {});
      reply({ status: 'success', payment });
    } catch (err) {
      // RazorpayCheckout rejects when the customer closes the sheet. That is not an error
      // worth alarming wording — nothing has been charged either way.
      const cancelled = err?.code === 'Razorpay' || /cancel/i.test(err?.message || '') || err?.code === 0;
      reply(cancelled ? { status: 'cancelled' } : { status: 'error', message: err?.description || err?.message || '' });
    }
  }, []);

  const onMessage = useCallback((e) => {
    let msg = null;
    // Anything the page posts arrives here as a string, including things we did not send.
    // A malformed payload must not take the screen down with it.
    try { msg = JSON.parse(e?.nativeEvent?.data || ''); } catch (_) { return; }
    if (!msg) return;
    if (msg.type === 'exit') leaveStore();
    else if (msg.type === 'razorpay') runNativePayment(msg);
  }, [leaveStore, runNativePayment]);

  // Not a header — just the status-bar strip, painted the same brown as the page header
  // directly below it so the two read as one bar. The app draws under the status bar, so
  // without this the wordmark would sit behind the clock.
  const statusBarFill = <View style={{ height: insets.top, backgroundColor: '#592a19' }} />;

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setReloadKey((k) => k + 1); // remount, rather than reload() on a WebView that may be dead
  }, []);

  // No native module in this build, or the page could not load. Either way the customer
  // gets an explanation and a way out instead of a blank screen.
  if (!WebView || failed) {
    return (
      <View style={styles.flex}>
      {statusBarFill}
      <ScrollView
        contentContainerStyle={styles.fallbackWrap}
        refreshControl={<RefreshControl refreshing={false} onRefresh={retry} />}
      >
        <Icon name={WebView ? 'wifi-off' : 'system-update'} size={moderateScale(46)} color={COLORS.maroon} />
        <Text style={styles.fallbackTitle}>
          {WebView ? t('store.offlineTitle') : t('store.updateTitle')}
        </Text>
        <Text style={styles.fallbackBody}>
          {WebView ? t('store.offlineBody') : t('store.updateBody')}
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={WebView ? retry : () => Linking.openURL(STORE_URL)}>
          <Text style={styles.primaryBtnTxt}>
            {WebView ? t('store.retry') : t('store.openInBrowser')}
          </Text>
        </TouchableOpacity>
        {!!WebView && (
          <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(STORE_URL)}>
            <Text style={styles.linkBtnTxt}>{t('store.openInBrowser')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </View>
    );
  }

  if (token === undefined) {
    return (
      <View style={styles.flex}>
        {statusBarFill}
        <View style={[styles.flex, styles.loaderOverlay]}>
          <ActivityIndicator size="large" color={COLORS.maroon} />
        </View>
      </View>
    );
  }

  // apiBase is deliberately NOT sent: the page defaults to its own origin, which nginx
  // proxies to the backend. Passing backend.astrowani.com here would make the calls
  // cross-origin again and CORS refuses them - that was the original bug.
  // Handed to the page before its own scripts run, so the store knows on first paint
  // whether it can offer a real checkout. Signed-out visitors (and anyone opening
  // shop.astrowani.com in a normal browser) simply never see this and fall back to the
  // enquiry flow. JSON.stringify does the escaping — interpolating a raw token into a
  // script string would break on any quote it happened to contain.
  // nativePay tells the page this build can run Razorpay's native sheet for it. The page
  // checks for THIS flag rather than platform === 'app', so an older build that has the
  // store tab but not the bridge falls back to the web widget instead of posting a message
  // nothing is listening for and hanging on a spinner. It is only claimed when the native
  // module actually resolved.
  const injectAuth = `
    window.__ASTROWANI__ = {
      token: ${JSON.stringify(token)},
      platform: 'app',
      nativePay: ${RazorpayCheckout ? 'true' : 'false'}
    };
    true;
  `;

  const injectAuthAfterLoad = `${injectAuth}
    if (window.__astrowaniApplyAppMode) window.__astrowaniApplyAppMode();
    true;
  `;

  return (
    <View style={styles.flex}>
      {statusBarFill}
      <WebView
        key={reloadKey + ':' + (token ? 'auth' : 'anon')}
        ref={webRef}
        source={{ uri: STORE_URL }}
        injectedJavaScriptBeforeContentLoaded={injectAuth}
        // Sent a second time after load. On Android the "before content loaded" injection
        // is not reliably ahead of the page's own first script, and when it lost that race
        // the page came up as though it were on the open web - no exit button, no real
        // checkout. Re-applying afterwards makes that outcome deterministic rather than a
        // matter of timing; the page's handler is idempotent.
        injectedJavaScript={injectAuthAfterLoad}
        style={styles.flex}
        // Cream, matching the site's own background, so the gap before first paint isn't
        // a white flash against the app's theme.
        containerStyle={styles.webContainer}
        onMessage={onMessage}
        onNavigationStateChange={(nav) => { canGoBackRef.current = !!nav.canGoBack; }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={(e) => {
          // A 404 on some sub-resource must not blank the whole store; only treat a failure
          // of the main document as fatal.
          const { nativeEvent } = e;
          if (nativeEvent?.url === STORE_URL && nativeEvent?.statusCode >= 500) {
            setLoading(false);
            setFailed(true);
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          if (isInternal(req.url)) return true;
          Linking.openURL(req.url).catch(() => {});
          return false;
        }}
        // The store keeps its cart in localStorage; without these it would empty itself
        // every time the customer leaves the tab.
        domStorageEnabled
        javaScriptEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        originWhitelist={['https://*']}
      />
      {loading && (
        <View style={styles.loaderOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={COLORS.maroon} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  webContainer: { backgroundColor: '#f4d8bc' },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4d8bc',
  },
  fallbackWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(28),
    backgroundColor: '#f4d8bc',
  },
  fallbackTitle: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: COLORS.maroon,
    marginTop: verticalScale(14),
    textAlign: 'center',
  },
  fallbackBody: {
    fontSize: moderateScale(13.5),
    color: '#6b5f4b',
    textAlign: 'center',
    marginTop: verticalScale(8),
    lineHeight: moderateScale(20),
  },
  primaryBtn: {
    marginTop: verticalScale(20),
    backgroundColor: COLORS.maroon,
    paddingHorizontal: scale(26),
    paddingVertical: verticalScale(11),
    borderRadius: scale(22),
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
  linkBtn: { marginTop: verticalScale(12) },
  linkBtnTxt: {
    color: COLORS.maroon,
    fontWeight: '600',
    fontSize: moderateScale(13),
    textDecorationLine: 'underline',
  },
});
