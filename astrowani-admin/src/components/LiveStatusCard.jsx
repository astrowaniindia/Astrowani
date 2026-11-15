import { useCallback, useEffect, useRef, useState } from 'react';
import client from '../api/client';

/**
 * "Live right now" — who is online, who is talking, who is live-streaming, and the
 * free-call pool, refreshed every 15 seconds while the tab is visible.
 *
 * Reads GET /api/admin/live-status (astrowani-backend/src/adminLiveStatusRoutes.js),
 * which is read-only and cached server-side for 5s, so leaving this page open all day
 * costs the backend almost nothing. Polling pauses while the tab is hidden.
 */
const REFRESH_MS = 15000;

const STATUS = {
  talking: { label: 'Busy on call', bg: '#fee2e2', fg: '#b91c1c' },
  live: { label: 'Live stream', bg: '#ede9fe', fg: '#6d28d9' },
  ringing: { label: 'Ringing', bg: '#fef3c7', fg: '#b45309' },
  held: { label: 'Reserved', bg: '#fef3c7', fg: '#b45309' },
  free: { label: 'Free', bg: '#dcfce7', fg: '#15803d' },
  offline: { label: 'Offline', bg: '#f3f4f6', fg: '#6b7280' },
};

const TYPE_LABEL = { chat: '💬 Chat', audio: '📞 Call', video: '🎥 Video' };

function duration(sec) {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Chip({ status }) {
  const s = STATUS[status] || STATUS.offline;
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function Avatar({ src, name }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return src ? (
    <img src={src} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--maroon-50)', color: 'var(--maroon)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
      {initial}
    </div>
  );
}

function TalkLine({ t }) {
  if (!t) return null;
  return (
    <div style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: 600 }}>
      with {t.customer} · {TYPE_LABEL[t.type] || t.type}
      {t.isFree ? ' · FREE call' : t.rate ? ` · ₹${t.rate}/min` : ''}
      {!t.connected ? ' · connecting…' : ''} · {duration(t.seconds)}
    </div>
  );
}

export default function LiveStatusCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const timer = useRef(null);

  const load = useCallback(() => {
    client.get('/api/admin/live-status')
      .then(({ data: d }) => { setData(d); setError(''); })
      .catch((e) => setError(e.response?.data?.message || e.message));
  }, []);

  useEffect(() => {
    const start = () => {
      clearInterval(timer.current);
      load();
      timer.current = setInterval(load, REFRESH_MS);
    };
    const onVis = () => {
      if (document.hidden) clearInterval(timer.current);
      else start();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const s = data?.summary;
  const fc = data?.freeCall;
  const v = (n) => (s ? (n ?? 0).toLocaleString('en-IN') : '…');

  const cards = [
    { label: 'Online now', value: v(s?.online), icon: '🟢', foot: s ? `of ${s.approved} approved` : '' },
    { label: 'Busy on call', value: v(s?.talking), icon: '🗣️', foot: s ? `${s.talkingPaid} paid · ${s.talkingFree} free` : '', highlight: true },
    { label: 'Free to take a request', value: v(s?.freeNow), icon: '✅', foot: s ? `${s.ringing} ringing right now` : '' },
    { label: 'Live streaming', value: v(s?.live), icon: '📡', foot: 'broadcasting to viewers' },
    { label: 'Chat · Call · Video', value: s ? `${s.chat} · ${s.audio} · ${s.video}` : '…', icon: '📊', foot: s?.connecting ? `${s.connecting} still connecting` : 'by type, in progress' },
    {
      label: 'Free-call astrologers online',
      value: fc ? String(fc.online) : '…',
      icon: '🎁',
      foot: fc
        ? `of ${fc.switchedOn} switched on${fc.selected !== null ? ` · ${fc.selected} selected` : ''}${fc.enabled === false ? ' · offer OFF' : ''}`
        : '',
    },
  ];

  const talkBy = new Map((data?.talking || []).map((t) => [t.astrologerId, t]));
  const rank = (st) => (st === 'talking' ? 0 : st === 'live' ? 1 : st === 'ringing' || st === 'held' ? 2 : 3);
  const online = (data?.online || []).filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'pool') return a.inFreePool;
    return a.status === filter;
  }).sort((x, y) => rank(x.status) - rank(y.status));
  const updated = data?.at ? new Date(data.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: error ? '#dc2626' : '#16a34a', display: 'inline-block' }} />
          Live right now
        </h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {error ? `Could not refresh: ${error}` : updated ? `Updated ${updated} · refreshes every 15s` : 'Loading…'}
          {' '}
          <button type="button" className="btn secondary sm" onClick={load} style={{ marginLeft: 8 }}>Refresh</button>
        </span>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="stat-header">
              <span className="label">{c.label}</span>
              <div className="stat-icon-wrap">{c.icon}</div>
            </div>
            <div className="value">{c.value}</div>
            <div className="stat-footer"><span className="muted">{c.foot}</span></div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        <div className="card">
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>
            🎁 Free-call astrologers {fc?.astrologers ? `(${fc.online} online of ${fc.astrologers.length})` : ''}
          </h3>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 11.5 }}>
            Everyone with the free call switched on. Online ones are what customers see on the free-call screen.
          </p>
          {!fc?.astrologers ? <p className="muted">Loading…</p> : fc.astrologers.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No astrologer has the free call switched on.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {fc.astrologers.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: a.status === 'offline' ? 0.55 : 1 }}>
                  <Avatar src={a.image} name={a.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {a.name}
                      {!a.visible ? <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · hidden from customers</span> : null}
                    </div>
                    <TalkLine t={talkBy.get(a.id)} />
                  </div>
                  <Chip status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Online astrologers {data ? `(${data.online.length})` : ''}</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ fontSize: 12.5, padding: '4px 8px', borderRadius: 8 }}>
              <option value="all">All online</option>
              <option value="free">Free</option>
              <option value="talking">Busy on call</option>
              <option value="ringing">Ringing</option>
              <option value="live">Live stream</option>
              <option value="pool">In free-call pool</option>
            </select>
          </div>
          {!data ? <p className="muted">Loading…</p> : online.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Nobody matches this filter.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {online.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar src={a.image} name={a.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {a.name}{a.inFreePool ? ' 🎁' : ''}
                    </div>
                    {talkBy.get(a.id) ? <TalkLine t={talkBy.get(a.id)} /> : (
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {[a.chat && 'Chat', a.call && 'Call', a.video && 'Video'].filter(Boolean).join(' · ') || 'All services off'}
                      </div>
                    )}
                  </div>
                  <Chip status={a.status} />
                </div>
              ))}
            </div>
          )}
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 11.5 }}>
            🎁 = in the free-call pool. "Online" is the astrologer's own toggle; a phone that died without going offline can still show here for a while.
          </p>
        </div>
      </div>
    </div>
  );
}
