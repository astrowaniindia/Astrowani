import { toast } from './ui.js?v=34';
import { findAstrologer } from './astrologers.js?v=34';

/**
 * Turning a "Chat / Call / Video" button into a consultation.
 *
 * This no longer runs the consultation — it routes to a real screen
 * (chat.html / call.html), which owns the whole flow from request to hangup.
 * Overlays are reserved for signing in.
 *
 * The checks kept here are the ones that need no network and would otherwise
 * cost a wasted page load: the service toggle, offline, and busy. Auth, funds
 * and the actual request all happen on the destination screen, so a direct link
 * to chat.html behaves exactly like a click here.
 */

const MODE = {
  chat: { label: 'chat', toggle: 'chatOn', href: (id) => `chat.html?astrologer=${encodeURIComponent(id)}` },
  call: { label: 'voice call', toggle: 'callOn', href: (id) => `call.html?astrologer=${encodeURIComponent(id)}&type=audio` },
  video: { label: 'video call', toggle: 'videoOn', href: (id) => `call.html?astrologer=${encodeURIComponent(id)}&type=video` },
};

export function startConsultation(mode, astrologerId) {
  const cfg = MODE[mode];
  if (!cfg) return;

  const astro = findAstrologer(astrologerId);

  // No roster yet (a very early click, or a failed roster fetch) — route anyway.
  // The destination screen re-reads the astrologer and the backend re-checks
  // everything that matters, so the worst case is a clear message one screen later.
  if (!astro) {
    window.location.href = cfg.href(astrologerId);
    return;
  }

  if (!astro[cfg.toggle]) {
    toast(`${astro.name} is not taking ${cfg.label}s right now.`, { kind: 'error' });
    return;
  }
  if (astro.isOffline || astro.isLoggedOut) {
    toast(`${astro.name} is offline right now.`, { kind: 'error' });
    return;
  }
  if (astro.isBusy) {
    toast(
      astro.busyReason === 'live'
        ? `${astro.name} is live right now and cannot take a ${cfg.label}.`
        : `${astro.name} is with someone else right now. Please try again shortly.`,
      { kind: 'error' },
    );
    return;
  }

  window.location.href = cfg.href(astrologerId);
}

/** Global click handler for every astrologer action button on the site. */
export function wireActionButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-aw-action][data-astro-id]');
    if (!btn) return;
    const action = btn.getAttribute('data-aw-action');
    if (!MODE[action]) return;
    e.preventDefault();
    startConsultation(action, btn.getAttribute('data-astro-id'));
  });
}
