/**
 * BIRD EYE — FREE CHAT. The free 5-minute AI welcome chat on one screen, alongside the
 * platform and free-call Bird Eyes (src/birdEyeRoutes.js, src/birdEyeFreeCallRoutes.js).
 *
 * Same rules as the others: today vs the SAME ELAPSED HOURS of yesterday, Indian days,
 * excluded customers dropped, and separate endpoints polled at separate rates so a slow
 * aggregate (or PostHog) cannot stall the live band:
 *
 *   pulse   10s  offer switches, chats live right now, the AI's own counters today
 *   today   30s  database tiles + the messages-per-chat histogram
 *   trends   2m  by hour, today with yesterday alongside
 *   funnel   2m  PostHog: started → messaged → stayed 5 min / left early → AI fell back
 *
 * WHERE EACH NUMBER COMES FROM, and the caveats that come with it:
 *   - "Opened" is customers.free_bot_chat_credited_at, stamped by POST
 *     /api/free-bot-chat/mark-used the moment the chat screen mounts. src/offerGuard.js
 *     also stamps it at signup for a number that already used the chat on a deleted
 *     account — rare, and it slightly overstates "opened".
 *   - Transcripts are free_bot_chat_messages, re-posted by the app after EVERY message
 *     (FreeBotChatScreen.js), so they are live. created_at is the PHONE's clock — good
 *     enough for hours and "the last few minutes", not for seconds.
 *   - The AI counters (replies, fallbacks, per model) are in-memory in src/freeChatAi.js:
 *     one process, reset at IST midnight and on every restart.
 */

const { requireAdmin } = require('./adminRoutes');
const { createClient } = require('@supabase/supabase-js');
const { pagedSelect, chunkIds } = require('./pagedSelect');
const { withoutExcluded } = require('./analyticsExclusions');
const { istMidnight, istHour, istDay, currentIstHour } = require('./birdEyeRoutes');
const { runHogQL, isConfigured, ENV_FILTER } = require('./postHogRoutes');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
/** A chat counts as "live" if a message landed this recently (phone clocks drift a bit). */
const LIVE_WINDOW_MS = 3 * 60 * 1000;
const CHAT_LENGTH_MS = 5 * 60 * 1000;

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[birdEyeFreeChat]', err?.response?.data || err.message);
  return res.status(502).json({ success: false, message: 'Free chat Bird Eye query failed.' });
});

/** Customer messages per chat — where engagement drops off. */
const MSG_BUCKETS = [
  { key: '0', label: '0', min: 0, max: 0 },
  { key: '1', label: '1', min: 1, max: 1 },
  { key: '2-3', label: '2–3', min: 2, max: 3 },
  { key: '4-6', label: '4–6', min: 4, max: 6 },
  { key: '7-10', label: '7–10', min: 7, max: 10 },
  { key: '11+', label: '11+', min: 11, max: Infinity },
];

const FALLBACK_LABEL = {
  disabled: 'AI switched off',
  not_in_audience: 'Not in audience',
  outside_chat_window: 'Outside chat window',
  customer_cap: 'Per-customer cap',
  message_too_long: 'Message too long',
  all_models_blocked: 'All models blocked',
  no_models: 'No models set',
  server_error: 'Server error',
  quota: 'Quota used up',
  timeout: 'Timed out',
  safety: 'Safety block',
  blocked: 'Model blocked',
  empty: 'Empty reply',
};

/** The two switches a customer needs to see the chat at all. Never fatal. */
async function loadSwitches() {
  try {
    const { data } = await db.from('app_settings').select('key, value')
      .in('key', ['free_bot_chat_persona', 'free_bot_chat_ai']);
    const by = new Map((data || []).map((r) => [r.key, r.value]));
    const parse = (v) => { try { return JSON.parse(v || '{}') || {}; } catch (_) { return {}; } };
    const persona = parse(by.get('free_bot_chat_persona'));
    const ai = parse(by.get('free_bot_chat_ai'));
    // Persona defaults to enabled in index.js (FREE_BOT_CHAT_PERSONA_DEFAULT); AI to off.
    return {
      offerOn: persona.enabled !== false && persona.enabled !== 'false',
      aiOn: ai.enabled === true || ai.enabled === 'true',
      personaName: typeof persona.name === 'string' ? persona.name : null,
    };
  } catch (_) {
    return null;
  }
}

function aiStatus() {
  try {
    // eslint-disable-next-line global-require
    const { liveStatus } = require('./freeChatAi');
    return typeof liveStatus === 'function' ? liveStatus() : null;
  } catch (_) {
    return null;
  }
}

/** Group transcript rows into chats: customer, first/last message, message counts. */
function groupChats(rows) {
  const chats = new Map();
  for (const r of rows) {
    if (!r.chat_id) continue;
    const c = chats.get(r.chat_id) || {
      chatId: r.chat_id, customerId: r.customer_id, firstAt: r.created_at, lastAt: r.created_at, customer: 0, bot: 0,
    };
    if (r.created_at < c.firstAt) c.firstAt = r.created_at;
    if (r.created_at > c.lastAt) c.lastAt = r.created_at;
    if (r.sender === 'customer') c.customer += 1; else c.bot += 1;
    chats.set(r.chat_id, c);
  }
  return [...chats.values()];
}

module.exports = function registerBirdEyeFreeChatRoutes(app) {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. RIGHT NOW — every 10s.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-chat/pulse', requireAdmin, h(async (req, res) => {
    const now = Date.now();
    const [switches, msgRes, openedRes] = await Promise.all([
      loadSwitches(),
      db.from('free_bot_chat_messages').select('customer_id, chat_id, sender, created_at')
        .gte('created_at', new Date(now - LIVE_WINDOW_MS).toISOString()).limit(2000),
      db.from('customers').select('id')
        .gte('free_bot_chat_credited_at', new Date(now - CHAT_LENGTH_MS).toISOString()).limit(500),
    ]);
    if (msgRes.error) throw msgRes.error;
    if (openedRes.error) throw openedRes.error;

    const recent = withoutExcluded(msgRes.data || [], 'customer_id');
    const liveChats = new Set(recent.map((r) => r.chat_id));
    const ai = aiStatus();
    const fallbackTotal = ai ? Object.values(ai.fallbacks).reduce((s, n) => s + n, 0) : 0;

    return res.json({
      success: true,
      at: new Date(now).toISOString(),
      switches,
      live: {
        chatting: liveChats.size,
        messagesLast3Min: recent.length,
        openedLast5Min: withoutExcluded(openedRes.data || [], 'id').length,
      },
      ai: ai ? {
        replies: ai.aiReplies,
        fallbacks: fallbackTotal,
        fallbackRate: ai.aiReplies + fallbackTotal ? Math.round((fallbackTotal / (ai.aiReplies + fallbackTotal)) * 100) : null,
        fallbackReasons: Object.entries(ai.fallbacks)
          .map(([reason, count]) => ({ reason, label: FALLBACK_LABEL[reason] || reason.replace(/_/g, ' '), count }))
          .sort((a, b) => b.count - a.count),
        models: Object.entries(ai.byModel).map(([model, m]) => ({
          model,
          replies: m.replies,
          failures: Object.values(m.failures || {}).reduce((s, n) => s + n, 0),
        })).sort((a, b) => b.replies - a.replies || b.failures - a.failures),
        blockedModels: ai.modelBlocks.length,
        lastError: ai.lastError,
      } : null,
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TODAY vs the same hours of yesterday — every 30s.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-chat/today', requireAdmin, h(async (req, res) => {
    const todayStart = istMidnight(0);
    const yesterdayStart = istMidnight(1);
    const yesterdayCutoff = new Date(Date.now() - 86400000).toISOString();
    const inWindow = (iso, a, b) => !!iso && iso >= a && (!b || iso < b);

    const [openedRows, msgRows, signupRows] = await Promise.all([
      pagedSelect(() => db.from('customers').select('id, created_at, free_bot_chat_credited_at')
        .gte('free_bot_chat_credited_at', yesterdayStart).order('free_bot_chat_credited_at')),
      pagedSelect(() => db.from('free_bot_chat_messages').select('customer_id, chat_id, sender, created_at')
        .gte('created_at', yesterdayStart).order('created_at')),
      pagedSelect(() => db.from('customers').select('id, created_at, free_bot_chat_credited_at')
        .gte('created_at', yesterdayStart).order('created_at')),
    ]);

    const opened = withoutExcluded(openedRows.rows, 'id');
    const chats = groupChats(withoutExcluded(msgRows.rows, 'customer_id'));
    const signups = withoutExcluded(signupRows.rows, 'id');

    // What the chat is FOR: did the person go on to pay? A recharge or a paid
    // consultation started AFTER their free chat opened, on the same day.
    const openedAt = new Map(opened.map((c) => [c.id, c.free_bot_chat_credited_at]));
    const ids = [...openedAt.keys()];
    const recharged = { today: new Set(), yesterday: new Set() };
    const paidSession = { today: new Set(), yesterday: new Set() };
    const after = (id, iso) => iso && openedAt.get(id) && iso >= openedAt.get(id);
    const bucketOf = (iso) => (inWindow(iso, todayStart, null) ? 'today'
      : inWindow(iso, yesterdayStart, yesterdayCutoff) ? 'yesterday' : null);
    for (const chunk of chunkIds(ids)) {
      const [rech, sess] = await Promise.all([
        db.from('wallet_recharges').select('customer_id, paid_at').eq('status', 'paid')
          .in('customer_id', chunk).gte('paid_at', yesterdayStart),
        db.from('chat_sessions').select('caller_id, started_at').eq('is_free', false)
          .in('caller_id', chunk).gte('started_at', yesterdayStart),
      ]);
      for (const r of rech.data || []) {
        const b = bucketOf(r.paid_at);
        // Same-day only: the recharge and the chat must fall in the same window.
        if (b && bucketOf(openedAt.get(r.customer_id)) === b && after(r.customer_id, r.paid_at)) recharged[b].add(r.customer_id);
      }
      for (const s of sess.data || []) {
        const b = bucketOf(s.started_at);
        if (b && bucketOf(openedAt.get(s.caller_id)) === b && after(s.caller_id, s.started_at)) paidSession[b].add(s.caller_id);
      }
    }

    const slice = (a, b, key) => {
      const openedHere = opened.filter((c) => inWindow(c.free_bot_chat_credited_at, a, b));
      const chatsHere = chats.filter((c) => inWindow(c.firstAt, a, b));
      const engaged = chatsHere.filter((c) => c.customer > 0);
      const custMsgs = chatsHere.reduce((s, c) => s + c.customer, 0);
      const botMsgs = chatsHere.reduce((s, c) => s + c.bot, 0);
      // Length = first to last saved message. A chat that ran its whole 5 minutes
      // lands close to 5:00; one the customer walked out of is much shorter.
      const lengths = engaged.map((c) => Math.max(0, (Date.parse(c.lastAt) - Date.parse(c.firstAt)) / 1000));
      const cohort = signups.filter((c) => inWindow(c.created_at, a, b));
      return {
        opened: openedHere.length,
        chats: chatsHere.length,
        engaged: engaged.length,
        customerMessages: custMsgs,
        botMessages: botMsgs,
        avgCustomerMessages: engaged.length ? Math.round((custMsgs / engaged.length) * 10) / 10 : 0,
        avgLengthSeconds: lengths.length ? Math.round(lengths.reduce((s, x) => s + x, 0) / lengths.length) : 0,
        fullLength: lengths.filter((s) => s >= 4.5 * 60).length,
        signups: cohort.length,
        signupsWhoOpened: cohort.filter((c) => c.free_bot_chat_credited_at).length,
        recharged: recharged[key].size,
        paidConsultation: paidSession[key].size,
        // Opened the screen but never typed — the first place the chat loses people.
        openedNoMessage: Math.max(0, openedHere.length - engaged.length),
        buckets: MSG_BUCKETS.map((bk) => ({
          key: bk.key,
          label: bk.label,
          count: chatsHere.filter((c) => c.customer >= bk.min && c.customer <= bk.max).length,
        })),
      };
    };

    const today = slice(todayStart, null, 'today');
    const yesterday = slice(yesterdayStart, yesterdayCutoff, 'yesterday');
    // "0 messages" from transcripts alone misses chats that saved nothing at all; the
    // opened-but-never-typed count is the honest number for that bar.
    today.buckets[0].count = today.openedNoMessage;
    yesterday.buckets[0].count = yesterday.openedNoMessage;

    return res.json({
      success: true,
      at: new Date().toISOString(),
      day: istDay(todayStart),
      today,
      yesterday,
      truncated: [openedRows, msgRows, signupRows].some((r) => r.truncated),
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 3. BY HOUR — today (stops at the current hour), yesterday alongside.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-chat/trends', requireAdmin, h(async (req, res) => {
    const todayStart = istMidnight(0);
    const yesterdayStart = istMidnight(1);
    const nowHour = currentIstHour();

    const [openedRows, msgRows] = await Promise.all([
      pagedSelect(() => db.from('customers').select('id, free_bot_chat_credited_at')
        .gte('free_bot_chat_credited_at', yesterdayStart).order('free_bot_chat_credited_at')),
      pagedSelect(() => db.from('free_bot_chat_messages').select('customer_id, chat_id, sender, created_at')
        .gte('created_at', yesterdayStart).order('created_at')),
    ]);

    const points = Array.from({ length: 24 }, (_, hr) => ({
      hour: hr,
      label: hourLabel(hr),
      opened: hr <= nowHour ? 0 : null,
      engaged: hr <= nowHour ? 0 : null,
      messages: hr <= nowHour ? 0 : null,
      yOpened: 0,
    }));

    for (const c of withoutExcluded(openedRows.rows, 'id')) {
      const iso = c.free_bot_chat_credited_at;
      const p = points[istHour(iso)];
      if (!p) continue;
      if (iso >= todayStart) { if (p.opened !== null) p.opened += 1; } else p.yOpened += 1;
    }
    const msgs = withoutExcluded(msgRows.rows, 'customer_id');
    for (const m of msgs) {
      if (m.sender !== 'customer' || m.created_at < todayStart) continue;
      const p = points[istHour(m.created_at)];
      if (p && p.messages !== null) p.messages += 1;
    }
    for (const c of groupChats(msgs)) {
      if (c.customer === 0 || c.firstAt < todayStart) continue;
      const p = points[istHour(c.firstAt)];
      if (p && p.engaged !== null) p.engaged += 1;
    }

    return res.json({ success: true, day: istDay(todayStart), throughHour: nowHour, points });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 4. THE APP'S OWN FUNNEL (PostHog) — today vs the same hours yesterday, in PEOPLE.
  //    Isolated on purpose: PostHog unconfigured or slow takes out this one chart.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-chat/funnel', requireAdmin, h(async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'PostHog is not configured on this server.' });
    }
    const today = istDay(istMidnight(0));
    const yesterday = istDay(istMidnight(1));
    // Minutes since IST midnight, so "yesterday" stops at this same time of day.
    const ist = new Date(Date.now() + IST_OFFSET_MS);
    const minuteOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    // Every interpolated value is built here from timestamps (YYYY-MM-DD / an integer),
    // never from the request.
    const t = "toTimeZone(timestamp, 'Asia/Kolkata')";
    const inToday = `toDate(${t}) = toDate('${today}')`;
    const inYest = `(toDate(${t}) = toDate('${yesterday}') AND toHour(${t}) * 60 + toMinute(${t}) <= ${minuteOfDay})`;
    const cols = (cond) => `
      count(DISTINCT if(${cond} AND event = 'free_bot_chat_started', person_id, NULL)),
      count(DISTINCT if(${cond} AND event = 'free_bot_chat_message_sent', person_id, NULL)),
      count(DISTINCT if(${cond} AND event = 'free_bot_chat_ended' AND properties.completed = true, person_id, NULL)),
      count(DISTINCT if(${cond} AND event = 'free_bot_chat_ended' AND properties.completed = false, person_id, NULL)),
      count(DISTINCT if(${cond} AND event = 'free_bot_chat_ai_fallback', person_id, NULL))`;

    const rows = await runHogQL(`
      SELECT ${cols(inToday)}, ${cols(inYest)}
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER}
        AND event IN ('free_bot_chat_started', 'free_bot_chat_message_sent', 'free_bot_chat_ended', 'free_bot_chat_ai_fallback')
        AND toDate(${t}) >= toDate('${yesterday}')
    `);
    const r = (rows && rows[0]) || [];
    const n = (i) => Number(r[i]) || 0;
    const steps = [
      { key: 'started', label: 'Started' },
      { key: 'messaged', label: 'Sent a message' },
      { key: 'completed', label: 'Stayed 5 min' },
      { key: 'endedEarly', label: 'Left early' },
      { key: 'aiFallback', label: 'AI fell back' },
    ].map((s, i) => ({ ...s, today: n(i), yesterday: n(i + 5) }));

    return res.json({ success: true, basis: 'persons', day: today, steps });
  }));

  console.log('[birdEyeFreeChat] Registered GET /api/admin/bird-eye/free-chat/{pulse,today,trends,funnel}');
};
