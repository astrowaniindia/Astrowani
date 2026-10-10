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

// Queues the free-call sheet WITHOUT navigating — called from CampaignFreeCallPrompt,
// which runs before login. Login/signup owns navigation from there; Home picks this up
// via onFreeCallInviteOpen the moment it mounts, same as every other source — UNLESS
// SignupWelcome gets to it first (see peekPendingFreeCall below): a campaign visitor
// already said "yes" once on the prompt screen, so SignupWelcome skips its own
// intro/offer card entirely and jumps straight into booking instead of asking again.
export function queueFreeCallFromCampaign() {
  pending = 'campaign';
}

// Called when the campaign prompt is DISMISSED (cross), not accepted. They have
// already been asked once on that screen, so SignupWelcome must not ask again with
// its own "Claim my FREE call" card right after — this just suppresses that card
// (see peekPendingFreeCall below); it does NOT queue or redirect to anything.
export function queueCampaignDeclined() {
  pending = 'campaign_declined';
}

// Read without consuming — SignupWelcome uses this to decide whether to take over
// before Home ever mounts, without racing Home's own onFreeCallInviteOpen subscriber
// (which does not exist yet at that point in the stack).
export function peekPendingFreeCall() {
  return pending;
}

// SignupWelcome calls this once it has acted on the pending request (redirected, or
// decided there was nothing eligible to redirect to), so Home never fires a second,
// redundant open for the same campaign visit.
export function clearPendingFreeCall() {
  pending = null;
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
