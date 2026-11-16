/**
 * Render a Google Web Story (an AMP story page), for Google Discover.
 *
 * Two kinds use this, and nothing else should need its own copy of the markup:
 *   - the 24 daily horoscope stories, written onto the VPS each night by
 *     astrowani-website/aw/bake-horoscopes.js (via aw/horoscope-stories.js);
 *   - one story per blog article, rendered on request by src/blogStories.js.
 *
 * PURE: no I/O, no database. Everything it prints is escaped here, so a caller
 * may pass text straight from the database.
 *
 * ============================================================================
 * AMP IS STRICT, AND A STORY THAT FAILS VALIDATION IS SIMPLY NOT SHOWN.
 * Google does not warn; the story just never appears in Discover. So:
 *   - no JavaScript of our own anywhere, and no <script> except the AMP runtime,
 *     amp-story and the JSON-LD block;
 *   - all CSS in the single <style amp-custom>, no !important;
 *   - the boilerplate <style amp-boilerplate> must be byte-for-byte AMP's;
 *   - every image is an <amp-img>, every link out of the story is an
 *     <amp-story-page-outlink> (one per page at most).
 * Run astrowani-backend/scripts/testWebStories.js after any change here — it
 * runs the official AMP validator over every kind of page this file produces.
 *
 * WHAT GOOGLE REQUIRES of a story to surface it (developers.google.com/search/
 * docs/appearance/enable-web-stories): `title`, `publisher`,
 * `publisher-logo-src` (square, >= 96px), `poster-portrait-src` (3:4,
 * >= 640x853), a self-referencing canonical, and not blocked by robots.
 * ============================================================================
 */

const BOILERPLATE = '<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The site's three brand colours (astrowani-website/style.css): maroon, cream, gold.
const CSS = `
amp-story{font-family:'Manrope','Noto Sans Devanagari',system-ui,sans-serif;color:#F4D8BC}
amp-story-page{background:#592A19}
amp-story-page.aw-text{background:radial-gradient(circle at 50% 30%,#7a3a22 0%,#592A19 55%,#3a1a0f 100%)}
.aw-wheel{opacity:.13}
.aw-shade{background:linear-gradient(180deg,rgba(58,26,15,0) 35%,rgba(58,26,15,.92) 78%)}
.aw-bottom{align-content:end;padding:32px 26px 44px}
.aw-center{align-content:center;padding:40px 28px}
.aw-eyebrow{font-size:14px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#FFD700;margin:0 0 12px}
.aw-title{font-family:'Marcellus','Noto Sans Devanagari',serif;font-size:34px;line-height:1.15;color:#fff7ee;margin:0 0 12px;font-weight:400}
.aw-sub{font-size:16px;line-height:1.5;color:#F4D8BC;margin:0}
.aw-text-body{font-size:21px;line-height:1.55;color:#fff7ee;margin:0}
.aw-meter{height:10px;border-radius:5px;background:rgba(244,216,188,.22);margin:0 0 22px;overflow:hidden}
.aw-meter-fill{height:10px;background:#FFD700;border-radius:5px}
.aw-meter-label{font-size:15px;font-weight:700;color:#FFD700;margin:0 0 8px}
.aw-brand{font-size:13px;color:#F4D8BC;opacity:.8;margin:18px 0 0}
`.replace(/\n/g, '');

function coverPage(p) {
  return `<amp-story-page id="${esc(p.id)}">
<amp-story-grid-layer template="fill"><amp-img src="${esc(p.image)}" width="960" height="1280" layout="fill" object-fit="cover" alt="${esc(p.imageAlt || '')}"></amp-img></amp-story-grid-layer>
<amp-story-grid-layer template="fill" class="aw-shade"></amp-story-grid-layer>
<amp-story-grid-layer template="vertical" class="aw-bottom">
${p.eyebrow ? `<p class="aw-eyebrow" animate-in="fade-in">${esc(p.eyebrow)}</p>` : ''}
<h1 class="aw-title" animate-in="fly-in-bottom">${esc(p.title)}</h1>
${p.sub ? `<p class="aw-sub" animate-in="fade-in" animate-in-delay="0.3s">${esc(p.sub)}</p>` : ''}
</amp-story-grid-layer>
</amp-story-page>`;
}

function textPage(p, wheel) {
  const meter = Number.isFinite(p.meter)
    ? `<p class="aw-meter-label" animate-in="fade-in">${esc(`${p.meterLabel || ''} ${Math.max(0, Math.min(100, Math.round(p.meter)))}%`.trim())}</p>
<div class="aw-meter" animate-in="fade-in"><div class="aw-meter-fill" style="width:${Math.max(0, Math.min(100, Math.round(p.meter)))}%"></div></div>`
    : '';
  return `<amp-story-page id="${esc(p.id)}" class="aw-text">
${wheel ? `<amp-story-grid-layer template="fill"><amp-img class="aw-wheel" src="${esc(wheel)}" width="506" height="493" layout="fill" object-fit="contain" alt=""></amp-img></amp-story-grid-layer>` : ''}
<amp-story-grid-layer template="vertical" class="aw-center">
${p.eyebrow ? `<p class="aw-eyebrow" animate-in="fade-in">${esc(p.eyebrow)}</p>` : ''}
${p.title ? `<h2 class="aw-title" animate-in="fly-in-bottom">${esc(p.title)}</h2>` : ''}
${meter}
${p.text ? `<p class="aw-text-body" animate-in="fade-in" animate-in-delay="0.25s">${esc(p.text)}</p>` : ''}
${p.brand ? `<p class="aw-brand">${esc(p.brand)}</p>` : ''}
</amp-story-grid-layer>
${p.href ? `<amp-story-page-outlink layout="nodisplay" theme="custom" cta-accent-element="background" cta-accent-color="#FFD700"><a href="${esc(p.href)}">${esc(p.cta)}</a></amp-story-page-outlink>` : ''}
</amp-story-page>`;
}

/**
 * @param {object} s
 * @param {'en'|'hi'} s.lang
 * @param {string} s.title         story title (shown by Discover), keep it short
 * @param {string} s.headTitle     the <title>; defaults to title
 * @param {string} s.description
 * @param {string} s.canonical     absolute, self-referencing
 * @param {Array<[string,string]>} [s.alternates]  [hreflang, absolute href]
 * @param {string} s.poster        absolute, 3:4, >= 640x853
 * @param {string} s.logo          absolute, square, >= 96px
 * @param {string} [s.wheel]       faint background art for text pages
 * @param {string} s.datePublished ISO
 * @param {string} s.dateModified  ISO
 * @param {string} s.siteBase      absolute site root, for the publisher
 * @param {Array<object>} s.pages  first is the cover ({kind:'cover'}), the rest
 *                                 text pages; a text page with `href` + `cta`
 *                                 carries the swipe-up link.
 */
function renderStory(s) {
  const hi = s.lang === 'hi';
  const pages = s.pages.map((p) => (p.kind === 'cover' ? coverPage(p) : textPage(p, s.wheel))).join('\n');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: s.title,
    description: s.description,
    image: [s.poster],
    mainEntityOfPage: s.canonical,
    inLanguage: hi ? 'hi-IN' : 'en-IN',
    datePublished: s.datePublished,
    dateModified: s.dateModified,
    author: { '@type': 'Organization', name: 'Astrowani', url: `${s.siteBase}/` },
    publisher: { '@type': 'Organization', name: 'Astrowani', url: `${s.siteBase}/`, logo: { '@type': 'ImageObject', url: s.logo } },
  };
  const fonts = `https://fonts.googleapis.com/css2?family=Marcellus&family=Manrope:wght@500;700${hi ? '&family=Noto+Sans+Devanagari:wght@500;700' : ''}&display=swap`;
  return `<!doctype html>
<html amp lang="${hi ? 'hi' : 'en'}">
<head>
<meta charset="utf-8">
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
<title>${esc(s.headTitle || s.title)}</title>
<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
<meta name="description" content="${esc(s.description)}">
<link rel="canonical" href="${esc(s.canonical)}">
${(s.alternates || []).map(([lang, href]) => `<link rel="alternate" hreflang="${esc(lang)}" href="${esc(href)}">`).join('\n')}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.description)}">
<meta property="og:image" content="${esc(s.poster)}">
<meta property="og:url" content="${esc(s.canonical)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${esc(fonts)}">
${BOILERPLATE}
<style amp-custom>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
</head>
<body>
<amp-story standalone title="${esc(s.title)}" publisher="Astrowani" publisher-logo-src="${esc(s.logo)}" poster-portrait-src="${esc(s.poster)}">
${pages}
</amp-story>
</body>
</html>
`;
}

module.exports = { renderStory, esc };
