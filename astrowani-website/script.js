// On a /hi/ page, a bare page link resolves inside /hi/ — which is right only
// where that Hindi page exists. The list is EMITTED INTO THE PAGE by
// aw/make-hindi-pages.js, never written here: a hardcoded copy goes stale the
// moment another page is translated, and it fails silently (the link just goes
// to English). With no list we send everything to English, because a link to a
// missing /hi/ page is a 404 while a link to the English page always works.
function astroPageHref(href) {
  if (document.documentElement.lang !== 'hi') return href;
  const match = href.match(/^([\w-]+\.html)([?#].*)?$/);
  if (!match) return href;
  const hi = Array.isArray(window.ASTROWANI_HI_PAGES) ? window.ASTROWANI_HI_PAGES : [];
  return hi.includes(match[1]) ? href : `../${href}`;
}

// ---------- shared astrologer card renderer (real data, used on every page) ----------
const ASTROWANI_APP_LINK = 'https://play.google.com/store/apps/details?id=com.astrowanicustomer&hl=en_IN';
const ASTROWANI_STAR_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="var(--gold-deep)"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.2l7.1-.6z"/></svg>';
const ASTROWANI_SPROUT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--maroon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V13"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 13C12 9 9 6 5 6c0 4 3 7 7 7z"/></svg>';

// icon + one-line hook for each real app category, keyed by exact category name
const ASTROWANI_CATEGORY_INFO = {
  'Vedic Astrology': { sub: 'Birth chart readings', icon: '<path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6"/><circle cx="12" cy="12" r="4.5"/>' },
  'Love Relationship': { sub: 'Love & compatibility', icon: '<path d="M12 20.5s-7.5-4.6-9.8-9.1C.6 7.8 2.3 4.5 5.6 4c2-.3 3.8.7 4.9 2.3h3c1.1-1.6 2.9-2.6 4.9-2.3 3.3.5 5 3.8 3.4 7.4-2.3 4.5-9.8 9.1-9.8 9.1z"/>' },
  'Business': { sub: 'Finance & growth', icon: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V6a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v1.5M3 12.5h18"/>' },
  'Health': { sub: 'Wellness guidance', icon: '<path d="M20 8.5c0 5.5-8 11-8 11s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 8.5z"/><path d="M8.5 11h1.8l1-2.2 1.4 4.4 1-2.2H15.5"/>' },
  'Marriage': { sub: 'Kundali matching', icon: '<circle cx="8.5" cy="13.5" r="5"/><circle cx="15.5" cy="13.5" r="5"/>' },
  'Career': { sub: 'Right career path', icon: '<path d="M3 17l5.5-6 4 4L21 6"/><path d="M15 6h6v6"/>' },
  'Palmistry': { sub: 'Palm reading', icon: '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 3.5-2.5 6-6 6s-6-1.8-7-4l-1.8-3.5a1.4 1.4 0 0 1 2.3-1.6L6 12.5"/>' },
  'Vastu': { sub: 'Home & space', icon: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5V14h4v5.5"/>' },
  'Numerology': { sub: 'Numbers & destiny', icon: '<path d="M6 4v16M8.5 4 6 6.5M15 5h3.5a1.8 1.8 0 0 1 1.3 3L15 13.5h5"/>' },
  'Tarot Reading': { sub: 'Tarot card insight', icon: '<rect x="4" y="3.5" width="9" height="13" rx="1.6" transform="rotate(-8 4 3.5)"/><rect x="11" y="5.5" width="9" height="13" rx="1.6" transform="rotate(8 11 5.5)"/>' },
};
const ASTROWANI_CAT_RING_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">__ICON__</svg>';

// ---------- nav dropdown menus: added to whatever nav already exists on the page, nothing removed ----------
const ASTROWANI_NAV_ARROW = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const ASTROWANI_NAV_CARET = '<svg class="nav-caret" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

const ASTROWANI_NAV_MENUS = [
  {
    label: 'Consultations', wide: '', cols: 1,
    items: [
      ['Chat with Astrologer', 'consult.html?mode=chat'],
      ['Call with Astrologer', 'consult.html?mode=call'],
      ['Video Call with Astrologer', 'consult.html?mode=video'],
    ],
  },
  // SERVICES: real pages, one per intent.
  //
  // This menu previously offered 44 destinations that resolved to FIVE
  // indexable URLs, because 35 of them were hash fragments (calculators.html
  // #numerology and so on) and Google strips a fragment entirely — it is not a
  // URL and never was. "Numerology consultation" had nowhere to rank.
  //
  // Every entry below is its own page with its own title, H1 and content, and
  // every one is backed by astrologers who actually offer it (counts checked
  // against the live categories table, 2026-10-29). Kundli matching stays on
  // marriage.html and muhurat on panchang.html rather than being duplicated —
  // two pages chasing one phrase compete and both lose.
  {
    label: 'Services', wide: 'wide', cols: 2,
    items: [
      ['Kundli Reading', 'kundli-reading.html'],
      ['Kundli Matching for Marriage', 'marriage.html'],
      ['Tarot Card Reading', 'tarot-reading.html'],
      ['Numerology Consultation', 'numerology.html'],
      ['Career & Business Astrology', 'career-astrology.html'],
      ['Vastu Consultation', 'vastu.html'],
      ['Lal Kitab Consultation', 'lal-kitab.html'],
      ['Palm Reading', 'palmistry.html'],
      ['Muhurat & Panchang', 'panchang.html'],
    ],
  },
  {
    label: 'Horoscope', wide: '', cols: 1,
    items: [
      ['Daily Horoscope', 'horoscope.html?period=daily'],
      ["Tomorrow's Horoscope", 'horoscope.html?period=tomorrow'],
      ["Yesterday's Horoscope", 'horoscope.html?period=yesterday'],
      ['Weekly Horoscope', 'horoscope.html?period=weekly'],
      ['Monthly Horoscope', 'horoscope.html?period=monthly'],
      ['Yearly Horoscope', 'horoscope.html?period=yearly'],
    ],
  },
  {
    label: 'Free Services', wide: '', cols: 1,
    items: [
      ['Free Kundli', 'free-services.html#kundli'],
      ['Free Horoscope Matching', 'free-services.html#matching'],
      ['Free Daily Horoscope', 'free-services.html#daily'],
      ['Free Numerology Report', 'free-services.html#numerology'],
      ['Free Palmistry Reading', 'free-services.html#palmistry'],
    ],
  },
  {
    label: 'Calculators', wide: 'xwide', cols: 2,
    items: [
      ['Love Calculator', 'calculators.html#love'],
      ['Numerology Calculator', 'calculators.html#numerology'],
      ['Rising Sign Calculator', 'calculators.html#rising-sign'],
      ['Dasha Calculator', 'calculators.html#dasha'],
      ['Mangal Dosha Calculator', 'calculators.html#mangal-dosha'],
      ['Moon Phase Calculator', 'calculators.html#moon-phase'],
      ['Flames Calculator', 'calculators.html#flames'],
      ['Friendship Calculator', 'calculators.html#friendship'],
      ['Ishta Devata Calculator', 'calculators.html#ishta-devata'],
      ['Transit Chart Calculator', 'calculators.html#transit-chart'],
      ['Atmakaraka & Darakaraka Calculator', 'calculators.html#atmakaraka'],
      ['Sun Sign Calculator', 'calculators.html#sun-sign'],
      ['Rashi Calculator', 'calculators.html#rashi'],
      ['Nakshatra Calculator', 'calculators.html#nakshatra'],
      ['Shani Sade Sati Calculator', 'calculators.html#sade-sati'],
      ['Birth/Natal Chart Calculator', 'calculators.html#natal-chart'],
      ['Lucky Vehicle Number Calculator', 'calculators.html#lucky-vehicle'],
      ['Kaal Sarp Dosh Calculator', 'calculators.html#kaal-sarp'],
      ['Lo Shu Grid Calculator', 'calculators.html#lo-shu-grid'],
      ['Name Compatibility Calculator', 'calculators.html#name-compatibility'],
    ],
  },
  {
    label: 'Panchang', wide: 'wide', cols: 2,
    items: [
      ['Today Panchang', 'panchang.html#today'],
      ['Rahu Kaal', 'panchang.html#rahu-kaal'],
      ['Choghadiya', 'panchang.html#choghadiya'],
      ['Tithi', 'panchang.html#tithi'],
      ['Vaar', 'panchang.html#vaar'],
      ['Hora', 'panchang.html#hora'],
      ['Karana', 'panchang.html#karana'],
      ['Tomorrow Panchang', 'panchang.html#tomorrow'],
      ['Shubh Muhurat', 'panchang.html#shubh-muhurat'],
      ['Numerology', 'panchang.html#numerology'],
    ],
  },
];

function injectNavDropdowns() {
  // index.html now carries two nav bars (the hero's .ch-nav-links pill, plus the fixed
  // .nav-links floating nav that slides in once the pill scrolls away) — both need the
  // same mega-menu items and handlers, so this runs once per container found.
  const containers = [
    document.querySelector('.ch-nav-links'),
    document.querySelector('.nav-links'),
  ].filter(Boolean);
  if (!containers.length) return;

  containers.forEach((container) => {
    const linkClass = container.classList.contains('ch-nav-links') ? '' : 'nav-link';
    const html = ASTROWANI_NAV_MENUS.map((menu) => {
      const wideClass = menu.wide ? ` nav-dropdown-${menu.wide}` : '';
      const colsClass = menu.cols >= 3 ? ' nav-dropdown-cols-3' : '';
      const itemsHtml = menu.items.map(([label, href]) =>
        `<a class="nav-dropdown-item" href="${href}"><span class="i18n-t">${label}</span>${ASTROWANI_NAV_ARROW}</a>`
      ).join('');
      const itemsWrap = menu.cols > 1
        ? `<div class="nav-dropdown-cols${colsClass}">${itemsHtml}</div>`
        : itemsHtml;
      return `<div class="nav-item-drop">
        <span class="nav-drop-trigger ${linkClass}"><span class="i18n-t">${menu.label}</span>${ASTROWANI_NAV_CARET}</span>
        <div class="nav-dropdown${wideClass}"><div class="nav-dropdown-panel">${itemsWrap}</div></div>
      </div>`;
    }).join('');
    // prepended, not appended — final order is Consultations, Horoscope, Free Services,
    // Calculators, Panchang, then whatever's already in the nav (Blog, Wani Shop)
    container.insertAdjacentHTML('afterbegin', html);

    // mouse: open on enter, close on leave only after a short grace period — see the CSS
    // comment above .nav-item-drop for why a bare CSS :hover rule wasn't reliable enough
    const CLOSE_GRACE_MS = 300;
    container.querySelectorAll('.nav-item-drop').forEach((item) => {
      let closeTimer = null;
      item.addEventListener('mouseenter', () => {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        container.querySelectorAll('.nav-item-drop.nav-drop-open').forEach((o) => { if (o !== item) o.classList.remove('nav-drop-open'); });
        item.classList.add('nav-drop-open');
      });
      item.addEventListener('mouseleave', () => {
        closeTimer = setTimeout(() => { item.classList.remove('nav-drop-open'); closeTimer = null; }, CLOSE_GRACE_MS);
      });
    });

    // touch/click fallback — tap devices have no hover at all
    container.querySelectorAll('.nav-item-drop > .nav-drop-trigger').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        if (window.matchMedia('(hover: hover)').matches) return;
        e.preventDefault();
        const item = trigger.closest('.nav-item-drop');
        const wasOpen = item.classList.contains('nav-drop-open');
        container.querySelectorAll('.nav-item-drop.nav-drop-open').forEach((o) => o.classList.remove('nav-drop-open'));
        if (!wasOpen) item.classList.add('nav-drop-open');
      });
    });
  });

  document.addEventListener('click', (e) => {
    containers.forEach((container) => {
      if (!container.contains(e.target)) {
        container.querySelectorAll('.nav-item-drop.nav-drop-open').forEach((o) => o.classList.remove('nav-drop-open'));
      }
    });
  });
}

// ---------- language toggle (English ⇄ Hindi) ----------
// Dictionary-based, not markup-based: any element carrying class "i18n-t" (or a few fixed
// IDs for HTML-bearing text like the hero heading) gets its ORIGINAL English cached on first
// run, then looked up here. Anything not in this dictionary is simply left in English —
// this covers the nav, the homepage hero, and the new tool pages' headers; it is a real,
// working start, not full-site coverage yet.
const ASTROWANI_I18N_DICT = {
  'Consultations': 'परामर्श', 'Horoscope': 'राशिफल', 'Free Services': 'मुफ़्त सेवाएं',
  'Calculators': 'कैलकुलेटर', 'Panchang': 'पंचांग', 'Blog': 'ब्लॉग', 'Wani Shop': 'वणी शॉप',
  'Astrologers': 'ज्योतिषी', 'Marriage': 'विवाह', 'Services': 'सेवाएं',
  'Login': 'लॉगिन', 'Sign up': 'साइन अप',
  'Chat with Astrologer': 'ज्योतिषी से चैट करें', 'Call with Astrologer': 'ज्योतिषी को कॉल करें',
  'Video Call with Astrologer': 'ज्योतिषी से वीडियो कॉल करें',
  'Daily Horoscope': 'दैनिक राशिफल', "Tomorrow's Horoscope": 'कल का राशिफल',
  "Yesterday's Horoscope": 'बीते कल का राशिफल', 'Weekly Horoscope': 'साप्ताहिक राशिफल',
  'Monthly Horoscope': 'मासिक राशिफल', 'Yearly Horoscope': 'वार्षिक राशिफल',
  'Free Kundli': 'मुफ़्त कुंडली', 'Free Horoscope Matching': 'मुफ़्त कुंडली मिलान',
  'Free Daily Horoscope': 'मुफ़्त दैनिक राशिफल', 'Free Numerology Report': 'मुफ़्त अंक ज्योतिष रिपोर्ट',
  'Free Palmistry Reading': 'मुफ़्त हस्तरेखा पठन',
  'Love Calculator': 'लव कैलकुलेटर', 'Numerology Calculator': 'अंक ज्योतिष कैलकुलेटर',
  'Rising Sign Calculator': 'लग्न कैलकुलेटर', 'Dasha Calculator': 'दशा कैलकुलेटर',
  'Mangal Dosha Calculator': 'मंगल दोष कैलकुलेटर', 'Moon Phase Calculator': 'चंद्र कला कैलकुलेटर',
  'Flames Calculator': 'फ्लेम्स कैलकुलेटर', 'Friendship Calculator': 'मित्रता कैलकुलेटर',
  'Ishta Devata Calculator': 'इष्ट देवता कैलकुलेटर', 'Transit Chart Calculator': 'गोचर चार्ट कैलकुलेटर',
  'Atmakaraka & Darakaraka Calculator': 'आत्मकारक और दारकारक', 'Sun Sign Calculator': 'सूर्य राशि कैलकुलेटर',
  'Rashi Calculator': 'राशि कैलकुलेटर', 'Nakshatra Calculator': 'नक्षत्र कैलकुलेटर',
  'Shani Sade Sati Calculator': 'शनि साढ़े साती कैलकुलेटर', 'Birth/Natal Chart Calculator': 'जन्म कुंडली चार्ट',
  'Lucky Vehicle Number Calculator': 'भाग्यशाली वाहन नंबर', 'Kaal Sarp Dosh Calculator': 'काल सर्प दोष कैलकुलेटर',
  'Lo Shu Grid Calculator': 'लो शू ग्रिड कैलकुलेटर', 'Name Compatibility Calculator': 'नाम अनुकूलता',
  'Today Panchang': 'आज का पंचांग', 'Rahu Kaal': 'राहु काल', 'Choghadiya': 'चौघड़िया',
  'Tithi': 'तिथि', 'Vaar': 'वार', 'Hora': 'होरा', 'Karana': 'करण',
  'Tomorrow Panchang': 'कल का पंचांग', 'Shubh Muhurat': 'शुभ मुहूर्त', 'Numerology': 'अंक ज्योतिष',
  "India's Trusted Astrology Platform": 'भारत का भरोसेमंद ज्योतिष प्लेटफॉर्म',
  "Chat, call or video with India's verified astrologers for love, career, marriage and family guidance — in your own language, available around the clock.":
    'प्यार, करियर, शादी और परिवार से जुड़े मार्गदर्शन के लिए भारत के सत्यापित ज्योतिषियों से चैट, कॉल या वीडियो पर बात करें — अपनी भाषा में, चौबीसों घंटे उपलब्ध।',
  'Talk to an Astrologer': 'ज्योतिषी से बात करें',
  'Kundlis served': 'कुंडली बनाई गईं', 'Verified astrologers': 'सत्यापित ज्योतिषी',
  'Years of experience': 'वर्षों का अनुभव', 'Countries reached': 'देशों तक पहुंच',
  'All our astrologers': 'हमारे सभी ज्योतिषी',
  'Every astrologer on Astrowani is reviewed before they can take consultations — browse all of them, or filter by what you need help with.':
    'Astrowani पर हर ज्योतिषी को परामर्श देने से पहले जांचा जाता है — सभी को देखें, या अपनी ज़रूरत के हिसाब से फ़िल्टर करें।',
  'Free astrology calculators': 'मुफ़्त ज्योतिष कैलकुलेटर',
  "Instant, real calculations for the ones that don't need a full birth chart — and an honest note on the ones that do.":
    'जिन गणनाओं के लिए पूरी जन्म कुंडली की ज़रूरत नहीं, उनका तुरंत असली परिणाम — और बाकी के बारे में साफ़ जानकारी।',
  "Today's Panchang": 'आज का पंचांग',
  'Free astrology services': 'मुफ़्त ज्योतिष सेवाएं',
  'In the app, these services are offered at just ₹1 — on the website, try the quick versions below for free.':
    'ऐप में ये सेवाएं सिर्फ़ ₹1 में उपलब्ध हैं — वेबसाइट पर, नीचे दिए गए त्वरित संस्करण मुफ़्त आज़माएं।',
};
function astroApplyLang(lang) {
  document.documentElement.setAttribute('data-lang', lang);
  const nodes = document.querySelectorAll('.i18n-t, .page-header h1, .page-header p, .page-header .crumb, [data-i18n]');
  nodes.forEach((el) => {
    if (!el.dataset.i18nEn) el.dataset.i18nEn = el.textContent.trim();
    const en = el.dataset.i18nEn;
    if (lang === 'hi' && ASTROWANI_I18N_DICT[en]) {
      el.textContent = ASTROWANI_I18N_DICT[en];
    } else {
      el.textContent = en;
    }
  });
  const langBtn = document.querySelector('.nav-util-btn[data-role="lang"] .i18n-glyph');
  if (langBtn) langBtn.textContent = lang === 'hi' ? 'A' : 'अ';
}

function injectNavUtilButtons() {
  if (document.querySelector('.nav-util-group')) return;
  const html = `<div class="nav-util-group">
    <button type="button" class="nav-util-btn" data-role="lang" title="Switch to Hindi / अंग्रेज़ी में बदलें" aria-label="Switch language">
      <span class="i18n-glyph">अ</span>
    </button>
  </div>`;
  const pillWrap = document.querySelector('.ch-nav-wrap');
  const navRight = document.querySelector('.nav-right');
  if (pillWrap) {
    // appended to the wrap (not the pill) so CSS can anchor it past the pill's own edge
    pillWrap.insertAdjacentHTML('beforeend', html);
  } else if (navRight) {
    navRight.insertAdjacentHTML('afterbegin', html);
  } else {
    return;
  }

  // THE LIGHT/DARK TOGGLE WAS REMOVED 2026-10-29, owner's decision: the site is
  // the dark maroon theme only. The [data-theme="inverted"] rules are LEFT in
  // style.css deliberately -- they cannot activate without the attribute, and
  // keeping them makes this reversible in one commit rather than a rewrite.
  // A visitor whose localStorage still holds astro-theme:'inverted' simply gets
  // the dark theme, because nothing reads that key any more.

  const langBtn = document.querySelector('.nav-util-btn[data-role="lang"]');
  langBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-lang') === 'hi' ? 'en' : 'hi';
    const alternate = document.querySelector(`link[hreflang="${next === 'hi' ? 'hi-IN' : 'en-IN'}"]`);
    if (alternate) { window.location.href = alternate.href; return; }
    localStorage.setItem('astro-lang', next);
    astroApplyLang(next);
  });
}

/**
 * Mobile navigation: logo + hamburger only, everything else behind a drawer.
 *
 * The desktop nav is a row of six dropdown menus plus Blog, Wani Shop, the
 * theme/language buttons and the account area. On a phone that cannot shrink —
 * it just ran off the right edge of the screen — and most Astrowani visitors
 * are on a phone, so below 900px the bar keeps the brand and a hamburger, and
 * the whole menu opens as a full-height panel.
 *
 * The drawer is built from the SAME ASTROWANI_NAV_MENUS data as the desktop
 * dropdowns, so a menu item added there appears in both without a second edit.
 *
 * Its account row deliberately reuses the `.nav-login` class and the Play Store
 * sign-up href: aw/account.js finds those by selector and rewrites them into
 * the live wallet balance, so the drawer shows the balance without that module
 * needing to know a drawer exists.
 */
function injectMobileNav() {
  if (document.querySelector('.m-nav-toggle')) return;

  const bars = [
    document.querySelector('.ch-nav-pill'),
    document.querySelector('.nav-inner'),
  ].filter(Boolean);
  if (!bars.length) return;

  const burger = () => `
    <button type="button" class="m-nav-toggle" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>`;
  bars.forEach((bar) => bar.insertAdjacentHTML('beforeend', burger()));

  // Bare identifier, not window.*: ASTROWANI_NAV_MENUS is a top-level `const`,
  // which does not become a property of window.
  const menus = typeof ASTROWANI_NAV_MENUS !== 'undefined' ? ASTROWANI_NAV_MENUS : [];
  const sections = menus.map((menu, i) => `
    <div class="m-nav-sec" data-sec="${i}">
      <button type="button" class="m-nav-sec-head">
        <span class="i18n-t">${menu.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="m-nav-sec-body">
        ${menu.items.map(([label, href]) =>
          `<a href="${href}" class="m-nav-sub i18n-t">${label}</a>`).join('')}
      </div>
    </div>`).join('');

  const panel = document.createElement('div');
  panel.className = 'm-nav';
  panel.innerHTML = `
    <div class="m-nav-scrim" data-close></div>
    <aside class="m-nav-panel" role="dialog" aria-modal="true" aria-label="Menu">
      <header class="m-nav-head">
        <span class="serif m-nav-brand">Astrowani</span>
        <button type="button" class="m-nav-close" data-close aria-label="Close menu">&times;</button>
      </header>

      <div class="m-nav-account">
        <a href="#" class="nav-login m-nav-login">Login</a>
        <!-- Deliberately NOT given the "magnetic" class: that handler
             translates the button toward the cursor, which is pointless on a
             phone and can shove it out of the drawer. The Play Store href is
             what aw/account.js matches on to turn this into the account link
             once the visitor is signed in. -->
        <a href="https://play.google.com/store/apps/details?id=com.astrowanicustomer&amp;hl=en_IN"
           class="btn-gold m-nav-cta">Sign up</a>
      </div>

      <nav class="m-nav-body">
        ${sections}
        <a href="astrologers.html" class="m-nav-link i18n-t">All Astrologers</a>
        <a href="blog.html" class="m-nav-link i18n-t">Blog</a>
        <a href="index.html#wanishop" class="m-nav-link i18n-t">Wani Shop</a>
        <a href="about.html" class="m-nav-link i18n-t">About us</a>
      </nav>

      <footer class="m-nav-foot">
        <button type="button" class="m-nav-util" data-role="m-lang">हिंदी / English</button>
      </footer>
    </aside>`;
  document.body.appendChild(panel);

  const open = () => {
    panel.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    document.querySelectorAll('.m-nav-toggle').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  };
  const close = () => {
    panel.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    document.querySelectorAll('.m-nav-toggle').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };

  document.querySelectorAll('.m-nav-toggle').forEach((b) => b.addEventListener('click', open));
  panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Accordion — one section open at a time keeps the list short enough to scan.
  panel.querySelectorAll('.m-nav-sec-head').forEach((head) => {
    head.addEventListener('click', () => {
      const sec = head.closest('.m-nav-sec');
      const wasOpen = sec.classList.contains('is-open');
      panel.querySelectorAll('.m-nav-sec').forEach((s) => s.classList.remove('is-open'));
      if (!wasOpen) sec.classList.add('is-open');
    });
  });

  // Tapping a destination closes the drawer. A same-page #hash link does not
  // reload, so without this the panel would stay over the section just jumped to.
  panel.querySelectorAll('a[href]').forEach((a) => {
    if (a.classList.contains('nav-login') || a.classList.contains('m-nav-cta')) return;
    a.addEventListener('click', close);
  });
  // The account links open a popup or navigate; either way the drawer should go.
  panel.querySelectorAll('.nav-login, .m-nav-cta').forEach((a) => a.addEventListener('click', close));

  // The drawer's own language button drives the existing nav-util button, so
  // there is one implementation and the two cannot drift apart.
  panel.querySelector('[data-role="m-lang"]').addEventListener('click', () => {
    document.querySelector('.nav-util-btn[data-role="lang"]')?.click();
  });

  // Rotating back to a wide screen must not leave a drawer covering the page.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && panel.classList.contains('is-open')) close();
  });
}

// Fills every `.footer-social` placeholder on the page with the real social
// icons, one line, bottom-left of the footer.
//
// Mirrors SOCIAL_LINKS in the CUSTOMER APP (src/config/api.js) exactly — same
// keys, URLs and brand colours — so the website and the app always point at
// the same accounts. WhatsApp is deliberately NOT in this list, per the same
// source: it was removed from the app's social row on the owner's
// instruction (WhatsApp remains a real support/ordering channel elsewhere,
// just not as a "follow us" social icon).
const ASTROWANI_SOCIAL_LINKS = [
  { key: 'facebook', label: 'Facebook', color: '#1877F2', url: 'https://www.facebook.com/jyotishjagrati',
    path: 'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.91h-2.33V22c4.78-.79 8.44-4.94 8.44-9.94Z' },
  { key: 'instagram', label: 'Instagram', color: '#C13584', url: 'https://www.instagram.com/astrowani_official/',
    path: 'M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.25.64-.42 1.37-.47 2.43C2 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.06.22 1.79.47 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.64.25 1.37.42 2.43.47C8.94 22 9.28 22 12 22s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.06-.22-1.79-.47-2.43a4.93 4.93 0 0 0-1.16-1.77 4.93 4.93 0 0 0-1.77-1.16c-.64-.25-1.37-.42-2.43-.47C15.06 2.01 14.72 2 12 2Zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.5.21 1.86.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.13.36.3.88.34 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.21 1.5-.34 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.36.13-.88.3-1.86.34-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.5-.21-1.86-.34a3.13 3.13 0 0 1-1.15-.75 3.13 3.13 0 0 1-.75-1.15c-.13-.36-.3-.88-.34-1.86-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.04-.98.21-1.5.34-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.36-.13.88-.3 1.86-.34C9.01 3.81 9.33 3.8 12 3.8Zm0 3.05a5.15 5.15 0 1 0 0 10.3 5.15 5.15 0 0 0 0-10.3Zm0 8.5a3.35 3.35 0 1 1 0-6.7 3.35 3.35 0 0 1 0 6.7Zm5.35-8.7a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z' },
  { key: 'x', label: 'X', color: '#000000', url: 'https://x.com/astrowani_',
    path: 'M13.6 10.17 20.1 3h-1.55l-5.64 6.23L8.4 3H2.5l6.82 9.64L2.5 21h1.55l5.96-6.59L14.6 21h5.9l-6.9-10.83Zm-2.11 2.33-.69-.97L4.9 4.17h2.38l4.43 6.23.69.97 5.77 8.11h-2.38l-4.7-6.98Z' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', url: 'https://www.linkedin.com/company/astrowani/',
    path: 'M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.86 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45Z' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000', url: 'https://www.youtube.com/@Astrowani',
    path: 'M23 12s0-3.52-.45-5.2a2.9 2.9 0 0 0-2.04-2.05C18.83 4.3 12 4.3 12 4.3s-6.83 0-8.51.45A2.9 2.9 0 0 0 1.45 6.8C1 8.48 1 12 1 12s0 3.52.45 5.2a2.9 2.9 0 0 0 2.04 2.05C5.17 19.7 12 19.7 12 19.7s6.83 0 8.51-.45a2.9 2.9 0 0 0 2.04-2.05C23 15.52 23 12 23 12ZM9.75 15.3V8.7L15.5 12l-5.75 3.3Z' },
];

function injectFooterSocial() {
  const containers = document.querySelectorAll('.footer-social');
  if (!containers.length) return;
  const html = ASTROWANI_SOCIAL_LINKS.map((s) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}" style="--social-color:${s.color};"><svg viewBox="0 0 24 24"><path d="${s.path}"/></svg></a>`).join('');
  containers.forEach((c) => { c.innerHTML = html; });
}

function astroBadgeChip(a) {
  if (a.badge === 'celebrity') return '<div class="astro-badge-chip astro-badge-celebrity">&#9733; Celebrity</div>';
  if (a.badge === 'verified') return '<div class="astro-badge-chip astro-badge-verified">&#10003; Verified</div>';
  if (a.chatOn || a.callOn || a.videoOn) return '<div class="astro-online"><span class="pulse-dot" style="width:6px; height:6px; border-radius:50%; background:currentColor; display:inline-block;"></span>Online</div>';
  return '';
}

function astroCardHtml(a, idx) {
  const ring = idx % 2 === 0 ? 'var(--gold)' : 'var(--maroon)';
  const ratingHtml = a.reviews > 0
    ? `${ASTROWANI_STAR_SVG}<span style="font-weight:800; color:var(--maroon);">${a.rating}</span><span style="color:var(--ink-soft); margin-left:2px;">(${a.reviews})</span>`
    : `${ASTROWANI_SPROUT_SVG}<span style="font-weight:700; color:var(--maroon);">New astrologer</span>`;
  const catLabel = a.cats.length > 2 ? a.cats.slice(0, 2).join(', ') + ` +${a.cats.length - 2}` : a.cats.join(', ');
  // Real in-page actions, not Play Store links: the web client runs the
  // consultation here. aw/astrologers.js owns the click via delegation, and
  // falls back to the store link only if the web client failed to load.
  const chatBtn = a.chatOn
    ? `<button type="button" class="btn-ghost" data-aw-action="chat" data-astro-id="${a.id}">Chat &#8377;${a.chat}</button>`
    : `<span class="btn-ghost">Chat off</span>`;
  const callBtn = a.callOn
    ? `<button type="button" class="btn-gold" data-aw-action="call" data-astro-id="${a.id}">Call &#8377;${a.call}</button>`
    : `<span class="btn-gold">Call off</span>`;
  return `
    <div class="astro-card tilt-card" data-cats="${a.cats.join('|')}" data-astro-id="${a.id}">
      ${astroBadgeChip(a)}
      <div class="astro-status" data-aw-status></div>
      <div class="astro-avatar" style="background:${ring};"><img src="${a.photoUrl || `assets/astrologers/${a.photo}`}" alt="${a.name}" loading="lazy" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"></div>
      <div class="astro-name">${a.name}</div>
      <div class="astro-meta">${catLabel} &middot; ${a.exp} yrs exp</div>
      <div class="astro-rating-row">${ratingHtml}</div>
      <div style="font-size:12px; color:var(--ink-soft);">${a.lang}</div>
      <div class="astro-actions">${chatBtn}${callBtn}</div>
    </div>`;
}

// ---------- single-action astrologer card (chat / call / video only) — used on consult.html ----------
const ASTROWANI_CONSULT_MODES = {
  chat: { label: 'Chat', verb: 'chatOn', price: 'chat', btn: 'btn-ghost' },
  call: { label: 'Call', verb: 'callOn', price: 'call', btn: 'btn-gold' },
  video: { label: 'Video Call', verb: 'videoOn', price: 'video', btn: 'btn-gold' },
};
function astroCardHtmlSingle(a, idx, mode) {
  const cfg = ASTROWANI_CONSULT_MODES[mode] || ASTROWANI_CONSULT_MODES.chat;
  const ring = idx % 2 === 0 ? 'var(--gold)' : 'var(--maroon)';
  const ratingHtml = a.reviews > 0
    ? `${ASTROWANI_STAR_SVG}<span style="font-weight:800; color:var(--maroon);">${a.rating}</span><span style="color:var(--ink-soft); margin-left:2px;">(${a.reviews})</span>`
    : `${ASTROWANI_SPROUT_SVG}<span style="font-weight:700; color:var(--maroon);">New astrologer</span>`;
  const catLabel = a.cats.length > 2 ? a.cats.slice(0, 2).join(', ') + ` +${a.cats.length - 2}` : a.cats.join(', ');
  const enabled = a[cfg.verb];
  const actionBtn = enabled
    ? `<button type="button" class="${cfg.btn}" style="width:100%;" data-aw-action="${mode}" data-astro-id="${a.id}">${cfg.label} &#8377;${a[cfg.price]}/min</button>`
    : `<span class="${cfg.btn}" style="width:100%;">${cfg.label} unavailable</span>`;
  return `
    <div class="astro-card tilt-card" data-cats="${a.cats.join('|')}" data-enabled="${enabled ? '1' : '0'}" data-astro-id="${a.id}">
      ${astroBadgeChip(a)}
      <div class="astro-status" data-aw-status></div>
      <div class="astro-avatar" style="background:${ring};"><img src="${a.photoUrl || `assets/astrologers/${a.photo}`}" alt="${a.name}" loading="lazy" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"></div>
      <div class="astro-name">${a.name}</div>
      <div class="astro-meta">${catLabel} &middot; ${a.exp} yrs exp</div>
      <div class="astro-rating-row">${ratingHtml}</div>
      <div style="font-size:12px; color:var(--ink-soft);">${a.lang}</div>
      <div class="astro-actions">${actionBtn}</div>
    </div>`;
}

// A click on an in-page "#section" link (e.g. the hero's "Talk to an Astrologer" button)
// leaves that hash sitting in the address bar — and every browser re-runs its native
// scroll-to-anchor on the NEXT reload as long as the hash is still there, which is why a
// refresh can land scrolled halfway down the page instead of at the top. Once the browser
// has done its one-time jump, quietly clean the hash out of the URL (replaceState doesn't
// scroll anything) so a later refresh starts at the top again like normal.
function astroCleanHashAfterLoad() {
  if (!window.location.hash) return;
  window.setTimeout(() => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }, 400);
}
astroCleanHashAfterLoad();
window.addEventListener('load', astroCleanHashAfterLoad);

document.addEventListener('DOMContentLoaded', () => {
  injectNavDropdowns();
  injectNavUtilButtons();
  // After the dropdowns, so the drawer is built from the same menu data and
  // sits last in the bar (the hamburger is the right-most control).
  injectMobileNav();
  injectFooterSocial();
  // A generated /hi/ page is ALREADY Hindi in its markup. Running the old
  // in-place swapper over it would capture that Hindi as each node's
  // `i18nEn` baseline and then write it back as the 'English' text — so the
  // language button would have nothing left to restore. Only the shared
  // English pages use it.
  if (!window.ASTROWANI_HI_STRINGS) {
    astroApplyLang(document.documentElement.getAttribute('data-lang') === 'hi' ? 'hi' : 'en');
  }
  // Every astrologer surface renders from window.ASTROWANI_ASTROLOGERS. That array
  // starts as the bundled snapshot (so the page paints instantly, with no layout
  // shift and no blank grid if the API is slow) and is REPLACED by aw/astrologers.js
  // with the live roster — real prices, real service toggles, real online/busy
  // state — which then calls this again. Hence a function rather than a one-shot
  // block: the second render is the one that matters.
  function renderAstrologerSurfaces() {
  const allAstrologers = window.ASTROWANI_ASTROLOGERS || [];

  // ---------- consult.html: single-button directory for one mode (chat/call/video) ----------
  const consultGrid = document.getElementById('astro-consult-grid');
  if (consultGrid && allAstrologers.length) {
    const params = new URLSearchParams(window.location.search);
    const mode = ['chat', 'call', 'video'].includes(params.get('mode')) ? params.get('mode') : 'chat';
    const cfg = ASTROWANI_CONSULT_MODES[mode];

    const titleEl = document.getElementById('consult-title');
    const descEl = document.getElementById('consult-desc');
    if (titleEl) titleEl.textContent = mode === 'video' ? 'Video call with an astrologer' : `${cfg.label} with an astrologer`;
    if (descEl) descEl.textContent = `Compare astrologers for a 1-to-1 ${cfg.label.toLowerCase()}. Check their current availability, language and per-minute rate before connecting.`;
    document.querySelectorAll('.consult-mode-pill').forEach((p) => {
      p.classList.toggle('active', p.getAttribute('data-mode') === mode);
    });

    const sorted = allAstrologers.slice().sort((a, b) => (b[cfg.verb] === a[cfg.verb] ? 0 : b[cfg.verb] ? 1 : -1));
    consultGrid.innerHTML = sorted.map((a, i) => astroCardHtmlSingle(a, i, mode)).join('');
    consultGrid.querySelectorAll('.astro-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 14}deg) rotateY(${(px - 0.5) * 14}deg) translateY(-6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
      });
    });
  }

  // ---------- homepage category grid: the real app categories, linking into the filtered directory ----------
  // WHERE A CONCERN CARD SHOULD SEND SOMEBODY.
  //
  // Every card used to go to astrologers.html?cat=<Category> -- a filtered list.
  // The supplied blueprint is explicit about this: "Each card should link to its
  // own relevant service landing page rather than sending all users to the same
  // generic astrologer listing." A filtered listing cannot rank for "vastu
  // consultation"; it has no title, no H1 and no content of its own, because the
  // filter lives in a query string.
  //
  // Seven of the ten categories now have a real page. Palmistry and Health
  // deliberately do not: Palmistry has 23 astrologers and simply has not been
  // written yet, and HEALTH IS LEFT ALONE ON PURPOSE -- it is a "your money or
  // your life" topic Google holds to a far higher bar, and the Wani Shop health
  // claims already had to be reworded once for the App Store (fc964c0). Those
  // two keep the filtered listing, which is honest if unambitious.
  const CATEGORY_PAGES = {
    'Vedic Astrology': 'kundli-reading.html',
    'Marriage': 'marriage.html',
    'Tarot Reading': 'tarot-reading.html',
    'Numerology': 'numerology.html',
    'Vastu': 'vastu.html',
    'Career': 'career-astrology.html',
    'Business': 'career-astrology.html',
  };

  const homeCatGrid = document.getElementById('home-cat-grid');
  if (homeCatGrid && window.ASTROWANI_CATEGORIES) {
    homeCatGrid.innerHTML = window.ASTROWANI_CATEGORIES.map((cat, i) => {
      const info = ASTROWANI_CATEGORY_INFO[cat] || { sub: 'Talk to an expert', icon: '<circle cx="12" cy="12" r="7"/>' };
      const ring = i % 2 === 0 ? 'var(--gold)' : 'var(--maroon)';
      const stroke = i % 2 === 0 ? 'var(--maroon)' : 'var(--cream)';
      const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${info.icon}</svg>`;
      const href = CATEGORY_PAGES[cat] || `astrologers.html?cat=${encodeURIComponent(cat)}`;
      return `<a href="${href}" class="cat-tile reveal reveal-pop" style="text-decoration:none;">
        <div class="cat-icon" style="background:${ring};">${iconSvg}</div>
        <div class="cat-body">
          <div class="cat-name">${cat}</div>
          <div class="cat-sub">${info.sub}</div>
        </div>
        <svg class="cat-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </a>`;
    }).join('');
  }

  // ---------- astrologer marquee: two rows of a featured, top-rated sample, scrolling opposite ways ----------
  // each astrologer appears in exactly one row, never both, so nobody is seen moving twice at once
  const wireTiltHover = (track) => {
    track.querySelectorAll('.astro-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 14}deg) rotateY(${(px - 0.5) * 14}deg) translateY(-6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
      });
    });
  };
  const marqueeTrack = document.getElementById('astro-marquee-track');
  const marqueeTrack2 = document.getElementById('astro-marquee-track-2');
  if (marqueeTrack && marqueeTrack2 && allAstrologers.length) {
    const featured = allAstrologers.slice(0, 16);
    const rowA = featured.filter((_, i) => i % 2 === 0); // 1st, 3rd, 5th... -> scrolls left
    const rowB = featured.filter((_, i) => i % 2 === 1); // 2nd, 4th, 6th... -> scrolls right
    // each row's own set is rendered twice back to back, so translating exactly -50%/0 loops seamlessly
    marqueeTrack.innerHTML = rowA.map(astroCardHtml).join('') + rowA.map(astroCardHtml).join('');
    marqueeTrack2.innerHTML = rowB.map(astroCardHtml).join('') + rowB.map(astroCardHtml).join('');
    marqueeTrack.style.animationDuration = Math.max(28, rowA.length * 7) + 's';
    marqueeTrack2.style.animationDuration = Math.max(28, rowB.length * 7) + 's';
    wireTiltHover(marqueeTrack);
    wireTiltHover(marqueeTrack2);
  }

  // ---------- homepage: a static grid of more astrologers, after Wani Shop, below the fold ----------
  const moreGrid = document.getElementById('home-more-astrologers');
  if (moreGrid && allAstrologers.length) {
    const moreBatch = allAstrologers.slice(16, 28); // the next 12, none repeated from the marquee above
    moreGrid.innerHTML = moreBatch.map(astroCardHtml).join('');
    wireTiltHover(moreGrid);
  }

  // ---------- full astrologer directory with category filter (astrologers.html) ----------
  const directoryGrid = document.getElementById('astro-directory-grid');
  if (directoryGrid && allAstrologers.length) {
    directoryGrid.innerHTML = allAstrologers.map(astroCardHtml).join('');
    directoryGrid.querySelectorAll('.astro-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 14}deg) rotateY(${(px - 0.5) * 14}deg) translateY(-6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
      });
    });

    const filterBar = document.getElementById('astro-filter-bar');
    // Guarded: this function runs again when the live roster lands, and the pills
    // are appended rather than replaced — without this they would double.
    if (filterBar && window.ASTROWANI_CATEGORIES && !filterBar.dataset.awPillsBuilt) {
      filterBar.dataset.awPillsBuilt = '1';
      const pillHtml = (cat) => `<button type="button" class="astro-filter-pill" data-cat="${cat}">${cat}</button>`;
      filterBar.insertAdjacentHTML('beforeend', window.ASTROWANI_CATEGORIES.map(pillHtml).join(''));
    }
    const applyFilter = (cat) => {
      directoryGrid.querySelectorAll('.astro-card').forEach((card) => {
        const cats = card.getAttribute('data-cats').split('|');
        card.style.display = (cat === 'All' || cats.includes(cat)) ? '' : 'none';
      });
      if (filterBar) {
        filterBar.querySelectorAll('.astro-filter-pill').forEach((p) => {
          p.classList.toggle('active', p.getAttribute('data-cat') === cat);
        });
      }
    };
    // Same re-render guard as the pills: one listener, however many times the
    // grid is rebuilt. It reads the pills from the DOM at click time, so it keeps
    // working against freshly rendered cards.
    if (filterBar && !filterBar.dataset.awFilterWired) {
      filterBar.dataset.awFilterWired = '1';
      filterBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.astro-filter-pill');
        if (!pill) return;
        applyFilter(pill.getAttribute('data-cat'));
      });
    }
    const params = new URLSearchParams(window.location.search);
    // On a re-render, keep whatever filter the visitor had chosen rather than
    // snapping them back to the URL's category.
    const activePill = filterBar && filterBar.querySelector('.astro-filter-pill.active');
    const initialCat = (activePill && activePill.getAttribute('data-cat')) || params.get('cat') || 'All';
    applyFilter(initialCat);
  }
  }
  renderAstrologerSurfaces();
  // aw/astrologers.js calls this once the live roster has replaced the snapshot,
  // which REPLACES innerHTML on several surfaces (the category grid, the
  // marquee, the consult grid). Wrapped, not assigned directly, so that re-render
  // also re-scans for new .reveal elements -- see scanReveals() below. Without
  // this, every element the live re-render creates sat at opacity:0 forever: the
  // reveal system used to capture a fixed element list once, before this second
  // render could ever run, so it had no way to see nodes created after it.
  // scanReveals/sweepReveals are declared further down but are `function`
  // declarations, hoisted within this whole DOMContentLoaded callback, and this
  // wrapper is not actually CALLED until the async live-data fetch resolves --
  // well after the `const io = ...` line below has run -- so the forward
  // reference here is safe.
  window.ASTROWANI_RENDER_ASTROLOGERS = () => {
    renderAstrologerSurfaces();
    scanReveals();
    sweepReveals();
  };

  // Load the optional renderer and model only after a visitor asks for them.
  (() => {
    const button = document.getElementById('app-3d-load');
    const model = document.getElementById('app-3d-model');
    if (!button || !model) return;
    const status = document.getElementById('app-3d-status');
    const poster = document.getElementById('app-3d-poster');
    const hint = document.getElementById('app-3d-hint');
    let loader;
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = 'Loading 3D preview…';
      try {
        if (!customElements.get('model-viewer')) {
          loader ||= import('https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js').catch(err => { loader = null; throw err; });
          await loader;
        }
        model.hidden = false;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => finish(new Error('Timeout')), 45000);
          const loaded = () => finish();
          const failed = () => finish(new Error('Model load failed'));
          function finish(err) {
            clearTimeout(timer);
            model.removeEventListener('load', loaded);
            model.removeEventListener('error', failed);
            err ? reject(err) : resolve();
          }
          model.addEventListener('load', loaded, {once:true});
          model.addEventListener('error', failed, {once:true});
          model.setAttribute('src', model.dataset.src);
        });
        poster.hidden = true;
        button.hidden = true;
        status.textContent = '';
        hint?.classList.add('is-shown');
      } catch (_) {
        model.hidden = true;
        model.removeAttribute('src');
        status.textContent = 'The preview could not load. You can try again.';
        button.disabled = false;
      }
    });
    model.addEventListener('camera-change', e => {
      if (e.detail?.source === 'user-interaction') hint?.classList.remove('is-shown');
    });
  })();

  // ---------- hero phone carousel: cycle which phone is centre, every 5s ----------
  // Each phone already has a one-time scroll-triggered entrance
  // (reveal-grow / reveal-grow-left / reveal-grow-right, from the reveal
  // system above). Once that has actually finished, this hands the three
  // elements over to style.css's .ch-phone-cycle / slot-center/left/right —
  // whose resting values are IDENTICAL to the entrance's own end state, so
  // the handover is invisible — and rotates which element holds which slot
  // every 5s. The old entrance classes are explicitly REMOVED on handover:
  // `.ch-phone-side.reveal-grow-left.is-visible` is three classes deep and
  // would otherwise out-specificity the two-class slot rules and freeze that
  // phone's rotation/position forever, no matter which slot it is later given.
  (() => {
    const stage = document.querySelector('.ch-stage');
    if (!stage) return;
    const center = stage.querySelector('.ch-phone.reveal-grow');
    const left = stage.querySelector('.ch-phone-side.reveal-grow-left');
    const right = stage.querySelector('.ch-phone-side.reveal-grow-right');
    if (!center || !left || !right) return;
    // .ch-phone-side { display: none } below 760px — only the centre phone
    // shows at all on a phone screen, so there is nothing to cycle.
    if (window.matchMedia('(max-width: 760px)').matches) return;
    // Respected by not starting the repeating swap at all, rather than
    // leaving it running with the CSS transitions stripped out (which would
    // make the phones teleport between slots every 5s — worse than either
    // full motion or none).
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SLOT_CLASSES = ['slot-center', 'slot-left', 'slot-right'];
    const SWAP_MS = 5000;
    function handOverToCarousel() {
      let order = [center, left, right]; // order[0] is whoever currently sits centre
      [center, left, right].forEach((el) => {
        el.classList.remove('reveal', 'reveal-grow', 'reveal-grow-left', 'reveal-grow-right', 'is-visible', 'ch-phone-side');
        el.classList.add('ch-phone-cycle');
      });
      order.forEach((el, i) => el.classList.add(SLOT_CLASSES[i]));
      if (reduceMotion) return;

      // Driven by elapsed WALL-CLOCK time, not by trusting setInterval's own
      // 5000ms cadence. A plain setInterval(fn, 5000) looks "stuck" the moment
      // the tab is backgrounded (switching away to type, another window on
      // top, the OS deprioritising the tab) -- Chrome throttles timers in a
      // hidden tab, sometimes to a few calls a MINUTE, and the callback simply
      // has not fired in 5s even though 5s of real time passed. A 1s ticker
      // that checks elapsed time catches up the moment it is allowed to run
      // again, and the visibilitychange listener forces that check instantly
      // when the tab becomes visible, rather than waiting for the next tick.
      let lastSwap = Date.now();
      function swap() {
        order.forEach((el) => el.classList.remove(...SLOT_CLASSES));
        // Round-robin: whoever was on the left takes the centre, the centre
        // phone moves right, and the right phone comes back round to the left.
        order = [order[1], order[2], order[0]];
        order.forEach((el, i) => el.classList.add(SLOT_CLASSES[i]));
        lastSwap = Date.now();
      }
      setInterval(() => {
        if (Date.now() - lastSwap >= SWAP_MS) swap();
      }, 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - lastSwap >= SWAP_MS) swap();
      });
    }

    if (center.classList.contains('is-visible')) {
      handOverToCarousel();
    } else {
      const waitForEntrance = setInterval(() => {
        if (!center.classList.contains('is-visible')) return;
        clearInterval(waitForEntrance);
        handOverToCarousel();
      }, 200);
    }
  })();

  // ---------- scroll-triggered reveal (clip-path wipe) ----------
  // IntersectionObserver is the primary driver; a direct bounding-rect sweep
  // backs it up on scroll (and on a short interval) so the reveal still
  // happens if IO is ever slow to fire.
  //
  // Elements are scanned LIVE on every scan/sweep, never captured once into a
  // fixed array -- a fixed array was the original bug (see the comment on
  // ASTROWANI_RENDER_ASTROLOGERS above). data-reveal-seen marks an element once
  // it has been handed to the observer, so a re-scan after a re-render only
  // picks up what is actually new rather than re-observing everything.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  function scanReveals() {
    document.querySelectorAll('.reveal:not([data-reveal-seen])').forEach((el) => {
      el.setAttribute('data-reveal-seen', '');
      io.observe(el);
    });
  }

  function sweepReveals() {
    const vh = window.innerHeight;
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vh - 40 && rect.bottom > 0) {
        el.classList.add('is-visible');
        io.unobserve(el);
      }
    });
  }
  window.addEventListener('scroll', sweepReveals, { passive: true });
  window.addEventListener('resize', sweepReveals);
  scanReveals();
  sweepReveals();
  const sweepTimer = setInterval(() => {
    sweepReveals();
    if (!document.querySelector('.reveal:not(.is-visible)')) clearInterval(sweepTimer);
  }, 250);

  // ---------- FAQ accordion: one open at a time, toggle on click ----------
  // max-height is set to the wrap's real scrollHeight, not a CSS keyword — "auto"
  // and "none" can't be transitioned, and the grid-template-rows: 0fr -> 1fr trick
  // does not reserve space for text content inside an auto-height ancestor, so a
  // just-opened answer measured a few pixels tall instead of its real height.
  function closeFaqItem(item) {
    item.removeAttribute('data-open');
    item.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
    item.querySelector('.faq-a-wrap').style.maxHeight = '0px';
  }
  function openFaqItem(item) {
    const wrap = item.querySelector('.faq-a-wrap');
    item.setAttribute('data-open', '');
    item.querySelector('.faq-q')?.setAttribute('aria-expanded', 'true');
    wrap.style.maxHeight = `${wrap.scrollHeight}px`;
  }
  document.querySelectorAll('.faq-item').forEach((item) => {
    const btn = item.querySelector('.faq-q');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const opening = !item.hasAttribute('data-open');
      // Close every other item first, so only one answer is ever open — a long
      // page of simultaneously-open answers is what an accordion exists to avoid.
      document.querySelectorAll('.faq-item[data-open]').forEach((openItem) => {
        if (openItem !== item) closeFaqItem(openItem);
      });
      if (opening) openFaqItem(item); else closeFaqItem(item);
    });
  });

  // ---------- odometer: digits roll down from above into place ----------
  function buildOdometer(el) {
    const text = el.getAttribute('data-text') || el.textContent;
    el.textContent = '';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', text);
    el.classList.add('odo');
    [...text].forEach((ch) => {
      if (/[0-9]/.test(ch)) {
        const cell = document.createElement('span');
        cell.className = 'odo-cell';
        cell.setAttribute('aria-hidden', 'true');
        const strip = document.createElement('span');
        strip.className = 'odo-strip';
        const seq = [parseInt(ch, 10)];
        for (let loop = 0; loop < 2; loop++) {
          for (let d = 9; d >= 0; d--) seq.push(d);
        }
        seq.forEach((d) => {
          const digit = document.createElement('span');
          digit.className = 'odo-digit';
          digit.textContent = d;
          strip.appendChild(digit);
        });
        cell.appendChild(strip);
        el.appendChild(cell);
        cell._strip = strip;
        cell._startEm = -(seq.length - 1);
        strip.style.transform = `translateY(${cell._startEm}em)`;
      } else {
        const span = document.createElement('span');
        span.className = 'odo-static';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = ch;
        el.appendChild(span);
      }
    });
  }

  function rollOdometer(el, delayMs) {
    const cells = el.querySelectorAll('.odo-cell');
    cells.forEach((cell, i) => {
      setTimeout(() => {
        cell._strip.style.transition = 'transform 1.3s cubic-bezier(.22,.9,.3,1)';
        cell._strip.style.transform = 'translateY(0em)';
      }, delayMs + i * 90);
    });
  }

  // The hero stats sit above the fold on every screen size, so they always
  // roll right on page load — never gated on scrolling into view.
  const odoEls = Array.from(document.querySelectorAll('.odo-number'));
  odoEls.forEach((el) => buildOdometer(el));
  odoEls.forEach((el, i) => rollOdometer(el, 500 + i * 120));

  // ---------- cursor-driven 3D tilt on the primary cards ----------
  document.querySelectorAll('.tilt-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * 14;
      const rotateX = (0.5 - py) * 14;
      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });

  // ---------- magnetic buttons ----------
  document.querySelectorAll('.magnetic').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.2}px, ${y * 0.35 - 3}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'translate(0, 0)'; });
  });

  // ---------- click ripple ----------
  document.querySelectorAll('.btn-gold, .btn-outline').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-el';
      const size = Math.max(rect.width, rect.height) * 1.6;
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });

  // ---------- sticky nav shrink + top scroll progress ----------
  const nav = document.getElementById('site-nav');
  const navFloating = document.getElementById('site-nav-floating');
  const chWrap = document.querySelector('.ch-wrap');
  const progress = document.getElementById('scroll-progress');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || document.documentElement.scrollTop;
      if (nav) nav.classList.toggle('nav-scrolled', y > 40);
      if (navFloating) {
        // shows exactly when the hero's own pill nav has scrolled out of view (its sticky
        // parent, .ch-wrap, has left the viewport) — a seamless handoff, not a magic offset
        const show = chWrap ? chWrap.getBoundingClientRect().bottom <= 0 : y > 80;
        navFloating.classList.toggle('nav-floating-visible', show);
      }
      if (progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? Math.min(y / max, 1) * 100 : 0) + '%';
      }
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
});

/**
 * Translate text this file INJECTS — nav dropdowns, footer columns, category
 * chips. aw/make-hindi-pages.js only ever sees the static markup, so without
 * this the body of a /hi/ page is Hindi and its navigation is English.
 *
 * The table is emitted into the page by that same generator, so the two can
 * never disagree. Matching is EXACT on the trimmed English, the same rule the
 * generator uses: a partial or case-insensitive match would mangle Hindi text
 * that happens to contain a Latin word (every 'Astrowani' on the page).
 * Running it document-wide is safe for the same reason — already-translated
 * text matches no English key.
 */
function astroLocaliseInjected(root) {
  const dict = window.ASTROWANI_HI_STRINGS;
  if (!dict) return;
  const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
  const pending = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim();
    if (t && dict[t]) pending.push([n, dict[t]]);
  }
  // Collected first, replaced after: editing while walking invalidates it.
  for (const [n, hi] of pending) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), hi);
  for (const el of (root || document).querySelectorAll('[aria-label],[title],[alt],[placeholder]')) {
    for (const a of ['aria-label', 'title', 'alt', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && dict[v.trim()]) el.setAttribute(a, dict[v.trim()]);
    }
  }
}
window.astroLocaliseInjected = astroLocaliseInjected;

function astroRepairHindiLinks() {
  if (document.documentElement.lang !== 'hi') return;
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    const fixed = astroPageHref(href);
    if (fixed !== href) a.setAttribute('href', fixed);
  });
}
/**
 * A /hi/ page sits one directory deeper, so a relative `assets/...` built at
 * runtime resolves to /hi/assets/ and 404s. aw/make-hindi-pages.js rewrites the
 * STATIC markup only, so every astrologer avatar — fetched from the API long
 * after load — was broken on every Hindi page. Measured, not assumed.
 *
 * Idempotent by construction: a path that has been rewritten no longer starts
 * with `assets/`, so re-running cannot stack another `../` on it.
 */
function astroRerootInjectedAssets(root) {
  for (const el of (root.querySelectorAll ? root.querySelectorAll('img[src^="assets/"]') : [])) {
    el.setAttribute('src', `../${el.getAttribute('src')}`);
  }
  if (root.matches && root.matches('img[src^="assets/"]')) {
    root.setAttribute('src', `../${root.getAttribute('src')}`);
  }
}

function astroFinishHindiPage() {
  astroRepairHindiLinks();
  astroLocaliseInjected();
  if (document.documentElement.lang !== 'hi') return;
  astroRerootInjectedAssets(document);
  // Cards arrive from the API after this runs, and more arrive on "load more",
  // so a one-off pass at DOMContentLoaded is not enough.
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        astroRerootInjectedAssets(node);
        astroLocaliseInjected(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
// Registered LAST, so it runs after this file's other DOMContentLoaded
// handlers have injected the nav, the footer and the category chips.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', astroFinishHindiPage);
else astroFinishHindiPage();
