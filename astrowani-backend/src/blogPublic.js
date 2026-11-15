// Read-only public article routes. Kept separate so tests never start billing workers.
const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const imageUrl = require('./imageUrl');
const { SITE_BASE } = require('./blogAgent/seo');

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} })
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name]))
  .replace(/\s+/g, ' ').trim();
const cleanContent = (s) => sanitizeHtml(String(s || ''), {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'details', 'summary']),
  allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height', 'loading'], '*': ['id'] },
  allowedSchemes: ['https', 'http', 'mailto'],
});

// Keep existing FAQ data as data, never execute scripts stored in article HTML.
function faqData(html) {
  for (const m of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const faq = (data['@graph'] || [data]).find(n => n['@type'] === 'FAQPage');
      if (!Array.isArray(faq?.mainEntity)) continue;
      return { '@type': 'FAQPage', mainEntity: faq.mainEntity.filter(q => q.name && q.acceptedAnswer?.text).map(q => ({
        '@type': 'Question', name: plain(q.name), acceptedAnswer: { '@type': 'Answer', text: plain(q.acceptedAnswer.text) },
      })) };
    } catch (_) { /* Legacy malformed markup must not prevent reading the article. */ }
  }
  return null;
}

function mapBlog(b) {
  return {
    _id: b.id, slug: b.slug || null, title: b.title, excerpt: b.excerpt,
    metaDescription: b.meta_description, thumbnail: imageUrl.cardUrl(b.thumbnail),
    category: { name: b.categories?.name || '' }, createdAt: b.created_at, updatedAt: b.updated_at,
    english: { title: b.title_en || b.title, content: cleanContent(b.content_en) },
    hindi: { title: b.title_hi || '', content: cleanContent(b.content_hi),
      metaDescription: b.meta_description_hi || '', excerpt: b.excerpt_hi || '' },
    faqEnglish: faqData(b.content_en), faqHindi: faqData(b.content_hi),
  };
}

function identifier(query) {
  if (typeof query.slug === 'string' && query.slug.trim() && query.slug.length <= 250) return ['slug', query.slug];
  if (typeof query.id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(query.id)) return ['id', query.id];
  return null;
}

async function findArticle(db, query) {
  const key = identifier(query);
  if (!key) return null;
  const { data, error } = await db.from('blogs').select('*, categories(name)')
    .eq('is_published', true).eq(key[0], key[1]).maybeSingle();
  if (error) throw error;
  return data ? mapBlog(data) : null;
}

function description(post, hi) {
  const meta = plain(hi ? post.hindi.metaDescription : post.metaDescription);
  const clauses = meta.split(',').filter(Boolean);
  const avg = clauses.reduce((n, c) => n + c.trim().split(/\s+/).length, 0) / (clauses.length || 1);
  if (meta.length >= 50 && avg > 3) return meta;
  return plain(hi ? post.hindi.excerpt || post.hindi.content : post.excerpt || post.english.content).slice(0, 160);
}

/**
 * THE canonical address of an article: /blog/<slug>, and /hi/blog/<slug> for
 * the Hindi version (added 2026-11-16). nginx maps those paths to this file's
 * article-page route with route=clean. The older blog-post.html?slug= and ?id=
 * forms still resolve and 301 here, so no existing link breaks — that is what
 * the redirect in register() is for.
 *
 * A post with no slug has no clean address and keeps ?id=. Every published
 * post has one today; the fallback is for a row saved from the admin without.
 */
function articleUrl(post, base, hi = false) {
  if (post.slug) return `${base}/${hi ? 'hi/' : ''}blog/${encodeURIComponent(post.slug)}`;
  return `${base}/${hi ? 'hi/' : ''}blog-post.html?id=${encodeURIComponent(post._id)}`;
}

/**
 * The visible provenance line. The author is the ORGANISATION, which is what the
 * Article schema already claims and what Google accepts; it deliberately does not
 * say "editorial team" or name a reviewer, because nobody reviews these before
 * they publish and a byline implying otherwise is the kind of credibility claim
 * the SEO audit asked us to stop making, not to make more of.
 */
function fmtDate(value, hi) {
  try {
    return new Date(value).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
  } catch (_) {
    return '';
  }
}

function renderArticle(shell, post, { base = SITE_BASE, hi = false, status = 200 } = {}) {
  base = base.replace(/\/$/, '');
  const translated = !!(post?.hindi.title && post?.hindi.content);
  const title = post ? (hi ? post.hindi.title : post.english.title) : status === 503 ? 'Article temporarily unavailable' : 'Article not found';
  const desc = post ? description(post, hi) : title;
  const url = post ? articleUrl(post, base, hi) : null;
  const image = post?.thumbnail || `${base}/assets/og-default.jpg`;
  const tags = [
    `<meta name="description" content="${escape(desc)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(desc)}">`,
    `<meta property="og:image" content="${escape(image)}">`,
    `<meta property="og:locale" content="${hi ? 'hi_IN' : 'en_IN'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escape(title)}">`,
    `<meta name="twitter:description" content="${escape(desc)}">`,
    `<meta name="twitter:image" content="${escape(image)}">`,
  ];
  if (url) {
    tags.push(`<link rel="canonical" href="${escape(url)}">`, `<meta property="og:url" content="${escape(url)}">`);
    if (translated) for (const [lang, hindi] of [['en-IN', false], ['hi-IN', true], ['x-default', false]]) {
      tags.push(`<link rel="alternate" hreflang="${lang}" href="${escape(articleUrl(post, base, hindi))}">`);
    }
    const schema = { '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`,
      headline: title, description: desc, image: [image], mainEntityOfPage: url,
      inLanguage: hi ? 'hi-IN' : 'en-IN', datePublished: post.createdAt, dateModified: post.updatedAt || post.createdAt,
      author: { '@type': 'Organization', name: 'Astrowani', url: `${base}/` },
      publisher: { '@type': 'Organization', name: 'Astrowani', url: `${base}/`, logo: { '@type': 'ImageObject', url: `${base}/assets/logo.png` } } };
    const faq = hi ? post.faqHindi : post.faqEnglish;
    const graph = { '@context': 'https://schema.org', '@graph': [schema, ...(faq ? [faq] : [])] };
    tags.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`);
  } else if (status === 404) tags.push('<meta name="robots" content="noindex, follow">');

  // <base> FIRST in <head>: the shell is blog-post.html, whose stylesheets,
  // scripts and links are all relative to the site root (or to /hi/). Served at
  // /blog/<slug> they would resolve one folder too deep and the page would load
  // unstyled. The base points them back where they were written for — which is
  // also what script.js's /hi/ path fixing (`../assets/...`) assumes.
  const baseTag = `<base href="${escape(`${base}/${hi ? 'hi/' : ''}`)}">`;
  // Remove all conflicting template metadata, including legacy duplicates outside SEO:START.
  let html = shell.replace(/<head>([\s\S]*?)<\/head>/i, (_, head) => `<head>\n${baseTag}${head
    .replace(/<base\b[^>]*>\s*/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, () => `<title>${escape(title)} — Astrowani Blog</title>`)
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*/gi, '')
    .replace(/<link\b[^>]*(?:rel="canonical"|hreflang="[^"]+")[^>]*>\s*/gi, '')
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi, '')}
${tags.join('\n')}</head>`);
  html = html.replace(/<html\b[^>]*>/i, `<html lang="${hi ? 'hi' : 'en'}" data-lang="${hi ? 'hi' : 'en'}">`);
  // Route language wins over a preference saved on another page.
  html = html.replace(/<script>if\('scrollRestoration'[\s\S]*?<\/script>/, '');
  const back = hi ? '../blog.html' : 'blog.html';
  const body = post
    ? `<a href="${back}" class="blog-back-link">${hi ? '← सभी लेख' : '← Back to all articles'}</a>
      ${post.thumbnail ? `<img class="blog-hero-image" src="${escape(image)}" alt="">` : ''}
      <div class="blog-meta">${escape(hi ? 'Astrowani' : 'By Astrowani')}<span class="dot-sep">·</span><time datetime="${escape(post.createdAt)}">${escape(fmtDate(post.createdAt, hi))}</time>${post.updatedAt && post.updatedAt !== post.createdAt ? `<span class="dot-sep">·</span>${escape(hi ? 'अद्यतन' : 'Updated')} <time datetime="${escape(post.updatedAt)}">${escape(fmtDate(post.updatedAt, hi))}</time>` : ''}</div>
      <h1 class="serif blog-article-title">${escape(title)}</h1>
      <div class="legal-content" style="max-width:none;padding:0">${(hi ? post.hindi.content : post.english.content)
        // With a <base> tag a bare "#section" link resolves against the base —
        // the site root — and would leave the article. Anchor it to this page.
        .replace(/href="#/g, () => `href="${escape(url)}#`)}</div>
      <div id="blog-related-root" data-post-id="${escape(post._id)}"></div>`
    : `<h1>${escape(title)}</h1><p>${status === 503 ? 'Please try again shortly.' : 'This article may have been removed or the link is incorrect.'}</p><a href="${back}">Back to all articles</a>`;
  // <article> marks the primary content block for crawlers (SEO audit 2026-10-29 §5).
  // The match also accepts the older <div> shell so a backend deployed ahead of the
  // website still finds the slot.
  return html.replace(/<(div|article) id="blog-post-root"[^>]*>[\s\S]*?<\/\1>/, () => `<article id="blog-post-root" class="blog-article-wrap" data-server-rendered="true">${body}</article>`);
}

function register(app, db, { siteBase = SITE_BASE, websiteRoot = path.resolve(__dirname, '../../astrowani-website') } = {}) {
  app.get('/api/blogs/post', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const post = await findArticle(db, req.query);
      return post ? res.json({ data: post }) : res.status(404).json({ code: 'BLOG_NOT_FOUND', message: 'Article not found' });
    } catch (err) {
      console.error('[blog-public]', err.message);
      return res.status(503).json({ code: 'BLOG_UNAVAILABLE', message: 'Articles are temporarily unavailable' });
    }
  });
  app.get('/api/blogs/article-page', async (req, res) => {
    const hi = req.query.lang === 'hi';
    res.set('Cache-Control', 'no-cache, must-revalidate');
    let shell;
    try {
      shell = fs.readFileSync(path.join(websiteRoot, hi ? 'hi/blog-post.html' : 'blog-post.html'), 'utf8');
      const post = await findArticle(db, req.query);
      if (post && hi && !(post.hindi.title && post.hindi.content)) return res.redirect(302, articleUrl(post, siteBase));
      // An article reached by anything other than its clean address — the old
      // blog-post.html?slug= / ?id= forms, or a clean path spelled differently
      // from the stored slug — is sent there PERMANENTLY, so links shared before
      // 2026-11-16 keep working and Google moves their ranking onto one URL.
      // nginx marks the clean path with route=clean; nothing else sets it.
      if (post && post.slug && (req.query.route !== 'clean' || req.query.slug !== post.slug)) {
        return res.redirect(301, articleUrl(post, siteBase, hi));
      }
      const status = post ? 200 : 404;
      return res.status(status).type('html').send(renderArticle(shell, post, { base: siteBase, hi, status }));
    } catch (err) {
      console.error('[blog-page]', err.message);
      res.set('Retry-After', '60');
      return res.status(503).type('html').send(shell ? renderArticle(shell, null, { base: siteBase, hi, status: 503 }) : '<h1>Article temporarily unavailable</h1>');
    }
  });
}

module.exports = { register, findArticle, mapBlog, renderArticle, cleanContent, identifier };
