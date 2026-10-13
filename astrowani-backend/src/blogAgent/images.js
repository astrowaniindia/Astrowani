// ─────────────────────────────────────────────────────────────────────────────
// Finding and storing the article's photograph.
//
// PROVIDERS, in order, all free:
//   1. Pexels    — PEXELS_API_KEY.   Free forever, 200 req/hour, commercial use,
//                  NO attribution required. The best fit and so the default.
//   2. Pixabay   — PIXABAY_API_KEY.  Same terms, different library.
//   3. Unsplash  — UNSPLASH_ACCESS_KEY. 50 req/hour on a demo app. Last of the
//                  three because its licence ASKS for attribution; we add a
//                  credit line when it is used so that obligation is met.
//   4. A locally generated branded image. No key, no network, no licence.
//
// WHY NOT WIKIMEDIA / OPENVERSE, which need no key at all: almost everything in
// them is CC-BY or CC-BY-SA, which requires naming the photographer and the
// licence next to the image. That is a per-image obligation an unattended
// pipeline publishing 1,000 images a year will eventually get wrong, and getting
// it wrong is a copyright complaint rather than a bad ranking. A plain gradient
// we drew ourselves is a better fallback than a licence we might breach.
//
// A missing image is NOT a reason to skip an article: blog.html renders an empty
// `.blog-card-img` div, which looks like a broken card in a grid of photographs.
// Hence provider 4, which cannot fail.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');

const BUCKET = 'app-images';
const FOLDER = 'blogs';

// 1200x675 is 16:9, matches the `.blog-featured-media` and `.blog-card-img`
// aspect the website already uses, and is the minimum width Google wants for an
// Article image to be eligible for a large thumbnail in results.
const OUT_WIDTH = 1200;
const OUT_HEIGHT = 675;
const FETCH_TIMEOUT_MS = 20000;
// A stock photo over this size is a sign we asked for the original rather than a
// web-sized rendition; refuse it instead of pulling 20 MB on a VPS link.
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;

const FONT_FILE = path.join(__dirname, '..', '..', 'assets', 'fonts', 'Poppins-Bold.ttf');

/**
 * Pexels. `orientation=landscape` matters: a portrait photo cropped to 16:9
 * loses its subject, and the crop is automatic.
 */
async function fromPexels(query, offset) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const { data } = await axios.get('https://api.pexels.com/v1/search', {
    params: { query, per_page: 15, orientation: 'landscape', size: 'large' },
    headers: { Authorization: key },
    timeout: FETCH_TIMEOUT_MS,
  });
  const photos = (data?.photos || []).filter((p) => p?.src?.large2x || p?.src?.large);
  if (!photos.length) return null;
  const pick = photos[offset % photos.length];
  return {
    url: pick.src.large2x || pick.src.large,
    ref: `pexels:${pick.id}`,
    credit: null, // licence does not require it
    provider: 'pexels',
  };
}

async function fromPixabay(query, offset) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const { data } = await axios.get('https://pixabay.com/api/', {
    params: {
      key, q: query, image_type: 'photo', orientation: 'horizontal',
      safesearch: 'true', per_page: 20, min_width: OUT_WIDTH,
    },
    timeout: FETCH_TIMEOUT_MS,
  });
  const hits = (data?.hits || []).filter((h) => h?.largeImageURL);
  if (!hits.length) return null;
  const pick = hits[offset % hits.length];
  return { url: pick.largeImageURL, ref: `pixabay:${pick.id}`, credit: null, provider: 'pixabay' };
}

async function fromUnsplash(query, offset) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const { data } = await axios.get('https://api.unsplash.com/search/photos', {
    params: { query, per_page: 15, orientation: 'landscape', content_filter: 'high' },
    headers: { Authorization: `Client-ID ${key}` },
    timeout: FETCH_TIMEOUT_MS,
  });
  const results = (data?.results || []).filter((r) => r?.urls?.regular);
  if (!results.length) return null;
  const pick = results[offset % results.length];
  return {
    url: pick.urls.regular,
    ref: `unsplash:${pick.id}`,
    // Unsplash's licence REQUIRES a credit naming the photographer and Unsplash,
    // both linked. Produced here and appended to the article by the caller.
    credit: {
      name: pick.user?.name || 'Unsplash',
      link: pick.user?.links?.html || 'https://unsplash.com',
      provider: 'Unsplash',
    },
    // Required by the Unsplash API terms — see triggerUnsplashDownload below.
    downloadLocation: pick.links?.download_location || null,
    provider: 'unsplash',
  };
}

/**
 * Tell Unsplash a photo was actually used.
 *
 * REQUIRED BY THEIR API TERMS, and it is not a formality: this endpoint is how a
 * photographer's download count is credited, which is most of what they get back
 * for giving the work away. Skipping it is both a terms violation and the kind of
 * free-riding that gets an API key revoked. It is the first item on Unsplash's own
 * production checklist after hotlinking.
 *
 * Fire-and-forget and never throws: the photo is already downloaded and the
 * article is already written by this point, so a failed ping must not cost the
 * article. It does not count against the hourly rate limit.
 */
async function triggerUnsplashDownload(downloadLocation, log = () => {}) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || !downloadLocation) return false;
  try {
    await axios.get(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}` },
      timeout: FETCH_TIMEOUT_MS,
    });
    return true;
  } catch (err) {
    log(`unsplash download ping failed (harmless): ${err.response?.status || err.message}`);
    return false;
  }
}

const PROVIDERS = [fromPexels, fromPixabay, fromUnsplash];

/**
 * The no-key fallback: a deep indigo-to-gold gradient with a few stars, matching
 * the site's palette, with the article title set on it when the deployed libvips
 * can render text.
 *
 * The text is attempted, not assumed. CLAUDE.md DX records the same problem in
 * chatImageComposer: sharp's prebuilt binary ships pango, but whether THIS
 * binary can rasterise text is a property of the deployment, not of the code —
 * so it is probed, and a failure degrades to the gradient alone rather than
 * throwing away the image.
 */
let textSupport = null;
async function canRenderText() {
  if (textSupport !== null) return textSupport;
  try {
    const probe = await sharp({
      text: { text: 'Aa', font: 'Poppins 24', fontfile: FONT_FILE, rgba: true, dpi: 72 },
    }).png().toBuffer();
    textSupport = probe.length > 0;
  } catch (_) {
    textSupport = false;
  }
  return textSupport;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function generatedImage(title, seedText) {
  // Hue varies with the topic so a run of fallback images is not nine identical
  // cards — deterministic from the title, so re-running a topic reproduces it.
  const seed = crypto.createHash('sha256').update(String(seedText || title || 'astrowani')).digest();
  const hue = seed[0] % 60; // 0-59: the warm indigo/plum/maroon end of the palette

  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (seed[(i * 3) % seed.length] / 255) * OUT_WIDTH;
    const y = (seed[(i * 3 + 1) % seed.length] / 255) * OUT_HEIGHT;
    const r = 0.6 + (seed[(i * 3 + 2) % seed.length] / 255) * 1.6;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.15 + (r / 6)).toFixed(2)}"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_WIDTH}" height="${OUT_HEIGHT}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${260 + hue}, 55%, 13%)"/>
        <stop offset="60%" stop-color="hsl(${280 + hue}, 45%, 20%)"/>
        <stop offset="100%" stop-color="hsl(${35 + (hue % 15)}, 60%, 32%)"/>
      </linearGradient>
    </defs>
    <rect width="${OUT_WIDTH}" height="${OUT_HEIGHT}" fill="url(#g)"/>
    ${stars}
    <circle cx="${OUT_WIDTH - 150}" cy="130" r="58" fill="#E8C27A" opacity="0.18"/>
  </svg>`;

  let base = await sharp(Buffer.from(svg)).png().toBuffer();

  if (await canRenderText()) {
    const MARGIN = 80;
    const TOP = 190;
    try {
      const words = String(title || 'Astrowani').split(/\s+/);
      // Wrap by hand rather than relying on pango's width handling, which clips
      // instead of wrapping in some builds.
      const lines = [];
      let line = '';
      for (const w of words) {
        if (`${line} ${w}`.trim().length > 26) { lines.push(line.trim()); line = w; } else { line += ` ${w}`; }
        if (lines.length === 3) break;
      }
      if (line.trim() && lines.length < 3) lines.push(line.trim());

      let text = await sharp({
        text: {
          text: `<span foreground="#FFF8EC">${esc(lines.join('\n'))}</span>`,
          font: 'Poppins 54', fontfile: FONT_FILE, rgba: true, dpi: 150,
          width: OUT_WIDTH - MARGIN * 2, align: 'left',
        },
      }).png().toBuffer();

      // THE TRAP THIS GUARDS AGAINST, found 2026-10-13 by the live suite: sharp
      // REFUSES a composite whose input is larger than the base ("Image to
      // composite must have same dimensions or smaller"), and a long title at
      // dpi 150 overflows 1200x675 easily. Worse, `.composite()` is LAZY — it
      // throws at .toBuffer(), so the error surfaced outside the try/catch meant
      // to contain it and took the whole article down with it. Same family as the
      // fixed-pipeline-order bug in chatImageComposer (CLAUDE.md DX).
      //
      // So: measure, shrink to fit, and materialise the buffer INSIDE the try.
      const tMeta = await sharp(text).metadata();
      const maxW = OUT_WIDTH - MARGIN * 2;
      const maxH = OUT_HEIGHT - TOP - 40;
      if (tMeta.width > maxW || tMeta.height > maxH) {
        text = await sharp(text)
          .resize(Math.min(tMeta.width, maxW), Math.min(tMeta.height, maxH), { fit: 'inside' })
          .png().toBuffer();
      }

      base = await sharp(base).composite([{ input: text, left: MARGIN, top: TOP }]).png().toBuffer();
    } catch (_) {
      // Gradient only — still a presentable card, and far better than no image.
    }
  }

  return {
    buffer: await sharp(base).jpeg({ quality: 86 }).toBuffer(),
    ref: 'generated',
    credit: null,
    provider: 'generated',
  };
}

/**
 * Download a remote image and normalise it.
 *
 * `.rotate()` with no argument applies the EXIF orientation and then the
 * metadata is dropped, so a phone-shot stock photo is not served sideways. The
 * cover crop is centred, which is why landscape-only results are requested
 * upstream.
 */
async function fetchAndNormalise(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: MAX_DOWNLOAD_BYTES,
    maxBodyLength: MAX_DOWNLOAD_BYTES,
    headers: { 'User-Agent': 'Astrowani-blog-agent/1.0 (+https://astrowani.com)' },
  });
  return sharp(Buffer.from(res.data))
    .rotate()
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
}

/**
 * Upload to the same public bucket and folder the admin dashboard already uses
 * for blog thumbnails, so an agent-written row is indistinguishable from a
 * hand-written one.
 *
 * NOTE this is deliberately NOT routed through POST /api/upload-image: that
 * endpoint requires a JWT and takes a base64 data-URI, which would mean minting a
 * token and inflating the image by a third to post it to our own server. The
 * agent runs on the VPS with the service-role key; it writes to storage directly,
 * exactly as index.js's voice-note path does.
 */
async function upload(db, buffer, { contentType = 'image/jpeg', ext = 'jpg' } = {}) {
  const name = `${FOLDER}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(name, buffer, { contentType, upsert: false });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data } = db.storage.from(BUCKET).getPublicUrl(name);
  if (!data?.publicUrl) throw new Error('storage upload returned no public url');
  return { url: data.publicUrl, objectName: name };
}

/**
 * The whole job: find a photo for `query`, normalise it, store it, return a
 * public URL.
 *
 * `avoidRefs` holds the provider refs used by recent articles, so the same
 * stock photograph does not head three posts in one week — the single most
 * obvious tell of an automated blog. `offset` walks further down the result list
 * when a ref is already taken, rather than failing.
 *
 * Every provider error is caught and the next is tried; the generated image
 * closes the chain, so this function does not have a failure mode that returns
 * nothing.
 */
async function acquire(db, { query, title, avoidRefs = [], log = () => {} }) {
  const avoid = new Set(avoidRefs);
  const q = String(query || title || 'indian astrology').trim();

  for (const provider of PROVIDERS) {
    for (let offset = 0; offset < 4; offset += 1) {
      let found;
      try {
        found = await provider(q, offset);
      } catch (err) {
        log(`image provider ${provider.name} failed: ${err.response?.status || ''} ${err.message}`);
        break; // this provider is unhappy; move to the next rather than retrying offsets
      }
      if (!found) break;                      // no key, or no results for this query
      if (avoid.has(found.ref)) continue;     // used recently — walk further down the list

      try {
        const buffer = await fetchAndNormalise(found.url);
        const stored = await upload(db, buffer);
        // Unsplash requires this ping once a photo is genuinely used. Done AFTER a
        // successful download and upload, so a photo we ended up not using is not
        // reported as used.
        if (found.downloadLocation) {
          const pinged = await triggerUnsplashDownload(found.downloadLocation, log);
          if (pinged) log('unsplash download endpoint notified (required by their terms)');
        }
        log(`image from ${found.provider} (${found.ref}) -> ${stored.objectName}`);
        return { ...stored, ref: found.ref, provider: found.provider, credit: found.credit };
      } catch (err) {
        log(`image download/upload failed for ${found.ref}: ${err.message}`);
        // fall through to the next offset
      }
    }
  }

  const gen = await generatedImage(title, q);
  const stored = await upload(db, gen.buffer);
  log(`image generated locally -> ${stored.objectName}`);
  return { ...stored, ref: gen.ref, provider: gen.provider, credit: null };
}

/** The credit line Unsplash's licence asks for. Empty for the other providers. */
function creditHtml(credit) {
  if (!credit) return '';
  const esq = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<p><em>Photo by <a href="${esq(credit.link)}" rel="nofollow noopener">${esq(credit.name)}</a> on ${esq(credit.provider)}.</em></p>`;
}

module.exports = {
  acquire,
  triggerUnsplashDownload,
  upload,
  fetchAndNormalise,
  generatedImage,
  creditHtml,
  canRenderText,
  OUT_WIDTH,
  OUT_HEIGHT,
  BUCKET,
  FOLDER,
};
