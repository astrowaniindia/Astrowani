#!/usr/bin/env node
/**
 * Check that every old WordPress address has a working redirect.
 *
 *   node vps-deployment/scripts/check-wordpress-redirects.js           # offline
 *   node vps-deployment/scripts/check-wordpress-redirects.js --live    # after the move
 *   node vps-deployment/scripts/check-wordpress-redirects.js --live --base https://staging.example
 *
 * OFFLINE (any time, no network): reads vps-deployment/nginx/wordpress-redirects.conf
 * and evaluates its map exactly as nginx does (decoded path, case-insensitive,
 * first match wins), then asserts:
 *   - every address in wordpress-old-urls.txt (except the homepage) matches a rule;
 *   - every same-site target is a real file in astrowani-website/;
 *   - every rule is used by at least one address, so a typo'd rule cannot sit
 *     there looking like coverage.
 *
 * LIVE (the day of the domain move, after nginx is reloaded): requests each
 * old address WITHOUT following redirects and asserts a 301 to exactly the
 * target the map names, then requests that target and asserts a 200. The
 * homepage is asserted 200 directly.
 *
 * THE LEGAL PAGES ARE SERVED, NOT REDIRECTED (launch day, 2026-11-20). Their
 * old addresses (/privacy-policy/ …) sit in the map with an EMPTY value — nginx
 * tries a map's exact strings before its regexes — and are served in place by
 * astrowani-site.conf. So this also asserts that the map's exact entries, the
 * server block's locations and astrowani-website/aw/legal-paths.js name the
 * same fourteen addresses (seven, plus /hi/), that every other spelling (no
 * slash, the .html file name, capitals) 301s to the one real address, and with
 * --live it requests all of them.
 *
 * Exit code is non-zero on any failure, so it can gate a deploy.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const MAP_FILE = path.join(REPO, 'vps-deployment/nginx/wordpress-redirects.conf');
const LIST_FILE = path.join(REPO, 'vps-deployment/nginx/wordpress-old-urls.txt');
const SITE_DIR = path.join(REPO, 'astrowani-website');
const SITE_CONF = path.join(REPO, 'vps-deployment/nginx/astrowani-site.conf');
const { LEGAL_PATHS, fileForPath } = require(path.join(SITE_DIR, 'aw/legal-paths.js'));

const live = process.argv.includes('--live');
const baseArg = process.argv.indexOf('--base');
const BASE = baseArg > -1 ? process.argv[baseArg + 1].replace(/\/$/, '') : 'https://astrowani.com';

/** The map's EXACT entries whose value is "": addresses served in place. */
function readExact() {
  const src = fs.readFileSync(MAP_FILE, 'utf8');
  const body = src.slice(src.indexOf('map $uri'));
  const out = new Set();
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^\s*"(\/[^"]*)"\s+"";\s*$/);
    if (m) out.add(m[1].toLowerCase());
  }
  return out;
}
let EXACT = new Set();

/** The map's rules, in order: [{ re, target, line }]. */
function readRules() {
  const src = fs.readFileSync(MAP_FILE, 'utf8');
  const body = src.slice(src.indexOf('map $uri'));
  const rules = [];
  body.split(/\r?\n/).forEach((raw, i) => {
    const m = raw.match(/^\s*"~\*([^"]+)"\s+(\S+);\s*$/);
    if (m) rules.push({ re: new RegExp(m[1], 'i'), target: m[2], src: m[1], hits: 0 });
    else if (/^\s*"~/.test(raw)) throw new Error(`unparsed map line ${i + 1}: ${raw.trim()}`);
  });
  if (!rules.length) throw new Error('no rules parsed from wordpress-redirects.conf');
  return rules;
}

function readUrls() {
  return fs.readFileSync(LIST_FILE, 'utf8').split(/\r?\n/)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** nginx's $uri: decoded path, no query string. */
function uriOf(url) {
  return decodeURIComponent(new URL(url).pathname);
}

// nginx checks a map's exact strings first (it lower-cases them), then the
// regexes in file order. '' means "no redirect: served in place".
function resolve(rules, uri, exact = EXACT) {
  if (exact.has(uri.toLowerCase())) return '';
  for (const r of rules) if (r.re.test(uri)) { r.hits++; return r.target; }
  return null;
}

/** Does a same-site target exist as a file in the new site? */
function targetExists(target) {
  if (/^https?:\/\//.test(target)) return true; // cross-site: checked in --live
  // A clean article address is rendered by the backend, not a file; --live checks it.
  if (/^\/(hi\/)?blog\/[a-z0-9-]+$/.test(target)) return true;
  const p = target.split('?')[0].split('#')[0];
  // A legal page's old address is a real page here (aw/legal-paths.js).
  const legal = fileForPath(p);
  if (legal) return fs.existsSync(path.join(SITE_DIR, legal));
  if (p === '/') return fs.existsSync(path.join(SITE_DIR, 'index.html'));
  return fs.existsSync(path.join(SITE_DIR, p.replace(/^\//, '')));
}

async function main() {
  EXACT = readExact();
  const rules = readRules();
  const urls = readUrls();
  let fail = 0;
  const plan = [];

  for (const url of urls) {
    const uri = uriOf(url);
    if (uri === '/') { plan.push({ url, uri, target: null }); continue; }
    const target = resolve(rules, uri);
    if (target === '') {
      // Served in place: the address must be one of the legal pages, with a file.
      const file = fileForPath(uri);
      if (!file || !fs.existsSync(path.join(SITE_DIR, file))) { fail++; console.log(`FAIL  served address has no page ${uri}`); continue; }
      plan.push({ url, uri, target: null });
      continue;
    }
    if (!target) { fail++; console.log(`FAIL  no rule      ${uri}`); continue; }
    if (!targetExists(target)) { fail++; console.log(`FAIL  no such page ${uri} -> ${target}`); continue; }
    plan.push({ url, uri, target });
  }
  // ── The legal pages: the map, the server block and aw/legal-paths.js agree. ──
  const siteConf = fs.readFileSync(SITE_CONF, 'utf8');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const wanted = new Set();
  for (const [file, pub] of Object.entries(LEGAL_PATHS)) {
    for (const hi of ['', 'hi/']) {
      const addr = `/${hi}${pub}`;
      wanted.add(addr);
      if (!EXACT.has(addr)) { fail++; console.log(`FAIL  map has no exact "" entry for ${addr}`); }
      const loc = new RegExp(`location = ${esc(addr)}\\s*\\{\\s*try_files ${esc(`/${hi}${file}`)} =404;`);
      if (!loc.test(siteConf)) { fail++; console.log(`FAIL  astrowani-site.conf does not serve ${addr} from /${hi}${file}`); }
      if (!fs.existsSync(path.join(SITE_DIR, hi, file))) { fail++; console.log(`FAIL  no page file /${hi}${file}`); }
      if (resolve(rules, addr) !== '') { fail++; console.log(`FAIL  ${addr} is redirected; it must be served`); }
      else plan.push({ url: `https://astrowani.com${addr}`, uri: addr, target: null });
      // Every other spelling 301s to the one real address. Resolved WITHOUT the
      // exact entries for the capitalised form, because nginx lower-cases exact
      // strings — so "/PRIVACY-POLICY/" is served too, not redirected.
      for (const variant of [`/${hi}${file}`, addr.replace(/\/$/, ''), addr.toUpperCase().replace(/\/$/, '')]) {
        const t = resolve(rules, variant);
        if (t !== addr) { fail++; console.log(`FAIL  ${variant} -> ${t || '(no rule)'}; wanted 301 ${addr}`); }
        else plan.push({ url: `https://astrowani.com${variant}`, uri: variant, target: addr });
      }
    }
  }
  for (const e of EXACT) if (!wanted.has(e)) { fail++; console.log(`FAIL  map serves ${e} but aw/legal-paths.js does not list it`); }

  for (const r of rules) {
    if (!r.hits) { fail++; console.log(`FAIL  unused rule  ${r.src}`); }
  }
  // Positive control: the matcher must NOT catch a page that belongs to the new site.
  for (const own of ['/about.html', '/blog.html', '/hi/vastu.html', '/love-calculator.html', '/blog/some-article', '/astrologers/astro-x-123abc', '/hi/about.html']) {
    if (resolve(rules, own)) { fail++; console.log(`FAIL  catches a NEW page: ${own}`); }
  }
  console.log(`offline: ${urls.length} addresses, ${rules.length} rules, ${fail} failure(s)`);

  if (live) {
    for (const { url, uri, target } of plan) {
      const u = BASE + new URL(url).pathname;
      try {
        if (!target) {
          const r = await fetch(u, { redirect: 'manual' });
          if (r.status !== 200) { fail++; console.log(`FAIL  ${uri} -> ${r.status} (must be served: 200)`); }
          continue;
        }
        const r = await fetch(u, { redirect: 'manual' });
        const loc = r.headers.get('location') || '';
        const want = /^https?:/.test(target) ? target : BASE + target;
        if (r.status !== 301 || loc !== want) {
          fail++; console.log(`FAIL  ${uri} -> ${r.status} ${loc || '(no location)'}   wanted 301 ${want}`); continue;
        }
        const t = await fetch(want, { redirect: 'follow' });
        if (t.status !== 200) { fail++; console.log(`FAIL  ${uri} -> ${want} answers ${t.status}`); continue; }
        console.log(`ok    ${uri} -> ${want}`);
      } catch (e) {
        fail++; console.log(`FAIL  ${uri}: ${e.message}`);
      }
    }
    console.log(`live (${BASE}): ${plan.length} addresses checked`);
  }

  console.log(fail ? `\n${fail} FAILURE(S)` : '\nall good');
  process.exit(fail ? 1 : 0);
}

main();
