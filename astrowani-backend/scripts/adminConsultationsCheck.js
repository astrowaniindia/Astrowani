#!/usr/bin/env node
/**
 * Admin Consultations (paged, server-side) + astrologer history — over real HTTP.
 *
 *   node --env-file=.env scripts/adminConsultationsCheck.js
 *
 * READ-ONLY against the live database. Mounts ONLY consultationRoutes on a bare
 * Express app on an ephemeral port (index.js is never booted) with a locally
 * signed token for an existing admin. Every figure the page shows is cross-checked
 * against the ledgers read directly, so a route that agreed with itself but not
 * with the money would fail.
 */
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass += 1; console.log(`PASS  ${m}`); } else { fail += 1; console.log(`FAIL  ${m}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

function call(port, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { let body = null; try { body = JSON.parse(b); } catch (_) { body = b; } resolve({ status: res.statusCode, body }); });
    });
    req.on('error', reject); req.end();
  });
}

async function readAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

(async () => {
  const { data: admin } = await db.from('admins').select('id').limit(1).maybeSingle();
  if (!admin) { console.log('FAIL  no admin row to sign a token for'); process.exit(1); }
  const token = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const app = express();
  app.use(express.json());
  require('../src/consultationRoutes')(app);
  const server = app.listen(0); const port = server.address().port;
  const q = (p) => call(port, p, token);

  try {
    // ── Auth ──
    ok((await call(port, '/api/admin/consultations')).status === 401, 'no token -> 401');

    // ── The 500 cap is gone: all time, including test sessions, equals the table ──
    const { count: allSessions } = await db.from('chat_sessions').select('id', { count: 'exact', head: true });
    const all = await q('/api/admin/consultations?days=all&includeTest=1&limit=50');
    ok(all.status === 200, 'all-time list answers 200');
    ok(all.body.total === allSessions, `all-time total ${all.body.total} equals chat_sessions count ${allSessions} (was capped at 500)`);
    ok(all.body.total > 500, 'more than 500 sessions are reachable');
    ok(all.body.data.length === 50, 'one page holds 50 rows');
    ok(all.body.pages === Math.ceil(allSessions / 50), 'page count matches');

    // ── Paging: pages do not overlap and stay newest-first across the join ──
    const p2 = await q('/api/admin/consultations?days=all&includeTest=1&limit=50&page=2');
    const ids1 = new Set(all.body.data.map((r) => r.id));
    ok(p2.body.data.length === 50 && p2.body.data.every((r) => !ids1.has(r.id)), 'page 2 shares no row with page 1');
    const seq = [...all.body.data, ...p2.body.data].map((r) => new Date(r.startedAt).getTime());
    ok(seq.every((t, i) => i === 0 || seq[i - 1] >= t), 'pages 1+2 are in started-at order, newest first');
    const last = await q(`/api/admin/consultations?days=all&includeTest=1&limit=50&page=${all.body.pages}`);
    ok(last.body.data.length === allSessions - (all.body.pages - 1) * 50, 'the last page holds the remainder');

    // ── Totals are over the WHOLE period and agree with the ledgers ──
    const sessions = await readAll(() => db.from('chat_sessions').select('id').order('id'));
    const sessionIds = new Set(sessions.map((s) => s.id));
    const paidRows = await readAll(() => db.from('wallet_transactions').select('session_id, amount').eq('type', 'debit').not('session_id', 'is', null).order('id'));
    const earnRows = await readAll(() => db.from('vendor_wallet_transactions').select('session_id, amount').eq('type', 'credit').not('session_id', 'is', null).order('id'));
    const sum = (rows) => rows.filter((r) => sessionIds.has(r.session_id)).reduce((a, r) => a + Number(r.amount), 0);
    ok(near(all.body.summary.paid, sum(paidRows)), `customers paid ${all.body.summary.paid} equals the wallet ledger ${sum(paidRows)}`);
    ok(near(all.body.summary.earned, sum(earnRows)), `astrologers earned ${all.body.summary.earned} equals the vendor ledger ${sum(earnRows)}`);
    ok(all.body.summary.sessions === allSessions, 'summary counts every session, not just the page');

    // Test accounts: hidden by default, and the two numbers add up.
    const noTest = await q('/api/admin/consultations?days=all&limit=1');
    ok(noTest.body.total + noTest.body.testCount === allSessions, `visible ${noTest.body.total} + test ${noTest.body.testCount} = all`);

    // ── Filters run on the server ──
    const chat = await q('/api/admin/consultations?days=all&type=chat&limit=200');
    ok(chat.body.data.length > 0 && chat.body.data.every((r) => r.type === 'chat'), 'type=chat returns only chats');
    const paid = await q('/api/admin/consultations?days=all&status=paid&limit=200');
    ok(paid.body.data.length > 0 && paid.body.data.every((r) => r.astrologerEarned > 0), 'status=paid returns only sessions that earned');
    const zero = await q('/api/admin/consultations?days=all&status=zero&limit=1');
    ok(paid.body.total + zero.body.total === noTest.body.total, 'earned>0 plus earned 0 covers every session');
    const bySort = await q('/api/admin/consultations?days=all&sort=customerPaid&dir=desc&limit=20');
    const paidSeq = bySort.body.data.map((r) => r.customerPaid);
    ok(paidSeq.every((v, i) => i === 0 || paidSeq[i - 1] >= v), 'sort by customer paid, high to low');
    const sample = paid.body.data[0];
    const term = sample.astrologer.name.split(' ')[0];
    const searched = await q(`/api/admin/consultations?days=all&search=${encodeURIComponent(term)}&limit=200`);
    ok(searched.body.total > 0 && searched.body.total < noTest.body.total, `search "${term}" narrows the list (${searched.body.total})`);
    const week = await q('/api/admin/consultations?days=7&limit=1');
    const month = await q('/api/admin/consultations?days=30&limit=1');
    ok(week.body.total <= month.body.total && month.body.total <= noTest.body.total, `7d ${week.body.total} <= 30d ${month.body.total} <= all ${noTest.body.total}`);

    // ── One astrologer ──
    const astroId = sample.astrologer.id;
    const mine = await q(`/api/admin/consultations?days=all&includeTest=1&astrologerId=${astroId}&limit=200`);
    const { count: mineCount } = await db.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('vendor_id', astroId);
    ok(mine.body.total === mineCount, `astrologer filter total ${mine.body.total} equals their session count ${mineCount}`);
    ok(mine.body.data.every((r) => r.astrologer.id === astroId), 'astrologer filter returns only their sessions');
    ok((await q('/api/admin/consultations?astrologerId=not-a-uuid')).status === 400, 'bad astrologer id -> 400');

    const hs = await q(`/api/admin/astrologers/${astroId}/history-summary`);
    ok(hs.status === 200 && hs.body.data.sessions === mineCount, 'history summary counts their sessions');
    const theirLedger = await readAll(() => db.from('vendor_wallet_transactions').select('type, amount').eq('vendor_id', astroId).order('id'));
    const theirCredits = theirLedger.filter((t) => t.type === 'credit').reduce((a, t) => a + Number(t.amount), 0);
    ok(near(hs.body.data.credits, theirCredits), `history summary credits ${hs.body.data.credits} equal their ledger ${theirCredits}`);
    ok(hs.body.data.transactions === theirLedger.length, 'history summary counts every transaction');

    const tx = await q(`/api/admin/astrologers/${astroId}/transactions?limit=50`);
    ok(tx.status === 200 && tx.body.total === theirLedger.length, `transactions total ${tx.body.total} equals their ledger rows`);
    const txAt = tx.body.data.map((t) => new Date(t.at).getTime());
    ok(txAt.every((t, i) => i === 0 || txAt[i - 1] >= t), 'transactions newest first');
    ok(tx.body.data.some((t) => t.customer), 'transactions name the customer');
    const credits = await q(`/api/admin/astrologers/${astroId}/transactions?type=credit&limit=200`);
    ok(credits.body.data.every((t) => t.type === 'credit'), 'credit filter returns only credits');
    if (tx.body.pages > 1) {
      const tx2 = await q(`/api/admin/astrologers/${astroId}/transactions?limit=50&page=2`);
      const t1 = new Set(tx.body.data.map((t) => t.id));
      ok(tx2.body.data.every((t) => !t1.has(t.id)), 'transactions page 2 shares no row with page 1');
    }
    const wd = await q(`/api/admin/astrologers/${astroId}/withdrawals`);
    ok(wd.status === 200 && Array.isArray(wd.body.data), 'withdrawals answers 200');
    ok(wd.body.data.every((w) => !('bank_account_number' in w) && !('upi_id' in w)), 'withdrawals carry no bank or UPI details');
    ok((await q('/api/admin/astrologers/nope/transactions')).status === 400, 'bad id on transactions -> 400');

    // ── The earnings tab read past the 1,000-row cap ──
    const allLedger = await readAll(() => db.from('vendor_wallet_transactions').select('amount, type').eq('type', 'credit').order('id'));
    const earn = await q('/api/admin/consultations/astrologer-earnings?days=all&includeTest=1');
    const earnTotal = earn.body.data.reduce((a, r) => a + r.earnedInWindow, 0);
    const ledgerTotal = allLedger.reduce((a, t) => a + Number(t.amount), 0);
    ok(allLedger.length > 1000, `ledger holds ${allLedger.length} credit rows (over the 1,000-row cap)`);
    ok(near(earnTotal, ledgerTotal), `earnings tab total ${earnTotal.toFixed(2)} equals the ledger ${ledgerTotal.toFixed(2)}`);
  } catch (e) {
    fail += 1; console.log('FAIL  threw:', e.message);
  } finally {
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
