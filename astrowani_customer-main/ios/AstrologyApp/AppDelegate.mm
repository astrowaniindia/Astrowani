#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>

// react-native-firebase: the native Firebase SDK must be initialised before any
// Firebase module (messaging) is touched from JS, otherwise every FCM call fails
// with "No Firebase App '[DEFAULT]' has been created". This import resolves via
// the RNFBApp pod, so it only compiles once `pod install` has run.
#import <Firebase.h>

// @hot-updater/react-native. Its own header says bundleURL is "Callable from
// Objective-C (e.g. AppDelegate)" — and it must be, because the library installs no
// swizzle or +load hook (verified: no method_exchangeImplementations anywhere in its
// ios/ sources). Without the call in bundleURL below, iOS would download OTA updates
// and then keep launching the bundle baked into the .app — updates silently never
// applying, which is worse than them failing loudly.
#import <HotUpdater/HotUpdater.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Guard against a double-configure (hot reload, or a library that also calls
  // configure) — FIRApp raises if configured twice.
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }

  self.moduleName = @"AstrologyApp";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// ---------------------------------------------------------------------------
// Deep links / payment returns.
// Razorpay hands control back to us through the "astrowani" URL scheme declared
// in Info.plist (CFBundleURLTypes) after the customer completes a UPI payment in
// PhonePe / GPay / Paytm. Without this, iOS receives the callback and drops it,
// so the app never learns the payment finished and the order stays
// pending_payment — the same stuck state the missing Razorpay webhook produces
// (see CLAUDE.md subsystem Y, "Known gap").
// ---------------------------------------------------------------------------
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
}

- (BOOL)application:(UIApplication *)application
continueUserActivity:(nonnull NSUserActivity *)userActivity
 restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> *_Nullable))restorationHandler
{
  return [RCTLinkingManager application:application
                  continueUserActivity:userActivity
                    restorationHandler:restorationHandler];
}

// NOTE on push notification delegate methods:
// None are implemented here on purpose. Firebase's app-delegate proxying
// (FirebaseAppDelegateProxyEnabled, ON by default) makes RNFBMessaging install
// itself as the UNUserNotificationCenter delegate and handle APNs token
// registration automatically. Hand-writing
// didRegisterForRemoteNotificationsWithDeviceToken /
// didReceiveRemoteNotification here would compete with it for the same
// callbacks and silently swallow pushes — the iOS twin of the Android problem
// documented in AndroidManifest.xml, where registering
// RNPushNotificationListenerService intercepted FCM messages before our own
// handlers ran. If proxying is ever disabled, forward the methods explicitly
// rather than reimplementing them.

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // Release: ask HotUpdater which bundle to launch, so an OTA update actually takes
  // effect. It falls back to the packaged main.jsbundle when no OTA bundle is present
  // (BundleFileStorageService.selectLaunch -> getFallbackBundleURL), so a fresh install
  // behaves exactly as the previous line did.
  return [HotUpdater bundleURL];
#endif
}

@end
