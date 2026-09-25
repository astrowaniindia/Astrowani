// astrowani-backend/src/contactLeakRoutes.js
//
// Off-platform contact flags: recording (called from POST /api/chat/message) and the
// admin review queue. See sql/session_flags.sql and src/contactLeakDetector.js.
//
// recordChatFlag() NEVER throws and NEVER delays the message: it is called without
// await, and a missing table (unapplied migration) is logged once and ignored.

const { createClient } = require('@supabase/supabase-js');
const { analyze } = require('./contactLeakDetector');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

let warnedMissing = false;
const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));

/**
 * @param {{message:string, messageId?:string, sessionId?:string, senderRole:'astrologer'|'customer',
 *          astrologerId?:string, customerId?:string}} p
 */
async function recordChatFlag(p) {
  try {
    const r = analyze(p.message);
    if (!r.flagged) return;
    const { error } = await db.from('session_flags').insert([{
      source: 'chat',
      session_id: p.sessionId ? String(p.sessionId) : null,
      message_id: p.messageId ? String(p.messageId) : null,
      sender_role: p.senderRole,
      astrologer_id: p.astrologerId || null,
      customer_id: p.customerId || null,
      severity: r.severity,
      kinds: r.kinds,
      excerpt: String(p.message).slice(0, 500),
    }]);
    if (error && String(error.code) !== '23505') {
      if (isMissingTable(error)) {
        if (!warnedMissing) { warnedMissing = true; console.warn('[session_flags] table missing - run sql/session_flags.sql'); }
      } else {
        console.error('[session_flags] insert failed:', error.message);
      }
    }
  } catch (e) {
    console.error('[session_flags] record failed:', e.message);
  }
}

module.exports = function registerContactLeakRoutes(app) {
  const { requireAdmin } = require('./adminRoutes');
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[session_flags]', e.message);
    res.status(500).json({ success: false, message: 'Request failed' });
  });

  // Queue. ?status= (default pending), ?severity=, ?role=, ?astrologerId=
  app.get('/api/admin/session-flags', requireAdmin, h(async (req, res) => {
    const { status, severity, role, astrologerId } = req.query;
    let q = db.from('session_flags')
      .select('*, astrologers(first_name, last_name, phone_number), customers(name, mobile)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (status && status !== 'all') q = q.eq('status', status);
    if (severity && severity !== 'all') q = q.eq('severity', severity);
    if (role && role !== 'all') q = q.eq('sender_role', role);
    if (astrologerId) q = q.eq('astrologer_id', astrologerId);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true, data: [], repeat: [], tableMissing: true });
      throw error;
    }

    // Repeat offenders: astrologers with the most high-severity flags in 30 days.
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await db.from('session_flags')
      .select('astrologer_id, astrologers(first_name, last_name)')
      .eq('sender_role', 'astrologer').eq('severity', 'high')
      .neq('status', 'dismissed').gte('created_at', since).limit(2000);
    const tally = new Map();
    for (const r of recent || []) {
      if (!r.astrologer_id) continue;
      const cur = tally.get(r.astrologer_id) || {
        astrologerId: r.astrologer_id,
        name: `${r.astrologers?.first_name || ''} ${r.astrologers?.last_name || ''}`.trim(),
        count: 0,
      };
      cur.count += 1;
      tally.set(r.astrologer_id, cur);
    }
    const repeat = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    return res.json({ success: true, data: data || [], repeat });
  }));

  // Proof for one flag: the flagged message exactly as the sender typed it (the saved chat
  // copy has stars in place of the contact details), the conversation around it with real
  // names, and session details. Read-only.
  app.get('/api/admin/session-flags/:id/context', requireAdmin, h(async (req, res) => {
    const { data: flag, error } = await db.from('session_flags')
      .select('*, astrologers(first_name, last_name, phone_number), customers(name, mobile)')
      .eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!flag) return res.status(404).json({ success: false, message: 'Not found' });

    const astroName = `${flag.astrologers?.first_name || ''} ${flag.astrologers?.last_name || ''}`.trim() || 'Astrologer';
    const custName = flag.customers?.name || 'Customer';

    let session = null;
    let messages = [];
    if (flag.session_id) {
      const { data: sess } = await db.from('chat_sessions')
        .select('id, started_at, ended_at, per_minute_charge').eq('id', flag.session_id).maybeSingle();
      session = sess || null;
      const { data: msgs, error: mErr } = await db.from('chat_messages')
        .select('id, sender_id, message, created_at')
        .eq('session_id', flag.session_id).order('created_at', { ascending: true }).limit(300);
      if (mErr) throw mErr;
      messages = (msgs || []).map((m) => {
        const isFlagged = String(m.id) === String(flag.message_id);
        const fromAstro = String(m.sender_id) === String(flag.astrologer_id);
        return {
          id: m.id,
          from: fromAstro ? 'astrologer' : 'customer',
          name: fromAstro ? astroName : custName,
          created_at: m.created_at,
          isFlagged,
          // The saved copy is masked; show what was actually typed for the flagged one.
          message: isFlagged && flag.excerpt ? flag.excerpt : m.message,
          savedAs: isFlagged ? m.message : undefined,
        };
      });
    }
    // Call recordings for this session (each side's own microphone), with transcripts.
    let recordings = [];
    if (flag.session_id) {
      const { data: recs } = await db.from('call_recordings')
        .select('id, role, status, duration_ms, bytes, transcript, flagged, created_at, storage_key, error')
        .eq('session_id', flag.session_id).order('created_at', { ascending: true });
      recordings = (recs || []).map(({ storage_key, ...r }) => ({
        ...r,
        name: r.role === 'astrologer' ? astroName : custName,
        hasAudio: !!storage_key,
        isFlagged: String(r.id) === String(flag.message_id),
      }));
    }
    return res.json({
      success: true,
      data: {
        recordings,
        flag: {
          id: flag.id, source: flag.source, severity: flag.severity, kinds: flag.kinds,
          sender_role: flag.sender_role, created_at: flag.created_at, status: flag.status,
        },
        astrologer: { name: astroName, phone: flag.astrologers?.phone_number || null },
        customer: { name: custName, mobile: flag.customers?.mobile || null },
        session,
        messages,
      },
    });
  }));

  app.patch('/api/admin/session-flags/:id', requireAdmin, h(async (req, res) => {
    const { status, admin_note } = req.body || {};
    if (!['reviewed', 'actioned', 'dismissed', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const { data, error } = await db.from('session_flags')
      .update({ status, admin_note: admin_note || null, reviewed_at: status === 'pending' ? null : new Date().toISOString() })
      .eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data });
  }));
};

module.exports.recordChatFlag = recordChatFlag;
