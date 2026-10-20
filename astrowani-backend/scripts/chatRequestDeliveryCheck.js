// Verifies the socket delivery that lets the vendor HomeScreen drop its four Supabase
// Realtime subscriptions on chat_requests / call_requests.
//
// Run (the port MUST be spare, and the ready line is checked for EADDRINUSE):
//   PORT=4597 node --env-file=.env scripts/devServer.js        # in another shell
//   node --env-file=.env scripts/chatRequestDeliveryCheck.js
//
// WHY A REAL SERVER. The two things under test are `io.to(...).emit(...)` calls inside
// index.js, so a bare Express harness cannot reach them -- there is no io. devServer.js
// is index.js with a WebSocket shim and a hard REFUSAL to start the billing worker, which
// is the sanctioned way to exercise sockets locally (used the same way on 2026-09-30).
//
// WHAT IT ASSERTS, and the point of it: that a client shaped like the vendor app actually
// RECEIVES these events. Testing that the emit was called would prove the emit, not the
// delivery -- and delivery is the whole question here, because the ring room is a DEVICE
// room, not the account room, so an emit that looks right can still reach nobody.
//
// SIDE EFFECTS ON PRODUCTION DATA, all restored and asserted at the end:
//   - the store-reviewer astrologer's chat_charge_per_minute is set to 0 for the run, so
//     /api/chat/initiate's wallet gate is skipped (that customer's balance is 0 and
//     topping up a real wallet to run a test is not worth it), and is_suspended is
//     cleared, because the route refuses a suspended astrologer. Both are read first and
//     written back in a finally, with the restore asserted. That astrologer is
//     approved AND hidden_from_customers, so it is absent from /api/astrologers and no
//     real customer can reach it during the few seconds of the run.
//   - one chat_requests row, cancelled then deleted.
// No push is sent by either route under test, so no real device is rung.

if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* fails loudly below */ }
}

const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.CHECK_PORT || '4597';
const BASE = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Store-reviewer accounts, read from production 2026-10-21.
const ASTRO = {
  id: '1f70210e-6234-4f49-a764-13e851968e1e',
  deviceId: 'cb9aff50-d8d8-4413-9f27-48981a59fd8f',
};
const CUST = { id: 'bcf31426-1849-43d4-8c70-c93990962327', mobile: '9999999999' };

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
};

const vendorTok = jwt.sign({ astroId: ASTRO.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });
const custTok = jwt.sign({ phone: CUST.mobile, role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, body: json };
};

/** Resolves with the first matching event, or null after ms. */
function waitFor(socket, event, ms = 6000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off(event, handler); resolve(null); }, ms);
    const handler = (data) => { clearTimeout(timer); socket.off(event, handler); resolve(data); };
    socket.on(event, handler);
  });
}

async function main() {
  if (!JWT_SECRET) throw new Error('JWT_SECRET unset -- run with --env-file=.env');

  // The server must already be up on a SPARE port. A silent EADDRINUSE against another
  // server would test somebody else's build (the 2026-09-30 trap).
  const health = await fetch(BASE + '/api/call/ice-servers').catch(() => null);
  if (!health) {
    console.error(`No server on ${BASE}. Start it first:\n`
      + `  PORT=${PORT} node --env-file=.env scripts/devServer.js`);
    process.exit(1);
  }
  // STALENESS GUARD. An earlier run of this suite reported 22/22 against a server still
  // running the PREVIOUS build: `pkill` does not exist in this shell, so the restart
  // silently lost the port to EADDRINUSE and the old process answered everything.
  // /api/vendor/pending-requests exists only as of this change, so a 404 means the
  // process is older than the code under test. It cannot catch a server that has the
  // routes but an older emit, so RESTART THE SERVER BEFORE EVERY RUN -- on Windows,
  // Get-CimInstance Win32_Process + Stop-Process, then confirm the port is free.
  const marker = await api('/api/vendor/pending-requests');
  if (marker.status === 404) {
    console.error('REFUSING: no /api/vendor/pending-requests on this port, so the server '
      + 'is running an older build. Restart it and run again.');
    process.exit(1);
  }
  console.log(`server reachable on ${BASE} (new routes present)\n`);

  // Precondition: nothing of ours already pending, or the unique index refuses the insert
  // and the failure would read like a product bug.
  const { data: stale } = await db.from('chat_requests').select('id')
    .eq('receiver_id', ASTRO.id).eq('status', 'pending');
  if (stale && stale.length) {
    console.error('A pending chat request already exists for the reviewer astrologer; '
      + 'clear it before running. ids: ' + stale.map((r) => r.id).join(', '));
    process.exit(1);
  }

  const { data: before } = await db.from('astrologers')
    .select('chat_charge_per_minute, is_suspended, approval_status').eq('id', ASTRO.id).maybeSingle();
  if (!before) throw new Error('reviewer astrologer row not found');
  if (before.approval_status !== 'approved') {
    throw new Error('reviewer astrologer is not approved -- fix that first, do not work around it here');
  }
  const originalCharge = before.chat_charge_per_minute;
  const originalSuspended = before.is_suspended;
  await db.from('astrologers')
    .update({ chat_charge_per_minute: 0, is_suspended: false }).eq('id', ASTRO.id);

  let requestId = null;
  const socket = io(BASE, { auth: { token: vendorTok }, transports: ['websocket'] });

  try {
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket connect timed out')), 8000);
    });
    // BOTH arguments: ringRoomFor targets the newest signed-in DEVICE, so joining only
    // the account room would miss incoming_chat entirely.
    socket.emit('join_room', ASTRO.id, ASTRO.deviceId);
    await new Promise((r) => setTimeout(r, 1200)); // the join does a DB round trip first

    /* ------------------- GET /api/vendor/pending-requests ------------------- */
    console.log('GET /api/vendor/pending-requests');
    {
      const empty = await api('/api/vendor/pending-requests', { token: vendorTok });
      ok('200 for the astrologer', empty.status === 200 && empty.body.success === true, empty.body);
      ok('no pending chat before we make one (control)', empty.body.chat === null, empty.body);
      ok('401 without a token', (await api('/api/vendor/pending-requests')).status === 401);
      ok('401 for a customer token',
        (await api('/api/vendor/pending-requests', { token: custTok })).status === 401);
    }

    /* --------------------- incoming_chat over the socket -------------------- */
    console.log('\nPOST /api/chat/initiate -> socket incoming_chat');
    {
      const waiting = waitFor(socket, 'incoming_chat');
      const init = await api('/api/chat/initiate', {
        method: 'POST', token: custTok, body: { astrologerId: ASTRO.id },
      });
      ok('chat initiate succeeded', init.status === 200 && init.body.success === true, init.body);
      requestId = init.body && init.body.requestId;
      ok('it returned a requestId', !!requestId, init.body);

      const ev = await waiting;
      // THE ASSERTION THIS WHOLE FILE EXISTS FOR. Before this change the route emitted
      // nothing, so a foregrounded astrologer learned of a chat request only from the
      // Realtime INSERT that the vendor HomeScreen no longer subscribes to.
      ok('the vendor socket RECEIVED incoming_chat', !!ev, { got: ev });
      ok('it carries the right requestId', !!ev && ev.requestId === requestId, { ev, requestId });
      ok('it carries callType chat', !!ev && ev.callType === 'chat', ev);
      ok('it carries the caller id and a name', !!ev && ev.callerId === CUST.id && !!ev.callerName, ev);
    }

    /* ---------------- the catch-up now sees that same request --------------- */
    console.log('\nGET /api/vendor/pending-requests (now populated)');
    {
      const r = await api('/api/vendor/pending-requests', { token: vendorTok });
      const chat = r.body && r.body.chat;
      ok('the pending chat is reported', !!chat && chat.requestId === requestId, r.body);
      // Shaped for enqueuePopup, so the screen does no mapping.
      ok('shaped for the popup (table/callType/callerName)',
        !!chat && chat.table === 'chat_requests' && chat.callType === 'chat' && !!chat.callerName, chat);
    }

    /* ----------------- request_cancelled over the socket -------------------- */
    console.log('\nPOST /api/requests/chat/:id/status -> socket request_cancelled');
    {
      const waiting = waitFor(socket, 'request_cancelled');
      const upd = await api(`/api/requests/chat/${requestId}/status`, {
        method: 'POST', token: custTok, body: { status: 'cancelled' },
      });
      ok('cancel succeeded and changed a row',
        upd.status === 200 && upd.body.success === true && upd.body.changed === true, upd.body);

      const ev = await waiting;
      ok('the vendor socket RECEIVED request_cancelled', !!ev, { got: ev });
      ok('it carries the right requestId', !!ev && ev.requestId === requestId, { ev, requestId });
      ok('it names the kind and the status', !!ev && ev.kind === 'chat' && ev.status === 'cancelled', ev);
      ok('it carries the callerId the popup matches on', !!ev && ev.callerId === CUST.id, ev);

      const { data: row } = await db.from('chat_requests')
        .select('status').eq('id', requestId).maybeSingle();
      ok('the row really is cancelled', row && row.status === 'cancelled', row);
    }

    /* ------- and the catch-up stops reporting it, so no stale popup --------- */
    console.log('\nGET /api/vendor/pending-requests (after cancel)');
    {
      const r = await api('/api/vendor/pending-requests', { token: vendorTok });
      ok('a cancelled request is no longer pending', r.body && r.body.chat === null, r.body);
    }
  } finally {
    socket.close();
    // ---- teardown, asserted ----
    console.log('\nteardown');
    if (requestId) await db.from('chat_requests').delete().eq('id', requestId);
    await db.from('astrologers')
      .update({ chat_charge_per_minute: originalCharge, is_suspended: originalSuspended })
      .eq('id', ASTRO.id);
    const { data: left } = await db.from('chat_requests').select('id').eq('receiver_id', ASTRO.id)
      .in('status', ['pending', 'cancelled']).gte('created_at', new Date(Date.now() - 600000).toISOString());
    ok('no synthetic request rows left behind', !left || left.length === 0, left);
    const { data: after } = await db.from('astrologers')
      .select('chat_charge_per_minute, is_suspended').eq('id', ASTRO.id).maybeSingle();
    ok('chat_charge_per_minute restored',
      after && Number(after.chat_charge_per_minute) === Number(originalCharge),
      { before: originalCharge, after: after && after.chat_charge_per_minute });
    ok('is_suspended restored',
      after && after.is_suspended === originalSuspended,
      { before: originalSuspended, after: after && after.is_suspended });
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('harness error:', e); process.exit(1); });
