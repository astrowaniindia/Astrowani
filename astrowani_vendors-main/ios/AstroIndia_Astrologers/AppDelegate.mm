#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

// react-native-firebase: the native Firebase SDK must be initialised before any
// Firebase module (messaging) is touched from JS, otherwise every FCM call fails
// with "No Firebase App '[DEFAULT]' has been created". This import resolves via
// the RNFBApp pod, so it only compiles once `pod install` has run.
#import <Firebase.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Guard against a double-configure (hot reload, or a library that also calls
  // configure) — FIRApp raises if configured twice.
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }

  self.moduleName = @"AstroIndia_Astrologers";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
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
// handlers ran.
//
// This app also uses @notifee/react-native for local notifications. Notifee
// installs its own delegate handling via its pod and likewise needs no
// AppDelegate code here for basic display. If notification TAPS ever fail to
// reach JS, that is the thing to investigate first — not a reason to start
// hand-forwarding delegate methods, which is what breaks Firebase.
//
// No RCTLinkingManager hooks either: unlike the customer app, this app has no
// Razorpay payment return and no configured deep links (otpless-react-native is
// present in package.json but startOtpVerification.js is imported by nothing).
// Add them here if a URL scheme is ever introduced.

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
