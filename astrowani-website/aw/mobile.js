/**
 * Mobile behaviours the CSS cannot express.
 *
 * Most Astrowani customers are on a phone, so these are not polish — a
 * consultation that is being billed per minute has to stay usable while the
 * keyboard is open and while the phone wants to sleep.
 */

/**
 * Keep a full-height screen matching the ACTUALLY visible viewport.
 *
 * `100dvh` handles the address bar, and on Android Chrome it also shrinks when
 * the keyboard opens. iOS Safari does NOT: it leaves the layout viewport alone
 * and slides the page up instead, so a `dvh`-sized chat keeps its composer
 * under the keyboard and the user types blind. visualViewport is the only thing
 * that reports the real height there.
 *
 * Writes `--aw-vh`, which .aw-screen prefers over dvh.
 */
export function trackViewportHeight() {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  let frame = null;
  const apply = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--aw-vh', `${Math.round(vv.height)}px`);
    });
  };

  apply();
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  return () => {
    vv.removeEventListener('resize', apply);
    vv.removeEventListener('scroll', apply);
    document.documentElement.style.removeProperty('--aw-vh');
  };
}

/**
 * Keep the newest message visible when the keyboard opens or the viewport
 * changes. Without this the log keeps its old scroll position and the reply the
 * customer is answering scrolls out of sight the moment they tap the input.
 */
export function keepScrolledToLatest(logEl) {
  if (!logEl) return () => {};
  const toBottom = () => { logEl.scrollTop = logEl.scrollHeight; };
  const vv = window.visualViewport;
  vv?.addEventListener('resize', toBottom);
  window.addEventListener('orientationchange', toBottom);
  return () => {
    vv?.removeEventListener('resize', toBottom);
    window.removeEventListener('orientationchange', toBottom);
  };
}

/**
 * Hold a screen wake lock for the duration of a call.
 *
 * A phone that dims and locks mid-consultation suspends the page, which drops
 * the socket and can tear down the call the customer is paying for. Best
 * effort: unsupported browsers (and a refused request) just carry on, and the
 * lock is re-taken when the tab becomes visible again because the browser
 * releases it on hide.
 */
export function keepAwake() {
  if (!('wakeLock' in navigator)) return () => {};

  let lock = null;
  let released = false;

  const acquire = async () => {
    if (released || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch (_) {
      // Denied or unavailable — not worth telling the user about.
    }
  };

  const onVisible = () => { if (!lock) acquire(); };

  acquire();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisible);
    try { lock?.release(); } catch (_) {}
    lock = null;
  };
}

/**
 * Mobile browsers refuse to start audio that was not triggered by a gesture.
 * A call always begins with a tap, but the remote track arrives seconds later,
 * by which time the gesture has expired on some browsers — so a blocked
 * `play()` is retried on the next touch rather than leaving a silent call.
 */
export function ensureAudioPlays(audioEl) {
  if (!audioEl) return () => {};
  let wired = false;

  const retry = () => {
    audioEl.play().catch(() => {
      if (wired) return;
      wired = true;
      const once = () => {
        audioEl.play().catch(() => {});
        document.removeEventListener('touchend', once);
        document.removeEventListener('click', once);
      };
      document.addEventListener('touchend', once, { once: true });
      document.addEventListener('click', once, { once: true });
    });
  };

  audioEl.addEventListener('loadedmetadata', retry);
  return () => audioEl.removeEventListener('loadedmetadata', retry);
}

/** True for a touch-first, phone-sized viewport. */
export function isPhone() {
  return window.matchMedia('(max-width: 560px), (pointer: coarse) and (max-width: 820px)').matches;
}
