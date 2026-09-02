// Raises Node's HTTP client timeouts for the OTA deploy.
//
// WHY: hot-updater's bundle upload kept failing with a bare "fetch failed", which
// looked like a bad connection and survived seven retries. It is not bandwidth.
// Node's fetch is undici, whose default connect/headers timeout is 10 SECONDS.
// Measured against the same Supabase bucket, on a healthy connection:
//
//     1MB -> 200 in 1666ms   (615 KB/s)
//     8MB -> FAILED after 10581ms, UND_ERR_CONNECT_TIMEOUT
//
// The bundle is ~7-8MB, so at any upload speed below roughly 800 KB/s it cannot
// finish inside 10s and dies every single time — on a different asset each run,
// which is what made it look random. Retrying can never help; the wall is fixed.
//
// Preloaded with `node --require` from deployOta.js so it applies to hot-updater's
// own fetch calls. Deploy-time only: it is not imported by the app, and changes
// nothing about how the app itself makes requests.
try {
  const { setGlobalDispatcher, Agent } = require('undici');
  setGlobalDispatcher(
    new Agent({
      connectTimeout: 120000, // 2 min to establish
      headersTimeout: 600000, // 10 min waiting on response headers
      bodyTimeout: 600000, // 10 min to stream the body
    }),
  );
  if (!process.env.HOT_UPDATER_QUIET) {
    console.log('  [deploy] HTTP timeouts raised (undici default 10s is shorter than a bundle upload)');
  }
} catch (e) {
  // Non-fatal: without this the deploy still runs, it just keeps the 10s default
  // and will fail on a slow link. Better to attempt the deploy than to block it.
  console.warn('  [deploy] could not raise HTTP timeouts:', e.message);
}
