// Where the customer has parked the floating gift bubble.
//
// ONE position for every gift bubble in the app — the pre-login one carried over from
// the campaign reveal (components/PendingGiftBubbleHost) and Home's own
// (components/FreeCallGiftBubble). They are meant to read as the same object followed
// from screen to screen, so a bubble that jumped back to the corner on reaching Home
// would undo exactly that.
//
// Stored as an OFFSET from each bubble's own resting corner, not as absolute
// coordinates: the two bubbles rest at different heights on purpose (Home's clears the
// tab bar), and an absolute position would drag one of them onto something.
//
// Persisted, because moving it is a preference, not a gesture: a bubble that returned
// to the corner on the next launch would have to be moved again every time.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'giftBubbleOffset';

// Mirrors storage so a bubble mounting mid-session draws in the right place on its
// FIRST frame instead of appearing in the corner and jumping.
let cached = null;

export function peekGiftBubblePos() {
  return cached;
}

export async function loadGiftBubblePos() {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    cached = parsed;
    return cached;
  } catch (_) {
    return null;
  }
}

export function saveGiftBubblePos(pos) {
  cached = pos;
  // Fire and forget: the bubble has already moved on screen, and a failed write only
  // costs the position at the next launch.
  AsyncStorage.setItem(KEY, JSON.stringify(pos)).catch(() => {});
}
