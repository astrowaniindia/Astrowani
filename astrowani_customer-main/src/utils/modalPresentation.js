// Serialises native modal presentation so two modals never fight on iOS.
//
// THE BUG THIS EXISTS TO PREVENT
// On iOS every React Native <Modal> is a real presented UIViewController, and you
// cannot present onto a controller that is already presenting. When it happens the
// presentation silently fails and leaves an invisible modal holding all touch
// input: the app looks frozen — animations and video keep running, but no button
// responds — and whatever the second modal was asking (a payment confirm, an
// error) never appears. Android renders modals as plain views in one window and
// stacks them happily, which is why this class of bug only ever shows on iOS.
//
// The dangerous shape is a ROOT-level popup (StatusPopup, CustomAlert,
// ReviewPrompt, ...) firing while a SCREEN-level modal is still up — the root host
// sits below that modal in the hierarchy, so its presentation is exactly the case
// iOS refuses. Dismissing the screen modal first is not enough on its own either:
// dismissal is animated, so presenting in the same tick still races it.
//
// HOW TO USE IT
//   * Screen-level modal  -> useModalPresence(visible)
//         Declares "a modal is on screen right now". One line, no behaviour change.
//   * Root-level popup    -> const ready = useDeferredPresent(wanted)
//         Present with `visible={ready}` instead of `visible={wanted}`. Waits until
//         nothing else is presented, plus a beat for the dismissal animation.
//
// A modal that has not been wired up yet is simply invisible to the registry and
// behaves exactly as it does today, so adopting this is incremental and safe.
import {useEffect, useState} from 'react';
import {Platform} from 'react-native';

let presented = 0;
const listeners = new Set();

const notify = () => {
  listeners.forEach(fn => {
    try { fn(); } catch (_) {}
  });
};

export function presentedCount() {
  return presented;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Returns its own release function, so a double-release can't drive the count
// negative and wedge every future popup open.
export function acquireModalSlot() {
  presented += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    presented = Math.max(0, presented - 1);
    notify();
  };
}

// Declares that this component currently has a modal on screen.
export function useModalPresence(visible) {
  useEffect(() => {
    if (!visible) return undefined;
    return acquireModalSlot();
  }, [visible]);
}

/**
 * For root-level popups. Returns true only once it is actually safe to present.
 *
 * settleMs — a beat after the stack clears, so we are not presenting into the
 *            tail of somebody else's dismissal animation.
 *
 * THERE IS DELIBERATELY NO "PRESENT ANYWAY" TIMEOUT.
 * An earlier draft force-presented after a few seconds, on the theory that a
 * popup which never appears is its own bug. That reasoning was wrong twice over:
 *   1. The count is only non-zero while a modal is GENUINELY open, so presenting
 *      anyway is exactly the collision that freezes the app — the safety valve
 *      would have reintroduced the bug this module exists to prevent.
 *   2. Nothing is swallowed. This re-checks on every registry change, so a
 *      deferred popup appears the moment the stack clears. It is queued, not
 *      dropped, for as long as `wanted` stays true.
 * If the count ever did get stuck, the symptom would be popups silently never
 * appearing — so we warn loudly in development rather than fix it by freezing
 * the app in production.
 */
const STUCK_WARN_MS = 6000;

export function useDeferredPresent(wanted, {settleMs = 320} = {}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!wanted) {
      setReady(false);
      return undefined;
    }
    // Android stacks modals without complaint — deferring there would only add
    // latency to every popup for no benefit.
    if (Platform.OS !== 'ios') {
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    let settleTimer = null;

    const check = () => {
      if (cancelled) return;
      if (presentedCount() === 0) {
        if (settleTimer) return; // already counting down
        settleTimer = setTimeout(() => {
          settleTimer = null;
          if (!cancelled) setReady(true);
        }, settleMs);
      } else if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
    };

    const unsubscribe = subscribe(check);
    check();

    // Diagnostic only — never changes behaviour. Surfaces a stuck count in dev
    // instead of letting popups quietly stop appearing.
    const warnTimer = __DEV__
      ? setTimeout(() => {
          if (!cancelled && presentedCount() > 0) {
            console.warn(
              `[modalPresentation] a root popup has waited ${STUCK_WARN_MS}ms; ` +
                `${presentedCount()} modal(s) still registered as presented. ` +
                'If no modal is actually on screen, a useModalPresence() call is not releasing.',
            );
          }
        }, STUCK_WARN_MS)
      : null;

    return () => {
      cancelled = true;
      unsubscribe();
      if (settleTimer) clearTimeout(settleTimer);
      if (warnTimer) clearTimeout(warnTimer);
    };
  }, [wanted, settleMs]);

  return ready;
}
