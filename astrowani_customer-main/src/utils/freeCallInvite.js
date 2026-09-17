// Opens the free-call booking sheet on Home from outside Home — a tapped
// 'free_call_invite' push, or that notification's row in the notification list.
//
// Home may not be mounted yet (a cold start from a killed app delivers the tap
// before navigation is ready), so a request is remembered until Home subscribes
// and consumes it. Home re-asks the server before showing anything: the invite may
// have expired, or the customer may have booked since.

import { navigate } from './NavigationService';

let pending = false;
let listener = null;

export function openFreeCallFromInvite() {
  pending = true;
  navigate('DrawerNavigator', { screen: 'BottomTabs', params: { screen: 'Home', params: { screen: 'HomeScreen' } } });
  if (listener) {
    pending = false;
    listener();
  }
}

// Home registers here. Returns an unsubscribe function.
export function onFreeCallInviteOpen(fn) {
  listener = fn;
  if (pending) {
    pending = false;
    fn();
  }
  return () => {
    if (listener === fn) listener = null;
  };
}
