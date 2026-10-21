#!/usr/bin/env node
/*
 * testPreConnectWatchdog.js — the pre-connect watchdog must not kill a call that has not yet
 * been given a microphone.
 *
 * WHY (2026-10-21, measured against production). Every call screen asked for RECORD_AUDIO on
 * mount inside setupWebRTC() and armed createPreConnectWatchdog() in the same effect. The
 * watchdog's 45s clock started at mount, while setupWebRTC() was still awaiting
 * `PermissionsAndroid.request(...)` — which blocks on a human tapping "Allow". The deadline
 * expired underneath the dialog and ended the call with "We could not connect this call".
 *
 * In the 7 days to 2026-10-21: 68 of 475 audio calls (14%) died in a spike at 47-51 seconds,
 * 56 of them with next_billing_at still NULL (no media ever flowed). A customer's FIRST EVER
 * call failed 16.4% of the time against 7.3% for later calls — Android shows that dialog once,
 * and that gap is the dialog.
 *
 * Run: node scripts/testPreConnectWatchdog.js   (no network, no database, no device)
 *
 * The scenarios drive the REAL module with a virtual clock and a stubbed poll transport. Each
 * negative check ("not killed") is paired with a positive one ("still bounded", "still leaves
 * on a hangup"), because a watchdog that has simply stopped working would pass every
 * not-killed assertion on its own.
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const APP = path.resolve(__dirname, '..');
const CUSTOMER_WD = path.join(APP, 'src/utils/preConnectWatchdog.js');
const VENDOR_WD = path.resolve(APP, '../astrowani_vendors-main/src/utils/preConnectWatchdog.js');

const SCREENS = [
  [path.join(APP, 'src/screens/Video/VoiceCallScreen.tsx'), 'customer voice'],
  [path.join(APP, 'src/screens/Video/VideoCallScreen.tsx'), 'customer video'],
  [path.resolve(APP, '../astrowani_vendors-main/src/utils/EnxScreenVoice.tsx'), 'vendor voice'],
  [path.resolve(APP, '../astrowani_vendors-main/src/utils/EnxScreenVideo.tsx'), 'vendor video'],
];

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
};

/* ── Load the real module with its two React Native deps stubbed ─────────────── */
function loadWatchdog() {
  let src = fs.readFileSync(CUSTOMER_WD, 'utf8')
    .replace(/^import AsyncStorage.*$/m, 'const AsyncStorage = global.__AS;')
    .replace(/^import Instance.*$/m, 'const Instance = global.__INST;');
  const code = babel.transform(src, {
    configFile: false, babelrc: false,
    presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
  }).code;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports.createPreConnectWatchdog;
}

let ended = false;
global.__AS = { getItem: async () => 'tok' };
global.__INST = { get: async () => ({ data: { success: true, ended } }) };

const createPreConnectWatchdog = loadWatchdog();

/* ── Virtual clock. POLL_MS is 3000 in the module, so real time would make this suite
 *    minutes long; instead setTimeout is queued and drained a tick at a time.            */
const T0 = Date.now();
let virt = 0;
Date.now = () => T0 + virt;
let queued = [];
global.setTimeout = (fn) => { queued.push(fn); return { q: true }; };
global.clearTimeout = () => {};
const drain = () => new Promise((r) => setImmediate(r));

async function scenario({ useMediaReady, mediaReadyAt, endsAt, deadlineMs, setupDeadlineMs, runToMs }) {
  ended = false; virt = 0; queued = [];
  let gaveUp = null, mediaReady = false;
  const wd = createPreConnectWatchdog({
    getSessionId: () => 'sess-1',
    isConnected: () => false,
    isEnding: () => false,
    isMediaReady: useMediaReady ? (() => mediaReady) : undefined,
    deadlineMs, setupDeadlineMs,
    onGiveUp: (i) => { if (!gaveUp) gaveUp = { ...i, at: virt }; },
    label: 'test',
  });
  while (virt <= runToMs && !gaveUp) {
    if (mediaReadyAt !== null && virt >= mediaReadyAt) mediaReady = true;
    if (endsAt !== null && virt >= endsAt) ended = true;
    const batch = queued; queued = [];
    for (const fn of batch) { fn(); await drain(); await drain(); await drain(); }
    virt += 3000;
  }
  wd.stop();
  return gaveUp;
}

(async () => {
  const D = 45000, S = 120000;
  const base = { deadlineMs: D, setupDeadlineMs: S, endsAt: null, useMediaReady: true };

  console.log('\n1. The two app copies have not drifted');
  ok(fs.readFileSync(CUSTOMER_WD, 'utf8') === fs.readFileSync(VENDOR_WD, 'utf8'),
    'customer and vendor preConnectWatchdog.js are byte-identical');

  console.log('\n2. Media never opens — the permission dialog sitting unanswered');
  let r = await scenario({ ...base, mediaReadyAt: null, runToMs: 60000 });
  ok(r === null, 'NOT killed at 45s (this was the bug)');
  r = await scenario({ ...base, mediaReadyAt: null, runToMs: 200000 });
  ok(r && r.reason === 'timeout' && r.at > S && r.at < S + 6000,
    'but still bounded — gives up at the ' + S / 1000 + 's setup deadline (at ' + (r && r.at) + 'ms)');

  console.log('\n3. The deadline measures connecting, not screen lifetime');
  r = await scenario({ ...base, mediaReadyAt: 30000, runToMs: 300000 });
  ok(r && r.reason === 'timeout' && r.at >= 75000,
    'media open at 30s -> killed at ~75s, not 45s (at ' + (r && r.at) + 'ms)');
  r = await scenario({ ...base, mediaReadyAt: 0, runToMs: 300000 });
  ok(r && r.reason === 'timeout' && r.at > D && r.at < D + 6000,
    'media open immediately -> unchanged 45s behaviour (at ' + (r && r.at) + 'ms)');

  console.log('\n4. POSITIVE CONTROL — a hangup during the permission wait still gets through');
  r = await scenario({ ...base, mediaReadyAt: null, endsAt: 12000, runToMs: 200000 });
  ok(r && r.reason === 'ended_by_other' && r.at < 20000,
    'leaves promptly with reason ended_by_other (at ' + (r && r.at) + 'ms)');

  console.log('\n5. A caller passing no isMediaReady keeps the old behaviour');
  r = await scenario({ ...base, useMediaReady: false, mediaReadyAt: null, runToMs: 300000 });
  ok(r && r.reason === 'timeout' && r.at > D && r.at < D + 6000,
    '45s-from-mount preserved (at ' + (r && r.at) + 'ms)');

  console.log('\n6. Every call screen actually reports media readiness');
  for (const [file, label] of SCREENS) {
    const s = fs.readFileSync(file, 'utf8');
    ok(/isMediaReady:\s*\(\)\s*=>\s*mediaReadyRef\.current/.test(s)
      && /mediaReadyRef\.current = true/.test(s)
      && /const mediaReadyRef = useRef\(false\)/.test(s),
      label + ' declares, sets and passes mediaReadyRef');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
