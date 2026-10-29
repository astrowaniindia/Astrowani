# Blog reliability, metadata, social tags and links — implementation

These changes are local and not deployed. They preserve the two existing Claude commits. The original audit remains a historical snapshot.

## Implemented

- Direct public article lookup by slug or legacy UUID, independent of the 50-post listing limit. Only published articles are returned.
- An HTML article endpoint supplies content, one description, a canonical, Open Graph/Twitter tags and Article data before JavaScript runs.
- Missing/unpublished articles receive HTTP 404 and noindex; database failures receive 503/Retry-After, not a false permanent deletion.
- Article HTML is sanitized before server rendering. Embedded scripts and unsafe attributes are removed, while article links, images, tables and expandable FAQ content are supported. Existing FAQ schema is retained as parsed data.
- Article title, description and language-specific alternates use the selected English/Hindi article. A missing Hindi translation redirects to the English article.
- The static-page SEO generator removes legacy duplicate descriptions so future regeneration does not restore them.
- Static-preview article loading uses the direct endpoint and updates Twitter as well as Open Graph tags.
- Related-article loading is optional and cannot prevent the main article from appearing. Load-more failures now provide a visible retry.
- Existing Hindi HTML links fall back to real English pages where translations do not exist; the Hindi generator preserves that rule. Runtime navigation applies the same fallback.
- Panchang numerology/karana anchors now exist, and changing Today/Tomorrow updates the displayed day without a reload.
- Shared script and article script URLs are bumped to version 52 so browsers do not keep the old behavior. Unchanged dependencies retain version 51.

## Validation

Run `node astrowani-backend/scripts/testBlogPublic.js` from the repository root. It uses an isolated Express app and 65 fake articles. It never loads `.env`, the full backend, billing workers, or the production database.

Coverage: direct lookup beyond the first page; UUID compatibility; unknown/unpublished identifiers; raw HTML metadata; Hindi rendering; unsafe stored markup; temporary database failures; missing-translation fallback; and local Hindi destinations/description counts.

Also run `node astrowani-website/aw/apply-seo.js --check` and JavaScript syntax checks. Browser verification uses the same offline fixture server with `BLOG_TEST_SERVE=1`, port 4611.

## Deployment dependency — not performed

1. Deploy backend code/dependencies first. The existing app listing API is unchanged. New routes are `/api/blogs/post` and `/api/blogs/article-page`.
2. Deploy website files, including the existing local Hindi work and versioned script URLs.
3. Add the following exact locations to the existing HTTPS server serving the test site, then validate and reload Nginx through the normal server procedure. Do not overwrite its Certbot/TLS configuration.

```nginx
location = /test-site/blog-post.html {
    proxy_pass http://127.0.0.1:4500/api/blogs/article-page$is_args$args;
    proxy_set_header Host backend.astrowani.com;
}
location = /test-site/hi/blog-post.html {
    proxy_pass http://127.0.0.1:4500/api/blogs/article-page?lang=hi&$args;
    proxy_set_header Host backend.astrowani.com;
}
```

These locations are also recorded in `vps-deployment/nginx/astrowani-shop.conf`. The existing deployment deliberately does not overwrite an installed Nginx configuration. Therefore a normal code deployment alone does not activate server-rendered social previews or HTML 404 responses. Static fallback still requires the new backend direct-lookup endpoint.

The backend reads article shells from the sibling `astrowani-website` directory in the repository checkout. Keep that directory available, or supply an explicit `websiteRoot` when mounting the route module. The existing monorepo deployment keeps it available.

At the later astrowani.com launch, set `BLOG_SITE_BASE_URL=https://astrowani.com`, update the static SEO base as planned, and use `/blog-post.html` and `/hi/blog-post.html` as the Nginx location paths. This work does not prematurely change the domain.

## Remaining audit work outside this batch

Full Hindi translation, blog archive server rendering/pagination, broader landing-page content, mobile overflow/performance work, analytics and the full domain migration remain separate tasks. Existing stored staging links in article content still need the planned production migration. No ranking or performance score is claimed by these changes.
