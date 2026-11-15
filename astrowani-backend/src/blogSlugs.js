/**
 * Slugs for blog posts saved from the ADMIN (the blog agent sets its own).
 *
 * Since 2026-11-16 an article's address is /blog/<slug> (src/blogPublic.js). A
 * post saved from the admin used to get no slug at all, so it had no clean
 * address and was left out of the sitemap. Now:
 *
 *  - CREATE: a typed slug is cleaned with the agent's own slugify(); with none,
 *    one is made from the English title. An AUTO slug that collides gets -2,
 *    -3…; a TYPED one that collides is refused (409) — silently renaming what
 *    the admin chose would be a surprise they only notice once it is shared.
 *  - UPDATE: a post with no slug yet gets one from its title on the next save,
 *    which is how older admin posts pick up a clean address.
 *  - A PUBLISHED post's slug CANNOT CHANGE (409 SLUG_LOCKED). Its address is
 *    already in Google, in shares and in other articles; there is no redirect
 *    table from an old slug to a new one, so a change would turn every one of
 *    those links into a 404. A draft's slug can change freely.
 *  - Clearing the field never removes a slug: an empty value means "keep it".
 *
 * Errors come back as { error: { status, code, message } } for the route to send.
 */
const { slugify, uniqueSlug } = require('./blogAgent/seo');

const VALID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX = 72; // slugify's own cap; keeps URLs readable

const refuse = (status, code, message) => ({ error: { status, code, message } });

/** Slugs already in use that start with `base`, excluding one row. */
async function takenLike(db, base, exceptId) {
  let q = db.from('blogs').select('id, slug, title_en, title').like('slug', `${base}%`).limit(200);
  if (exceptId) q = q.neq('id', exceptId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param db        service-role client
 * @param body      the picked request body (mutated copy is returned)
 * @param existing  the current row on update, or null on create
 */
async function prepareBlogSlug(db, body, existing = null) {
  const out = { ...body };
  const typed = typeof out.slug === 'string' ? out.slug.trim() : '';
  delete out.slug;

  // Updating a post that already has a slug.
  if (existing && existing.slug) {
    if (!typed || typed === existing.slug) return { body: out };
    if (existing.is_published) {
      return refuse(409, 'SLUG_LOCKED', 'This article is published, so its address cannot change — links to it would break. Unpublish it first, or keep the current address.');
    }
  }

  let slug;
  let auto = false;
  if (typed) {
    // slugify() falls back to "astrowani-article" for text with no usable
    // characters; for something the admin TYPED that would be a surprise.
    if (!/[a-z0-9]/i.test(typed)) return refuse(400, 'SLUG_INVALID', 'Use letters, numbers and hyphens only.');
    slug = slugify(typed, { maxLength: MAX });
    if (!VALID.test(slug)) return refuse(400, 'SLUG_INVALID', 'Use letters, numbers and hyphens only.');
  } else {
    const title = out.title_en || out.title || existing?.title_en || existing?.title || '';
    if (!String(title).trim()) return { body: out }; // nothing to build one from yet
    slug = slugify(title, { maxLength: MAX });
    auto = true;
  }

  const taken = await takenLike(db, slug, existing?.id);
  const clash = taken.find((r) => r.slug === slug);
  if (clash && !auto) {
    return refuse(409, 'SLUG_TAKEN', `That address is already used by "${clash.title_en || clash.title || 'another article'}".`);
  }
  out.slug = clash ? uniqueSlug(slug, new Set(taken.map((r) => r.slug))) : slug;
  return { body: out };
}

module.exports = { prepareBlogSlug, VALID };
