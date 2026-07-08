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
//   3. `chart_image/*` and `kp/kundli_chart` / `kp/rasi_chart` return RAW SVG TEXT, not the JSON
//      envelope at all. This client detects that (`<svg` prefix) and returns it tagged as `svg`.
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
    const detail = err?.response?.data || err.message;
    console.error(`[jyotisham] GET ${path} failed:`, detail);
    throw new Error(typeof detail === 'string' ? detail : 'JyotishamAstroAPI request failed');
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
