/**
 * DEV TOOL, run in a browser — not part of the site (excluded from deploy).
 * Collects the CSS rules the homepage's FIRST SCREEN uses, for
 * aw/critical-index.css, which aw/apply-critical-css.js inlines.
 *
 * HOW (CLAUDE.md EU2 / WEBSITE.md): serve the site (astrowani-website-dev), open
 * index.html, and at each of 375, 768, 1024 and 1440 px wide, RELOAD, stay at the
 * top, and evaluate:
 *     await import('/aw/critical-css-extract.js?' + Date.now()).then((m) => m.collect())
 * then once, at the end:
 *     await import('/aw/critical-css-extract.js?' + Date.now()).then((m) => m.output())
 * and save the returned text as aw/critical-index.css.
 *
 * WHAT COUNTS: every rule in style.css / aw/aw.css whose selector (with pseudo
 * classes and elements stripped) matches html, body, or any element whose box
 * starts within the first screen — including elements that are display:none,
 * because the rules that HIDE things are the ones that stop a flash of the menu.
 * @media / @supports wrappers are kept around their kept rules, so a rule only
 * for wide screens still applies only there; @keyframes are kept if a kept rule
 * names them. Over-including is harmless (the full sheet repeats the same rules);
 * under-including shows as a flash, so when in doubt it keeps.
 */
const KEY = 'aw-critical-keys';
const SHEETS = ['style.css', 'aw/aw.css'];

const sheets = () => [...document.styleSheets].filter((s) => s.href && SHEETS.some((n) => new URL(s.href).pathname.endsWith(`/${n}`)))
  .sort((a, b) => SHEETS.findIndex((n) => a.href.includes(n)) - SHEETS.findIndex((n) => b.href.includes(n)));

const strip = (sel) => sel
  .replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, (m) => (/^:(not|is|where|has)\(/.test(m) ? m : ''))
  .trim() || '*';

export function collect() {
  scrollTo(0, 0);
  const fold = innerHeight;
  const els = [document.documentElement, document.body, ...document.querySelectorAll('body *')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.top < fold; });
  const keep = new Set(JSON.parse(sessionStorage.getItem(KEY) || '[]'));
  const walk = (rules, path) => {
    [...rules].forEach((r, i) => {
      const key = `${path}/${i}`;
      if (r instanceof CSSStyleRule) {
        const hit = r.selectorText.split(',').some((s) => {
          const t = strip(s);
          try { return t === '*' || els.some((e) => e.matches(t)); } catch (_) { return true; }
        });
        if (hit) keep.add(key);
      } else if (r.cssRules) walk(r.cssRules, key);
    });
  };
  sheets().forEach((s, i) => walk(s.cssRules, String(i)));
  sessionStorage.setItem(KEY, JSON.stringify([...keep]));
  return `${innerWidth}px: ${keep.size} rules kept so far`;
}

export function output() {
  const keep = new Set(JSON.parse(sessionStorage.getItem(KEY) || '[]'));
  const names = new Set();
  const emit = (rules, path) => {
    const out = [];
    [...rules].forEach((r, i) => {
      const key = `${path}/${i}`;
      if (r instanceof CSSStyleRule) {
        if (!keep.has(key)) return;
        out.push(r.cssText);
        const a = r.style.animationName || r.style.animation;
        if (a) a.split(/[\s,]+/).forEach((n) => names.add(n));
      } else if (r instanceof CSSKeyframesRule) {
        out.push({ keyframes: r });
      } else if (r.cssRules) {
        const inner = emit(r.cssRules, key);
        if (inner.length) {
          const head = r.cssText.slice(0, r.cssText.indexOf('{')).trim();
          out.push({ group: head, inner });
        }
      }
    });
    return out;
  };
  const flat = (items) => items.map((x) => (typeof x === 'string' ? x
    : x.keyframes ? (names.has(x.keyframes.name) ? x.keyframes.cssText : '')
      : `${x.group} {\n${flat(x.inner)}\n}`)).filter(Boolean).join('\n');
  const css = sheets().map((s, i) => `/* from ${SHEETS[i]} */\n${flat(emit(s.cssRules, String(i)))}`).join('\n');
  sessionStorage.removeItem(KEY);
  return css;
}
