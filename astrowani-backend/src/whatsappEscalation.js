// Handing a WhatsApp conversation to a real astrologer, and making sure somebody
// actually knows about it.
//
// An escalation that only sets a flag is worse than no escalation at all: the
// customer has been told a person is coming and nobody has been told to come.
// So assigning and notifying happen together, and an unanswered one is chased.
//
// Least-loaded, not round-robin — the same rule the free-call bookings use, for
// the same reason: a round-robin cursor drifts out of balance permanently the
// first time someone ignores one, while least-loaded self-corrects and copes
// with people joining or leaving the pool.

const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// How long an assigned conversation may sit with no astrologer reply before it
// is handed to the next person. Long enough that someone mid-call isn't robbed
// of it, short enough that a customer isn't left staring at "connecting you".
const REASSIGN_AFTER_MS = 10 * 60 * 1000;

/** The astrologers an admin has put on WhatsApp support duty. */
async function loadPool() {
  try {
    const { data } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'whatsapp_support_astrologer_ids')
      .maybeSingle();
    if (!data?.value) return [];
    const ids = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Pool members who can actually take work, emptiest first.
 *
 * Suspended or unapproved astrologers are dropped — the same filter the
 * free-call pool applies, so someone removed from the platform cannot be handed
 * a live customer.
 */
async function candidates(excludeIds = []) {
  const poolIds = await loadPool();
  if (!poolIds.length) return [];

  const { data: astros } = await db
    .from('astrologers')
    .select('id, first_name, last_name, fcm_token, approval_status, is_suspended')
    .in('id', poolIds);

  const usable = (astros || []).filter(
    (a) => a.approval_status === 'approved' && !a.is_suspended && !excludeIds.includes(a.id),
  );
  if (!usable.length) return [];

  // Count what each already holds. Only open threads count — finished work must
  // not keep pushing customers away from someone forever.
  const { data: open } = await db
    .from('whatsapp_conversations')
    .select('astrologer_id')
    .eq('handled_by', 'astrologer')
    .in('astrologer_id', usable.map((a) => a.id));

  const load = new Map(usable.map((a) => [a.id, 0]));
  (open || []).forEach((c) => {
    if (load.has(c.astrologer_id)) load.set(c.astrologer_id, load.get(c.astrologer_id) + 1);
  });

  return [...usable].sort((a, b) => load.get(a.id) - load.get(b.id));
}

// astrologers has first_name/last_name — there is no `name` column, despite
// several other modules selecting one (it errors, the row comes back null, and
// the caller quietly falls back).
const fullName = (a) =>
  ([a?.first_name, a?.last_name].filter(Boolean).join(' ') || 'Astrologer').trim();

/**
 * Assign an escalated conversation and tell the astrologer.
 *
 * Never throws. A failure to notify must not stop the handover being recorded —
 * an assigned-but-unnotified thread is still visible in the vendor app and to
 * the admin, whereas a thrown error would leave the customer mid-sentence.
 *
 * Returns { assigned, astrologerId, astrologerName }.
 */
async function assignEscalation(conversationId, reason, excludeIds = []) {
  const patch = {
    handled_by: 'astrologer',
    escalated_at: new Date().toISOString(),
  };

  let chosen = null;
  try {
    const list = await candidates(excludeIds);
    chosen = list[0] || null;
  } catch (e) {
    console.error('[whatsappEscalation] could not pick an astrologer:', e.message);
  }

  // No pool configured, or nobody usable in it. Still mark it for a human — the
  // admin's queue is the backstop, and leaving it with the bot would have the
  // assistant carry on after telling the customer a person was coming.
  patch.astrologer_id = chosen ? chosen.id : null;

  await db.from('whatsapp_conversations').update(patch).eq('id', conversationId);
  await db.from('whatsapp_messages').insert([{
    conversation_id: conversationId,
    role: 'system',
    body: chosen
      ? `Escalated to ${fullName(chosen)}: ${reason || 'customer asked for a person'}`
      : `Escalated, but NOBODY is on WhatsApp support duty: ${reason || 'customer asked for a person'}`,
  }]);

  if (!chosen) {
    console.warn('[whatsappEscalation] no astrologer available — set whatsapp_support_astrologer_ids in the admin');
    return { assigned: false, astrologerId: null, astrologerName: null };
  }

  await notify(chosen, conversationId, reason);
  return { assigned: true, astrologerId: chosen.id, astrologerName: fullName(chosen) };
}

async function notify(astro, conversationId, reason) {
  if (!astro.fcm_token) return;
  try {
    const { data: convo } = await db
      .from('whatsapp_conversations')
      .select('display_name, wa_id')
      .eq('id', conversationId)
      .maybeSingle();
    const who = convo?.display_name || convo?.wa_id || 'A customer';
    await sendPush(astro.fcm_token, {
      data: {
        type: 'whatsapp_escalation',
        conversationId: String(conversationId),
        // title/body are required or the vendor app renders nothing — its
        // showLocalNotification returns early without a body.
        title: `${who} needs an astrologer`,
        body: String(reason || 'They asked to speak to a person.').slice(0, 180),
      },
    });
  } catch (e) {
    console.error('[whatsappEscalation] push failed:', e.message);
  }
}

/**
 * Chase escalations nobody has answered.
 *
 * Run from sessionManager's poll, alongside the missed-request and overdue
 * free-call sweeps. Reassigns to the next-emptiest astrologer, excluding whoever
 * has already had their chance — so a thread moves through the pool rather than
 * dying with the first person who was busy.
 *
 * Never throws: this runs on a timer next to billing, and must not take that
 * loop down with it.
 */
async function chaseUnansweredEscalations() {
  try {
    const cutoff = new Date(Date.now() - REASSIGN_AFTER_MS).toISOString();
    const { data: stale } = await db
      .from('whatsapp_conversations')
      .select('id, astrologer_id, escalated_at')
      .eq('handled_by', 'astrologer')
      .not('escalated_at', 'is', null)
      .lt('escalated_at', cutoff);
    if (!stale || !stale.length) return;

    for (const convo of stale) {
      // Has the assigned astrologer actually said anything since it landed?
      const { data: replies } = await db
        .from('whatsapp_messages')
        .select('id')
        .eq('conversation_id', convo.id)
        .eq('role', 'astrologer')
        .gte('created_at', convo.escalated_at)
        .limit(1);
      if (replies && replies.length) continue; // answered, leave it alone

      const exclude = convo.astrologer_id ? [convo.astrologer_id] : [];
      const result = await assignEscalation(
        convo.id,
        'Reassigned — no reply from the previous astrologer',
        exclude,
      );
      if (result.assigned) {
        console.log(`[whatsappEscalation] ${convo.id} reassigned to ${result.astrologerName}`);
      } else {
        // Everyone has had a turn, or the pool is empty. Stop churning and leave
        // it for the admin, who can see it in the conversations list.
        console.warn(`[whatsappEscalation] ${convo.id} is still unanswered and nobody is left to take it`);
      }
    }
  } catch (err) {
    console.error('[whatsappEscalation] chase failed:', err.message);
  }
}

module.exports = { assignEscalation, chaseUnansweredEscalations, candidates, loadPool, fullName };
