import {useEffect} from 'react';
import {translate} from '../context/LanguageContext';
import {showStatusPopup} from '../components/StatusPopup';

/**
 * Ask before leaving a report the customer has already paid for.
 *
 * WHY: a report is bought once and rendered once. Pressing back by reflex — the
 * way you would leave any other screen — throws it away, and the only way to see
 * it again is to pay for it a second time. That is a real loss of money for an
 * accidental gesture, so it earns a confirmation.
 *
 * Uses navigation's `beforeRemove` rather than BackHandler, deliberately. It
 * covers the header arrow, the hardware button and the swipe gesture with one
 * listener, and it does not depend on BackHandler — which is documented in this
 * repo as unreliable on Android 14+ where predictive back is on by default and
 * the legacy onBackPressed path is no longer invoked (see CLAUDE.md, subsystem
 * AS). A guard against losing a purchase must not sit on a mechanism we already
 * know can silently stop firing.
 *
 * @param navigation the screen's navigation prop
 * @param enabled    pass false while the report is still loading — there is
 *                   nothing to lose yet, and trapping someone on a spinner would
 *                   be worse than the problem this solves.
 */
export default function useConfirmLeaveReport(navigation, enabled = true) {
  useEffect(() => {
    if (!navigation || !enabled) return undefined;

    const unsub = navigation.addListener('beforeRemove', (e) => {
      // A programmatic reset (logout, a deep link, session-expired) must never be
      // blocked by a courtesy prompt — only a deliberate back gesture is.
      if (e.data?.action?.type !== 'GO_BACK' && e.data?.action?.type !== 'POP') return;

      e.preventDefault();
      // The app's own themed popup, not Alert.alert. App.js only re-skins SINGLE
      // button alerts — anything with a choice falls through to the bare OS dialog,
      // which is why this looked like a stock Android box.
      //
      // "Stay here" is the CONFIRM (the safe, primary action) and leaving is the
      // secondary: the whole point is that leaving costs money, so it should not be
      // the easiest thing to hit.
      showStatusPopup({
        variant: 'confirmPay',
        title: translate('report.leaveTitle'),
        message: translate('report.leaveMessage'),
        confirmText: translate('report.stayHere'),
        onConfirm: () => {},
        cancelText: translate('report.leaveAnyway'),
        onCancel: () => navigation.dispatch(e.data.action),
      });
    });

    return unsub;
  }, [navigation, enabled]);
}
