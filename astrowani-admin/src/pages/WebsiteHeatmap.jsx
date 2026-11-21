// Website Analytics -> Click map. The real page, desktop and phone side by side,
// with a marker and a count on every spot people clicked, and lines showing how
// far down they scrolled.
//
// The pages are the LIVE site (not stored screenshots), opened with ?aw_heatmap=1
// so astrowani-website/aw/heatmap-view.js draws the markers and analytics stays
// off. This page fetches the counts with the admin's login
// (GET /api/admin/website-analytics/heatmap) and hands them to each frame by
// postMessage — the website never sees a token. Markers are pinned to the element
// that was clicked (by the CSS selector recorded at click time), so they land on
// the right spot at both widths and stay right as the page content changes.
//
// The site allows only this dashboard to frame it (Content-Security-Policy
// frame-ancestors in vps-deployment/nginx/astrowani-site.conf).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

const SITE = (import.meta.env.VITE_WEBSITE_URL || 'https://astrowani.com').replace(/\/+$/, '');
const SITE_ORIGIN = new URL(SITE).origin;

// The screen each column imitates. Desktop is the most common laptop width; the
// phone is a typical Android. Heights are what one screenful shows.
const FRAMES = {
  desktop: { width: 1366, height: 800, label: 'Desktop' },
  mobile: { width: 390, height: 780, label: 'Mobile' },
};

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-IN'));

function PageFrame({ kind, src, device, onStatus }) {
  const cfg = FRAMES[kind];
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [status, setStatus] = useState('Loading page…');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / cfg.width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cfg.width]);

  // Hand the data to the frame whenever it says it is ready, and again if the
  // data changes while it is open.
  useEffect(() => {
    const send = () => {
      const w = frameRef.current?.contentWindow;
      if (!w || !device) return;
      w.postMessage({
        type: 'aw-heatmap-data',
        clicks: device.clicks,
        scroll: device.scroll.filter((s) => s.depth > 0),
        viewportHeight: cfg.height,
        uiScale: scale > 0 ? 1 / scale : 1,
      }, SITE_ORIGIN);
    };
    const onMsg = (e) => {
      if (e.origin !== SITE_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === 'aw-heatmap-ready') send();
      if (e.data?.type === 'aw-heatmap-drawn') {
        const s = e.data.missing
          ? `${e.data.placed} spots shown · ${e.data.missing} clicked elements are not on the page now (shown at their old height)`
          : `${e.data.placed} spots shown`;
        setStatus(s);
        onStatus?.(kind, s);
      }
    };
    window.addEventListener('message', onMsg);
    send();
    return () => window.removeEventListener('message', onMsg);
  }, [device, cfg.height, kind, onStatus, scale]);

  return (
    <div className="hm-col">
      <div className="hm-col-head">
        <strong>{cfg.label}</strong>
        <span>{fmt(device?.visits)} visits · {fmt(device?.visitors)} visitors · {fmt(device?.totalClicks)} clicks</span>
      </div>
      <div className="hm-frame-wrap" ref={wrapRef} style={{ height: cfg.height * scale }}>
        {src ? (
          <iframe
            ref={frameRef}
            title={`${cfg.label} click map`}
            src={src}
            style={{ width: cfg.width, height: cfg.height, transform: `scale(${scale})` }}
            className="hm-frame"
          />
        ) : <p className="muted" style={{ padding: 16 }}>Pick an address to show.</p>}
      </div>
      <p className="muted hm-status">{status}. Scroll inside the page to see all of it.</p>
      <ScrollTable rows={device?.scroll} />
      <ClickTable rows={device?.clicks} />
    </div>
  );
}

// One card per layout: how many visits this page had on that kind of screen,
// and where those visitors came from to the website.
function DeviceSummary({ kind, device, loading }) {
  const cfg = FRAMES[kind];
  const sources = device?.sources || [];
  const max = Math.max(1, ...sources.map((s) => s.visits));
  return (
    <div className="hm-dev">
      <div className="hm-dev-head">
        <strong>{kind === 'desktop' ? '🖥️' : '📱'} {cfg.label}</strong>
        <span className="hm-dev-num">{loading ? '…' : fmt(device?.visits)}<small> visits</small></span>
      </div>
      <p className="muted hm-dev-sub">
        {loading ? '…' : `${fmt(device?.visitors)} visitors · ${fmt(device?.totalClicks)} clicks`}
      </p>
      <h4>Where they came from</h4>
      {loading ? <p className="muted">Loading…</p> : sources.length === 0 ? <p className="muted">No visits in this period.</p> : (
        <div className="hm-src">
          {sources.map((s) => (
            <div key={s.label} className="hm-src-row" title={s.group}>
              <span className="hm-src-label">{s.label}</span>
              <span className="hm-track"><span style={{ width: `${(s.visits / max) * 100}%` }} /></span>
              <strong>{fmt(s.visits)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScrollTable({ rows }) {
  const r = (rows || []).filter((s) => s.depth > 0);
  return (
    <div className="hm-mini">
      <h4>How far people scrolled</h4>
      {r.length === 0 ? <p className="muted">No scrolling recorded yet.</p> : (
        <div className="hm-scroll">
          {r.map((s) => (
            <div key={s.depth} className="hm-scroll-row">
              <span>{s.depth}% of the page</span>
              <span className="hm-track"><span style={{ width: `${s.percent}%` }} /></span>
              <strong>{s.percent}%</strong>
              <span className="muted">({fmt(s.people)})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClickTable({ rows }) {
  const r = (rows || []).slice(0, 15);
  return (
    <div className="hm-mini">
      <h4>Most clicked</h4>
      {r.length === 0 ? <p className="muted">No clicks recorded yet.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>What</th><th>Section</th><th className="num">Clicks</th><th className="num">People</th></tr></thead>
          <tbody>{r.map((c) => (
            <tr key={c.sel}><td>{c.label || '—'}</td><td>{c.section || '—'}</td><td className="num">{fmt(c.clicks)}</td><td className="num">{fmt(c.people)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function WebsiteHeatmap() {
  const [days, setDays] = useState(7);
  const [pages, setPages] = useState([]);
  const [topPaths, setTopPaths] = useState([]);
  const [page, setPage] = useState('home');
  const [data, setData] = useState(null);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  // The page list, most visited first, from the overview.
  useEffect(() => {
    client.get(`/api/admin/website-analytics?days=${Math.max(days, 30)}`)
      .then(({ data: d }) => {
        setPages((d.pages || []).filter((p) => p.pageKey && p.pageKey !== 'unknown'));
        setTopPaths(d.topPaths || []);
      })
      .catch(() => {});
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    client.get(`/api/admin/website-analytics/heatmap?page=${encodeURIComponent(page)}&days=${days}`)
      .then(({ data: d }) => {
        if (cancelled) return;
        setData(d);
        setPath((prev) => {
          const keep = prev && (d.paths || []).some((p) => p.path === prev);
          return keep ? prev : (d.path || topPaths.find((t) => t.pageKey === page)?.path || '');
        });
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.message || e.message || 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [page, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const pathChoices = useMemo(() => {
    const fromData = (data?.paths || []).map((p) => p.path);
    const fromTop = topPaths.filter((t) => t.pageKey === page).map((t) => t.path);
    return [...new Set([...fromData, ...fromTop, ...(path ? [path] : [])])];
  }, [data, topPaths, page, path]);

  const src = path ? `${SITE}${path}${path.includes('?') ? '&' : '?'}aw_heatmap=1&r=${nonce}` : '';
  const t = data?.totals;

  return (
    <div className="page">
      <div className="page-header hm-head">
        <div>
          <Link to="/website-analytics" className="hm-back">← Website Analytics</Link>
          <h1>Click map</h1>
          <p>Where visitors click and how far they scroll, drawn on the real page. Desktop on the left, phone on the right.</p>
        </div>
        <div className="hm-range">
          {RANGES.map((r) => (
            <button key={r.days} className={r.days === days ? 'active' : ''} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="hm-controls">
        <label>Page
          <select value={page} onChange={(e) => { setPath(''); setPage(e.target.value); }}>
            {!pages.some((p) => p.pageKey === page) && <option value={page}>{page}</option>}
            {pages.map((p) => <option key={p.pageKey} value={p.pageKey}>{p.pageKey.replace(/_/g, ' ')} ({fmt(p.views)} views)</option>)}
          </select>
        </label>
        {pathChoices.length > 1 && (
          <label>Address
            <select value={path} onChange={(e) => setPath(e.target.value)}>
              {pathChoices.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        <button className="hm-reload" onClick={() => setNonce((n) => n + 1)}>Reload pages</button>
      </div>

      {error && <div className="hm-note warn">{error}</div>}

      <div className="stat-grid">
        <div className="stat"><span className="label">Total visits</span><span className="value">{loading ? '…' : fmt(t?.visits)}</span></div>
        <div className="stat"><span className="label">Visitors</span><span className="value">{loading ? '…' : fmt(t?.visitors)}</span></div>
        <div className="stat"><span className="label">Total clicks</span><span className="value">{loading ? '…' : fmt(t?.clicks)}</span></div>
        <div className="stat"><span className="label">Clicks per visit</span><span className="value">{loading || !t?.visits ? '—' : (t.clicks / t.visits).toFixed(1)}</span></div>
      </div>

      <div className="hm-devs">
        <DeviceSummary kind="desktop" device={data?.devices?.desktop} loading={loading} />
        <DeviceSummary kind="mobile" device={data?.devices?.mobile} loading={loading} />
      </div>

      <div className="hm-note">
        "Where they came from" is how each visitor first reached the website: Direct means they typed the address,
        used a bookmark, or tapped a link inside an app such as WhatsApp (those send no source).
        Red circles are click spots: the bigger and redder, the more clicks, with the count on the tag. Blue dashed lines
        show what share of visitors scrolled that far. Clicks and scroll are recorded from 21 Nov 2026.
      </div>

      <div className="hm-cols">
        <PageFrame kind="desktop" src={src} device={data?.devices?.desktop} />
        <PageFrame kind="mobile" src={src} device={data?.devices?.mobile} />
      </div>

      <style>{`
        .hm-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
        .hm-back { color:var(--maroon); font-weight:700; font-size:13px; text-decoration:none; }
        .hm-range { display:flex; gap:6px; flex-wrap:wrap; }
        .hm-range button, .hm-reload { border:1px solid var(--border); background:var(--surface); padding:7px 14px; border-radius:999px; font-weight:700; cursor:pointer; color:var(--text); }
        .hm-range button.active { background:var(--maroon); color:#fff; border-color:var(--maroon); }
        .hm-controls { display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; margin:0 0 18px; }
        .hm-controls label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:700; color:var(--text-muted); }
        .hm-controls select { min-width:240px; padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:var(--surface); color:var(--text); }
        .hm-note { background:var(--surface-muted); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin:0 0 20px; font-size:13px; color:var(--text-muted); }
        .hm-note.warn { background:var(--crimson-bg); color:var(--crimson); }
        .hm-cols { display:grid; grid-template-columns:minmax(0, 2.2fr) minmax(0, 1fr); gap:20px; align-items:start; }
        @media (max-width: 900px) { .hm-cols { grid-template-columns:1fr; } }
        .hm-col { min-width:0; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px; }
        .hm-col-head { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px; font-size:13px; }
        .hm-col-head span { color:var(--text-muted); }
        .hm-frame-wrap { position:relative; overflow:hidden; border:1px solid var(--border); border-radius:10px; background:#fff; }
        .hm-frame { border:0; transform-origin:0 0; position:absolute; left:0; top:0; background:#fff; }
        .hm-status { font-size:12px; margin:8px 0 0; }
        .hm-devs { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin:0 0 20px; }
        @media (max-width: 900px) { .hm-devs { grid-template-columns:1fr; } }
        .hm-dev { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; min-width:0; }
        .hm-dev-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
        .hm-dev-head strong { font-size:16px; }
        .hm-dev-num { font-size:28px; font-weight:800; color:var(--maroon); }
        .hm-dev-num small { font-size:13px; font-weight:600; color:var(--text-muted); }
        .hm-dev-sub { margin:2px 0 12px; font-size:13px; }
        .hm-dev h4 { margin:0 0 8px; font-size:14px; }
        .hm-src { display:flex; flex-direction:column; gap:6px; }
        .hm-src-row { display:grid; grid-template-columns:minmax(0, 170px) 1fr auto; gap:8px; align-items:center; font-size:13px; }
        .hm-src-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .hm-mini { margin-top:16px; }
        .hm-mini h4 { margin:0 0 8px; font-size:14px; }
        .hm-scroll { display:flex; flex-direction:column; gap:6px; }
        .hm-scroll-row { display:grid; grid-template-columns:110px 1fr auto auto; gap:8px; align-items:center; font-size:13px; }
        .hm-track { background:var(--surface-muted); height:9px; border-radius:6px; overflow:hidden; }
        .hm-track span { display:block; height:100%; background:#1e5ac8; }
      `}</style>
    </div>
  );
}
