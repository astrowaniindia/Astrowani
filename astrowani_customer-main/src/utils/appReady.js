// Home tells App.js when it actually has something worth showing, so the intro
// splash can stay up until then instead of lifting the moment the navigator
// mounts. Without this the customer watched Home assemble itself — empty screen,
// then banners and astrologer cards popping in one by one (2026-10-02).
//
// Deliberately a plain module, not context: App.js sits ABOVE the navigator that
// renders Home, so there is no provider both can share, and this is a one-shot
// signal rather than state anything re-renders on.
let ready = false;
const listeners = new Set();

export function markHomeReady() {
  if (ready) return;
  ready = true;
  for (const cb of listeners) {
    try { cb(); } catch (_) {}
  }
  listeners.clear();
}

// Fires immediately if Home was already ready (it can mount and finish before
// App.js gets around to subscribing). Returns an unsubscribe.
export function onHomeReady(cb) {
  if (ready) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}
