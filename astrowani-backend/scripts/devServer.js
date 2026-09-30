#!/usr/bin/env node
/**
 * Local development entry point.
 *
 *   node --env-file=.env scripts/devServer.js
 *
 * WHY THIS EXISTS
 * supabase-js constructs a Realtime client eagerly, and @supabase/realtime-js throws at
 * require time on Node < 22 because there is no global WebSocket:
 *
 *   Error: Node.js 20 detected without native WebSocket support.
 *
 * This machine runs Node 20, so `node index.js` cannot boot at all. Installing the shim
 * here rather than at the top of index.js keeps the production entry point unchanged —
 * the VPS is unaffected either way, and a boot-order workaround belongs with the other
 * developer tooling, not in the file that runs in production.
 *
 * Everything else is index.js exactly as deployed. In particular the billing worker is
 * still gated on ENABLE_SESSION_MANAGER, which is unset locally, so starting this does
 * NOT run billing or earnings resets against the live database.
 */

if (typeof globalThis.WebSocket === 'undefined') {
  try {
    globalThis.WebSocket = require('ws');
    console.log('[devServer] Node < 22: installed the "ws" WebSocket shim.');
  } catch (e) {
    console.error('[devServer] Could not load "ws" — run `npm i ws` in astrowani-backend.');
    process.exit(1);
  }
}

if (process.env.ENABLE_SESSION_MANAGER === 'true') {
  // Refuse rather than warn. This entry point exists for local runs against the live
  // database; starting the billing worker from here would bill real customers and zero
  // today_earnings across every astrologer.
  console.error('[devServer] REFUSING: ENABLE_SESSION_MANAGER=true. Use index.js on the '
    + 'production host; this script is for local development only.');
  process.exit(1);
}

require('../index.js');
