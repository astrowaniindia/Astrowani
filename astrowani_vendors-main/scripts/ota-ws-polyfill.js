// WebSocket polyfill required to run `hot-updater deploy` on Node 20.
//
// WHY: @hot-updater/supabase builds its storage client with @supabase/supabase-js's
// createClient(), which constructs a Realtime client at import time. Realtime requires a
// GLOBAL WebSocket, which Node only ships natively from v22. On Node 20 createClient()
// throws "Node.js 20 detected without native WebSocket support" — and hot-updater catches
// that and reports it as the completely misleading:
//
//     📦 Uploading to Storage (Android • supabaseStorage)
//     ■ fetch failed
//     ■ Failed to upload bundle to storage
//
// which sends you chasing a network problem that isn't there. The Hermes build succeeds
// first, so it looks like the upload specifically is broken. It isn't — this was diagnosed
// on the customer app (2026-08-21) by verifying every layer independently: Supabase
// reachable, bucket present, service-role key valid, and the identical 5 MB bundle.zip
// uploading fine in ~4s via both raw fetch and the plugin's own supabase-js code path. The
// only difference was this global being defined.
//
// Preload this so the global exists before supabase-js is imported:
//
//   NODE_OPTIONS="--max-old-space-size=8192 --require ./scripts/ota-ws-polyfill.js" \
//     npx hot-updater deploy -p android
//
// Only affects the deploy CLI. Nothing here ships in the app bundle. Delete it once this
// project moves to Node 22+, where the global is native.
//
// The same shim exists in astrowani_customer-main, which shipped an OTA update through it.
// This copy is here because the vendor app uses the identical stack and would hit the same
// wall on its next OTA release.

if (typeof globalThis.WebSocket === 'undefined') {
  // eslint-disable-next-line global-require
  globalThis.WebSocket = require('ws');
}
