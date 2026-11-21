import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import client from '../../api/client';

/**
 * The pieces every Bird Eye screen shares — the poller, the tiles, the delta chip, the
 * panel chrome and the header with the screen switcher. Extracted from pages/BirdEye.jsx
 * when the second Bird Eye (free call) arrived, so the two screens can never drift apart
 * in how they poll, dim on error, or compare against yesterday.
 *
 * THE ONE-SCREEN RULE APPLIES TO EVERY BIRD EYE: no scrolling, fixed bands, a new metric
 * can only replace an old one. See the header of pages/BirdEye.jsx.
 */

/** Every Bird Eye screen, in sidebar order. Add a screen here and it gets a tab. */
export const BIRD_EYE_SCREENS = [
  { to: '/bird-eye', label: 'Platform', end: true },
  { to: '/bird-eye-free-call', label: 'Free Call' },
];

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const num = (n) => Number(n || 0).toLocaleString('en-IN');
export const compactMoney = (n) => {
  const v = Number(n || 0);
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
};
export const mmss = (secs) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

/**
 * A live poller that pauses itself when the tab is hidden and re-fetches on focus.
 *
 * `error` deliberately does not clear the previous data: one failed poll must not blank
 * a working tile on a screen somebody is watching. The band keeps its last good numbers
 * and is dimmed instead.
 */
export function useLivePoll(path, intervalMs, { paused = false, params } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [at, setAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const load = useCallback(async () => {
    try {
      const res = await client.get(path, { params: paramsRef.current });
      if (res.data?.success) {
        setData(res.data);
        setError('');
        setAt(Date.now());
      } else {
        setError(res.data?.message || 'Could not load.');
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (paused) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    tick();
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, intervalMs, paused]);

  return { data, error, at, loading, reload: load };
}

/**
 * The seconds counter, as its own component. As a hook in the page it re-rendered every
 * chart once a second, which makes the lines twitch on a screen watched for hours.
 */
export function Ago({ at }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!at) return '—';
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`;
}

const chipStyle = (colour) => ({
  color: colour,
  fontSize: 10.5,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
});

/**
 * Today against the same elapsed slice of yesterday, as a chip. Yesterday at zero is NOT
 * a percentage: "+100%" off a base of nothing reads as a doubling of something real.
 */
export function Delta({ now, before, format = num }) {
  const a = Number(now || 0);
  const b = Number(before || 0);
  if (!a && !b) return null;
  if (!b) {
    return <span style={chipStyle('var(--emerald)')} title="Nothing by this time yesterday">new</span>;
  }
  const p = Math.round(((a - b) / b) * 100);
  const title = `${format(b)} by this time yesterday`;
  if (p === 0) return <span style={chipStyle('var(--text-light)')} title={title}>level</span>;
  const up = p > 0;
  return (
    <span style={chipStyle(up ? 'var(--emerald)' : 'var(--crimson)')} title={title}>
      {up ? '▲' : '▼'}{Math.abs(p)}%
    </span>
  );
}

/** One fixed-height tile. Three lines, never four — four is how a band starts growing. */
export function Tile({ label, value, sub, subColour, accent, delta, title }) {
  return (
    <div title={title} style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${accent || 'var(--border-dark)'}`,
      borderRadius: 10,
      padding: '7px 10px',
      display: 'flex',
      flexDirection: 'column',
      // flex-start, NOT center. Centring inside a fixed height clips BOTH ends the
      // moment the content is a pixel too tall, which ate the top of every label.
      justifyContent: 'flex-start',
      gap: 1,
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
        color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{
          fontSize: 21, fontWeight: 800, lineHeight: 1.15, color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}>
          {value}
        </span>
        {delta}
      </div>
      <div style={{
        fontSize: 10, color: subColour || 'var(--text-light)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 12,
      }}>
        {sub || ''}
      </div>
    </div>
  );
}

export const PANEL = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 10px 4px',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
};

export const PANEL_TITLE = {
  fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
  color: 'var(--text-muted)', margin: 0,
};

export const chartTooltip = {
  contentStyle: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, fontSize: 11, padding: '6px 8px',
  },
  labelStyle: { fontSize: 11, fontWeight: 700 },
};

export const axisTick = { fontSize: 9.5 };

/** A small coloured legend key. `dashed` draws a line sample instead of a dot. */
export function LegendKey({ label, colour, dashed, square }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: 'var(--text-secondary)',
      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
    }}>
      {dashed ? (
        <span style={{ width: 12, height: 0, borderTop: `2px dashed ${colour}` }} />
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: square ? 2 : '50%', background: colour }} />
      )}
      {label}
    </span>
  );
}

/** A panel with a title row (title on the left, legend/controls on the right). */
export function Panel({ title, right, children, style }) {
  return (
    <div style={{ ...PANEL, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={PANEL_TITLE}>{title}</h2>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Pins the page to the viewport while a Bird Eye screen is mounted. The admin shell
 * gives `.main-content` padding inside a scrolling `.content-wrap`; this tags <body>
 * while mounted and removes the tag on unmount — scoped, reversible, styles.css untouched.
 */
export function useBirdEyeBody() {
  useEffect(() => {
    document.body.classList.add('bird-eye-screen');
    return () => document.body.classList.remove('bird-eye-screen');
  }, []);
}

export function BirdEyeStyles() {
  return (
    <style>{`
      body.bird-eye-screen .main-content { padding: 0; height: calc(100vh - 64px); overflow: hidden; }
      body.bird-eye-screen .content-wrap { overflow: hidden; }
      /* The escape hatch, set deliberately low: below this the charts would be a few
         pixels tall and unreadable, at which point scrolling is the lesser evil. */
      @media (max-height: 620px) {
        body.bird-eye-screen .main-content { height: auto; overflow: visible; }
        body.bird-eye-screen .content-wrap { overflow-y: auto; }
        .bird-eye-grid { height: auto !important; min-height: 620px; }
      }
      .bird-eye-tab { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
        text-decoration: none; color: var(--text-secondary); border: 1px solid var(--border); white-space: nowrap; }
      .bird-eye-tab.active { background: var(--text-primary); color: var(--surface); border-color: var(--text-primary); }
    `}</style>
  );
}

/** The header every Bird Eye shares: title, screen switcher, live badge, pause, refresh. */
export function BirdEyeHeader({ title, subtitle, paused, onTogglePause, onRefresh, at }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 15 }}>🦅</span>
      <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
        {title}
      </h1>
      <div style={{ display: 'flex', gap: 4 }}>
        {BIRD_EYE_SCREENS.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.end} className={({ isActive }) => `bird-eye-tab${isActive ? ' active' : ''}`}>
            {s.label}
          </NavLink>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {subtitle}
      </span>
      <div style={{ flex: 1 }} />
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
        color: paused ? 'var(--amber)' : 'var(--emerald)',
        background: paused ? 'var(--amber-bg)' : 'var(--emerald-bg)',
        border: `1px solid ${paused ? 'var(--amber-border)' : 'var(--emerald-border)'}`,
        borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: paused ? 'var(--amber)' : 'var(--emerald)',
          animation: paused ? 'none' : 'pulse 2s infinite',
        }} />
        {paused ? 'Paused' : <>Live · <Ago at={at} /></>}
      </span>
      <button type="button" className="btn secondary sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={onTogglePause}>
        {paused ? '▶' : '⏸'}
      </button>
      <button type="button" className="btn sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={onRefresh}>↻</button>
    </div>
  );
}
