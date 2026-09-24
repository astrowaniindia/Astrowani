// Puts the astrologer back inside a chat or live stream that is still running.
//
// WHY: an astrologer must be able to switch to another app, or have Android reclaim the app
// while it sits in the background, and on coming back land straight in the chat / broadcast
// they were in — not on Home, wondering whether the customer is still waiting. The backend
// keeps the session open for 5 minutes while the app is away (SessionManager); this is the
// half that brings the person back to it. Also what the "chat in progress" notification's
// tap relies on: it only launches the app, and this decides where to go.
//
// Called on cold start (NavigationContainer ready) and on every return to the foreground.
//
// Calls (audio/video) are deliberately NOT redirected: a call runs under a foreground service
// that keeps the app alive, so returning shows the call screen as it was. If the app really
// was killed the WebRTC connection died with it and there is nothing to reconnect to — the
// server ends that call when its grace window runs out.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { navigationRef } from './navigationRef';
import { showStatusPopup } from '../components/StatusPopup';
import { translate } from '../context/LanguageContext';

let inFlight = false;
// Set while the live "resume or end?" popup is up, so a second foreground event does not stack another.
let livePromptOpen = false;

const CHAT_ROUTE = 'VendorChatSession';
const LIVE_ROUTE = 'GoLiveScreen';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function fetchActiveSession() {
  const headers = await authHeaders();
  if (!headers) return null; // not signed in
  const res = await Instance.get('/api/vendor/active-session', { headers, timeout: 8000 });
  return res?.data?.success ? res.data : null;
}

/**
 * Check the server and navigate into a running chat, or offer to resume a running live
 * stream. Safe to call as often as you like; never throws; does nothing when signed out, when
 * the navigator is not ready, or when the astrologer is already on the right screen.
 */
export async function resumeActiveSession() {
  if (inFlight) return;
  inFlight = true;
  try {
    const nav = navigationRef.current;
    if (!nav || !nav.isReady()) return;

    const active = await fetchActiveSession();
    if (!active) return;

    const current = nav.getCurrentRoute && nav.getCurrentRoute()?.name;

    // ── Chat ────────────────────────────────────────────────────────────────
    if (active.chat && current !== CHAT_ROUTE) {
      nav.navigate(CHAT_ROUTE, {
        sessionId: active.chat.sessionId,
        requestId: active.chat.requestId,
        callerId: active.chat.callerId,
        callerName: active.chat.callerName,
        perMinuteCharge: active.chat.perMinuteCharge,
        // So the timer shows the chat's real age rather than starting again at 00:00.
        startedAt: active.chat.startedAt,
      });
      return; // one thing at a time; a live stream check follows on the next foreground
    }

    // ── Live ────────────────────────────────────────────────────────────────
    // The broadcast's camera and peer connections belong to the screen that was torn down,
    // so it cannot be silently re-attached: offer to start broadcasting again (which closes
    // the orphaned session server-side) or to end it.
    if (active.live && current !== LIVE_ROUTE && !livePromptOpen) {
      livePromptOpen = true;
      const liveId = active.live.sessionId;
      showStatusPopup({
        variant: 'info',
        title: translate('resume.liveTitle'),
        message: translate('resume.liveMsg'),
        confirmText: translate('resume.resume'),
        cancelText: translate('resume.endLive'),
        onConfirm: () => {
          livePromptOpen = false;
          navigationRef.current?.navigate(LIVE_ROUTE);
        },
        // The cancel button (and Android back, which StatusPopup routes to onCancel for a
        // confirm) ends the orphaned stream: leaving it would keep the astrologer showing
        // as live to customers with no host.
        onCancel: async () => {
          livePromptOpen = false;
          try {
            const headers = await authHeaders();
            if (headers) await Instance.post(`/api/live/${liveId}/end`, {}, { headers });
          } catch (_) { /* the server's host-lost sweep ends it within 5 minutes regardless */ }
        },
      });
    }
  } catch (e) {
    console.log('[activeSessionResume] failed:', e?.message);
  } finally {
    inFlight = false;
  }
}
