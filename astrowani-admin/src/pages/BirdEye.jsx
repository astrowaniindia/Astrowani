import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import client from '../api/client';

/**
 * BIRD EYE — one screen, live, for watching the platform all day.
 *
 * NOT ANALYTICS, and deliberately not named it. Analytics is twenty cards and a date
 * picker, for answering "why did last fortnight look like that"; nobody leaves it open.
 * This answers "is the platform healthy right now, and is today going better or worse
 * than yesterday", and it has no date control at all — today IS the range.
 *
 * THE HARD PART OF THIS SCREEN IS WHAT IS NOT ON IT. A single screen holding every
 * metric we have is a worse screen than four pages, because a glance stops working: the
 * eye has nowhere to land and the operator goes back to reading rows. So the bands are
 * in a fixed priority order — what is happening this second, then how today is going,
 * then what is waiting for a human, then the two shapes worth watching over days — and
 * anything that failed to change an operator's next action was left on Analytics. Resist
 * adding tiles here; add them there and link.
 *
 * EVERYTHING COMPARES AGAINST THE SAME TIME YESTERDAY, never against yesterday's total.
 * A bare "₹4,200 today" is unreadable at 11am and a full-day comparison makes every
 * morning look like a collapse. The pairing is computed server-side so the two halves
 * always come from one snapshot.
 *
 * FOUR INDEPENDENT POLLS AT FOUR RATES, one per endpoint. A live tile is worthless at a
 * 2-minute refresh and a 14-day aggregate re-run every 10s is pure load — and keeping
 * them separate means PostHog being down costs the signup graph and nothing else.
 */

// Poll intervals, in ms. Chosen against what each number can actually change in:
// live state moves second to second, a day's totals do not, and a 14-day aggregate
// barely moves at all within a shift.
const PULSE_MS = 10_000;
const TODAY_MS = 30_000;
const TREND_MS = 120_000;

const TREND_DAYS = 14;

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN');

/**
 * A live poller that pauses itself when the tab is hidden.
 *
 * A screen meant to be left open all day would otherwise keep four timers running in a
 * background tab forever — and on resume the operator reads whatever the last tick
 * happened to leave behind. Re-fetching immediately on focus is what makes "live"
 * actually true at the moment somebody looks.
 *
 * `error` deliberately does not clear the previous data. A single failed poll must not
 * blank a working tile; the band keeps the last good numbers and says it is stale.
 */
function useLivePoll(path, intervalMs, { paused = false, params } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [at, setAt] = useState(null);
  const [loading, setLoading] = useState(true);
  // Kept in a ref so changing the interval or the paused flag never re-creates the
  // fetch function and re-triggers a fetch on every render.
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
    let timer = null;
    const tick = () => {
      // Nothing is fetched for a hidden tab; the focus handler below covers the gap.
      if (document.visibilityState === 'visible') load();
    };
    tick();
    timer = setInterval(tick, intervalMs);
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
 * "4s ago" — the only honest label for a number that refreshes on its own.
 *
 * ITS OWN COMPONENT ON PURPOSE. This ticks every second, and as a hook inside the page
 * it re-rendered the entire screen once a second — including both recharts charts, which
 * is heavy and makes the lines twitch on a screen that is meant to be left open for
 * hours. Isolating it means the second hand costs one text node.
 */
function Ago({ at }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!at) return '—';
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  return secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
}

/**
 * Today against the same elapsed slice of yesterday.
 *
 * Yesterday at zero is NOT a percentage — "+100%" off a base of nothing reads as a
 * doubling of something. It is reported as "first today" instead, and a genuine
 * no-change-from-nothing stays blank rather than claiming 0%.
 */
function Delta({ now, before, format = num }) {
  const a = Number(now || 0);
  const b = Number(before || 0);
  if (!a && !b) return <span style={{ color: 'var(--text-light)' }}>nothing yet</span>;
  if (!b) return <span style={{ color: 'var(--emerald)', fontWeight: 700 }}>first today</span>;
  const pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return <span style={{ color: 'var(--text-muted)' }}>level with yesterday</span>;
  const up = pct > 0;
  return (
    <span style={{ color: up ? 'var(--emerald)' : 'var(--crimson)', fontWeight: 700 }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
      {/* The baseline is formatted the same way as the tile above it — a money tile
          reading "vs 754 by now yesterday" invites it to be read as a count. */}
      <span style={{ color: 'var(--text-light)', fontWeight: 500 }}> vs {format(b)} by now yesterday</span>
    </span>
  );
}

function Band({ title, hint, right, children, style }) {
  return (
    <section style={{ marginBottom: 18, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            {title}
          </h3>
          {hint && <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 2 }}>{hint}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const grid = (min) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 12,
});

function Tile({ label, value, sub, foot, accent, big }) {
  return (
    <div
      className="card"
      style={{
        margin: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2,
        borderLeft: `3px solid ${accent || 'var(--border-dark)'}`,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: big ? 30 : 25, fontWeight: 800, lineHeight: 1.15, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>}
      {foot && <div style={{ fontSize: 11.5, marginTop: 2 }}>{foot}</div>}
    </div>
  );
}

function Stale({ error, children }) {
  if (!error) return children;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ opacity: 0.45 }}>{children}</div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{
          background: 'var(--crimson-bg)', color: 'var(--crimson)', border: '1px solid var(--crimson-border)',
          borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
        }}>
          {error} — showing the last good numbers
        </span>
      </div>
    </div>
  );
}

/** The six sign-up-flow lines, off by default where they would only crowd the chart. */
const SIGNUP_SERIES = [
  { key: 'shown', label: 'Gift box shown', colour: 'var(--text-light)', on: true },
  { key: 'opened', label: 'Gift opened', colour: 'var(--gold-dark)', on: false },
  { key: 'card', label: 'Sign-up card shown', colour: 'var(--sky)', on: true },
  { key: 'signedIn', label: 'Signed in', colour: 'var(--emerald)', on: true },
  { key: 'rang', label: 'Rang an astrologer', colour: 'var(--indigo)', on: true },
  { key: 'answered', label: 'Call answered', colour: 'var(--maroon)', on: true },
];

const shortDay = (day) => (day || '').slice(5).replace('-', '/');

export default function BirdEye() {
  // One pause for the whole screen. An operator reading a number should be able to stop
  // it moving under them, and a per-band pause would be four switches for one intent.
  const [paused, setPaused] = useState(false);
  const [series, setSeries] = useState(() => new Set(SIGNUP_SERIES.filter((s) => s.on).map((s) => s.key)));

  const trendParams = useMemo(() => ({ days: TREND_DAYS }), []);

  const pulse = useLivePoll('/api/admin/bird-eye/pulse', PULSE_MS, { paused });
  const today = useLivePoll('/api/admin/bird-eye/today', TODAY_MS, { paused });
  const trends = useLivePoll('/api/admin/bird-eye/trends', TREND_MS, { paused, params: trendParams });
  const signup = useLivePoll('/api/admin/bird-eye/signup-trend', TREND_MS, { paused, params: trendParams });

  const a = pulse.data?.astrologers || {};
  const s = pulse.data?.sessions || {};
  const ring = pulse.data?.ringing || {};
  const live = pulse.data?.live || {};

  const t = today.data?.today || {};
  const y = today.data?.yesterday || {};
  const health = today.data?.health || {};
  const queues = today.data?.queues || [];
  const waiting = queues.reduce((sum, q) => sum + (q.count || 0), 0);

  const connectRate = health.calls ? Math.round((health.connected / health.calls) * 100) : null;

  const signupPoints = signup.data?.points || [];
  const trendPoints = trends.data?.points || [];

  const toggle = (key) => setSeries((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const refreshAll = () => {
    pulse.reload(); today.reload(); trends.reload(); signup.reload();
  };

  return (
    <div style={{ maxWidth: 1420 }}>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--maroon)', background: 'var(--maroon-50)', padding: '3px 10px', borderRadius: 20, marginBottom: 8 }}>
            <span>🦅</span> BIRD EYE
          </div>
          <h1 style={{ marginBottom: 2 }}>The whole platform, right now</h1>
          <p style={{ margin: 0 }}>
            Live and self-refreshing. Today is the range — every figure is paired with the
            same time of day yesterday, so it reads at 9am as well as at 9pm.
          </p>
        </div>
        <div className="btn-group" style={{ alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700,
            color: paused ? 'var(--amber)' : 'var(--emerald)',
            background: paused ? 'var(--amber-bg)' : 'var(--emerald-bg)',
            border: `1px solid ${paused ? 'var(--amber-border)' : 'var(--emerald-border)'}`,
            borderRadius: 20, padding: '5px 12px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: paused ? 'var(--amber)' : 'var(--emerald)',
              // `pulse` is the keyframe styles.css already defines for .pulse-dot.
              animation: paused ? 'none' : 'pulse 2s infinite',
            }} />
            {paused ? 'Paused' : <>Live · <Ago at={pulse.at} /></>}
          </span>
          <button type="button" className="btn secondary sm" onClick={() => setPaused((p) => !p)}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button type="button" className="btn sm" onClick={refreshAll}>↻ Refresh</button>
        </div>
      </div>

      {/* ── 1. RIGHT NOW ─────────────────────────────────────────────────────── */}
      <Band
        title="Right now"
        hint={`Live state, rechecked every ${PULSE_MS / 1000} seconds.`}
      >
        <Stale error={pulse.data && pulse.error ? 'Live feed interrupted' : ''}>
          <div style={grid(220)}>
            <Tile
              big
              label="Astrologers taking work"
              value={pulse.loading ? '…' : num(a.takingWork)}
              sub={`${num(a.free)} free · ${num(a.busy)} busy`}
              accent={a.takingWork ? 'var(--emerald)' : 'var(--crimson)'}
              foot={a.onlineButUnreachable
                ? (
                  <Link to="/astrologers" style={{ color: 'var(--amber)', fontWeight: 700, textDecoration: 'none' }}>
                    {num(a.onlineButUnreachable)} more are online but no customer can reach them →
                  </Link>
                )
                : <span style={{ color: 'var(--text-light)' }}>Everyone online is reachable</span>}
            />
            <Tile
              big
              label="Consultations in progress"
              value={pulse.loading ? '…' : num(s.active)}
              sub={`${num(s.byType?.chat)} chat · ${num(s.byType?.audio)} call · ${num(s.byType?.video)} video`}
              accent="var(--indigo)"
              foot={s.active
                ? <span style={{ color: 'var(--text-light)' }}>{num(s.paid)} paid · {num(s.free)} free · longest running {num(s.longestMinutes)} min</span>
                : <span style={{ color: 'var(--text-light)' }}>Nobody is talking to anybody</span>}
            />
            <Tile
              label="Ringing now"
              value={pulse.loading ? '…' : num(ring.total)}
              sub={`${num(ring.calls)} call · ${num(ring.chats)} chat`}
              accent={ring.total ? 'var(--amber)' : 'var(--border-dark)'}
              foot={<span style={{ color: 'var(--text-light)' }}>Requests waiting for someone to answer</span>}
            />
            <Tile
              label="Live streams"
              value={pulse.loading ? '…' : num(live.streams)}
              sub={`${num(live.viewers)} watching`}
              accent={live.streams ? 'var(--maroon)' : 'var(--border-dark)'}
              foot={<Link to="/live" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Open Live Video Streams →</Link>}
            />
          </div>
        </Stale>
        {pulse.error && !pulse.data && <div className="error-text" style={{ marginTop: 8 }}>{pulse.error}</div>}
      </Band>

      {/* ── 2. TODAY SO FAR ──────────────────────────────────────────────────── */}
      <Band
        title="Today so far"
        hint="Compared with the same hours of yesterday, not with yesterday's full day."
      >
        <Stale error={today.data && today.error ? 'Refresh failed' : ''}>
          <div style={grid(240)}>
            <Tile
              big
              label="Money in"
              value={today.loading ? '…' : money(t.moneyIn)}
              sub={`${num(t.rechargesPaid)} of ${num(t.rechargeAttempts)} recharge attempts went through`}
              accent="var(--emerald)"
              foot={<Delta now={t.moneyIn} before={y.moneyIn} format={money} />}
            />
            <Tile
              big
              label="Platform share earned"
              value={today.loading ? '…' : money(t.platformShare)}
              sub="Our half of consultations, plus reports, gifts and orders"
              accent="var(--gold-dark)"
              foot={<Delta now={t.platformShare} before={y.platformShare} format={money} />}
            />
            <Tile
              label="New signups"
              value={today.loading ? '…' : num(t.signups)}
              accent="var(--sky)"
              foot={<Delta now={t.signups} before={y.signups} />}
            />
            <Tile
              label="Consultations"
              value={today.loading ? '…' : num(t.sessions)}
              sub={`${num(t.paidSessions)} paid · ${num(t.minutes)} minutes talked`}
              accent="var(--indigo)"
              foot={<Delta now={t.sessions} before={y.sessions} />}
            />
            <Tile
              label="Customers who spent"
              value={today.loading ? '…' : num(t.payingCustomers)}
              sub="Charged for at least one minute"
              accent="var(--maroon)"
              foot={<Delta now={t.payingCustomers} before={y.payingCustomers} />}
            />
            <Tile
              label="Free intro calls answered"
              value={today.loading ? '…' : num(t.freeCallsAnswered)}
              sub="The offer actually delivered, not just booked"
              accent="var(--amber)"
              foot={<Delta now={t.freeCallsAnswered} before={y.freeCallsAnswered} />}
            />
          </div>
        </Stale>
        {today.error && !today.data && <div className="error-text" style={{ marginTop: 8 }}>{today.error}</div>}

        {/* Call connection health. Kept in this band rather than given its own, because
            it is a property of today — but it is a RATIO and needs a sentence, which is
            why it is not squeezed into a tile. This is the number the 2026-10-21 fault
            was invisible without: calls were being killed before they connected while
            every other figure on the platform looked entirely normal. */}
        <div
          className="card"
          style={{ margin: '12px 0 0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
        >
          <div style={{ minWidth: 150 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Calls that connected
            </div>
            <div style={{
              fontSize: 25, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: connectRate === null ? 'var(--text-light)'
                : connectRate >= 90 ? 'var(--emerald)'
                  : connectRate >= 75 ? 'var(--amber)' : 'var(--crimson)',
            }}>
              {connectRate === null ? '—' : `${connectRate}%`}
            </div>
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <div style={{ height: 10, borderRadius: 6, background: 'var(--surface-muted)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${connectRate ?? 0}%`, background: 'var(--emerald)' }} />
              <div style={{ flex: 1, background: 'var(--crimson)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              {health.calls
                ? <>
                    {num(health.connected)} of {num(health.calls)} audio and video calls today carried
                    audio. {num(health.neverConnected)} never did{health.diedUnderAMinute ? `, and ${num(health.diedUnderAMinute)} ended inside a minute` : ''}.
                  </>
                : 'No audio or video calls have been placed today yet. Chat is excluded — it opens no microphone and cannot fail this way.'}
            </div>
          </div>
        </div>
      </Band>

      {/* ── 3. WAITING FOR A HUMAN ───────────────────────────────────────────── */}
      <Band
        title="Waiting for a human"
        hint="Counts only. Every one is a link to the page that clears it."
        right={
          <span style={{ fontSize: 12, fontWeight: 700, color: waiting ? 'var(--amber)' : 'var(--emerald)' }}>
            {today.loading ? '' : waiting ? `${num(waiting)} items in the queues` : 'All clear'}
          </span>
        }
      >
        <div style={grid(190)}>
          {queues.map((q) => (
            <Link
              key={q.key}
              to={q.to}
              className="card"
              style={{
                margin: 0, padding: '12px 14px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                borderLeft: `3px solid ${q.count ? 'var(--amber)' : 'var(--border-dark)'}`,
              }}
            >
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>{q.label}</span>
              <span style={{
                fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: q.ok === false ? 'var(--text-light)' : q.count ? 'var(--amber)' : 'var(--text-light)',
              }}>
                {/* A queue we could not read must never render as a reassuring zero. */}
                {q.ok === false ? '?' : num(q.count)}
              </span>
            </Link>
          ))}
          {!queues.length && (
            <div className="card" style={{ margin: 0, padding: '12px 14px', color: 'var(--text-light)', fontSize: 12.5 }}>
              {today.loading ? 'Loading the queues…' : 'No queues reported.'}
            </div>
          )}
        </div>
      </Band>

      {/* ── 4. SIGN-UP FLOW, DAY BY DAY ──────────────────────────────────────── */}
      <Band
        title="Sign-up flow, day by day"
        hint={`Distinct people per day over ${TREND_DAYS} days. The gift box through to a call being answered.`}
        right={
          <Link to="/new-signup-flow" style={{ fontSize: 12, fontWeight: 700, color: 'var(--maroon)', textDecoration: 'none' }}>
            Step-by-step drop-off →
          </Link>
        }
      >
        <div className="card" style={{ margin: 0, padding: '16px 14px 10px' }}>
          {/* Chips rather than a six-line legend that nobody can read. Two steps are off
              by default because they sit almost on top of their neighbour and only
              crowd the chart until somebody is specifically looking for them. */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
            {SIGNUP_SERIES.map((sr) => {
              const on = series.has(sr.key);
              return (
                <button
                  key={sr.key}
                  type="button"
                  onClick={() => toggle(sr.key)}
                  style={{
                    cursor: 'pointer', borderRadius: 20, padding: '4px 11px', fontSize: 12, fontWeight: 700,
                    border: `1px solid ${on ? sr.colour : 'var(--border)'}`,
                    background: on ? 'var(--surface-muted)' : 'transparent',
                    color: on ? 'var(--text-primary)' : 'var(--text-light)',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? sr.colour : 'var(--border-dark)' }} />
                  {sr.label}
                </button>
              );
            })}
          </div>

          {signup.error ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '20px 0' }}>
              {signup.error} This graph is the only thing here that comes from product
              analytics rather than the database — everything else on the screen is
              unaffected.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={signupPoints} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11 }} stroke="var(--text-light)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--text-light)" />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                    labelFormatter={(d) => d}
                  />
                  <Legend wrapperStyle={{ fontSize: 11.5 }} />
                  {SIGNUP_SERIES.filter((sr) => series.has(sr.key)).map((sr) => (
                    <Line
                      key={sr.key}
                      type="monotone"
                      dataKey={sr.key}
                      name={sr.label}
                      stroke={sr.colour}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {/* Days before the flow shipped have none of these events at all. Saying
                  so beats drawing a flat zero that reads as a collapse. */}
              {signup.data?.launchedOn && signupPoints.length
                && signupPoints[0].day < signup.data.launchedOn && (
                <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 6 }}>
                  This flow went live on {signup.data.launchedOn}. Anything before that day is
                  zero because the events did not exist yet — not because it stopped working.
                </div>
              )}
            </>
          )}
        </div>
      </Band>

      {/* ── 5. MONEY AND DEMAND ──────────────────────────────────────────────── */}
      <Band
        title="Money and demand"
        hint={`${TREND_DAYS} days from the database — recharges, consultations and signups on one picture.`}
        right={
          <Link to="/analytics" style={{ fontSize: 12, fontWeight: 700, color: 'var(--maroon)', textDecoration: 'none' }}>
            Full analytics →
          </Link>
        }
      >
        <div className="card" style={{ margin: 0, padding: '16px 14px 10px' }}>
          {trends.error && !trends.data ? (
            <div className="error-text">{trends.error}</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendPoints} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11 }} stroke="var(--text-light)" />
                {/* Two axes on purpose: rupees and headcounts differ by orders of
                    magnitude, and on one axis the people lines flatten into the floor. */}
                <YAxis yAxisId="money" tick={{ fontSize: 11 }} stroke="var(--text-light)" tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--text-light)" />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                  formatter={(v, name) => (name === 'Recharges' ? money(v) : num(v))}
                />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
                <Line yAxisId="money" type="monotone" dataKey="revenue" name="Recharges" stroke="var(--emerald)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="count" type="monotone" dataKey="consultations" name="Consultations" stroke="var(--indigo)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="count" type="monotone" dataKey="paidConsultations" name="Paid consultations" stroke="var(--maroon)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line yAxisId="count" type="monotone" dataKey="signups" name="Signups" stroke="var(--sky)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Band>

      {/* ── 6. GOOGLE ADS — not wired yet ────────────────────────────────────── */}
      <Band title="Ad spend" hint="Not connected yet.">
        <div
          className="card"
          style={{ margin: 0, padding: '14px 16px', borderLeft: '3px dashed var(--border-dark)' }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Spend, installs and cost per signup will sit here.</strong>{' '}
            Google Ads has no live figure in this console yet — reaching the Ads API needs a
            developer token and OAuth against the account, which is a separate job from this
            screen. Until then the honest answer is to leave the space empty rather than
            print a number nobody can trust.
            <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12.5 }}>
              What we already have, today, without any of that: every signup carries the
              campaign or poster it arrived from, and{' '}
              <Link to="/acquisition" style={{ color: 'var(--maroon)', fontWeight: 700, textDecoration: 'none' }}>Acquisition</Link>{' '}
              reports the activation and revenue behind each one. Put spend next to that and
              cost per paying customer falls out of it.
            </div>
          </div>
        </div>
      </Band>
    </div>
  );
}
