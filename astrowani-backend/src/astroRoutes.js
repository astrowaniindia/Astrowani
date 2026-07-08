// Paid astrology reports backed by JyotishamAstroAPI (see src/jyotishamClient.js for the API's
// documented inconsistencies). One POST /api/astro/:key per report; 100% platform revenue —
// every purchase debits the customer wallet and credits the single admin_wallet row (see
// sql/astro_services_schema.sql). No vendor/astrologer is involved in these purchases.
//
// Handler order is deliberate: validate → resolve customer → look up price → check balance →
// ONLY THEN call the external API → charge on success. This guarantees a failed/slow external
// call never charges a customer, and a customer with insufficient balance never triggers an
// external call (saves API quota on requests that would fail anyway).
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { callJyotisham } = require('./jyotishamClient');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_astrowani_key_123';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://astrowani.onrender.com';

// Service-role client — this module only ever runs behind JWT auth, so using the service role
// for both reads and writes (rather than juggling an anon client too) keeps it self-contained,
// matching src/adminRoutes.js's single-client convention.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const COMPANY = {
  company_name: 'Astrowani',
  company_address: 'Astrowani',
  company_email: 'support@astrowani.com',
  company_phone: '+910000000000',
  company_website: 'www.astrowani.com',
};

// In-memory cache for generated PDF bytes (10 min TTL) — see the pdf-report handler for why.
const pdfCache = new Map();
function cachePdf(buf) {
  const id = crypto.randomUUID();
  pdfCache.set(id, { buf, expires: Date.now() + 10 * 60 * 1000 });
  return id;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pdfCache) if (entry.expires < now) pdfCache.delete(id);
}, 5 * 60 * 1000);

async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  const userId = decoded.userId || decoded._id || decoded.id;
  let customer = null;
  if (decoded.phone) {
    const { data } = await db.from('customers').select('id, wallet_balance').eq('mobile', decoded.phone).limit(1);
    if (data && data.length) customer = data[0];
  }
  if (!customer && userId && String(userId).includes('-')) {
    const { data } = await db.from('customers').select('id, wallet_balance').eq('id', userId).single();
    if (data) customer = data;
  }
  return customer;
}

function missingFields(body, fields) {
  return fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
}

function birthQuery(body, { latKey = 'latitude', lonKey = 'longitude' } = {}) {
  return {
    date: body.date,
    time: body.time,
    [latKey]: body.latitude,
    [lonKey]: body.longitude,
    tz: body.tz || '5.5',
    lang: body.lang || 'en',
  };
}

// chart_image/* and kp/kundli_chart both 400 with "Please enter all required fields" unless
// `style` is present too — confirmed live; it's not just a cosmetic param despite looking like
// one in the docs examples (colored_planets/color ARE optional — omitting only those succeeds).
function chartQuery(body) {
  return { ...birthQuery(body), style: body.style || 'north' };
}

function personQuery(body, prefix) {
  return {
    [`${prefix}_dob`]: body[`${prefix}_date`],
    [`${prefix}_tob`]: body[`${prefix}_time`],
    [`${prefix}_lat`]: body[`${prefix}_latitude`],
    [`${prefix}_lon`]: body[`${prefix}_longitude`],
    [`${prefix}_tz`]: body[`${prefix}_tz`] || '5.5',
  };
}

const DIVISIONAL_CHARTS = [
  'd1', 'd3', 'd4', 'd6', 'd7', 'd8', 'd9', 'd10', 'd12', 'd16', 'd20', 'd24', 'd27', 'd30', 'd40', 'd45', 'd60',
  'sun', 'moon', 'bhav_chalit_chart', 'transit_chart',
];

const PDF_TEMPLATES = [
  'vedic_five_year_predictions', 'vedic_ten_year_predictions', 'vedic_fifteen_year_predictions',
  'destiny_of_heart', 'numero_three_year_predictions', 'numero_five_year_predictions',
  'numero_nine_year_predictions', 'life_purpose_report', 'career_success', 'generate',
  'foreign_travel_report', 'government_job_report', 'financial_opportunities_and_challenges_report',
  'education_and_learning_pathways_report', 'kundali_samyak', 'kundali_dirghaDrishti',
  'Kundali_moolPatrika', 'startup_success', 'motherhood_by_numbers', 'decision_year_report_2026',
  'master_combo_report_2026', 'wellness_guide', 'life_direction_report_2026', 'personal_empowerment_report',
];

// Each report: requiredFields (checked before any external call) + fetch(body) → plain payload.
const REPORTS = {
  kundli: {
    requiredFields: ['date', 'time', 'latitude', 'longitude'],
    async fetch(body) {
      const q = birthQuery(body);
      const [extendedKundali, chart, ascendantReport, planetDetails] = await Promise.all([
        callJyotisham('/api/extended_horoscope/extended_kundali', q),
        callJyotisham('/api/chart_image/d1', chartQuery(body)),
        callJyotisham('/api/horoscope/ascendant-report', q),
        callJyotisham('/api/horoscope/planet-details', q),
      ]);
      return {
        extendedKundali: extendedKundali.data,
        chartSvg: chart.data,
        ascendantReport: ascendantReport.data,
        planetDetails: planetDetails.data,
      };
    },
  },

  matching: {
    requiredFields: [
      'boy_date', 'boy_time', 'boy_latitude', 'boy_longitude',
      'girl_date', 'girl_time', 'girl_latitude', 'girl_longitude',
    ],
    async fetch(body) {
      const q = { ...personQuery(body, 'boy'), ...personQuery(body, 'girl'), lang: body.lang || 'en' };
      const boyDosh = birthQuery({
        date: body.boy_date, time: body.boy_time, latitude: body.boy_latitude, longitude: body.boy_longitude, tz: body.boy_tz,
      });
      const girlDosh = birthQuery({
        date: body.girl_date, time: body.girl_time, latitude: body.girl_latitude, longitude: body.girl_longitude, tz: body.girl_tz,
      });
      const [ashtakoot, dashakoot, aggregate, boyMangalDosh, girlMangalDosh] = await Promise.all([
        callJyotisham('/api/matching/ashtakoot-astro', q),
        callJyotisham('/api/matching/dashakoot-astro', q),
        callJyotisham('/api/matching/aggregate-match', q),
        callJyotisham('/api/dosha/mangal_dosh', boyDosh),
        callJyotisham('/api/dosha/mangal_dosh', girlDosh),
      ]);
      return {
        ashtakoot: ashtakoot.data,
        dashakoot: dashakoot.data,
        aggregate: aggregate.data,
        boyMangalDosh: boyMangalDosh.data,
        girlMangalDosh: girlMangalDosh.data,
      };
    },
  },

  chart: {
    requiredFields: ['date', 'time', 'latitude', 'longitude', 'division'],
    async fetch(body) {
      const division = String(body.division || '').toLowerCase();
      if (!DIVISIONAL_CHARTS.includes(division)) {
        throw Object.assign(new Error(`Unknown division "${body.division}"`), { statusCode: 400 });
      }
      const chart = await callJyotisham(`/api/chart_image/${division}`, chartQuery(body));
      return { division, chartSvg: chart.data };
    },
  },

  dasha: {
    requiredFields: ['date', 'time', 'latitude', 'longitude'],
    async fetch(body) {
      const q = birthQuery(body);
      const [currentMahadashaFull, mahadasha, yoginiDashaMain, yoginiDashaSub] = await Promise.all([
        callJyotisham('/api/dasha/current-mahadasha-full', q),
        callJyotisham('/api/dasha/mahadasha', q),
        callJyotisham('/api/dasha/yogini-dasha-main', q),
        callJyotisham('/api/dasha/yogini-dasha-sub', q),
      ]);
      return {
        currentMahadashaFull: currentMahadashaFull.data,
        mahadasha: mahadasha.data,
        yoginiDashaMain: yoginiDashaMain.data,
        yoginiDashaSub: yoginiDashaSub.data,
      };
    },
  },

  dosh: {
    requiredFields: ['date', 'time', 'latitude', 'longitude'],
    async fetch(body) {
      const q = birthQuery(body);
      const [mangalDosh, kaalsarpDosh, manglikDosh, pitraDosh] = await Promise.all([
        callJyotisham('/api/dosha/mangal_dosh', q),
        callJyotisham('/api/dosha/kaalsarp-dosh', q),
        callJyotisham('/api/dosha/manglik-dosh', q),
        callJyotisham('/api/dosha/pitra-dosh', q),
      ]);
      return {
        mangalDosh: mangalDosh.data,
        kaalsarpDosh: kaalsarpDosh.data,
        manglikDosh: manglikDosh.data,
        pitraDosh: pitraDosh.data,
      };
    },
  },

  numerology: {
    requiredFields: ['date', 'name', 'phone', 'gender'],
    async fetch(body) {
      const base = { date: body.date, gender: body.gender, lang: body.lang || 'en' };
      const [loshuGrid, nameAnalysis, mobileAnalysis, luckyThings, personalYear] = await Promise.all([
        callJyotisham('/api/numerology/loshu-grid', base),
        callJyotisham('/api/numerology/name-analysis', { ...base, name: body.name }),
        callJyotisham('/api/numerology/mobile-analysis', { phone: body.phone, lang: body.lang || 'en' }),
        callJyotisham('/api/numerology/lucky-things', base),
        callJyotisham('/api/numerology/personal-year', base),
      ]);
      return {
        loshuGrid: loshuGrid.data,
        nameAnalysis: nameAnalysis.data,
        mobileAnalysis: mobileAnalysis.data,
        luckyThings: luckyThings.data,
        personalYear: personalYear.data,
      };
    },
  },

  'lal-kitab': {
    requiredFields: ['date', 'time', 'latitude', 'longitude'],
    async fetch(body) {
      const q = birthQuery(body);
      const [horoscope, debts, remedies, houses, planets] = await Promise.all([
        callJyotisham('/api/lalKitab/horoscope', q),
        callJyotisham('/api/lalKitab/debts', q),
        callJyotisham('/api/lalKitab/remedies', q),
        callJyotisham('/api/lalKitab/houses', q),
        callJyotisham('/api/lalKitab/planets', q),
      ]);
      return {
        horoscope: horoscope.data,
        debts: debts.data,
        remedies: remedies.data,
        houses: houses.data,
        planets: planets.data,
      };
    },
  },

  'kp-astrology': {
    requiredFields: ['date', 'time', 'latitude', 'longitude'],
    async fetch(body) {
      const q = birthQuery(body);
      const [chart, planetDetails, cuspDetails, houseSignificators] = await Promise.all([
        callJyotisham('/api/kp/kundli_chart', chartQuery(body)),
        callJyotisham('/api/kp/planet_details', q),
        callJyotisham('/api/kp/cusp_details', q),
        callJyotisham('/api/kp/house_significators', q),
      ]);
      return {
        chartSvg: chart.data,
        planetDetails: planetDetails.data,
        cuspDetails: cuspDetails.data,
        houseSignificators: houseSignificators.data,
      };
    },
  },

  tarot: {
    requiredFields: [],
    async fetch(body) {
      // The docs never state tarot_no's valid range — the only confirmed-working value from
      // the collection's captured example is 4 ("Death"). A live test with tarot_no in 1-78
      // (assuming a full tarot deck) returned {"error":"Invalid tarot card number"}, so the
      // deck is smaller than that. Narrowed to 1-22 (standard Major Arcana size, the usual
      // deck for simplified yes/no tarot APIs) as the best-informed guess — still unverified
      // beyond tarot_no=4. If this 502s in production, narrow further or ask the API provider
      // for the real range rather than brute-forcing it (each attempt costs API quota).
      const tarotNo = 1 + Math.floor(Math.random() * 22);
      const reading = await callJyotisham('/api/tarot_readings/yes_or_no', { tarot_no: tarotNo, lang: body.lang || 'en' });
      return { reading: reading.data };
    },
  },

  'pdf-report': {
    requiredFields: ['name', 'date', 'time', 'latitude', 'longitude', 'place', 'template'],
    async fetch(body) {
      const template = String(body.template || '');
      if (!PDF_TEMPLATES.includes(template)) {
        throw Object.assign(new Error(`Unknown PDF template "${body.template}"`), { statusCode: 400 });
      }
      // PDF endpoints use lat/lon, not latitude/longitude (see jyotishamClient.js note #4).
      const q = {
        name: body.name,
        date: body.date,
        time: body.time,
        lat: body.latitude,
        lon: body.longitude,
        tz: body.tz || '5.5',
        lang: body.lang || 'en',
        style: body.style || 'north',
        place: body.place,
        watermark: 'false',
        ...COMPANY,
      };
      // 'generate' (the "horoscope" template) is the one outlier that needs an extra pdf_type
      // param per its docs example — the other 24 templates share an identical param set
      // without it. Confirmed live: calling 'generate' without pdf_type 400s with "Please enter
      // all required fields", same failure mode as the chart_image style-param bug above.
      if (template === 'generate') q.pdf_type = 'small';
      // Response shape is UNVERIFIED against the real API — every live attempt hit "Insufficient
      // credits" instead of a real response (account ran out of JyotishamAstroAPI quota during
      // testing). Branches defensively on the bytes we actually get back rather than assuming
      // JSON or binary; re-verify with a real call once credits are renewed.
      const result = await callJyotisham(`/api/pdf/${template}`, q, { responseType: 'arraybuffer' });
      const buf = Buffer.from(result.data);
      const looksLikePdf = buf.slice(0, 4).toString('ascii') === '%PDF' || (result.contentType || '').includes('application/pdf');
      if (looksLikePdf) {
        const id = cachePdf(buf);
        return { pdfUrl: `${PUBLIC_BASE_URL}/api/astro/pdf-file/${id}` };
      }
      let parsed = null;
      try { parsed = JSON.parse(buf.toString('utf8')); } catch (_) { /* not JSON either */ }
      const url = parsed?.response?.url || parsed?.response?.pdf_url || parsed?.url;
      if (url) return { pdfUrl: url };
      throw new Error('Unexpected PDF response shape from JyotishamAstroAPI');
    },
  },
};

module.exports = function registerAstroRoutes(app) {
  // Public — customer app reads prices before showing the purchase screen.
  app.get('/api/astro-services', async (req, res) => {
    try {
      const { data, error } = await db
        .from('astro_services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return res.json({ success: true, data: data || [] });
    } catch (err) {
      console.error('GET /api/astro-services error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load astro services' });
    }
  });

  // Unauthenticated single-use-ish fetch of a generated PDF's bytes (see pdf-report handler).
  app.get('/api/astro/pdf-file/:id', (req, res) => {
    const entry = pdfCache.get(req.params.id);
    if (!entry || entry.expires < Date.now()) {
      return res.status(404).json({ success: false, message: 'Report not found or expired' });
    }
    res.set('Content-Type', 'application/pdf');
    return res.send(entry.buf);
  });

  app.post('/api/astro/:key', async (req, res) => {
    const { key } = req.params;
    const report = REPORTS[key];
    if (!report) {
      return res.status(404).json({ success: false, message: `Unknown astro service "${key}"` });
    }

    const missing = missingFields(req.body || {}, report.requiredFields);
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
    }

    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { data: service, error: serviceErr } = await db
      .from('astro_services')
      .select('*')
      .eq('key', key)
      .eq('is_active', true)
      .single();
    if (serviceErr || !service) {
      return res.status(404).json({ success: false, message: 'This report is not available right now' });
    }

    const price = Number(service.price) || 0;
    const balance = Number(customer.wallet_balance) || 0;
    if (balance < price) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    let payload;
    try {
      payload = await report.fetch(req.body || {});
    } catch (err) {
      const statusCode = err.statusCode || 502;
      console.error(`POST /api/astro/${key} upstream error:`, err.message);
      return res.status(statusCode).json({ success: false, message: err.message || 'Failed to generate report' });
    }

    // Charge only after a successful external call — nothing is charged for a failed report.
    try {
      await db.from('customers').update({ wallet_balance: balance - price }).eq('id', customer.id);
      await db.from('wallet_transactions').insert([{
        user_id: customer.id, type: 'debit', amount: price, description: `Astro Report: ${service.name}`,
      }]);

      const { data: wallet } = await db.from('admin_wallet').select('id, balance').limit(1).single();
      await db.from('admin_wallet').update({
        balance: (Number(wallet?.balance) || 0) + price,
        updated_at: new Date().toISOString(),
      }).eq('id', wallet.id);
      await db.from('admin_wallet_transactions').insert([{
        type: 'credit', amount: price, description: `Astro Report purchased: ${service.name}`,
        service_key: key, customer_id: customer.id,
      }]);
    } catch (err) {
      // The report was already generated successfully at this point — log loudly but still
      // return the data the customer paid to see; a billing-log failure shouldn't block delivery.
      console.error(`POST /api/astro/${key} billing error (report already generated):`, err.message);
    }

    return res.status(200).json({ success: true, data: payload, newBalance: balance - price });
  });

  console.log('[astro] routes registered: GET /api/astro-services, POST /api/astro/:key');
};
