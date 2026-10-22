import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import client from '../api/client';

/**
 * BIRD EYE — the whole platform on ONE SCREEN. No scrolling. Ever.
 *
 * THAT CONSTRAINT IS THE FEATURE, not a styling choice. A page you scroll is a report,
 * and a report is something you read occasionally; this is meant to be left open on a
 * second monitor and taken in at a glance, the way a dashboard in a control room is. The
 * moment it scrolls, the half below the fold stops being seen and it has quietly become
 * another analytics page.
 *
 * SO EVERYTHING HERE IS FIGHTING FOR FIXED SPACE, and that is what makes the screen
 * honest: a new metric cannot be "added", it can only REPLACE one. The grid below is
 * four fixed bands — header, twelve tiles, two charts, one queue strip — and it fills
 * exactly the viewport height. If something new deserves a place, something else has to
 * lose one. Do not add a band, and do not let a band grow its own scrollbar.
 *
 * HOW THE HEIGHT IS PINNED. The admin shell gives `.main-content` 32px/56px of padding
 * inside a `.content-wrap` that is `height: 100vh; overflow-y: auto`. A page cannot fill
 * that exactly without neutralising the padding, so this component tags <body> while it
 * is mounted and removes the tag on unmount — scoped, reversible, and it leaves
 * styles.css alone so no other page is affected.
 *
 * Numbers, days, pacing and polling rates: see src/birdEyeRoutes.js, which explains why
 * today is compared against the same hours of yesterday and why there are four endpoints
 * rather than one.
 */

// Poll intervals, in ms, matched to what each number can actually change in.
const PULSE_MS = 10_000;
const TODAY_MS = 30_000;
const TREND_MS = 120_000;

// Both charts are TODAY, hour by hour. There is no range control and no range
// constant, because this screen has exactly one range: today. A fortnight of daily
// points answers "how has the month gone", which is Analytics' question and reads as a
// contradiction sitting under twelve tiles that all say "today".

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN');
const compactMoney = (n) => {
  const v = Number(n || 0);
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
};

/**
 * A live poller that pauses itself when the tab is hidden and re-fetches on focus.
 *
 * `error` deliberately does not clear the previous data: one failed poll must not blank
 * a working tile on a screen somebody is watching. The band keeps its last good numbers
 * and is dimmed instead.
 */
function useLivePoll(path, intervalMs, { paused = false, params } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [at, setAt] = useState(null);
  const [loading, setLoading] = useState(true);
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
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    tick();
    const timer = setInterval(tick, intervalMs);
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
 * The seconds counter, as its own component.
 *
 * It ticks every second, and as a hook in the page it re-rendered everything once a
 * second — including both charts, which makes the lines twitch on a screen meant to be
 * watched for hours. Isolated, the second hand costs one text node.
 */
function Ago({ at }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!at) return '—';
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`;
}

/**
 * Today against the same elapsed slice of yesterday, as a chip.
 *
 * Compressed to a chip on purpose — the long sentence this used to print ("vs 754 by now
 * yesterday") is good writing and bad dashboard: twelve of them is a wall of prose. The
 * baseline moves into the tooltip, where it is there when wanted and silent otherwise.
 *
 * Yesterday at zero is NOT a percentage: "+100%" off a base of nothing reads as a
 * doubling of something real.
 */
function Delta({ now, before, format = num }) {
  const a = Number(now || 0);
  const b = Number(before || 0);
  if (!a && !b) return null;
  if (!b) {
    return <span style={chipStyle('var(--emerald)')} title="Nothing by this time yesterday">new</span>;
  }
  const pct = Math.round(((a - b) / b) * 100);
  const title = `${format(b)} by this time yesterday`;
  if (pct === 0) return <span style={chipStyle('var(--text-light)')} title={title}>level</span>;
  const up = pct > 0;
  return (
    <span style={chipStyle(up ? 'var(--emerald)' : 'var(--crimson)')} title={title}>
      {up ? '▲' : '▼'}{Math.abs(pct)}%
    </span>
  );
}

const chipStyle = (colour) => ({
  color: colour,
  fontSize: 10.5,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
});

/** One fixed-height tile. Three lines, never four — four is how a band starts growing. */
function Tile({ label, value, sub, subColour, accent, delta }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${accent || 'var(--border-dark)'}`,
      borderRadius: 10,
      padding: '7px 10px',
      display: 'flex',
      flexDirection: 'column',
      // flex-start, NOT center. Centring inside a fixed height clips BOTH ends the
      // moment the content is a pixel too tall, which ate the top of every label.
      justifyContent: 'flex-start',
      gap: 1,
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
        color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{
          fontSize: 21, fontWeight: 800, lineHeight: 1.15, color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}>
          {value}
        </span>
        {delta}
      </div>
      <div style={{
        fontSize: 10, color: subColour || 'var(--text-light)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 12,
      }}>
        {sub || ''}
      </div>
    </div>
  );
}

/** The six sign-up-flow lines. Two start off: they sit on top of a neighbour. */
const SIGNUP_SERIES = [
  { key: 'shown', label: 'Gift shown', colour: '#9aa5b1', on: true },
  { key: 'opened', label: 'Opened', colour: 'var(--gold-dark)', on: false },
  { key: 'card', label: 'Card shown', colour: 'var(--sky)', on: true },
  { key: 'signedIn', label: 'Signed in', colour: 'var(--emerald)', on: true },
  { key: 'rang', label: 'Rang', colour: 'var(--indigo)', on: true },
  { key: 'answered', label: 'Answered', colour: 'var(--maroon)', on: true },
];

/**
 * Short names for the queue strip.
 *
 * The backend's labels ("Astrologers to approve") are written for a page with room; in a
 * six-across strip every one of them truncates to "Astrologer…", which is worse than a
 * shorter name chosen on purpose. The full label stays as the link's tooltip, and an
 * unmapped key falls through to the server's wording rather than disappearing.
 */
const QUEUE_SHORT = {
  astrologers: 'Approvals',
  withdrawals: 'Payouts',
  flags: 'Contact flags',
  moderation: 'Reports',
  support: 'Support',
  orders: 'Orders',
};

const PANEL = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 10px 4px',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
};

const PANEL_TITLE = {
  fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
  color: 'var(--text-muted)', margin: 0,
};

export default function BirdEye() {
  const [paused, setPaused] = useState(false);
  const [series, setSeries] = useState(() => new Set(SIGNUP_SERIES.filter((s) => s.on).map((s) => s.key)));

  // Neutralise the shell's padding so the grid below can fill the viewport exactly, and
  // put it back on unmount. Done from here rather than in styles.css so no other page is
  // touched and nothing is left behind if this screen is removed.
  useEffect(() => {
    document.body.classList.add('bird-eye-screen');
    return () => document.body.classList.remove('bird-eye-screen');
  }, []);

  const pulse = useLivePoll('/api/admin/bird-eye/pulse', PULSE_MS, { paused });
  const today = useLivePoll('/api/admin/bird-eye/today', TODAY_MS, { paused });
  const trends = useLivePoll('/api/admin/bird-eye/trends', TREND_MS, { paused });
  const signup = useLivePoll('/api/admin/bird-eye/signup-trend', TREND_MS, { paused });

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

  const dash = pulse.loading ? '…' : null;
  const tDash = today.loading ? '…' : null;

  // A line needs two points. In the first hour after midnight IST each chart holds
  // exactly one, and with dot={false} recharts draws literally nothing — so every night
  // the panels would sit blank for an hour and read as "the feed is broken" rather than
  // "the day just started". Dots are turned on while the day is too young for a line.
  const signupPoints = signup.data?.points || [];
  const trendPoints = trends.data?.points || [];
  const dotFor = (points) => (points.length <= 2 ? { r: 2.6 } : false);

  const toggle = (key) => setSeries((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const refreshAll = () => { pulse.reload(); today.reload(); trends.reload(); signup.reload(); };

  const chartTooltip = {
    contentStyle: {
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, fontSize: 11, padding: '6px 8px',
    },
    labelStyle: { fontSize: 11, fontWeight: 700 },
  };

  return (
    <>
      <style>{`
        /* Only while Bird Eye is on screen. */
        body.bird-eye-screen .main-content { padding: 0; height: calc(100vh - 64px); overflow: hidden; }
        body.bird-eye-screen .content-wrap { overflow: hidden; }
        /* The escape hatch, set deliberately low. Below this the charts would be a few
           pixels tall and the screen would be unreadable rather than merely tight — at
           which point scrolling is the lesser evil. On any real monitor it never fires. */
        @media (max-height: 620px) {
          body.bird-eye-screen .main-content { height: auto; overflow: visible; }
          body.bird-eye-screen .content-wrap { overflow-y: auto; }
          .bird-eye-grid { height: auto !important; min-height: 620px; }
        }
      `}</style>

      <div
        className="bird-eye-grid"
        style={{
          height: '100%',
          display: 'grid',
          // header · tiles · charts (takes what is left) · queues
          gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
          gap: 8,
          padding: '10px 14px 12px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 15 }}>🦅</span>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
            Bird Eye
          </h1>
          <span style={{ fontSize: 11, color: 'var(--text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Today so far, against the same hours yesterday
          </span>
          <div style={{ flex: 1 }} />
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
            color: paused ? 'var(--amber)' : 'var(--emerald)',
            background: paused ? 'var(--amber-bg)' : 'var(--emerald-bg)',
            border: `1px solid ${paused ? 'var(--amber-border)' : 'var(--emerald-border)'}`,
            borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: paused ? 'var(--amber)' : 'var(--emerald)',
              animation: paused ? 'none' : 'pulse 2s infinite',
            }} />
            {paused ? 'Paused' : <>Live · <Ago at={pulse.at} /></>}
          </span>
          <button type="button" className="btn secondary sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setPaused((p) => !p)}>
            {paused ? '▶' : '⏸'}
          </button>
          <button type="button" className="btn sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={refreshAll}>↻</button>
        </div>

        {/* ── Twelve tiles: four live, eight for today ──────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gridAutoRows: '70px',
          gap: 8,
          opacity: (pulse.error && pulse.data) || (today.error && today.data) ? 0.55 : 1,
          transition: 'opacity .2s',
        }}>
          <Tile
            label="Taking work"
            value={dash || num(a.takingWork)}
            accent={a.takingWork ? 'var(--emerald)' : 'var(--crimson)'}
            sub={a.onlineButUnreachable
              ? `${num(a.free)} free · ${num(a.busy)} busy · ${num(a.onlineButUnreachable)} unreachable`
              : `${num(a.free)} free · ${num(a.busy)} busy`}
            subColour={a.onlineButUnreachable ? 'var(--amber)' : undefined}
          />
          <Tile
            label="In progress"
            value={dash || num(s.active)}
            accent="var(--indigo)"
            sub={`${num(s.byType?.chat)} chat · ${num(s.byType?.audio)} call · ${num(s.byType?.video)} video`}
          />
          <Tile
            label="Ringing now"
            value={dash || num(ring.total)}
            accent={ring.total ? 'var(--amber)' : 'var(--border-dark)'}
            sub={`${num(ring.calls)} call · ${num(ring.chats)} chat`}
          />
          <Tile
            label="Live streams"
            value={dash || num(live.streams)}
            accent={live.streams ? 'var(--maroon)' : 'var(--border-dark)'}
            sub={`${num(live.viewers)} watching`}
          />
          <Tile
            label="Money in"
            value={tDash || money(t.moneyIn)}
            accent="var(--emerald)"
            delta={<Delta now={t.moneyIn} before={y.moneyIn} format={money} />}
            sub={`${num(t.rechargesPaid)}/${num(t.rechargeAttempts)} recharges paid`}
          />
          <Tile
            label="Platform share"
            value={tDash || money(t.platformShare)}
            accent="var(--gold-dark)"
            delta={<Delta now={t.platformShare} before={y.platformShare} format={money} />}
            sub="our cut, all sources"
          />

          <Tile
            label="Signups"
            value={tDash || num(t.signups)}
            accent="var(--sky)"
            delta={<Delta now={t.signups} before={y.signups} />}
            sub="new accounts today"
          />
          <Tile
            label="Consultations"
            value={tDash || num(t.sessions)}
            accent="var(--indigo)"
            delta={<Delta now={t.sessions} before={y.sessions} />}
            sub={`${num(t.paidSessions)} paid`}
          />
          <Tile
            label="Talk minutes"
            value={tDash || num(t.minutes)}
            accent="var(--indigo)"
            delta={<Delta now={t.minutes} before={y.minutes} />}
            sub="billed and free"
          />
          <Tile
            label="Paying customers"
            value={tDash || num(t.payingCustomers)}
            accent="var(--maroon)"
            delta={<Delta now={t.payingCustomers} before={y.payingCustomers} />}
            sub="charged at least once"
          />
          <Tile
            label="Free intro calls"
            value={tDash || num(t.freeCallsAnswered)}
            accent="var(--amber)"
            delta={<Delta now={t.freeCallsAnswered} before={y.freeCallsAnswered} />}
            sub="answered, not just booked"
          />
          <Tile
            label="Calls connected"
            value={tDash || (connectRate === null ? '—' : `${connectRate}%`)}
            accent={connectRate === null ? 'var(--border-dark)'
              : connectRate >= 90 ? 'var(--emerald)'
                : connectRate >= 75 ? 'var(--amber)' : 'var(--crimson)'}
            sub={health.calls
              ? `${num(health.connected)}/${num(health.calls)} carried audio`
              : 'no calls yet today'}
            subColour={connectRate !== null && connectRate < 75 ? 'var(--crimson)' : undefined}
          />
        </div>

        {/* ── Two charts, sharing whatever height is left ───────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 0 }}>
          {/* Sign-up flow — LINES, not a funnel. A funnel answers "where do people drop
              out", which you ask once while tuning; these answer "is it better or worse
              than yesterday", which is what a live screen is for. */}
          <div style={PANEL}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h2 style={PANEL_TITLE}>Sign-up flow · today by hour</h2>
              <div style={{ flex: 1 }} />
              {SIGNUP_SERIES.map((sr) => {
                const on = series.has(sr.key);
                return (
                  <button
                    key={sr.key}
                    type="button"
                    onClick={() => toggle(sr.key)}
                    title={on ? 'Hide this line' : 'Show this line'}
                    style={{
                      cursor: 'pointer', border: 'none', background: 'none', padding: 0,
                      fontSize: 9.5, fontWeight: 700, lineHeight: 1,
                      color: on ? 'var(--text-secondary)' : 'var(--text-light)',
                      opacity: on ? 1 : 0.5,
                      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: on ? sr.colour : 'var(--border-dark)',
                    }} />
                    {sr.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {signup.error ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>
                  {signup.error} Only this panel comes from product analytics; everything
                  else on screen is from the database and unaffected.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={signupPoints} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis dataKey="label" tick={{ fontSize: 9.5 }} stroke="var(--text-light)" interval="preserveStartEnd" minTickGap={26} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9.5 }} stroke="var(--text-light)" width={42} />
                    <Tooltip {...chartTooltip} />
                    {SIGNUP_SERIES.filter((sr) => series.has(sr.key)).map((sr) => (
                      <Line key={sr.key} type="monotone" dataKey={sr.key} name={sr.label} stroke={sr.colour} strokeWidth={1.8} dot={dotFor(signupPoints)} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Money and demand. Two axes: rupees and headcounts differ by orders of
              magnitude, and on one axis the people lines flatten into the floor. */}
          <div style={PANEL}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h2 style={PANEL_TITLE}>Money &amp; demand · today by hour</h2>
              <div style={{ flex: 1 }} />
              {[
                ['Recharges', 'var(--emerald)'],
                ['Consultations', 'var(--indigo)'],
                ['Paid', 'var(--maroon)'],
                ['Signups', 'var(--sky)'],
              ].map(([label, colour]) => (
                <span key={label} style={{
                  fontSize: 9.5, fontWeight: 700, color: 'var(--text-secondary)',
                  display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour }} />
                  {label}
                </span>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {trends.error && !trends.data ? (
                <div style={{ fontSize: 11, color: 'var(--crimson)', padding: 8 }}>{trends.error}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendPoints} margin={{ top: 4, right: 2, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis dataKey="label" tick={{ fontSize: 9.5 }} stroke="var(--text-light)" interval="preserveStartEnd" minTickGap={26} />
                    <YAxis yAxisId="money" tick={{ fontSize: 9.5 }} stroke="var(--text-light)" width={44} tickFormatter={compactMoney} />
                    <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 9.5 }} stroke="var(--text-light)" width={28} />
                    <Tooltip {...chartTooltip} formatter={(v, name) => (name === 'Recharges' ? money(v) : num(v))} />
                    <Line yAxisId="money" type="monotone" dataKey="revenue" name="Recharges" stroke="var(--emerald)" strokeWidth={2.2} dot={dotFor(trendPoints)} isAnimationActive={false} />
                    <Line yAxisId="count" type="monotone" dataKey="consultations" name="Consultations" stroke="var(--indigo)" strokeWidth={1.8} dot={dotFor(trendPoints)} isAnimationActive={false} />
                    <Line yAxisId="count" type="monotone" dataKey="paidConsultations" name="Paid" stroke="var(--maroon)" strokeWidth={1.8} strokeDasharray="4 3" dot={dotFor(trendPoints)} isAnimationActive={false} />
                    <Line yAxisId="count" type="monotone" dataKey="signups" name="Signups" stroke="var(--sky)" strokeWidth={1.8} dot={dotFor(trendPoints)} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── Queue strip. Counts only — the page behind each one does the work. ── */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
            background: waiting ? 'var(--amber-bg)' : 'var(--emerald-bg)',
            border: `1px solid ${waiting ? 'var(--amber-border)' : 'var(--emerald-border)'}`,
            borderRadius: 10, whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: waiting ? 'var(--amber)' : 'var(--emerald)' }}>
              {today.loading ? 'Queues' : waiting ? `${num(waiting)} waiting` : 'All clear'}
            </span>
          </div>
          {queues.map((q) => (
            <Link
              key={q.key}
              to={q.to}
              title={`Open ${q.label}`}
              style={{
                flex: 1, minWidth: 0, textDecoration: 'none',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${q.count ? 'var(--amber)' : 'var(--border-dark)'}`,
                borderRadius: 10, padding: '6px 10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <span style={{
                fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {QUEUE_SHORT[q.key] || q.label}
              </span>
              <span style={{
                fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: q.ok === false ? 'var(--text-light)' : q.count ? 'var(--amber)' : 'var(--text-light)',
              }}>
                {/* A queue we could not read must never render as a reassuring zero. */}
                {q.ok === false ? '?' : num(q.count)}
              </span>
            </Link>
          ))}
          {/* Google Ads has no live figure in this console yet — reaching the Ads API
              needs a developer token and OAuth, which is its own job. A labelled empty
              slot is honest; a number nobody can trust is not. Acquisition already has
              the other half (which campaign each signup came from). */}
          <Link
            to="/acquisition"
            title="Ad spend is not wired to this console yet — open Acquisition"
            style={{
              flex: '0 0 158px', minWidth: 0, textDecoration: 'none',
              background: 'transparent', border: '1px dashed var(--border-dark)',
              borderRadius: 10, padding: '6px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Ad spend
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>not wired</span>
          </Link>
        </div>
      </div>
    </>
  );
}
