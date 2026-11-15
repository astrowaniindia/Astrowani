// GET /api/admin/live-status — who is online, who is talking, who is live, right now.
//
// One read-only endpoint behind the admin dashboard's auto-refreshing "Live right now"
// card. It WRITES NOTHING and is polled every 15s by an open admin tab, so it is built to
// be cheap and to never fail loudly:
//   * every query is independent and its failure only empties its own section;
//   * the free-call pool uses the SAME loadOffer() the customer instant list uses, so
//     the card and the app can never disagree about who is in the pool;
//   * "busy" uses busyStatus.buildBusyMap(), the platform's single definition of busy.
//
// Registered from index.js inside a try/catch: if this module ever fails to load, the
// backend still boots and only this card is missing.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminAuth');
const { buildBusyMap } = require('./busyStatus');
const { avatarUrl } = require('./imageUrl');
const { safeInValues } = require('./pgrstFilter');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// A request from the admin dashboard every 15s per open tab; 5s of caching means several
// tabs (or a fast double refresh) cost one set of queries, and the card is never more
// than 5s behind.
const CACHE_MS = 5000;
let cache = { at: 0, body: null };

const nameOf = (a) => `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer';

async function safe(promise, fallback) {
  try {
    const { data, error } = await promise;
    if (error) {
      console.warn('[adminLiveStatus] query failed:', error.message);
      return fallback;
    }
    return data ?? fallback;
  } catch (err) {
    console.warn('[adminLiveStatus] query threw:', err.message);
    return fallback;
  }
}

async function freeCallPool() {
  try {
    // Required lazily: freeCallRoutes is large and has its own timers; requiring it
    // here at load time would make this module's load depend on all of it.
    const { loadOffer } = require('./freeCallRoutes');
    const offer = await loadOffer();
    let selected = null;
    const vis = await safe(db.from('app_settings').select('value').eq('key', 'free_intro_call_visibility').limit(1), []);
    try {
      const raw = vis[0]?.value;
      const v = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      if (v.mode === 'selected') selected = Array.isArray(v.allowedAstrologerIds) ? v.allowedAstrologerIds.length : 0;
    } catch (_) { /* leave null = everyone */ }
    return {
      enabled: !!offer.enabled,
      mode: offer.mode,
      selected,
      poolIds: Array.isArray(offer.effectiveInstantPool) ? offer.effectiveInstantPool : [],
    };
  } catch (err) {
    console.warn('[adminLiveStatus] free-call pool unavailable:', err.message);
    return { enabled: null, mode: null, selected: null, poolIds: [] };
  }
}

async function buildStatus() {
  const [astros, sessions, liveRows, busyMap, pool] = await Promise.all([
    safe(db.from('astrologers')
      .select('id, first_name, last_name, profile_pic_url, is_online, is_available, is_live, is_chat_enabled, is_call_enabled, is_video_call_enabled, approval_status, is_suspended, hidden_from_customers')
      .eq('approval_status', 'approved')
      .limit(1000), []),
    safe(db.from('chat_sessions')
      .select('id, vendor_id, caller_id, call_type, is_free, started_at, next_billing_at, per_minute_charge')
      .eq('is_active', true)
      .limit(1000), []),
    safe(db.from('live_sessions').select('id, astrologer_id, started_at').eq('is_active', true).limit(500), []),
    buildBusyMap(db).catch(() => ({})),
    freeCallPool(),
  ]);

  const byId = new Map(astros.map((a) => [a.id, a]));
  const usable = astros.filter((a) => a.is_suspended !== true && a.hidden_from_customers !== true);
  const online = usable.filter((a) => a.is_online === true);

  // Customer names for the "talking now" rows. Ids come from our own rows, still passed
  // through safeInValues per the standing .in() rule.
  const callerIds = [...new Set(sessions.map((s) => s.caller_id).filter(Boolean))];
  const customers = callerIds.length
    ? await safe(db.from('customers').select('id, name').in('id', safeInValues(callerIds.slice(0, 150))), [])
    : [];
  const custName = new Map(customers.map((c) => [c.id, c.name]));

  const now = Date.now();
  const talking = sessions
    .map((s) => {
      const a = byId.get(s.vendor_id);
      const startedMs = s.started_at ? new Date(s.started_at).getTime() : null;
      return {
        sessionId: s.id,
        astrologerId: s.vendor_id,
        astrologer: a ? nameOf(a) : 'Unknown astrologer',
        image: a ? avatarUrl(a.profile_pic_url) || '' : '',
        customer: custName.get(s.caller_id) || 'Customer',
        type: s.call_type === 'video' ? 'video' : (s.call_type === 'chat' ? 'chat' : 'audio'),
        isFree: s.is_free === true,
        // Billing starts once both sides are actually connected; before that the
        // session exists but nobody has been charged yet.
        connected: !!s.next_billing_at,
        rate: Number(s.per_minute_charge) || 0,
        startedAt: s.started_at,
        seconds: startedMs ? Math.max(0, Math.round((now - startedMs) / 1000)) : null,
      };
    })
    .sort((x, y) => (y.seconds || 0) - (x.seconds || 0));

  const live = liveRows.map((l) => {
    const a = byId.get(l.astrologer_id);
    return {
      astrologerId: l.astrologer_id,
      astrologer: a ? nameOf(a) : 'Unknown astrologer',
      image: a ? avatarUrl(a.profile_pic_url) || '' : '',
      startedAt: l.started_at,
    };
  });

  const statusOf = (a) => {
    const b = busyMap[a.id];
    if (b?.reason === 'live') return 'live';
    if (talking.some((t) => t.astrologerId === a.id)) return 'talking';
    if (b?.reason === 'hold') return 'held';
    if (b?.isBusy) return 'ringing';
    return a.is_online === true ? 'free' : 'offline';
  };

  const onlineList = online
    .map((a) => ({
      id: a.id,
      name: nameOf(a),
      image: avatarUrl(a.profile_pic_url) || '',
      status: statusOf(a),
      chat: a.is_chat_enabled === true,
      call: a.is_call_enabled === true,
      video: a.is_video_call_enabled === true,
      inFreePool: pool.poolIds.includes(a.id),
    }))
    .sort((x, y) => x.name.localeCompare(y.name));

  const poolRows = pool.poolIds.map((id) => byId.get(id)).filter((a) => a && a.is_suspended !== true);
  const poolOnline = poolRows.filter((a) => a.is_online === true && a.hidden_from_customers !== true);

  const count = (pred) => talking.filter(pred).length;
  return {
    success: true,
    at: new Date().toISOString(),
    summary: {
      approved: usable.length,
      online: online.length,
      freeNow: onlineList.filter((a) => a.status === 'free').length,
      talking: talking.length,
      talkingPaid: count((t) => !t.isFree),
      talkingFree: count((t) => t.isFree),
      chat: count((t) => t.type === 'chat'),
      audio: count((t) => t.type === 'audio'),
      video: count((t) => t.type === 'video'),
      connecting: count((t) => !t.connected),
      live: live.length,
      ringing: onlineList.filter((a) => a.status === 'ringing').length,
    },
    freeCall: {
      enabled: pool.enabled,
      mode: pool.mode,
      selected: pool.selected,
      switchedOn: poolRows.length,
      online: poolOnline.length,
      freeNow: poolOnline.filter((a) => statusOf(a) === 'free').length,
    },
    talking,
    live,
    online: onlineList,
  };
}

module.exports = function registerAdminLiveStatusRoutes(app) {
  app.get('/api/admin/live-status', requireAdmin, async (req, res) => {
    try {
      if (!cache.body || Date.now() - cache.at > CACHE_MS) {
        cache = { at: Date.now(), body: await buildStatus() };
      }
      return res.json(cache.body);
    } catch (err) {
      console.error('[adminLiveStatus] failed:', err.message);
      return res.status(500).json({ success: false, message: 'Could not read live status' });
    }
  });
};

module.exports._buildStatus = buildStatus;
