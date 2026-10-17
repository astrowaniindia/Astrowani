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

/**
 * Reachable astrologers first, unreachable ones (offline or logged out, per
 * unreachableState() above) pushed to the bottom as one block — not interleaved, not
 * re-sorted within each group. Used by the three "pick an astrologer" list screens
 * (Chat, Talk-to-Experts/Call, Video) so a customer scrolling sees everyone who can
 * actually be reached before reaching the people who cannot.
 *
 * Deliberately NOT a busy-first sort too: a busy astrologer is online and will be
 * free again shortly, which is a different situation from offline/logged-out and the
 * owner only asked to sink the second kind.
 *
 * Implemented as two filter passes rather than a custom Array.sort comparator, so the
 * relative order WITHIN each group is exactly the order the backend returned — a sort
 * comparator that returns 0 for "same group" relies on the engine's sort being stable,
 * and nothing here needs to depend on that.
 */
export function sortReachableFirst(list) {
  if (!Array.isArray(list)) return list;
  const reachable = [];
  const unreachable = [];
  for (const item of list) {
    (unreachableState(item) ? unreachable : reachable).push(item);
  }
  return [...reachable, ...unreachable];
}

// ── Per-section ordering ────────────────────────────────────────────────────
//
// `sortReachableFirst` above is the right order for a screen dedicated to ONE
// service, because the backend already filtered or the whole list is relevant.
// Home is different: it fetches `/api/astrologers` once and renders it in two
// carousels — "Chat & Call with Astrologer" and "Video Call with Astrologers" —
// so one order has to serve both, and it cannot. An astrologer who is online
// with video switched off is a dead card in the video row however reachable
// they are elsewhere.
//
// On 2026-10-17 both Home rows were drawn from the list in physical table
// order (the backend issued no ORDER BY at all), so the first three cards were
// rows 2-4 of the table — all offline, every toggle off — while 31 of 58
// astrologers were reachable. Measured against production, the chat/call row
// held 3 usable cards out of 12 and the video row 2 out of 12.
//
// THE SCORE:
//     +2  offers THIS section's service
//     +1  reachable (per unreachableState above)
//
// The service weight is the larger one on purpose: in the video row, somebody
// who cannot take a video call is not promoted over somebody who can merely by
// being awake. Busy is deliberately NOT an axis here, for the same reason
// sortReachableFirst leaves it out — a busy astrologer is online and will be
// free shortly, which is not the same as being unreachable, and ranking on it
// would also reshuffle the row every time anyone started or ended a session.

const SERVICE_FIELD = {
  chat: 'isChatEnabled',
  call: 'isCallEnabled',
  video: 'isVideoEnabled',
};

function sectionScore(item, services) {
  if (!item) return 0;
  let score = 0;
  // No services named = rank on reachability alone.
  const offersService =
    !services.length ||
    services.some(s => SERVICE_FIELD[s] && item[SERVICE_FIELD[s]] === true);
  if (offersService) score += 2;
  if (!unreachableState(item)) score += 1;
  return score;
}

/**
 * Returns a NEW array ordered for one section. `services` is the service(s) that
 * section actually offers, e.g. ['chat', 'call'] or ['video'].
 *
 * Nothing is ever filtered out: hiding unavailable astrologers was explicitly
 * rejected for this app (CLAUDE.md, "Service-Toggle Visibility Sync") — cards
 * stay put and show a red Unavailable/Offline state. This only decides who the
 * customer sees FIRST.
 *
 * Unlike sortReachableFirst this DOES rely on Array.prototype.sort being stable,
 * which is guaranteed since ES2019 and holds in Hermes. That is the point rather
 * than an accident: ties keep their incoming order, so the marquee's shuffle
 * survives inside each rank and the row stays varied between cold starts.
 */
export function orderForSection(list, services = []) {
  if (!Array.isArray(list)) return [];
  const wanted = Array.isArray(services) ? services : [services];
  return list.slice().sort((a, b) => sectionScore(b, wanted) - sectionScore(a, wanted));
}
