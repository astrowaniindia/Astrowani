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

const CHANNEL_ID = 'astrowani-default'; // same channel PushNotification.js already created
const NOTIFICATION_ID = 'active-session';

// `screen`/`params` let a tap navigate straight back into the live call/chat room
// (see PushNotification.js's handleNotificationTap + Navigation.js's pending-navigation
// consumer) instead of just relying on Android's default "bring app to front" behavior,
// which only resumes the right screen if the app process is still alive — a tap after
// Android has fully killed a backgrounded app would otherwise land on the normal start
// screen instead of the call/chat room.
export function showActiveSessionNotification({ title, message, screen, params }) {
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

export function hideActiveSessionNotification() {
  PushNotification.cancelLocalNotification(NOTIFICATION_ID);
}
