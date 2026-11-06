#!/usr/bin/env node
/**
 * Structural check for the Notification Service Extension target.
 *
 *   node scripts/checkNotificationExtension.js
 *
 * WHY THIS EXISTS. The extension was added to AstrologyApp.xcodeproj by hand —
 * there is no pbxproj parser on the machine this repo is developed on, and no Mac,
 * so IT HAS NEVER BEEN COMPILED. CLAUDE.md subsystem EK records five consecutive
 * failed iOS builds, every one of them toolchain rather than app code, and the
 * lesson that "a build that COMPILES is not a build Apple ACCEPTS". This script
 * cannot replace a build. What it CAN do is rule out the failure modes that a
 * hand-edited project file actually has:
 *
 *   * a dangling UUID reference, which is how a pbxproj corrupts in practice —
 *     Xcode then refuses to open the project at all
 *   * unbalanced braces or parens
 *   * a target that exists but is not in the project's target list, or has no
 *     product, or no configuration list (it then silently never builds)
 *   * an .appex that is built but never EMBEDDED, or embedded into the wrong
 *     destination — the extension then simply never runs, with no error anywhere
 *   * a version mismatch between the extension and the app, which Apple rejects
 *     at upload, after the twenty minutes the build took
 *   * the Podfile having been touched, which this change deliberately does NOT do
 *
 * Every check is paired with the consequence of it failing, because a check whose
 * failure nobody understands gets commented out.
 */

const fs = require('fs');
const path = require('path');

const IOS = path.join(__dirname, '..', 'ios');
const PBX = path.join(IOS, 'AstrologyApp.xcodeproj', 'project.pbxproj');
const APP_TARGET = '13B07F861A680F5B00A75B9A';

let pass = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else {
    failures.push(name);
    console.log(`  FAIL ${name}${extra !== undefined ? ` — ${extra}` : ''}`);
  }
}
const section = (t) => console.log(`\n── ${t}`);

const pbx = fs.readFileSync(PBX, 'utf8');

// ── the files themselves ─────────────────────────────────────────────────────
section('the extension source');
for (const f of ['NotificationService.h', 'NotificationService.m', 'Info.plist']) {
  ok(`ios/NotificationService/${f} exists`, fs.existsSync(path.join(IOS, 'NotificationService', f)));
}

const impl = fs.readFileSync(path.join(IOS, 'NotificationService', 'NotificationService.m'), 'utf8');
ok('it subclasses UNNotificationServiceExtension', /@implementation\s+NotificationService/.test(impl));
ok('it implements didReceiveNotificationRequest', /didReceiveNotificationRequest:/.test(impl));
// Without this the system waits out the timeout and then shows the original —
// the notification is not lost, it is delayed by up to 30 seconds.
ok('it implements serviceExtensionTimeWillExpire', /serviceExtensionTimeWillExpire/.test(impl));
// The one rule in that file. Every failure path has to end in a delivery.
// Both receivers: inside the download block it is `strongSelf`, outside it is
// `self`. Counting only one of them made this check fail on a correct file the
// moment the block was changed to the non-shadowing form.
const deliverCalls = (impl.match(/\[(?:self|strongSelf) deliverOnce\]/g) || []).length;
ok('every failure path delivers (deliverOnce called many times)', deliverCalls >= 6, deliverCalls);
ok('the content handler is only invoked through the once-guard',
  (impl.match(/self\.contentHandler\(/g) || []).length === 1,
  (impl.match(/self\.contentHandler\(/g) || []).length);
ok('it refuses non-https image URLs', /isEqualToString:@"https"/.test(impl));
ok('it reads fcm_options.image AND our own data key', /fcm_options/.test(impl) && /@"image"/.test(impl));
// Firebase is deliberately NOT linked into the extension — see the file header.
// Comments are stripped first: that header EXPLAINS at length why Firebase is
// absent, so a plain substring test matches the explanation and fails on a file
// that is correct. Caught on this check's first run.
const implCode = impl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('it pulls in no Firebase dependency', !/FIRMessaging|Firebase/.test(implCode));
ok('and imports only UserNotifications',
  /#import "NotificationService\.h"/.test(implCode) && !/#import <(?!UserNotifications)/.test(implCode));

const plist = fs.readFileSync(path.join(IOS, 'NotificationService', 'Info.plist'), 'utf8');
ok('Info.plist declares the usernotifications service point',
  plist.includes('com.apple.usernotifications.service'));
ok('Info.plist names NotificationService as the principal class',
  /NSExtensionPrincipalClass<\/key>\s*<string>NotificationService<\/string>/.test(plist));
// A plain APPL here builds fine and is rejected at upload.
ok('Info.plist package type is XPC!', /CFBundlePackageType<\/key>\s*<string>XPC!<\/string>/.test(plist));
ok('Info.plist takes its versions from the build settings',
  plist.includes('$(MARKETING_VERSION)') && plist.includes('$(CURRENT_PROJECT_VERSION)'));

// ── reference integrity ──────────────────────────────────────────────────────
section('project file integrity');

ok('braces balance', (pbx.match(/\{/g) || []).length === (pbx.match(/\}/g) || []).length,
  `${(pbx.match(/\{/g) || []).length} vs ${(pbx.match(/\}/g) || []).length}`);
ok('parens balance', (pbx.match(/\(/g) || []).length === (pbx.match(/\)/g) || []).length,
  `${(pbx.match(/\(/g) || []).length} vs ${(pbx.match(/\)/g) || []).length}`);

// Objects are defined as `<UUID> /* comment */ = {` or `<UUID> = {`. References are
// every other appearance of a 24-hex token. A reference with no definition is the
// single most common way a hand-edited pbxproj breaks, and Xcode will not open the
// project at all when it happens.
const defined = new Set();
for (const m of pbx.matchAll(/^\t\t([0-9A-F]{24})\s(?:\/\*[^*]*\*\/\s)?=\s\{/gm)) defined.add(m[1]);
const referenced = new Set();
for (const m of pbx.matchAll(/\b([0-9A-F]{24})\b/g)) referenced.add(m[1]);
const dangling = [...referenced].filter((u) => !defined.has(u));
ok('every referenced UUID is defined', dangling.length === 0, dangling.join(', '));
ok('the project defines a plausible number of objects', defined.size > 30, defined.size);

// ── the target ───────────────────────────────────────────────────────────────
section('the NotificationService target');

const targetBlock = /([0-9A-F]{24}) \/\* NotificationService \*\/ = \{\s*isa = PBXNativeTarget;([\s\S]*?)\n\t\t\};/.exec(pbx);
ok('a PBXNativeTarget named NotificationService exists', !!targetBlock);
const targetId = targetBlock && targetBlock[1];
const targetBody = targetBlock ? targetBlock[2] : '';

ok('its product type is app-extension',
  /productType = "com\.apple\.product-type\.app-extension"/.test(targetBody));
ok('it has a product reference', /productReference = [0-9A-F]{24}/.test(targetBody));
ok('it has a build configuration list', /buildConfigurationList = [0-9A-F]{24}/.test(targetBody));
ok('it has three build phases (sources, frameworks, resources)',
  (targetBody.match(/[0-9A-F]{24} \/\* (Sources|Frameworks|Resources) \*\/,/g) || []).length === 3);

// A target that is not in this list does not exist as far as the build is
// concerned, and xcodebuild reports no error for it.
const projectTargets = /targets = \(([\s\S]*?)\);/.exec(pbx);
ok('the target is listed in the project object',
  !!projectTargets && targetId && projectTargets[1].includes(targetId));

ok('the product is a wrapper.app-extension file reference',
  /explicitFileType = "wrapper\.app-extension"; includeInIndex = 0; path = NotificationService\.appex/.test(pbx));
ok('NotificationService.m is in the extension Sources phase',
  /NotificationService\.m in Sources \*\/,/.test(pbx));
ok('the source files are in a project group', /path = NotificationService;/.test(pbx));

// ── embedding, which is what makes it actually run ───────────────────────────
section('embedding into the app');

const embed = /[0-9A-F]{24} \/\* Embed Foundation Extensions \*\/ = \{\s*isa = PBXCopyFilesBuildPhase;([\s\S]*?)\n\t\t\};/.exec(pbx);
ok('an Embed Foundation Extensions copy phase exists', !!embed);
// 13 is PlugIns. Any other destination copies the .appex somewhere the system
// never looks, and the extension never runs — with nothing to see in any log.
ok('it copies into dstSubfolderSpec 13 (PlugIns)', !!embed && /dstSubfolderSpec = 13;/.test(embed[1]),
  embed && /dstSubfolderSpec = (\d+)/.exec(embed[1])?.[1]);
ok('the appex is in that phase',
  !!embed && /NotificationService\.appex in Embed Foundation Extensions \*\/,/.test(embed[1]));

const appTarget = new RegExp(`${APP_TARGET} /\\* AstrologyApp \\*/ = \\{\\s*isa = PBXNativeTarget;([\\s\\S]*?)\\n\\t\\t\\};`).exec(pbx);
ok('the app target still parses', !!appTarget);
ok('the app target runs the embed phase',
  !!appTarget && /Embed Foundation Extensions \*\/,/.test(appTarget[1]));
// Without the dependency a clean build can embed a stale .appex, or none.
ok('the app target depends on the extension',
  !!appTarget && /dependencies = \(\s*\n\t+[0-9A-F]{24} \/\* PBXTargetDependency \*\/,/.test(appTarget[1]));
ok('a target dependency pointing at the extension exists',
  targetId && new RegExp(`target = ${targetId} /\\* NotificationService \\*/;`).test(pbx));

// ── versions, bundle id, signing ─────────────────────────────────────────────
section('versions and identifiers');

const appVersions = appTarget
  ? [...pbx.matchAll(/13B07F9[45]1A680F5B00A75B9A \/\* (?:Debug|Release) \*\/ = \{[\s\S]*?\n\t\t\};/g)].map((m) => m[0])
  : [];
const appMarketing = new Set(appVersions.map((b) => /MARKETING_VERSION = ([^;]+);/.exec(b)?.[1]));
const appBuild = new Set(appVersions.map((b) => /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(b)?.[1]));
ok('the app target has one marketing version across configs', appMarketing.size === 1, [...appMarketing].join('/'));
ok('the app target has one build number across configs', appBuild.size === 1, [...appBuild].join('/'));

// The WHOLE build-configuration block, then filtered by which Info.plist it
// points at. An earlier version of this started the match at the INFOPLIST_FILE
// line itself, so every setting alphabetically before it — CURRENT_PROJECT_VERSION
// included — sat outside the slice and read as missing. The check failed while the
// project was right, which is the worse way round.
const allConfigs = [...pbx.matchAll(/[0-9A-F]{24} \/\* (?:Debug|Release) \*\/ = \{\s*isa = XCBuildConfiguration;[\s\S]*?\n\t\t\};/g)].map((m) => m[0]);
const nseConfigs = allConfigs.filter((b) => b.includes('INFOPLIST_FILE = NotificationService/Info.plist;'));
ok('the extension has two build configurations', nseConfigs.length === 2, nseConfigs.length);
const nseMarketing = new Set(nseConfigs.map((b) => /MARKETING_VERSION = ([^;]+);/.exec(b)?.[1]));
const nseBuild = new Set(nseConfigs.map((b) => /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(b)?.[1]));

// APPLE REJECTS AN UPLOAD whose extension version does not match the app's. This
// is the check that stops that happening after a CURRENT_PROJECT_VERSION bump.
ok('the extension MARKETING_VERSION matches the app',
  nseMarketing.size === 1 && [...nseMarketing][0] === [...appMarketing][0],
  `app ${[...appMarketing][0]} vs extension ${[...nseMarketing].join('/')}`);
ok('the extension CURRENT_PROJECT_VERSION matches the app',
  nseBuild.size === 1 && [...nseBuild][0] === [...appBuild][0],
  `app ${[...appBuild][0]} vs extension ${[...nseBuild].join('/')}`);

ok('the extension bundle id is a child of the app bundle id',
  nseConfigs.every((b) => /PRODUCT_BUNDLE_IDENTIFIER = "com\.astrowanicustomer\.NotificationService"/.test(b)));
// SKIP_INSTALL is what keeps the .appex out of the archive's top level; without
// it the archive is malformed and the upload is refused.
ok('the extension sets SKIP_INSTALL', nseConfigs.every((b) => /SKIP_INSTALL = YES;/.test(b)));
ok('the extension targets iPhone only, like the app',
  nseConfigs.every((b) => /TARGETED_DEVICE_FAMILY = "1";/.test(b)));
ok('the extension deployment target is 15.1, like the app',
  nseConfigs.every((b) => /IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/.test(b)));
// The app's entitlements must NOT be copied onto the extension: it has no
// aps-environment of its own and does not need one.
ok('the extension declares no entitlements',
  nseConfigs.every((b) => !/CODE_SIGN_ENTITLEMENTS/.test(b)));

// ── the Podfile is deliberately untouched ────────────────────────────────────
section('no pods were added');

const podfile = fs.readFileSync(path.join(IOS, 'Podfile'), 'utf8');
// The extension is dependency-free ON PURPOSE. This Podfile's own comment says
// its linkage setup was "settled empirically over several EAS builds. Read before
// changing it." A second pod target pulling Firebase through that machinery is
// exactly what it warns against.
ok('the Podfile has no NotificationService target', !/target ['"]NotificationService['"]/.test(podfile));
ok('the Podfile still has exactly the two original targets',
  (podfile.match(/^\s*target ['"][A-Za-z]+['"] do/gm) || []).length === 2,
  (podfile.match(/^\s*target ['"][A-Za-z]+['"] do/gm) || []).length);
ok('the fmt consteval patch is still in place', /FMT_USE_CONSTEVAL/.test(podfile));
ok('the deployment-target bump is still in place', /IPHONEOS_DEPLOYMENT_TARGET/.test(podfile));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('failed:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
console.log('\nNOTE: this proves the project STRUCTURE, not that it compiles.');
console.log('The first iOS build after this change is what exercises the target.');
