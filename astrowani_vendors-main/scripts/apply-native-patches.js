// Post-install native fixups. Two independent jobs:
//
//   1. Apply the hand-written CMakeLists.txt patches in patches/ that work around
//      a Windows-only NDK 27 libc++ linking bug (missing `c++` in
//      target_link_libraries). patch-package's own applier rejected these
//      patches (format-strictness bug), but plain `git apply` accepts them fine,
//      so we drive git apply directly. Idempotent: skips a patch that's already
//      applied instead of erroring.
//
//      NOTE: EAS Build uploads a tarball with no .git, so `git apply` fails
//      there and every patch is skipped (you will see the "Skipping" lines in
//      the build log). That is harmless for iOS -- these are Android CMake
//      workarounds for a Windows toolchain bug that Linux/macOS builders do not
//      hit -- but it does mean Android EAS builds are not getting them either.
//
//   2. Neutralise @sentry/react-native's Swift link stub, so the iOS build works.
//      See disableSentrySwiftStub() below for the full reasoning.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const patchesDir = path.join(repoRoot, 'patches');

// ---------------------------------------------------------------------------
// 1. git-apply patches
// ---------------------------------------------------------------------------
function applyPatches() {
  if (!fs.existsSync(patchesDir)) return;
  for (const file of fs.readdirSync(patchesDir)) {
    if (!file.endsWith('.patch')) continue;
    const patchPath = path.join('patches', file);
    try {
      execSync(`git apply --check "${patchPath}"`, { cwd: repoRoot, stdio: 'ignore' });
    } catch (e) {
      console.log(`[apply-native-patches] Skipping ${file} (already applied, target changed, or no git repo)`);
      continue;
    }
    execSync(`git apply "${patchPath}"`, { cwd: repoRoot, stdio: 'inherit' });
    console.log(`[apply-native-patches] Applied ${file}`);
  }
}

// ---------------------------------------------------------------------------
// 2. @sentry/react-native Swift link stub
// ---------------------------------------------------------------------------
//
// WHY: `pod install` fails on iOS with
//
//   [!] The following Swift pods cannot yet be integrated as static libraries:
//       The Swift pod `RNSentry` depends upon `React-hermes`, which does not
//       define modules.
//
// RNSentry is only a "Swift pod" because of ONE file --
// ios/RNSentrySwiftLinkStub.swift -- which its own podspec includes for
// RN >= 0.75. The obvious fixes do not work here:
//
//   * use_frameworks! :linkage => :static  breaks react-native-razorpay, whose
//     vendored xcframeworks are dynamic (see the Podfile LINKAGE note).
//   * use_modular_headers! globally  breaks React Native's own module maps
//     ("Redefinition of module 'ReactCommon'").
//   * React-hermes cannot be re-declared with :modular_headers => true because
//     use_react_native! already declares it.
//
// So we remove the stub instead. That is safe HERE specifically: the file is a
// single unused private constant, and its own comment states it exists only to
// force Swift runtime compatibility libraries to link "when linking a dynamic
// RNSentry framework". We link static libraries, so nothing needs it.
//
// Renamed rather than deleted, so it is obvious what happened and trivially
// reversible. Idempotent, and a no-op if Sentry ever stops shipping the file.
//
// If Sentry is upgraded, re-check this: if a future RNSentry contains real Swift
// code, removing it would break the SDK and this whole approach needs revisiting.
function disableSentrySwiftStub() {
  const stub = path.join(
    repoRoot, 'node_modules', '@sentry', 'react-native', 'ios', 'RNSentrySwiftLinkStub.swift',
  );
  const disabled = stub + '.disabled';

  if (!fs.existsSync(stub)) {
    if (fs.existsSync(disabled)) {
      console.log('[apply-native-patches] Sentry Swift stub already disabled');
    } else {
      console.log('[apply-native-patches] Sentry Swift stub not present (Sentry upgraded? re-check the Podfile note)');
    }
    return;
  }

  // Guard: only disable it while it really is the inert stub. If it ever gains
  // real code, leave it alone and say so loudly rather than silently breaking
  // crash reporting.
  const body = fs.readFileSync(stub, 'utf8');
  const looksInert = /_rnSentrySwiftLinkStub/.test(body) && body.split('\n').filter(
    (l) => l.trim() && !l.trim().startsWith('//'),
  ).length <= 2;

  if (!looksInert) {
    console.warn(
      '[apply-native-patches] WARNING: RNSentrySwiftLinkStub.swift no longer looks like an ' +
      'inert stub -- leaving it in place. iOS pod install will likely fail; see the LINKAGE ' +
      'note in ios/Podfile.',
    );
    return;
  }

  fs.renameSync(stub, disabled);
  console.log('[apply-native-patches] Disabled RNSentrySwiftLinkStub.swift (keeps RNSentry a non-Swift pod for iOS)');
}

applyPatches();
try {
  disableSentrySwiftStub();
} catch (e) {
  // Never fail the install over this; the iOS build will report the real problem.
  console.warn('[apply-native-patches] Sentry stub step failed:', e.message);
}
