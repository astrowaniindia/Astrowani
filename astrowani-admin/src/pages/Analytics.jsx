import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import client from '../api/client';

const APP_TABS = [
  { key: 'customer', label: 'Customer App' },
  { key: 'vendor', label: 'Vendor App' },
];

const AUTH_FUNNEL_TYPES = [
  { key: 'signup', label: 'Signup' },
  { key: 'login', label: 'Login' },
];

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

// Local calendar date as YYYY-MM-DD — NOT d.toISOString().slice(0,10), which shifts to
// UTC first and can land on the wrong day depending on the admin's timezone (e.g. IST
// midnight is still the previous day in UTC).
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computePresetRange(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (preset === 'today') return { from: toLocalISODate(today), to: toLocalISODate(today) };
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: toLocalISODate(y), to: toLocalISODate(y) };
  }
  if (preset === 'month') {
    const from = new Date(today); from.setDate(from.getDate() - 29);
    return { from: toLocalISODate(from), to: toLocalISODate(today) };
  }
  // week (default)
  const from = new Date(today); from.setDate(from.getDate() - 6);
  return { from: toLocalISODate(from), to: toLocalISODate(today) };
}

// 'free_service_card' -> 'Free Service Card'
function formatSectionLabel(section) {
  if (!section) return '(unknown)';
  return section.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// One shared control for every date-dependent card on the page — quick presets plus a
// fully custom From/To range, instead of each card having its own separate selector.
function DateRangeControl({ preset, from, to, onPreset, onCustom }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="btn-group">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              className={`btn sm ${preset === p.key ? '' : 'ghost'}`}
              onClick={() => onPreset(p.key)}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>Custom:</span>
          <input
            type="date" value={from} max={to}
            onChange={(e) => onCustom(e.target.value, to)}
            style={{ padding: '6px 8px', width: 150 }}
          />
          <span className="muted">to</span>
          <input
            type="date" value={to} min={from} max={toLocalISODate(new Date())}
            onChange={(e) => onCustom(from, e.target.value)}
            style={{ padding: '6px 8px', width: 150 }}
          />
        </div>
      </div>
      <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
        Showing <b>{formatDateLabel(from)} – {formatDateLabel(to)}</b> — every card below
        (except D1/D7 Retention, which is a rolling 30-day cohort window by its nature)
        reflects this range.
      </p>
    </div>
  );
}

// PostHog's /trend rows come back as [{ day, app, views }, ...] — pivot into one row per
// day with a column per app so recharts can plot both as separate lines.
function pivotTrend(points) {
  const byDay = new Map();
  for (const p of points) {
    if (!byDay.has(p.day)) byDay.set(p.day, { day: p.day, customer: 0, vendor: 0 });
    byDay.get(p.day)[p.app === 'vendor' ? 'vendor' : 'customer'] = p.views;
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

// One stage of a simple two-stage funnel — a labeled bar whose fill width is the
// conversion rate relative to the first stage's count.
function FunnelRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <span>{label}</span>
        <span className="muted">{count} {total > 0 ? `(${pct}%)` : ''}</span>
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

// A multi-stage funnel drawn as boxes connected by ↓ arrows, each arrow labeled with the
// drop-off from the stage above it — not just names, the actual shape of where people
// leave. `pctOfFirst` under each box is conversion relative to the very first stage
// (usually "viewed the screen at all"), so both "where's the biggest single leak" (the
// arrow labels) and "what fraction ever gets there" (the box labels) are visible at once.
function StepFunnel({ stages }) {
  const first = stages[0]?.count || 0;
  return (
    <div>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const pctOfFirst = first > 0 ? Math.round((s.count / first) * 100) : 0;
        const dropFromPrev = prev !== null && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
        return (
          <div key={s.key}>
            {i > 0 && (
              <div style={{ textAlign: 'center', margin: '2px 0 2px 22px' }}>
                <span style={{ color: dropFromPrev > 0 ? 'var(--red)' : 'var(--green)', fontSize: 12, fontWeight: 600 }}>
                  ↓ {dropFromPrev !== null ? (dropFromPrev > 0 ? `${dropFromPrev}% dropped off here` : 'no drop-off') : ''}
                </span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 8, background: '#fafbfc',
                border: '1px solid var(--border)', borderLeft: '4px solid var(--maroon)',
              }}
            >
              <span>{s.label}</span>
              <span>
                <b>{s.count}</b>{' '}
                <span className="muted" style={{ fontSize: 12 }}>({pctOfFirst}% of viewed)</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topScreens, setTopScreens] = useState([]);
  const [funnel, setFunnel] = useState(null);
  const [remediesFunnel, setRemediesFunnel] = useState(null);
  const [homeInteractions, setHomeInteractions] = useState([]);
  const [homeFlow, setHomeFlow] = useState(null);
  const [authFunnel, setAuthFunnel] = useState(null);
  const [authFunnelType, setAuthFunnelType] = useState('signup');

  // Shared date range for every card on the page (except D1/D7 Retention, a rolling
  // cohort window that doesn't fit a simple from/to filter).
  const [datePreset, setDatePreset] = useState('week');
  const [dateRange, setDateRange] = useState(() => computePresetRange('week'));
  const applyPreset = (preset) => { setDatePreset(preset); setDateRange(computePresetRange(preset)); };
  const applyCustom = (from, to) => { setDatePreset('custom'); setDateRange({ from, to }); };
  const [revenue, setRevenue] = useState(null);
  const [sessionVolume, setSessionVolume] = useState(null);
  const [revenueByType, setRevenueByType] = useState(null);
  const [paymentFunnel, setPaymentFunnel] = useState(null);
  const [customerSplit, setCustomerSplit] = useState(null);
  const [retention, setRetention] = useState(null);
  const [appHealth, setAppHealth] = useState(null);
  const [appHealthNotConfigured, setAppHealthNotConfigured] = useState(false);
  const [appTab, setAppTab] = useState('customer');
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState('');

  // Analytics environment ('test' | 'production') — every event either app captures is
  // tagged with this at launch, and every PostHog-backed query above filters to
  // 'production' only. Pre-launch testing with friends/family astrologers is tagged
  // 'test' by default, so it never shows up here — flip this to 'production' when you
  // actually go live. Switching it doesn't touch or delete any already-captured data;
  // it just changes what gets tagged on *new* events from that point on, and the
  // dashboard's own filtering does the rest.
  const [analyticsEnv, setAnalyticsEnv] = useState('test');
  const [envBusy, setEnvBusy] = useState(false);
  const [envLoaded, setEnvLoaded] = useState(false);

  // Session replay — controlled entirely from here. Both RN apps read these two
  // app_settings keys directly (public-read table) at launch; toggling here changes
  // behavior on the *next* app launch/session, same eventual-consistency model as the
  // banner rotation interval on the Banners page.
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [replaySampleRate, setReplaySampleRate] = useState('0.1');
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayLoaded, setReplayLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');
      const s = data.settings || {};
      setReplayEnabled(s.session_replay_enabled === 'true');
      setReplaySampleRate(s.session_replay_sample_rate ?? '0.1');
      setAnalyticsEnv(s.analytics_environment === 'production' ? 'production' : 'test');
    } catch (e) {
      console.error('load settings failed (run app_settings_schema.sql):', e.message);
    } finally {
      setReplayLoaded(true);
      setEnvLoaded(true);
    }
  }, []);

  const saveReplaySettings = async (nextEnabled, nextSampleRate) => {
    const rate = Math.max(0, Math.min(1, Number(nextSampleRate)));
    setReplayBusy(true);
    try {
      await Promise.all([
        client.patch('/api/admin/settings', { key: 'session_replay_enabled', value: nextEnabled ? 'true' : 'false' }),
        client.patch('/api/admin/settings', { key: 'session_replay_sample_rate', value: rate }),
      ]);
      setReplayEnabled(nextEnabled);
      setReplaySampleRate(String(rate));
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setReplayBusy(false);
    }
  };

  const saveAnalyticsEnv = async (next) => {
    setEnvBusy(true);
    try {
      await client.patch('/api/admin/settings', { key: 'analytics_environment', value: next });
      setAnalyticsEnv(next);
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setEnvBusy(false);
    }
  };

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const load = useCallback(async () => {
    try {
      const dateParams = { from: dateRange.from, to: dateRange.to };
      const [summaryRes, trendRes, screensRes, funnelRes, remediesFunnelRes, revenueRes, sessionsRes, retentionRes,
        revByTypeRes, paymentFunnelRes, customerSplitRes, homeInteractionsRes, homeFlowRes] = await Promise.all([
        client.get('/api/admin/analytics/summary', { params: dateParams }),
        client.get('/api/admin/analytics/trend', { params: dateParams }),
        client.get('/api/admin/analytics/top-screens', { params: { ...dateParams, app: appTab } }),
        client.get('/api/admin/analytics/funnel', { params: dateParams }),
        client.get('/api/admin/analytics/remedies-funnel', { params: dateParams }),
        client.get('/api/admin/analytics/revenue', { params: dateParams }),
        client.get('/api/admin/analytics/session-volume', { params: dateParams }),
        // Retention is a rolling 30-day cohort window by nature (not "events between two
        // dates") — deliberately not wired to the shared date-range control above.
        client.get('/api/admin/analytics/retention', { params: { days: 30 } }),
        // Supabase-backed — no POSTHOG_* dependency, so these never trip notConfigured.
        client.get('/api/admin/analytics/revenue-by-type', { params: dateParams }),
        client.get('/api/admin/analytics/payment-funnel', { params: dateParams }),
        client.get('/api/admin/analytics/customer-revenue-split', { params: dateParams }),
        // Customer-app-only (Home.js has no vendor equivalent) — not tied to appTab.
        client.get('/api/admin/analytics/home-interactions', { params: dateParams }),
        client.get('/api/admin/analytics/home-flow', { params: dateParams }),
      ]);
      setSummary(summaryRes.data);
      setTrend(pivotTrend(trendRes.data.points || []));
      setTopScreens(screensRes.data.screens || []);
      setFunnel(funnelRes.data);
      setRemediesFunnel(remediesFunnelRes.data);
      setRevenue(revenueRes.data);
      setSessionVolume(sessionsRes.data);
      setRetention(retentionRes.data);
      setRevenueByType(revByTypeRes.data);
      setPaymentFunnel(paymentFunnelRes.data);
      setCustomerSplit(customerSplitRes.data);
      setHomeInteractions(homeInteractionsRes.data.sections || []);
      setHomeFlow(homeFlowRes.data);
      setNotConfigured(false);
      setError('');
    } catch (e) {
      if (e.response?.status === 503) {
        setNotConfigured(true);
      } else {
        setError(e.response?.data?.message || e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [appTab, dateRange]);

  // Independent fetch, keyed on its own selector state — separate from the main load()
  // so switching Signup/Login doesn't re-fetch every other card on the page.
  const loadAuthFunnel = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/analytics/auth-funnel', {
        params: { type: authFunnelType, from: dateRange.from, to: dateRange.to },
      });
      setAuthFunnel(data);
    } catch (e) {
      // A missing/misconfigured POSTHOG_* var already shows the page-level "not
      // configured" state via the main load() call — nothing extra to show here.
    }
  }, [authFunnelType, dateRange]);

  useEffect(() => { loadAuthFunnel(); }, [loadAuthFunnel]);

  // Independent fetch — Sentry not being configured yet is expected and shouldn't 503
  // the rest of the page the way a missing POSTHOG_* var does above.
  const loadAppHealth = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/analytics/app-health', { params: { days: 7 } });
      setAppHealth(data);
      setAppHealthNotConfigured(false);
    } catch (e) {
      if (e.response?.status === 503) setAppHealthNotConfigured(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // auto-refresh every 60s
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    loadAppHealth();
    const t = setInterval(loadAppHealth, 60000);
    return () => clearInterval(t);
  }, [loadAppHealth]);

  const envCard = (
    <div className="card" style={{ marginBottom: 18, borderLeft: `4px solid ${analyticsEnv === 'production' ? 'var(--maroon)' : 'var(--amber)'}` }}>
      <div className="row-between">
        <div>
          <h3 style={{ margin: 0 }}>Analytics Environment</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {analyticsEnv === 'production'
              ? 'Live — every dashboard number below reflects real users only.'
              : 'Test mode — screens/events from testers are tagged ‘test’ and excluded from every chart below. Nothing here is real traffic yet.'}
          </p>
        </div>
        <button
          className="btn"
          disabled={!envLoaded || envBusy}
          onClick={() => {
            const next = analyticsEnv === 'production' ? 'test' : 'production';
            if (next === 'production' && !window.confirm('Switch to production? All new screen views/events will start counting toward real numbers.')) return;
            saveAnalyticsEnv(next);
          }}
        >
          {envBusy ? 'Saving…' : analyticsEnv === 'production' ? 'Switch to Test' : 'Go Live (Switch to Production)'}
        </button>
      </div>
    </div>
  );

  const replayCard = (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Session Replay</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={replayEnabled}
            disabled={!replayLoaded || replayBusy}
            onChange={(e) => saveReplaySettings(e.target.checked, replaySampleRate)}
          />
          {replayEnabled ? 'On' : 'Off'}
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>Sample rate (0–1, e.g. 0.1 = record 10% of sessions)</label>
          <input
            type="number" min="0" max="1" step="0.05"
            value={replaySampleRate}
            onChange={(e) => setReplaySampleRate(e.target.value)}
          />
        </div>
        <button
          className="btn"
          disabled={replayBusy}
          onClick={() => saveReplaySettings(replayEnabled, replaySampleRate)}
        >
          {replayBusy ? 'Saving…' : 'Save sample rate'}
        </button>
        <span className="muted" style={{ alignSelf: 'center' }}>
          Records real user sessions to watch back in PostHog. Off by default. Applies to new
          app sessions after this is saved — free tier caps at 5,000 recordings/month, so keep
          the sample rate low unless you're actively debugging something.
        </span>
      </div>
    </div>
  );

  if (notConfigured) {
    return (
      <div>
        <h1 className="page-title">Analytics</h1>
        {envCard}
        {replayCard}
        <div className="card">
          <p style={{ margin: 0 }}>
            Product analytics isn't configured yet. Once the PostHog project exists, set
            <code> POSTHOG_HOST</code>, <code>POSTHOG_PROJECT_ID</code>, and
            <code> POSTHOG_PERSONAL_API_KEY</code> in the backend's environment — this page will
            start showing real data automatically, no redeploy of this dashboard needed.
          </p>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Screen Views', value: summary?.views },
    { label: 'Unique Users', value: summary?.uniques },
    { label: 'DAU', value: summary?.dau },
    { label: 'WAU', value: summary?.wau },
    { label: 'MAU', value: summary?.mau },
    { label: 'Revenue', value: revenue ? `₹${revenue.total.toLocaleString('en-IN')}` : undefined },
    { label: 'Sessions', value: sessionVolume?.totalSessions },
    { label: 'Session Minutes', value: sessionVolume?.totalMinutes },
  ];

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Analytics</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      {error && <div className="error-text">{error}</div>}

      <DateRangeControl
        preset={datePreset}
        from={dateRange.from}
        to={dateRange.to}
        onPreset={applyPreset}
        onCustom={applyCustom}
      />

      {envCard}
      {replayCard}

      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value">{loading ? '…' : (c.value ?? 0)}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>App Health</h3>
        {appHealthNotConfigured ? (
          <p className="muted" style={{ margin: 0 }}>
            Not configured yet — create a read-only Sentry Internal Integration token
            (Issue &amp; Event: Read + Project: Read only) and set <code>SENTRY_AUTH_TOKEN</code> in
            the backend's environment. Same least-privilege pattern as the other analytics keys —
            never reuse the bug-scan routine's token for this.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {['customer', 'vendor'].map((appName) => (
              <div key={appName}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{appName === 'customer' ? 'Customer App' : 'Vendor App'}</div>
                <div className="row-between"><span className="muted">Unresolved issues</span><span>{appHealth?.[appName]?.unresolved ?? '…'}</span></div>
                <div className="row-between"><span className="muted">New issues (7d)</span><span>{appHealth?.[appName]?.newIssues ?? '…'}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>D1 / D7 Retention (customer app)</h3>
        <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
          Of everyone whose first-ever screen view fell on a given day, what fraction came back
          the next day (D1) or a week later (D7). The more trustworthy "are people actually
          coming back" number — screen-view counts alone can't tell you that.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>D1 Retention</div>
            <FunnelRow
              label="Returned next day"
              count={retention?.d1?.returned ?? 0}
              total={retention?.d1?.cohortSize ?? 0}
              color="var(--maroon)"
            />
            <span className="muted">Cohort size: {retention?.d1?.cohortSize ?? 0}</span>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>D7 Retention</div>
            <FunnelRow
              label="Returned after a week"
              count={retention?.d7?.returned ?? 0}
              total={retention?.d7?.cohortSize ?? 0}
              color="var(--amber)"
            />
            <span className="muted">Cohort size: {retention?.d7?.cohortSize ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Daily Revenue</h3>
        <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
          From paid wallet recharges — Supabase, not PostHog, so this is real money regardless
          of the environment toggle above (a paid recharge is never "test" data).
        </p>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={revenue?.points || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `₹${v}`} />
              <Bar dataKey="revenue" name="Revenue (₹)" fill="var(--maroon)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Chat</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>₹{(revenueByType?.chat ?? 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Call</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>₹{(revenueByType?.call ?? 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Video</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>₹{(revenueByType?.video ?? 0).toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="row-between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Payment Funnel</h3>
        </div>
        <p className="muted" style={{ marginTop: 6, marginBottom: 16 }}>
          Every recharge a customer started, and how many actually completed. A failed/abandoned
          Razorpay checkout is otherwise invisible — this is the only place it shows up.
        </p>
        <FunnelRow
          label="Started"
          count={paymentFunnel?.total ?? 0}
          total={paymentFunnel?.total ?? 0}
          color="var(--maroon)"
        />
        <FunnelRow
          label="Paid"
          count={paymentFunnel?.paid ?? 0}
          total={paymentFunnel?.total ?? 0}
          color="var(--maroon)"
        />
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="muted">Failed</span>
          <span>{paymentFunnel?.failed ?? 0}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>New vs. Returning Customer Revenue</h3>
        <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
          "New" = this was that customer's first paid recharge ever. Revenue coming mostly from
          returning customers means people are sticking around; mostly-new means you're
          constantly acquiring but not retaining.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>New customers</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>₹{(customerSplit?.new?.revenue ?? 0).toLocaleString('en-IN')}</div>
            <div className="muted" style={{ fontSize: 12 }}>{customerSplit?.new?.count ?? 0} recharge(s)</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Returning customers</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>₹{(customerSplit?.returning?.revenue ?? 0).toLocaleString('en-IN')}</div>
            <div className="muted" style={{ fontSize: 12 }}>{customerSplit?.returning?.count ?? 0} recharge(s)</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Daily Session Volume</h3>
        <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
          Call + chat sessions per day and total minutes — also Supabase-sourced, real data.
        </p>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={sessionVolume?.points || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sessions" name="Sessions" stroke="var(--maroon)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="minutes" name="Minutes" stroke="var(--amber)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Daily Screen Views</h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="customer" name="Customer App" stroke="#6b1f2a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="vendor" name="Vendor App" stroke="#c98a2c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0 }}>New Customer Funnel — {authFunnel?.label || 'Signup'}</h3>
          <div className="btn-group">
            {AUTH_FUNNEL_TYPES.map((f) => (
              <button
                key={f.key}
                className={`btn sm ${authFunnelType === f.key ? '' : 'ghost'}`}
                onClick={() => setAuthFunnelType(f.key)}
              >{f.label}</button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 16 }}>
          Where new customers actually drop off — every arrow below is a real leak, not just
          a name. Switch between Signup and Login above to see either funnel.
        </p>
        {authFunnel?.stages?.length ? (
          <StepFunnel stages={authFunnel.stages} />
        ) : (
          <p className="muted" style={{ margin: 0 }}>Loading…</p>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Call &amp; Chat Funnel (customer app)</h3>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 16 }}>
          Of everyone who tapped Call or Chat, how many actually connected. (Customer-only —
          the vendor app only ever accepts, never initiates, so there's no equivalent funnel
          there.)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Call</div>
            <FunnelRow label="Initiated" count={funnel?.call?.initiated ?? 0} total={funnel?.call?.initiated ?? 0} color="var(--maroon)" />
            <FunnelRow label="Connected" count={funnel?.call?.connected ?? 0} total={funnel?.call?.initiated ?? 0} color="var(--maroon)" />
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Chat</div>
            <FunnelRow label="Initiated" count={funnel?.chat?.initiated ?? 0} total={funnel?.chat?.initiated ?? 0} color="var(--amber)" />
            <FunnelRow label="Connected" count={funnel?.chat?.connected ?? 0} total={funnel?.chat?.initiated ?? 0} color="var(--amber)" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Remedies Purchase Funnel (customer app)</h3>
        <p className="muted" style={{ marginTop: 10, marginBottom: 16 }}>
          Of everyone who tapped "Buy Now" on a remedy, how many actually placed an order.
          "Order Placed" only counts a confirmed order (the POST actually succeeded), not just
          the tap.
        </p>
        <FunnelRow label="Buy Now tapped" count={remediesFunnel?.buyNowClicked ?? 0} total={remediesFunnel?.buyNowClicked ?? 0} color="var(--maroon)" />
        <FunnelRow label="Place Order tapped" count={remediesFunnel?.placeOrderClicked ?? 0} total={remediesFunnel?.buyNowClicked ?? 0} color="var(--maroon)" />
        <FunnelRow label="Order placed" count={remediesFunnel?.orderPlaced ?? 0} total={remediesFunnel?.buyNowClicked ?? 0} color="var(--amber)" />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Home Screen</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          Customer app only. Every tap on Home — search, banners, category tiles, astrologer
          cards (in all three astrologer sections), free-service/astro-report cards, blog cards,
          review cards, the "View All" links, and the fixed Chat/Call bar — plus where people go
          immediately after Home, and how often Home is the last screen before they leave a session.
        </p>
        <div className="two-col" style={{ marginTop: 12 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Taps by section</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Section</th><th>Taps</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={2} className="empty">Loading…</td></tr>}
                  {!loading && homeInteractions.length === 0 && (
                    <tr><td colSpan={2} className="empty">No home-screen taps recorded yet.</td></tr>
                  )}
                  {homeInteractions.map((s) => (
                    <tr key={s.section}>
                      <td>{formatSectionLabel(s.section)}</td>
                      <td className="muted">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Where people go after Home</div>
            <div className="stat-grid" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="stat-label">Home views</div>
                <div className="stat-value">{homeFlow?.totalHomeViews ?? 0}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Left app from Home</div>
                <div className="stat-value">{homeFlow?.exitRatePercent ?? 0}%</div>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Next screen</th><th>Sessions</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={2} className="empty">Loading…</td></tr>}
                  {!loading && (homeFlow?.nextScreens || []).length === 0 && (
                    <tr><td colSpan={2} className="empty">No navigation data yet.</td></tr>
                  )}
                  {(homeFlow?.nextScreens || []).map((s) => (
                    <tr key={s.screen}>
                      <td>{s.screen}</td>
                      <td className="muted">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Top Screens</h3>
          <div className="btn-group">
            {APP_TABS.map((t) => (
              <button
                key={t.key}
                className={`btn sm ${appTab === t.key ? '' : 'ghost'}`}
                onClick={() => setAppTab(t.key)}
              >{t.label}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Screen</th><th>Views</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={2} className="empty">Loading…</td></tr>}
              {!loading && topScreens.length === 0 && <tr><td colSpan={2} className="empty">No screen views yet.</td></tr>}
              {topScreens.map((s) => (
                <tr key={s.screen}>
                  <td>{s.screen}</td>
                  <td className="muted">{s.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
