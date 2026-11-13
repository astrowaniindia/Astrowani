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
const { recordInAppAsync } = require('./notifications/inApp');
const supportAlerts = require('./supportAlerts');
const notifDevices = require('./notifications/devices');
const crypto = require('crypto');
const chatImageComposer = require('./chatImageComposer');
const { UPLOAD_CACHE_CONTROL } = require('./imageUrl');


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

// Delegates to the single admin check (security audit 2026-11-13): a token is an
// admin token only if its id is a row in `admins` — see src/adminAuth.js.
const requireAdminToken = require('./adminAuth').requireAdmin;

const ownerFilter = (q, party) =>
  party.kind === 'customer' ? q.eq('customer_id', party.id) : q.eq('astrologer_id', party.id);

async function addMessage(conversationId, sender, body, extra = {}) {
  const row = {
    conversation_id: conversationId,
    sender,
    body,
    admin_id: extra.adminId || null,
    tool_trace: extra.toolTrace ? JSON.stringify(extra.toolTrace) : null,
  };
  if (extra.image) {
    row.image_url = extra.image.url;
    row.image_width = extra.image.width;
    row.image_height = extra.image.height;
  }
  const { data, error } = await db.from('support_messages').insert([row]).select('*').single();
  if (error) throw error;
  // An internal note is not conversation activity: it must not move the thread
  // up anybody's list or make it look like the person heard from us.
  if (sender !== 'note') {
    await db.from('support_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);
  }
  return data;
}

// ── Photos ──────────────────────────────────────────────────────────────────
//
// Same pipeline as consultation-chat photos (src/chatImageComposer.js): the
// device sends the photo as picked plus an optional crop/draw spec; the server
// auto-orients, applies it, strips EXIF (a phone photo carries GPS) and caps the
// size. The admin sends a plain photo with no edits. Stored under its OWN folder
// so support media can be found, purged or moved behind signed URLs separately.

const SUPPORT_IMAGE_MAX_BASE64_CHARS = 9 * 1024 * 1024; // under express.json's 10mb
const SUPPORT_IMAGE_MIN_GAP_MS = 2500;
const SUPPORT_IMAGE_MAX_PER_CONVERSATION = 30;
const imageLastSend = new Map(); // senderKey -> ms
const imageConvCount = new Map(); // conversationId -> count
setInterval(() => {
  if (imageConvCount.size > 5000) imageConvCount.clear();
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of imageLastSend) if (v < cutoff) imageLastSend.delete(k);
}, 30 * 60 * 1000).unref();

/**
 * Throttle, CLAIMED before any await so two taps landing together cannot both
 * pass. Returns null when allowed, or { status, code, message }.
 */
function claimImageSlot(senderKey, conversationId, { perConversationCap = true } = {}) {
  const now = Date.now();
  if (now - (imageLastSend.get(senderKey) || 0) < SUPPORT_IMAGE_MIN_GAP_MS) {
    return { status: 429, code: 'TOO_FAST', message: 'One photo at a time — please wait a moment.' };
  }
  const sent = imageConvCount.get(conversationId) || 0;
  if (perConversationCap && sent >= SUPPORT_IMAGE_MAX_PER_CONVERSATION) {
    return { status: 429, code: 'TOO_MANY', message: 'Too many photos in this conversation.' };
  }
  imageLastSend.set(senderKey, now);
  imageConvCount.set(conversationId, sent + 1);
  return null;
}
function releaseImageSlot(senderKey, conversationId) {
  imageLastSend.delete(senderKey);
  const n = imageConvCount.get(conversationId) || 0;
  if (n > 0) imageConvCount.set(conversationId, n - 1);
}

/** Compose + upload. Throws an Error with code BAD_IMAGE for an unreadable file. */
async function storeSupportImage(dataUri, edits) {
  const composed = await chatImageComposer.composeChatImage({ dataUri, edits: edits || null });
  const objectName = `support-images/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
  const { error } = await db.storage.from('app-images').upload(objectName, composed.buffer, {
    contentType: composed.contentType,
    upsert: false,
    cacheControl: UPLOAD_CACHE_CONTROL,
  });
  if (error) throw error;
  const { data: pub } = db.storage.from('app-images').getPublicUrl(objectName);
  return { url: pub.publicUrl, width: composed.width, height: composed.height };
}

/** "📷 Photo" or "📷 <caption>" — the readable body every text-only reader shows. */
const imageBody = (caption) => {
  const c = String(caption || '').trim().slice(0, 1000);
  return c ? `📷 ${c}` : '📷 Photo';
};

/** Validates an incoming data URI; returns an error object or null. */
function badImageInput(image) {
  if (!image || typeof image !== 'string') return { status: 400, code: 'BAD_IMAGE', message: 'A photo is required.' };
  if (image.length > SUPPORT_IMAGE_MAX_BASE64_CHARS) {
    return { status: 413, code: 'IMAGE_TOO_LARGE', message: 'That photo is too large. Please try another one.' };
  }
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) {
    return { status: 400, code: 'BAD_IMAGE', message: 'That photo could not be read. Please pick another one.' };
  }
  return null;
}

// Saved replies — "macros" in Zendesk, "saved replies" in Intercom/Freshdesk.
// These defaults are used until an admin saves the team's own list from the inbox.
const DEFAULT_SAVED_REPLIES = [
  { id: 'greet', title: 'Looking into it', body: "Hi {name}, thanks for writing in — I'm looking into this now and will update you here shortly." },
  { id: 'need-details', title: 'Ask for a screenshot', body: 'Hi {name}, could you send a screenshot of the problem and roughly what time it happened? That will help me check it quickly.' },
  { id: 'refund-done', title: 'Wallet refund done', body: 'Hi {name}, the amount has been credited back to your Astrowani wallet — you can see it under Wallet → Transactions. Sorry for the trouble.' },
  { id: 'bank-refund', title: 'Bank refund timeline', body: 'Hi {name}, the refund has been started. Banks usually take 5–7 working days to show it. If it has not arrived by then, reply here and I will chase it.' },
  { id: 'payment-pending', title: 'Payment pending at bank', body: 'Hi {name}, this payment is still pending with the bank. If money was deducted, it is either added to your wallet or refunded by the bank automatically, usually within 3–5 working days.' },
  { id: 'payout', title: 'Payout timeline', body: 'Hi {name}, your payout request is in the queue. Once it is processed you will see it in your bank account within 2–3 working days.' },
  { id: 'anything-else', title: 'Anything else?', body: 'Glad that is sorted, {name}! Is there anything else I can help you with?' },
];

async function loadSavedReplies() {
  const raw = await getSetting('support_saved_replies', null);
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { /* fall back to the defaults */ }
  return DEFAULT_SAVED_REPLIES;
}

const isUuid = (v) => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

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
      .select('id, sender, body, admin_id, created_at, image_url, image_width, image_height')
      .eq('conversation_id', conv.id)
      // INTERNAL NOTES NEVER LEAVE THE ADMIN CONSOLE. This line is the whole
      // guarantee; scripts/supportAlertsCheck.js asserts it.
      .neq('sender', 'note')
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
          imageUrl: m.image_url || null,
          imageWidth: m.image_width || null,
          imageHeight: m.image_height || null,
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
    return res.json(await afterUserMessage(conv, party, body));
  }));

  // Send a photo, with an optional caption and the editor's crop/draw spec.
  app.post('/api/support/conversations/:id/image', h(async (req, res) => {
    const party = await resolveParty(req);
    if (!party) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { image, edits, caption } = req.body || {};
    const bad = badImageInput(image);
    if (bad) return res.status(bad.status).json({ success: false, code: bad.code, message: bad.message });

    const { data: conv } = await ownerFilter(
      db.from('support_conversations').select('*').eq('id', req.params.id), party,
    ).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    // Throttle AFTER the ownership check, so a stranger cannot even reach it.
    const key = `${party.kind}:${party.id}`;
    const limited = claimImageSlot(key, conv.id);
    if (limited) return res.status(limited.status).json({ success: false, code: limited.code, message: limited.message });

    let stored;
    try {
      stored = await storeSupportImage(image, edits);
    } catch (e) {
      releaseImageSlot(key, conv.id);
      if (e && e.code === 'BAD_IMAGE') {
        return res.status(400).json({ success: false, code: 'BAD_IMAGE', message: 'That photo could not be read. Please pick another one.' });
      }
      throw e;
    }

    const body = imageBody(caption);
    const row = await addMessage(conv.id, 'user', body, { image: stored });
    const outcome = await afterUserMessage(conv, party, body, { isImage: true });
    return res.json({ ...outcome, message: { id: row.id, imageUrl: stored.url } });
  }));

  /**
   * Everything that happens after the person's message is saved: reopen, hand it
   * to the person who owns it, or let the bot answer. Shared by text and photos.
   * Returns the JSON body for the response.
   */
  async function afterUserMessage(conv, party, body, { isImage = false } = {}) {
    // Re-opening: a resolved conversation the person writes into again is not
    // resolved. It goes back to a human rather than the bot, because whatever the
    // bot concluded last time evidently did not hold.
    if (conv.status === 'resolved' || conv.status === 'closed') {
      await escalate(conv, {
        reason: 'Customer replied after this was marked resolved.',
        category: conv.category,
        priority: conv.priority === 'urgent' ? 'urgent' : 'high',
      });
      supportAlerts.onAwaitingReply(conv.id, { message: body, trigger: 'reopened' });
      return { success: true, status: 'awaiting_human', reopened: true };
    }

    // A human owns it — stay out of the way, BUT it is now our turn to answer.
    // This used to notify nobody ("the admin console polls"), which is how a
    // customer writing back after our reply left no trace anywhere: the status
    // stayed 'human' and nothing said they were waiting. Not awaited — a slow
    // alert email must never slow the customer's send; it never throws.
    if (conv.status === 'human' || conv.status === 'awaiting_human') {
      supportAlerts.onAwaitingReply(conv.id, { message: body, trigger: 'message' });
      return { success: true, status: conv.status, awaitingHuman: true };
    }

    // The assistant cannot read a photo. Someone sending one almost always wants a
    // person to LOOK at something (a deducted-money SMS, an error screen), so it
    // goes straight to the team rather than the bot guessing from the caption.
    if (isImage) {
      await addMessage(conv.id, 'agent', "Thanks for the photo — I'm passing this to the support team so a person can look at it.");
      await escalate(conv, {
        reason: 'Sent a photo — the assistant cannot read photos.',
        category: conv.category,
        priority: conv.priority,
      });
      supportAlerts.onAwaitingReply(conv.id, { message: body, trigger: 'escalated' });
      return { success: true, status: 'awaiting_human', escalated: true };
    }

    // Master switch off: hand everything straight to a person.
    const enabled = String(await getSetting('support_agent_enabled', 'true')) !== 'false';

    const { data: history } = await db.from('support_messages')
      .select('sender, body').eq('conversation_id', conv.id)
      .neq('sender', 'note') // internal notes are never the bot's input
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
      supportAlerts.onAwaitingReply(conv.id, { message: body, trigger: 'escalated' });
      return { success: true, status: 'awaiting_human', escalated: true, degraded: !!result.degraded };
    }

    if (result.resolve) {
      await db.from('support_conversations').update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        category: result.category || conv.category,
      }).eq('id', conv.id);
      return { success: true, status: 'resolved' };
    }

    return { success: true, status: 'bot' };
  }

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
    supportAlerts.onAwaitingReply(conv.id, { trigger: 'escalated' });
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
        supportAlerts.onAwaitingReply(full.id, { message: comment || `Rated ${rating}/5`, trigger: 'reopened' });
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
      // 'waiting' is the to-do list: our turn to answer, whatever the status says.
      if (status === 'waiting') q = q.not('awaiting_reply_since', 'is', null);
      // 'open' is everything still with a person, answered or not.
      else if (status === 'open') q = q.in('status', ['awaiting_human', 'human']);
      // Zendesk's 'Pending': we answered, the ball is in their court. Their next
      // message moves it straight back to 'waiting' (see afterUserMessage).
      else if (status === 'pending') q = q.eq('status', 'human').is('awaiting_reply_since', null);
      else if (status === 'solved') q = q.in('status', ['resolved', 'closed']);
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
    const ownerIds = [...new Set(rows.map((r) => r.assigned_admin_id).filter(Boolean))];
    const ownerNames = {};
    if (ownerIds.length) {
      const { data: ad } = await db.from('admins').select('id, name, email').in('id', ownerIds);
      (ad || []).forEach((x) => { ownerNames[x.id] = x.name || (x.email || '').split('@')[0] || 'Admin'; });
    }

    // What they last said, so triage can happen from the list — telling "my ₹500
    // was deducted" from "nice app" should not need a click into each thread.
    const lastSaid = {};
    if (rows.length) {
      const { data: msgs } = await db.from('support_messages')
        .select('conversation_id, body, created_at')
        .in('conversation_id', rows.map((r) => r.id).slice(0, 150))
        .eq('sender', 'user')
        .order('created_at', { ascending: false })
        .limit(1000);
      (msgs || []).forEach((m) => { if (!lastSaid[m.conversation_id]) lastSaid[m.conversation_id] = m.body; });
    }

    const now = Date.now();
    const RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
    const out = rows.map((r) => ({
      ...r,
      partyName: names[r.customer_id || r.astrologer_id] || '—',
      assignedName: r.assigned_admin_id ? ownerNames[r.assigned_admin_id] || 'Admin' : null,
      lastUserMessage: lastSaid[r.id] ? String(lastSaid[r.id]).slice(0, 160) : null,
      // Our turn to answer. The column is the authority; see sql/support_alerts.sql.
      waitingOnUs: !!r.awaiting_reply_since,
      waitingMinutes: r.awaiting_reply_since
        ? Math.max(0, Math.round((now - new Date(r.awaiting_reply_since).getTime()) / 60000))
        : null,
      // Computed for display only. Whether a past conversation breached is a
      // function of the stored deadline and the stored first response, so this
      // never rewrites history.
      slaBreached: !!(r.first_response_due_at && !r.first_human_response_at
        && new Date(r.first_response_due_at).getTime() < now
        && ['awaiting_human', 'human'].includes(r.status)),
      minutesToDue: r.first_response_due_at
        ? Math.round((new Date(r.first_response_due_at).getTime() - now) / 60000)
        : null,
    }));

    // Worst first: waiting on us, then priority, then who has waited longest. The
    // page's own comment always said "ordered by SLA, not by arrival" — it was in
    // fact ordered by last_message_at, which buries a breached urgent conversation
    // under every chatty one.
    out.sort((a, b) => {
      if (a.waitingOnUs !== b.waitingOnUs) return a.waitingOnUs ? -1 : 1;
      const pa = RANK[a.priority] ?? 2; const pb = RANK[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      if (a.waitingOnUs) return (b.waitingMinutes || 0) - (a.waitingMinutes || 0);
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });

    return res.json({ success: true, data: out });
  }));

  // Counts for the sidebar badge and the inbox's own new-arrival alert.
  app.get('/api/admin/support/summary', requireAdminToken, h(async (req, res) => {
    try {
      return res.json({ success: true, data: await supportAlerts.queueSummary() });
    } catch (e) {
      if (isMissingTable(e) || /awaiting_reply_since/.test(e?.message || '')) {
        return res.json({ success: true, data: { waiting: 0, urgent: 0, high: 0, overdue: 0, newestWaitingAt: null }, notMigrated: true });
      }
      throw e;
    }
  }));

  // Saved replies, shared by the whole team.
  app.get('/api/admin/support/saved-replies', requireAdminToken, h(async (_req, res) => {
    return res.json({ success: true, data: await loadSavedReplies() });
  }));

  app.put('/api/admin/support/saved-replies', requireAdminToken, h(async (req, res) => {
    const list = Array.isArray(req.body?.replies) ? req.body.replies : null;
    if (!list) return res.status(400).json({ success: false, message: 'replies must be a list' });
    const clean = list
      .map((r, i) => ({
        id: String(r?.id || `r${Date.now()}${i}`).slice(0, 60),
        title: String(r?.title || '').trim().slice(0, 80),
        body: String(r?.body || '').trim().slice(0, 2000),
      }))
      .filter((r) => r.title && r.body)
      .slice(0, 60);
    const { error } = await db.from('app_settings')
      .upsert({ key: 'support_saved_replies', value: JSON.stringify(clean) }, { onConflict: 'key' });
    if (error) throw error;
    return res.json({ success: true, data: clean });
  }));

  // How the team is doing — the numbers every help desk puts on its front page.
  // Medians, not averages: one conversation answered after a month would make an
  // average say nothing about the typical person.
  app.get('/api/admin/support/stats', requireAdminToken, h(async (_req, res) => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await db.from('support_conversations')
      .select('escalated_at, first_human_response_at, first_response_due_at, resolved_at, status, satisfaction, created_at')
      .gte('created_at', since)
      .limit(5000);
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true, data: null });
      throw error;
    }
    const rows = data || [];
    const median = (xs) => {
      if (!xs.length) return null;
      const s = [...xs].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    const firstResp = rows
      .filter((r) => r.escalated_at && r.first_human_response_at)
      .map((r) => Math.max(0, Math.round((new Date(r.first_human_response_at) - new Date(r.escalated_at)) / 60000)));
    const withDue = rows.filter((r) => r.first_response_due_at && r.first_human_response_at);
    const onTime = withDue.filter((r) => new Date(r.first_human_response_at) <= new Date(r.first_response_due_at)).length;
    const rated = rows.filter((r) => r.satisfaction != null);
    // Midnight in India, whatever the server's own timezone is.
    const todayStart = Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30');
    return res.json({
      success: true,
      data: {
        conversations7d: rows.length,
        escalated7d: rows.filter((r) => r.escalated_at).length,
        medianFirstResponseMin: median(firstResp),
        onTimePct: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
        resolvedToday: rows.filter((r) => r.resolved_at && new Date(r.resolved_at).getTime() >= todayStart).length,
        csatAvg: rated.length ? Math.round((rated.reduce((s, r) => s + r.satisfaction, 0) / rated.length) * 10) / 10 : null,
        csatCount: rated.length,
      },
    });
  }));

  app.get('/api/admin/support/conversations/:id', requireAdminToken, h(async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
    const { data: conv } = await db.from('support_conversations').select('*').eq('id', req.params.id).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    // Admins DO see tool_trace — it is the record of what the agent looked up and
    // told the customer, which is the first thing you need when someone says "your
    // bot told me I'd be refunded". And they see internal notes.
    const { data: messages } = await db.from('support_messages')
      .select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });

    const adminIds = [...new Set([
      ...(messages || []).map((m) => m.admin_id),
      conv.assigned_admin_id,
    ].filter(Boolean))];
    const adminNames = {};
    if (adminIds.length) {
      const { data: admins } = await db.from('admins').select('id, name, email').in('id', adminIds);
      (admins || []).forEach((a) => { adminNames[a.id] = a.name || (a.email || '').split('@')[0] || 'Admin'; });
    }

    // THE CUSTOMER'S CONTEXT, BESIDE THE THREAD. Zendesk and Intercom put the
    // person's account next to the conversation for one reason: most support
    // questions here are "where is my money", and the answer is in these rows. An
    // admin should not need three other pages open to answer one message.
    let party = null;
    const context = { recentSessions: [], recentPayments: [], recentWithdrawals: [], previousConversations: [] };
    const partyId = conv.customer_id || conv.astrologer_id;
    if (conv.customer_id) {
      const { data } = await db.from('customers')
        .select('id, name, mobile, email, wallet_balance, created_at').eq('id', conv.customer_id).maybeSingle();
      party = data ? { ...data, kind: 'customer' } : null;
    } else if (conv.astrologer_id) {
      const { data } = await db.from('astrologers')
        .select('id, first_name, last_name, phone_number, email, wallet_balance, today_earnings, approval_status, is_suspended')
        .eq('id', conv.astrologer_id).maybeSingle();
      party = data ? { ...data, kind: 'astrologer' } : null;
    }
    // Each lookup is best-effort: a failed side panel must never hide the thread.
    const safe = async (fn) => { try { return await fn(); } catch (_) { return null; } };
    if (partyId) {
      const [sessions, payments, withdrawals, previous] = await Promise.all([
        safe(async () => (await db.from('chat_sessions')
          .select('id, call_type, started_at, ended_at, per_minute_charge, is_free, vendor_id, caller_id')
          .eq(conv.customer_id ? 'caller_id' : 'vendor_id', partyId)
          .order('started_at', { ascending: false }).limit(5)).data),
        conv.customer_id ? safe(async () => (await db.from('wallet_recharges')
          .select('id, amount, status, created_at, paid_at, razorpay_payment_id')
          .eq('customer_id', partyId)
          .order('created_at', { ascending: false }).limit(5)).data) : null,
        conv.astrologer_id ? safe(async () => (await db.from('withdrawal_requests')
          .select('id, amount, net_amount, status, requested_at, processed_at')
          .eq('astrologer_id', partyId)
          .order('requested_at', { ascending: false }).limit(5)).data) : null,
        safe(async () => (await db.from('support_conversations')
          .select('id, category, status, created_at, satisfaction')
          .eq(conv.customer_id ? 'customer_id' : 'astrologer_id', partyId)
          .neq('id', conv.id)
          .order('created_at', { ascending: false }).limit(5)).data),
      ]);
      context.recentSessions = (sessions || []).map((s) => ({
        id: s.id,
        type: s.call_type || 'chat',
        startedAt: s.started_at,
        minutes: s.started_at && s.ended_at
          ? Math.max(0, Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000))
          : null,
        rate: s.per_minute_charge,
        free: !!s.is_free,
        live: !s.ended_at,
      }));
      context.recentPayments = payments || [];
      context.recentWithdrawals = withdrawals || [];
      context.previousConversations = previous || [];
    }

    return res.json({
      success: true,
      data: {
        ...conv,
        assignedName: conv.assigned_admin_id ? adminNames[conv.assigned_admin_id] || 'Admin' : null,
        party,
        context,
        messages: (messages || []).map((m) => ({ ...m, adminName: m.admin_id ? adminNames[m.admin_id] || 'Admin' : null })),
      },
    });
  }));

  // Reply as a human — text, a photo, or both. This is the moment the agent stops.
  app.post('/api/admin/support/conversations/:id/reply', requireAdminToken, h(async (req, res) => {
    const text = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const image = req.body?.image || null;
    if (!text && !image) return res.status(400).json({ success: false, message: 'Message is required' });
    if (text.length > 4000) return res.status(400).json({ success: false, message: 'That message is too long.' });
    if (image) {
      const bad = badImageInput(image);
      if (bad) return res.status(bad.status).json({ success: false, code: bad.code, message: bad.message });
    }

    if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
    const { data: conv } = await db.from('support_conversations').select('*').eq('id', req.params.id).maybeSingle();
    if (!conv) return res.status(404).json({ success: false, message: 'Not found' });

    const adminId = req.admin?.id || req.admin?.adminId || null;

    let stored = null;
    if (image) {
      // The team is not throttled per conversation (an admin may need to send
      // several screenshots), only against an accidental double-click.
      const key = `admin:${adminId || 'unknown'}`;
      const limited = claimImageSlot(key, conv.id, { perConversationCap: false });
      if (limited) return res.status(limited.status).json({ success: false, code: limited.code, message: limited.message });
      try {
        stored = await storeSupportImage(image, null);
      } catch (e) {
        releaseImageSlot(key, conv.id);
        if (e && e.code === 'BAD_IMAGE') {
          return res.status(400).json({ success: false, code: 'BAD_IMAGE', message: 'That image could not be read.' });
        }
        throw e;
      }
    }

    const body = stored ? imageBody(text) : text;
    await addMessage(conv.id, 'human', body, { adminId, image: stored });

    const patch = { status: 'human' };
    // First human reply stops the SLA clock and claims ownership. Both are set
    // here rather than on assignment, because answering IS the commitment.
    if (!conv.first_human_response_at) patch.first_human_response_at = new Date().toISOString();
    if (!conv.assigned_admin_id && adminId) {
      patch.assigned_admin_id = adminId;
      patch.assigned_at = new Date().toISOString();
    }
    await db.from('support_conversations').update(patch).eq('id', conv.id);

    // Nobody is waiting on us any more. Awaited: the inbox reloads straight after.
    await supportAlerts.onAnswered(conv.id);

    const pushText = stored ? (text ? `📷 ${text}` : '📷 Sent you a photo') : text;

    // Push, because the whole point is that the reply reaches them. Best-effort:
    // a failed push must never fail the reply that is already saved.
    //
    // DEVICE-AWARE since 2026-11-14. This used to read ONLY the legacy
    // `fcm_token` account column — one token, whatever phone they last logged in
    // on, with no idea whether notifications were allowed there. The device tables
    // know every phone a person uses and which may show a notification, so the
    // reply goes to all of those; the legacy column stays as the fallback for
    // installs that have never reported a device.
    try {
      // sendPush(tokens, { title, body, data }) — an options object, NOT positional
      // args. Called positionally this sends a notification with no title and no
      // body, which delivers successfully and shows the customer nothing.
      const isCustomer = !!conv.customer_id;
      const partyId = conv.customer_id || conv.astrologer_id;
      if (partyId) {
        const tokens = new Set();
        try {
          const map = isCustomer
            ? await notifDevices.liveDevicesFor([partyId])
            : await notifDevices.liveAstrologerDevicesFor([partyId]);
          (map.get(String(partyId))?.tokens || []).forEach((tk) => tokens.add(tk));
        } catch (_) { /* fall through to the legacy column */ }
        if (!tokens.size) {
          const { data: row } = await db.from(isCustomer ? 'customers' : 'astrologers')
            .select('fcm_token').eq('id', partyId).maybeSingle();
          if (row?.fcm_token) tokens.add(row.fcm_token);
        }
        if (tokens.size) {
          await sendPush([...tokens], {
            title: 'Astrowani Support',
            body: pushText.slice(0, 140),
            data: { screen: isCustomer ? 'SupportChat' : 'Support', conversationId: conv.id, type: 'support_reply' },
          });
        }
        // Written OUTSIDE the `has a token` guard on purpose: the in-app list is the
        // DURABLE record and the push is only the alert. Of 4,890 customers, 289 can
        // receive a push — gating the record on the token would leave the other 94%
        // with no trace of the thing at all. `deepLink` is given explicitly for the
        // astrologer because the two apps have different screens.
        recordInAppAsync({
          type: 'support_reply',
          audience: conv.customer_id ? 'customer' : 'astrologer',
          customerId: conv.customer_id || null,
          astrologerId: conv.astrologer_id || null,
          title: 'Astrowani Support',
          body: pushText.slice(0, 140),
          data: { conversationId: conv.id },
          ...(conv.customer_id ? {} : { deepLink: 'Support' }),
        });
      }
    } catch (e) {
      console.warn('[support] reply push failed:', e?.message);
    }

    return res.json({ success: true });
  }));

  const CATEGORIES = ['billing', 'refund', 'call_quality', 'chat_quality', 'account', 'order', 'astrologer_conduct', 'payout', 'technical', 'feedback', 'other'];

  app.patch('/api/admin/support/conversations/:id', requireAdminToken, h(async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
    const b = req.body || {};
    const patch = {};
    if ('status' in b) {
      if (!['awaiting_human', 'human', 'resolved', 'closed'].includes(b.status)) {
        return res.status(400).json({ success: false, message: 'Unknown status' });
      }
      patch.status = b.status;
    }
    if ('priority' in b) {
      if (!['low', 'normal', 'high', 'urgent'].includes(b.priority)) {
        return res.status(400).json({ success: false, message: 'Unknown priority' });
      }
      patch.priority = b.priority;
    }
    if ('category' in b) {
      if (!CATEGORIES.includes(b.category)) return res.status(400).json({ success: false, message: 'Unknown category' });
      patch.category = b.category;
    }
    if ('assigned_admin_id' in b) {
      // 'me' so the inbox does not need to know its own admin id.
      const v = b.assigned_admin_id === 'me' ? (req.admin?.id || req.admin?.adminId || null) : b.assigned_admin_id;
      if (v !== null && !isUuid(v)) return res.status(400).json({ success: false, message: 'Unknown admin' });
      patch.assigned_admin_id = v;
      patch.assigned_at = v ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ success: false, message: 'Nothing to update' });

    if (patch.status === 'resolved') patch.resolved_at = new Date().toISOString();

    const { data, error } = await db.from('support_conversations')
      .update(patch).eq('id', req.params.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });

    // Say so in the thread. A status that changes with no word to the customer is
    // how "resolved" becomes something that happened to them rather than for them.
    if (patch.status === 'resolved') {
      await addMessage(req.params.id, 'system', 'This conversation was marked resolved by the support team.');
    }
    // Resolved or closed means nobody is waiting on us — otherwise the queue keeps
    // counting it and the overdue email keeps listing it.
    if (patch.status === 'resolved' || patch.status === 'closed') {
      await supportAlerts.onAnswered(req.params.id);
    }
    return res.json({ success: true, data });
  }));

  console.log('[support] in-app support routes registered');
};
