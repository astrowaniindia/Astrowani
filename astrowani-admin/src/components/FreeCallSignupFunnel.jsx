import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

/**
 * The gift reveal -> sign-up -> free instant call funnel.
 *
 * WHY IT IS ITS OWN CARD, under the offer rather than on the Analytics page: this is
 * ONE journey that was built as one thing (2026-10-14) and no other card covers it.
 * The main signup funnel starts at the Login screen, which a customer on this journey
 * only ever reaches by pressing BACK — so measuring this flow there shows a hole where
 * the conversions are.
 *
 * Everything here is DISTINCT PEOPLE and comes from PostHog, so it is subject to
 * analytics consent and to the admin's own exclusion list. It is "tracked", never
 * "measured" — do not add any of it to a number that came out of the database.
 *
 * The drop-outs below the funnel are deliberately NOT stages. Somebody whose OTP the
 * server refused is already counted at "Entered their number" above; listing them as a
 * stage would count the same person twice and make the funnel widen.
 *
 * REWIRED 2026-10-17. Its middle stages used to read the FreeCallSignupSheet events
 * (`free_call_signup_*`, `from_gift_reveal`), which stopped being sent when that sheet
 * was reverted on 2026-10-14 — so every stage between "Saw the free-call screen" and
 * "Rang an astrologer" had been reading zero, which looks like a total collapse rather
 * than like a card pointed at events nothing emits. They now read the replacement
 * flow's `signup_gate_*` events. Three stages were dropped rather than left at zero,
 * because the interactions behind them no longer exist: tapping an astrologer to raise
 * the sheet (the card is up from the start now), tapping a separate "send OTP" button
 * before the code was requested, and the sheet being dismissed at all — the card
 * cannot be closed.
 *
 * The fuller view of this journey is its own page, "New Signup Flow 17th Oct".
 */

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
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
  return { days: Number(preset) || 7 };
}

function rangeLabelFor(preset) {
  const p = PRESETS.find((x) => x.key === preset);
  if (!p) return '';
  if (preset === 'today' || preset === 'yesterday') return p.label.toLowerCase();
  return `last ${p.label}`;
}

export default function FreeCallSignupFunnel() {
  const [preset, setPreset] = useState('7');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await client.get('/api/admin/analytics/free-call-signup-funnel', {
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

  const stages = data?.stages || [];
  const dropouts = data?.dropouts || [];
  // Every bar is drawn against the FIRST stage, not against the one above it, so the
  // bars show how much of the original audience survives rather than a series of
  // local percentages that each look healthy while the total quietly collapses.
  const top = stages.length ? (Number(stages[0].count) || 0) : 0;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          New Sign-up &amp; Free Instant Call — Funnel
        </h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className="btn sm"
              onClick={() => setPreset(p.key)}
              style={{ fontWeight: preset === p.key ? 700 : 400, opacity: preset === p.key ? 1 : 0.6 }}
            >
              {p.label}
            </button>
          ))}
          <button className="btn sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
        One journey, {rangeLabelFor(preset)}
        {data?.range ? ` (${data.range.from} to ${data.range.to})` : ''}: the app opens, the gift is
        tapped, the free-call screen appears, and the customer signs up inside the pop-up without
        ever seeing the Login screen. Counted as <strong>distinct people</strong>, and
        these are <strong>tracked</strong> numbers (app analytics), not database ones — never add
        them to a measured figure.
      </p>

      {err && <p style={{ color: 'var(--danger, #c0392b)', fontSize: 13, fontWeight: 600 }}>{err}</p>}

      {!err && !stages.length && !loading && (
        <p className="muted" style={{ fontSize: 13 }}>Nothing recorded in this range yet.</p>
      )}

      {stages.map((s, i) => {
        const n = Number(s.count) || 0;
        const ofTop = top ? Math.round((n / top) * 1000) / 10 : 0;
        const prev = i > 0 ? (Number(stages[i - 1].count) || 0) : 0;
        // The step-to-step drop, which is the number that tells you WHERE to look.
        const ofPrev = i > 0 && prev ? Math.round((n / prev) * 1000) / 10 : null;
        const lost = i > 0 ? Math.max(0, prev - n) : 0;
        return (
          <div key={s.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{i + 1}. {s.label}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{n.toLocaleString('en-IN')}</span>
              <span className="muted" style={{ fontSize: 11.5, minWidth: 48, textAlign: 'right' }}>
                {ofTop}%
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginTop: 3 }}>
              <div
                style={{
                  width: `${Math.min(100, ofTop)}%`,
                  height: '100%',
                  background: 'var(--maroon)',
                  borderRadius: 4,
                }}
              />
            </div>
            {ofPrev !== null && (
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {ofPrev}% of the step above
                {lost > 0 && ` · ${lost.toLocaleString('en-IN')} lost here`}
              </div>
            )}
          </div>
        );
      })}

      {!!dropouts.length && (
        <>
          <h4 style={{ margin: '22px 0 4px', fontSize: 13.5, fontWeight: 700 }}>Where they went instead</h4>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
            Not funnel stages — these people are already counted above. This is what they did
            rather than finishing.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {dropouts.map((d) => (
              <div
                key={d.key}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {(Number(d.count) || 0).toLocaleString('en-IN')}
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>{d.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
