// Verifies the astrologer fan-out: one Supabase Realtime subscription held by
// the backend, rebroadcast to every connected app over Socket.io.
//
// Requires socket.io-client, which is a customer-app dependency rather than a
// backend one:  npm i -D socket.io-client
// Creates and deletes its own throwaway astrologer; touches no real row.
// Run: node --env-file=.env scripts/testFanout.js
const { spawn } = require('child_process');
const crypto = require('crypto');
const io = require('socket.io-client');
const { createClient } = require('@supabase/supabase-js');

const PORT = 4597;
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENTS = 25;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const child = spawn(process.execPath, ['--env-file=.env', 'index.js'], {
  cwd: require('path').join(__dirname, '..'),
  env: {
    ...process.env, PORT: String(PORT),
    JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
    // Safe: the fanout now starts BEFORE this guard, because it is read-only.
    DISABLE_SESSION_MANAGER: '1',
  },
});
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${extra}`)); };

(async () => {
  const clients = [];
  let testAstroId = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/astrologers`)).ok) break; } catch (_) {}
      await sleep(500);
    }
    await sleep(4000); // give the realtime handshake time to complete
    check('backend booted', log.includes('running on http'), log.slice(-400));
    check('fanout subscribed to Realtime', log.includes('[astrologerFanout] subscribed'),
      log.includes('astrologerFanout') ? log.split('astrologerFanout')[1]?.slice(0, 120) : '(no fanout log at all)');

    // Connect fake clients
    const received = new Array(CLIENTS).fill(0);
    await Promise.all(Array.from({ length: CLIENTS }, (_, i) => new Promise((resolve) => {
      const s = io(BASE, { transports: ['websocket'] });
      s.on('astrologers_changed', () => { received[i]++; });
      s.on('connect', resolve);
      clients.push(s);
    })));
    check(`${CLIENTS} clients connected`, clients.every((c) => c.connected));

    // Warm the list cache so we can prove invalidation
    await fetch(`${BASE}/api/astrologers`);
    const t0 = Date.now();
    await fetch(`${BASE}/api/astrologers`);
    check('second call served from cache', Date.now() - t0 < 60, `${Date.now() - t0} ms`);

    // A throwaway astrologer so we never mutate a real one
    const tag = `fanout-test-${Date.now()}`;
    const { data: astro, error } = await db.from('astrologers')
      .insert([{ first_name: tag, phone_number: tag, approval_status: 'pending' }]).select().single();
    if (error) throw new Error('could not create test astrologer: ' + error.message);
    testAstroId = astro.id;

    // Three rapid changes — should coalesce into ONE client event
    await db.from('astrologers').update({ is_online: true }).eq('id', testAstroId);
    await db.from('astrologers').update({ is_online: false }).eq('id', testAstroId);
    await db.from('astrologers').update({ bio: 'x' }).eq('id', testAstroId);

    await sleep(6000); // > COALESCE_MS

    const counts = [...new Set(received)];
    check('every client was notified', received.every((n) => n >= 1), `counts=${JSON.stringify(counts)}`);
    check('3 rapid changes coalesced into 1 event', received.every((n) => n === 1),
      `counts=${JSON.stringify(counts)} (expected all 1)`);
    check('all clients got the same count', counts.length === 1, `distinct counts: ${JSON.stringify(counts)}`);
  } catch (err) {
    fail++;
    console.log('  ERROR', err.message);
    console.log(log.slice(-1500));
  } finally {
    clients.forEach((c) => c.disconnect());
    if (testAstroId) {
      await db.from('astrologers').delete().eq('id', testAstroId);
      const left = (await db.from('astrologers').select('id').eq('id', testAstroId)).data.length;
      console.log(`\nteardown: test astrologer rows left=${left}`);
    }
    child.kill();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
