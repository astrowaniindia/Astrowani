import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import {
  num, mmss, pct, useLivePoll, Delta, Tile, Panel, LegendKey, chartTooltip, axisTick,
  useBirdEyeBody, BirdEyeStyles, BirdEyeHeader,
} from '../components/birdEye/shared';

/**
 * BIRD EYE — FREE CHAT. The free 5-minute AI welcome chat on ONE SCREEN, same rules as
 * the other Bird Eyes: header, twelve tiles, three charts, one strip. No scrolling.
 *
 * Data: src/birdEyeFreeChatRoutes.js. Database for what happened (opened, typed,
 * transcripts, recharges); PostHog for the app's own funnel (its own chart, so PostHog
 * being down blanks that panel only); the AI's counters from freeChatAi.js memory.
 */

const PULSE_MS = 10_000;
const TODAY_MS = 30_000;
const TREND_MS = 120_000;

const FUNNEL_COLOURS = {
  started: 'var(--indigo)',
  messaged: 'var(--sky)',
  completed: 'var(--emerald)',
  endedEarly: 'var(--amber)',
  aiFallback: 'var(--crimson)',
};

export default function BirdEyeFreeChat() {
  const [paused, setPaused] = useState(false);
  useBirdEyeBody();

  const pulse = useLivePoll('/api/admin/bird-eye/free-chat/pulse', PULSE_MS, { paused });
  const today = useLivePoll('/api/admin/bird-eye/free-chat/today', TODAY_MS, { paused });
  const trends = useLivePoll('/api/admin/bird-eye/free-chat/trends', TREND_MS, { paused });
  const funnel = useLivePoll('/api/admin/bird-eye/free-chat/funnel', TREND_MS, { paused });

  const p = pulse.data || {};
  const sw = p.switches;
  const live = p.live || {};
  const ai = p.ai;
  const t = today.data?.today || {};
  const y = today.data?.yesterday || {};

  const dash = pulse.loading ? '…' : null;
  const tDash = today.loading ? '…' : null;
  const offerLive = sw?.offerOn;

  const trendPoints = trends.data?.points || [];
  const todayCount = trendPoints.filter((pt) => pt.opened !== null).length;
  const dots = todayCount <= 2 ? { r: 2.6 } : false;

  const funnelSteps = (funnel.data?.steps || []).map((s) => ({ ...s, colour: FUNNEL_COLOURS[s.key] || 'var(--indigo)' }));
  const bucketData = (t.buckets || []).map((b, i) => ({
    label: b.label,
    today: b.count,
    yesterday: y.buckets?.[i]?.count || 0,
  }));

  const typedRate = pct(t.engaged, t.opened);
  const topFallback = ai?.fallbackReasons?.[0];

  const refreshAll = () => { pulse.reload(); today.reload(); trends.reload(); funnel.reload(); };

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
          title="Bird Eye · Free Chat"
          subtitle="The free 5-minute chat today, against the same hours yesterday"
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
            value={dash || (!sw ? '?' : offerLive ? 'LIVE' : 'OFF')}
            accent={!sw ? 'var(--border-dark)' : offerLive ? 'var(--emerald)' : 'var(--crimson)'}
            sub={sw ? `AI ${sw.aiOn ? 'on' : 'OFF — scripted replies'}${sw.personaName ? ` · ${sw.personaName}` : ''}` : 'could not read settings'}
            subColour={sw && !sw.aiOn ? 'var(--amber)' : undefined}
            title="free_bot_chat_persona.enabled (offer) and free_bot_chat_ai.enabled (real AI replies)"
          />
          <Tile
            label="Chatting now"
            value={dash || num(live.chatting)}
            accent={live.chatting ? 'var(--indigo)' : 'var(--border-dark)'}
            sub={`${num(live.messagesLast3Min)} messages in last 3 min`}
          />
          <Tile
            label="Opened just now"
            value={dash || num(live.openedLast5Min)}
            accent={live.openedLast5Min ? 'var(--sky)' : 'var(--border-dark)'}
            sub="chat screens opened, last 5 min"
          />
          <Tile
            label="AI replies today"
            value={dash || (ai ? num(ai.replies) : '?')}
            accent={!ai ? 'var(--border-dark)' : ai.fallbackRate !== null && ai.fallbackRate > 20 ? 'var(--amber)' : 'var(--emerald)'}
            sub={ai ? (ai.fallbackRate === null ? 'none yet since restart' : `${ai.fallbackRate}% fell back to script`) : 'AI module not loaded'}
            subColour={ai?.fallbackRate > 20 ? 'var(--amber)' : undefined}
            title="Counted in the backend's memory: resets at IST midnight and on every restart"
          />
          <Tile
            label="AI fallbacks"
            value={dash || (ai ? num(ai.fallbacks) : '?')}
            accent={ai?.fallbacks ? 'var(--amber)' : 'var(--border-dark)'}
            sub={topFallback ? `mostly: ${topFallback.label} (${num(topFallback.count)})` : ai?.blockedModels ? `${ai.blockedModels} models blocked` : 'none'}
            subColour={ai?.blockedModels ? 'var(--crimson)' : undefined}
          />
          <Tile
            label="New signups chatted"
            value={tDash || (t.signups ? `${pct(t.signupsWhoOpened, t.signups)}%` : '—')}
            accent="var(--gold-dark)"
            delta={<Delta now={t.signupsWhoOpened} before={y.signupsWhoOpened} />}
            sub={`${num(t.signupsWhoOpened)} of ${num(t.signups)} signups today`}
          />

          <Tile
            label="Chats opened"
            value={tDash || num(t.opened)}
            accent="var(--indigo)"
            delta={<Delta now={t.opened} before={y.opened} />}
            sub={`${num(t.openedNoMessage)} never typed`}
          />
          <Tile
            label="Customer typed"
            value={tDash || num(t.engaged)}
            accent="var(--sky)"
            delta={<Delta now={t.engaged} before={y.engaged} />}
            sub={typedRate === null ? 'no chats yet' : `${typedRate}% of chats opened`}
          />
          <Tile
            label="Msgs per chat"
            value={tDash || (t.avgCustomerMessages ?? 0)}
            accent="var(--indigo)"
            delta={<Delta now={t.avgCustomerMessages} before={y.avgCustomerMessages} />}
            sub={`${num(t.customerMessages)} sent · ${num(t.botMessages)} replies`}
          />
          <Tile
            label="Avg chat length"
            value={tDash || mmss(t.avgLengthSeconds)}
            accent="var(--emerald)"
            delta={<Delta now={t.avgLengthSeconds} before={y.avgLengthSeconds} format={mmss} />}
            sub={`${num(t.fullLength)} ran the full 5 min`}
          />
          <Tile
            label="Recharged after"
            value={tDash || num(t.recharged)}
            accent="var(--maroon)"
            delta={<Delta now={t.recharged} before={y.recharged} />}
            sub={t.opened ? `${pct(t.recharged, t.opened)}% of today's chatters` : '—'}
            title="Paid wallet recharge after their free chat opened, same day"
          />
          <Tile
            label="Paid consult after"
            value={tDash || num(t.paidConsultation)}
            accent="var(--maroon)"
            delta={<Delta now={t.paidConsultation} before={y.paidConsultation} />}
            sub="started a paid session, same day"
          />
        </div>

        {/* ── Three charts ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr', gap: 8, minHeight: 0 }}>
          {/* LINE: chats and messages by hour. Two axes — messages run ~10× chats. */}
          <Panel
            title="Free chat · today by hour"
            right={(
              <>
                <LegendKey label="Opened" colour="var(--indigo)" />
                <LegendKey label="Typed" colour="var(--sky)" />
                <LegendKey label="Messages (right)" colour="var(--gold-dark)" />
                <LegendKey label="Opened yesterday" colour="var(--text-light)" dashed />
              </>
            )}
          >
            {trends.error && !trends.data ? (
              <div style={{ fontSize: 11, color: 'var(--crimson)', padding: 8 }}>{trends.error}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendPoints} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis dataKey="label" tick={axisTick} stroke="var(--text-light)" interval="preserveStartEnd" minTickGap={26} />
                  <YAxis yAxisId="chats" allowDecimals={false} tick={axisTick} stroke="var(--text-light)" width={42} />
                  <YAxis yAxisId="msgs" orientation="right" allowDecimals={false} tick={axisTick} stroke="var(--text-light)" width={30} />
                  <Tooltip {...chartTooltip} />
                  <Line yAxisId="chats" type="monotone" dataKey="yOpened" name="Opened yesterday" stroke="var(--text-light)" strokeWidth={1.4} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line yAxisId="msgs" type="monotone" dataKey="messages" name="Customer messages" stroke="var(--gold-dark)" strokeWidth={1.4} strokeOpacity={0.8} dot={dots} isAnimationActive={false} />
                  <Line yAxisId="chats" type="monotone" dataKey="opened" name="Opened" stroke="var(--indigo)" strokeWidth={2.2} dot={dots} isAnimationActive={false} />
                  <Line yAxisId="chats" type="monotone" dataKey="engaged" name="Typed" stroke="var(--sky)" strokeWidth={1.8} dot={dots} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* BAR: the app's own funnel (PostHog, people). Solid today, faint yesterday. */}
          <Panel
            title="Chat funnel · people"
            right={(
              <>
                <LegendKey label="Today" colour="var(--indigo)" square />
                <LegendKey label="Yesterday" colour="var(--border-dark)" square />
              </>
            )}
          >
            {funnel.error && !funnel.data ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>
                {funnel.error} Only this panel comes from product analytics; everything else on screen is unaffected.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelSteps} layout="vertical" margin={{ top: 2, right: 10, left: 4, bottom: 0 }} barGap={1} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} stroke="var(--text-light)" />
                  <YAxis type="category" dataKey="label" tick={axisTick} stroke="var(--text-light)" width={90} />
                  <Tooltip {...chartTooltip} cursor={{ fill: 'var(--border-light)' }} />
                  <Bar dataKey="today" name="Today" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                    {funnelSteps.map((s) => <Cell key={s.key} fill={s.colour} />)}
                  </Bar>
                  <Bar dataKey="yesterday" name="Yesterday, same hours" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                    {funnelSteps.map((s) => <Cell key={s.key} fill={s.colour} fillOpacity={0.28} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* BAR: how much customers actually said. */}
          <Panel
            title="Messages a customer sent"
            right={(
              <>
                <LegendKey label="Today" colour="var(--sky)" square />
                <LegendKey label="Yesterday" colour="var(--border-dark)" square />
              </>
            )}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bucketData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} stroke="var(--text-light)" interval={0} />
                <YAxis allowDecimals={false} tick={axisTick} stroke="var(--text-light)" width={42} />
                <Tooltip {...chartTooltip} cursor={{ fill: 'var(--border-light)' }} labelFormatter={(l) => `${l} messages`} />
                <Bar dataKey="today" name="Chats today" fill="var(--sky)" isAnimationActive={false} radius={[3, 3, 0, 0]} />
                <Bar dataKey="yesterday" name="Yesterday, same hours" fill="var(--sky)" fillOpacity={0.25} isAnimationActive={false} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* ── AI strip: which models are answering today. ────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', padding: '0 10px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              AI models today
            </span>
          </div>
          {!ai || ai.models.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', padding: '6px 10px', fontSize: 10.5,
              color: 'var(--text-light)', border: '1px dashed var(--border-dark)', borderRadius: 10,
            }}>
              {pulse.loading ? '…' : 'No AI calls since midnight or the last backend restart'}
            </div>
          ) : ai.models.slice(0, 5).map((m) => {
            const total = m.replies + m.failures;
            const ok = pct(m.replies, total);
            const colour = ok === null ? 'var(--border-dark)' : ok >= 80 ? 'var(--emerald)' : ok >= 50 ? 'var(--amber)' : 'var(--crimson)';
            return (
              <div
                key={m.model}
                title={`${m.model}: ${m.replies} replies, ${m.failures} failed attempts`}
                style={{
                  flex: 1, minWidth: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${colour}`, borderRadius: 10, padding: '5px 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.model}
                  </span>
                  <span style={{ fontSize: 9.5, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>
                    {num(m.failures)} failed
                  </span>
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: colour }}>
                  {num(m.replies)}
                </span>
              </div>
            );
          })}
          <Link
            to="/free-bot-chat"
            title="Persona, AI instructions and model list"
            style={{
              flex: '0 0 140px', textDecoration: 'none',
              border: '1px dashed var(--border-dark)', borderRadius: 10, padding: '6px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
            }}
          >
            Chat settings →
          </Link>
        </div>
      </div>
    </>
  );
}
