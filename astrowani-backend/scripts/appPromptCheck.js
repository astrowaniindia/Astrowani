// Assertions for the update-prompt version comparison. DB-free and network-free —
// run it after touching the arithmetic in src/appPromptRoutes.js:
//
//   node scripts/appPromptCheck.js
//
// The rule being protected: an unparseable version must NEVER compare as "behind",
// because "behind the minimum supported version" is what raises a popup with no way
// out of it. Every ambiguous input has to land on "do not prompt".
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48); // module-load guard only

// supabase-js constructs a RealtimeClient at createClient() time and Node 20 has no
// global WebSocket, so merely REQUIRING a module that builds a Supabase client throws.
// Nothing here talks to Supabase — this only gets the require to complete.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* checked below */ }
}

const { compareVersions } = require('../src/appPromptRoutes');

let pass = 0;
const failures = [];

function check(label, actual, expected) {
  if (actual === expected) {
    pass += 1;
  } else {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Ordering ────────────────────────────────────────────────────────────────
check('24.0 < 24.1', compareVersions('24.0', '24.1'), -1);
check('24.1 == 24.1', compareVersions('24.1', '24.1'), 0);
check('24.2 > 24.1', compareVersions('24.2', '24.1'), 1);

// Numeric, not lexicographic — the classic "9 > 10" string-compare bug.
check('24.9 < 24.10', compareVersions('24.9', '24.10'), -1);
check('2.9 < 10.0', compareVersions('2.9', '10.0'), -1);

// Missing trailing segments are zero.
check('24 == 24.0', compareVersions('24', '24.0'), 0);
check('24 < 24.0.1', compareVersions('24', '24.0.1'), -1);
check('24.1 > 24', compareVersions('24.1', '24'), 1);

// Whitespace is tolerated (a version pasted into the admin form).
check('" 24.1 " == 24.1', compareVersions(' 24.1 ', '24.1'), 0);

// ── Everything ambiguous returns null ───────────────────────────────────────
check('null installed', compareVersions(null, '24.1'), null);
check('undefined installed', compareVersions(undefined, '24.1'), null);
check('empty string', compareVersions('', '24.1'), null);
check('missing target', compareVersions('24.1', null), null);
check('empty target', compareVersions('24.1', ''), null);
check('semver pre-release', compareVersions('24.1-beta', '24.1'), null);
check('letters', compareVersions('v24.1', '24.1'), null);
check('trailing dot', compareVersions('24.', '24.1'), null);
check('double dot', compareVersions('24..1', '24.1'), null);
check('not a version at all', compareVersions('latest', '24.1'), null);

// ── The decision the endpoint makes on top of that ─────────────────────────
// Mirrors the branch in GET /api/app/update-check: only an explicit `true` prompts,
// and only an explicit `true` on the minimum forces.
function decide(installed, latest, minSupported) {
  const behind = compareVersions(installed, latest);
  const below = compareVersions(installed, minSupported);
  const behindLatest = behind === null ? null : behind < 0;
  const belowMinimum = below === null ? null : below < 0;
  if (behindLatest !== true && belowMinimum !== true) return 'none';
  return belowMinimum === true ? 'force' : 'soft';
}

check('current build, nothing shown', decide('24.1', '24.1', '20.0'), 'none');
check('newer than published, nothing shown', decide('24.2', '24.1', '20.0'), 'none');
check('one behind, soft prompt', decide('24.0', '24.1', '20.0'), 'soft');
check('below minimum, forced', decide('19.0', '24.1', '20.0'), 'force');
check('exactly at minimum, soft only', decide('20.0', '24.1', '20.0'), 'soft');
check('unparseable installed never prompts', decide('v24.0', '24.1', '20.0'), 'none');
check('unparseable installed never forces', decide('nonsense', '24.1', '99.0'), 'none');
check('unparseable minimum cannot force', decide('24.0', '24.1', 'bad'), 'soft');
check('no config at all shows nothing', decide('24.0', null, null), 'none');

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.error(`  FAIL  ${f}`));
  process.exit(1);
}
console.log('All app-prompt version checks passed.\n');
