// Why an astrologer cannot be reached, in ONE place.
//
// Four card surfaces render this state — ReusableList (the Chat/Talk/Video section
// lists), ExpertsList (category screens), Home's carousel, and AstrologerInfo's
// profile dock. Each used to test `item.isOnline === false` itself, which was fine
// while there was one reason; there are now two that must read differently, and
// four copies of a precedence rule drift apart the first time one is edited alone.
//
// The two states, and why they are not the same thing:
//
//   'logged_out' — signed out of the vendor app. Nothing reaches them: no socket,
//                  no push (the token is cleared on logout). They did not choose
//                  to advertise this, so it reads as "Unavailable".
//
//   'offline'    — they are signed in and chose to be unreachable: either the
//                  master Online/Offline switch is off, or all three service
//                  toggles are off, which the backend collapses into one
//                  `isOffline`. Reads as "Offline".
//
// Anything else (one or two services off) is NOT unreachable — those stay
// per-button red states, decided by the individual isChatEnabled/isCallEnabled/
// isVideoEnabled flags at each call site.

export const UNREACHABLE_LOGGED_OUT = 'logged_out';
export const UNREACHABLE_OFFLINE = 'offline';

/**
 * @returns 'logged_out' | 'offline' | null
 */
export function unreachableState(item) {
  if (!item) return null;
  // Signed out wins: it is the stronger statement, and an astrologer can easily be
  // both (they were offline when they signed out).
  if (item.isLoggedOut === true) return UNREACHABLE_LOGGED_OUT;
  if (item.isOffline === true) return UNREACHABLE_OFFLINE;
  // Fallback for a backend that predates isOffline — it still sends isOnline, and
  // an app that ignored it would show live buttons for someone switched off.
  if (item.isOnline === false) return UNREACHABLE_OFFLINE;
  return null;
}

/** Button label key for a state from unreachableState(). */
export function unreachableLabelKey(state) {
  return state === UNREACHABLE_LOGGED_OUT ? 'common.unavailable' : 'common.offline';
}

/** MaterialIcons name to sit beside that label. */
export function unreachableIcon(state) {
  return state === UNREACHABLE_LOGGED_OUT ? 'do-not-disturb-on' : 'wifi-off';
}

/** i18n key for the alert body shown when the pill is tapped. */
export function unreachableAlertKey(state) {
  return state === UNREACHABLE_LOGGED_OUT
    ? 'alerts.astrologerUnavailable'
    : 'alerts.astrologerOffline';
}

/** `reason` for the consult_blocked analytics event, so the two are countable apart. */
export function unreachableReason(state) {
  return state === UNREACHABLE_LOGGED_OUT ? 'astrologer_logged_out' : 'astrologer_offline';
}
