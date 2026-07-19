// Shared between index.js's notifee background handler (no live navigation prop there) and
// NavigationScreen.js (which owns the actual NavigationContainer). A plain {current} object
// works as a React ref target exactly like useRef() — the difference is it's a module
// singleton, so index.js can call `.current.navigate(...)` the instant a notification's
// Accept button is pressed, without waiting for an AppState transition that may never fire.
// Confirmed on-device: pulling down the notification shade without the app ever truly losing
// foreground state writes the pendingCallNavigation flag (see index.js) but fires neither
// onReady (not a cold start) nor an AppState 'active' transition (never left 'active') —
// leaving it stuck unconsumed. Navigating directly here closes that gap.
export const navigationRef = { current: null };
