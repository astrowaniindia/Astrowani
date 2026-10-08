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
  const container = document.querySelector('.ch-nav-links') || document.querySelector('.nav-links');
  if (!container) return;
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
      <div class="nav-dropdown${wideClass}">${itemsWrap}</div>
    </div>`;
  }).join('');
  // prepended, not appended — final order is Consultations, Horoscope, Free Services,
  // Calculators, Panchang, then whatever's already in the nav (Blog, Wani Shop)
  container.insertAdjacentHTML('afterbegin', html);

  // touch/click fallback — hover alone doesn't work on tap devices
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
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      container.querySelectorAll('.nav-item-drop.nav-drop-open').forEach((o) => o.classList.remove('nav-drop-open'));
    }
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
    <button type="button" class="nav-util-btn" data-role="theme" title="Toggle site colors" aria-label="Toggle site colors">
      <svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.7 14.9A8.5 8.5 0 0 1 9.1 3.3a.6.6 0 0 0-.7-.8A10 10 0 1 0 21.5 15.6a.6.6 0 0 0-.8-.7z"/></svg>
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:none;"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>
    </button>
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

  const themeBtn = document.querySelector('.nav-util-btn[data-role="theme"]');
  const updateThemeIcon = () => {
    const inverted = document.documentElement.getAttribute('data-theme') === 'inverted';
    themeBtn.querySelector('.icon-moon').style.display = inverted ? 'none' : '';
    themeBtn.querySelector('.icon-sun').style.display = inverted ? '' : 'none';
  };
  updateThemeIcon();
  themeBtn.addEventListener('click', () => {
    const inverted = document.documentElement.getAttribute('data-theme') === 'inverted';
    if (inverted) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('astro-theme', 'default'); }
    else { document.documentElement.setAttribute('data-theme', 'inverted'); localStorage.setItem('astro-theme', 'inverted'); }
    updateThemeIcon();
  });

  const langBtn = document.querySelector('.nav-util-btn[data-role="lang"]');
  langBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-lang') === 'hi' ? 'en' : 'hi';
    localStorage.setItem('astro-lang', next);
    astroApplyLang(next);
  });
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
  const chatBtn = a.chatOn
    ? `<a href="${ASTROWANI_APP_LINK}" class="btn-ghost">Chat &#8377;${a.chat}</a>`
    : `<span class="btn-ghost">Chat off</span>`;
  const callBtn = a.callOn
    ? `<a href="${ASTROWANI_APP_LINK}" class="btn-gold">Call &#8377;${a.call}</a>`
    : `<span class="btn-gold">Call off</span>`;
  return `
    <div class="astro-card tilt-card" data-cats="${a.cats.join('|')}">
      ${astroBadgeChip(a)}
      <div class="astro-avatar" style="background:${ring};"><img src="assets/astrologers/${a.photo}" alt="${a.name}" loading="lazy" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"></div>
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
    ? `<a href="${ASTROWANI_APP_LINK}" class="${cfg.btn}" style="width:100%;">${cfg.label} &#8377;${a[cfg.price]}/min</a>`
    : `<span class="${cfg.btn}" style="width:100%;">${cfg.label} unavailable</span>`;
  return `
    <div class="astro-card tilt-card" data-cats="${a.cats.join('|')}" data-enabled="${enabled ? '1' : '0'}">
      ${astroBadgeChip(a)}
      <div class="astro-avatar" style="background:${ring};"><img src="assets/astrologers/${a.photo}" alt="${a.name}" loading="lazy" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"></div>
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
  astroApplyLang(document.documentElement.getAttribute('data-lang') === 'hi' ? 'hi' : 'en');
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
    if (descEl) descEl.textContent = `Every astrologer below is available for a 1-to-1 ${cfg.label.toLowerCase()} — pick one and continue in the Astrowani app.`;
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
  const homeCatGrid = document.getElementById('home-cat-grid');
  if (homeCatGrid && window.ASTROWANI_CATEGORIES) {
    homeCatGrid.innerHTML = window.ASTROWANI_CATEGORIES.map((cat, i) => {
      const info = ASTROWANI_CATEGORY_INFO[cat] || { sub: 'Talk to an expert', icon: '<circle cx="12" cy="12" r="7"/>' };
      const ring = i % 2 === 0 ? 'var(--gold)' : 'var(--maroon)';
      const stroke = i % 2 === 0 ? 'var(--maroon)' : 'var(--cream)';
      const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${info.icon}</svg>`;
      return `<a href="astrologers.html?cat=${encodeURIComponent(cat)}" class="cat-tile reveal reveal-pop" style="text-decoration:none;">
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
    if (filterBar && window.ASTROWANI_CATEGORIES) {
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
    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.astro-filter-pill');
        if (!pill) return;
        applyFilter(pill.getAttribute('data-cat'));
      });
    }
    const params = new URLSearchParams(window.location.search);
    const initialCat = params.get('cat') || 'All';
    applyFilter(initialCat);
  }

  // ---------- concentric rings behind the hero (flat outlines, no gradient) ----------
  const chRingsEl = document.getElementById('ch-rings');
  if (chRingsEl) {
    const ringSizes = [260, 360, 460, 560, 660];
    ringSizes.forEach((s, i) => {
      const r = document.createElement('div');
      r.className = 'ch-ring';
      r.style.width = s + 'px';
      r.style.height = s + 'px';
      r.style.opacity = (1 - i * 0.16).toFixed(2);
      chRingsEl.appendChild(r);
    });
  }

  // ---------- scroll-triggered reveal (clip-path wipe) ----------
  // IntersectionObserver is the primary driver; a direct bounding-rect sweep
  // backs it up on scroll (and on a short interval) so the reveal still
  // happens if IO is ever slow to fire.
  const revealEls = Array.from(document.querySelectorAll('.reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach((el) => io.observe(el));

  function sweepReveals() {
    const vh = window.innerHeight;
    revealEls.forEach((el) => {
      if (el.classList.contains('is-visible')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < vh - 40 && rect.bottom > 0) {
        el.classList.add('is-visible');
        io.unobserve(el);
      }
    });
  }
  window.addEventListener('scroll', sweepReveals, { passive: true });
  window.addEventListener('resize', sweepReveals);
  sweepReveals();
  const sweepTimer = setInterval(() => {
    sweepReveals();
    if (!revealEls.some((el) => !el.classList.contains('is-visible'))) clearInterval(sweepTimer);
  }, 250);

  // ---------- odometer: digits roll down from above into place ----------
  function buildOdometer(el) {
    const text = el.getAttribute('data-text') || el.textContent;
    el.textContent = '';
    el.classList.add('odo');
    [...text].forEach((ch) => {
      if (/[0-9]/.test(ch)) {
        const cell = document.createElement('span');
        cell.className = 'odo-cell';
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
  const progress = document.getElementById('scroll-progress');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || document.documentElement.scrollTop;
      if (nav) nav.classList.toggle('nav-scrolled', y > 40);
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
