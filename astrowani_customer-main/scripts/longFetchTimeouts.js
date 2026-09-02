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
      // THE ACTUAL FIX. hot-updater checks every asset with a HEAD request and
      // fires them all at once; ~25 simultaneous TLS handshakes to one host is
      // enough for some to fail at the OS level with ETIMEDOUT, which is why a
      // DIFFERENT asset failed on every attempt and why retrying never helped.
      // Capping per-origin connections queues them instead of racing them.
      // Modest concurrency. Tried 1 (worse — requests time out queued behind each
      // other) and 4; neither cures an unreliable link, but a smaller number is
      // gentler than hot-updater firing all ~25 asset requests at once.
      connections: 6,
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 600000,
      // Force IPv4. The deploy failed with OS-level ETIMEDOUT — the TCP connection
      // never established — while other requests to the SAME host succeeded, which
      // is the signature of an AAAA route that resolves but blackholes. Node happily
      // prefers IPv6 and then waits out the OS timeout on every attempt.
      connect: { family: 4 },
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

// Diagnostic: hot-updater reports a bare "fetch failed" with no cause, which is
// unactionable. Surface the real error and the URL it was talking to.
const _fetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  try {
    return await _fetch(...args);
  } catch (e) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const method = args[1]?.method || 'GET';
    console.error(
      `  [deploy] FETCH FAILED ${method} ${String(url).slice(0, 120)}` +
        ` | ${e.message} | cause: ${e.cause?.code || e.cause?.message || 'n/a'}`,
    );
    throw e;
  }
};
