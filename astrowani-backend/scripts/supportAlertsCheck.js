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

  const app = express(); app.use(express.json({ limit: '10mb' })); // index.js's limit
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
  const uploaded = []; // public URLs of photos this run stored
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

    // ── 10. photos ──
    console.log('\n10. photos: customer sends one, the bot hands it to a person');
    const sharp = require('sharp');
    const png = await sharp({ create: { width: 64, height: 40, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
    const goodImg = `data:image/png;base64,${png.toString('base64')}`;
    const c3 = await call('POST', '/api/support/conversations', custTok, {});
    const id3 = c3.json.data.id; created.push(id3);
    const ph = await call('POST', `/api/support/conversations/${id3}/image`, custTok, { image: goodImg, caption: 'my bank sms' });
    ok('photo 200', ph.status === 200, JSON.stringify(ph.json));
    ok('photo in a bot conversation goes to a person', ph.json?.status === 'awaiting_human');
    if (ph.json?.message?.imageUrl) uploaded.push(ph.json.message.imageUrl);
    const { data: m3 } = await db.from('support_messages').select('*').eq('conversation_id', id3).eq('sender', 'user');
    const imgRow = (m3 || []).find((m) => m.image_url);
    ok('message row carries the image', !!imgRow && imgRow.image_width === 64 && imgRow.image_height === 40,
      JSON.stringify(imgRow && { w: imgRow.image_width, h: imgRow.image_height }));
    ok('body is the readable "📷 caption"', imgRow?.body === '📷 my bank sms', imgRow?.body);
    const stored = await fetch(imgRow?.image_url || 'http://invalid');
    ok('stored object is a real JPEG', stored.status === 200 && /jpeg/.test(stored.headers.get('content-type') || ''),
      `${stored.status} ${stored.headers.get('content-type')}`);
    ok('object is under support-images/', /\/app-images\/support-images\//.test(imgRow?.image_url || ''));
    const th3 = await call('GET', `/api/support/conversations/${id3}`, custTok);
    ok('customer thread serves imageUrl + size', (th3.json?.data?.messages || [])
      .some((m) => m.imageUrl && m.imageWidth === 64 && m.imageHeight === 40));
    ok('team waiting on it', !!(await convRow(id3)).awaiting_reply_since);

    // The throttle exists for two taps landing TOGETHER (it is claimed before the
    // first await). Sent concurrently: exactly one may get through.
    await sleep(2700);
    const pair = await Promise.all([
      call('POST', `/api/support/conversations/${id3}/image`, custTok, { image: goodImg }),
      call('POST', `/api/support/conversations/${id3}/image`, custTok, { image: goodImg }),
    ]);
    pair.forEach((p) => { if (p.json?.message?.imageUrl) uploaded.push(p.json.message.imageUrl); });
    ok('two photos at once: one 200, one 429 TOO_FAST',
      pair.filter((p) => p.status === 200).length === 1 && pair.some((p) => p.status === 429 && p.json?.code === 'TOO_FAST'),
      pair.map((p) => p.status).join(','));
    await sleep(2700);
    const badImg = await call('POST', `/api/support/conversations/${id3}/image`, custTok, { image: 'data:image/png;base64,AAAAAAAA' });
    ok('unreadable image -> 400 BAD_IMAGE', badImg.status === 400 && badImg.json?.code === 'BAD_IMAGE', String(badImg.status));
    const notImg = await call('POST', `/api/support/conversations/${id3}/image`, custTok, { image: 'data:text/plain;base64,aGk=' });
    ok('non-image data -> 400', notImg.status === 400);
    const noAuth = await call('POST', `/api/support/conversations/${id3}/image`, null, { image: goodImg });
    ok('no token -> 401', noAuth.status === 401);
    const otherConv = await call('POST', '/api/support/conversations/00000000-0000-4000-8000-000000000000/image', custTok, { image: goodImg });
    ok("someone else's / unknown conversation -> 404", otherConv.status === 404, String(otherConv.status));

    console.log('\n11. admin sends a photo back');
    const before11 = (await db.from('support_messages').select('id').eq('conversation_id', id3).eq('sender', 'human')).data?.length || 0;
    const aph = await call('POST', `/api/admin/support/conversations/${id3}/reply`, adminTok, { image: goodImg });
    ok('admin photo-only reply 200', aph.status === 200, JSON.stringify(aph.json));
    const { data: hm } = await db.from('support_messages').select('*').eq('conversation_id', id3).eq('sender', 'human');
    const adminImg = (hm || []).find((m) => m.image_url);
    ok('one new human message, with the image', (hm || []).length === before11 + 1 && !!adminImg);
    if (adminImg?.image_url) uploaded.push(adminImg.image_url);
    ok('photo-only body is "📷 Photo"', adminImg?.body === '📷 Photo', adminImg?.body);
    ok('photo reply clears the wait', !(await convRow(id3)).awaiting_reply_since);
    const emptyRep = await call('POST', `/api/admin/support/conversations/${id3}/reply`, adminTok, {});
    ok('empty reply refused', emptyRep.status === 400);

    console.log('\n12. whose turn: Reply needed / Waiting on them / Solved (the Zendesk model)');
    const has = async (status, cid) => ((await call('GET', `/api/admin/support/conversations?status=${status}`, adminTok)).json?.data || [])
      .some((r) => r.id === cid);
    // After our photo reply in 11, the ball is in their court.
    ok('after our reply: in "Waiting on them"', await has('pending', id3));
    ok('after our reply: NOT in "Reply needed"', !(await has('waiting', id3)));
    await call('POST', `/api/support/conversations/${id3}/messages`, custTok, { body: 'any update?' });
    await waitFor(async () => (await convRow(id3))?.awaiting_reply_since);
    ok('they write again: back in "Reply needed" by itself', await has('waiting', id3));
    ok('...and out of "Waiting on them"', !(await has('pending', id3)));
    const adminTh = await call('GET', `/api/admin/support/conversations/${id3}`, adminTok);
    const ctx = adminTh.json?.data?.context;
    ok('thread carries the person + their account', adminTh.json?.data?.party?.kind === 'customer'
      && !!ctx && Array.isArray(ctx.recentPayments));
    ok('bad priority -> 400', (await call('PATCH', `/api/admin/support/conversations/${id3}`, adminTok, { priority: 'mega' })).status === 400);
    ok('bad status -> 400', (await call('PATCH', `/api/admin/support/conversations/${id3}`, adminTok, { status: 'bot' })).status === 400);
    await call('PATCH', `/api/admin/support/conversations/${id3}`, adminTok, { status: 'resolved' });
    ok('marked solved: in "Solved"', await has('solved', id3));
    ok('marked solved: nobody waiting', !(await has('waiting', id3)) && !(await convRow(id3)).awaiting_reply_since);
    const st = await call('GET', '/api/admin/support/stats', adminTok);
    ok('stats 200 (typical first reply)', st.status === 200 && 'medianFirstResponseMin' in (st.json?.data || {}),
      JSON.stringify(st.json?.data));

    console.log('\n13. saved replies (restored afterwards)');
    const { data: origSaved } = await db.from('app_settings').select('value').eq('key', 'support_saved_replies').maybeSingle();
    try {
      const sr = await call('GET', '/api/admin/support/saved-replies', adminTok);
      ok('saved replies served', sr.status === 200 && (sr.json?.data || []).length > 0);
      const put = await call('PUT', '/api/admin/support/saved-replies', adminTok, {
        replies: [{ title: 'T1', body: 'Hi {name}' }, { title: '', body: 'dropped: no title' }],
      });
      ok('save keeps only complete replies', put.status === 200 && put.json?.data?.length === 1);
      const sr2 = await call('GET', '/api/admin/support/saved-replies', adminTok);
      ok('saved list read back', sr2.json?.data?.[0]?.title === 'T1');
      ok('customer cannot edit them', [401, 403].includes((await call('PUT', '/api/admin/support/saved-replies', custTok, { replies: [] })).status));
    } finally {
      if (origSaved) await db.from('app_settings').update({ value: origSaved.value }).eq('key', 'support_saved_replies');
      else await db.from('app_settings').delete().eq('key', 'support_saved_replies');
    }
  } finally {
    // ── teardown ──
    server.close();
    for (const cid of created) {
      await db.from('support_messages').delete().eq('conversation_id', cid);
      await db.from('support_conversations').delete().eq('id', cid);
    }
    await db.from('notifications').delete().eq('customer_id', customerId);
    // Stored photos. Verified through the STORAGE API, not the public URL — the CDN
    // keeps answering 200 for a deleted object (CLAUDE.md EB).
    const paths = uploaded.map((u) => u.split('/app-images/')[1]).filter(Boolean);
    if (paths.length) await db.storage.from('app-images').remove(paths);
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
    // Belt and braces: anything this run stored that no message references any
    // more (e.g. a response that never came back) is swept too.
    {
      const { data: objs } = await db.storage.from('app-images').list('support-images', { limit: 1000 });
      const { data: refs } = await db.from('support_messages').select('image_url').not('image_url', 'is', null);
      const used = new Set((refs || []).map((r) => r.image_url.split('/app-images/')[1]));
      const stray = (objs || [])
        .filter((o) => new Date(o.created_at).getTime() >= new Date(testStartIso).getTime() - 5000)
        .map((o) => `support-images/${o.name}`)
        .filter((p) => !used.has(p));
      if (stray.length) await db.storage.from('app-images').remove(stray);
      const { data: left } = await db.storage.from('app-images').list('support-images', { limit: 1000 });
      const names = new Set((left || []).map((o) => `support-images/${o.name}`));
      ok(`stored photos removed (${paths.length} tracked, ${stray.length} swept)`,
        paths.every((p) => !names.has(p)) && stray.every((p) => !names.has(p)));
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
