// WhatsApp Cloud API webhook for the Wani Shop assistant.
//
// Meta's free tier fits this exactly: SERVICE conversations — where the customer
// messages first and we reply inside 24 hours — are not charged. Our flow is
// always customer-initiated (they tap a product in the app, WhatsApp opens with
// the message pre-filled, they send it), so it stays in that tier permanently.
// Nothing here should ever send an unsolicited template; that is what costs money
// and what gets a number rate-limited.
//
// Set these in the VPS process env, alongside SUPABASE_SERVICE_ROLE_KEY etc:
//   WHATSAPP_VERIFY_TOKEN     any random string; also typed into Meta's console
//   WHATSAPP_TOKEN            permanent access token for the WhatsApp app
//   WHATSAPP_PHONE_NUMBER_ID  the number's id (NOT the phone number itself)
//   WHATSAPP_APP_SECRET       app secret, used to verify each webhook signature
//   ANTHROPIC_API_KEY         the assistant's model access
//
// Every one of them is optional at boot: without them the routes answer with a
// clear "not configured" instead of crashing the server, so this can ship before
// the Meta account exists.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { generateReply } = require('./whatsappBot');
const { findCustomerByPhone } = require('./customerLookup');
const { makeCreateOrderTool } = require('./whatsappOrders');
const jwt = require('jsonwebtoken');

/** Astrologer id from the vendor JWT. Same shape as freeCallRoutes. */
function resolveAstrologerId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
    return decoded.astroId || decoded.vendorId || decoded.id || null;
  } catch (_) {
    return null;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GRAPH = 'https://graph.facebook.com/v21.0';

const configured = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[whatsapp] ${req.method} ${req.path}:`, err.message);
  // Meta retries any non-200 aggressively, and a retry storm on a bug is worse
  // than a dropped message. Always acknowledge; log the failure for us.
  if (!res.headersSent) res.sendStatus(200);
});

/** Send a plain text message back to a customer. */
async function sendText(waId, body) {
  if (!configured()) {
    console.warn('[whatsapp] not configured — would have sent:', body.slice(0, 80));
    return null;
  }
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: waId,
      type: 'text',
      text: { body: body.slice(0, 4096), preview_url: true },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[whatsapp] send failed', res.status, detail.slice(0, 300));
    return null;
  }
  return res.json();
}

/**
 * Verifies the webhook really came from Meta.
 *
 * Without this, anyone who learns the URL can impersonate any customer — and
 * this endpoint creates orders and payment links, so that is not theoretical.
 * Needs the RAW body: express.json() has already parsed and discarded the exact
 * bytes, so index.js gives this router a verify hook that stashes them.
 */
function signatureValid(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  // No secret configured = refuse everything rather than accept everything.
  if (!secret) return false;
  const header = req.get('x-hub-signature-256');
  if (!header || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Find or start the conversation for this number. */
async function getConversation(waId, profileName) {
  const { data: existing } = await db
    .from('whatsapp_conversations')
    .select('*')
    .eq('wa_id', waId)
    .maybeSingle();
  if (existing) return existing;

  // Link to a customer account when the number matches one. A stranger is still
  // served — plenty of people will message before they ever install the app.
  let customerId = null;
  try {
    const cust = await findCustomerByPhone(db, waId, 'id');
    if (cust) customerId = cust.id;
  } catch (_) { /* an unmatched number is normal, not an error */ }

  const { data: created, error } = await db
    .from('whatsapp_conversations')
    .insert([{ wa_id: waId, customer_id: customerId, display_name: profileName || null }])
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return created;
}

/**
 * The app pre-fills "[ref:<uuid>]" so the assistant opens already knowing which
 * product the customer was looking at. Stripped before the model sees the text —
 * it is plumbing, not something to answer.
 */
function extractRef(text) {
  const m = /\[ref:([0-9a-f-]{36})\]/i.exec(text || '');
  return {
    itemId: m ? m[1] : null,
    clean: (text || '').replace(/\[ref:[0-9a-f-]{36}\]/ig, '').trim(),
  };
}

module.exports = function registerWhatsAppRoutes(app) {
  /* ── Meta's webhook handshake ─────────────────────────────────────────────
   * Called once when the webhook URL is saved in the Meta console.
   */
  app.get('/api/whatsapp/webhook', (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!verifyToken) return res.sendStatus(503);
    if (
      req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === verifyToken
    ) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  });

  /* ── Incoming messages ────────────────────────────────────────────────────
   * Acknowledged IMMEDIATELY, then handled. Meta expects a 200 within seconds
   * and retries otherwise; the model call takes longer than that, so replying
   * inside the request would guarantee duplicate deliveries.
   */
  app.post('/api/whatsapp/webhook', h(async (req, res) => {
    if (!signatureValid(req)) {
      console.warn('[whatsapp] rejected a webhook with a bad or missing signature');
      return res.sendStatus(403);
    }
    res.sendStatus(200);

    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        for (const msg of change.value?.messages || []) {
          // Only text for now. A photo of a stone is a good future feature, but
          // answering it wrongly is worse than saying we cannot read it.
          if (msg.type !== 'text') {
            await sendText(msg.from, 'Sorry, I can only read text messages here. Could you type it?');
            continue;
          }
          const profileName = change.value?.contacts?.[0]?.profile?.name;
          await handleMessage({
            waId: msg.from,
            waMessageId: msg.id,
            text: msg.text?.body || '',
            profileName,
          }).catch((e) => console.error('[whatsapp] handleMessage:', e.message));
        }
      }
    }
  }));

  async function handleMessage({ waId, waMessageId, text, profileName }) {
    const convo = await getConversation(waId, profileName);
    const { itemId, clean } = extractRef(text);

    // Meta redelivers on any hiccup. The unique index on wa_message_id is what
    // actually makes this safe — a duplicate insert fails and we stop, rather
    // than answering (and charging for) the same message twice.
    const { error: dupErr } = await db.from('whatsapp_messages').insert([{
      conversation_id: convo.id,
      role: 'customer',
      body: clean,
      wa_message_id: waMessageId,
    }]);
    if (dupErr) {
      if (dupErr.code === '23505') return; // already handled
      throw new Error(dupErr.message);
    }

    const patch = { last_message_at: new Date().toISOString() };
    if (itemId) patch.context_item_id = itemId;
    // A customer coming back from the app with a fresh product link is starting
    // a new errand; take it back from a closed conversation, but never interrupt
    // an astrologer who is mid-conversation.
    if (convo.handled_by === 'closed') patch.handled_by = 'bot';
    await db.from('whatsapp_conversations').update(patch).eq('id', convo.id);

    if (convo.handled_by === 'astrologer') {
      // A human owns this thread. Staying quiet is the whole point.
      return;
    }

    const { data: history } = await db
      .from('whatsapp_messages')
      .select('role, body')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: true })
      .limit(40);

    // Give the model the product context as a system note rather than pretending
    // the customer typed it.
    let opening = clean;
    if (itemId && (!history || history.length <= 1)) {
      opening = `${clean}\n\n(The customer opened this chat from item ${itemId} in the app.)`;
    }

    const reply = await generateReply({
      conversationId: convo.id,
      history: (history || []).slice(0, -1),
      userMessage: opening,
      // Bound to THIS conversation, so the model cannot create an order against
      // somebody else's chat even if it is handed a stray id.
      createPaymentLink: makeCreateOrderTool(convo),
    });

    await db.from('whatsapp_messages').insert([{
      conversation_id: convo.id,
      role: 'bot',
      body: reply.text,
    }]);
    await sendText(waId, reply.text);
  }

  /* -- Vendor: the WhatsApp customers assigned to ME -----------------------
   * Scoped by the astrologer id inside the JWT, never a query param: these
   * threads carry customers' phone numbers and whatever personal detail they
   * typed into a consultation.
   */
  app.get('/api/vendor/whatsapp/conversations', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { data, error } = await db
      .from('whatsapp_conversations')
      .select('*')
      .eq('astrologer_id', astrologerId)
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (error) return res.status(200).json({ success: true, conversations: [], tableMissing: true });

    const rows = data || [];
    // "Waiting" = handed over and I have not replied since. That count drives the
    // drawer badge, so it has to mean "needs me now", not "I once handled this".
    const waiting = [];
    for (const c of rows.filter((r) => r.handled_by === 'astrologer' && r.escalated_at)) {
      const { data: mine } = await db
        .from('whatsapp_messages')
        .select('id')
        .eq('conversation_id', c.id)
        .eq('role', 'astrologer')
        .gte('created_at', c.escalated_at)
        .limit(1);
      if (!mine || !mine.length) waiting.push(c.id);
    }

    return res.status(200).json({
      success: true,
      waitingCount: waiting.length,
      conversations: rows.map((c) => ({
        id: c.id,
        name: c.display_name || c.wa_id,
        phone: c.wa_id,
        handledBy: c.handled_by,
        escalatedAt: c.escalated_at,
        lastMessageAt: c.last_message_at,
        waiting: waiting.includes(c.id),
      })),
    });
  }));

  app.get('/api/vendor/whatsapp/conversations/:id/messages', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // The astrologer_id filter IS the authorisation check: somebody else's
    // conversation simply returns nothing.
    const { data: convo } = await db
      .from('whatsapp_conversations')
      .select('id, display_name, wa_id, handled_by')
      .eq('id', req.params.id)
      .eq('astrologer_id', astrologerId)
      .maybeSingle();
    if (!convo) return res.status(404).json({ success: false, message: 'Not found' });

    const { data: messages } = await db
      .from('whatsapp_messages')
      .select('id, role, body, created_at')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: true })
      .limit(200);

    return res.status(200).json({
      success: true,
      conversation: {
        id: convo.id,
        name: convo.display_name || convo.wa_id,
        phone: convo.wa_id,
        handledBy: convo.handled_by,
      },
      messages: messages || [],
    });
  }));

  app.post('/api/vendor/whatsapp/conversations/:id/reply', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const body = String(req.body?.text || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'Nothing to send' });

    const { data: convo } = await db
      .from('whatsapp_conversations')
      .select('id, wa_id')
      .eq('id', req.params.id)
      .eq('astrologer_id', astrologerId)
      .maybeSingle();
    if (!convo) return res.status(404).json({ success: false, message: 'Not found' });

    const sent = await sendText(convo.wa_id, body);
    if (!sent) return res.status(503).json({ success: false, message: 'WhatsApp is not connected yet.' });

    await db.from('whatsapp_messages').insert([{
      conversation_id: convo.id, role: 'astrologer', body,
    }]);
    // Recording the reply is what stops the unanswered-escalation sweep moving
    // this customer on to somebody else.
    await db.from('whatsapp_conversations')
      .update({ handled_by: 'astrologer', last_message_at: new Date().toISOString() })
      .eq('id', convo.id);
    return res.status(200).json({ success: true });
  }));

  /* -- Vendor: I'm done, the assistant can take it back ------------------- */
  app.post('/api/vendor/whatsapp/conversations/:id/release', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { data } = await db
      .from('whatsapp_conversations')
      .update({ handled_by: 'bot', astrologer_id: null, escalated_at: null })
      .eq('id', req.params.id)
      .eq('astrologer_id', astrologerId)
      .select('id')
      .maybeSingle();
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    return res.status(200).json({ success: true });
  }));

  /* -- Admin: read the conversations ----------------------------------------
   * Registered by index.js behind requireAdmin.
   */
  app.get('/api/admin/whatsapp/conversations', require('./adminRoutes').requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('whatsapp_conversations')
      .select('*')
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (error) {
      // Table not created yet is a "run the migration", not a server fault.
      return res.status(200).json({ success: true, conversations: [], tableMissing: true });
    }
    return res.status(200).json({ success: true, conversations: data || [] });
  }));

  app.get('/api/admin/whatsapp/conversations/:id/messages', require('./adminRoutes').requireAdmin, h(async (req, res) => {
    const { data } = await db
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });
    return res.status(200).json({ success: true, messages: data || [] });
  }));

  /* ── Admin/astrologer: reply into a conversation by hand ──────────────── */
  app.post('/api/admin/whatsapp/conversations/:id/reply', require('./adminRoutes').requireAdmin, h(async (req, res) => {
    const body = String(req.body?.text || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'Nothing to send' });

    const { data: convo } = await db
      .from('whatsapp_conversations')
      .select('id, wa_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!convo) return res.status(404).json({ success: false, message: 'No such conversation' });

    const sent = await sendText(convo.wa_id, body);
    if (!sent) return res.status(503).json({ success: false, message: 'WhatsApp is not configured yet.' });

    await db.from('whatsapp_messages').insert([{
      conversation_id: convo.id, role: 'astrologer', body,
    }]);
    // A human replying takes ownership; the bot stops talking over them.
    await db.from('whatsapp_conversations')
      .update({ handled_by: 'astrologer', last_message_at: new Date().toISOString() })
      .eq('id', convo.id);
    return res.status(200).json({ success: true });
  }));

  /* ── Admin: give the thread back to the bot ──────────────────────────── */
  app.post('/api/admin/whatsapp/conversations/:id/release', require('./adminRoutes').requireAdmin, h(async (req, res) => {
    await db.from('whatsapp_conversations')
      .update({ handled_by: 'bot', astrologer_id: null })
      .eq('id', req.params.id);
    return res.status(200).json({ success: true });
  }));
};

module.exports.sendText = sendText;
