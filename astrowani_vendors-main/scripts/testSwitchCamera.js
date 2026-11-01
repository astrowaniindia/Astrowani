#!/usr/bin/env node
/**
 * The camera flip must never ask a camera that is not running.
 *
 *   node scripts/testSwitchCamera.js      (no network, no database, no device)
 *
 * Covers BOTH apps: the helper is duplicated per app, as every other cross-app util here
 * is, and this run checks the two copies have not drifted and that all three screens that
 * flip a camera go through it.
 *
 * WHY (2026-11-01, Sentry ASTROWANI-VENDOR-G: "java.lang.Exception: Error switching
 * camera: switchCamera: camera is not running.", production, build 6.6+36).
 *
 * An astrologer turned the camera off during a video consultation and then tapped the
 * flip-camera button. Disabling a video track does not merely drop frames — react-native-webrtc
 * forwards it to stopCapture(), so the Android capturer is shut down, and a flip in that
 * state can only fail. The failure then escaped as an UNHANDLED promise rejection, because
 * `track._switchCamera()` is declared `void` and drops the promise `applyConstraints()`
 * returns, which is why the synchronous try/catch the call sites wrapped it in never saw it.
 * Sentry reports an unhandled rejection at error level; the consultation itself was fine
 * throughout.
 *
 * Every "it does not ask" case below is paired with a positive control that it DOES ask with
 * the right constraints — a helper that had simply stopped flipping the camera would
 * otherwise pass the whole suite.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const SRC = path.resolve(__dirname, '../src/utils/switchCamera.ts');
const CUSTOMER_SRC = path.resolve(__dirname, '../../astrowani_customer-main/src/utils/switchCamera.ts');

/* Every screen that flips a camera, in both apps. */
const CALL_SITES = [
  [path.resolve(__dirname, '../src/utils/EnxScreenVideo.tsx'), 'the astrologer video consultation screen'],
  [path.resolve(__dirname, '../src/screens/GoLive/GoLiveScreen.tsx'), 'the astrologer live-stream screen'],
  [path.resolve(__dirname, '../../astrowani_customer-main/src/screens/Video/VideoCallScreen.tsx'), 'the customer video consultation screen'],
];

/* Load the REAL module (TypeScript, no React Native deps of its own). */
function loadSwitchCamera() {
  const code = babel.transform(fs.readFileSync(SRC, 'utf8'), {
    filename: SRC,
    presets: [['module:@react-native/babel-preset', {}]],
    babelrc: false,
    configFile: false,
  }).code;
  const mod = {exports: {}};
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports.switchCamera;
}

const switchCamera = loadSwitchCamera();

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass += 1; console.log('  PASS ' + msg); } else { fail += 1; console.log('  FAIL ' + msg); }
};

/* A stand-in for react-native-webrtc's MediaStreamTrack, shaped like v124's: getSettings()
 * returns a clone of the same `_settings` map `_switchCamera()` reads, and applyConstraints()
 * returns a promise. */
function makeTrack(over) {
  const t = {
    kind: 'video',
    remote: false,
    enabled: true,
    readyState: 'live',
    _settings: {deviceId: '1', facingMode: 'user', width: 1280, height: 720, frameRate: 30},
    getSettings() { return JSON.parse(JSON.stringify(this._settings)); },
    calls: [],
    applyConstraints(c) { this.calls.push(c); return this._result || Promise.resolve(); },
  };
  return Object.assign(t, over || {});
}

let unhandled = null;
process.on('unhandledRejection', (r) => { unhandled = r; });

(async () => {
  console.log('\n1. A running camera IS flipped (the positive control)');
  {
    const t = makeTrack();
    switchCamera(t);
    ok(t.calls.length === 1, 'applyConstraints called once');
    ok(t.calls[0] && t.calls[0].facingMode === 'environment', 'front -> back');
    // deviceId takes precedence over facingMode natively, so leaving it in would resolve
    // the flip straight back to the camera we are already on.
    ok(t.calls[0] && !('deviceId' in t.calls[0]), 'deviceId dropped, or the flip no-ops');
    ok(t.calls[0] && t.calls[0].width === 1280 && t.calls[0].height === 720 && t.calls[0].frameRate === 30,
      'capture format carried through unchanged');
  }
  {
    const t = makeTrack({_settings: {deviceId: '0', facingMode: 'environment', width: 640, height: 480, frameRate: 24}});
    switchCamera(t);
    ok(t.calls[0] && t.calls[0].facingMode === 'user', 'back -> front');
  }
  {
    const t = makeTrack();
    switchCamera(t);
    ok(t._settings.deviceId === '1' && t._settings.facingMode === 'user',
      "the track's own settings are not mutated");
  }

  console.log('\n2. A camera that is not running is never asked (ASTROWANI-VENDOR-G)');
  {
    const t = makeTrack({enabled: false});
    switchCamera(t);
    ok(t.calls.length === 0, 'camera switched off by the video toggle: not asked');
  }
  {
    const t = makeTrack({readyState: 'ended'});
    switchCamera(t);
    ok(t.calls.length === 0, 'track already ended as the call tears down: not asked');
  }

  console.log('\n3. Anything that is not a local video track is left alone');
  {
    const t = makeTrack({kind: 'audio'});
    switchCamera(t);
    ok(t.calls.length === 0, 'audio track: not asked');
  }
  {
    const t = makeTrack({remote: true});
    switchCamera(t);
    ok(t.calls.length === 0, 'remote track: not asked');
  }
  {
    let threw = false;
    try { switchCamera(null); switchCamera(undefined); } catch (_) { threw = true; }
    ok(!threw, 'no track at all: no throw');
  }
  {
    const t = makeTrack({getSettings: undefined});
    switchCamera(t);
    ok(t.calls.length === 0, 'no getSettings(): skipped rather than sending malformed constraints');
  }

  console.log('\n4. A native failure is contained, never left for Sentry to report');
  {
    const t = makeTrack();
    t._result = Promise.reject(new Error('Error switching camera: switchCamera: camera is not running.'));
    switchCamera(t, '[test]');
  }
  {
    let threw = false;
    try { switchCamera(makeTrack({applyConstraints() { throw new Error('native blew up'); }})); } catch (_) { threw = true; }
    ok(!threw, 'a synchronous throw from applyConstraints is contained');
  }
  {
    let threw = false;
    try { switchCamera(makeTrack({applyConstraints() { return undefined; }})); } catch (_) { threw = true; }
    ok(!threw, 'a library that returns no promise is tolerated');
  }
  await new Promise((r) => setTimeout(r, 60));
  ok(unhandled === null, 'the rejected flip did NOT surface as an unhandled rejection');

  console.log('\n5. Every call site goes through the helper, not the deprecated API');
  // Asserting on the DELIVERY PATH, not just the helper: a screen that still calls
  // `_switchCamera()` keeps the unhandled rejection no matter how good the helper is.
  for (const [abs, label] of CALL_SITES) {
    const src = fs.readFileSync(abs, 'utf8');
    ok(/from '[./]*(?:utils\/)?switchCamera'/.test(src), label + ' imports the helper');
    ok(!src.includes('_switchCamera('), label + ' no longer calls _switchCamera() directly');
  }

  console.log('\n6. The two apps\' copies of the helper have not drifted apart');
  // Both apps carry their own copy, as every other cross-app util here does. Drift is
  // silent -- one app would keep flipping a camera that is not running, with nothing
  // erroring -- so it is checked rather than trusted (CLAUDE.md subsystem DY).
  ok(fs.readFileSync(SRC, 'utf8') === fs.readFileSync(CUSTOMER_SRC, 'utf8'),
    'astrologer and customer copies are byte-identical');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
