#!/usr/bin/env node
/**
 * Website -> app install attribution, offline. The website tags every Play Store
 * link with referrer=utm_source=web_<page> (astrowani-website/script.js); this
 * checks that what the website builds survives the Play URL round trip, is stored
 * as the same source, buckets to the `web` channel, and that the existing
 * channels are untouched.
 *
 *   node scripts/testWebAttribution.js
 */
const fs = require('fs');
const path = require('path');
const a = require('../src/acquisition');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log(`FAIL  ${m}${x !== undefined ? `  (${JSON.stringify(x)})` : ''}`); } };

// Build the link exactly the way the website does, then read it back the way
// Play hands it to the app.
function tagged(source) {
  const u = new URL('https://play.google.com/store/apps/details?id=com.astrowanicustomer&hl=en_IN');
  u.searchParams.set('referrer', `utm_source=${source}&utm_medium=website&utm_campaign=site`);
  return new URL(u.toString()).searchParams.get('referrer');
}

for (const src of ['web_home', 'web_hi_home', 'web_blog_article', 'web_astrologer_profile', 'web_privacy_policy', 'web_kundli_reading']) {
  const { source } = a.parseReferrer(tagged(src));
  ok(source === src, `${src} survives the Play URL round trip unchanged`, source);
  ok(a.channelOf(source) === 'web', `${src} is the web channel`, a.channelOf(source));
  ok(a.isWebSource(source) && !a.isQrSource(source), `${src} is web, not QR`);
}

// Positive controls: every existing channel still buckets as before.
ok(a.channelOf('qr_har_ki_pauri') === 'qr', 'QR posters are still qr');
ok(a.channelOf('google-play') === 'google', 'organic Play is still google');
ok(a.channelOf('google_ads_24260607071') === 'google', 'Google Ads is still google');
ok(a.channelOf(null) === 'unknown', 'no source is still unknown');
ok(a.channelOf('ad_instagram') === 'other', 'an ad_ link is still other');
ok(a.channelOf('website') === 'other', 'only the web_ PREFIX is the web channel');

// The website really builds these: its tagger must use the same prefix and
// only characters the backend normaliser keeps.
const site = fs.readFileSync(path.resolve(__dirname, '../../astrowani-website/script.js'), 'utf8');
ok(site.includes(`return \`${a.WEB_PREFIX}\${hi ? 'hi_' : ''}\${key}\``), 'script.js builds web_<page> with the backend prefix');
ok(/replace\(\/\[\^a-z0-9\]\+\/g, '_'\)/.test(site), 'script.js reduces the page key to [a-z0-9_]');
ok(a.normalizeSource('web_hi_blog_article') === 'web_hi_blog_article', 'the normaliser keeps a website source intact');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
