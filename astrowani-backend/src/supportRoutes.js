// In-app support: conversations, the bot, escalation and the admin console.
//
// Mounted from index.js as require('./src/supportRoutes')(app), alongside the
// other route modules. See src/supportBot.js for the bot itself (rule-based, not
// an LLM - every sentence it can say is written by hand) and
// sql/support_agent_schema.sql for the tables.
//
// THE SHAPE. One conversation per issue, carrying its own status, owner and SLA
// clock. The bot answers while status is 'bot'. The moment it escalates — or
// the person taps "talk to a person" — status becomes 'awaiting_human', an SLA
// deadline is stamped, and it appears in the admin queue. Once an admin replies
// the status is 'human' and THE BOT STOPS ANSWERING ENTIRELY: two voices
// replying to the same customer, one of which cannot approve anything, is worse
// than a slower single voice.
//
// WHY THE CUSTOMER IS NEVER TOLD "we'll get back to you" WITHOUT A TIME. Every
// escalation stamps first_response_due_at from the priority, and the app shows
// it. "Someone will reply by 4:30pm" is a promise that can be kept or visibly
// broken; "we have received your request" is what makes people write in again.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { findCustomerByPhone, findAstrologerByPhone } = require('./customerLookup');
const { generateReply } = require('./supportBot');
const { sendPush } = require('./push');

const JWT_SECRET = process.env.JWT_SECRET;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Fallback SLA if the setting is missing or unparseable. Deliberately generous
// rather than aggressive: a deadline we invent and miss is worse than a longer
// one we keep.
const DEFAULT_SLA_MINUTES = { urgent: 15, high: 60, normal: 240, low: 1440 };

const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[support]', req.method, req.path, e?.message);
  res.status(500).json({ success: false, message: 'Support is having trouble right now.' });
});

/** True when a table has not been migrated yet. PostgREST says PGRST205, Postgres 42P01. */
const isMissingTable = (e) =>
  e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message || ''));

async function getSetting(key, fallback) {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
    if (data?.value != null) return data.value;
  } catch (_) {}
  return fallback;
}

async function slaMinutes(priority) {
  const raw = await getSetting('support_sla_minutes', null);
  let map = DEFAULT_SLA_MINUTES;
  try {
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') map = { ...DEFAULT_SLA_MINUTES, ...parsed };
    }
  } catch (_) { /* keep the default — a bad setting must not break escalation */ }
  const m = Number(map[priority]);
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_SLA_MINUTES[priority] || 240;
}

/**
 * Who is calling, from the JWT only.
 *
 * Returns { kind: 'customer'|'vendor', id, name } or null. The id resolved here
 * is the one every lookup in supportBot.js is scoped to, so this is the single
 * point that decides whose data the bot can read — nothing downstream takes an
 * id from the request body.
 */
async function resolveParty(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }

  const isVendor = decoded.role === 'astrologer' || decoded.role === 'vendor' || decoded.astroId;
  const tokenId = decoded.astroId || decoded.vendorId || decoded.userId || decoded._id || decoded.id;

  if (isVendor) {
    let row = null;
    if (tokenId && String(tokenId).includes('-')) {
      const { data } = await db.from('astrologers').select('id, first_name, last_name').eq('id', tokenId).maybeSingle();
      row = data || null;
    }
    if (!row && decoded.phone) row = await findAstrologerByPhone(db, decoded.phone, 'id, first_name, last_name');
    if (!row) return null;
    return { kind: 'vendor', id: row.id, name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'there' };
  }

  let row = null;
  if (decoded.phone) row = await findCustomerByPhone(db, decoded.phone, 'id, name');
  if (!row && tokenId && String(tokenId).includes('-')) {
    const { data } = await db.from('customers').select('id, name').eq('id', tokenId).maybeSingle();
    row = data || null;
  }
  if (!row) return null;
  return { kind: 'customer', id: row.id, name: row.name || 'there' };
}

function requireAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    req.admin = decoded;
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

const ownerFilter = (q, party) =>
  party.kind === 'customer' ? q.eq('customer_id', party.id) : q.eq('astrologer_id', party.id);

async function addMessage(conversationId, sender, body, extra = {}) {
  const { data, error } = await db.from('support_messages').insert([{
    conversation_id: conversationId,
    sender,
    body,
    admin_id: extra.adminId || null,
    tool_trace: extra.toolTrace ? JSON.stringify(extra.toolTrace) : null,
  }]).select('*').single();
  if (error) throw error;
  await db.from('support_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
  return data;
}

/**
 * Escalate: stamp the SLA, record why, and tell the person WHEN.
 *
 * The system message is written here rather than by the bot so the promised
 * time always matches the stored deadline. A bot-authored "someone will reply
 * shortly" that disagrees with the queue is how support loses trust.
 */
async function escalate(conv, { reason, category, priority }) {
  const pri = ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal';
  const mins = await slaMinutes(pri);
  const dueAt = new Date(Date.now() + mins * 60 * 1000);

  await db.from('support_conversations').update({
    status: 'awaiting_human',
    escalation_reason: reason || null,
    escalated_at: new Date().toISOString(),
    priority: pri,
    category: category || conv.category || 'other',
    first_response_due_at: dueAt.toISOString(),
  }).eq('id', conv.id);

  const byTime = dueAt.toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
  await addMessage(
    conv.id,
    'system',
    `Connected to the support team. Someone will reply here by ${byTime}.`,
  );
  return dueAt;
}

module.exports = function registerSupportRoutes(app) {
  // ── App-side ─────────────────────────────────────────────────────────────

  // My conversations, newest first.
  app.get('/api/support/conversations', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { data, error } = await ownerFilter(
      db.from('support_conversations')
        .select('id, subject, category, priority, status, created_at, last_message_at, first_response_due_at, resolved_at, satisfaction'),
      party,
    ).order('last_message_at', { ascending: false }).limit(50);

    // Not yet migrated: an empty list is the honest answer and lets the app open
    // a fresh conversation rather than showing an error.
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true, data: [], tableMissing: true });
      throw error;
    }
    return res.json({ success: true, data: data || [] });
  }));

  // Start one.
  app.post('/api/support/conversations', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim().slice(0, 200) : null;
    const row = {
      app: party.kind === 'customer' ? 'customer' : 'vendor',
      customer_id: party.kind === 'customer' ? party.id : null,
      astrologer_id: party.kind === 'vendor' ? party.id : null,
      subject: subject || null,
    };
    const { data, error } = await db.from('support_conversations').insert([row]).select('*').single();
    if (error) {
      if (isMissingTable(error)) {
        return res.status(503).json({ success: false, code: 'NOT_MIGRATED', message: 'Support chat is not set up yet.' });
      }
      throw error;
    }

    // A greeting that names them and says what this is. Written here, not by the
    // model: it costs nothing, cannot fail, and means the screen is never empty
    // while the first reply is generated.
    const hello = party.kind === 'customer'
      ? `Hi ${party.name}, I'm the Astrowani support assistant. Tell me what's wrong and I'll look into your account right away. If it needs a person, I'll bring one in.`
      : `Hi ${party.name}, I'm the Astrowani support assistant. Ask me about payouts, your profile, requests or anything else — I can check your account, and I'll bring in a person when it needs one.`;
    await addMessage(data.id, 'agent', hello);

    return res.json({ success: true, data });
  }));

  // One thread.
  app.get('/api/support/conversations/:id', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // The ownership filter IS the authorisation check: someone else's id matches
    // zero rows and 404s.
    const { data: conv } = await ownerFilter(
      db.from('support_conversations').select('*').eq('id', req.params.id), party,
    ).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const { data: messages } = await db.from('support_messages')
      .select('id, sender, body, admin_id, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    // A first name for any human who replied, so the customer is talking to a
    // person rather than to "Support". tool_trace is deliberately NOT selected —
    // it is an internal audit trail and may contain raw account rows.
    const adminIds = [...new Set((messages || []).map((m) => m.admin_id).filter(Boolean))];
    const adminNames = {};
    if (adminIds.length) {
      const { data: admins } = await db.from('admins').select('id, name, email').in('id', adminIds);
      (admins || []).forEach((a) => {
        adminNames[a.id] = (a.name || a.email || 'Support').split(/[\s@]/)[0];
      });
    }

    return res.json({
      success: true,
      data: {
        ...conv,
        messages: (messages || []).map((m) => ({
          id: m.id,
          sender: m.sender,
          body: m.body,
          agentName: m.admin_id ? adminNames[m.admin_id] || 'Support' : null,
          created_at: m.created_at,
        })),
      },
    });
  }));

  // Send a message. This is where the agent runs.
  app.post('/api/support/conversations/:id/messages', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ success: false, message: 'Message is required' });
    if (body.length > 4000) return res.status(400).json({ success: false, message: 'That message is too long.' });

    const { data: conv } = await ownerFilter(
      db.from('support_conversations').select('*').eq('id', req.params.id), party,
    ).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    await addMessage(conv.id, 'user', body);

    // Re-opening: a resolved conversation the person writes into again is not
    // resolved. It goes back to a human rather than the bot, because whatever the
    // bot concluded last time evidently did not hold.
    if (conv.status === 'resolved' || conv.status === 'closed') {
      await escalate(conv, {
        reason: 'Customer replied after this was marked resolved.',
        category: conv.category,
        priority: conv.priority === 'urgent' ? 'urgent' : 'high',
      });
      return res.json({ success: true, status: 'awaiting_human', reopened: true });
    }

    // A human owns it — stay out of the way. Notify nobody here; the admin
    // console polls its queue and shows the unread count.
    if (conv.status === 'human' || conv.status === 'awaiting_human') {
      return res.json({ success: true, status: conv.status, awaitingHuman: true });
    }

    // Master switch off: hand everything straight to a person.
    const enabled = String(await getSetting('support_agent_enabled', 'true')) !== 'false';

    const { data: history } = await db.from('support_messages')
      .select('sender, body').eq('conversation_id', conv.id)
      .order('created_at', { ascending: true }).limit(60);

    const result = enabled
      ? await generateReply({ party, history: (history || []).slice(0, -1), message: body })
      : { reply: null, escalate: true, reason: 'The support bot is switched off — routed to a person.', category: 'other', priority: 'normal', degraded: true };

    // The bot's own words go first, then the system line about the handover,
    // so the thread reads in the order it happened.
    if (result.reply) {
      await addMessage(conv.id, 'agent', result.reply, { toolTrace: result.toolTrace });
    }

    if (result.escalate) {
      // Nothing to say plus nothing found is the one case where the person would
      // otherwise be left staring at their own message.
      if (!result.reply) {
        await addMessage(conv.id, 'agent', "Let me get a person onto this — I don't want to guess at something this important.");
      }
      await escalate(conv, result);
      return res.json({ success: true, status: 'awaiting_human', escalated: true, degraded: !!result.degraded });
    }

    if (result.resolve) {
      await db.from('support_conversations').update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        category: result.category || conv.category,
      }).eq('id', conv.id);
      return res.json({ success: true, status: 'resolved' });
    }

    return res.json({ success: true, status: 'bot' });
  }));

  // "Talk to a person" — always available, never argued with. A support system
  // that makes you justify wanting a human is the thing everyone hates about
  // support systems.
  app.post('/api/support/conversations/:id/escalate', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { data: conv } = await ownerFilter(
      db.from('support_conversations').select('*').eq('id', req.params.id), party,
    ).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (conv.status === 'human') return res.json({ success: true, status: 'human', alreadyWithHuman: true });

    await escalate(conv, {
      reason: 'The person asked to speak to a human.',
      category: conv.category || 'other',
      // Their own request is a real signal, so it outranks 'normal' — but it is
      // not urgent, which is reserved for lost money, lockout and safety.
      priority: conv.priority === 'urgent' ? 'urgent' : 'high',
    });
    return res.json({ success: true, status: 'awaiting_human' });
  }));

  // Satisfaction, asked once after resolution.
  app.post('/api/support/conversations/:id/satisfaction', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const rating = Number.parseInt(req.body?.rating, 10);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
    }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : null;

    const { data: conv } = await ownerFilter(
      db.from('support_conversations').select('id'), party,
    ).eq('id', req.params.id).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    await db.from('support_conversations')
      .update({ satisfaction: rating, satisfaction_comment: comment })
      .eq('id', conv.id);

    // A low score on a closed conversation is a second chance, not a statistic.
    // Anything at or below 2 goes back to a person automatically.
    if (rating <= 2) {
      const { data: full } = await db.from('support_conversations').select('*').eq('id', conv.id).maybeSingle();
      if (full) {
        await escalate(full, {
          reason: `Rated ${rating}/5 after resolution${comment ? `: "${comment}"` : ''} — reopened for a person.`,
          category: full.category,
          priority: 'high',
        });
      }
    }
    return res.json({ success: true });
  }));

  // ── Admin console ────────────────────────────────────────────────────────

  app.get('/api/admin/support/conversations', requireAdminToken, h(async (req, res) => {
    const status = req.query.status;
    const appFilter = req.query.app;

    let q = db.from('support_conversations').select('*');
    if (status && status !== 'all') {
      // 'open' is the working queue: everything still needing a person.
      if (status === 'open') q = q.in('status', ['awaiting_human', 'human']);
      else q = q.eq('status', status);
    }
    if (appFilter === 'customer' || appFilter === 'vendor') q = q.eq('app', appFilter);

    const { data, error } = await q.order('last_message_at', { ascending: false }).limit(200);
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true, data: [], tableMissing: true });
      throw error;
    }
    const rows = data || [];

    // Names, so the queue is people rather than uuids.
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const astroIds = [...new Set(rows.map((r) => r.astrologer_id).filter(Boolean))];
    const names = {};
    if (custIds.length) {
      const { data: c } = await db.from('customers').select('id, name, mobile').in('id', custIds);
      (c || []).forEach((x) => { names[x.id] = x.name || x.mobile || 'Customer'; });
    }
    if (astroIds.length) {
      const { data: a } = await db.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (a || []).forEach((x) => { names[x.id] = `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Astrologer'; });
    }

    const now = Date.now();
    return res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        partyName: names[r.customer_id || r.astrologer_id] || '—',
        // Computed for display only. Whether a past conversation breached is a
        // function of the stored deadline and the stored first response, so this
        // never rewrites history.
        slaBreached: !!(r.first_response_due_at && !r.first_human_response_at
          && new Date(r.first_response_due_at).getTime() < now
          && ['awaiting_human', 'human'].includes(r.status)),
        minutesToDue: r.first_response_due_at
          ? Math.round((new Date(r.first_response_due_at).getTime() - now) / 60000)
          : null,
      })),
    });
  }));

  app.get('/api/admin/support/conversations/:id', requireAdminToken, h(async (req, res) => {
    const { data: conv } = await db.from('support_conversations').select('*').eq('id', req.params.id).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    // Admins DO see tool_trace — it is the record of what the agent looked up and
    // told the customer, which is the first thing you need when someone says "your
    // bot told me I'd be refunded".
    const { data: messages } = await db.from('support_messages')
      .select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });

    let party = null;
    if (conv.customer_id) {
      const { data } = await db.from('customers')
        .select('id, name, mobile, email, wallet_balance').eq('id', conv.customer_id).maybeSingle();
      party = data ? { ...data, kind: 'customer' } : null;
    } else if (conv.astrologer_id) {
      const { data } = await db.from('astrologers')
        .select('id, first_name, last_name, phone_number, email, wallet_balance').eq('id', conv.astrologer_id).maybeSingle();
      party = data ? { ...data, kind: 'astrologer' } : null;
    }

    return res.json({ success: true, data: { ...conv, party, messages: messages || [] } });
  }));

  // Reply as a human. This is the moment the agent stops.
  app.post('/api/admin/support/conversations/:id/reply', requireAdminToken, h(async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ success: false, message: 'Message is required' });

    const { data: conv } = await db.from('support_conversations').select('*').eq('id', req.params.id).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    const adminId = req.admin?.id || req.admin?.adminId || null;
    await addMessage(conv.id, 'human', body, { adminId });

    const patch = { status: 'human' };
    // First human reply stops the SLA clock and claims ownership. Both are set
    // here rather than on assignment, because answering IS the commitment.
    if (!conv.first_human_response_at) patch.first_human_response_at = new Date().toISOString();
    if (!conv.assigned_admin_id && adminId) {
      patch.assigned_admin_id = adminId;
      patch.assigned_at = new Date().toISOString();
    }
    await db.from('support_conversations').update(patch).eq('id', conv.id);

    // Push, because the whole point is that the reply reaches them. Best-effort:
    // a failed push must never fail the reply that is already saved.
    try {
      // sendPush(tokens, { title, body, data }) — an options object, NOT positional
      // args. Called positionally this sends a notification with no title and no
      // body, which delivers successfully and shows the customer nothing.
      const table = conv.customer_id ? 'customers' : 'astrologers';
      const partyId = conv.customer_id || conv.astrologer_id;
      if (partyId) {
        const { data: row } = await db.from(table).select('fcm_token').eq('id', partyId).maybeSingle();
        if (row?.fcm_token) {
          await sendPush(row.fcm_token, {
            title: 'Astrowani Support',
            body: body.slice(0, 140),
            data: { screen: 'SupportChat', conversationId: conv.id, type: 'support_reply' },
          });
        }
      }
    } catch (e) {
      console.warn('[support] reply push failed:', e?.message);
    }

    return res.json({ success: true });
  }));

  app.patch('/api/admin/support/conversations/:id', requireAdminToken, h(async (req, res) => {
    const allowed = ['status', 'priority', 'category', 'assigned_admin_id'];
    const patch = {};
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    if (!Object.keys(patch).length) return res.status(400).json({ success: false, message: 'Nothing to update' });

    if (patch.status === 'resolved') patch.resolved_at = new Date().toISOString();
    if (patch.assigned_admin_id) patch.assigned_at = new Date().toISOString();

    const { data, error } = await db.from('support_conversations')
      .update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // Say so in the thread. A status that changes with no word to the customer is
    // how "resolved" becomes something that happened to them rather than for them.
    if (patch.status === 'resolved') {
      await addMessage(req.params.id, 'system', 'This conversation was marked resolved by the support team.');
    }
    return res.json({ success: true, data });
  }));

  console.log('[support] in-app support routes registered');
};
