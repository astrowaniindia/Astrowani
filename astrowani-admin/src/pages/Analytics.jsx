import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import client from '../api/client';

const APP_TABS = [
  { key: 'customer', label: 'Customer App' },
  { key: 'vendor', label: 'Vendor App' },
];

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

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [topScreens, setTopScreens] = useState([]);
  const [funnel, setFunnel] = useState(null);
  const [appTab, setAppTab] = useState('customer');
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState('');

  // Session replay — controlled entirely from here. Both RN apps read these two
  // app_settings keys directly (public-read table) at launch; toggling here changes
  // behavior on the *next* app launch/session, same eventual-consistency model as the
  // banner rotation interval on the Banners page.
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [replaySampleRate, setReplaySampleRate] = useState('0.1');
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayLoaded, setReplayLoaded] = useState(false);

  const loadReplaySettings = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/settings');
      const s = data.settings || {};
      setReplayEnabled(s.session_replay_enabled === 'true');
      setReplaySampleRate(s.session_replay_sample_rate ?? '0.1');
    } catch (e) {
      console.error('load replay settings failed (run app_settings_schema.sql):', e.message);
    } finally {
      setReplayLoaded(true);
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

  useEffect(() => { loadReplaySettings(); }, [loadReplaySettings]);

  const load = useCallback(async () => {
    try {
      const [summaryRes, trendRes, screensRes, funnelRes] = await Promise.all([
        client.get('/api/admin/analytics/summary', { params: { days: 7 } }),
        client.get('/api/admin/analytics/trend', { params: { days: 30 } }),
        client.get('/api/admin/analytics/top-screens', { params: { days: 7, app: appTab } }),
        client.get('/api/admin/analytics/funnel', { params: { days: 7 } }),
      ]);
      setSummary(summaryRes.data);
      setTrend(pivotTrend(trendRes.data.points || []));
      setTopScreens(screensRes.data.screens || []);
      setFunnel(funnelRes.data);
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
  }, [appTab]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // auto-refresh every 60s
    return () => clearInterval(t);
  }, [load]);

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
    { label: 'Screen Views (7d)', value: summary?.views },
    { label: 'Unique Users (7d)', value: summary?.uniques },
  ];

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Analytics</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      {error && <div className="error-text">{error}</div>}

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
        <h3 style={{ marginTop: 0 }}>Daily Screen Views (30d)</h3>
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
        <h3 style={{ marginTop: 0 }}>Call &amp; Chat Funnel (7d, customer app)</h3>
        <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
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
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Top Screens (7d)</h3>
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
