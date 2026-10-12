/**
 * Shared overlay/toast primitives.
 *
 * Everything the web client shows — sign-in, recharge, the ringing screen, the
 * chat room, the call screen — is an overlay injected into whatever page the
 * visitor is already on, never a navigation. That is what the owner asked for
 * ("make it a popup, do not add separate pages"), and it also means a call or
 * chat is not destroyed by a stray click on a nav link.
 */

let scrollLocks = 0;

function lockScroll() {
  scrollLocks += 1;
  document.documentElement.style.overflow = 'hidden';
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.documentElement.style.overflow = '';
}

/**
 * Create an overlay. Returns a handle with the element and a close function.
 *
 * `dismissible: false` is used by the call and chat screens — a consultation is
 * costing the customer money per minute, so it must never be closable by a
 * mis-click on the backdrop or a stray Escape. Those screens provide their own
 * explicit "End" control that settles billing properly.
 */
export function createOverlay({ className = '', dismissible = true, onClose } = {}) {
  const root = document.createElement('div');
  root.className = `aw-overlay ${className}`.trim();
  root.innerHTML = '<div class="aw-overlay-backdrop"></div><div class="aw-overlay-body" role="dialog" aria-modal="true"></div>';

  const body = root.querySelector('.aw-overlay-body');
  const backdrop = root.querySelector('.aw-overlay-backdrop');

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.remove('is-open');
    unlockScroll();
    document.removeEventListener('keydown', onKey);
    // Let the fade-out finish before removing, but never leave the node behind
    // if the transition never fires (reduced motion, background tab).
    setTimeout(() => root.remove(), 220);
    if (onClose) {
      try { onClose(); } catch (e) { console.error('[aw/ui] onClose failed:', e); }
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) close();
  }

  if (dismissible) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  document.body.appendChild(root);
  lockScroll();
  // Next frame, so the opening transition actually runs.
  requestAnimationFrame(() => root.classList.add('is-open'));

  return { root, body, close };
}

/** Brief non-blocking message. Used for errors that do not deserve a modal. */
export function toast(message, { kind = 'info', duration = 3800 } = {}) {
  let host = document.querySelector('.aw-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'aw-toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `aw-toast aw-toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-open'));
  setTimeout(() => {
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

/** Escape text that came from the backend before it goes anywhere near innerHTML. */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A confirm dialog that resolves to true/false, styled like the rest of the site. */
export function confirmDialog({ title, message, confirmLabel = 'Yes', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let settled = false;
    const { body, close } = createOverlay({
      className: 'aw-confirm',
      onClose: () => { if (!settled) { settled = true; resolve(false); } },
    });
    body.innerHTML = `
      <div class="aw-card aw-card-sm">
        <h3 class="aw-card-title">${esc(title)}</h3>
        <p class="aw-card-text">${esc(message)}</p>
        <div class="aw-card-actions">
          <button type="button" class="aw-btn aw-btn-ghost" data-act="cancel">${esc(cancelLabel)}</button>
          <button type="button" class="aw-btn aw-btn-gold" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    body.querySelector('[data-act="ok"]').addEventListener('click', () => {
      settled = true;
      resolve(true);
      close();
    });
    body.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      settled = true;
      resolve(false);
      close();
    });
  });
}

/** Load a third-party script once (Razorpay checkout, socket.io client). */
const scriptPromises = new Map();
export function loadScript(src) {
  if (scriptPromises.has(src)) return scriptPromises.get(src);
  const p = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
  scriptPromises.set(src, p);
  return p;
}
