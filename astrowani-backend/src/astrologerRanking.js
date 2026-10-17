// astrowani-backend/src/astrologerRanking.js
//
// The default order of every customer-facing astrologer list.
//
// WHY THIS EXISTS. `GET /api/astrologers` and `/liveAstrologers` issued their
// PostgREST queries with NO `.order()` at all, so rows came back in physical
// table order — i.e. roughly the order astrologers signed up, forever. On
// 2026-10-17 that meant rows 2, 3 and 4 of the table (all offline, with every
// service toggle off) were the first three cards on the customer Home screen,
// in BOTH the "Chat & Call with Astrologer" and "Video Call with Astrologers"
// carousels, while 31 of the 58 visible astrologers were online and reachable
// at that moment. The lists were live and refreshing correctly the whole time —
// they were simply never ranked, so a dead card could never be displaced by a
// live one.
//
// THE RULE: someone a customer can actually reach right now outranks someone
// they cannot. Everything else (rating, experience) only breaks ties inside a
// tier, so a 5-star astrologer who is offline still sits below a reachable one.
//
// This runs on the formatted rows, not the database rows, deliberately: the
// "can this person be reached" decision already lives in formatAstrologer as
// `isOffline` / `isLoggedOut` (derived there precisely so the five card
// surfaces in the app do not each re-implement it). Ranking on the same fields
// means the order can never disagree with the pill the card draws.

/**
 * Can a customer reach this astrologer at all right now?
 *
 * `isOffline` is already the union of "switched themselves off" and "has every
 * service off" (see formatAstrologer), so there is nothing extra to check.
 *
 * BUSY IS DELIBERATELY NOT AN AXIS HERE. A busy astrologer is online and will
 * be free again shortly, which is a different situation from offline or signed
 * out — the same call the customer app's sortReachableFirst already made, and
 * these two orders must not disagree. Ranking on busy-ness would also reorder
 * every list each time anybody started or ended a session, which is churn the
 * customer sees as cards moving under their thumb for no reason they caused.
 */
function isReachable(a) {
  if (!a) return false;
  if (a.isOffline === true || a.isLoggedOut === true) return false;
  // Fallback for a row predating isOffline — it still carries isOnline.
  return a.isOnline !== false;
}

/**
 * Default comparator for a customer-facing list.
 *
 * The tiebreakers after reachability are rating, then experience, then id. The
 * id is NOT decoration: without a total order, two astrologers with the same
 * rating and experience could swap places between two refetches of the same
 * unchanged data, and these lists refetch on every focus and on every Realtime
 * change to the table. A card that moves on its own under the customer's thumb
 * is its own bug.
 */
function compareAstrologers(a, b) {
  const reach = (isReachable(b) ? 1 : 0) - (isReachable(a) ? 1 : 0);
  if (reach !== 0) return reach;

  const rating = (Number(b?.rating) || 0) - (Number(a?.rating) || 0);
  if (rating !== 0) return rating;

  const experience = (Number(b?.experience) || 0) - (Number(a?.experience) || 0);
  if (experience !== 0) return experience;

  return String(a?._id ?? '').localeCompare(String(b?._id ?? ''));
}

/**
 * Returns a NEW ranked array. Never mutates the caller's list — the formatted
 * rows are handed straight to the TTL cache and are shared by every concurrent
 * request for the 10s window, so sorting in place would be reordering an array
 * another request may already be serializing.
 */
function rankAstrologers(list) {
  if (!Array.isArray(list)) return [];
  return list.slice().sort(compareAstrologers);
}

module.exports = { rankAstrologers, compareAstrologers, isReachable };
