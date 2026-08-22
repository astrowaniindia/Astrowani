// Persistent "session still active" notification — shown for the whole time a call or
// chat is actually connected/billing, independent of whether the app is foregrounded or
// backgrounded. Money bug this fixes: pressing the phone's own Home button backgrounds
// the app but does NOT end the call/chat — WebRTC keeps running and the customer's wallet
// keeps getting billed — with nothing on screen to remind them it's still going. This
// mirrors how a real phone dialer keeps an ongoing-call notification up the whole time.
//
// Uses react-native-push-notification (already a dependency, see src/utils/PushNotification.js)
// rather than adding a new notification library. `ongoing: true` + `autoCancel: false` means
// it can't be swiped away — only cancelLocalNotification() (called when the session actually
// ends) removes it, so it can't be dismissed by accident and leave the customer unaware.
import PushNotification from 'react-native-push-notification';
import { startCallForegroundService, stopCallForegroundService } from './callForegroundService';

const CHANNEL_ID = 'astrowani-default'; // same channel PushNotification.js already created
const NOTIFICATION_ID = 'active-session';

// `screen`/`params` let a tap navigate straight back into the live call/chat room
// (see PushNotification.js's handleNotificationTap + Navigation.js's pending-navigation
// consumer) instead of just relying on Android's default "bring app to front" behavior,
// which only resumes the right screen if the app process is still alive — a tap after
// Android has fully killed a backgrounded app would otherwise land on the normal start
// screen instead of the call/chat room.
// `kind` decides the MECHANISM, and for calls the mechanism matters, not just the
// notification. A plain ongoing notification keeps the user informed but does nothing
// to stop Android silencing the microphone once the app leaves the foreground — which
// it does from Android 11, and which from Android 14 only a foreground service of type
// `microphone` prevents. So:
//
//   kind: 'call' → start the native foreground service, which posts its OWN ongoing
//                  notification. Exactly one notification, and the mic keeps working.
//   kind: 'chat' → the local notification as before. Chat captures no audio, so it
//                  needs no service, and a service would be an unjustified
//                  always-on-mic privilege.
//
// See utils/callForegroundService.js and android/.../CallForegroundService.kt.
export function showActiveSessionNotification({ title, message, screen, params, kind = 'chat' }) {
  if (kind === 'call') {
    startCallForegroundService(title, message);
    return;
  }
  PushNotification.localNotification({
    id: NOTIFICATION_ID,
    channelId: CHANNEL_ID,
    ongoing: true,
    autoCancel: false,
    smallIcon: 'ic_notification',
    largeIcon: 'ic_launcher',
    title,
    message,
    userInfo: { type: 'active_session', screen, params: JSON.stringify(params || {}) },
  });
}

// Tears down both paths unconditionally. Each is a harmless no-op if it was not the
// one in use, and doing both means a mismatched show/hide pair can never leave an
// undismissable notification — or worse, a foreground service holding the mic open
// after the call has ended.
export function hideActiveSessionNotification() {
  PushNotification.cancelLocalNotification(NOTIFICATION_ID);
  stopCallForegroundService();
}
