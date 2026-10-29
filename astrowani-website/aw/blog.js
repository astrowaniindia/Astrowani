import { api } from './api.js?v=48';

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
 * There is no single-post endpoint on the backend, so the article page asks
 * for the same list and finds its id client-side — fine at today's post
 * count, and it means this file has exactly one fetch function to keep
 * correct.
 */

const PAGE_SIZE = 50; // the backend's own cap (Math.min(50, ...)) — one request covers every post that exists today

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
    titleEn, titleHi,
    contentEn, contentHi,
    excerptEn, excerptHi,
    thumbnail: row.thumbnail || '',
    category: row.category?.name || '',
    createdAt: row.createdAt,
    dateLabel: formatDate(row.createdAt),
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
    <a href="${href(post)}" class="blog-featured reveal reveal-wipe">
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
    <a href="${href(post)}" class="blog-card reveal reveal-wipe">
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

function initBlogList() {
  const grid = document.getElementById('blog-grid');
  const filterBar = document.getElementById('blog-filter-bar');
  const loadMoreWrap = document.getElementById('blog-load-more-wrap');
  if (!grid) return;

  const state = { all: [], page: 1, totalPages: 1, category: 'all', loading: false };

  grid.innerHTML = `<div class="blog-grid">${skeletonCards(6)}</div>`;

  function renderCategoryPills() {
    if (!filterBar) return;
    const cats = Array.from(new Set(state.all.map((p) => p.category).filter(Boolean)));
    if (!cats.length) { filterBar.innerHTML = ''; return; }
    filterBar.innerHTML = [
      `<button type="button" class="blog-pill${state.category === 'all' ? ' active' : ''}" data-cat="all">All</button>`,
      ...cats.map((c) => `<button type="button" class="blog-pill${state.category === c ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`),
    ].join('');
    filterBar.querySelectorAll('.blog-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.category = btn.getAttribute('data-cat');
        renderCategoryPills();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const filtered = state.category === 'all' ? state.all : state.all.filter((p) => p.category === state.category);
    if (!filtered.length) {
      grid.innerHTML = `<div class="blog-empty"><div class="blog-empty-icon">📝</div><div>No articles in this category yet.</div></div>`;
    } else {
      const showFeatured = state.category === 'all';
      const featured = showFeatured ? filtered[0] : null;
      const rest = showFeatured ? filtered.slice(1) : filtered;
      grid.innerHTML = `
        ${featured ? featuredTemplate(featured) : ''}
        <div class="blog-grid">${rest.map(cardTemplate).join('')}</div>`;
    }
    if (loadMoreWrap) {
      loadMoreWrap.innerHTML = (state.category === 'all' && state.page < state.totalPages)
        ? `<button type="button" class="blog-load-more" id="blog-load-more-btn">Load more articles</button>`
        : '';
      const btn = document.getElementById('blog-load-more-btn');
      if (btn) btn.addEventListener('click', loadMore);
    }
  }

  async function loadMore() {
    if (state.loading || state.page >= state.totalPages) return;
    state.loading = true;
    try {
      const { posts, totalPages } = await fetchPage(state.page + 1);
      state.all = state.all.concat(posts);
      state.page += 1;
      state.totalPages = totalPages;
      renderGrid();
    } catch (err) {
      console.warn('[aw/blog] load more failed:', err.message);
    } finally {
      state.loading = false;
    }
  }

  (async () => {
    try {
      const { posts, totalPages } = await fetchPage(1);
      state.all = posts;
      state.totalPages = totalPages;
      renderCategoryPills();
      renderGrid();
    } catch (err) {
      grid.innerHTML = `<div class="blog-error"><div class="blog-error-icon">⚠️</div><div>Could not load articles right now.</div><button type="button" id="blog-retry-btn">Try again</button></div>`;
      const retry = document.getElementById('blog-retry-btn');
      if (retry) retry.addEventListener('click', () => { grid.innerHTML = `<div class="blog-grid">${skeletonCards(6)}</div>`; initBlogList(); });
      console.warn('[aw/blog] initial load failed:', err.message);
    }
  })();
}

/** ===================== Article page (blog-post.html) ===================== */

function relatedTemplate(post) {
  return cardTemplate(post);
}

function articleTemplate(post, all) {
  const related = all.filter((p) => p.id !== post.id).slice(0, 3);
  return `
    <a href="blog.html" class="blog-back-link">← Back to all articles</a>
    ${post.thumbnail ? `<img class="blog-hero-image" src="${esc(post.thumbnail)}" alt="">` : ''}
    ${post.category ? `<span class="blog-badge">${esc(post.category)}</span>` : ''}
    <div class="blog-meta">${esc(post.dateLabel)}<span class="dot-sep">·</span>${post.readMinutes} min read</div>
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
  let el = document.head.querySelector(selector);
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

  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const id = params.get('id');
  root.innerHTML = `
    <div class="blog-skeleton-line w-60" style="height:16px; max-width:200px;"></div>
    <div class="blog-skeleton-img" style="height:360px; border-radius:24px; margin:20px 0 32px;"></div>
    <div class="blog-skeleton-line w-80" style="height:32px;"></div>
    <div class="blog-skeleton-line w-80"></div>
    <div class="blog-skeleton-line w-60"></div>`;

  if (!slug && !id) {
    root.innerHTML = `<div class="blog-error"><div class="blog-error-icon">🔍</div><div>No article was specified.</div><a href="blog.html" class="blog-back-link" style="margin-top:14px;">← Back to all articles</a></div>`;
    return;
  }

  (async () => {
    try {
      const { posts } = await fetchPage(1);
      // Slug first, id second. Both are accepted for the life of the site: the
      // posts written before slugs existed have none, and any link already shared
      // uses ?id=.
      const post = slug
        ? posts.find((p) => p.slug === slug)
        : posts.find((p) => String(p.id) === String(id));
      if (!post) {
        root.innerHTML = `<div class="blog-error"><div class="blog-error-icon">🔍</div><div>This article could not be found — it may have been unpublished.</div><a href="blog.html" class="blog-back-link" style="margin-top:14px;">← Back to all articles</a></div>`;
        return;
      }
      document.title = `${post.titleEn} — Astrowani Blog`;
      const description = bestDescription(post);
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
      setMeta('meta[property="og:title"]', { property: 'og:title', content: post.titleEn });
      setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
      setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
      if (post.thumbnail) {
        setMeta('meta[property="og:image"]', { property: 'og:image', content: post.thumbnail });
        setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
      }

      root.innerHTML = articleTemplate(post, posts);
    } catch (err) {
      root.innerHTML = `<div class="blog-error"><div class="blog-error-icon">⚠️</div><div>Could not load this article right now.</div><button type="button" id="blog-post-retry-btn">Try again</button></div>`;
      const retry = document.getElementById('blog-post-retry-btn');
      if (retry) retry.addEventListener('click', initBlogPost);
      console.warn('[aw/blog] article load failed:', err.message);
    }
  })();
}

initBlogList();
initBlogPost();
