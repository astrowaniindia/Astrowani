// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage image URL → resized/re-encoded render-endpoint URL.
//
// WHY THIS MODULE EXISTS (2026-10-19): the Supabase organisation was hard-blocked
// for blowing its free-tier CACHED EGRESS quota — 6.25 GB against a 5.5 GB cap,
// with every API request dropped until the cycle refilled. Measured over the 24 h
// before the block:
//
//   /storage/v1/object/public/...  4,965 requests  651 MB  (134 KB per image)
//   /storage/v1/render/image/...   8,449 requests   83 MB  ( 10 KB per image)
//
// i.e. the render endpoint was already serving 70% MORE images for an EIGHTH of
// the bandwidth. The cheap half was astrologer profile photos, the only surface
// `thumbnailUrl` in index.js had ever been wired to (added 2026-09-09). The
// expensive half was every surface nobody extended it to: service cards, banners,
// reviewer avatars and blog thumbnails, served as full-resolution originals.
//
// Three admin-uploaded files alone accounted for 403 MB/day — 55% of ALL egress:
//   astro_services.image       1.23 MB  × 139 requests (124 distinct IPs) = 171 MB
//   customers.profile_image    1.05 MB  × 147 requests (130 distinct IPs) = 154 MB
//   astro_services.image       608 KB   × 132 requests (120 distinct IPs) =  78 MB
//
// The unique-IP counts are the point: those are shared screens, so one oversized
// upload is re-downloaded by every user who opens the app. At ~130 app opens a day
// that was 735 MB/day — ~22 GB/month against a 5.5 GB allowance, on a tiny user
// base. See CLAUDE.md "Session 2026-10-19".
//
// This module is the single definition of that rewrite so the next surface that
// needs it does not get a fourth private copy. `index.js`'s `thumbnailUrl` is now
// a thin alias over `avatarUrl` and keeps its exact previous behaviour.
// ─────────────────────────────────────────────────────────────────────────────

const OBJECT_PREFIX = '/storage/v1/object/public/';
const RENDER_PREFIX = '/storage/v1/render/image/public/';

/**
 * Widths, by the surface the image is rendered on — not by the image's own size.
 *
 * Deliberately a small fixed set rather than a per-caller number: the render
 * endpoint caches per distinct URL, so every extra width is another cache miss
 * paid for at full origin cost. Four sizes keep the cache hot.
 */
const WIDTH = {
  // Unchanged from the 2026-09-09 measurement: covers an ~85px list avatar at 3x
  // density AND the profile header, so one size serves every astrologer surface.
  AVATAR: 300,
  // Reviewer/customer avatars in lists, which never render larger than ~40px.
  AVATAR_SMALL: 120,
  // Category tiles and remedy-category cards. Kept deliberately small: these are
  // the one surface where some live rows are ALREADY tiny (a few category icons
  // are under 10 KB) and it could not be re-measured whether the render endpoint
  // enlarges a source smaller than the box, because storage was egress-blocked
  // when this was written. At 240 the answer stops mattering — an upscale of a
  // 100px icon is bounded and cheap — while the 105 KB and 110 KB rows that were
  // costing 24 MB/day still collapse.
  ICON: 240,
  // Service cards, blog thumbnails — a half-to-full-width card on a phone.
  CARD: 600,
  // Full-bleed banner artwork, the only surface that genuinely needs the width.
  BANNER: 1080,
};

/**
 * Rewrite a Supabase public-object URL to its transformed variant.
 *
 * Returns the input UNTOUCHED for anything that is not a Supabase public-object
 * URL — notably the bundled backend.astrowani.com fallback avatars (already
 * small) and the absolute URLs the blog agent writes. A caller can therefore
 * pass any value without first checking what it is.
 */
function transformedUrl(url, width, height = width) {
  if (typeof url !== 'string' || !url.includes(OBJECT_PREFIX)) return url;
  // The render endpoint rejects a URL that already carries a query string of its
  // own, so only rewrite clean object URLs.
  if (url.includes('?')) return url;
  // BOTH dimensions plus resize=contain are REQUIRED. `width=` alone does NOT
  // scale proportionally — it sets the width and LEAVES THE HEIGHT ALONE, so an
  // 800x800 photo came back 300x800 and every avatar rendered horizontally
  // squashed. Measured 2026-09-09 across four real profile photos: 800x800 ->
  // 300x800 (aspect 1.000 -> 0.375) and 500x500 -> 300x500.
  //
  // `contain` fits the image inside the box and preserves the aspect ratio, so a
  // square photo returns 300x300 and a portrait returns e.g. 200x300. It never
  // crops, which matters because the apps render these in circular frames that do
  // their own cropping — cropping twice would cut faces off. For a wide banner the
  // width binds and the square box is harmless (1200x400 -> 1080x360).
  return `${url.replace(OBJECT_PREFIX, RENDER_PREFIX)}?width=${width}&height=${height}&resize=contain&quality=70`;
}

const avatarUrl = (url) => transformedUrl(url, WIDTH.AVATAR);
const smallAvatarUrl = (url) => transformedUrl(url, WIDTH.AVATAR_SMALL);
const iconUrl = (url) => transformedUrl(url, WIDTH.ICON);
const cardUrl = (url) => transformedUrl(url, WIDTH.CARD);
const bannerUrl = (url) => transformedUrl(url, WIDTH.BANNER);

module.exports = {
  WIDTH,
  OBJECT_PREFIX,
  RENDER_PREFIX,
  transformedUrl,
  avatarUrl,
  smallAvatarUrl,
  iconUrl,
  cardUrl,
  bannerUrl,
};
