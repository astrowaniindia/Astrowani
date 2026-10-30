import { api } from './api.js?v=58';
import { track } from './analytics.js?v=58';

/**
 * The blog section.
 *
 * `GET /api/blogs` is the exact endpoint the customer app's BlogList screen
 * uses (CLAUDE.md), backed by the `blogs` Supabase table. Each row already
 * carries BOTH languages (`english.{title,content}` / `hindi.{title,content,
 * excerpt,metaDescription}`), so there is no second endpoint to call for a
 * language switch — both variants are rendered into the DOM as siblings and
 * style.css's `.lang-en`/`.lang-hi` rule (keyed off the same
 * `document.documentElement[data-lang]` the nav's EN/HI button already
 * flips) decides which one shows. No re-render needed when the user toggles
 * language.
 *
 * Direct article lookup is independent of archive pagination. Production
 * article HTML is rendered by the backend; this also supports static previews.
 */

const PAGE_SIZE = 50;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function plainText(html, max) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function readMinutes(html) {
  const words = plainText(html).split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 200));
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

/** Normalise one backend row into everything the templates below need. */
function mapPost(row) {
  const titleEn = row.english?.title || row.title || 'Untitled';
  const titleHi = row.hindi?.title || titleEn;
  const contentEn = row.english?.content || '';
  const contentHi = row.hindi?.content || contentEn;
  // Always run the excerpt through plainText, even when the admin field is
  // already filled in — some rows have the WHOLE article pasted into
  // `excerpt` rather than a short teaser, and a card rendering that in full
  // looked like a layout bug rather than what it actually is (an admin data
  // issue this code must not trust blindly).
  const excerptEn = plainText(row.excerpt || contentEn, 160);
  // excerpt_hi is blank on every live row today (CLAUDE.md: the migration adding
  // it was never applied) — fall back to the Hindi body's own text rather than
  // showing an English excerpt under a Hindi title.
  const excerptHi = plainText(row.hindi?.excerpt || contentHi, 160) || excerptEn;

  return {
    id: row._id,
    // Null on every post written before 2026-10-13. `href()` below falls back to
    // ?id=, so the original five keep resolving.
    slug: row.slug || '',
    metaDescription: row.metaDescription || '',
    metaDescriptionHi: row.hindi?.metaDescription || '',
    titleEn, titleHi,
    contentEn, contentHi,
    excerptEn, excerptHi,
    thumbnail: row.thumbnail || '',
    category: row.category?.name || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || '',
    dateLabel: formatDate(row.createdAt),
    updatedLabel: row.updatedAt && row.updatedAt !== row.createdAt ? formatDate(row.updatedAt) : '',
    readMinutes: readMinutes(contentEn || contentHi),
  };
}

async function fetchPage(page) {
  const res = await api.get(`/api/blogs?limit=${PAGE_SIZE}&page=${page}`, { auth: false });
  const rows = Array.isArray(res?.data) ? res.data : [];
  return { posts: rows.map(mapPost), totalPages: Math.max(1, Number(res?.totalPages) || 1) };
}

/**
 * The article URL. Prefers the SEO slug and falls back to the UUID.
 *
 * A slug is the cheapest on-page SEO available here: ?id=dcf997a3-9f48-... says
 * nothing to a reader or a crawler, while ?slug=mangal-dosh-in-the-kundali says
 * what the page is about before it is even opened. Both forms are served
 * forever, so no existing link anywhere can break.
 */
function href(post) {
  return post.slug
    ? `blog-post.html?slug=${encodeURIComponent(post.slug)}`
    : `blog-post.html?id=${encodeURIComponent(post.id)}`;
}

function cardMedia(post) {
  return post.thumbnail
    ? `<img class="blog-card-img" src="${esc(post.thumbnail)}" alt="" loading="lazy">`
    : `<div class="blog-card-img"></div>`;
}

function featuredTemplate(post) {
  const media = post.thumbnail
    ? `style="background-image:url('${esc(post.thumbnail)}')"`
    : '';
  return `
    <a href="${href(post)}" class="blog-featured">
      <div class="blog-featured-media" ${media}></div>
      <div class="blog-featured-body">
        ${post.category ? `<span class="blog-badge">${esc(post.category)}</span>` : ''}
        <div class="blog-meta">${esc(post.dateLabel)}<span class="dot-sep">·</span>${post.readMinutes} min read</div>
        <h2 class="serif blog-featured-title lang-en">${esc(post.titleEn)}</h2>
        <h2 class="serif blog-featured-title lang-hi">${esc(post.titleHi)}</h2>
        <p class="blog-excerpt lang-en">${esc(post.excerptEn)}</p>
        <p class="blog-excerpt lang-hi">${esc(post.excerptHi)}</p>
        <span class="blog-read-link i18n-t" data-i18n-en="Read full article →">Read full article →</span>
      </div>
    </a>`;
}

function cardTemplate(post) {
  return `
    <a href="${href(post)}" class="blog-card">
      ${cardMedia(post)}
      <div class="blog-card-body">
        ${post.category ? `<span class="blog-badge">${esc(post.category)}</span>` : ''}
        <div class="blog-meta">${esc(post.dateLabel)}<span class="dot-sep">·</span>${post.readMinutes} min read</div>
        <h3 class="blog-card-title lang-en">${esc(post.titleEn)}</h3>
        <h3 class="blog-card-title lang-hi">${esc(post.titleHi)}</h3>
        <p class="blog-excerpt lang-en">${esc(post.excerptEn)}</p>
        <p class="blog-excerpt lang-hi">${esc(post.excerptHi)}</p>
        <span class="blog-read-link i18n-t" data-i18n-en="Read article →">Read article →</span>
      </div>
    </a>`;
}

function skeletonCards(n) {
  return Array.from({ length: n }, () => `
    <div class="blog-skeleton">
      <div class="blog-skeleton-img"></div>
      <div class="blog-skeleton-body">
        <div class="blog-skeleton-line w-60"></div>
        <div class="blog-skeleton-line w-80"></div>
        <div class="blog-skeleton-line w-80"></div>
      </div>
    </div>`).join('');
}

/** ===================== Listing page (blog.html) ===================== */

async function initBlogList() {
  const grid = document.getElementById('blog-grid');
  if (!grid || grid.dataset.serverRendered === 'true') return;
  grid.innerHTML = `<div class="blog-grid">${skeletonCards(6)}</div>`;
  try {
    const data = await api.get(`/api/blogs/archive${location.search}`, {auth:false});
    grid.innerHTML = data.grid;
    document.getElementById('blog-filter-bar').innerHTML = data.filters;
    document.getElementById('blog-load-more-wrap').innerHTML = data.pagination;
    document.title = data.title;
    document.querySelector('h1').textContent = data.title.replace(' | Astrowani Blog', '');
    for (const prefix of ['og', 'twitter']) {
      const attr = prefix === 'og' ? 'property' : 'name';
      for (const key of ['title', 'description']) setMeta(`meta[${attr}="${prefix}:${key}"]`, {[attr]:`${prefix}:${key}`,content:data[key]});
    }
    setMeta('meta[property="og:url"]', {property:'og:url',content:new URL(data.path,location.href).href});
    setMeta('meta[name="description"]', {name:'description',content:data.description});
    setMeta('link[rel="canonical"]', {rel:'canonical',href:new URL(data.path,location.href).href});
  } catch (err) {
    if (err.status === 404 && err.code === 'ARCHIVE_NOT_FOUND') {
      setMeta('meta[name="robots"]', {name:'robots',content:'noindex, follow'});
      grid.innerHTML = '<p>Archive not found.</p><a href="blog.html">All articles</a>';
    } else {
      grid.innerHTML = '<p>Articles are temporarily unavailable.</p><button id="blog-retry-btn">Try again</button>';
      document.getElementById('blog-retry-btn').addEventListener('click',initBlogList);
    }
  }
}

/** ===================== Article page (blog-post.html) ===================== */

function relatedTemplate(post) {
  return cardTemplate(post);
}

function articleTemplate(post, all) {
  const related = all.filter((p) => p.id !== post.id).slice(0, 3);
  return `
    <a href="${document.documentElement.lang === 'hi' ? '../blog.html' : 'blog.html'}" class="blog-back-link">← Back to all articles</a>
    ${post.thumbnail ? `<img class="blog-hero-image" src="${esc(post.thumbnail)}" alt="">` : ''}
    ${post.category ? `<span class="blog-badge">${esc(post.category)}</span>` : ''}
    <!-- The author is the ORGANISATION, matching what the Article schema claims.
         It deliberately does not name a reviewer: nobody reviews these before they
         publish, and implying otherwise is the credibility claim the audit asked us
         to stop making. -->
    <div class="blog-meta">By Astrowani<span class="dot-sep">·</span>${esc(post.dateLabel)}${post.updatedLabel ? `<span class="dot-sep">·</span>Updated ${esc(post.updatedLabel)}` : ''}<span class="dot-sep">·</span>${post.readMinutes} min read</div>
    <h1 class="serif blog-article-title lang-en">${esc(post.titleEn)}</h1>
    <h1 class="serif blog-article-title lang-hi">${esc(post.titleHi)}</h1>
    <div class="legal-content lang-en" style="max-width:none; padding:0;">${post.contentEn}</div>
    <div class="legal-content lang-hi" style="max-width:none; padding:0;">${post.contentHi}</div>
    ${related.length ? `
      <div style="margin-top:72px; padding-top:48px; border-top:1px solid var(--border-soft);">
        <div class="blog-related-title">More from the Astrowani blog</div>
        <div class="blog-grid">${related.map(relatedTemplate).join('')}</div>
      </div>` : ''}`;
}

/**
 * Pick the better meta description.
 *
 * `meta_description` is the right field and agent-written posts fill it with a
 * real sentence — but the five posts written before 2026-10-13 have a 2005-style
 * keyword list in it ("numerology, Palmistry, Astrology, Prediction, Solution,
 * Remedies"), which Google has ignored for twenty years and which reads badly as
 * a search snippet. Preferring that column unconditionally made those five posts
 * WORSE than the excerpt they used to show.
 *
 * A keyword list is distinguishable from a sentence by the shape of its
 * comma-separated fragments: a list's are one or two words each, a sentence's are
 * not. ("Fewer than N commas" does not work — a good sentence happily has three.)
 */
function bestDescription(post) {
  const meta = String(post.metaDescription || '').trim();
  if (meta) {
    const clauses = meta.split(',').map((c) => c.trim()).filter(Boolean);
    const avgWords = clauses.reduce((n, c) => n + c.split(/\s+/).length, 0) / (clauses.length || 1);
    if (avgWords > 3 && meta.length >= 50) return meta;
  }
  return post.excerptEn;
}

/**
 * Set (or create) a <head> tag. The article page is rendered client-side, so
 * every per-article meta tag has to be written here rather than being in the
 * HTML file — there is one blog-post.html serving every article.
 */
function setMeta(selector, attrs) {
  const matches = [...document.head.querySelectorAll(selector)];
  let el = matches.shift();
  matches.forEach((duplicate) => duplicate.remove());
  if (!el) {
    el = document.createElement(attrs.rel ? 'link' : 'meta');
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function initBlogPost() {
  const root = document.getElementById('blog-post-root');
  if (!root) return;
  if (root.dataset.serverRendered === 'true') {
    const related = document.getElementById('blog-related-root');
    // style.css reserves this block's height so the page does not jump when the
    // recommendations land — see #blog-related-root there. Releasing the reserve
    // once the attempt is over is what stops an over-reservation turning into a
    // lasting gap: by then either the real cards are taller than it, or there are
    // none and the space should collapse.
    const release = () => { try { related.style.minHeight = '0px'; } catch (_) {} };
    if (related) fetchPage(1).then(({ posts }) => {
      const others = posts.filter(p => p.id !== related.dataset.postId).slice(0, 3);
      if (others.length) related.innerHTML = `<h2 class="blog-related-title">${document.documentElement.lang === 'hi' ? 'और लेख' : 'More from the Astrowani blog'}</h2><div class="blog-grid">${others.map(relatedTemplate).join('')}</div>`;
      release();
    }).catch(release); // Recommendations must never hide a successfully loaded article.
    return;
  }

  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const id = params.get('id');
  const hi = document.documentElement.lang === 'hi';
  document.documentElement.setAttribute('data-lang', hi ? 'hi' : 'en');
  root.innerHTML = `
    <div class="blog-skeleton-line w-60" style="height:16px; max-width:200px;"></div>
    <div class="blog-skeleton-img" style="height:360px; border-radius:24px; margin:20px 0 32px;"></div>
    <div class="blog-skeleton-line w-80" style="height:32px;"></div>
    <div class="blog-skeleton-line w-80"></div>
    <div class="blog-skeleton-line w-60"></div>`;

  if (!slug && !id) {
    setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, follow' });
    root.innerHTML = `<div class="blog-error"><div class="blog-error-icon">🔍</div><div>No article was specified.</div><a href="blog.html" class="blog-back-link" style="margin-top:14px;">← Back to all articles</a></div>`;
    return;
  }

  (async () => {
    try {
      const key = slug ? `slug=${encodeURIComponent(slug)}` : `id=${encodeURIComponent(id)}`;
      const result = await api.get(`/api/blogs/post?${key}`, { auth: false });
      if (!result?.data) throw new Error('Invalid article response');
      if (hi && !(result.data.hindi?.title && result.data.hindi?.content)) {
        location.replace(`../blog-post.html?${key}`);
        return;
      }
      const post = mapPost(result.data);
      // After the fetch succeeded, so a 404 or a Hindi redirect is never counted
      // as an article read. The slug is what makes this useful: it is the only
      // place the blog agent's output can be ranked by what people actually open.
      track('blog_opened', { slug: post.slug || '', article_language: hi ? 'hi' : 'en' });
      const posts = [];
      const title = hi ? post.titleHi : post.titleEn;
      document.title = `${title} — Astrowani Blog`;
      const description = hi ? (post.metaDescriptionHi || post.excerptHi) : bestDescription(post);
      setMeta('meta[name="description"]', { name: 'description', content: description });

      // A CANONICAL URL matters more here than it looks. The same article is
      // reachable at ?slug=… and ?id=…, and a crawler that finds both treats them
      // as two pages with identical content — which splits whatever ranking the
      // article earns between them. The canonical names one winner.
      const canonical = post.slug
        ? `${location.origin}${location.pathname}?slug=${encodeURIComponent(post.slug)}`
        : `${location.origin}${location.pathname}?id=${encodeURIComponent(post.id)}`;
      setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });

      // Open Graph / Twitter, so a shared link shows the article's own title and
      // photograph instead of the generic site card.
      setMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' });
      setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
      setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
      setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
      const image = post.thumbnail || new URL(`${hi ? '../' : ''}assets/og-default.jpg`, location.href).href;
      setMeta('meta[property="og:image"]', { property: 'og:image', content: image });
      setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
      setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
      setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
      setMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });
      document.querySelectorAll('meta[property="og:image:width"],meta[property="og:image:height"]').forEach((el) => el.remove());
      document.querySelectorAll('link[hreflang]').forEach((el) => {
        if (!(result.data.hindi?.title && result.data.hindi?.content)) { el.remove(); return; }
        const alternate = new URL(el.href);
        alternate.search = new URL(canonical).search;
        el.href = alternate.href;
      });

      let structured = document.getElementById('blog-article-schema');
      if (!structured) {
        structured = document.createElement('script');
        structured.id = 'blog-article-schema';
        structured.type = 'application/ld+json';
        document.head.appendChild(structured);
      }
      const faq = hi ? result.data.faqHindi : result.data.faqEnglish;
      structured.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{
        '@type': 'Article', headline: title, description, image: [image], mainEntityOfPage: canonical,
        datePublished: result.data.createdAt, dateModified: result.data.updatedAt || result.data.createdAt,
        inLanguage: hi ? 'hi-IN' : 'en-IN', author: { '@type': 'Organization', name: 'Astrowani' },
      }, ...(faq ? [faq] : [])] });

      root.innerHTML = articleTemplate(post, posts);
      // Related articles are optional and independent of the direct lookup.
      fetchPage(1).then(({ posts: recent }) => {
        root.innerHTML = articleTemplate(post, recent);
      }).catch(() => {});
    } catch (err) {
      if (err.status === 404 && err.code === 'BLOG_NOT_FOUND') {
        document.title = 'Article not found — Astrowani';
        setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, follow' });
        root.innerHTML = `<h1>Article not found</h1><p>This article may have been removed.</p><a href="${hi ? '../blog.html' : 'blog.html'}">Back to all articles</a>`;
        return;
      }
      root.innerHTML = `<div class="blog-error"><div class="blog-error-icon">⚠️</div><div>Could not load this article right now.</div><button type="button" id="blog-post-retry-btn">Try again</button></div>`;
      const retry = document.getElementById('blog-post-retry-btn');
      if (retry) retry.addEventListener('click', initBlogPost);
      console.warn('[aw/blog] article load failed:', err.message);
    }
  })();
}

initBlogList();
initBlogPost();
