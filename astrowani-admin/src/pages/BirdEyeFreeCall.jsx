import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import {
  money, num, mmss, pct, useLivePoll, Delta, Tile, Panel, LegendKey, chartTooltip, axisTick,
  useBirdEyeBody, BirdEyeStyles, BirdEyeHeader,
} from '../components/birdEye/shared';

/**
 * BIRD EYE — FREE CALL. The free intro call on ONE SCREEN, no scrolling, same rules as
 * the platform Bird Eye (pages/BirdEye.jsx): four fixed bands — header, twelve tiles,
 * three charts, one astrologer strip. A new number can only replace an old one.
 *
 * It answers "is the free call working right now, and is today better or worse than
 * yesterday". WHY it moved is the Free Instant Call Offer page's job (linked bottom right).
 *
 * Data: src/birdEyeFreeCallRoutes.js — database only, Indian days, today against the
 * same elapsed hours of yesterday, excluded customers dropped.
 */

const PULSE_MS = 10_000;
const TODAY_MS = 30_000;
const TREND_MS = 120_000;

/** Outcome bars, in the order a call can end. Colours: good → neutral → bad. */
const OUTCOME_BARS = [
  { key: 'completed', label: 'Completed', colour: 'var(--emerald)' },
  { key: 'too_short', label: 'Too short', colour: 'var(--gold-dark)' },
  { key: 'abandoned_by_astrologer', label: 'Astro left', colour: 'var(--maroon)' },
  { key: 'interrupted', label: 'Interrupted', colour: 'var(--text-light)' },
  { key: 'missed', label: 'Not answered', colour: 'var(--amber)' },
  { key: 'rejected', label: 'Declined', colour: 'var(--crimson)' },
  { key: 'cancelled', label: 'Cust. cancelled', colour: 'var(--sky)' },
];

const MODE_LABEL = { instant: 'Instant', scheduled: 'Booking', off: 'Off' };

const answerColour = (rate) => (rate === null ? 'var(--border-dark)'
  : rate >= 70 ? 'var(--emerald)' : rate >= 45 ? 'var(--amber)' : 'var(--crimson)');

export default function BirdEyeFreeCall() {
  const [paused, setPaused] = useState(false);
  useBirdEyeBody();

  const pulse = useLivePoll('/api/admin/bird-eye/free-call/pulse', PULSE_MS, { paused });
  const today = useLivePoll('/api/admin/bird-eye/free-call/today', TODAY_MS, { paused });
  const trends = useLivePoll('/api/admin/bird-eye/free-call/trends', TREND_MS, { paused });

  const p = pulse.data || {};
  const offer = p.offer;
  const pool = p.pool || {};
  const t = today.data?.today || {};
  const y = today.data?.yesterday || {};
  const astrologers = today.data?.astrologers || [];

  const dash = pulse.loading ? '…' : null;
  const tDash = today.loading ? '…' : null;

  const answerRate = pct(t.answered, t.rings);
  const yAnswerRate = pct(y.answered, y.rings);
  const live = offer?.enabled && offer?.mode && offer.mode !== 'off';

  const trendPoints = trends.data?.points || [];
  // Two points or fewer and recharts draws no line at all — show dots so the first hour
  // after midnight reads as "the day just started", not "the feed is broken".
  const todayCount = trendPoints.filter((pt) => pt.rings !== null).length;
  const dots = todayCount <= 2 ? { r: 2.6 } : false;

  const outcomeData = OUTCOME_BARS.map((o) => ({
    ...o,
    today: t.outcomes?.[o.key] || 0,
    yesterday: y.outcomes?.[o.key] || 0,
  }));
  const talkData = (t.talk || []).map((b, i) => ({
    label: b.label,
    today: b.count,
    yesterday: y.talk?.[i]?.count || 0,
  }));
  const endedBy = t.endedBy || {};
  const endedTotal = (endedBy.customer || 0) + (endedBy.astrologer || 0) + (endedBy.system || 0);

  const refreshAll = () => { pulse.reload(); today.reload(); trends.reload(); };
  const payoutMin = today.data?.offer?.payoutAtSeconds ? Math.round(today.data.offer.payoutAtSeconds / 60) : 4;

  return (
    <>
      <BirdEyeStyles />
      <div
        className="bird-eye-grid"
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
          gap: 8,
          padding: '10px 14px 12px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <BirdEyeHeader
          title="Bird Eye · Free Call"
          subtitle="The free intro call today, against the same hours yesterday"
          paused={paused}
          onTogglePause={() => setPaused((v) => !v)}
          onRefresh={refreshAll}
          at={pulse.at}
        />

        {/* ── Twelve tiles: six live, six for today ─────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gridAutoRows: '70px',
          gap: 8,
          opacity: (pulse.error && pulse.data) || (today.error && today.data) ? 0.55 : 1,
          transition: 'opacity .2s',
        }}>
          <Tile
            label="Offer"
            value={dash || (!offer ? '?' : live ? 'LIVE' : 'OFF')}
            accent={!offer ? 'var(--border-dark)' : live ? 'var(--emerald)' : 'var(--crimson)'}
            sub={offer
              ? `${MODE_LABEL[offer.mode] || offer.mode} mode${offer.durationMinutes ? ` · ${offer.durationMinutes} min call` : ''}`
              : 'could not read the offer'}
            title="free_call_offer.enabled + mode. Invites and the welcome promise can still ring astrologers while this is OFF."
          />
          <Tile
            label="Pool free now"
            value={dash || num(pool.free)}
            accent={pool.free ? 'var(--emerald)' : 'var(--crimson)'}
            sub={`${num(pool.online)} online of ${num(pool.size)} · ${num(pool.busy)} busy`}
            subColour={pool.size && !pool.online ? 'var(--crimson)' : undefined}
            title="Instant-pool astrologers who are online, approved, call-enabled and not in a session"
          />
          <Tile
            label="Ringing now"
            value={dash || num(p.ringing)}
            accent={p.ringing ? 'var(--amber)' : 'var(--border-dark)'}
            sub="free-call phones ringing"
          />
          <Tile
            label="On a free call"
            value={dash || num(p.inCall)}
            accent={p.inCall ? 'var(--indigo)' : 'var(--border-dark)'}
            sub="sessions running right now"
          />
          <Tile
            label="Scheduled today"
            value={tDash || num(t.scheduledDue)}
            accent="var(--sky)"
            sub={`${num(t.scheduledDone)} done · ${num(t.scheduledMissed)} missed · ${num(t.scheduledUpcoming)} to come`}
            subColour={t.scheduledMissed ? 'var(--amber)' : undefined}
            title={p.upcomingScheduled === null ? undefined : `${p.upcomingScheduled ?? 0} due in the next hour`}
          />
          <Tile
            label="New signups rang"
            value={tDash || (t.signups ? `${pct(t.signupsWhoRang, t.signups)}%` : '—')}
            accent="var(--gold-dark)"
            delta={<Delta now={t.signupsWhoRang} before={y.signupsWhoRang} />}
            sub={`${num(t.signupsWhoRang)} of ${num(t.signups)} signups today`}
          />

          <Tile
            label="Rings"
            value={tDash || num(t.rings)}
            accent="var(--indigo)"
            delta={<Delta now={t.rings} before={y.rings} />}
            sub={`${num(t.customersWhoRang)} customers rang`}
          />
          <Tile
            label="Picked up"
            value={tDash || (answerRate === null ? '—' : `${answerRate}%`)}
            accent={answerColour(answerRate)}
            delta={answerRate !== null && yAnswerRate !== null ? (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: answerRate >= yAnswerRate ? 'var(--emerald)' : 'var(--crimson)' }}
                title={`${yAnswerRate}% by this time yesterday`}>
                {answerRate >= yAnswerRate ? '▲' : '▼'}{Math.abs(answerRate - yAnswerRate)}pt
              </span>
            ) : null}
            sub={`${num(t.answered)}/${num(t.rings)} rings answered`}
            subColour={answerRate !== null && answerRate < 45 ? 'var(--crimson)' : undefined}
          />
          <Tile
            label="Real calls"
            value={tDash || num(t.paidLength)}
            accent="var(--emerald)"
            delta={<Delta now={t.paidLength} before={y.paidLength} />}
            sub={`${payoutMin}+ min · ${num(t.completed)} ran full length`}
          />
          <Tile
            label="Talk minutes"
            value={tDash || num(t.talkMinutes)}
            accent="var(--indigo)"
            delta={<Delta now={t.talkMinutes} before={y.talkMinutes} />}
            sub={`avg ${mmss(t.avgTalkSeconds)} per answered call`}
          />
          <Tile
            label="Went paid after"
            value={tDash || num(t.wentPaid)}
            accent="var(--maroon)"
            delta={<Delta now={t.wentPaid} before={y.wentPaid} />}
            sub={t.callers ? `${pct(t.wentPaid, t.callers)}% of ${num(t.callers)} free callers` : 'no free callers yet'}
            title="Customers who had a free call answered today and then started a PAID consultation today"
          />
          <Tile
            label="Shagun in"
            value={tDash || money(t.shagunAmount)}
            accent={(t.shagunAmount || 0) >= (t.payout || 0) ? 'var(--emerald)' : 'var(--amber)'}
            delta={<Delta now={t.shagunAmount} before={y.shagunAmount} format={money} />}
            sub={`${num(t.shagunCount)} paid · ${money(t.payout)} paid out`}
            title="Shagun Arpan received today, against free-call payouts to astrologers today"
          />
        </div>

        {/* ── Three charts ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr', gap: 8, minHeight: 0 }}>
          {/* LINE: the day's shape. Yesterday's rings dashed, so "quieter than usual at
              this hour" is visible without reading a single number. */}
          <Panel
            title="Free calls · today by hour"
            right={(
              <>
                <LegendKey label="Rings" colour="var(--indigo)" />
                <LegendKey label="Answered" colour="var(--sky)" />
                <LegendKey label="Completed" colour="var(--emerald)" />
                <LegendKey label="Rings yesterday" colour="var(--text-light)" dashed />
              </>
            )}
          >
            {trends.error && !trends.data ? (
              <div style={{ fontSize: 11, color: 'var(--crimson)', padding: 8 }}>{trends.error}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendPoints} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis dataKey="label" tick={axisTick} stroke="var(--text-light)" interval="preserveStartEnd" minTickGap={26} />
                  <YAxis allowDecimals={false} tick={axisTick} stroke="var(--text-light)" width={42} />
                  <Tooltip {...chartTooltip} />
                  <Line type="monotone" dataKey="yRings" name="Rings yesterday" stroke="var(--text-light)" strokeWidth={1.4} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="rings" name="Rings" stroke="var(--indigo)" strokeWidth={2.2} dot={dots} isAnimationActive={false} connectNulls={false} />
                  <Line type="monotone" dataKey="answered" name="Answered" stroke="var(--sky)" strokeWidth={1.8} dot={dots} isAnimationActive={false} connectNulls={false} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke="var(--emerald)" strokeWidth={1.8} dot={dots} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* BAR: how every ring ended. Solid = today, faint = same hours yesterday. */}
          <Panel
            title="How rings ended"
            right={(
              <>
                <LegendKey label="Today" colour="var(--indigo)" square />
                <LegendKey label="Yesterday" colour="var(--border-dark)" square />
              </>
            )}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomeData} layout="vertical" margin={{ top: 2, right: 10, left: 4, bottom: 0 }} barGap={1} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} stroke="var(--text-light)" />
                <YAxis type="category" dataKey="label" tick={axisTick} stroke="var(--text-light)" width={86} />
                <Tooltip {...chartTooltip} cursor={{ fill: 'var(--border-light)' }} />
                <Bar dataKey="today" name="Today" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                  {outcomeData.map((o) => <Cell key={o.key} fill={o.colour} />)}
                </Bar>
                <Bar dataKey="yesterday" name="Yesterday, same hours" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                  {outcomeData.map((o) => <Cell key={o.key} fill={o.colour} fillOpacity={0.28} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* BAR: how long answered calls actually ran, plus who hung up. */}
          <Panel
            title="How long they talked"
            right={endedTotal ? (
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                title="Who ended the answered calls today">
                Hung up: cust {pct(endedBy.customer, endedTotal)}% · astro {pct(endedBy.astrologer, endedTotal)}% · timer {pct(endedBy.system, endedTotal)}%
              </span>
            ) : null}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={talkData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} stroke="var(--text-light)" interval={0} />
                <YAxis allowDecimals={false} tick={axisTick} stroke="var(--text-light)" width={42} />
                <Tooltip {...chartTooltip} cursor={{ fill: 'var(--border-light)' }} />
                <Bar dataKey="today" name="Today" fill="var(--indigo)" isAnimationActive={false} radius={[3, 3, 0, 0]} />
                <Bar dataKey="yesterday" name="Yesterday, same hours" fill="var(--indigo)" fillOpacity={0.25} isAnimationActive={false} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* ── Astrologer strip: who is carrying the offer today. ─────────────── */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', padding: '0 10px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {today.loading ? 'Astrologers' : `${num(astrologers.length)} rang today`}
            </span>
          </div>
          {astrologers.length === 0 && !today.loading ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', padding: '6px 10px', fontSize: 10.5,
              color: 'var(--text-light)', border: '1px dashed var(--border-dark)', borderRadius: 10,
            }}>
              {today.data?.attemptsLogged === false
                ? 'free_call_attempts is not set up on this server — run sql/free_call_attempts.sql'
                : 'No free-call rings yet today'}
            </div>
          ) : astrologers.slice(0, 6).map((a) => (
            <div
              key={a.id}
              title={`${a.name}: ${a.answered}/${a.rings} answered · ${a.completed} completed · ${a.talkMinutes} min talked`}
              style={{
                flex: 1, minWidth: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${answerColour(a.answerRate)}`,
                borderRadius: 10, padding: '5px 10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.name}
                </span>
                <span style={{ fontSize: 9.5, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                  {a.answered}/{a.rings} picked · {a.talkMinutes}m
                </span>
              </span>
              <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: answerColour(a.answerRate) }}>
                {a.answerRate}%
              </span>
            </div>
          ))}
          <Link
            to="/free-call-instant"
            title="Date ranges, customer timelines and the full funnel"
            style={{
              flex: '0 0 140px', textDecoration: 'none',
              border: '1px dashed var(--border-dark)', borderRadius: 10, padding: '6px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
            }}
          >
            Full analysis →
          </Link>
        </div>
      </div>
    </>
  );
}
