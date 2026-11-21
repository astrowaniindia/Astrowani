// Website Analytics — everything that happens on astrowani.com, separate from the apps.
//
// Data: GET /api/admin/website-analytics (astrowani-backend/src/websiteAnalyticsRoutes.js),
// which reads the PostHog events the website sends with app='website'
// (astrowani-website/aw/analytics.js) plus, for "app installs from the website",
// customers.acquisition_source in the database. Every section is independent on the
// server, so one failed query shows as one empty card, not a blank page.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-IN'));
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const secs = (n) => {
  if (n == null || !n) return '—';
  const s = Math.round(n);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

// Page keys are machine names ("kundli_reading"); show them the way a person says them.
const PAGE_LABELS = {
  home: 'Homepage', blog_article: 'Blog article', astrologer_profile: 'Astrologer profile', story: 'Web story',
  blog: 'Blog list', astrologers: 'All astrologers', consult: 'Consult', '404': 'Page not found (404)',
  privacy_policy: 'Privacy policy', term_conditions: 'Terms & conditions', refund_cancellation: 'Refund policy',
  delete_account: 'Delete account', child_safety: 'Child safety', safety_guidelines: 'Safety guidelines',
  report_vulnerability: 'Report vulnerability',
};
function pageLabel(key) {
  const k = String(key || '');
  const hi = k.startsWith('hi_') ? ' (Hindi)' : '';
  const base = k.replace(/^hi_/, '');
  const label = PAGE_LABELS[base] || base.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return label + hi;
}

function Table({ cols, rows, empty = 'Nothing recorded in this period yet.' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {(!rows || rows.length === 0) && <tr><td colSpan={cols.length} className="muted">{empty}</td></tr>}
          {(rows || []).map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, hint, children, failed }) {
  return (
    <div className="card wa-card">
      <h3>{title}</h3>
      {hint && <p className="muted wa-hint">{hint}</p>}
      {failed ? <p className="muted">This section could not be loaded. Try again in a minute.</p> : children}
    </div>
  );
}

function Bars({ rows, valueKey, labelKey }) {
  const max = Math.max(1, ...(rows || []).map((r) => r[valueKey] || 0));
  return (
    <div className="wa-bars">
      {(rows || []).map((r) => (
        <div className="wa-bar-row" key={r[labelKey]}>
          <span className="wa-bar-label" title={r[labelKey]}>{r[labelKey]}</span>
          <span className="wa-bar-track"><span className="wa-bar-fill" style={{ width: `${((r[valueKey] || 0) / max) * 100}%` }} /></span>
          <span className="wa-bar-num">{fmt(r[valueKey])}</span>
        </div>
      ))}
      {(!rows || rows.length === 0) && <p className="muted">Nothing recorded yet.</p>}
    </div>
  );
}

function Trend({ daily }) {
  if (!daily || daily.length === 0) return <p className="muted">No visits in this period yet.</p>;
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  return (
    <div className="wa-trend">
      {daily.map((d) => (
        <div className="wa-col" key={d.date} title={`${d.date}: ${d.visitors} visitors, ${d.pageviews} page views`}>
          <span className="wa-col-num">{d.visitors}</span>
          <span className="wa-col-bar" style={{ height: `${(d.visitors / max) * 100}%` }} />
          <span className="wa-col-date">{d.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function WebsiteAnalytics() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    client.get(`/api/admin/website-analytics?days=${days}`)
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((e) => !cancelled && setError(e?.response?.data?.message || e.message || 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    let stop = false;
    const tick = () => client.get('/api/admin/website-analytics/live')
      .then(({ data: d }) => { if (!stop) setLive(d); })
      .catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const o = data?.overview || {};
  const failed = (k) => !!data?.errors?.[k];

  return (
    <div className="page">
      <div className="page-header wa-head">
        <div>
          <h1>Website Analytics</h1>
          <p>Everything that happens on astrowani.com: who visits, where they come from, what they read and click, and how many go on to install the app. Separate from the app numbers.</p>
        </div>
        <div className="wa-range">
          <Link to="/website-analytics/heatmap" className="wa-heatmap-btn">Open click map →</Link>
          {RANGES.map((r) => (
            <button key={r.days} className={r.days === days ? 'active' : ''} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="wa-live">
        <span className="wa-dot" /> <strong>{live ? live.activeVisitors : '—'}</strong> on the site in the last 5 minutes
        {live?.pages?.length > 0 && (
          <span className="muted"> · {live.pages.slice(0, 4).map((p) => `${pageLabel(p.pageKey)} (${p.visitors})`).join(', ')}</span>
        )}
      </div>

      {error && <div className="wa-note warn">{error}</div>}
      {loading && !data ? <p className="muted">Loading…</p> : data && (
        <>
          <div className="stat-grid">
            <div className="stat"><span className="label">Visitors</span><span className="value">{fmt(o.visitors)}</span></div>
            <div className="stat"><span className="label">Page views</span><span className="value">{fmt(o.pageviews)}</span></div>
            <div className="stat"><span className="label">Visits</span><span className="value">{fmt(o.sessions)}</span></div>
            <div className="stat"><span className="label">Pages per visit</span><span className="value">{o.pagesPerSession ? o.pagesPerSession.toFixed(1) : '—'}</span></div>
            <div className="stat"><span className="label">Avg time on a page</span><span className="value">{secs(o.avgSeconds)}</span></div>
            <div className="stat"><span className="label">Left after one page</span><span className="value">{pct(o.bounceRate)}</span></div>
            <div className="stat"><span className="label">App installs from website</span><span className="value">{fmt(data.installs?.total)}</span></div>
          </div>

          <div className="wa-note">
            Time on page, scroll depth, clicks, forms and errors are recorded from 21 Nov 2026, so ranges before that show
            them as empty. App installs count Android signups that tapped "Get the app" on the website (iPhone cannot be
            traced this way).
          </div>

          <Card title="Visitors per day" failed={failed('daily')}><Trend daily={data.daily} /></Card>

          <div className="wa-grid">
            <Card title="Where visitors come from" hint="Visits by where they arrived from. Direct = typed the address, a bookmark, or a link tapped inside an app such as WhatsApp (those send no source)." failed={failed('sources')}>
              <Bars rows={data.sources?.detail} valueKey="sessions" labelKey="label" />
            </Card>
            <Card title="By type of source" failed={failed('sources')}>
              <Bars rows={data.sources?.groups} valueKey="sessions" labelKey="group" />
            </Card>
          </div>

          <Card title="Pages" hint="Every page, most viewed first. Time and scroll are averages for people who left the page." failed={failed('pages')}>
            <Table
              cols={[
                { key: 'pageKey', label: 'Page', render: (r) => pageLabel(r.pageKey) },
                { key: 'views', label: 'Views', num: true, render: (r) => fmt(r.views) },
                { key: 'visitors', label: 'Visitors', num: true, render: (r) => fmt(r.visitors) },
                { key: 'avgSeconds', label: 'Avg time', num: true, render: (r) => secs(r.avgSeconds) },
                { key: 'avgScroll', label: 'Avg scroll', num: true, render: (r) => (r.avgScroll == null ? '—' : `${Math.round(r.avgScroll)}%`) },
              ]}
              rows={data.pages}
            />
          </Card>

          <div className="wa-grid">
            <Card title="Most read articles, profiles and stories" failed={failed('topPaths')}>
              <Table
                cols={[
                  { key: 'path', label: 'Address', render: (r) => <a href={`https://astrowani.com${r.path}`} target="_blank" rel="noreferrer">{r.path}</a> },
                  { key: 'views', label: 'Views', num: true, render: (r) => fmt(r.views) },
                ]}
                rows={data.topPaths}
              />
            </Card>
            <Card title="App installs from the website, by page" hint="Android signups whose Play Store link was tapped on that page." failed={failed('installs')}>
              <Table
                cols={[{ key: 'page', label: 'Page', render: (r) => pageLabel(r.page) }, { key: 'signups', label: 'Signups', num: true }]}
                rows={data.installs?.bySource}
                empty="No app signups from the website in this period yet."
              />
            </Card>
          </div>

          <Card title="What people do" hint="Each step counted on the website. People = different visitors who did it at least once." failed={failed('conversions')}>
            <Table
              cols={[
                { key: 'label', label: 'Action' },
                { key: 'people', label: 'People', num: true, render: (r) => fmt(r.people) },
                { key: 'count', label: 'Times', num: true, render: (r) => fmt(r.count) },
              ]}
              rows={data.conversions}
            />
          </Card>

          <Card title="What people click" hint="Every link and button tap, grouped. Section = the part of the page it was in." failed={failed('clicks')}>
            <Table
              cols={[
                { key: 'label', label: 'Clicked' },
                { key: 'pageKey', label: 'On page', render: (r) => pageLabel(r.pageKey) },
                { key: 'section', label: 'Section' },
                { key: 'target', label: 'Went to', render: (r) => (r.targetKind === 'outbound' ? `↗ ${r.target}` : r.target || r.targetKind || '—') },
                { key: 'clicks', label: 'Clicks', num: true, render: (r) => fmt(r.clicks) },
                { key: 'visitors', label: 'People', num: true, render: (r) => fmt(r.visitors) },
              ]}
              rows={data.clicks}
            />
          </Card>

          <h2 className="wa-sub">Audience</h2>
          <div className="wa-grid wa-grid-3">
            {[['device', 'Device'], ['os', 'Operating system'], ['browser', 'Browser'], ['country', 'Country'], ['city', 'City'], ['language', 'Site language']].map(([k, t]) => (
              <Card key={k} title={t} failed={failed('tech')}>
                <Bars rows={(data.tech?.[k] || []).map((r) => ({ ...r, value: k === 'language' ? (r.value === 'hi' ? 'Hindi' : r.value === 'en' ? 'English' : r.value) : r.value }))} valueKey="visitors" labelKey="value" />
              </Card>
            ))}
          </div>

          <h2 className="wa-sub">Site health</h2>
          <div className="wa-grid wa-grid-3">
            <Card title="Forms submitted" failed={failed('forms')}>
              <Table cols={[{ key: 'form', label: 'Form' }, { key: 'pageKey', label: 'Page', render: (r) => pageLabel(r.pageKey) }, { key: 'submits', label: 'Submits', num: true }]} rows={data.forms} />
            </Card>
            <Card title="Addresses that do not exist (404)" hint="Broken links people actually followed." failed={failed('notFound')}>
              <Table cols={[{ key: 'path', label: 'Address' }, { key: 'views', label: 'Hits', num: true }]} rows={data.notFound} empty="No broken links hit. Good." />
            </Card>
            <Card title="Script errors" hint="Errors in visitors' browsers." failed={failed('jsErrors')}>
              <Table cols={[{ key: 'error', label: 'Error' }, { key: 'file', label: 'File' }, { key: 'count', label: 'Times', num: true }]} rows={data.jsErrors} empty="No errors. Good." />
            </Card>
          </div>
        </>
      )}

      <style>{`
        .wa-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
        .wa-range { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .wa-heatmap-btn { background:var(--maroon); color:#fff; padding:8px 16px; border-radius:999px; font-weight:800; text-decoration:none; margin-right:8px; }
        .wa-range button { border:1px solid var(--border); background:var(--surface); padding:7px 14px; border-radius:999px; font-weight:700; cursor:pointer; color:var(--text); }
        .wa-range button:hover { background:var(--surface-hover); }
        .wa-range button.active { background:var(--maroon); color:#fff; border-color:var(--maroon); }
        .wa-live { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:0 0 18px; font-size:14px; }
        .wa-dot { width:9px; height:9px; border-radius:50%; background:var(--emerald); box-shadow:0 0 0 4px var(--emerald-bg); display:inline-block; }
        .wa-note { background:var(--surface-muted); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin:0 0 20px; font-size:13px; color:var(--text-muted); }
        .wa-note.warn { background:var(--crimson-bg); color:var(--crimson); border-color:var(--crimson-bg); }
        .wa-card { margin-bottom:20px; min-width:0; }
        .wa-card h3 { margin:0 0 4px; font-size:16px; }
        .wa-hint { margin:0 0 12px; font-size:12.5px; }
        .wa-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:20px; }
        .wa-grid-3 { grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); }
        .wa-sub { margin:12px 0 14px; font-size:18px; }
        .wa-bars { display:flex; flex-direction:column; gap:8px; }
        .wa-bar-row { display:grid; grid-template-columns:minmax(90px, 40%) 1fr auto; gap:10px; align-items:center; font-size:13px; }
        .wa-bar-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wa-bar-track { background:var(--surface-muted); border-radius:6px; height:10px; overflow:hidden; }
        .wa-bar-fill { display:block; height:100%; background:var(--maroon); border-radius:6px; }
        .wa-bar-num { font-weight:700; min-width:36px; text-align:right; }
        .wa-trend { display:flex; align-items:flex-end; gap:4px; height:180px; padding-top:18px; overflow-x:auto; }
        .wa-col { flex:1 0 22px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:4px; }
        .wa-col-bar { width:70%; min-height:2px; background:var(--maroon); border-radius:4px 4px 0 0; }
        .wa-col-num { font-size:10.5px; font-weight:700; color:var(--text-muted); }
        .wa-col-date { font-size:10px; color:var(--text-muted); white-space:nowrap; }
        .wa-card td a { color:var(--maroon); word-break:break-all; }
      `}</style>
    </div>
  );
}
