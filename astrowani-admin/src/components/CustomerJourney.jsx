import { useState } from 'react';
import client from '../api/client';

/**
 * The whole customer journey, in the order it happens.
 *
 * Every other card on the Analytics page answers one question with its own query. This
 * one answers the question none of them could: what does a customer actually DO, step
 * by step, from the moment the app opens to the moment they leave — across EVERY event
 * the app fires, not the quarter of them the older cards happened to name.
 *
 * It obeys the same rule as the rest of this page: it fetches NOTHING until Show is
 * pressed, and then exactly one request for the dates currently selected.
 *
 * Numbers here are PostHog's, so they are subject to analytics consent and the
 * environment/exclusion filters above — they are the record of what people tapped, not
 * the record of money. The money lives in the database-backed cards.
 */

export default function CustomerJourney({ from, to }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({}); // which stages are expanded
  const [hideQuiet, setHideQuiet] = useState(true);

  const show = async () => {
    setStatus('loading');
    setErr('');
    try {
      const res = await client.get('/api/admin/analytics/journey', { params: { from, to } });
      setData(res.data);
      setStatus('done');
      // Open the stages that actually had activity; leave the silent ones folded.
      const first = {};
      (res.data.stages || []).forEach((s) => { if (s.eventsWithActivity > 0) first[s.key] = true; });
      setOpen(first);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
      setStatus('error');
    }
  };

  if (status !== 'done') {
    return (
      <div className="card" style={{ marginTop: 18, borderLeft: '4px solid var(--maroon)' }}>
        <div className="row-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Customer Journey — every event, in order</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5, maxWidth: 680 }}>
              {status === 'error'
                ? `Could not load: ${err}`
                : `Every single thing the app records a customer doing — install, sign-up, the free offer, a paid consultation, what happens after — laid out in the order it happens. Not loaded. Press Show to fetch it for ${from} → ${to}.`}
            </p>
          </div>
          <button className="btn" onClick={show} disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading…' : status === 'error' ? 'Retry' : 'Show'}
          </button>
        </div>
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Customer Journey</h3>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{data?.message || 'Not available.'}</p>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={show}>Retry</button>
      </div>
    );
  }

  const stages = data.stages || [];

  return (
    <div className="card" style={{ marginTop: 18, borderLeft: '4px solid var(--maroon)' }}>
      <div className="row-between" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Customer Journey — every event, in order</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
            {data.range.from} → {data.range.to} · tracking{' '}
            <strong>{data.totals.eventsTracked}</strong> events across{' '}
            <strong>{data.totals.stages}</strong> stages ·{' '}
            <strong>{data.totals.eventsWithActivity}</strong> had activity in this range.
            Taps recorded by PostHog, so this follows the environment and exclusion
            settings above — it is not the money record.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={hideQuiet} onChange={(e) => setHideQuiet(e.target.checked)} />
            Hide events nobody did
          </label>
          <button className="btn sm secondary" onClick={show}>↻ Reload</button>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {stages.map((s, idx) => {
          const isOpen = !!open[s.key];
          const rows = hideQuiet ? s.events.filter((e) => e.seen) : s.events;
          return (
            <div
              key={s.key}
              style={{
                border: '1px solid var(--border, #e8e0d6)',
                borderRadius: 10,
                marginBottom: 10,
                overflow: 'hidden',
                opacity: s.eventsWithActivity ? 1 : 0.62,
              }}
            >
              <button
                onClick={() => setOpen((p) => ({ ...p, [s.key]: !p[s.key] }))}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer', border: 0,
                  background: 'var(--maroon-50, #FAF3EE)', padding: '11px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span
                  style={{
                    minWidth: 24, height: 24, borderRadius: 12, background: 'var(--maroon)',
                    color: '#fff', fontSize: 12, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{s.title}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 11.5, marginTop: 2 }}>
                    {s.blurb}
                  </span>
                </span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--maroon)' }}>
                    {s.peopleReached}
                  </span>
                  <span className="muted" style={{ display: 'block', fontSize: 10.5 }}>
                    people · {s.eventsWithActivity}/{s.eventsTotal} events
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 13 }}>{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border, #e8e0d6)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 14px', fontSize: 11 }}>What the customer did</th>
                        <th style={{ textAlign: 'right', padding: '6px 14px', fontSize: 11, width: 80 }}>People</th>
                        <th style={{ textAlign: 'right', padding: '6px 14px', fontSize: 11, width: 80 }}>Times</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="muted" style={{ padding: '10px 14px', fontSize: 12.5 }}>
                            Nothing in this stage happened between {data.range.from} and {data.range.to}.
                          </td>
                        </tr>
                      )}
                      {rows.map((e) => (
                        <tr key={e.event} style={{ borderTop: '1px solid var(--border, #f0e9e2)' }}>
                          <td style={{ padding: '7px 14px', fontSize: 12.5 }}>
                            <span style={{ color: e.drop ? '#A33' : 'inherit' }}>
                              {e.drop ? '↘ ' : ''}{e.label}
                            </span>
                            {e.note && (
                              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{e.note}</div>
                            )}
                            <div className="muted" style={{ fontSize: 10, marginTop: 1, opacity: 0.75 }}>{e.event}</div>
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 700 }}>
                            {e.seen ? e.people : <span className="muted" style={{ fontWeight: 400 }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'right' }}>
                            {e.seen ? e.total : <span className="muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
