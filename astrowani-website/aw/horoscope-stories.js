/**
 * The 24 daily horoscope Web Stories (12 signs x English/Hindi), CLAUDE.md EU.
 *
 *   stories/<sign>-horoscope.html       English
 *   hi/stories/<sign>-horoscope.html    Hindi
 *
 * Written by aw/bake-horoscopes.js, into the DEPLOYED site only, right after it
 * bakes the sign pages — so they exist only on the VPS, never in the repo, and
 * git does not change every day. The markup comes from
 * astrowani-backend/src/webStory.js, which the blog stories share.
 *
 * WHY ONE FIXED ADDRESS PER SIGN, rewritten daily, and not a new story every
 * day: twelve new pages a day of generated text is ~4,400 near-identical pages
 * a year, which is what Google's scaled-content rules demote — and it would drag
 * the rest of the site down with it. A fixed address refreshed daily (with its
 * dateModified) is fresh content for Discover without that pile.
 *
 * The reading is astroHoroscopeReading() from astro-engine.js — the same text
 * the sign page shows that day — split into its five parts, one slide each.
 * Every slide states plainly that this is a general reading for the sign.
 */
const fs = require('fs');
const path = require('path');
const { SIGNS } = require('./horoscope-pages-content.js');
const { renderStory } = require('../../astrowani-backend/src/webStory.js');

// The domain, read from the one place it lives (aw/apply-seo.js, CLAUDE.md EN1).
const SITE_BASE = (fs.readFileSync(path.join(__dirname, 'apply-seo.js'), 'utf8').match(/const SITE_BASE = '([^']+)'/) || [])[1];
if (!SITE_BASE) throw new Error('SITE_BASE not found in aw/apply-seo.js');

// The day these went live. dateModified moves every day; this does not.
const LAUNCHED = '2026-11-17';

const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

const storyFile = (sign, hi) => `${hi ? 'hi/' : ''}stories/${sign.name.toLowerCase()}-horoscope.html`;
const storyUrl = (sign, hi) => `${SITE_BASE}/${storyFile(sign, hi)}`;

const COPY = {
  en: {
    eyebrow: 'Daily horoscope',
    title: (s) => `${s.name} Horoscope Today`,
    sub: (s, date) => `${date} · ${s.vedic} rashifal`,
    today: (s) => `Today for ${s.name}`,
    love: 'Love', career: 'Career', money: 'Money', health: 'Health',
    end: '.',
    glance: (s) => `${s.name} at a glance`,
    glanceText: (s) => `Ruled by ${s.lord[0]} · ${s.element[0]} sign · ${s.dates[0]}`,
    moreEyebrow: (s) => `More for ${s.name}`,
    moreTitle: (s) => `Read the full ${s.name} horoscope`,
    moreText: () => 'Tomorrow’s and this week’s reading, the sign in love and at work, and its best matches.',
    moreCta: 'Read the full horoscope',
    ctaEyebrow: 'Your own chart',
    ctaTitle: 'This reading is general',
    ctaText: (s) => `It applies to everyone born under ${s.name}. A verified astrologer can read your own birth chart.`,
    ctaButton: 'Talk to an astrologer',
    headTitle: (s, date) => `${s.name} Horoscope Today, ${date} | Astrowani`,
    desc: (s, date) => `${s.name} horoscope for ${date}: love, career, money and health, as a quick story from Astrowani.`,
  },
  hi: {
    eyebrow: 'दैनिक राशिफल',
    title: (s) => `आज का ${s.hi} राशिफल`,
    sub: (s, date) => date,
    today: (s) => `आज ${s.hi} राशि के लिए`,
    love: 'प्रेम', career: 'करियर', money: 'धन', health: 'स्वास्थ्य',
    end: '।',
    glance: (s) => `${s.hi} एक नज़र में`,
    glanceText: (s) => `स्वामी ग्रह: ${s.lord[1]} · तत्व: ${s.element[1]} · ${s.dates[1]}`,
    moreEyebrow: (s) => `${s.hi} के लिए और`,
    moreTitle: (s) => `पूरा ${s.hi} राशिफल पढ़ें`,
    moreText: () => 'कल और इस हफ़्ते का राशिफल, प्रेम और काम में यह राशि, और इसके सबसे अच्छे मेल।',
    moreCta: 'पूरा राशिफल पढ़ें',
    ctaEyebrow: 'आपकी अपनी कुंडली',
    ctaTitle: 'यह राशिफल सामान्य है',
    ctaText: (s) => `यह ${s.hi} राशि के सभी लोगों पर लागू होता है। एक सत्यापित ज्योतिषी आपकी अपनी जन्म कुंडली पढ़ सकते हैं।`,
    ctaButton: 'ज्योतिषी से बात करें',
    headTitle: (s, date) => `आज का ${s.hi} राशिफल, ${date} | Astrowani`,
    desc: (s, date) => `${date} का ${s.hi} राशिफल: प्रेम, करियर, धन और स्वास्थ्य, Astrowani की एक छोटी स्टोरी में।`,
  },
};

/**
 * @param {object} sign      an entry of SIGNS
 * @param {'en'|'hi'} lang
 * @param {string} dateStr   YYYY-MM-DD, the India date the reading is for
 * @param {Date} date        noon local time on that day (what the engine reads)
 * @param {object} reading   astroHoroscopeReading(sign.name, date, 'daily', lang)
 */
function buildStory(sign, lang, dateStr, date, reading) {
  const hi = lang === 'hi';
  const c = COPY[lang];
  const parts = reading && reading.parts;
  if (!parts || !['general', 'love', 'career', 'money', 'health'].every((k) => parts[k])) {
    throw new Error('astroHoroscopeReading() returned no parts — is the deployed astro-engine.js current?');
  }
  const label = date.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const short = date.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const say = (t) => (hi ? t : cap(t)) + c.end;
  const poster = `${SITE_BASE}/assets/stories/${sign.name.toLowerCase()}.jpg`;
  const pagePrefix = `${SITE_BASE}/${hi ? 'hi/' : ''}`;
  const meter = (k) => ({ id: k, eyebrow: c[k], meter: reading.meters[k], text: say(parts[k]) });
  return renderStory({
    lang,
    siteBase: SITE_BASE,
    title: c.title(sign),
    headTitle: c.headTitle(sign, short),
    description: c.desc(sign, short),
    canonical: storyUrl(sign, hi),
    alternates: [['en-IN', storyUrl(sign, false)], ['hi-IN', storyUrl(sign, true)], ['x-default', storyUrl(sign, false)]],
    poster,
    logo: `${SITE_BASE}/assets/logo-240.jpg`,
    wheel: `${SITE_BASE}/assets/zodiac-wheel.png`,
    datePublished: `${dateStr < LAUNCHED ? dateStr : LAUNCHED}T00:01:00+05:30`,
    dateModified: `${dateStr}T00:01:00+05:30`,
    pages: [
      { kind: 'cover', id: 'cover', image: poster, imageAlt: '', eyebrow: c.eyebrow, title: c.title(sign), sub: c.sub(sign, label) },
      { id: 'today', eyebrow: c.today(sign), text: say(parts.general) },
      meter('love'),
      meter('career'),
      meter('money'),
      meter('health'),
      { id: 'glance', eyebrow: c.glance(sign), title: `${sign.symbol} ${hi ? sign.hi : sign.name}`, text: c.glanceText(sign) },
      { id: 'more', eyebrow: c.moreEyebrow(sign), title: c.moreTitle(sign), text: c.moreText(sign), href: `${pagePrefix}${sign.file}`, cta: c.moreCta },
      { id: 'consult', eyebrow: c.ctaEyebrow, title: c.ctaTitle, text: c.ctaText(sign), href: `${pagePrefix}consult.html?mode=chat`, cta: c.ctaButton, brand: 'Astrowani' },
    ],
  });
}

/**
 * Write all 24 under `root`. Returns { changed, files }.
 * `readingFor(signName, lang)` is the engine bound to the day being baked.
 */
function writeStories(root, dateStr, date, readingFor, { check = false } = {}) {
  let changed = 0;
  const files = [];
  for (const sign of SIGNS) {
    for (const lang of ['en', 'hi']) {
      const rel = storyFile(sign, lang === 'hi');
      const out = path.join(root, rel);
      const html = buildStory(sign, lang, dateStr, date, readingFor(sign.name, lang));
      const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
      files.push(rel);
      if (prev === html) continue;
      changed++;
      if (!check) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, html);
      }
    }
  }
  return { changed, files };
}

module.exports = { buildStory, writeStories, storyFile, storyUrl, SITE_BASE, SIGNS };
