// Shared client for JyotishamAstroAPI (api.jyotishamastroapi.com — 138 endpoints, 13 categories).
// Docs: https://documenter.getpostman.com/view/22952033/2sA3s4nWfA
//
// Known inconsistencies in this API (verified from the live Postman collection) — read this
// before adding a new call, so you don't get bitten by something that looks like a typo but isn't:
//
//   1. Auth is a HEADER named `key` (not a query param, despite the collection's variable being
//      named "Apikey"). Every single endpoint uses this same header.
//   2. Response envelope is `{status, response, callsRemaining}` for MOST endpoints, but the
//      Numerology endpoints add extra top-level fields: `{status, success, message, response}`.
//      This client always returns just `.response` so callers never see the difference.
//   3. `chart_image/*` and `kp/kundli_chart` / `kp/rasi_chart` return the SVG OUTSIDE the normal
//      envelope — but as a JSON-ENCODED STRING (the body literally begins with a double quote:
//      "\"<svg …>\""), NOT as raw SVG text. This note previously claimed raw text and the client
//      only checked for a leading `<svg`, which never matched; the body then JSON.parsed to a bare
//      string, hit the "no .response field" guard, and threw — surfacing as a 502 on every Kundli,
//      Chart and KP report (verified live 2026-08-15). Both encodings are handled now.
//   4. PDF endpoints (`pdf/*`) use `lat`/`lon` query params, while almost everything else in the
//      API uses `latitude`/`longitude`. Don't copy-paste a query builder between the two.
//   5. Date format is documented as `dd/mm/yyyy`, but the collection's own examples inconsistently
//      mix `dd/mm/yyyy` and `yyyy/mm/dd` even within the same folder (Matching). We always send
//      `dd/mm/yyyy` from our backend — never trust a caller-supplied date string's format blindly.
//   6. Matching's Ashtakoot/Dashakoot/Aggregate/Papasamaya need full birth details for both people
//      (`boy_dob`/`boy_tob`/`boy_lat`/`boy_lon`/`boy_tz`, mirrored `girl_*`), but Western/Nakshatra
//      matching instead take a bare numeric `boy_sign`/`girl_sign` or `boy_nakshatra`/`girl_nakshatra`
//      — genuinely different input shapes within the same "Matching" folder.
//   7. PDF endpoints' actual response shape (binary PDF vs JSON containing a URL) is NOT captured
//      anywhere in the docs — nothing to verify against until a real call is made. Callers must
//      branch on the response Content-Type defensively (see src/astroRoutes.js pdf-report handler).

const axios = require('axios');

const JYOTISHAM_API_KEY = process.env.JYOTISHAM_API_KEY;
const JYOTISHAM_API_BASE_URL = process.env.JYOTISHAM_API_BASE_URL || 'https://api.jyotishamastroapi.com';

// GET a JyotishamAstroAPI path. Returns { type: 'json', data } or { type: 'svg', data: rawSvgText }.
// `responseType` can be overridden to 'arraybuffer' for endpoints suspected to return binary (PDF).
async function callJyotisham(path, query = {}, { responseType = 'text' } = {}) {
  if (!JYOTISHAM_API_KEY) {
    throw new Error('JYOTISHAM_API_KEY is not configured');
  }
  try {
    const res = await axios.get(`${JYOTISHAM_API_BASE_URL}${path}`, {
      headers: { key: JYOTISHAM_API_KEY },
      params: query,
      responseType,
    });

    if (responseType === 'arraybuffer') {
      return { type: 'binary', contentType: res.headers['content-type'] || '', data: res.data };
    }

    const body = res.data;
    if (typeof body === 'string' && body.trim().startsWith('<svg')) {
      return { type: 'svg', data: body };
    }

    const parsed = typeof body === 'string' ? JSON.parse(body) : body;

    // The chart endpoints deliver their SVG as a JSON string, so parsing yields
    // a bare string rather than an envelope object. Catch that here — without
    // it the `.response === undefined` guard below treats a perfectly good
    // chart as a malformed response and throws (see note #3).
    if (typeof parsed === 'string') {
      if (parsed.trim().startsWith('<svg')) {
        return { type: 'svg', data: parsed };
      }
      throw new Error(
        `JyotishamAstroAPI returned an unexpected string response for ${path}: ${parsed.slice(0, 200)}`,
      );
    }

    if (parsed && parsed.status && parsed.status !== 200) {
      throw new Error(parsed.message || `JyotishamAstroAPI returned status ${parsed.status}`);
    }
    // Some error/edge responses (rate-limit, quota-exhausted, malformed request) come back as
    // 200 OK with a shape that isn't {status, response, ...} at all — e.g. a bare {"error": "..."}
    // or {"message": "..."}. Silently returning `data: undefined` in that case would let a caller
    // think the report succeeded with an empty result. Fail loudly instead.
    if (!parsed || parsed.response === undefined) {
      throw new Error(
        (parsed && (parsed.error || parsed.message)) ||
        `JyotishamAstroAPI returned an unexpected response shape for ${path}: ${JSON.stringify(parsed).slice(0, 200)}`
      );
    }
    return { type: 'json', data: parsed.response };
  } catch (err) {
    let detail = err?.response?.data || err.message;
    // An arraybuffer responseType (the PDF endpoints) means even the error body arrives as
    // bytes, so the message is unreadable unless it's decoded back first.
    if (Buffer.isBuffer(detail)) {
      try { detail = JSON.parse(detail.toString('utf8')); } catch (_) { detail = detail.toString('utf8'); }
    }
    const text = typeof detail === 'string' ? detail : (detail?.error || detail?.message || '');
    console.error(`[jyotisham] GET ${path} failed:`, text || detail);

    // Quota exhaustion is an OPERATIONAL state, not a bug in the request — it arrives as
    // HTTP 429 {"error":"Insufficient credits…"}. Tagging it lets astroRoutes turn it into
    // an honest "temporarily unavailable" instead of a bare 502 the customer can't act on.
    // Confirmed live 2026-08-16: the PDF endpoints were 429ing on this while every non-PDF
    // endpoint still answered 200 — PDF generation draws on a separate credit pool.
    if (err?.response?.status === 429 || /insufficient credits/i.test(text)) {
      throw Object.assign(new Error('JyotishamAstroAPI credits exhausted'), {
        quotaExhausted: true,
        statusCode: 503,
      });
    }
    throw new Error(text || 'JyotishamAstroAPI request failed');
  }
}

// dd/mm/yyyy formatter — the canonical format for this API (see note #5 above).
function toApiDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toApiTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

module.exports = { callJyotisham, toApiDate, toApiTime, JYOTISHAM_API_BASE_URL };
