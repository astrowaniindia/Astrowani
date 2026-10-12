/**
 * Boot. Two entry points:
 *
 *   boot()       — the marketing pages. Wires the nav, the live roster and the
 *                  astrologer action buttons, then offers to rejoin a
 *                  consultation that is still running. Runs on import.
 *   bootScreen() — the consultation/wallet screens, which import this and then
 *                  run their own controller. Same wiring, minus the resume
 *                  offer: you are already on a consultation screen.
 *
 * Everything here is additive: if it fails to load, the site is exactly the
 * marketing site it was before — the bundled astrologer snapshot still renders
 * and the nav still works. That is why boot never throws past this file.
 */

import { wireAccountUi } from './account.js?v=25';
import { wireActionButtons } from './consult.js?v=25';
import { start as startRoster } from './astrologers.js?v=25';
import { isSignedIn } from './session.js?v=25';
import { fetchBalance } from './wallet.js?v=25';
import { showResumeBar } from './resume.js?v=25';
import { toast } from './ui.js?v=25';

let started = null;

/** Shared wiring, run once per page however boot is entered. */
export function bootScreen() {
  if (started) return started;
  started = (async () => {
    try {
      wireAccountUi();
      wireActionButtons();
      flushFlash();
    } catch (e) {
      console.error('[aw] UI wiring failed:', e);
    }
    startRoster().catch((e) => console.warn('[aw] roster start failed:', e.message));
    if (isSignedIn()) fetchBalance().catch(() => {});
  })();
  return started;
}

/**
 * A message handed over by the screen we just came from ("Chat ended.", "Your
 * balance ran out…"). Shown here because that screen navigated away the moment
 * it produced the message.
 */
function flushFlash() {
  try {
    const msg = sessionStorage.getItem('aw_flash');
    if (msg) {
      sessionStorage.removeItem('aw_flash');
      setTimeout(() => toast(msg, { duration: 5000 }), 300);
    }
  } catch (_) {}
}

// chat.html and call.html import bootScreen() from this module, so importing it
// must not also run the marketing-page boot — they are already running a
// consultation and must never be offered one to "resume".
const OWN_SCREENS = /\/(chat|call)\.html$/;
const isConsultationScreen = OWN_SCREENS.test(location.pathname);

async function boot() {
  await bootScreen();
  if (isSignedIn()) showResumeBar().catch((e) => console.warn('[aw] resume failed:', e.message));
}

if (!isConsultationScreen) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
