'use strict';

/**
 * Page <title> helpers for the server-rendered website pages (blog articles,
 * Web Stories, astrologer profiles).
 *
 * Google shows roughly 60 characters of a title and rewrites longer ones, so
 * the brand goes on only when it still fits. A title that would run over
 * keeps its own words and drops the brand, because the words are what match a
 * search. (Audit 2026-11-16: 41 titles were over 60, mostly because of a
 * " — Astrowani Blog" / " | Astrowani Story" suffix.)
 */

const TITLE_MAX = 60;
const BRAND = ' | Astrowani';

function brandTitle(title, max = TITLE_MAX) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return BRAND.slice(3);
  return (t + BRAND).length <= max ? t + BRAND : t;
}

/** The first candidate that fits with the brand; otherwise the shortest, branded if it fits. */
function firstFitting(candidates, max = TITLE_MAX) {
  const list = candidates.map((c) => String(c || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const c of list) if ((c + BRAND).length <= max) return c + BRAND;
  const shortest = list.reduce((a, b) => (b.length < a.length ? b : a), list[0] || '');
  return brandTitle(shortest, max);
}

module.exports = { brandTitle, firstFitting, TITLE_MAX, BRAND };
