import { Fragment, useCallback, useEffect, useState } from 'react';
import client from '../api/client';

/**
 * Analytics for the free instant call offer, shown at the BOTTOM OF THE OFFER'S OWN PAGE
 * rather than on the Analytics page (owner, 2026-10-05). The reasoning is that this is
 * read while tuning the offer — who is in the pool, what the payout is — not while
 * looking at the app as a whole, and walking between two pages to answer one question is
 * how a setting gets changed without its result ever being checked.
 *
 * TWO SOURCES, LABELLED, NEVER MIXED (see freeCallAnalyticsRoutes.js):
 *   • "Measured" — the database. Every ring, answer, hang-up, second and rupee. Exact.
 *   • "Tracked"  — PostHog. The taps that happen before any row exists (the card being
 *                  shown, Claim being pressed). Subject to analytics consent, so it is
 *                  shown separately and never added to a measured number.
 */

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const fmtSeconds = (s) => {
  const n = Number(s) || 0;
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const rem = n % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
};
const fmtWhen = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};
const pct = (n) => `${Number(n) || 0}%`;

const OUTCOME_LABEL = {
  completed: 'Talked',
  too_short: 'Cut in under 30s',
  abandoned_by_astrologer: 'Astrologer left early',
  cancelled: 'Customer moved on',
  missed: 'Nobody answered',
  rejected: 'Astrologer declined',
  ringing: 'Still ringing',
};
const OUTCOME_COLOR = {
  completed: '#16a34a',
  too_short: '#d97706',
  abandoned_by_astrologer: '#c0392b',
  cancelled: '#6b7280',
  missed: '#6b7280',
  rejected: '#c0392b',
  ringing: '#2563eb',
};

function Stat({ label, value, sub, tone }) {
  return (
    <div
      style={{
        flex: '1 1 150px', minWidth: 150, padding: '12px 14px',
        border: '1px solid var(--border)', borderRadius: 10,
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || 'inherit' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** One row of the funnel tree. `of` is the step above, so the drop-off is explicit. */
function TreeRow({ depth, label, value, of, note, tone }) {
  const share = of > 0 ? Math.round((value / of) * 100) : null;
  const lost = of > 0 ? of - value : null;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 0 7px ' + (depth * 22) + 'px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {depth > 0 && <span className="muted" style={{ fontSize: 13, marginLeft: -14 }}>└</span>}
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: depth === 0 ? 700 : 500 }}>{label}</span>
      {note && <span className="muted" style={{ fontSize: 11.5 }}>{note}</span>}
      {share !== null && (
        <span
          className="muted"
          style={{ fontSize: 11.5, minWidth: 96, textAlign: 'right' }}
          title={`${lost} of ${of} did not reach this step`}
        >
          {share}% of above{lost > 0 ? ` · −${lost}` : ''}
        </span>
      )}
      <span style={{ fontSize: 15, fontWeight: 700, minWidth: 60, textAlign: 'right', color: tone || 'inherit' }}>
        {value}
      </span>
    </div>
  );
}

function Bar({ label, value, max, color }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 12.5, minWidth: 190 }}>{label}</span>
      <div style={{ flex: 1, height: 16, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color || '#7c2d12' }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 44, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function FreeCallAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null); // expanded customer timeline
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [a, c] = await Promise.all([
        client.get(`/api/admin/free-call/analytics?days=${days}`),
        client.get(`/api/admin/free-call/analytics/customers?days=${days}`),
      ]);
      setData(a.data);
      setCustomers(c.data?.customers || []);
    } catch (e) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // "Switch to production" (2026-10-06) — same idea as the main Analytics page's
  // analytics_since switch, but scoped to just this feature: everything recorded
  // before this moment is test data from building it, and the backend hides it
  // entirely (`ready: false`) until this is set. One-way by design, same as the
  // main page's environment switch — there is no "switch back to test" button,
  // because going backwards would start mixing real customer data with test data.
  const switchToProduction = async () => {
    if (!window.confirm(
      'Switch Free Instant Call to production? Everything recorded up to right now '
      + '(test rings, test Shagun payments) will stop counting, and every real ring '
      + 'from this moment on starts being measured.'
    )) return;
    setSwitching(true);
    try {
      await client.patch('/api/admin/settings', { key: 'free_call_instant_since', value: new Date().toISOString() });
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setSwitching(false);
    }
  };

  const t = data?.tree || {};
  const clicks = data?.clicks || {};
  const clickBy = (name) => (clicks.events || []).find((e) => e.event === name) || { total: 0, people: 0 };

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Free Instant Call — Analytics</h3>
        {data?.instantSince && (
          <span
            className="muted"
            style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--border)' }}
            title="Everything before this moment was test data and is not counted."
          >
            🟢 Live since {new Date(data.instantSince).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              className="btn sm"
              onClick={() => setDays(r.days)}
              style={{
                fontWeight: days === r.days ? 700 : 400,
                opacity: days === r.days ? 1 : 0.6,
              }}
            >
              {r.label}
            </button>
          ))}
          <button className="btn sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
        Everything this offer did in the last {days} days. <strong>Measured</strong> numbers come
        from the database and are exact. <strong>Tracked</strong> numbers come from app analytics
        and cover the taps that happen before a call exists.
      </p>

      {err && (
        <p style={{ color: 'var(--danger, #c0392b)', fontSize: 13, fontWeight: 600 }}>{err}</p>
      )}

      {data && data.ready === false && data.instantSince === null && !data.message?.startsWith('Run sql/') && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 10,
            background: 'var(--surface)',
          }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>🧪 Still in testing</div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {data.message}
            </p>
          </div>
          <button className="btn" onClick={switchToProduction} disabled={switching}>
            {switching ? 'Switching…' : 'Switch to production'}
          </button>
        </div>
      )}

      {data && data.ready === false && (data.instantSince !== null || data.message?.startsWith('Run sql/')) && (
        <p className="muted" style={{ fontSize: 13 }}>
          {data.message || 'Not recording yet.'}
        </p>
      )}

      {data && data.ready !== false && (
        <>
          {/* ── Headline ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
            <Stat label="Customers who rang" value={t.customersWhoRang || 0} sub={`${t.rings || 0} rings in total`} />
            <Stat label="Calls answered" value={t.answered || 0} sub={pct(data.rates?.answerRate) + ' of rings'} />
            <Stat label="Real conversations" value={t.completed || 0} tone="#16a34a"
              sub={pct(data.rates?.completionRate) + ' of answered'} />
            <Stat label="Total talk time" value={fmtSeconds(data.talk?.totalSeconds)}
              sub={'avg ' + fmtSeconds(data.talk?.avgSeconds) + ' per call'} />
            <Stat label="Paid to astrologers" value={'₹' + (data.money?.payout || 0)} />
            <Stat label="Shagun received" value={'₹' + (data.money?.shagunAmount || 0)}
              sub={(data.money?.shagunCount || 0) + ' payments'} tone="#16a34a" />
          </div>

          {/* ── The tree ── */}
          <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}>The journey, step by step</h4>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
            Each row shows what share of the row above it reached this step, and how many were lost.
          </p>

          <div style={{ marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, margin: '0 0 2px' }}>
              TRACKED — in the app, before any call exists
              {clicks.available === false && <span style={{ color: '#c0392b' }}> · unavailable ({clicks.reason})</span>}
            </div>
            <TreeRow depth={0} label="Saw the free call offer" value={clickBy('free_call_offer_shown').people} of={0}
              note="people" />
            <TreeRow depth={1} label='Tapped "Claim my free call"' value={clickBy('free_call_claim_tapped').people}
              of={clickBy('free_call_offer_shown').people} note="people" />
            <TreeRow depth={2} label="Closed the card instead" value={clickBy('free_call_offer_dismissed').people}
              of={clickBy('free_call_offer_shown').people} note="people" tone="#c0392b" />
            <TreeRow depth={1} label="Opened the astrologer list" value={clickBy('free_call_instant_opened').people}
              of={clickBy('free_call_claim_tapped').people} note="people" />
          </div>

          <div style={{ marginBottom: 22 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, margin: '10px 0 2px' }}>
              MEASURED — what actually happened
            </div>
            <TreeRow depth={0} label="Rang at least one astrologer" value={t.customersWhoRang || 0} of={0}
              note="customers" />
            <TreeRow depth={1} label="Rings placed" value={t.rings || 0} of={0} note="total attempts" />
            <TreeRow depth={2} label="Astrologer picked up" value={t.answered || 0} of={t.rings || 0} />
            <TreeRow depth={3} label="Talked properly (30s+)" value={t.connected || 0} of={t.answered || 0} />
            <TreeRow depth={4} label="Counted as a real consultation" value={t.completed || 0}
              of={t.connected || 0} tone="#16a34a" />
            <TreeRow depth={3} label="Cut in under 30s — free call given back" value={t.tooShort || 0}
              of={t.answered || 0} tone="#d97706" />
            <TreeRow depth={3} label="Astrologer left early — free call given back"
              value={t.abandonedByAstrologer || 0} of={t.answered || 0} tone="#c0392b" />
            <TreeRow depth={2} label="Customer gave up and tried someone else" value={t.cancelled || 0}
              of={t.rings || 0} tone="#6b7280" />
            <TreeRow depth={2} label="Rang out — nobody answered" value={t.missed || 0} of={t.rings || 0}
              tone="#6b7280" />
            <TreeRow depth={2} label="Astrologer declined" value={t.rejected || 0} of={t.rings || 0}
              tone="#c0392b" />
          </div>

          {/* ── Who hangs up ── */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
            <div style={{ flex: '1 1 320px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Who ends the call, and how far in</h4>
              {['customer', 'astrologer', 'system'].map((who) => {
                const d = data.endedBy?.[who] || {};
                return (
                  <div key={who} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, minWidth: 110, textTransform: 'capitalize' }}>
                      {who === 'system' ? 'Ended by server' : who}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, minWidth: 40 }}>{d.count || 0}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {d.count ? `average ${fmtSeconds(d.avgSeconds)} into the call` : '—'}
                    </span>
                  </div>
                );
              })}
              {!!data.endedBy?.unknown && (
                <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                  {data.endedBy.unknown} call(s) ended before this was recorded.
                </p>
              )}
            </div>

            <div style={{ flex: '1 1 320px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>How long they talk</h4>
              {(data.talk?.buckets || []).map((b) => (
                <Bar key={b.label} label={b.label} value={b.count}
                  max={Math.max(...(data.talk?.buckets || []).map((x) => x.count), 1)} />
              ))}
            </div>
          </div>

          {/* ── How many astrologers they try ── */}
          <div style={{ marginBottom: 22 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>
              How many astrologers a customer rings
            </h4>
            {(data.attemptDistribution || []).map((a) => (
              <Bar key={a.rings} label={`${a.rings} astrologer(s)`} value={a.customers}
                max={Math.max(...(data.attemptDistribution || []).map((x) => x.customers), 1)}
                color="#1d4ed8" />
            ))}
          </div>

          {/* ── Per astrologer ── */}
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Astrologer performance</h4>
          <div style={{ overflowX: 'auto', marginBottom: 22 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: 6 }}>Astrologer</th>
                  <th style={{ padding: 6 }}>Rung</th>
                  <th style={{ padding: 6 }}>Picked up</th>
                  <th style={{ padding: 6 }}>Answer rate</th>
                  <th style={{ padding: 6 }}>Talked</th>
                  <th style={{ padding: 6 }}>Avg length</th>
                  <th style={{ padding: 6 }}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {(data.astrologers || []).length === 0 && (
                  <tr><td colSpan={7} className="muted" style={{ padding: 10 }}>No rings yet in this period.</td></tr>
                )}
                {(data.astrologers || []).map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{a.name}</td>
                    <td style={{ padding: 6 }}>{a.rings}</td>
                    <td style={{ padding: 6 }}>{a.answered}</td>
                    <td style={{ padding: 6, color: a.answerRate < 50 ? '#c0392b' : '#16a34a', fontWeight: 700 }}>
                      {pct(a.answerRate)}
                    </td>
                    <td style={{ padding: 6 }}>{a.completed}</td>
                    <td style={{ padding: 6 }}>{fmtSeconds(a.avgTalkSeconds)}</td>
                    <td style={{ padding: 6 }}>₹{a.payout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Per customer, expandable ── */}
          <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}>Every customer who used the offer</h4>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Click a row to see exactly who they rang, in order, and what happened each time.
          </p>
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: 6 }}>Customer</th>
                  <th style={{ padding: 6 }}>Came from</th>
                  <th style={{ padding: 6 }}>Rang</th>
                  <th style={{ padding: 6 }}>Answered</th>
                  <th style={{ padding: 6 }}>Talked</th>
                  <th style={{ padding: 6 }}>Got a call</th>
                  <th style={{ padding: 6 }}>Last attempt</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 && (
                  <tr><td colSpan={7} className="muted" style={{ padding: 10 }}>Nobody has used the offer yet in this period.</td></tr>
                )}
                {customers.map((c) => (
                  <Fragment key={c.customerId}>
                    <tr
                      onClick={() => setOpen(open === c.customerId ? null : c.customerId)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    >
                      <td style={{ padding: 6, fontWeight: 600 }}>
                        {open === c.customerId ? '▾ ' : '▸ '}{c.name}
                        {c.mobile && <span className="muted" style={{ fontWeight: 400 }}> · {c.mobile}</span>}
                      </td>
                      <td style={{ padding: 6 }} className="muted">{c.source || 'unknown'}</td>
                      <td style={{ padding: 6 }}>{c.rings}</td>
                      <td style={{ padding: 6 }}>{c.answered}</td>
                      <td style={{ padding: 6 }}>{fmtSeconds(c.talkSeconds)}</td>
                      <td style={{ padding: 6, color: c.gotACall ? '#16a34a' : '#c0392b', fontWeight: 700 }}>
                        {c.gotACall ? 'Yes' : 'No'}
                      </td>
                      <td style={{ padding: 6 }} className="muted">{fmtWhen(c.lastAt)}</td>
                    </tr>
                    {open === c.customerId && (
                      <tr>
                        <td colSpan={7} style={{ padding: '8px 6px 14px 22px', background: 'var(--surface)' }}>
                          {c.timeline.map((x, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex', gap: 10, alignItems: 'center',
                                padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5,
                              }}
                            >
                              <span className="muted" style={{ minWidth: 22 }}>#{x.attemptNo ?? i + 1}</span>
                              <span style={{ minWidth: 150, fontWeight: 600 }}>{x.astrologer}</span>
                              <span style={{ minWidth: 150, color: OUTCOME_COLOR[x.outcome] || 'inherit', fontWeight: 600 }}>
                                {OUTCOME_LABEL[x.outcome] || x.outcome}
                              </span>
                              <span className="muted" style={{ minWidth: 120 }}>
                                {x.durationSeconds != null ? `talked ${fmtSeconds(x.durationSeconds)}` : 'never connected'}
                              </span>
                              <span className="muted" style={{ minWidth: 120 }}>
                                {x.endedBy ? `${x.endedBy} hung up` : ''}
                              </span>
                              <span className="muted" style={{ minWidth: 110 }}>
                                {x.ringSeconds != null ? `rang ${x.ringSeconds}s` : ''}
                              </span>
                              <span className="muted" style={{ marginLeft: 'auto' }}>{fmtWhen(x.rangAt)}</span>
                              {x.payout > 0 && <span style={{ fontWeight: 700 }}>₹{x.payout}</span>}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Everything clickable ── */}
          <h4 style={{ margin: '18px 0 2px', fontSize: 14, fontWeight: 700 }}>Every tap in the offer</h4>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Tracked in the app (subject to analytics consent — a customer who declined tracking
            is invisible here even though the call itself still happened and is counted above).
            &ldquo;People&rdquo; counts individuals; &ldquo;times&rdquo; counts every occurrence,
            so one person trying three astrologers shows as one person and three rings. Each row's
            own wording says exactly what it is counting — read the row, not just its number.
          </p>
          {clicks.available === false ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Not available — {clicks.reason}.</p>
          ) : (
            <>
              {[
                { key: 'see', title: 'Before any call exists — the offer card' },
                { key: 'claim', title: null },
                { key: 'open', title: null },
                { key: 'ring', title: null },
                { key: 'after_shagun', title: 'After the call ends — the Shagun Arpan thank-you pop-up' },
                { key: 'after_continue', title: 'After the call ends — the "buy more minutes" pop-up' },
                { key: 'after_rating', title: 'After the call ends — the star-rating pop-up' },
              ].map(({ key, title }) => {
                const rows = (clicks.events || []).filter((e) => e.step === key);
                if (!rows.length) return null;
                return (
                  <div key={key} style={{ marginBottom: 14 }}>
                    {title && (
                      <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, margin: '6px 0 4px' }}>
                        {title.toUpperCase()}
                      </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: 6, width: '62%' }}>What this row is counting, exactly</th>
                            <th style={{ padding: 6 }}>People</th>
                            <th style={{ padding: 6 }}>Times</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((e) => (
                            <tr key={e.event} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: 6, color: e.drop ? '#c0392b' : 'inherit', lineHeight: 1.4 }}>
                                {e.label}
                              </td>
                              <td style={{ padding: 6, fontWeight: 600, verticalAlign: 'top' }}>{e.people}</td>
                              <td style={{ padding: 6, verticalAlign: 'top' }} className="muted">{e.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
