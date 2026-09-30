/**
 * Local-only test overrides for the instant free call.
 *
 * WHY THIS EXISTS
 * ---------------
 * A local backend on this project reads the LIVE Supabase database. Turning the instant
 * free call on the normal way means writing `enabled: true` into `app_settings`, and the
 * production backend reads that same row — so a local test would switch a real offer on
 * for real customers on installed apps. This module makes the local process behave as if
 * the offer were on, WITHOUT writing anything to the shared configuration.
 *
 * It also suppresses the astrologer payout, because that moves real rupees between
 * `astrologers.wallet_balance` and `admin_wallet` in the production ledger. A test must
 * not need a teardown script to put money back.
 *
 * WHAT IT CANNOT ISOLATE — read this before assuming a test leaves no trace.
 * There is one database. A real end-to-end run still INSERTs rows into
 * `free_call_bookings`, `call_requests` and `chat_sessions`, because that is the flow
 * being tested. Those rows are created against the customer you test with, and
 * `scripts/freeCallTestCleanup.js` removes them. What this module guarantees is that no
 * SETTING and no BALANCE changes.
 *
 * SAFETY INTERLOCK
 * ----------------
 * Two conditions must hold, not one:
 *   1. FREE_CALL_LOCAL_TEST === 'true'
 *   2. ENABLE_SESSION_MANAGER !== 'true'
 *
 * (2) is the interlock that matters. ENABLE_SESSION_MANAGER is 'true' on exactly one
 * host — the VPS that owns billing — so even if this variable were ever copied into the
 * production environment by mistake, the override refuses to arm there and says so.
 * A single boolean would not survive one careless copy of an .env file.
 *
 * Do NOT add FREE_CALL_LOCAL_TEST to the allowlist in .github/workflows/set-backend-env.yml.
 * That workflow is the only supported way secrets reach the VPS, and keeping this name
 * out of it means there is no path by which it can be deployed.
 */

const ENABLED_FLAG = process.env.FREE_CALL_LOCAL_TEST === 'true';
const LOOKS_LIKE_PRODUCTION = process.env.ENABLE_SESSION_MANAGER === 'true';

const ACTIVE = ENABLED_FLAG && !LOOKS_LIKE_PRODUCTION;

if (ENABLED_FLAG && LOOKS_LIKE_PRODUCTION) {
  // Loud, because the alternative is silently running a test configuration in front of
  // paying customers.
  console.error(
    '[freeCallLocalTest] REFUSING TO ARM: FREE_CALL_LOCAL_TEST is set, but this process '
    + 'is running the session manager, which means it is the production host. The '
    + 'override is OFF. Remove FREE_CALL_LOCAL_TEST from this environment.',
  );
}

if (ACTIVE) {
  console.warn(
    '\n==================== FREE CALL LOCAL TEST MODE ====================\n'
    + '  The instant free-call offer is FORCED ON for this process only.\n'
    + '  app_settings is NOT modified — production is unaffected.\n'
    + '  Astrologer payout is SUPPRESSED — no wallet or admin_wallet writes.\n'
    + '  Eligibility checks are BYPASSED for the test customer.\n'
    + '  Booking/session rows ARE still written: clean up with\n'
    + '    node --env-file=.env scripts/freeCallTestCleanup.js <mobile>\n'
    + '===================================================================\n',
  );
}

/**
 * Filler cards for the instant list, so the two-per-row grid can be judged without
 * opting real astrologers into the pool (which would put a live "Call free" button in
 * front of someone who is actually working).
 *
 * DISPLAY ONLY. These ids are not astrologers and ringing one will fail — that is
 * deliberate, because a fake card that could place a real call is worse than one that
 * obviously cannot. They are named so nobody mistakes them for live data.
 *
 * Count comes from FREE_CALL_TEST_FAKE_CARDS; 0 (the default) adds none.
 */
function fakeCards() {
  if (!ACTIVE) return [];
  const n = Math.max(0, Math.min(8, parseInt(process.env.FREE_CALL_TEST_FAKE_CARDS || '0', 10) || 0));
  if (!n) return [];
  const seed = [
    { name: 'DEMO · Acharya Vishal Sharma', experience: 14, languages: ['Hindi', 'English', 'Marathi'], rating: 4.9, totalReviews: 512, badgeType: 'verified', isBusy: false },
    { name: 'DEMO · Pandit Rajesh Trivedi', experience: 8, languages: ['Hindi'], rating: 4.6, totalReviews: 88, badgeType: null, isBusy: false },
    { name: 'DEMO · Dr. Meenakshi Iyer', experience: 21, languages: ['Tamil', 'English'], rating: 5.0, totalReviews: 1204, badgeType: 'celebrity', isBusy: false },
    // One busy card, so the amber "Busy · Xm" state and the Notify me button are
    // visible in the grid too — that half of the layout is easy to forget.
    { name: 'DEMO · Guru Prakash', experience: 6, languages: ['Hindi', 'Bhojpuri'], rating: 4.3, totalReviews: 41, badgeType: null, isBusy: true },
  ];
  return seed.slice(0, n).map((c, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    image: '',
    busySince: c.isBusy ? new Date(Date.now() - 4 * 60 * 1000).toISOString() : null,
    busyReason: c.isBusy ? 'session' : null,
    ...c,
  }));
}

/** Astrologer ids to offer, from FREE_CALL_TEST_POOL (comma-separated uuids). */
function testPool() {
  return String(process.env.FREE_CALL_TEST_POOL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Force the offer on, in memory only. Called at the very end of loadOffer(), so it
 * overrides the clamped, merged result rather than being clamped itself away.
 */
function applyToOffer(offer) {
  if (!ACTIVE || !offer) return offer;
  const pool = testPool();
  offer.enabled = true;
  offer.mode = 'instant';
  if (pool.length) {
    // Union, so an astrologer who genuinely opted in is still offered.
    offer.effectiveInstantPool = [...new Set([...(offer.effectiveInstantPool || []), ...pool])];
  }
  offer.localTestMode = true;
  return offer;
}

/**
 * Bypass the "new customers only" / already-used gates. Without this a useful test
 * account is single-use: the first run consumes the offer and every later run answers
 * NOT_ELIGIBLE, which reads exactly like a bug in the feature being tested.
 */
const bypassEligibility = () => ACTIVE;

/**
 * Suppress the milestone payout. The money path has its own dedicated verification
 * against the live database; an interactive UI test should not be moving real balances
 * around as a side effect of hanging up.
 */
const skipPayout = () => ACTIVE;

module.exports = {
  ACTIVE,
  applyToOffer,
  bypassEligibility,
  skipPayout,
  testPool,
  fakeCards,
};
