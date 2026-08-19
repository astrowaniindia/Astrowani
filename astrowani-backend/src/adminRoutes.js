// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard routes — auth + content/management CRUD.
//
// All routes are mounted under /api/admin. Everything except /login is guarded by
// `requireAdmin` (Bearer JWT with role === 'admin'). Writes use the Supabase
// service-role client (bypasses RLS), mirroring src/sessionManager.js.
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');
const { computeAstrologerMetrics } = require('./astrologerMetrics');
const wallet = require('./wallet');
const { contentCache } = require('./contentCache');
const liveAarti = require('./liveAarti');
const { queueBlogTranslation } = require('./autoTranslate');

const JWT_SECRET = process.env.JWT_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client for admin writes (falls back to anon if service key missing,
// in which case writes depend on RLS being permissive on the new tables).
const db = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O'
);

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Small async wrapper so each handler can throw and we return 500 once.
const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[admin] ${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

module.exports = function registerAdminRoutes(app) {
  // ── Login ────────────────────────────────────────────────────────────────
  app.post('/api/admin/login', h(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const { data: admins, error } = await db
      .from('admins')
      .select('id, email, name, password_hash')
      .eq('email', email.toLowerCase().trim())
      .limit(1);
    if (error) throw error;
    const admin = admins && admins[0];
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({
      success: true,
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });
  }));

  // ── Dashboard stats ─────────────────────────────────────────────────────--
  app.get('/api/admin/stats', requireAdmin, h(async (req, res) => {
    const [customers, astrologers, activeSessions, sessions, txns] = await Promise.all([
      db.from('customers').select('id', { count: 'exact', head: true }),
      db.from('astrologers').select('id', { count: 'exact', head: true }),
      db.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('chat_sessions').select('id', { count: 'exact', head: true }),
      db.from('wallet_transactions').select('amount, type').eq('type', 'debit'),
    ]);
    const revenue = (txns.data || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    // admin_wallet only exists once sql/astro_services_schema.sql has been run — degrade to 0
    // rather than 500ing the whole dashboard if it's missing.
    let adminWalletBalance = 0;
    try {
      const { data } = await db.from('admin_wallet').select('balance').limit(1).maybeSingle();
      adminWalletBalance = Number(data?.balance) || 0;
    } catch (_) { /* table not migrated yet */ }
    return res.json({
      success: true,
      stats: {
        customers: customers.count || 0,
        astrologers: astrologers.count || 0,
        activeSessions: activeSessions.count || 0,
        totalSessions: sessions.count || 0,
        revenue,
        adminWalletBalance,
      },
    });
  }));

  // ── Generic CRUD factory for simple content tables ────────────────────────
  // Registers GET (list), POST (create), PUT/:id (update), DELETE/:id for a table.
  // afterWrite(row): optional side effect run once a create/update has succeeded.
  // Deliberately NOT awaited — it is for work that must not delay the admin's
  // save response or make a save look failed if the side effect fails.
  function crud(resource, table, { orderBy = 'created_at', ascending = false, allowed, afterWrite } = {}) {
    const pick = (body) => {
      if (!allowed) return body;
      const out = {};
      for (const k of allowed) if (k in body) out[k] = body[k];
      return out;
    };

    app.get(`/api/admin/${resource}`, requireAdmin, h(async (req, res) => {
      const { data, error } = await db.from(table).select('*').order(orderBy, { ascending });
      if (error) throw error;
      return res.json({ success: true, data: data || [] });
    }));

    app.post(`/api/admin/${resource}`, requireAdmin, h(async (req, res) => {
      const { data, error } = await db.from(table).insert([pick(req.body || {})]).select().single();
      if (error) throw error;
      // No-op for resources the customer-facing routes don't cache (e.g. blogs,
      // support-tickets) — invalidate() on a prefix with no matching keys is safe.
      contentCache.invalidate(`${resource}:`);
      if (afterWrite) afterWrite(data);
      return res.json({ success: true, data });
    }));

    app.put(`/api/admin/${resource}/:id`, requireAdmin, h(async (req, res) => {
      const body = pick(req.body || {});
      if (table === 'blogs') body.updated_at = new Date().toISOString();
      if (table === 'support_tickets' && body.status === 'resolved') body.resolved_at = new Date().toISOString();
      const { data, error } = await db.from(table).update(body).eq('id', req.params.id).select().single();
      if (error) throw error;
      contentCache.invalidate(`${resource}:`);
      if (afterWrite) afterWrite(data);
      return res.json({ success: true, data });
    }));

    app.delete(`/api/admin/${resource}/:id`, requireAdmin, h(async (req, res) => {
      const { error } = await db.from(table).delete().eq('id', req.params.id);
      if (error) throw error;
      contentCache.invalidate(`${resource}:`);
      return res.json({ success: true });
    }));
  }

  // Blogs are written in English only; the Hindi columns are filled by machine
  // translation here, on SAVE. Fire-and-forget so publishing stays instant, and
  // it only ever fills columns the admin left empty — hand-written or corrected
  // Hindi is never overwritten. See src/autoTranslate.js.
  crud('blogs', 'blogs', {
    allowed: ['title', 'excerpt', 'excerpt_hi', 'meta_description', 'meta_description_hi', 'thumbnail', 'category_id',
      'title_en', 'content_en', 'title_hi', 'content_hi', 'is_published'],
    afterWrite: (row) => queueBlogTranslation(db, row),
  });
  crud('banners', 'banners', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['title', 'title_hi', 'description', 'description_hi', 'image', 'link', 'sort_order',
      'is_active', 'app', 'language', 'placement', 'action_type', 'action_value'],
  });
  crud('thoughts', 'thoughts', {
    allowed: ['text', 'text_hi', 'author', 'author_hi', 'is_active'],
  });
  crud('categories', 'categories', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['name', 'name_hi', 'image', 'sort_order'],
  });
  // Remedy shop items (type = puja | gemstone | specific_puja). Admin UI filters by tab.
  crud('remedies', 'remedy_items', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['type', 'title', 'title_hi', 'description', 'description_hi', 'price', 'image', 'is_active', 'sort_order'],
  });
  // The 4 top-level category cards (Puja/Gemstones/Specific Puja/Life Reports) on the
  // Remedies landing screen — distinct from remedy_items above (the items *inside*
  // each category). Fixed set of 4 rows seeded by sql/remedy_categories_schema.sql;
  // the admin UI only ever PUTs existing rows, never creates/deletes.
  crud('remedy-categories', 'remedy_categories', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['title', 'title_hi', 'description', 'description_hi', 'image', 'sort_order'],
  });
  // Live-stream gift catalog.
  crud('gifts', 'gifts', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['name', 'price', 'image', 'is_active', 'sort_order'],
  });
  // Paid astrology report catalog (JyotishamAstroAPI) — prices flow into admin_wallet on purchase.
  crud('astro-services', 'astro_services', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['key', 'name', 'name_hi', 'description', 'description_hi', 'category', 'price', 'image', 'is_active', 'sort_order'],
  });

  // ── Live Aarti / Pooja channels ──────────────────────────────────────────
  // Not the generic crud() factory: adding or editing a channel has to RESOLVE
  // the pasted link to a UC… channel id before the row is of any use, and the
  // admin needs to see why a link failed rather than getting a row that simply
  // never goes live.
  const LIVE_AARTI_FIELDS = ['name', 'channel_url', 'is_enabled', 'sort_order'];
  const pickAarti = (body) => {
    const out = {};
    for (const k of LIVE_AARTI_FIELDS) if (k in (body || {})) out[k] = body[k];
    return out;
  };

  app.get('/api/admin/live-aarti-channels', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('live_aarti_channels').select('*')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw error;
    return res.json({
      success: true,
      data: data || [],
      // Lets the page explain itself when detection can't run at all, instead
      // of showing a list of channels that mysteriously never go live.
      youtubeConfigured: liveAarti.isConfigured(),
    });
  }));

  app.post('/api/admin/live-aarti-channels', requireAdmin, h(async (req, res) => {
    const body = pickAarti(req.body);
    if (!body.name || !body.channel_url) {
      return res.status(400).json({ success: false, message: 'Name and channel link are required.' });
    }
    const resolved = await liveAarti.resolveChannelId(body.channel_url);
    const { data, error } = await db.from('live_aarti_channels').insert([{
      ...body,
      channel_id: resolved.channelId || null,
      resolve_error: resolved.error || null,
    }]).select().single();
    if (error) throw error;
    contentCache.invalidate('live-aarti:');
    return res.json({ success: true, data });
  }));

  app.put('/api/admin/live-aarti-channels/:id', requireAdmin, h(async (req, res) => {
    const body = pickAarti(req.body);
    // Re-resolve when the link changed — resolution can cost 100 quota units
    // for a /c/ vanity URL, so renaming a channel shouldn't trigger it.
    //
    // ALSO re-resolve when the row has no channel_id yet. Without this a row
    // that failed to resolve is permanently stuck: the link is already correct,
    // so saving it again changes nothing and never retries, and the only way
    // out is to delete and re-add. Resolution fails for transient reasons —
    // a mis-scoped API key, a quota blip — that are fixed elsewhere and then
    // need exactly this retry.
    if (body.channel_url) {
      const { data: existing } = await db
        .from('live_aarti_channels').select('channel_url, channel_id').eq('id', req.params.id).single();
      if (!existing || existing.channel_url !== body.channel_url || !existing.channel_id) {
        const resolved = await liveAarti.resolveChannelId(body.channel_url);
        body.channel_id = resolved.channelId || null;
        body.resolve_error = resolved.error || null;
        // Stale live state belongs to the old channel.
        body.is_live = false;
        body.live_video_id = null;
      }
    }
    const { data, error } = await db
      .from('live_aarti_channels').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;
    contentCache.invalidate('live-aarti:');
    return res.json({ success: true, data });
  }));

  app.delete('/api/admin/live-aarti-channels/:id', requireAdmin, h(async (req, res) => {
    const { error } = await db.from('live_aarti_channels').delete().eq('id', req.params.id);
    if (error) throw error;
    contentCache.invalidate('live-aarti:');
    return res.json({ success: true });
  }));

  // "Check now" — the escape hatch for the cheap detection path. The poller
  // finds streams via the free RSS feed, which occasionally lags or omits a
  // live broadcast; this asks YouTube directly (search.list, 100 quota units).
  // Admin-triggered only, never on a timer. See src/liveAarti.js.
  app.post('/api/admin/live-aarti-channels/:id/check', requireAdmin, h(async (req, res) => {
    const { data: row, error } = await db
      .from('live_aarti_channels').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // An unresolved row used to dead-end here, repeating the stored error
    // forever. "Check now" is the obvious button to press after fixing whatever
    // broke resolution, so make it actually retry.
    let channelId = row?.channel_id;
    if (!channelId) {
      const resolved = await liveAarti.resolveChannelId(row.channel_url);
      await db.from('live_aarti_channels')
        .update({ channel_id: resolved.channelId || null, resolve_error: resolved.error || null })
        .eq('id', row.id);
      if (!resolved.channelId) {
        return res.status(400).json({ success: false, message: resolved.error || 'Could not resolve this channel link.' });
      }
      channelId = resolved.channelId;
    }

    const result = await liveAarti.forceCheckChannel(channelId);
    if (result.error) return res.status(502).json({ success: false, message: result.error });

    const now = new Date().toISOString();
    const patch = result.live
      ? {
        is_live: true,
        live_video_id: result.videoId,
        live_title: result.info?.title || null,
        live_thumbnail: result.info?.thumbnail || null,
        is_embeddable: result.info?.embeddable ?? null,
        last_checked_at: now,
        last_live_at: now,
      }
      : { is_live: false, live_video_id: null, live_title: null, live_thumbnail: null, last_checked_at: now };

    const { data: updated } = await db
      .from('live_aarti_channels').update(patch).eq('id', row.id).select().single();
    contentCache.invalidate('live-aarti:');
    return res.json({ success: true, live: !!result.live, data: updated });
  }));

  // Re-run the whole cheap poll immediately (costs ~1 unit) so an admin doesn't
  // have to wait out the interval after adding a channel.
  app.post('/api/admin/live-aarti-channels/poll', requireAdmin, h(async (req, res) => {
    const result = typeof app.locals.pollLiveAarti === 'function'
      ? await app.locals.pollLiveAarti()
      : { skipped: 'poller not running' };
    contentCache.invalidate('live-aarti:');
    return res.json({ success: true, result });
  }));

  // Customer support tickets (POST /api/support/create-support in index.js writes here).
  // Admin only reads/updates status+note — creation happens on the customer-facing route.
  crud('support-tickets', 'support_tickets', {
    allowed: ['status', 'admin_note'],
  });

  // ── Live moderation ───────────────────────────────────────────────────────
  app.get('/api/admin/live', requireAdmin, h(async (req, res) => {
    const { data: sessions, error } = await db
      .from('live_sessions').select('*').eq('is_active', true).order('started_at', { ascending: false });
    if (error) throw error;
    const ids = (sessions || []).map((s) => s.astrologer_id);
    let names = {};
    if (ids.length) {
      const { data: astros } = await db.from('astrologers').select('id, first_name, last_name').in('id', ids);
      (astros || []).forEach((a) => { names[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer'; });
    }
    return res.json({
      success: true,
      data: (sessions || []).map((s) => ({
        id: s.id,
        astrologerId: s.astrologer_id,
        astrologerName: names[s.astrologer_id] || '—',
        title: s.title,
        viewerCount: s.viewer_count || 0,
        totalGiftAmount: s.total_gift_amount || 0,
        startedAt: s.started_at,
      })),
    });
  }));

  // Force-stop a live stream (reuses backend endLiveSession → emits live_ended + flips flags).
  app.post('/api/admin/live/:id/stop', requireAdmin, h(async (req, res) => {
    const endLiveSession = app.locals.endLiveSession;
    if (endLiveSession) {
      await endLiveSession(req.params.id, 'admin_stopped');
    } else {
      await db.from('live_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', req.params.id);
    }
    return res.json({ success: true });
  }));

  // Missed sessions — unanswered call + chat requests across all astrologers.
  app.get('/api/admin/missed', requireAdmin, h(async (req, res) => {
    const [callsRes, chatsRes] = await Promise.all([
      db.from('call_requests')
        .select('id, astrologer_id, customer_id, customer_name, call_type, created_at')
        .eq('status', 'missed').order('created_at', { ascending: false }).limit(150),
      db.from('chat_requests')
        .select('id, receiver_id, caller_id, caller_name, created_at')
        .eq('status', 'missed').order('created_at', { ascending: false }).limit(150),
    ]);
    const calls = callsRes.data || [];
    const chats = chatsRes.data || [];

    // Resolve astrologer names
    const astroIds = [...new Set([
      ...calls.map(c => c.astrologer_id),
      ...chats.map(c => c.receiver_id),
    ].filter(Boolean))];
    let astroNames = {};
    if (astroIds.length) {
      const { data: astros } = await db.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (astros || []).forEach(a => { astroNames[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer'; });
    }

    const rows = [
      ...calls.map(c => ({
        id: c.id,
        type: c.call_type === 'video' ? 'Video Call' : 'Audio Call',
        astrologerName: astroNames[c.astrologer_id] || '—',
        customerName: c.customer_name || 'Customer',
        createdAt: c.created_at,
      })),
      ...chats.map(c => ({
        id: c.id,
        type: 'Chat',
        astrologerName: astroNames[c.receiver_id] || '—',
        customerName: c.caller_name || 'Customer',
        createdAt: c.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, data: rows });
  }));

  // Gift revenue (platform_cut = platform's share).
  app.get('/api/admin/gift-transactions', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('gift_transactions').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Astrologers (read + moderate) ─────────────────────────────────────────
  app.get('/api/admin/astrologers', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, email, phone_number, experience, specialties, ' +
        'languages, profile_pic_url, bio, ' +
        'approval_status, is_suspended, is_available, is_chat_enabled, is_call_enabled, ' +
        'is_video_call_enabled, chat_charge_per_minute, call_charge_per_minute, ' +
        'video_charge_per_minute, charges_locked_at, wallet_balance, today_earnings, total_earnings, admin_notes, badge')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/astrologers/:id', requireAdmin, h(async (req, res) => {
    // wallet_balance is intentionally NOT in this list — it must go through the ledgered
    // POST /wallet endpoint below (wallet.adjustVendorWallet), never a raw column overwrite,
    // so every admin balance correction leaves a vendor_wallet_transactions row.
    const allowed = ['approval_status', 'is_suspended', 'is_available', 'is_chat_enabled',
      'is_call_enabled', 'is_video_call_enabled', 'chat_charge_per_minute',
      'call_charge_per_minute', 'video_charge_per_minute', 'admin_notes',
      'first_name', 'last_name', 'profile_pic_url', 'bio', 'experience', 'languages', 'badge'];
    const body = {};
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];
    if ('badge' in body && body.badge !== null && !['verified', 'celebrity', 'top_rated'].includes(body.badge)) {
      return res.status(400).json({ success: false, message: 'badge must be verified, celebrity, top_rated, or null' });
    }
    const { data, error } = await db.from('astrologers').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;

    // If this update just made the astrologer ineligible to be live (suspended, or
    // approval taken away), force-end any broadcast they're currently running — being
    // filtered out of GET /api/live/active isn't enough on its own, since a viewer who
    // already joined via socket before the suspension would keep watching indefinitely.
    const madeIneligible =
      body.is_suspended === true || (body.approval_status && body.approval_status !== 'approved');
    if (madeIneligible) {
      const { data: activeLive } = await db
        .from('live_sessions')
        .select('id')
        .eq('astrologer_id', req.params.id)
        .eq('is_active', true);
      const endLiveSession = req.app.locals.endLiveSession;
      if (endLiveSession && activeLive && activeLive.length > 0) {
        await Promise.all(activeLive.map((s) => endLiveSession(s.id, 'astrologer_suspended')));
      }
    }

    return res.json({ success: true, data });
  }));

  // An astrologer can self-set chat/call/video charges via the vendor app only
  // ONCE (see PUT /api/vendor/profile in index.js, which sets charges_locked_at
  // on their first save and refuses to touch charges after that). This lets an
  // admin grant them one more self-edit — e.g. after agreeing to a rate change
  // request made outside the app — by clearing the lock; it re-locks the next
  // time the vendor saves a charge from EditProfile.js, same as the first time.
  app.post('/api/admin/astrologers/:id/unlock-charges', requireAdmin, h(async (req, res) => {
    const { error } = await db.from('astrologers').update({ charges_locked_at: null }).eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  }));

  // Ledgered wallet correction for an astrologer — mirrors POST /api/admin/customers/:id/wallet.
  // Used for mishap corrections (e.g. a disputed session) reported to and verified by an admin.
  app.post('/api/admin/astrologers/:id/wallet', requireAdmin, h(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!amount || amount === 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    let newBalance;
    try {
      newBalance = await wallet.adjustVendorWallet(req.params.id, amount, {
        description: req.body?.description || 'Admin wallet adjustment',
        allowNegative: true,
        countEarnings: false, // a correction is not real earned income
      });
    } catch (err) {
      if (/NO_SUCH_ASTROLOGER/.test(err.message || '')) {
        return res.status(404).json({ success: false, message: 'Astrologer not found' });
      }
      throw err;
    }
    return res.json({ success: true, newBalance });
  }));

  // Delete an astrologer. Real deletion when it's safe (no financial/session
  // history to protect); otherwise falls back to a full soft-removal that hides
  // them everywhere the apps read astrologer data — never a silent no-op.
  //
  // `chat_sessions.vendor_id` and `vendor_wallet_transactions.vendor_id` both carry
  // ON DELETE RESTRICT (hardening_01_core_tables.sql) precisely so a row with real
  // session/earnings history can never be hard-deleted — that's the DB protecting
  // the money trail, not a bug. `call_requests`/`chat_messages` have no FK at all,
  // so they're cleaned up explicitly here first; everything else referencing an
  // astrologer (favorites, reviews, live_sessions, astrologer_waitlist,
  // astrologer_reports, voice_notes, withdrawal_requests) is ON DELETE CASCADE and
  // is removed automatically the moment the astrologer row itself is deleted.
  app.delete('/api/admin/astrologers/:id', requireAdmin, h(async (req, res) => {
    const id = req.params.id;

    const { data: astro } = await db.from('astrologers').select('id, first_name, last_name').eq('id', id).single();
    if (!astro) return res.status(404).json({ success: false, message: 'Astrologer not found' });

    await db.from('call_requests').delete().eq('astrologer_id', id);
    await db.from('chat_messages').delete().eq('receiver_id', id);

    const { error: delErr } = await db.from('astrologers').delete().eq('id', id);

    if (!delErr) {
      return res.json({ success: true, mode: 'deleted' });
    }

    // 23503 = foreign_key_violation. Anything else is a real error, not a "has history" signal.
    if (delErr.code !== '23503') throw delErr;

    // Has session/earnings history the DB refuses to let us destroy — fall back to
    // hiding the account completely instead of just returning an error.
    const { error: softErr } = await db.from('astrologers').update({
      approval_status: 'rejected',
      is_suspended: true,
      is_available: false,
      is_chat_enabled: false,
      is_call_enabled: false,
      is_video_call_enabled: false,
      admin_notes: `Delete requested via admin dashboard on ${new Date().toISOString().slice(0, 10)} — kept in the ` +
        `database because it has session or earnings history the ledger must not lose; ` +
        `rejected + suspended + all services disabled instead, which hides it everywhere the apps read astrologer data.`,
    }).eq('id', id);
    if (softErr) throw softErr;

    return res.json({ success: true, mode: 'hidden', reason: 'has_financial_history' });
  }));

  // ── Leaderboard — ranks astrologers by the same metrics the vendor performance ──
  // dashboard shows them (response time, acceptance rate, repeat-customer rate), so
  // admin sees exactly what astrologers see about themselves.
  app.get('/api/admin/leaderboard', requireAdmin, h(async (req, res) => {
    const { data: astros, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, average_rating, total_reviews, is_suspended, approval_status');
    if (error) throw error;

    const activeAstros = (astros || []).filter((a) => !a.is_suspended && a.approval_status !== 'rejected');
    const metrics = await computeAstrologerMetrics(db, activeAstros.map((a) => a.id));

    const rows = activeAstros.map((a) => ({
      id: a.id,
      name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer',
      rating: a.average_rating || 0,
      totalReviews: a.total_reviews || 0,
      ...metrics[a.id],
    }));

    // Rank by a simple composite: acceptance rate and rating matter most, response time
    // matters least (converted to a 0-100 scale, faster = higher, capped at 5 minutes).
    const score = (r) => {
      const acceptance = r.acceptanceRate ?? 0;
      const rating = (r.rating || 0) * 20; // 0-5 stars -> 0-100
      const responseScore = r.avgResponseSeconds == null ? 0 : Math.max(0, 100 - (r.avgResponseSeconds / 3));
      return acceptance * 0.4 + rating * 0.4 + responseScore * 0.2;
    };
    rows.sort((a, b) => score(b) - score(a));

    return res.json({ success: true, data: rows });
  }));

  // ── New Entries (pending astrologer signups awaiting approval) ─────────────
  // Powers the admin "New Entries" screen. Returns pending applications with the
  // detail an admin needs to vet them. Approve/Reject reuse the PATCH above.
  app.get('/api/admin/new-entries', requireAdmin, h(async (req, res) => {
    // `profile_image` is not a real column on this table (see ASTROLOGER_LIST_COLUMNS'
    // comment in index.js — it's a legacy name that always evaluates undefined; the actual
    // column EditProfile/VerifyOtp write to is `profile_pic_url`). Selecting a nonexistent
    // column makes PostgREST 400 the whole query, so this endpoint was 500ing on every call
    // and the admin "New Entries" page silently showed nothing for every new signup.
    const { data, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, email, phone_number, gender, experience, ' +
        'languages, specialties, profile_pic_url, approval_status, admin_notes, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Customers (read + wallet top-up) ──────────────────────────────────────
  app.get('/api/admin/customers', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('customers')
      .select('id, name, mobile, email, wallet_balance, created_at, fcm_token')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // A customer can never be hard-deleted while financial history references them —
  // `chat_sessions.caller_id` and `wallet_transactions.user_id` both carry ON DELETE
  // RESTRICT (hardening_01_core_tables.sql) precisely so the money trail can't be lost.
  // `call_requests.customer_id` and `chat_messages.sender_id`/`receiver_id` have no FK at
  // all, so they're cleaned up explicitly here first; everything else referencing a
  // customer (favorites, reviews, referrals, wallet_recharges, voice_notes,
  // astrologer_waitlist, astrologer_reports, support_tickets) is ON DELETE CASCADE/SET
  // NULL and is handled automatically the moment the customer row itself is deleted.
  // Mirrors DELETE /api/admin/astrologers/:id.
  app.delete('/api/admin/customers/:id', requireAdmin, h(async (req, res) => {
    const id = req.params.id;

    const { data: customer } = await db.from('customers').select('id, name, mobile').eq('id', id).single();
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    await db.from('call_requests').delete().eq('customer_id', id);
    await db.from('chat_messages').delete().eq('sender_id', id);
    await db.from('chat_messages').delete().eq('receiver_id', id);

    const { error: delErr } = await db.from('customers').delete().eq('id', id);

    if (!delErr) {
      return res.json({ success: true, mode: 'deleted' });
    }

    // 23503 = foreign_key_violation. Anything else is a real error, not a "has history" signal.
    if (delErr.code !== '23503') throw delErr;

    // Has session/wallet history the DB refuses to let us destroy — fall back to hiding
    // the account completely instead of just returning an error. There's no
    // approval_status/is_suspended pair on customers like there is on astrologers, so we
    // clear the phone number and mark it, which both frees the number for re-signup
    // (mobile-otp-request only matches on an exact phone_number) and hides the account
    // from any UI that looks up a customer by mobile.
    const deletedTag = `deleted:${id}:${Date.now()}`;
    const { error: softErr } = await db.from('customers').update({
      mobile: deletedTag,
      name: customer.name ? `${customer.name} (deleted)` : 'Deleted user',
    }).eq('id', id);
    if (softErr) throw softErr;

    return res.json({ success: true, mode: 'hidden', reason: 'has_financial_history' });
  }));

  app.post('/api/admin/customers/:id/wallet', requireAdmin, h(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!amount || amount === 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    // allowNegative: an admin correcting a bad balance may legitimately need to
    // take it below zero; every other path in the system must not.
    let newBalance;
    try {
      newBalance = await wallet.adjustCustomerWallet(req.params.id, amount, {
        description: req.body?.description || 'Admin wallet adjustment',
        allowNegative: true,
      });
    } catch (err) {
      if (/NO_SUCH_CUSTOMER/.test(err.message || '')) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      throw err;
    }
    return res.json({ success: true, newBalance });
  }));

  // ── Sessions ──────────────────────────────────────────────────────────────
  app.get('/api/admin/sessions', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('chat_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Vendor withdrawal requests (view + approve/reject/mark paid) ──────────
  app.get('/api/admin/withdrawals', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('withdrawal_requests')
      .select('*, astrologers(first_name, last_name, phone_number)')
      .order('requested_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/withdrawals/:id', requireAdmin, h(async (req, res) => {
    const { status, admin_note } = req.body || {};
    if (!['approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const { data: withdrawal, error: fetchErr } = await db
      .from('withdrawal_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr) throw fetchErr;

    // Valid transitions: pending -> approved/rejected, approved -> paid. The old check
    // (anything other than 'pending' is "already processed") blocked marking an approved
    // request as paid, since by then its status is legitimately 'approved', not 'pending'.
    const validFrom = status === 'paid' ? 'approved' : 'pending';
    if (withdrawal.status !== validFrom) {
      return res.status(400).json({ success: false, message: 'Request already processed' });
    }

    // Rejecting refunds the amount that was put on hold when the vendor requested it.
    // countEarnings:false — this is returning held money, not new income, and the
    // original hold did not decrement the earnings counters either.
    // Keyed on the withdrawal id so a double-tap on Reject cannot refund twice.
    if (status === 'rejected') {
      await wallet.adjustVendorWallet(withdrawal.astrologer_id, Number(withdrawal.amount), {
        description: 'Withdrawal request rejected — refunded',
        requestId: withdrawal.id,
        idempotencyKey: `withdrawal-refund:${withdrawal.id}`,
        countEarnings: false,
      });
    }

    const { data, error } = await db
      .from('withdrawal_requests')
      .update({ status, admin_note: admin_note || null, processed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  }));

  // ── Astrologer reports (customer moderation flags) ────────────────────────
  app.get('/api/admin/reports', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('astrologer_reports')
      .select('*, customers(name, mobile), astrologers(first_name, last_name, phone_number)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/reports/:id', requireAdmin, h(async (req, res) => {
    const { status, admin_note } = req.body || {};
    if (!['reviewed', 'actioned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const { data, error } = await db
      .from('astrologer_reports')
      .update({ status, admin_note: admin_note || null, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    // Let the reporting customer know their complaint is being handled — the admin_note
    // written when resolving the report IS the message sent to them.
    if (admin_note && data.customer_id) {
      const { data: custRow } = await db
        .from('customers').select('fcm_token').eq('id', data.customer_id).single();
      if (custRow?.fcm_token) {
        sendPush(custRow.fcm_token, {
          title: 'Update on your report',
          body: admin_note,
          data: { type: 'report_update', reportId: data.id },
        }).catch((e) => console.error('[reports] push send error:', e.message));
      }
    }

    return res.json({ success: true, data });
  }));

  // ── Orders (view + update status) ─────────────────────────────────────────
  app.get('/api/admin/orders', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/orders/:id', requireAdmin, h(async (req, res) => {
    const allowed = ['status', 'payment_status', 'report_content'];
    const body = {};
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];
    // Writing the finished report content IS the delivery action for life_report orders.
    const isDelivering = 'report_content' in body && body.report_content;
    if (isDelivering) {
      body.delivered_at = new Date().toISOString();
      body.status = 'completed';
    }
    const { data, error } = await db.from('orders').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;

    if (isDelivering && data.customer_id) {
      const { data: cust } = await db.from('customers').select('fcm_token').eq('id', data.customer_id).single();
      if (cust?.fcm_token) {
        sendPush(cust.fcm_token, {
          title: 'Your report is ready!',
          body: `Your ${data.item_title} report has been delivered — open the app to view it.`,
          data: { type: 'report_delivered', orderId: data.id },
        }).catch((e) => console.error('[orders] push error:', e.message));
      }
    }

    return res.json({ success: true, data });
  }));

  // ── Reviews (moderate: list / edit / hide / delete) ───────────────────────
  // Recomputes an astrologer's cached average + count from non-hidden reviews.
  async function recompute(astrologerId) {
    if (!astrologerId) return;
    const { data: rows } = await db
      .from('reviews').select('rating').eq('astrologer_id', astrologerId).eq('is_hidden', false);
    const list = rows || [];
    const total = list.length;
    const avg = total
      ? Math.round((list.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) * 10) / 10
      : 0;
    await db.from('astrologers').update({ average_rating: avg, total_reviews: total }).eq('id', astrologerId);
  }

  app.get('/api/admin/reviews', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('reviews').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const rows = data || [];
    const astroIds = [...new Set(rows.map((r) => r.astrologer_id).filter(Boolean))];
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    let astroNames = {}, custInfo = {};
    if (astroIds.length) {
      const { data: a } = await db.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (a || []).forEach((x) => { astroNames[x.id] = `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Astrologer'; });
    }
    if (custIds.length) {
      const { data: c } = await db.from('customers').select('id, name, mobile').in('id', custIds);
      (c || []).forEach((x) => { custInfo[x.id] = { name: x.name || 'Customer', mobile: x.mobile || '' }; });
    }
    return res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        astrologerName: astroNames[r.astrologer_id] || '—',
        customerName: custInfo[r.customer_id]?.name || 'Customer',
        customerMobile: custInfo[r.customer_id]?.mobile || '',
      })),
    });
  }));

  app.patch('/api/admin/reviews/:id', requireAdmin, h(async (req, res) => {
    const allowed = ['is_hidden', 'rating', 'comment', 'admin_note', 'admin_reply'];
    const body = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];
    const { data, error } = await db.from('reviews').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;
    await recompute(data.astrologer_id);
    return res.json({ success: true, data });
  }));

  app.delete('/api/admin/reviews/:id', requireAdmin, h(async (req, res) => {
    const { data: row } = await db.from('reviews').select('astrologer_id').eq('id', req.params.id).single();
    const { error } = await db.from('reviews').delete().eq('id', req.params.id);
    if (error) throw error;
    if (row) await recompute(row.astrologer_id);
    return res.json({ success: true });
  }));

  // ── App settings (key/value) ──────────────────────────────────────────────
  // Returns all settings as a flat { key: value } object.
  app.get('/api/admin/settings', requireAdmin, h(async (req, res) => {
    const { data, error } = await db.from('app_settings').select('key, value');
    if (error) throw error;
    const settings = {};
    (data || []).forEach((r) => { settings[r.key] = r.value; });
    return res.json({ success: true, settings });
  }));

  // Upsert a single setting: body { key, value }.
  app.patch('/api/admin/settings', requireAdmin, h(async (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'key required' });
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    // Settings read through contentCache (e.g. live_aarti_youtube_url via
    // GET /api/live-aarti) would otherwise only pick up an edit after the TTL
    // expires — drop it so admin changes reflect immediately. No-op for
    // settings nothing has cached (most of them read app_settings directly
    // at app launch instead, per the banner-interval/session-replay pattern).
    if (key === 'live_aarti_youtube_url') contentCache.invalidate('live-aarti:');
    if (key === 'remedy_unavailable_title' || key === 'remedy_unavailable_message') {
      contentCache.invalidate('remedy-unavailable-popup:');
    }
    return res.json({ success: true });
  }));

  // Shared by every Supabase-backed analytics route below — same date-range control
  // (preset buttons + custom From/To) as the PostHog-backed routes in postHogRoutes.js.
  // `from`/`to` (YYYY-MM-DD, inclusive) take priority; `days` (a rolling window ending
  // now) stays as a fallback for any caller that hasn't been updated.
  const ANALYTICS_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  function resolveDateBounds(req, { defaultDays = 30, maxDays = 180 } = {}) {
    const { from, to } = req.query;
    if (ANALYTICS_ISO_DATE.test(from || '') && ANALYTICS_ISO_DATE.test(to || '')) {
      return { since: `${from}T00:00:00.000Z`, until: `${to}T23:59:59.999Z` };
    }
    const days = Math.min(parseInt(req.query.days, 10) || defaultDays, maxDays);
    return { since: new Date(Date.now() - days * 86400000).toISOString(), until: null };
  }

  // ── Analytics: revenue + session volume ─────────────────────────────────────
  // Sourced from Supabase directly, not PostHog — wallet_recharges/chat_sessions are the
  // accurate ground truth for money and session counts, whereas PostHog's business events
  // are a product-analytics proxy (and subject to the same test/production environment
  // split the PostHog-backed routes below use). No environment filtering needed here since
  // this data isn't tagged that way — this pass explicitly scopes the analytics rebuild to
  // real, unfaked money movement, and every wallet_recharges/chat_sessions row already IS
  // real (it only exists if a real payment or session happened) — there is no "test" row to
  // exclude here the way there is with product-analytics events from friends/family testers.
  app.get('/api/admin/analytics/revenue', requireAdmin, h(async (req, res) => {
    const { since, until } = resolveDateBounds(req, { defaultDays: 30 });
    let query = db.from('wallet_recharges').select('amount, paid_at').eq('status', 'paid').gte('paid_at', since);
    if (until) query = query.lte('paid_at', until);
    const { data, error } = await query;
    if (error) throw error;

    const byDay = new Map();
    for (const row of data || []) {
      const day = (row.paid_at || '').slice(0, 10);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) || 0) + Number(row.amount || 0));
    }
    const points = Array.from(byDay.entries())
      .map(([day, revenue]) => ({ day, revenue }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const total = points.reduce((sum, p) => sum + p.revenue, 0);

    return res.json({ success: true, total, points });
  }));

  app.get('/api/admin/analytics/session-volume', requireAdmin, h(async (req, res) => {
    const { since, until } = resolveDateBounds(req, { defaultDays: 30 });
    // No duration_minutes column exists on chat_sessions — duration is derived from
    // ended_at - started_at (still-active sessions with no ended_at yet count toward
    // the session total for their day, just contribute 0 minutes until they finish).
    let sessQuery = db.from('chat_sessions').select('call_type, started_at, ended_at').not('started_at', 'is', null).gte('started_at', since);
    if (until) sessQuery = sessQuery.lte('started_at', until);
    const { data, error } = await sessQuery;
    if (error) throw error;

    const byDay = new Map();
    for (const row of data || []) {
      const day = (row.started_at || '').slice(0, 10);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, { day, sessions: 0, minutes: 0 });
      const entry = byDay.get(day);
      entry.sessions += 1;
      if (row.ended_at) {
        entry.minutes += Math.max(0, (new Date(row.ended_at) - new Date(row.started_at)) / 60000);
      }
    }
    const points = Array.from(byDay.values())
      .map((p) => ({ ...p, minutes: Math.round(p.minutes) }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const totalSessions = points.reduce((sum, p) => sum + p.sessions, 0);
    const totalMinutes = points.reduce((sum, p) => sum + p.minutes, 0);

    return res.json({ success: true, totalSessions, totalMinutes, points });
  }));

  // ── Revenue by service type (chat / call / video) ──────────────────────────
  // Joined in JS, not a Postgres join — wallet_transactions.session_id has no declared
  // FK to chat_sessions.id (see the "Data-layer audit" notes on the original core
  // tables), so PostgREST embedding isn't available; two queries + a JS Map is simple
  // and correct at this scale. Only debit rows tied to a real session count as service
  // revenue — this deliberately excludes wallet top-ups, admin adjustments, gifts, and
  // the historical drift-reconciliation rows (none of those have a session_id), so this
  // is a clean measure of "money customers actually spent talking to an astrologer."
  // 'audio' and 'voice' are the same thing (a pre-existing inconsistency in what
  // different call sites write to chat_sessions.call_type — see CLAUDE.md subsystem T)
  // and are merged into one 'call' bucket here.
  app.get('/api/admin/analytics/revenue-by-type', requireAdmin, h(async (req, res) => {
    const { since, until } = resolveDateBounds(req, { defaultDays: 30 });

    let txQuery = db.from('wallet_transactions').select('amount, session_id').eq('type', 'debit').not('session_id', 'is', null).gte('created_at', since);
    if (until) txQuery = txQuery.lte('created_at', until);
    const { data: txns, error: txErr } = await txQuery;
    if (txErr) throw txErr;

    const sessionIds = [...new Set((txns || []).map((t) => t.session_id))];
    if (sessionIds.length === 0) return res.json({ success: true, chat: 0, call: 0, video: 0, total: 0 });

    const { data: sessions, error: sessErr } = await db
      .from('chat_sessions')
      .select('id, call_type')
      .in('id', sessionIds);
    if (sessErr) throw sessErr;

    const typeById = new Map((sessions || []).map((s) => [s.id, s.call_type]));
    const totals = { chat: 0, call: 0, video: 0 };
    for (const t of txns || []) {
      const rawType = typeById.get(t.session_id);
      const bucket = rawType === 'video' ? 'video' : rawType === 'chat' ? 'chat' : (rawType === 'audio' || rawType === 'voice') ? 'call' : null;
      if (bucket) totals[bucket] += Number(t.amount || 0);
    }
    const total = totals.chat + totals.call + totals.video;
    return res.json({ success: true, ...totals, total });
  }));

  // ── Payment funnel: recharge started → actually paid ────────────────────────
  // Every failed/abandoned Razorpay checkout is invisible without this — a customer
  // who taps "Add Money", picks an amount, and then the payment fails or they back out
  // never shows up anywhere else in the admin dashboard.
  app.get('/api/admin/analytics/payment-funnel', requireAdmin, h(async (req, res) => {
    const { since, until } = resolveDateBounds(req, { defaultDays: 30 });
    let query = db.from('wallet_recharges').select('status').gte('created_at', since);
    if (until) query = query.lte('created_at', until);
    const { data, error } = await query;
    if (error) throw error;

    const counts = { created: 0, paid: 0, failed: 0 };
    for (const row of data || []) {
      if (row.status in counts) counts[row.status] += 1;
    }
    return res.json({ success: true, ...counts, total: (data || []).length });
  }));

  // ── New vs. returning customer revenue split ────────────────────────────────
  // "New" = this is the customer's first EVER paid recharge (their whole history is
  // checked, not just the requested window) — a repeat customer whose latest recharge
  // happens to fall in this window is still "returning", which is the point: this
  // answers "is revenue coming from people who keep coming back, or a constant churn
  // of first-timers."
  app.get('/api/admin/analytics/customer-revenue-split', requireAdmin, h(async (req, res) => {
    const { since, until } = resolveDateBounds(req, { defaultDays: 30 });

    // Deliberately fetches the customer's FULL history (no date filter on the query
    // itself) — "first ever" has to be checked against everything, not just this
    // window — then filters to the requested window in JS below.
    const { data, error } = await db
      .from('wallet_recharges')
      .select('customer_id, amount, paid_at')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: true });
    if (error) throw error;

    const firstPaidAt = new Map();
    for (const row of data || []) {
      if (!firstPaidAt.has(row.customer_id)) firstPaidAt.set(row.customer_id, row.paid_at);
    }

    let newRevenue = 0, returningRevenue = 0, newCount = 0, returningCount = 0;
    for (const row of data || []) {
      if (row.paid_at < since || (until && row.paid_at > until)) continue; // outside the requested window
      const isFirstEver = firstPaidAt.get(row.customer_id) === row.paid_at;
      if (isFirstEver) { newRevenue += Number(row.amount || 0); newCount += 1; }
      else { returningRevenue += Number(row.amount || 0); returningCount += 1; }
    }

    return res.json({
      success: true,
      new: { revenue: newRevenue, count: newCount },
      returning: { revenue: returningRevenue, count: returningCount },
    });
  }));

  // Audience segmentation by signup date — 'new' = joined within the last N days,
  // 'old' = joined before that, 'all' = no date filter.
  function applyAudienceFilter(query, audience, cutoffIso) {
    if (audience === 'new') return query.gte('created_at', cutoffIso);
    if (audience === 'old') return query.lt('created_at', cutoffIso);
    return query;
  }

  // ── Segment preview — lets the admin see audience size before sending ──
  app.get('/api/admin/customers/segment-count', requireAdmin, h(async (req, res) => {
    const audience = req.query.audience || 'all';
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ count: total }, { count: withToken }] = await Promise.all([
      applyAudienceFilter(db.from('customers').select('id', { count: 'exact', head: true }), audience, cutoff),
      applyAudienceFilter(db.from('customers').select('id', { count: 'exact', head: true }).not('fcm_token', 'is', null), audience, cutoff),
    ]);
    return res.json({ success: true, total: total || 0, withToken: withToken || 0 });
  }));

  // ── Push broadcast — send an announcement/offer to a customer segment ──
  app.post('/api/admin/push/broadcast', requireAdmin, h(async (req, res) => {
    const { title, body, audience = 'all', days } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'title and body are required' });

    const thresholdDays = Number(days) > 0 ? Number(days) : 30;
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: customers, error } = await applyAudienceFilter(
      db.from('customers').select('fcm_token').not('fcm_token', 'is', null),
      audience,
      cutoff,
    );
    if (error) throw error;
    const tokens = (customers || []).map((c) => c.fcm_token).filter(Boolean);

    // FCM allows up to 500 tokens per multicast call — chunk accordingly.
    const CHUNK_SIZE = 500;
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const result = await sendPush(chunk, { title, body, data: { type: 'admin_broadcast' } });
      successCount += result.successCount || 0;
      failureCount += result.failureCount || 0;
    }
    return res.json({ success: true, audience, days: thresholdDays, targeted: tokens.length, successCount, failureCount });
  }));

  console.log('[admin] routes registered under /api/admin');
};

// Exported so other route modules (e.g. postHogRoutes.js) can guard admin-only
// endpoints without duplicating the JWT-verification logic.
module.exports.requireAdmin = requireAdmin;
