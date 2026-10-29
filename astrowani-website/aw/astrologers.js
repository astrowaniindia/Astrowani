import { api } from './api.js?v=44';
import { getSocket } from './socket.js?v=44';

/**
 * The live astrologer roster.
 *
 * The page first paints from the bundled snapshot in astrologers-data.js, then
 * this replaces it with `/api/astrologers` — the exact same payload the apps
 * render, including the per-service toggles, real per-minute prices and the
 * derived online/offline/busy state. So an astrologer who switches chat off in
 * the vendor app is chat-off on the website too, within seconds.
 *
 * Freshness comes from `astrologers_changed`, which the backend broadcasts to
 * every connected socket whenever a customer-visible column changes. That is the
 * same signal the apps use, and it is already filtered server-side so the
 * per-minute billing writes do not spam it (CLAUDE.md DL).
 */

let live = [];
let loaded = false;
const listeners = new Set();

export function getLiveAstrologers() {
  return live;
}

export function findAstrologer(id) {
  return live.find((a) => String(a.id) === String(id)) || null;
}

export function onRosterChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Map the backend row to the shape every rendering path on this site already
 * expects, keeping the raw fields alongside so consult flows can read
 * isBusy/isOffline without a second lookup.
 */
function mapRow(row) {
  const cats = Array.isArray(row.categoryNames) && row.categoryNames.length
    ? row.categoryNames
    : (row.specialties || []).map((s) => s.name).filter(Boolean);

  return {
    id: row.userId || row._id,
    name: row.name || 'Astrologer',
    // The bundled snapshot ships local files named <uuid>.jpg; the API returns a
    // real URL. Prefer the API's, fall back to the local copy, so a roster that
    // loads before the images do still shows a face.
    photoUrl: row.profileImage || '',
    photo: `${row.userId || row._id}.jpg`,
    exp: Number(row.experience) || 0,
    lang: Array.isArray(row.language) ? row.language.join(', ') : (row.language || 'Hindi, English'),
    rating: Number(row.rating) || 0,
    reviews: Number(row.totalReviews) || 0,
    chat: Number(row.chatPrice) || 0,
    call: Number(row.chargePerMinute) || 0,
    video: Number(row.videoPrice) || 0,
    chatOn: row.isChatEnabled === true,
    callOn: row.isCallEnabled === true,
    videoOn: row.isVideoEnabled === true,
    badge: row.badgeType || null,
    cats: cats.length ? cats : ['Vedic Astrology'],
    // Live state — not part of the snapshot shape, used for the status pill and
    // to stop a consultation being started against someone who cannot take it.
    isOnline: row.isOnline !== false,
    isOffline: row.isOffline === true,
    isBusy: row.isBusy === true,
    busyReason: row.busyReason || null,
    isLoggedOut: row.isLoggedOut === true,
  };
}

/** Fetch the roster and repaint every astrologer surface on the page. */
export async function refresh() {
  try {
    const res = await api.get('/api/astrologers', { auth: false });
    const rows = Array.isArray(res) ? res : (res?.data || res?.astrologers || []);
    if (!Array.isArray(rows) || !rows.length) return live;

    live = rows.map(mapRow);
    loaded = true;

    // Replace the snapshot in place. Every render path on the site reads this
    // global, so this is the single switch from bundled data to live data.
    window.ASTROWANI_ASTROLOGERS = live;

    if (typeof window.ASTROWANI_RENDER_ASTROLOGERS === 'function') {
      window.ASTROWANI_RENDER_ASTROLOGERS();
    }
    paintStatus();
    listeners.forEach((fn) => {
      try { fn(live); } catch (e) { console.error('[aw/astrologers] listener failed:', e); }
    });
  } catch (err) {
    // A failed roster read leaves the bundled snapshot on screen, which is a
    // perfectly good page — never blank the grid over a network blip.
    console.warn('[aw/astrologers] roster refresh failed:', err.message);
  }
  return live;
}

/**
 * Stamp the live status pill onto every rendered card.
 *
 * Done as a DOM pass rather than inside the card template because the template
 * is shared with the bundled snapshot, which has no status to show — and
 * because a status change should not have to rebuild (and re-animate) the grid.
 */
export function paintStatus() {
  if (!loaded) return;
  document.querySelectorAll('.astro-card[data-astro-id]').forEach((card) => {
    const a = findAstrologer(card.getAttribute('data-astro-id'));
    const slot = card.querySelector('[data-aw-status]');
    if (!a || !slot) return;

    let label = '';
    let cls = '';
    if (a.isLoggedOut || a.isOffline) {
      label = 'Offline';
      cls = 'is-offline';
    } else if (a.isBusy) {
      label = a.busyReason === 'live' ? 'Live now' : 'Busy';
      cls = a.busyReason === 'live' ? 'is-live' : 'is-busy';
    } else {
      label = 'Online';
      cls = 'is-online';
    }
    slot.className = `astro-status ${cls}`;
    slot.textContent = label;

    // An offline or busy astrologer keeps their buttons visible but inert —
    // the same decision the apps made deliberately (CLAUDE.md: disappearing
    // cards looked unprofessional). The click handler explains why.
    card.querySelectorAll('[data-aw-action]').forEach((btn) => {
      btn.classList.toggle('is-unavailable', a.isOffline || a.isBusy || a.isLoggedOut);
    });
  });
}

export async function start() {
  await refresh();
  try {
    const socket = await getSocket();
    // Coalesced: a burst of changes (an astrologer toggling several services at
    // once) should cost one refetch, not one per column.
    let pending = null;
    socket.on('astrologers_changed', () => {
      clearTimeout(pending);
      pending = setTimeout(() => refresh(), 600);
    });
  } catch (err) {
    console.warn('[aw/astrologers] live updates unavailable:', err.message);
  }
  // A plain interval as the floor, for a tab whose socket died quietly.
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, 60000);
}
