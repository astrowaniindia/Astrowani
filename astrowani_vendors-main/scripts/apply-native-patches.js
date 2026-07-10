// Applies the hand-written CMakeLists.txt patches in patches/ that work around a
// Windows-only NDK 27 libc++ linking bug (missing `c++` in target_link_libraries).
// patch-package's own applier rejected these patches (format-strictness bug), but
// plain `git apply` accepts them fine, so we drive git apply directly here.
// Idempotent: skips a patch that's already applied instead of erroring.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const patchesDir = path.join(__dirname, '..', 'patches');
const repoRoot = path.join(__dirname, '..');

if (!fs.existsSync(patchesDir)) process.exit(0);

for (const file of fs.readdirSync(patchesDir)) {
  if (!file.endsWith('.patch')) continue;
  const patchPath = path.join('patches', file);
  try {
    execSync(`git apply --check "${patchPath}"`, { cwd: repoRoot, stdio: 'ignore' });
  } catch (e) {
    console.log(`[apply-native-patches] Skipping ${file} (already applied or target changed)`);
    continue;
  }
  execSync(`git apply "${patchPath}"`, { cwd: repoRoot, stdio: 'inherit' });
  console.log(`[apply-native-patches] Applied ${file}`);
}
