#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

// react-native-firebase: the native Firebase SDK must be initialised before any
// Firebase module (messaging) is touched from JS, otherwise every FCM call fails
// with "No Firebase App '[DEFAULT]' has been created". This import resolves via
// the RNFBApp pod, so it only compiles once `pod install` has run.
#import <Firebase.h>

// CallKit / PushKit. Both headers come from pods that only exist after `pod install`:
//   RNCallKeep.h                    -> react-native-callkeep
//   RNVoipPushNotificationManager.h -> react-native-voip-push-notification
#import "RNCallKeep.h"
#import "RNVoipPushNotificationManager.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Guard against a double-configure (hot reload, or a library that also calls
  // configure) — FIRApp raises if configured twice.
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }

  // Register with PushKit. Must happen on every launch, including the launch that a VoIP
  // push itself triggers, or iOS has nowhere to deliver the push it just woke us for.
  [RNVoipPushNotificationManager voipRegistration];

  self.moduleName = @"AstroIndia_Astrologers";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

#pragma mark - PushKit (VoIP)

// The PushKit token, which is NOT the FCM token. Forwarded to JS, which posts it to
// POST /api/vendor/voip-token (see src/utils/callKeep.js).
- (void)pushRegistry:(PKPushRegistry *)registry
didUpdatePushCredentials:(PKPushCredentials *)credentials
             forType:(PKPushType)type
{
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

// ---------------------------------------------------------------------------
// THE CRITICAL METHOD.
//
// iOS requires that a VoIP push report a call to CallKit essentially immediately. If it
// does not, iOS terminates the app, and repeat offences revoke the app's VoIP push
// privilege outright. That is why reportNewIncomingCall is called HERE, in native code,
// rather than from JS: when this fires on a killed app, the React Native bridge does not
// exist yet and may take seconds to come up. By the time src/utils/callKeep.js runs, the
// phone is already ringing.
//
// Consequences of that rule, which shape everything below:
//   * There is exactly ONE early return, and it still reports a call first.
//   * A malformed payload does NOT abort — a UUID is synthesised so a call is still
//     reported, and JS ends it a moment later. Reporting a bogus call that immediately
//     disappears is recoverable; failing to report one is not.
//   * The backend never sends a VoIP push for anything other than a real incoming call —
//     notably NOT for cancellations. See the `cancel_call` comment in the backend's
//     index.js for why.
// ---------------------------------------------------------------------------
- (void)pushRegistry:(PKPushRegistry *)registry
didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
             forType:(PKPushType)type
withCompletionHandler:(void (^)(void))completion
{
  NSDictionary *data = payload.dictionaryPayload;

  // The backend sets `uuid` to the sessionId, which is already a real UUID, so the same
  // identifier ties the push, the CallKit call and our accept call together. Synthesise
  // one only if it is somehow missing — see the "no early return" rule above.
  NSString *uuid = data[@"uuid"];
  if (![uuid isKindOfClass:[NSString class]] || uuid.length == 0) {
    uuid = [[NSUUID UUID] UUIDString];
    NSLog(@"[VoIP] payload had no uuid; synthesised %@ so a call is still reported", uuid);
  }

  NSString *callerName = data[@"callerName"];
  if (![callerName isKindOfClass:[NSString class]] || callerName.length == 0) {
    callerName = @"Astrowani";
  }

  NSString *callType = data[@"callType"];
  BOOL hasVideo = [callType isKindOfClass:[NSString class]] && [callType isEqualToString:@"video"];

  // Hand the payload to JS as well, so callKeep.js can turn an answer into the right
  // acceptRequest call. On a killed app this is buffered natively and replayed via the
  // library's `didLoadWithEvents` once listeners attach.
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];

  // handleType "generic" (not "phoneNumber") because the caller is a customer account,
  // not a dialable number — using phoneNumber would put a bogus entry in the system
  // call log and offer a call-back that goes nowhere.
  // supportsHolding/DTMF/Grouping are all NO: a consultation is a single 1:1 session and
  // advertising controls that do nothing is worse than not offering them.
  [RNCallKeep reportNewIncomingCall:uuid
                            handle:callerName
                        handleType:@"generic"
                          hasVideo:hasVideo
               localizedCallerName:callerName
                   supportsHolding:NO
                      supportsDTMF:NO
                  supportsGrouping:NO
                supportsUngrouping:NO
                       fromPushKit:YES
                           payload:data
             withCompletionHandler:^{
               // Invoke iOS's completion handler only after CallKit has accepted the
               // report. Deliberately NOT paired with
               // RNVoipPushNotificationManager's addCompletionHandler: — using both
               // would risk calling `completion` twice, which crashes.
               if (completion) {
                 completion();
               }
             }];
}

// NOTE on push notification delegate methods:
// None are implemented here on purpose. Firebase's app-delegate proxying
// (FirebaseAppDelegateProxyEnabled, ON by default) makes RNFBMessaging install itself as
// the UNUserNotificationCenter delegate and handle APNs token registration
// automatically. Hand-writing didRegisterForRemoteNotificationsWithDeviceToken /
// didReceiveRemoteNotification here would compete with it for the same callbacks and
// silently swallow pushes — the iOS twin of the Android problem documented in
// AndroidManifest.xml, where registering RNPushNotificationListenerService intercepted
// FCM messages before our own handlers ran.
//
// PushKit above is a SEPARATE delivery path (PKPushRegistry, not UNUserNotificationCenter)
// so it does not conflict with Firebase's proxy at all.
//
// This app also uses @notifee/react-native for local notifications; it likewise needs no
// AppDelegate code here for basic display.
//
// No RCTLinkingManager hooks either: unlike the customer app, this app has no Razorpay
// payment return and no configured deep links (otpless-react-native is present in
// package.json but startOtpVerification.js is imported by nothing).

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
