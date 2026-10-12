import { api } from './api.js?v=29';
import { esc } from './ui.js?v=29';

/**
 * "You have a consultation in progress" — a slim bar pinned to the bottom of
 * whatever page you are on, linking back to the live screen.
 *
 * A browser tab is not a native screen: it gets refreshed, duplicated, closed
 * and reopened mid-consultation. Without this the session would keep running —
 * and keep billing — with nothing on screen able to end it.
 *
 * It also covers the cross-platform case directly: a chat started in the app
 * shows up here, so moving to the website mid-consultation offers the same
 * conversation instead of starting a second one.
 *
 * A bar rather than a dialog on purpose: it must not block the page, and
 * rejoining a call needs a real user gesture anyway (a browser will not hand
 * back the microphone without one).
 */
export async function showResumeBar() {
  if (document.querySelector('.aw-resume-bar')) return;

  let res;
  try {
    res = await api.get('/api/customer/active-session');
  } catch (_) {
    return; // Signed out, offline, or the endpoint is not deployed yet.
  }

  const chat = res?.chat;
  const call = res?.call;
  const info = chat || call;
  if (!info?.sessionId) return;

  const href = chat
    ? `chat.html?session=${encodeURIComponent(info.sessionId)}`
    : `call.html?session=${encodeURIComponent(info.sessionId)}&type=${info.callType === 'video' ? 'video' : 'audio'}`;

  const label = chat ? 'chat' : (info.callType === 'video' ? 'video call' : 'call');
  const who = info.astrologerName || 'your astrologer';

  const bar = document.createElement('div');
  bar.className = 'aw-resume-bar';
  bar.innerHTML = `
    <span class="aw-resume-dot"></span>
    <span class="aw-resume-text">Your ${esc(label)} with ${esc(who)} is still running
      &middot; ₹${esc(info.perMinuteCharge || 0)}/min</span>
    <a class="aw-btn aw-btn-gold aw-resume-go" href="${href}">Rejoin</a>
    <button type="button" class="aw-btn aw-btn-ghost aw-resume-end" data-act="end">End it</button>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('is-open'));

  bar.querySelector('[data-act="end"]').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { await api.post('/api/call/end', { sessionId: info.sessionId }); } catch (_) {}
    bar.classList.remove('is-open');
    setTimeout(() => bar.remove(), 250);
  });
}
