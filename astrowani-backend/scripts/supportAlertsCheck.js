// Support alerts: does the TEAM find out, and does the queue say who is waiting?
//
//   node --env-file=.env scripts/supportAlertsCheck.js
//
// index.js is NEVER booted (it starts the billing worker against production).
// Only src/supportRoutes.js is mounted on a bare Express app on an ephemeral port,
// and the real routes are driven over HTTP with signed JWTs, so what is asserted
// is what a customer and an admin actually experience — not the helper in
// isolation. The mailer is stubbed BEFORE supportAlerts.js is required, so no email
// leaves this machine and every email that WOULD have been sent is captured.
//
// Synthetic customer on the no-SMS QA number 9123450004, created and removed here.
// Every negative check is paired with a positive control.

if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) {}
}
const path = require('path');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// ── stub the mailer ────────────────────────────────────────────────────────
const sent = [];
const mailerPath = require.resolve(path.join(__dirname, '..', 'src', 'mailer.js'));
require.cache[mailerPath] = {
  id: mailerPath, filename: mailerPath, loaded: true,
  exports: {
    isConfigured: () => true,
    recipients: () => ['test@example.invalid'],
    parseSender: () => ({}),
    sendAlertEmail: async (m) => { sent.push(m); return { sent: true, id: `stub-${sent.length}` }; },
  },
};
// and push, so no real phone is buzzed
const pushPath = require.resolve(path.join(__dirname, '..', 'src', 'push.js'));
const pushed = [];
require.cache[pushPath] = {
  id: pushPath, filename: pushPath, loaded: true,
  exports: { sendPush: async (tokens, opts) => { pushed.push({ tokens, opts }); return { successCount: 1, failureCount: 0 }; } },
};

const supportAlerts = require('../src/supportAlerts');
const registerSupportRoutes = require('../src/supportRoutes');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const QA_PHONE = '9123450004';
let pass = 0; let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}${extra ? `  — ${extra}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(200); }
  return fn();
};

async function main() {
  console.log('\n1. triage (pure)');
  const T = supportAlerts.triagePriority;
  ok('plain question stays normal', T('how do I change my language', 'normal') === 'normal');
  ok('"paise kat gaye" -> high', T('mere paise kat gaye but chat nahi hua', 'normal') === 'high');
  ok('"₹500 deducted" -> high', T('₹500 deducted from wallet', 'normal') === 'high');
  ok('Hindi पैसे -> high', T('मेरे पैसे वापस करो', 'normal') === 'high');
  ok('fraud -> urgent', T('this is a fraud astrologer', 'normal') === 'urgent');
  ok('never LOWERS urgent', T('hello', 'urgent') === 'urgent');
  ok('high stays high on a money word (no downgrade from urgent rule)', T('refund please', 'high') === 'high');
  ok('low raised by money word', T('payment failed', 'low') === 'high');
  ok('unknown current treated as normal', T('hi', 'banana') === 'normal');

  // ── fixtures ──
  const { data: existing } = await db.from('customers').select('id').eq('mobile', QA_PHONE);
  if (existing?.length) throw new Error(`QA number ${QA_PHONE} already has a customer row — refusing to run`);
  const { data: made, error: mkErr } = await db.from('customers')
    .insert([{ name: 'Support Alerts Check', mobile: QA_PHONE, wallet_balance: 0 }]).select('id');
  if (mkErr) throw mkErr;
  const customerId = made[0].id;
  const { data: admin } = await db.from('admins').select('id').limit(1).maybeSingle();
  if (!admin) throw new Error('no admin row');
  const custTok = jwt.sign({ userId: customerId, phone: QA_PHONE }, process.env.JWT_SECRET);
  const adminTok = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET);

  const app = express(); app.use(express.json());
  registerSupportRoutes(app);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, tok, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  };
  const convRow = async (id) => (await db.from('support_conversations').select('*').eq('id', id).maybeSingle()).data;

  const created = [];
  const testStartIso = new Date().toISOString();
  try {
    console.log('\n2. a new conversation with the bot is NOT waiting on us (control)');
    const c1 = await call('POST', '/api/support/conversations', custTok, {});
    ok('created', c1.status === 200 && c1.json?.data?.id, JSON.stringify(c1.json));
    const id = c1.json.data.id; created.push(id);
    ok('not waiting yet', !(await convRow(id)).awaiting_reply_since);
    ok('no email yet', sent.length === 0);

    console.log('\n3. "talk to a person" -> waiting, and the team is emailed');
    await call('POST', `/api/support/conversations/${id}/messages`, custTok, { body: 'mere ₹500 kat gaye chat ke bina' });
    const esc = await call('POST', `/api/support/conversations/${id}/escalate`, custTok, {});
    ok('escalate 200', esc.status === 200);
    const r1 = await waitFor(async () => { const r = await convRow(id); return r?.awaiting_reply_since ? r : null; });
    ok('awaiting_reply_since stamped', !!r1?.awaiting_reply_since);
    ok('priority high or urgent', ['high', 'urgent'].includes(r1?.priority), r1?.priority);
    await waitFor(async () => sent.length > 0);
    ok('exactly one immediate email', sent.length === 1, `got ${sent.length}`);
    ok('email names the customer', /Support Alerts Check/.test(sent[0]?.subject || ''), sent[0]?.subject);
    ok('email carries what they said', /500/.test(sent[0]?.html || ''));
    ok('email links to the thread', (sent[0]?.html || '').includes(`?c=${id}`));

    console.log('\n4. a follow-up inside 20 min is throttled (one email, not two)');
    await call('POST', `/api/support/conversations/${id}/messages`, custTok, { body: 'hello?? koi hai' });
    await sleep(1500);
    ok('still one email', sent.length === 1, `got ${sent.length}`);
    const r1b = await convRow(id);
    ok('waiting-since kept at the FIRST unanswered message', r1b.awaiting_reply_since === r1.awaiting_reply_since
      || new Date(r1b.awaiting_reply_since).getTime() === new Date(r1.awaiting_reply_since).getTime());

    console.log('\n5. admin queue: listed under "waiting", with preview, first');
    const unauth = await call('GET', '/api/admin/support/conversations?status=waiting', custTok);
    ok('customer token refused on admin list', unauth.status === 403 || unauth.status === 401, String(unauth.status));
    const list = await call('GET', '/api/admin/support/conversations?status=waiting', adminTok);
    ok('admin list 200', list.status === 200);
    const mine = (list.json?.data || []).find((r) => r.id === id);
    ok('our conversation is in "waiting"', !!mine);
    ok('waitingOnUs true', mine?.waitingOnUs === true);
    ok('lastUserMessage preview present', mine?.lastUserMessage === 'hello?? koi hai', mine?.lastUserMessage);
    const rows = list.json?.data || [];
    ok('every row in "waiting" is waiting on us', rows.length > 0 && rows.every((r) => r.waitingOnUs));
    const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
    ok('sorted by priority', rows.every((r, i) => i === 0 || (rank[rows[i - 1].priority] ?? 2) <= (rank[r.priority] ?? 2)));
    const sum = await call('GET', '/api/admin/support/summary', adminTok);
    ok('summary 200 with waiting >= 1', sum.status === 200 && sum.json?.data?.waiting >= 1, JSON.stringify(sum.json));
    const sumBad = await call('GET', '/api/admin/support/summary', custTok);
    ok('summary refuses a customer token', sumBad.status === 403 || sumBad.status === 401);

    console.log('\n6. an admin reply clears the wait, and pushes to the customer');
    const pushedBefore = pushed.length;
    const rep = await call('POST', `/api/admin/support/conversations/${id}/reply`, adminTok, { body: 'Checking your refund now.' });
    ok('reply 200', rep.status === 200);
    const r2 = await convRow(id);
    ok('awaiting_reply_since cleared', !r2.awaiting_reply_since);
    ok('status human', r2.status === 'human');
    // No device for this synthetic customer -> no push is the correct answer; the
    // in-app record is what must exist.
    ok('no push without any token (correct)', pushed.length === pushedBefore);
    const inApp = await waitFor(async () => {
      const { data } = await db.from('notifications').select('id').eq('customer_id', customerId).eq('type', 'support_reply');
      return data?.length ? data : null;
    });
    ok('in-app support_reply recorded', !!inApp?.length);
    // Positive control: with a token, the reply DOES push, to the right screen.
    await db.from('customers').update({ fcm_token: 'support-alerts-check-token' }).eq('id', customerId);
    const pb2 = pushed.length;
    await call('POST', `/api/admin/support/conversations/${id}/reply`, adminTok, { body: 'Second note.' });
    ok('push sent when a token exists', pushed.length === pb2 + 1);
    ok('push carries support_reply + SupportChat', pushed[pushed.length - 1]?.opts?.data?.type === 'support_reply'
      && pushed[pushed.length - 1]?.opts?.data?.screen === 'SupportChat');
    await db.from('customers').update({ fcm_token: null }).eq('id', customerId);
    const after = await call('GET', '/api/admin/support/conversations?status=waiting', adminTok);
    ok('no longer in "waiting"', !(after.json?.data || []).some((r) => r.id === id));

    console.log('\n7. THE CASE THAT USED TO VANISH: customer writes back after our reply');
    // Clear the throttle so this wait can alert on its own.
    await db.from('support_conversations').update({ team_alerted_at: null }).eq('id', id);
    const before = sent.length;
    await call('POST', `/api/support/conversations/${id}/messages`, custTok, { body: 'still not received the refund' });
    const r3 = await waitFor(async () => { const r = await convRow(id); return r?.awaiting_reply_since ? r : null; });
    ok('waiting again', !!r3?.awaiting_reply_since);
    await waitFor(async () => sent.length > before);
    ok('team emailed about the follow-up', sent.length === before + 1, `got ${sent.length - before}`);
    ok('subject says they wrote again', /wrote again/.test(sent[sent.length - 1]?.subject || ''));

    console.log('\n8. "Close, no reply needed" takes it off the list; writing again reopens it');
    const cl = await call('PATCH', `/api/admin/support/conversations/${id}`, adminTok, { status: 'closed' });
    ok('close 200', cl.status === 200);
    ok('cleared on close', !(await convRow(id)).awaiting_reply_since);
    await call('POST', `/api/support/conversations/${id}/messages`, custTok, { body: 'hello again' });
    const r4 = await waitFor(async () => { const r = await convRow(id); return r?.awaiting_reply_since ? r : null; });
    ok('reopened -> waiting', r4?.status === 'awaiting_human' && !!r4?.awaiting_reply_since);

    console.log('\n9. normal priority: no immediate email, but the queue email picks it up');
    const c2 = await call('POST', '/api/support/conversations', custTok, {});
    const id2 = c2.json.data.id; created.push(id2);
    await db.from('support_conversations').update({ priority: 'normal' }).eq('id', id2);
    const before2 = sent.length;
    await supportAlerts.onAwaitingReply(id2, { message: 'how do I change language', trigger: 'escalated' });
    ok('normal: no immediate email', sent.length === before2);
    ok('normal: still marked waiting', !!(await convRow(id2)).awaiting_reply_since);
    // Queue email — forced so the hourly gate and the real backlog do not decide it.
    const q = await supportAlerts.runQueueCheck({ force: true });
    ok('queue email sent', q.sent === true, JSON.stringify(q));
    const qm = sent[sent.length - 1];
    ok('queue email lists the waiting count', /waiting on us/.test(qm?.subject || ''), qm?.subject);
    // Overdue: push id2's wait 5 h into the past (normal SLA 240 min).
    await db.from('support_conversations').update({
      awaiting_reply_since: new Date(Date.now() - 5 * 3600e3).toISOString(),
      first_response_due_at: new Date(Date.now() - 3600e3).toISOString(),
      first_human_response_at: null, overdue_alerted_at: null,
    }).eq('id', id2);
    const sumO = await supportAlerts.queueSummary();
    ok('summary counts it overdue', sumO.overdue >= 1);
    await supportAlerts.runQueueCheck({ force: true });
    ok('overdue reminder stamped once', !!(await convRow(id2)).overdue_alerted_at);
  } finally {
    // ── teardown ──
    server.close();
    for (const cid of created) {
      await db.from('support_messages').delete().eq('conversation_id', cid);
      await db.from('support_conversations').delete().eq('id', cid);
    }
    await db.from('notifications').delete().eq('customer_id', customerId);
    await db.from('customers').delete().eq('id', customerId);
    // Restore the queue-email state so the forced runs above do not delay prod's.
    const { data: st } = await db.from('app_settings').select('value').eq('key', 'support_alert_state').maybeSingle();
    if (st) await db.from('app_settings').delete().eq('key', 'support_alert_state');
    // Undo the overdue stamps the forced runs put on REAL conversations, so the first
    // production reminder still fires for them.
    await db.from('support_conversations').update({ overdue_alerted_at: null })
      .gte('overdue_alerted_at', testStartIso);
    const { count } = await db.from('support_conversations').select('id', { count: 'exact', head: true }).in('id', created);
    const { data: c } = await db.from('customers').select('id').eq('mobile', QA_PHONE);
    console.log('\nteardown');
    ok('conversations removed', (count || 0) === 0);
    ok('synthetic customer removed', !(c || []).length);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
