import { Fragment, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

// Where customers come from, and what each channel is actually worth.
//
// SEPARATE FROM THE QR CODES PAGE ON PURPOSE. That page is for printed posters — one
// code per physical location, with scan counts and a QR generator — and it stays exactly
// as it is. This page covers every channel: both Google Ads campaigns, organic Play
// browsing, the posters, and the unknown bucket.
//
// THE POINT OF THE COLUMN ORDER. Google Ads leads with installs and cost per install,
// and on that measure the original broad campaign wins every time — it buys installs at
// roughly ₹3.50 because Maximize-conversions finds the cheapest inventory available.
// Over its first 15 days that was 1,727 installs and 22 recharges: a 1.27% recharge
// rate. So the metric Google shows most prominently is the one most likely to mislead.
// Activation, paying % and revenue per signup sit to the right of signups here because
// they are what actually separates a good channel from a cheap one.
//
// "Unknown" is NOT organic. It is every iOS customer, every sideload, and everyone who
// signed up before the build carrying the native install-referrer module. It gets its
// own row and is never folded in with people who found the app themselves.

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const inr2 = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
const pct = (v) => `${((Number(v) || 0) * 100).toFixed(2)}%`;
// A deleted account's mobile is tombstoned by the purge as `deleted:<uuid>:<ts>` (see
// accountRoutes.js). Rendering that raw sprawls across the column and tells nobody
// anything, so it shows as a plain marker -- the row still counts in every total.
const isDeleted = (m) => typeof m === 'string' && m.startsWith('deleted:');

const day = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const RANGES = [7, 14, 30, 60, 90, 180];

// Enough signups for a paying-rate difference to mean anything. At a ~1-5% paying rate,
// a hundred signups is one to five payers and the difference between two channels is
// mostly noise. The page says so rather than letting a 3-signup row look like a winner.
const MIN_MEANINGFUL_SIGNUPS = 300;

const CHANNEL_STYLE = {
  google: { background: 'var(--indigo-bg)', color: 'var(--indigo)', border: '1px solid var(--indigo-border)' },
  qr: { background: 'var(--emerald-bg)', color: 'var(--emerald)', border: '1px solid var(--emerald-border)' },
  other: { background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)' },
  unknown: { background: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
};

export default function Acquisition() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);          // source string being drilled into
  const [detail, setDetail] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    client.get(`/api/admin/acquisition/sources?days=${days}`)
      .then(({ data }) => {
        if (cancelled) return;
        setRows(data?.data || []);
        setTruncated(!!data?.truncated);
      })
      .catch((e) => !cancelled && setError(e?.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [days]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    signups: a.signups + r.signups,
    consultedCustomers: a.consultedCustomers + r.consultedCustomers,
    payingCustomers: a.payingCustomers + r.payingCustomers,
    totalRecharged: a.totalRecharged + r.totalRecharged,
  }), { signups: 0, consultedCustomers: 0, payingCustomers: 0, totalRecharged: 0 }), [rows]);

  function drill(source) {
    if (open === source) { setOpen(null); setDetail([]); return; }
    setOpen(source);
    setDetail([]);
    setDetailLoading(true);
    client.get(`/api/admin/acquisition/sources/${encodeURIComponent(source)}?days=${days}`)
      .then(({ data }) => setDetail(data?.data || []))
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  return (
    <div className="page">
      <div className="page-header acq-head">
        <div>
          <h1>Acquisition</h1>
          <p className="muted">
            Every channel customers arrive from, and what each one is worth after they arrive.
          </p>
        </div>
        <div className="range-tabs">
          {RANGES.map((d) => (
            <button
              key={d}
              className={d === days ? 'active' : ''}
              onClick={() => { setDays(d); setOpen(null); setDetail([]); }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="note">
        <strong>Judge a channel on revenue per signup, not on volume.</strong> Google Ads
        reports cost per install, and the cheapest installs convert worst — the broad
        campaign buys them at about ₹3.50 and ~1.3% of those customers ever recharge.
        The columns that matter here are <em>Activated</em> and <em>₹ / signup</em>.
      </div>

      {truncated && (
        <div className="note warn">
          Some rows were capped by a read limit, so these numbers are a floor, not a total.
        </div>
      )}

      {error && <div className="note warn">{error}</div>}
      {loading ? <p className="muted">Loading…</p> : (
        <>
          <div className="summary-row">
            <div className="acq-stat"><span>Signups</span><strong>{totals.signups.toLocaleString('en-IN')}</strong></div>
            <div className="acq-stat"><span>Consulted</span><strong>{totals.consultedCustomers.toLocaleString('en-IN')}</strong></div>
            <div className="acq-stat"><span>Paying</span><strong>{totals.payingCustomers.toLocaleString('en-IN')}</strong></div>
            <div className="acq-stat"><span>Revenue</span><strong>{inr(totals.totalRecharged)}</strong></div>
            <div className="acq-stat">
              <span>₹ / signup</span>
              <strong>{inr2(totals.signups ? totals.totalRecharged / totals.signups : 0)}</strong>
            </div>
          </div>

          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Signups</th>
                <th className="num">Consulted</th>
                <th className="num">Activated</th>
                <th className="num">Paying</th>
                <th className="num">Paying %</th>
                <th className="num">Revenue</th>
                <th className="num">₹ / signup</th>
                <th className="num">First seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="muted">No signups in this window.</td></tr>
              )}
              {rows.map((r) => {
                const style = CHANNEL_STYLE[r.channel] || CHANNEL_STYLE.other;
                const thin = r.signups > 0 && r.signups < MIN_MEANINGFUL_SIGNUPS;
                return (
                  <Fragment key={r.source}>
                    <tr>
                      <td>
                        <div className="src-name">{r.label}</div>
                        <div className="src-meta">
                          <span className="chip" style={style}>
                            {r.channel}
                          </span>
                          {r.campaignId && <code className="src-code">campaign {r.campaignId}</code>}
                          {!r.campaignId && r.source !== r.label && <code className="src-code">{r.source}</code>}
                        </div>
                      </td>
                      <td className="num">{r.signups.toLocaleString('en-IN')}</td>
                      <td className="num">{r.consultedCustomers.toLocaleString('en-IN')}</td>
                      <td className="num">{pct(r.activationRate)}</td>
                      <td className="num">{r.payingCustomers.toLocaleString('en-IN')}</td>
                      <td className="num">{pct(r.payingRate)}</td>
                      <td className="num">{inr(r.totalRecharged)}</td>
                      <td className="num"><strong>{inr2(r.revenuePerSignup)}</strong></td>
                      <td className="num">{day(r.firstSignupAt)}</td>
                      <td className="num">
                        <button className="link-btn" onClick={() => drill(r.source)}>
                          {open === r.source ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {thin && (
                      <tr className="sub-note">
                        <td colSpan={10}>
                          Only {r.signups} signups — too few to read the paying rate from. At a
                          1–5% rate you need roughly {MIN_MEANINGFUL_SIGNUPS}+ before comparing
                          this against another channel.
                        </td>
                      </tr>
                    )}
                    {open === r.source && (
                      <tr>
                        <td colSpan={10} className="detail-cell">
                          {detailLoading ? <p className="muted">Loading customers…</p> : (
                            <table className="inner">
                              <thead>
                                <tr>
                                  <th>Customer</th><th>Mobile</th>
                                  <th className="num">Joined</th>
                                  <th className="num">Sessions</th>
                                  <th className="num">Minutes</th>
                                  <th className="num">Recharged</th>
                                  <th className="num">Wallet</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.length === 0 && (
                                  <tr><td colSpan={7} className="muted">No customers.</td></tr>
                                )}
                                {detail.slice(0, 200).map((c) => (
                                  <tr key={c.id}>
                                    <td>{c.name || <span className="muted">—</span>}</td>
                                    <td>
                                      {isDeleted(c.mobile)
                                        ? <span className="muted">deleted account</span>
                                        : (c.mobile || <span className="muted">—</span>)}
                                    </td>
                                    <td className="num">{day(c.createdAt)}</td>
                                    <td className="num">{c.sessions}</td>
                                    <td className="num">{c.minutes}</td>
                                    <td className="num">{c.totalRecharged ? inr(c.totalRecharged) : '—'}</td>
                                    <td className="num">{inr(c.walletBalance)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {detail.length > 200 && (
                            <p className="muted">Showing the top 200 by amount recharged, of {detail.length}.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>

          <p className="muted footnote">
            <strong>Activated</strong> = ever started a consultation (free or paid).
            <strong> Unknown</strong> is iOS, sideloads and pre-referrer builds — not organic.
            Sessions longer than 12 hours are counted but contribute no minutes.
          </p>
        </>
      )}

      <style>{`
        .acq-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
        .range-tabs { display:flex; gap:6px; flex-wrap:wrap; }
        .range-tabs button {
          padding:7px 14px; border:1px solid var(--border); background:var(--surface);
          color:var(--text-secondary); cursor:pointer; border-radius:8px; font-size:13px; font-weight:600;
        }
        .range-tabs button:hover { background:var(--surface-hover); }
        .range-tabs button.active { background:var(--maroon); color:#fff; border-color:var(--maroon); }
        .note {
          background:var(--sky-bg); border:1px solid var(--sky-border); border-left:3px solid var(--sky);
          color:var(--text-primary); padding:12px 16px; border-radius:10px; margin:16px 0;
          font-size:13px; line-height:1.6;
        }
        .note.warn { background:var(--crimson-bg); border-color:var(--crimson-border); border-left-color:var(--crimson); }
        .summary-row { display:flex; gap:12px; flex-wrap:wrap; margin:18px 0; }
        .summary-row .acq-stat {
          background:var(--surface); border:1px solid var(--border); border-radius:12px;
          padding:12px 18px; min-width:118px; box-shadow:var(--shadow-xs);
        }
        .summary-row .acq-stat span { display:block; font-size:11px; font-weight:700; letter-spacing:.6px;
          text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; }
        .summary-row .acq-stat strong { font-size:20px; color:var(--text-primary); }
        th.num, td.num { text-align:right; white-space:nowrap; }
        .src-name { font-weight:650; color:var(--text-primary); }
        .src-meta { display:flex; gap:6px; align-items:center; margin-top:4px; flex-wrap:wrap; }
        .chip { font-size:10.5px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;
          padding:2px 8px; border-radius:20px; }
        .src-code { font-size:11px; color:var(--text-muted); }
        .link-btn { background:none; border:none; color:var(--maroon); cursor:pointer;
          font-size:13px; font-weight:600; padding:0; }
        .link-btn:hover { text-decoration:underline; }
        .sub-note td {
          background:var(--amber-bg); color:var(--amber); font-size:12px;
          padding-top:4px; padding-bottom:10px;
        }
        .detail-cell { background:var(--surface-muted); padding:14px; }
        table.inner { min-width:0; }
        table.inner th { padding:9px 12px; }
        table.inner td { padding:9px 12px; font-size:12.5px; }
        .footnote { font-size:12px; margin-top:14px; line-height:1.7; color:var(--text-muted); }
      `}</style>
    </div>
  );
}
