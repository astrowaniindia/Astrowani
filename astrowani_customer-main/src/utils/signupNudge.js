// The short, friendly "you're one tiny sign-up away from the call" card.
//
// It is raised from two places that both sit BEFORE there is an account — the campaign
// reveal's "Haan! Mujhe free call chahiye" button and the carried-over gift bubble's
// claim — and it has to be drawn above the navigator, because both of those are about
// to navigate. So it lives here, as plain module state, and is rendered by
// components/SignupNudgeHost (mounted in App.js), exactly like pendingGiftBubble.js.
//
// Deliberately a reassurance, not a gate: it shows for a moment and the app then moves
// on to the signup step by itself. Nobody has to press anything to get past it.

let visible = false;
let listener = null;

export function showSignupNudge() {
  visible = true;
  if (listener) listener(true);
}

export function hideSignupNudge() {
  if (!visible) return;
  visible = false;
  if (listener) listener(false);
}

/** Fires immediately with the current state, so a late host still draws it. */
export function onSignupNudgeChange(fn) {
  listener = fn;
  fn(visible);
  return () => {
    if (listener === fn) listener = null;
  };
}
