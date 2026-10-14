// The gift bubble that FOLLOWS the customer from the campaign reveal to Home.
//
// CampaignGiftReveal's ✕ collapses the whole screen into Home's gift bubble and drops
// it in the bottom-right corner (see that screen's dismissIntoBubble). Without this
// module that bubble would vanish the instant the screen was replaced by Login, which
// undoes the whole point of the animation: the customer watched the prize be PUT
// somewhere, so it has to still be there while they sign up, and still be there when
// they arrive on Home.
//
// It is therefore drawn ABOVE the navigator (components/PendingGiftBubbleHost, mounted
// in App.js) rather than by any screen — a screen-owned bubble cannot outlive its
// screen. Home hides it on mount, because at that point Home's own FreeCallGiftBubble
// takes over and two identical bubbles in one corner is one too many.
//
// In-memory only, deliberately: this is continuity for ONE journey. If the app is
// killed before Home, there is nothing to carry over and the bubble should not come
// back from the dead on the next cold start.

let visible = false;
let listener = null;
// WHERE the carried-over bubble rests. The two bubbles this one stands in for sit at
// different heights on purpose: Home's clears the bottom tab bar, the pre-login
// screens have no tab bar and want it lower. Standing in for the wrong one makes the
// gift visibly jump the moment the real bubble takes over, which is exactly what this
// hand-over exists to prevent.
let placement = 'prelogin'; // 'prelogin' | 'home'

/**
 * The screen has collapsed into the corner — keep that bubble on screen.
 * `where` is the bubble this one is standing in for, so it lands on its coordinates.
 */
export function showPendingGift(where = 'prelogin') {
  visible = true;
  placement = where === 'home' ? 'home' : 'prelogin';
  if (listener) listener(true, placement);
}

/** Where the bubble is currently resting, for a host mounting mid-journey. */
export function peekPendingGiftPlacement() {
  return placement;
}

/** Home is up (or the journey ended): its own bubble takes it from here. */
export function hidePendingGift() {
  if (!visible) return;
  visible = false;
  if (listener) listener(false, placement);
}

/**
 * The host subscribes here. Fires immediately with the current state so a host that
 * mounts after showPendingGift() still draws the bubble. Returns an unsubscribe.
 */
export function onPendingGiftChange(fn) {
  listener = fn;
  fn(visible, placement);
  return () => {
    if (listener === fn) listener = null;
  };
}
