#!/usr/bin/env node
/**
 * Ship one JS bundle to BOTH platforms in one command.
 *
 * WHY THIS EXISTS: `hot-updater deploy` takes a single `-p ios|android`, so
 * shipping both is two commands — and forgetting the second is silent. That is
 * exactly what happened on 2026-08-25: the storefront bundle went to
 * android/production only, and iOS quietly stayed several features behind with
 * nothing anywhere reporting a problem. This script makes the default action
 * "both", and exits non-zero if either platform fails, so drift cannot happen
 * by omission.
 *
 *   node scripts/deployOta.js                    # both platforms, production
 *   node scripts/deployOta.js --platform ios     # one platform, deliberately
 *   node scripts/deployOta.js --channel staging
 *   node scripts/deployOta.js --rollout 20       # canary to 20% of installs
 *
 * IT DOES NOT BUILD NATIVE CODE. An OTA replaces the JS bundle only. If a change
 * needs new native code (a new native module, a permission, an icon), OTA cannot
 * carry it and pushing anyway breaks the installed app at runtime — see the
 * pre-flight note about native dependencies below.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLATFORMS = ['android', 'ios'];

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const has = (name) => argv.includes(name);

const only = argOf('--platform') || argOf('-p');
const channel = argOf('--channel') || argOf('-c') || 'production';
const rollout = argOf('--rollout') || argOf('-r');
const message = argOf('--message') || argOf('-m');
const allowDirty = has('--allow-dirty');
// Override the version an OTA is aimed at. Needed when the store is still
// serving an older versionName than the working tree carries -- the bundle
// would otherwise target a release nobody is running yet.
const targetOverride = argOf('--target') || argOf('-t');
const dryRun = has('--dry-run');

if (only && !PLATFORMS.includes(only)) {
  console.error(`--platform must be one of: ${PLATFORMS.join(', ')}`);
  process.exit(1);
}
const targets = only ? [only] : PLATFORMS;

// stderr is swallowed via stdio, NOT a `2>/dev/null` shell redirect: execSync
// uses cmd.exe on Windows, where that path does not exist — it printed an error
// and threw, which silently disabled the native-dependency guard below on the
// one platform this repo is actually developed on.
const sh = (cmd) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const say = (s = '') => console.log(s);

// ── pre-flight ───────────────────────────────────────────────────────────────
// None of these block a deploy on their own judgement except a dirty tree; the
// rest print what the operator needs in order to decide.

let dirty = '';
let commit = '(unknown)';
let subject = '';
try {
  // Scoped to THIS app with `-- .`, not the whole repo. This is a monorepo:
  // an untracked file in astrowani-shop or the backend cannot end up in this
  // app's bundle, and blocking on it would train people to pass --allow-dirty
  // reflexively, which defeats the check.
  dirty = sh('git status --porcelain -- .');
  commit = sh('git rev-parse --short HEAD');
  subject = sh('git log -1 --pretty=%s');
} catch (_) {
  say('! not a git repo, or git unavailable — skipping the working-tree check');
}

say('');
say('  Hot Updater — JS bundle deploy');
say(`  commit    ${commit}  ${subject}`);
say(`  channel   ${channel}`);
say(`  platforms ${targets.join(' + ')}${rollout ? `   rollout ${rollout}%` : ''}`);
// Print the version each platform will be aimed at BEFORE deploying, so a
// --dry-run can actually verify it. A bundle aimed at a version the store is
// not serving reaches nobody, and that is invisible unless it is stated here.
targets.forEach((p) => {
  const t = targetOverride || (p === 'ios' ? iosMarketingVersion() : null);
  say(`  target    ${p.padEnd(8)} ${t || '(read from native config by hot-updater)'}`);
});
say('');

// An OTA ships the WHOLE bundle at the current working tree, not just the change
// you have in mind. Uncommitted edits go out with it, and there is no record of
// what was in them.
if (dirty && !allowDirty) {
  say('  Refusing to deploy: the working tree has uncommitted changes.');
  say('');
  say(dirty.split('\n').slice(0, 20).map((l) => `    ${l}`).join('\n'));
  if (dirty.split('\n').length > 20) say(`    … and ${dirty.split('\n').length - 20} more`);
  say('');
  say('  An OTA ships the entire bundle built from these files, so whatever is');
  say('  listed above would go to every user with no commit recording it.');
  say('  Commit (or stash) first, or pass --allow-dirty if you mean it.');
  process.exit(1);
}

// hot-updater reads the target version out of the native config, but iOS's
// Info.plist carries CFBundleShortVersionString = $(MARKETING_VERSION) -- an
// Xcode build variable it cannot resolve. It then fails with "Target app version
// not found in native files" AND EXITS 0, which is how an "ios deployed" line
// once appeared for a platform that deployed nothing. Read the real value out of
// project.pbxproj and pass it explicitly.
function iosMarketingVersion() {
  try {
    const iosDir = path.join(ROOT, 'ios');
    const proj = fs
      .readdirSync(iosDir)
      .find((d) => d.endsWith('.xcodeproj'));
    if (!proj) return null;
    const pbx = fs.readFileSync(path.join(iosDir, proj, 'project.pbxproj'), 'utf8');
    const found = [...pbx.matchAll(/MARKETING_VERSION\s*=\s*([0-9][^;\s]*)/g)].map((m) => m[1]);
    const unique = [...new Set(found)];
    if (unique.length !== 1) return null; // ambiguous: let hot-updater complain
    return unique[0];
  } catch (_) {
    return null;
  }
}

// iOS with no Podfile.lock has never had `pod install` run, which in practice
// means no iOS build exists in the field for the bundle to land on.
if (targets.includes('ios') && !fs.existsSync(path.join(ROOT, 'ios', 'Podfile.lock'))) {
  say('  Note: ios/Podfile.lock is missing, so this app has never been built for iOS.');
  say('  The bundle will upload, but no installed build will pick it up yet.');
  say('');
}

// The one failure mode an OTA cannot detect for itself. A bundle whose JS calls
// a native module the installed binary does not have fails at runtime, silently,
// on every phone — the react-native-razorpay 2.3.0 -> 3.0.0 case in CLAUDE.md.
try {
  // --relative + `-- .` because git reports paths from the REPO root even when
  // run in a subdirectory, so in this monorepo the filter below was matching
  // against 'astrowani_customer-main/ios/...' and never firing.
  const changed = sh('git diff --name-only --relative HEAD~1..HEAD -- .');
  const nativeTouched = changed
    .split('\n')
    .filter((f) => /^(package\.json|ios\/|android\/)/.test(f) && !/\.md$/.test(f));
  if (nativeTouched.length) {
    say('  ⚠  The last commit touched native or dependency files:');
    nativeTouched.slice(0, 12).forEach((f) => say(`       ${f}`));
    say('');
    say('  An OTA carries JS only. If any of this added or changed a NATIVE module,');
    say('  the new JS will run against the old native code on every installed phone.');
    say('  Confirm the native API is unchanged, or ship a store build instead.');
    say('');
  }
} catch (_) { /* advisory only */ }

if (dryRun) {
  say('  --dry-run: nothing was deployed.');
  process.exit(0);
}

// ── deploy ───────────────────────────────────────────────────────────────────
const results = [];
for (const platform of targets) {
  const args = ['hot-updater', 'deploy', '-p', platform, '-c', channel];
  const target =
    targetOverride || (platform === 'ios' ? iosMarketingVersion() : null);
  if (target) args.push('-t', target);
  if (rollout) args.push('-r', rollout);
  if (message) args.push('-m', message);

  say(`── ${platform}${target ? `  (target ${target})` : ''} ${'─'.repeat(34)}`);
  // Output is CAPTURED, not inherited, because the exit code alone is a liar:
  // hot-updater exits 0 after printing "Target app version not found in native
  // files" and skipping the deploy entirely. Trusting `status === 0` reported
  // "ios deployed" for a platform that had deployed nothing — precisely the
  // silent split this script exists to prevent. A real deploy always prints
  // "Deployment Successful", so require that marker too.
  // If a future hot-updater renames that string this will report FAILED for a
  // deploy that worked. That is the safe direction: a false alarm you can see
  // beats a false success you cannot.
  const run = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8', shell: true });
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  process.stdout.write(output);

  const sawSuccess = /Deployment Successful/i.test(output);
  const okRun = run.status === 0 && sawSuccess;
  if (run.status === 0 && !sawSuccess) {
    say('');
    say(`  ⚠  ${platform}: hot-updater exited 0 but never reported a successful`);
    say('     deployment. Treating this as a FAILURE. Look for a target-version');
    say('     or config error in the output above.');
  }
  results.push({ platform, ok: okRun });
  say('');

  // Deliberately DO NOT stop after a failure: if android succeeded and ios then
  // fails, stopping would leave exactly the split this script exists to prevent,
  // and the operator needs to see both outcomes to know what to fix.
}

// ── report ───────────────────────────────────────────────────────────────────
say('  Result');
results.forEach((r) => say(`    ${r.platform.padEnd(8)} ${r.ok ? 'deployed' : 'FAILED'}`));
say('');

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  if (failed.length < results.length) {
    say(`  ⚠  PLATFORMS ARE NOW OUT OF STEP. ${results.filter((r) => r.ok).map((r) => r.platform).join(', ')}`);
    say(`     received this bundle and ${failed.map((r) => r.platform).join(', ')} did not.`);
    say('     Fix and re-run, or the platforms stay on different JS.');
  }
  process.exit(1);
}

say('  Both platforms are on the same bundle.');
say('  Roll back with:  npx hot-updater bundle disable <id>');
