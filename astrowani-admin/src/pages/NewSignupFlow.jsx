import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

/**
 * "New Signup Flow 17th Oct" — its own page, at the top of the sidebar.
 *
 * THE FLOW. A signed-out visitor gets a gift box; tapping it bursts into "YOU WIN · 11
 * minute free call"; the app then hands over to the free 11-minute panel itself and a
 * card rises over the bottom of it carrying the whole sign-up — phone, OTP and name —
 * without leaving the screen. The card cannot be dismissed.
 *
 * WHY IT IS NOT A CARD ON ANALYTICS. The auth funnels there measure the OLDER route
 * (Login screen → VerifyOtp → SignupName), which is still live for sign-out and for
 * the 401 interceptor. Averaging two different products into one funnel would make
 * neither number mean anything, so these sit side by side instead.
 *
 * EVERY NUMBER HERE IS DISTINCT PEOPLE, from PostHog — so it is subject to analytics
 * consent and to the admin's exclusion list. It is "tracked", never "measured": do not
 * add any of it to a figure that came out of the database.
 */

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7', label: '7 days' },
  { key: '14', label: '14 days' },
  { key: '30', label: '30 days' },
];

// Local calendar date, NOT toISOString() — that converts to UTC first and lands on the
// wrong day for an admin sitting in IST before 05:30.
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeParamsFor(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (preset === 'today') { const d = toLocalISODate(today); return { from: d, to: d }; }
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const d = toLocalISODate(y); return { from: d, to: d };
  }
  return { days: Number(preset) || 14 };
}

/** Earliest day this flow could have produced anything. */
function rangeReachesBeforeLaunch(preset, launchedOn) {
  if (!launchedOn) return false;
  const params = rangeParamsFor(preset);
  const start = params.from
    ? new Date(`${params.from}T00:00:00`)
    : new Date(Date.now() - (params.days - 1) * 86400000);
  return start < new Date(`${launchedOn}T00:00:00`);
}

function pct(n, of) {
  if (!of) return '—';
  return `${Math.round((n / of) * 1000) / 10}%`;
}

function Funnel({ title, note, stages, accent }) {
  // Every bar is drawn against the FIRST stage, not the one above it, so the bars show
  // how much of the original audience survives rather than a series of local
  // percentages that each look healthy while the total quietly collapses.
  const top = stages.length ? Number(stages[0].count) || 0 : 0;
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 2px' }}>{title}</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12, opacity: 0.7 }}>{note}</p>
      {stages.map((s, i) => {
        const n = Number(s.count) || 0;
        const prev = i === 0 ? n : Number(stages[i - 1].count) || 0;
        const width = top ? Math.max((n / top) * 100, n > 0 ? 1.5 : 0) : 0;
        const lost = i === 0 ? 0 : prev - n;
        return (
          <div key={s.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{s.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                <strong>{n.toLocaleString()}</strong>
                <span style={{ opacity: 0.55, marginLeft: 8 }}>{pct(n, top)}</span>
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'rgba(128,128,128,0.15)' }}>
              <div style={{ width: `${width}%`, height: '100%', borderRadius: 6, background: accent }} />
            </div>
            {lost > 0 && (
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>
                {lost.toLocaleString()} lost at this step
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className="card" style={{ flex: '1 1 180px', margin: 0 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function NewSignupFlow() {
  const [preset, setPreset] = useState('14');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await client.get('/api/admin/analytics/new-signup-flow', {
        params: rangeParamsFor(preset),
      });
      if (res.data?.success) setData(res.data);
      else setErr(res.data?.message || 'Could not load the funnel.');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Could not load the funnel.');
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const acquire = data?.acquire || [];
  const activate = data?.activate || [];
  const entry = data?.entry || {};
  const outcome = data?.outcome || {};
  const failures = data?.failures || [];

  const shown = acquire.length ? Number(acquire[0].count) || 0 : 0;
  const signedIn = acquire.length ? Number(acquire[acquire.length - 1].count) || 0 : 0;
  const answered = activate.length ? Number(activate[activate.length - 1].count) || 0 : 0;
  const preLaunch = rangeReachesBeforeLaunch(preset, data?.launchedOn);

  return (
    <div style={{ maxWidth: 1320 }}>
      <h2 style={{ marginBottom: 2 }}>New Signup Flow 17th Oct</h2>
      <p style={{ marginTop: 0, fontSize: 13, opacity: 0.75, maxWidth: 820 }}>
        Gift box → “YOU WIN” → the free 11-minute panel, with the whole sign-up
        happening in a card over it. Distinct people, from PostHog. The older
        Login → OTP → Name route is still live for sign-out and expired sessions and is
        measured separately on <strong>Analytics</strong>.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 18px' }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={preset === p.key ? 'btn' : 'btn btn-ghost'}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* A range reaching back before the flow shipped reports zeros that read as a
          collapse rather than as "not built yet". Say so rather than drawing it. */}
      {preLaunch && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '3px solid #E0A800' }}>
          This flow went live on <strong>{data?.launchedOn}</strong>. Days before that
          have none of these events at all, so anything earlier in this range counts as
          zero — it is not a drop.
        </div>
      )}

      {err && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '3px solid #C0392B' }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <Tile label="Saw the gift box" value={shown.toLocaleString()} />
        <Tile label="Signed in" value={signedIn.toLocaleString()} hint={`${pct(signedIn, shown)} of the box`} />
        <Tile label="Got a call answered" value={answered.toLocaleString()} hint={`${pct(answered, signedIn)} of those signed in`} />
        <Tile
          label="New vs returning"
          value={`${(outcome.newAccounts || 0).toLocaleString()} / ${(outcome.returning || 0).toLocaleString()}`}
          hint="One phone box serves both"
        />
      </div>

      <Funnel
        title="1 · Gift box to signed in"
        note="Of the people shown the prize, how many finished the card. Every bar is against the first stage."
        stages={acquire}
        accent="#137A43"
      />

      <Funnel
        title="2 · Signed in to actually talking"
        note="Only people who finished the card in this range. The point of the flow is the call, not the account."
        stages={activate}
        accent="#1B5FD9"
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 2px' }}>How signed-out visitors arrive</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.7 }}>
          The gift reveal plays once per install. “Came back later” is therefore someone
          who left part-way through and reopened the app straight onto the panel — if it
          climbs, people are leaving the card and returning.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Tile label="Straight off the gift box" value={(entry.viaReveal || 0).toLocaleString()} />
          <Tile label="Came back later" value={(entry.viaDirect || 0).toLocaleString()} />
          <Tile label="Left on the unopened box" value={(outcome.leftOnBox || 0).toLocaleString()} hint="Never tapped it" />
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 2px' }}>What went wrong inside the card</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, opacity: 0.7 }}>
          Server-side refusals and failures, with the step they happened on. These are
          not funnel stages — the same person is already counted above — they are what a
          cliff in the funnel is caused by.
        </p>
        {failures.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Nothing failed in this range.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '4px 0' }}>Step</th>
                <th>Reason</th>
                <th style={{ textAlign: 'right' }}>Times</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={`${f.step}-${f.reason}`}>
                  <td style={{ padding: '4px 0' }}>{f.step}</td>
                  <td style={{ opacity: 0.8 }}>{f.reason}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
