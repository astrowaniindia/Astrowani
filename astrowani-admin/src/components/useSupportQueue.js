// The support queue, everywhere in the admin — not only on the Support page.
//
// WHY. The Support Inbox only refreshed while somebody had it open, so a person
// who wrote in at 2pm was seen whenever an admin next happened to visit that page.
// 75 conversations sat unanswered that way, some for over two months. This hook
// runs in the Layout, so wherever you are in the dashboard:
//   - the sidebar shows how many people are waiting on us,
//   - the tab title carries the count ("(3) Astrowani Admin"),
//   - a NEW arrival plays a short chime and raises a desktop notification.
//
// "New" is judged by the newest `awaiting_reply_since`, not by the count: the
// count can stay at 5 while one is answered and another arrives, and that second
// person still deserves the chime.
import { useEffect, useRef, useState } from 'react';
import client from '../api/client';

const POLL_MS = 30000;
const BASE_TITLE = typeof document !== 'undefined' ? document.title.replace(/^\(\d+\)\s*/, '') : '';

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch (_) { /* sound is a nicety; browsers may block it before a click */ }
}

function desktopNotify(summary) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification('Someone is waiting on Support', {
      body: `${summary.waiting} waiting${summary.urgent ? ` · ${summary.urgent} urgent` : ''}${summary.overdue ? ` · ${summary.overdue} overdue` : ''}`,
      tag: 'astrowani-support',
      renotify: true,
    });
    n.onclick = () => { window.focus(); window.location.assign('/support-inbox'); n.close(); };
  } catch (_) { /* ignore */ }
}

export default function useSupportQueue(enabled) {
  const [summary, setSummary] = useState(null);
  const lastNewestRef = useRef(undefined);

  // Desktop notifications need permission, and browsers only allow asking from
  // a click. Ask on the first click anywhere, once.
  useEffect(() => {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'default') return undefined;
    const ask = () => { Notification.requestPermission().catch(() => {}); };
    window.addEventListener('click', ask, { once: true });
    return () => window.removeEventListener('click', ask);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await client.get('/api/admin/support/summary');
        if (cancelled || !data?.data) return;
        const s = data.data;
        setSummary(s);
        const prev = lastNewestRef.current;
        // First load only records the baseline — no chime for a backlog that was
        // already there when the page opened.
        if (prev !== undefined && s.newestWaitingAt && (!prev || s.newestWaitingAt > prev)) {
          chime();
          desktopNotify(s);
        }
        lastNewestRef.current = s.newestWaitingAt || null;
      } catch (_) { /* next tick */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const n = summary?.waiting || 0;
    document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
  }, [summary]);

  return summary;
}
