// Telling the TEAM that somebody is waiting on support.
//
// WHY THIS EXISTS. Measured on production 2026-11-14: 75 support conversations
// were waiting on a person, the oldest since 2026-09-04, and 74 of them had never
// received a single human reply. The ones that were answered waited ~40 hours.
// The cause was not effort — it was that NOTHING TOLD ANYONE. The admin inbox
// polled, but only while somebody had it open, and the app promised the customer
// "someone will reply by 4:30pm" with no human anywhere aware of the promise.
//
// WHAT IT DOES, and why it is split by priority (the same reasoning as
// paymentFailureAlerts.js — an alert stream that emails everything gets muted, and
// then the urgent ones are buried with the rest):
//
//   urgent / high   an email NOW. Lost money, lockout, safety, a refund, someone
//                   explicitly asking for a human. Throttled per conversation so a
//                   customer typing five lines in a row is one email, not five.
//   normal / low    no immediate email. They appear in the "queue" email, sent at
//                   most once an hour and only when something NEW started waiting.
//   overdue         once per wait, when the SLA we promised the customer passes
//                   without an answer — whatever the priority. That promise was
//                   made in our name.
//
// NEVER THROWS. Every entry point is called from a request handler or a timer,
// and a failed alert must never fail the customer's message.

const { createClient } = require('@supabase/supabase-js');
const mailer = require('./mailer');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADMIN_INBOX_URL = (process.env.ADMIN_DASHBOARD_URL || 'https://manu.astrowani.com').replace(/\/+$/, '') + '/support-inbox';
const IMMEDIATE = new Set(['urgent', 'high']);
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const PER_CONVERSATION_GAP_MS = 20 * 60 * 1000;   // one immediate email per conversation per 20 min
const QUEUE_EMAIL_GAP_MS = 60 * 60 * 1000;        // the queue email, at most hourly
const STATE_KEY = 'support_alert_state';
const DEFAULT_SLA_MINUTES = { urgent: 15, high: 60, normal: 240, low: 1440 };

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Triage ─────────────────────────────────────────────────────────────────

// Words that mean money, access or safety, in English, Hinglish and Hindi. Used
// ONLY to raise a priority, never to lower one: the bot's own classification
// stays the floor. A missed "paise kat gaye" sitting at 'normal' for four hours is
// the exact failure this is for; an over-eager 'high' costs one extra email.
const URGENT_TERMS = [
  /\bfraud\b/i, /\bscam\b/i, /\bharass/i, /\bthreat/i, /\babus/i, /\bblackmail/i,
  /\bpolice\b/i, /\bconsumer court\b/i, /\blegal action\b/i,
  /धमकी/, /धोखा/, /पुलिस/,
];
const HIGH_TERMS = [
  /\brefund/i, /\bdeduct/i, /\bcharged\b/i, /\bdebited\b/i, /\bpayment\b/i, /\bwallet\b/i,
  /\bmoney\b/i, /\bpaise?\b/i, /\bpaisa\b/i, /\brs\.?\s?\d/i, /₹\s?\d/, /\bupi\b/i,
  /\bkat (gaye|gya|gaya|liya|liye)\b/i, /\bwapas\b/i, /\bwithdraw/i, /\bpayout/i,
  /\bnot received\b/i, /\bblocked\b/i, /\bcan'?t (log ?in|login|open)\b/i, /\botp\b/i,
  /पैसे/, /पैसा/, /रिफंड/, /कट गए/, /वापस/, /भुगतान/,
];

/** The higher of the current priority and what the text implies. Pure. */
function triagePriority(text, current = 'normal') {
  const cur = PRIORITY_RANK[current] != null ? current : 'normal';
  const s = String(text || '');
  let implied = null;
  if (URGENT_TERMS.some((re) => re.test(s))) implied = 'urgent';
  else if (HIGH_TERMS.some((re) => re.test(s))) implied = 'high';
  if (!implied) return cur;
  return PRIORITY_RANK[implied] < PRIORITY_RANK[cur] ? implied : cur;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function partyNames(rows) {
  const names = {};
  const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  const astroIds = [...new Set(rows.map((r) => r.astrologer_id).filter(Boolean))];
  try {
    if (custIds.length) {
      const { data } = await db.from('customers').select('id, name, mobile').in('id', custIds.slice(0, 150));
      (data || []).forEach((x) => { names[x.id] = { name: x.name || 'Customer', phone: x.mobile || '' }; });
    }
    if (astroIds.length) {
      const { data } = await db.from('astrologers').select('id, first_name, last_name, phone_number').in('id', astroIds.slice(0, 150));
      (data || []).forEach((x) => {
        names[x.id] = { name: `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Astrologer', phone: x.phone_number || '' };
      });
    }
  } catch (_) { /* names are a nicety */ }
  return names;
}

function waitedLabel(sinceIso, now = Date.now()) {
  if (!sinceIso) return '';
  const m = Math.max(0, Math.round((now - new Date(sinceIso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

async function getSetting(key) {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
    return data?.value ?? null;
  } catch (_) { return null; }
}

async function slaMap() {
  const raw = await getSetting('support_sla_minutes');
  try {
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    if (parsed && typeof parsed === 'object') return { ...DEFAULT_SLA_MINUTES, ...parsed };
  } catch (_) {}
  return DEFAULT_SLA_MINUTES;
}

async function readState() {
  const raw = await getSetting(STATE_KEY);
  try { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; } catch (_) { return {}; }
}
async function writeState(state) {
  try {
    await db.from('app_settings').upsert({ key: STATE_KEY, value: JSON.stringify(state) }, { onConflict: 'key' });
  } catch (e) { console.warn('[supportAlerts] state write failed:', e?.message); }
}

// ── The two entry points from supportRoutes.js ──────────────────────────────

/**
 * It is now OUR turn to answer this conversation.
 *
 * Called after an escalation, a reopen, and every message the person sends into a
 * conversation a human owns. Stamps `awaiting_reply_since` (keeping the EARLIEST —
 * the wait started with the first unanswered message, not the latest), raises the
 * priority if the words call for it, and emails now when the priority is urgent or
 * high.
 *
 * @returns {Promise<{alerted:boolean, priority?:string, reason?:string}>}
 */
async function onAwaitingReply(conversationId, { message = '', trigger = 'message' } = {}) {
  try {
    const { data: conv } = await db.from('support_conversations')
      .select('*').eq('id', conversationId).maybeSingle();
    if (!conv) return { alerted: false, reason: 'not_found' };

    // "Talk to a person" carries no text of its own; the last thing they wrote is
    // both the best triage signal and what the email should show.
    if (!message) {
      const { data: last } = await db.from('support_messages').select('body')
        .eq('conversation_id', conv.id).eq('sender', 'user')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      message = last?.body || '';
    }

    const nowIso = new Date().toISOString();
    const priority = triagePriority(message, conv.priority);
    const patch = {};
    if (!conv.awaiting_reply_since) patch.awaiting_reply_since = nowIso;
    if (priority !== conv.priority) patch.priority = priority;

    const lastAlert = conv.team_alerted_at ? new Date(conv.team_alerted_at).getTime() : 0;
    const shouldEmail = IMMEDIATE.has(priority) && Date.now() - lastAlert > PER_CONVERSATION_GAP_MS;
    if (shouldEmail) patch.team_alerted_at = nowIso;

    if (Object.keys(patch).length) {
      const { error } = await db.from('support_conversations').update(patch).eq('id', conv.id);
      // Not migrated: the columns do not exist. Do not email from a half-state.
      if (error) { console.warn('[supportAlerts] update failed:', error.message); return { alerted: false, reason: 'update_failed' }; }
    }
    if (!shouldEmail) return { alerted: false, priority, reason: IMMEDIATE.has(priority) ? 'throttled' : 'queued_for_digest' };

    const names = await partyNames([conv]);
    const who = names[conv.customer_id || conv.astrologer_id] || { name: conv.app === 'vendor' ? 'Astrologer' : 'Customer', phone: '' };
    const kind = conv.app === 'vendor' ? 'Astrologer' : 'Customer';
    const what = trigger === 'escalated' ? 'needs a person'
      : trigger === 'reopened' ? 'came back after "resolved"'
        : 'wrote again';
    const subject = `${priority === 'urgent' ? '🔴 URGENT' : '🟠 Support'}: ${kind} ${who.name} ${what}`;
    const html = `
      <p><strong>${esc(kind)} ${esc(who.name)}</strong>${who.phone ? ` (${esc(who.phone)})` : ''} ${esc(what)}.</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td style="color:#666">Priority</td><td><strong>${esc(priority)}</strong></td></tr>
        <tr><td style="color:#666">Category</td><td>${esc(conv.category || '—')}</td></tr>
        ${conv.escalation_reason ? `<tr><td style="color:#666">Why</td><td>${esc(conv.escalation_reason)}</td></tr>` : ''}
        ${conv.first_response_due_at && !conv.first_human_response_at
    ? `<tr><td style="color:#666">We promised a reply by</td><td>${esc(new Date(conv.first_response_due_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))}</td></tr>`
    : ''}
      </table>
      ${message ? `<p style="background:#f6f1ec;padding:10px 12px;border-radius:8px;white-space:pre-wrap">${esc(String(message).slice(0, 600))}</p>` : ''}
      <p><a href="${ADMIN_INBOX_URL}?c=${encodeURIComponent(conv.id)}">Open it in the Support Inbox →</a></p>`;
    const res = await mailer.sendAlertEmail({ subject, html });
    return { alerted: !!res.sent, priority, reason: res.sent ? undefined : (res.skipped || 'send_failed') };
  } catch (e) {
    console.warn('[supportAlerts] onAwaitingReply failed:', e?.message);
    return { alerted: false, reason: 'error' };
  }
}

/** A person answered, or it was resolved: nobody is waiting on us any more. */
async function onAnswered(conversationId) {
  try {
    await db.from('support_conversations')
      .update({ awaiting_reply_since: null, overdue_alerted_at: null })
      .eq('id', conversationId);
  } catch (e) {
    console.warn('[supportAlerts] onAnswered failed:', e?.message);
  }
}

// ── The periodic queue email ────────────────────────────────────────────────

/**
 * One email covering everything waiting, sent when there is a reason to:
 *   - a conversation became OVERDUE (its SLA passed) since the last reminder, or
 *   - a normal/low conversation started waiting since the last queue email.
 * At most once an hour. Lists the whole queue, worst first, so the email is the
 * to-do list rather than a pointer to one.
 */
async function runQueueCheck({ now = Date.now(), force = false } = {}) {
  try {
    const { data: rows, error } = await db.from('support_conversations')
      .select('id, app, customer_id, astrologer_id, priority, category, status, escalation_reason, first_response_due_at, first_human_response_at, awaiting_reply_since, overdue_alerted_at')
      .not('awaiting_reply_since', 'is', null)
      .order('awaiting_reply_since', { ascending: true })
      .limit(500);
    if (error) return { sent: false, reason: 'read_failed' };
    if (!rows?.length) return { sent: false, reason: 'empty' };

    const sla = await slaMap();
    const isOverdue = (r) => {
      // A first response has its own stored deadline; a follow-up is measured from
      // when this wait began, against the same priority's SLA.
      if (!r.first_human_response_at && r.first_response_due_at) return new Date(r.first_response_due_at).getTime() < now;
      const mins = Number(sla[r.priority]) || DEFAULT_SLA_MINUTES.normal;
      return new Date(r.awaiting_reply_since).getTime() + mins * 60000 < now;
    };
    const newlyOverdue = rows.filter((r) => isOverdue(r)
      && (!r.overdue_alerted_at || new Date(r.overdue_alerted_at) < new Date(r.awaiting_reply_since)));

    const state = await readState();
    const lastSent = state.lastQueueEmailAt ? new Date(state.lastQueueEmailAt).getTime() : 0;
    const newQuiet = rows.filter((r) => !IMMEDIATE.has(r.priority)
      && new Date(r.awaiting_reply_since).getTime() > lastSent);

    if (!force) {
      if (!newlyOverdue.length && !newQuiet.length) return { sent: false, reason: 'nothing_new' };
      if (now - lastSent < QUEUE_EMAIL_GAP_MS) return { sent: false, reason: 'too_soon' };
    }

    const sorted = [...rows].sort((a, b) => {
      const oa = isOverdue(a) ? 0 : 1; const ob = isOverdue(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const pa = PRIORITY_RANK[a.priority] ?? 2; const pb = PRIORITY_RANK[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.awaiting_reply_since) - new Date(b.awaiting_reply_since);
    });
    const shown = sorted.slice(0, 30);
    const names = await partyNames(shown);
    const overdueCount = rows.filter(isOverdue).length;
    const urgentCount = rows.filter((r) => r.priority === 'urgent').length;

    const subject = `Support queue: ${rows.length} waiting on us`
      + (overdueCount ? ` · ${overdueCount} overdue` : '')
      + (urgentCount ? ` · ${urgentCount} urgent` : '');
    const html = `
      <p><strong>${rows.length}</strong> conversation${rows.length === 1 ? ' is' : 's are'} waiting for a reply from the team.
      ${overdueCount ? `<strong style="color:#b42318">${overdueCount}</strong> are past the time we promised.` : ''}</p>
      <table cellpadding="6" style="border-collapse:collapse;font-size:13px">
        <tr style="color:#666;text-align:left"><th>Who</th><th>Priority</th><th>Topic</th><th>Waiting</th><th></th></tr>
        ${shown.map((r) => {
    const who = names[r.customer_id || r.astrologer_id] || { name: '—' };
    return `<tr>
            <td>${esc(who.name)} <span style="color:#888">(${r.app === 'vendor' ? 'astrologer' : 'customer'})</span></td>
            <td><strong>${esc(r.priority)}</strong></td>
            <td>${esc(r.category || '—')}</td>
            <td>${esc(waitedLabel(r.awaiting_reply_since, now))}${isOverdue(r) ? ' <span style="color:#b42318">overdue</span>' : ''}</td>
            <td><a href="${ADMIN_INBOX_URL}?c=${encodeURIComponent(r.id)}">open</a></td>
          </tr>`;
  }).join('')}
      </table>
      ${rows.length > shown.length ? `<p style="color:#666">…and ${rows.length - shown.length} more.</p>` : ''}
      <p><a href="${ADMIN_INBOX_URL}">Open the Support Inbox →</a></p>`;

    const res = await mailer.sendAlertEmail({ subject, html });
    if (!res.sent) return { sent: false, reason: res.skipped || 'send_failed' };

    const stampIso = new Date(now).toISOString();
    await writeState({ ...state, lastQueueEmailAt: stampIso });
    if (newlyOverdue.length) {
      const ids = newlyOverdue.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 150) {
        await db.from('support_conversations').update({ overdue_alerted_at: stampIso }).in('id', ids.slice(i, i + 150));
      }
    }
    return { sent: true, waiting: rows.length, overdue: overdueCount, newlyOverdue: newlyOverdue.length };
  } catch (e) {
    console.warn('[supportAlerts] queue check failed:', e?.message);
    return { sent: false, reason: 'error' };
  }
}

/** Counts for the admin sidebar badge. */
async function queueSummary(now = Date.now()) {
  const { data, error } = await db.from('support_conversations')
    .select('id, priority, first_response_due_at, first_human_response_at, awaiting_reply_since')
    .not('awaiting_reply_since', 'is', null)
    .limit(1000);
  if (error) throw error;
  const rows = data || [];
  const sla = await slaMap();
  const overdue = rows.filter((r) => {
    if (!r.first_human_response_at && r.first_response_due_at) return new Date(r.first_response_due_at).getTime() < now;
    return new Date(r.awaiting_reply_since).getTime() + (Number(sla[r.priority]) || 240) * 60000 < now;
  }).length;
  const newest = rows.reduce((m, r) => (r.awaiting_reply_since > m ? r.awaiting_reply_since : m), '');
  return {
    waiting: rows.length,
    urgent: rows.filter((r) => r.priority === 'urgent').length,
    high: rows.filter((r) => r.priority === 'high').length,
    overdue,
    newestWaitingAt: newest || null,
  };
}

let ticker = null;
/** Production only (ENABLE_SESSION_MANAGER), so a laptop booting the backend
 *  cannot email the team about the production queue. */
function start(intervalMs = 5 * 60 * 1000) {
  if (ticker) return ticker;
  if (process.env.ENABLE_SESSION_MANAGER !== 'true') {
    console.log('[supportAlerts] not started (ENABLE_SESSION_MANAGER is not true)');
    return null;
  }
  ticker = setInterval(() => { runQueueCheck().catch(() => {}); }, intervalMs);
  ticker.unref();
  setTimeout(() => { runQueueCheck().catch(() => {}); }, 60 * 1000).unref();
  console.log('[supportAlerts] queue check every', Math.round(intervalMs / 60000), 'min');
  return ticker;
}

module.exports = {
  triagePriority, onAwaitingReply, onAnswered, runQueueCheck, queueSummary, start,
  waitedLabel, ADMIN_INBOX_URL,
};
