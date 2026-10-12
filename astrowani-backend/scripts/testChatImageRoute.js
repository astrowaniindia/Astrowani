#!/usr/bin/env node
/**
 * POST /api/chat/image, over real HTTP, against the LIVE database.
 *
 *   # terminal 1 — never `node index.js`, see CLAUDE.md
 *   PORT=4511 node --env-file=.env scripts/devServer.js
 *   # terminal 2
 *   BASE=http://127.0.0.1:4511 node --env-file=.env scripts/testChatImageRoute.js
 *
 * CHECK THE SERVER'S BOOT LOG FOR EADDRINUSE BEFORE TRUSTING A RESULT. A previous
 * session lost 15 assertions to a port clash and happily reported failures from the
 * OLD code as if they were new (CLAUDE.md, session 2026-09-30).
 *
 * WHY THIS ASSERTS OVER HTTP AND NOT ON THE COMPOSER
 *   scripts/testChatImageComposer.js already proves the pixels. What is unproven
 *   until something posts to the real URL with a real token is the half that holds
 *   the money and the privacy: that a stranger is refused, that an ended session is
 *   refused, that a disconnected sender is refused, and that the row the OTHER
 *   person's app will read actually comes back with a usable URL and dimensions.
 *   A harness that only calls your own helper proves the helper (CLAUDE.md BN).
 *
 * It writes one synthetic chat_sessions row on the store-reviewer accounts and
 * deletes it, its messages and its uploaded objects afterwards. The session is
 * created with per_minute_charge = 0 and next_billing_at a day out ON PURPOSE: the
 * production sessionManager polls this table every 30 seconds and would otherwise
 * bill a real wallet for a test fixture (CLAUDE.md DT).
 */
// Node 20 has no global WebSocket and @supabase/realtime-js throws at require time
// without one — the same shim scripts/devServer.js installs, for the same reason.
// Never "fix" this in repo code: the VPS's Node is not this Node.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');

const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.BASE || 'http://127.0.0.1:4511';
const JWT_SECRET = process.env.JWT_SECRET;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const REVIEWER_PHONE = '9999999999';
const BUCKET = 'app-images';

let pass = 0;
let fail = 0;
const uploaded = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function eq(name, a, b) { ok(name, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* a 413 from the body parser has no JSON */ }
  return { status: res.status, json };
}

async function photo(w = 900, h = 700) {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: '#2d6cdf' } })
    .jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

(async () => {
  if (!JWT_SECRET) { console.error('JWT_SECRET missing — run with --env-file=.env'); process.exit(1); }

  // The server must be the one we think it is before anything is asserted.
  try {
    const probe = await fetch(`${BASE}/api/chat/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (probe.status === 404) { console.error(`\n${BASE} answers 404 on /api/chat/image — that is an OLD build. Restart devServer.\n`); process.exit(1); }
  } catch (e) {
    console.error(`\nCannot reach ${BASE}: ${e.message}\nStart it with:  PORT=4511 node --env-file=.env scripts/devServer.js\n`); process.exit(1);
  }

  const { data: cust } = await db.from('customers').select('id, name').eq('mobile', REVIEWER_PHONE).maybeSingle();
  const { data: astro } = await db.from('astrologers').select('id, first_name').eq('phone_number', REVIEWER_PHONE).maybeSingle();
  if (!cust || !astro) { console.error('Store-reviewer customer/astrologer not found on the live DB.'); process.exit(1); }
  console.log(`\ncustomer ${cust.id}   astrologer ${astro.id}`);

  const custToken = jwt.sign({ phone: REVIEWER_PHONE, id: cust.id }, JWT_SECRET, { expiresIn: '1h' });
  const vendToken = jwt.sign({ astroId: astro.id, id: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });
  // A real third party, not a made-up uuid: the point is that a VALID token for
  // someone who is not in this session is refused.
  const { data: other } = await db.from('customers').select('id, mobile').neq('id', cust.id).not('mobile', 'is', null).limit(1).single();
  const otherToken = jwt.sign({ phone: other.mobile, id: other.id }, JWT_SECRET, { expiresIn: '1h' });

  const roomId = [cust.id, astro.id].sort().join('_');
  const mkSession = async (startedAt) => {
    const { data, error } = await db.from('chat_sessions').insert([{
      caller_id: cust.id,
      vendor_id: astro.id,
      is_active: true,
      started_at: startedAt,
      per_minute_charge: 0,
      next_billing_at: new Date(Date.now() + 86400000).toISOString(),
    }]).select().single();
    if (error) throw error;
    return data;
  };
  const sessions = [];
  // `uq_one_active_session_per_vendor` means an astrologer can hold exactly ONE
  // active session, so each fixture has to retire the previous one before the next
  // can exist. Worth knowing before writing any test that needs two sessions.
  const retire = async (id) => db.from('chat_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', id);
  const newSession = async (startedAt) => {
    for (const id of sessions) await retire(id); // eslint-disable-line no-await-in-loop
    const row = await mkSession(startedAt);
    sessions.push(row.id);
    return row;
  };
  const live = await newSession(new Date().toISOString());

  try {
    console.log('\n── a photo actually gets through, and comes back renderable ──');
    {
      const r = await post('/api/chat/image', {
        roomId, sessionId: live.id, receiverId: astro.id, image: await photo(900, 700),
      }, custToken);
      eq('the customer can send a photo', r.status, 200);
      const d = r.json && r.json.data;
      ok('a row came back', !!d, JSON.stringify(r.json).slice(0, 200));
      if (d) {
        eq('…typed as an image', d.message_type, 'image');
        ok('…with an https URL', /^https:\/\/.+\.jpg$/.test(d.image_url || ''), d.image_url);
        ok('…in its own chat-images folder', (d.image_url || '').includes('/chat-images/'), d.image_url);
        ok('…carrying real pixel dimensions', d.image_width === 900 && d.image_height === 700, `${d.image_width}x${d.image_height}`);
        // THE POINT OF THE DIMENSIONS: the bubble reserves the right shape before the
        // photo loads, so the message list does not jump. A wrong number here is a
        // visible layout bug that no "did it 200" check would ever catch.
        eq('…the message text an old build / a push / the admin view will show', d.message, '📷 Photo');
        if (d.image_url) {
          uploaded.push(`chat-images/${d.image_url.split('/chat-images/')[1]}`);
          const head = await fetch(d.image_url);
          eq('…and the URL really serves the image', head.status, 200);
          const bytes = Buffer.from(await head.arrayBuffer());
          const meta = await sharp(bytes).metadata();
          ok('…which decodes as a JPEG of the stated size',
            meta.format === 'jpeg' && meta.width === d.image_width && meta.height === d.image_height,
            `${meta.format} ${meta.width}x${meta.height}`);
        }
      }
    }
    {
      // The astrologer's side of the same conversation, with edits and a caption.
      const r = await post('/api/chat/image', {
        roomId,
        sessionId: live.id,
        receiverId: cust.id,
        image: await photo(1200, 900),
        caption: 'your 7th house',
        edits: {
          rotate: 90,
          crop: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 },
          strokes: [{ points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.5 }], color: '#ff0000', width: 0.02 }],
          texts: [{ text: 'Rahu राहु', x: 0.2, y: 0.6, size: 0.06, color: '#ffffff' }],
        },
      }, vendToken);
      eq('the astrologer can send one too', r.status, 200);
      const d = r.json && r.json.data;
      if (d && d.image_url) uploaded.push(`chat-images/${d.image_url.split('/chat-images/')[1]}`);
      eq('the caption is carried in the message text', d && d.message, '📷 your 7th house');
      eq('nothing was masked in an innocent caption', r.json && r.json.masked, false);
      eq('the writing was not dropped', r.json && r.json.textDropped, false);
      ok('the edits were applied — rotate+crop changed the shape',
        d && d.image_width === 540 && d.image_height === 720, d && `${d.image_width}x${d.image_height}`);
    }
    {
      // A caption is a message. Contact details in one must be masked exactly as
      // they are in the text box, or the photo caption becomes the way around it.
      await new Promise((r) => setTimeout(r, 2700));
      const r = await post('/api/chat/image', {
        roomId, sessionId: live.id, receiverId: astro.id, image: await photo(400, 400),
        caption: 'call me on 9876543210',
      }, custToken);
      eq('a caption with a phone number is accepted', r.status, 200);
      eq('…and reported as masked', r.json && r.json.masked, true);
      const d = r.json && r.json.data;
      if (d && d.image_url) uploaded.push(`chat-images/${d.image_url.split('/chat-images/')[1]}`);
      ok('…with the number starred out in what is stored', d && !/9876543210/.test(d.message), d && d.message);
    }

    console.log('\n── history and delivery ─────────────────────────────────────');
    {
      const res = await fetch(`${BASE}/api/chat/messages?sessionId=${live.id}`, { headers: { Authorization: `Bearer ${vendToken}` } });
      const json = await res.json();
      const imgs = (json.data || []).filter((m) => m.message_type === 'image');
      ok('the image messages come back from history', imgs.length >= 3, `${imgs.length} found`);
      ok('…each with its URL and dimensions intact',
        imgs.every((m) => m.image_url && m.image_width > 0 && m.image_height > 0),
        JSON.stringify(imgs.map((m) => [m.image_width, m.image_height])));
    }

    console.log('\n── who is refused ──────────────────────────────────────────');
    {
      await new Promise((r) => setTimeout(r, 2700));
      const r = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id, image: await photo(300, 300) }, null);
      eq('no token -> 401', r.status, 401);
    }
    {
      const r = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id, image: await photo(300, 300) }, 'not.a.token');
      eq('a junk token -> 401', r.status, 401);
    }
    {
      // The 2026-08-08 hole, in the new endpoint: a valid user who is not in this
      // session must not be able to put a photo into it.
      const r = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id, image: await photo(300, 300) }, otherToken);
      eq('a stranger with a VALID token -> 403', r.status, 403);
    }
    {
      const r = await post('/api/chat/image', { roomId, receiverId: astro.id, image: await photo(300, 300) }, custToken);
      eq('no sessionId -> 400 (unlike the text endpoint, a photo always needs one)', r.status, 400);
    }
    {
      const r = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id }, custToken);
      eq('no image -> 400', r.status, 400);
    }
    {
      const r = await post('/api/chat/image', {
        roomId, sessionId: live.id, receiverId: astro.id, image: 'data:audio/mp4;base64,AAAAAA',
      }, custToken);
      eq('an audio file dressed as the photo -> 400 BAD_IMAGE', r.status, 400);
      eq('…with the code the app branches on', r.json && r.json.code, 'BAD_IMAGE');
    }
    {
      const r = await post('/api/chat/image', {
        roomId, sessionId: live.id, receiverId: astro.id, image: 'data:image/jpeg;base64,bm90YW5pbWFnZQ==',
      }, custToken);
      eq('bytes that are not an image -> 400 BAD_IMAGE', r.status, 400);
    }
    {
      // 12 MB of base64 — over the endpoint's own ceiling.
      const huge = `data:image/jpeg;base64,${'A'.repeat(12 * 1024 * 1024)}`;
      const r = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id, image: huge }, custToken);
      ok('an oversized photo is refused, not swallowed', r.status === 413, `status ${r.status}`);
    }
    {
      // POSITIVE CONTROL for the throttle: prove a send works, THEN prove the
      // immediate second one does not. Without the first half, a broken endpoint
      // would make the throttle assertion pass for the wrong reason.
      await new Promise((r) => setTimeout(r, 2700));
      const first = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id, image: await photo(300, 300) }, custToken);
      eq('a send after the gap succeeds', first.status, 200);
      const d = first.json && first.json.data;
      if (d && d.image_url) uploaded.push(`chat-images/${d.image_url.split('/chat-images/')[1]}`);
      const second = await post('/api/chat/image', { roomId, sessionId: live.id, receiverId: astro.id, image: await photo(300, 300) }, custToken);
      eq('an immediate second send -> 429', second.status, 429);
      eq('…with the code the app branches on', second.json && second.json.code, 'TOO_FAST');
    }
    {
      // An ended session is not a channel — the same rule the text endpoint got.
      const ended = await newSession(new Date().toISOString());
      await retire(ended.id);
      await new Promise((r) => setTimeout(r, 2700));
      const r = await post('/api/chat/image', { roomId, sessionId: ended.id, receiverId: astro.id, image: await photo(300, 300) }, custToken);
      eq('an ended session -> 409', r.status, 409);
      eq('…SESSION_ENDED', r.json && r.json.code, 'SESSION_ENDED');
    }
    {
      // THE ANTI-ABUSE GATE. A sender who is not in the session room and whose
      // session started long ago cannot be billed, so cannot be served — photos
      // must not be the hole in that rule.
      const old = await newSession(new Date(Date.now() - 10 * 60 * 1000).toISOString());
      const r = await post('/api/chat/image', { roomId, sessionId: old.id, receiverId: astro.id, image: await photo(300, 300) }, custToken);
      eq('a disconnected sender -> 409', r.status, 409);
      eq('…NOT_CONNECTED', r.json && r.json.code, 'NOT_CONNECTED');
    }
  } finally {
    console.log('\n── teardown ─────────────────────────────────────────────────');
    for (const sid of sessions) await db.from('chat_messages').delete().eq('session_id', sid);
    await db.from('chat_sessions').delete().in('id', sessions);
    if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded);
    const { count: msgLeft } = await db.from('chat_messages').select('id', { count: 'exact', head: true }).in('session_id', sessions);
    const { count: sessLeft } = await db.from('chat_sessions').select('id', { count: 'exact', head: true }).in('id', sessions);
    eq('no synthetic messages left behind', msgLeft || 0, 0);
    eq('no synthetic sessions left behind', sessLeft || 0, 0);
    // Asked of the Storage API, NOT of the public URL. A public bucket URL is
    // served through a CDN that keeps answering 200 for a while after the object is
    // gone, so fetching it reports on the cache rather than on the bucket — which
    // is how a clean teardown first looked like a leak here.
    const { data: listed } = await db.storage.from(BUCKET).list('chat-images', { limit: 1000 });
    const names = new Set((listed || []).map((o) => `chat-images/${o.name}`));
    const objLeft = uploaded.filter((p) => names.has(p));
    eq('no uploaded objects left behind', objLeft.length, 0, objLeft.join(', '));
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('\nHARNESS CRASHED:', e); process.exit(1); });
