// Opens the free-call booking sheet on Home from outside Home:
//  - 'invite'      — a tapped 'free_call_invite' push, or that notification's row in the list
//  - 'low_balance' — the customer tried to chat/call with too little in their wallet
//                    (utils/insufficientBalanceAlert.js offers the free call instead)
//
// Home may not be mounted yet (a cold start from a killed app delivers the tap
// before navigation is ready), so a request is remembered until Home subscribes
// and consumes it. Home re-asks the server before showing anything: the invite may
// have expired, or the customer may have booked since.

import { navigate } from './NavigationService';

let pending = null; // the source of a request Home has not consumed yet
let listener = null;

export function openFreeCallSheet(source = 'invite') {
  pending = source;
  navigate('DrawerNavigator', { screen: 'BottomTabs', params: { screen: 'Home', params: { screen: 'HomeScreen' } } });
  if (listener) {
    pending = null;
    listener(source);
  }
}

export function openFreeCallFromInvite() {
  openFreeCallSheet('invite');
}

// Home registers here. The listener receives the source. Returns an unsubscribe function.
export function onFreeCallInviteOpen(fn) {
  listener = fn;
  if (pending) {
    const source = pending;
    pending = null;
    fn(source);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}
