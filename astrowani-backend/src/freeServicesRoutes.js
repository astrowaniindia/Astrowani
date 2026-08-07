// Free astrology services (Panchang, daily Horoscope, Janam Kundali, Kundali Match) — no
// wallet charge, no auth required. These used to live on a separate DigitalOcean microservice
// (astrowani-fb6pi.ondigitalocean.app) that no longer exists (DNS: non-existent domain).
// Reimplemented here on top of JyotishamAstroAPI (already used for the paid reports in
// astroRoutes.js), shaping each response to match what the existing customer-app screens
// already expect — so no frontend changes were needed beyond repointing FREE_SERVICES_URL.
const { callJyotisham } = require('./jyotishamClient');

const ZODIAC_NUMBERS = {
  aries: 1, taurus: 2, gemini: 3, cancer: 4, leo: 5, virgo: 6,
  libra: 7, scorpio: 8, sagittarius: 9, capricorn: 10, aquarius: 11, pisces: 12,
};

// Accepts an ISO datetime string (what all 4 screens send) and returns { date: 'dd/mm/yyyy', time: 'HH:MM' }.
function splitDateTime(isoString) {
  const d = new Date(isoString);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const MM = String(d.getUTCMinutes()).padStart(2, '0');
  return { date: `${dd}/${mm}/${yyyy}`, time: `${HH}:${MM}` };
}

// KundaliMatchScreen sends plain 'YYYY-MM-DD' + 'HH:MM' (no timezone) — different shape from
// the ISO-datetime the other 3 screens send, so it gets its own converter.
function toDDMMYYYY(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split('-');
  return `${d}/${m}/${y}`;
}

// Jyotisham's muhurat sub-endpoints (choghadiya-muhurta, hora-muhurta) return timestamps as
// "DD/MM/YYYY, H:MM:SS AM/PM" — not safely parseable by MuhuratCard.js's `new Date(x)` (JS's
// loose Date parser reads ambiguous D/M/Y strings as M/D/Y, silently swapping day and month for
// any day <=12). Convert to unambiguous ISO-local so its existing formatTime() (which just does
// `new Date(x).toLocaleTimeString()`) round-trips the same wall-clock time regardless of device
// locale/timezone — no frontend changes needed.
function jyotishamTimestampToIso(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec(String(raw || '').trim());
  if (!m) return raw;
  const [, dd, mm, yyyy, h, min, ss, ampm] = m;
  let hh = parseInt(h, 10);
  if (/pm/i.test(ampm) && hh !== 12) hh += 12;
  if (/am/i.test(ampm) && hh === 12) hh = 0;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${String(hh).padStart(2, '0')}:${min}:${ss}`;
}

// Same idea for the plain "H:MM AM to H:MM PM" / "H:MM AM - H:MM PM" ranges the panchang
// endpoint returns for rahukaal/gulika/yamakanta — anchored to the request's YYYY-MM-DD since
// these ranges carry no date of their own.
function timeRangeToIso(range, yyyyMmDd) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:to|-)\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(range || '').trim());
  if (!m) return null;
  const to24 = (h, ap) => {
    let hh = parseInt(h, 10);
    if (/pm/i.test(ap) && hh !== 12) hh += 12;
    if (/am/i.test(ap) && hh === 12) hh = 0;
    return hh;
  };
  const [, h1, m1, ap1, h2, m2, ap2] = m;
  return {
    start: `${yyyyMmDd}T${String(to24(h1, ap1)).padStart(2, '0')}:${m1}:00`,
    end: `${yyyyMmDd}T${String(to24(h2, ap2)).padStart(2, '0')}:${m2}:00`,
  };
}

const VEDIC_PLANET_NAMES = {
  Sun: 'Ravi', Moon: 'Chandra', Mars: 'Mangal', Mercury: 'Budh',
  Jupiter: 'Guru', Venus: 'Shukra', Saturn: 'Shani',
};

// Shared shape consumed by KundaliDetails.js (nakshatra_details/mangal_dosha/yoga_details) AND
// by BasicDetails.js (flat nakshatra/rasi/koot) — kundali-match's boy_info/girl_info get routed
// through "View Kundali" into the same KundaliDetails.js screen, so they need both shapes at once.
function buildKundaliPayload({ extendedKundali, mangalDosh, yogasList, astroDetails }) {
  const nakshatraName = astroDetails?.nakshatra ?? extendedKundali?.nakshatra;
  const rasiName = astroDetails?.rasi ?? extendedKundali?.rasi;
  const varna = astroDetails?.varna ?? extendedKundali?.varna;
  const vasya = astroDetails?.vasya ?? extendedKundali?.vasya;
  const yoni = astroDetails?.yoni ?? extendedKundali?.yoni;
  const gana = astroDetails?.gana ?? extendedKundali?.gana;

  return {
    nakshatra: { name: nakshatraName },
    rasi: { name: rasiName },
    koot: { varna, vasya, yoni, gana },
    nakshatra_details: {
      nakshatra: { name: nakshatraName },
      chandra_rasi: { name: rasiName },
      soorya_rasi: { name: extendedKundali?.sun_sign },
      zodiac: { name: extendedKundali?.ascendant_sign },
    },
    mangal_dosha: mangalDosh
      ? { has_dosha: !!mangalDosh.is_dosha_present, description: mangalDosh.bot_response || '' }
      : undefined,
    yoga_details: yogasList
      ? Object.values(yogasList).map((y) => ({ name: y.name, description: y.details }))
      : undefined,
  };
}

module.exports = function registerFreeServicesRoutes(app) {
  // Daily horoscope by zodiac sign — customer app: Horoscope.js
  app.post('/api/free-services/horoscope', async (req, res) => {
    try {
      const sign = String(req.query.sign || '').toLowerCase();
      const zodiac = ZODIAC_NUMBERS[sign];
      if (!zodiac) {
        return res.status(400).json({ success: false, message: `Unknown zodiac sign "${req.query.sign}"` });
      }
      const lang = req.query.language || 'en';
      const { data } = await callJyotisham('/api/prediction/daily', { zodiac, day: 'today', lang });
      return res.status(200).json({
        data: { daily_prediction: { prediction: data.horoscope_data, date: data.date } },
      });
    } catch (err) {
      console.error('[free-services] horoscope error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch horoscope' });
    }
  });

  // Panchang for a date/location — customer app: PanchangScreen.js
  app.post('/api/free-services/panchang', async (req, res) => {
    try {
      const { latitude, longitude, language } = req.query;
      const { datetime } = req.body || {};
      if (!latitude || !longitude || !datetime) {
        return res.status(400).json({ success: false, message: 'latitude, longitude and datetime are required' });
      }
      const { date, time } = splitDateTime(datetime);
      const { data } = await callJyotisham('/api/panchang/panchang', {
        date, time, latitude, longitude, tz: '5.5', lang: language || 'en',
      });
      return res.status(200).json({
        data: {
          vaara: data.advanced_details?.vaara,
          nakshatra: [{ name: data.nakshatra?.name }],
          tithi: [{ name: data.tithi?.name, paksha: data.tithi?.type }],
          karana: [{ name: data.karana?.name }],
          yoga: [{ name: data.yoga?.name }],
        },
      });
    } catch (err) {
      console.error('[free-services] panchang error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch panchang' });
    }
  });

  // Janam Kundali for a birth date/time/location — customer app: JanamKundaliScreen.js
  app.post('/api/free-services/janam-kundali', async (req, res) => {
    try {
      const { latitude, longitude } = req.query;
      const { datetime } = req.body || {};
      if (!latitude || !longitude || !datetime) {
        return res.status(400).json({ success: false, message: 'latitude, longitude and datetime are required' });
      }
      const { date, time } = splitDateTime(datetime);
      const q = { date, time, latitude, longitude, tz: '5.5', lang: req.query.language || 'en' };
      const [extendedKundali, mangalDosh, yogasList] = await Promise.all([
        callJyotisham('/api/extended_horoscope/extended_kundali', q),
        callJyotisham('/api/dosha/mangal_dosh', q),
        callJyotisham('/api/extended_horoscope/yogas_list', q),
      ]);
      const payload = buildKundaliPayload({
        extendedKundali: extendedKundali.data,
        mangalDosh: mangalDosh.data,
        yogasList: yogasList.data,
      });
      // JanamKundaliScreen -> KundaliDetails.js only reads the nested shape; keep the response
      // focused on that (the flat nakshatra/rasi/koot fields are for the kundali-match reuse).
      return res.status(200).json({
        data: {
          nakshatra_details: payload.nakshatra_details,
          mangal_dosha: payload.mangal_dosha,
          yoga_details: payload.yoga_details,
        },
      });
    } catch (err) {
      console.error('[free-services] janam-kundali error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch kundali' });
    }
  });

  // Kundali matching for two people — customer app: KundaliMatchScreen.js
  app.post('/api/free-services/kundali-match', async (req, res) => {
    try {
      const { maleDetails, femaleDetails } = req.body || {};
      if (!maleDetails?.date || !maleDetails?.location || !femaleDetails?.date || !femaleDetails?.location) {
        return res.status(400).json({ success: false, message: 'maleDetails and femaleDetails are required' });
      }
      const lang = req.query.language || 'en';
      const boyQ = {
        boy_dob: toDDMMYYYY(maleDetails.date), boy_tob: maleDetails.time,
        boy_lat: maleDetails.location.latitude, boy_lon: maleDetails.location.longitude, boy_tz: '5.5',
        girl_dob: toDDMMYYYY(femaleDetails.date), girl_tob: femaleDetails.time,
        girl_lat: femaleDetails.location.latitude, girl_lon: femaleDetails.location.longitude, girl_tz: '5.5',
        lang,
      };
      const boyBirth = {
        date: toDDMMYYYY(maleDetails.date), time: maleDetails.time,
        latitude: maleDetails.location.latitude, longitude: maleDetails.location.longitude, tz: '5.5', lang,
      };
      const girlBirth = {
        date: toDDMMYYYY(femaleDetails.date), time: femaleDetails.time,
        latitude: femaleDetails.location.latitude, longitude: femaleDetails.location.longitude, tz: '5.5', lang,
      };

      const [ashtakoot, aggregate, boyMangal, girlMangal, boyKundali, girlKundali] = await Promise.all([
        callJyotisham('/api/matching/ashtakoot-astro', boyQ),
        callJyotisham('/api/matching/aggregate-match', boyQ),
        callJyotisham('/api/dosha/mangal_dosh', boyBirth),
        callJyotisham('/api/dosha/mangal_dosh', girlBirth),
        callJyotisham('/api/extended_horoscope/extended_kundali', boyBirth),
        callJyotisham('/api/extended_horoscope/extended_kundali', girlBirth),
      ]);

      const a = ashtakoot.data;
      const KOOTS = ['varna', 'vasya', 'tara', 'yoni', 'grahamaitri', 'gana', 'bhakoot', 'nadi'];
      const guna = KOOTS.map((key, i) => {
        const koot = a[key] || {};
        return {
          id: i + 1,
          name: koot.name || key,
          obtained_points: koot[key],
          maximum_points: koot.full_score,
          description: koot.description || '',
        };
      });

      const boyInfo = buildKundaliPayload({ extendedKundali: boyKundali.data, astroDetails: a.boy_astro_details });
      const girlInfo = buildKundaliPayload({ extendedKundali: girlKundali.data, astroDetails: a.girl_astro_details });

      return res.status(200).json({
        data: {
          message: { description: aggregate.data.bot_response || a.bot_response || '' },
          boy_mangal_dosha_details: { has_dosha: !!boyMangal.data.is_dosha_present },
          girl_mangal_dosha_details: { has_dosha: !!girlMangal.data.is_dosha_present },
          boy_info: boyInfo,
          girl_info: girlInfo,
          guna_milan: { total_points: a.score, maximum_points: 36, guna },
        },
      });
    } catch (err) {
      console.error('[free-services] kundali-match error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch kundali match' });
    }
  });

  // Shubh Muhurat (Choghadiya / Hora / Rahu Kaal) — customer app: MuhuratCard.js. It only
  // collects a date + location (no time-of-day), so all three anchor to local noon — these
  // periods are derived from that date's sunrise/sunset and weekday, not the query time itself.
  app.post('/api/free-services/shubh-muhurat/choghadiya', async (req, res) => {
    try {
      const { latitude, longitude } = req.body?.location || {};
      const { date } = req.body || {};
      if (!latitude || !longitude || !date) {
        return res.status(400).json({ success: false, message: 'date and location are required' });
      }
      const [yyyy, mm, dd] = date.split('-');
      const { data } = await callJyotisham('/api/panchang/choghadiya-muhurta', {
        date: `${dd}/${mm}/${yyyy}`, time: '12:00', latitude, longitude, tz: '5.5', lang: req.query.language || 'en',
      });
      const toItems = (arr, vela) => (arr || []).map((item) => ({
        name: item.muhurat,
        start: jyotishamTimestampToIso(item.start),
        end: jyotishamTimestampToIso(item.end),
        type: item.type,
        vela,
      }));
      const muhurat = [...toItems(data.day, 'Day'), ...toItems(data.night, 'Night')];
      return res.status(200).json({ choghadiya: { data: { muhurat } } });
    } catch (err) {
      console.error('[free-services] shubh-muhurat/choghadiya error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch choghadiya' });
    }
  });

  // Hora periods aren't classified Auspicious/Inauspicious the way Choghadiya is, and Jyotisham
  // doesn't return a Sanskrit "vedic_name" for the ruling planet (only e.g. "Mercury") — the
  // screen's card title format is `${name} (${vedic_name})`, so VEDIC_PLANET_NAMES fills that
  // in, and `type` carries the API's own `benefits` text as the card's description line.
  app.post('/api/free-services/shubh-muhurat/hora-timing', async (req, res) => {
    try {
      const { latitude, longitude } = req.body?.location || {};
      const { date } = req.body || {};
      if (!latitude || !longitude || !date) {
        return res.status(400).json({ success: false, message: 'date and location are required' });
      }
      const [yyyy, mm, dd] = date.split('-');
      const { data } = await callJyotisham('/api/panchang/hora-muhurta', {
        date: `${dd}/${mm}/${yyyy}`, time: '12:00', latitude, longitude, tz: '5.5', lang: req.query.language || 'en',
      });
      const hora_timing = (data.horas || []).map((item) => ({
        hora: { name: item.hora, vedic_name: VEDIC_PLANET_NAMES[item.hora] || item.hora },
        start: jyotishamTimestampToIso(item.start),
        end: jyotishamTimestampToIso(item.end),
        type: item.benefits,
      }));
      return res.status(200).json({ horaTiming: { data: { hora_timing } } });
    } catch (err) {
      console.error('[free-services] shubh-muhurat/hora-timing error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch hora timing' });
    }
  });

  // Rahu Kaal isn't its own Jyotisham endpoint — it (plus Gulika and Yamaganda, the other two
  // inauspicious "kaal" periods traditionally shown alongside it) are plain "H:MM AM to H:MM PM"
  // string fields on the main panchang response, the same endpoint already used by the Panchang
  // free service above.
  app.post('/api/free-services/shubh-muhurat/rahu-kaal', async (req, res) => {
    try {
      const { latitude, longitude } = req.body?.location || {};
      const { date } = req.body || {};
      if (!latitude || !longitude || !date) {
        return res.status(400).json({ success: false, message: 'date and location are required' });
      }
      const [yyyy, mm, dd] = date.split('-');
      const { data } = await callJyotisham('/api/panchang/panchang', {
        date: `${dd}/${mm}/${yyyy}`, time: '12:00', latitude, longitude, tz: '5.5', lang: req.query.language || 'en',
      });
      const KAAL_FIELDS = [
        { key: 'rahukaal', name: 'Rahu Kaal' },
        { key: 'gulika', name: 'Gulika Kaal' },
        { key: 'yamakanta', name: 'Yamaganda Kaal' },
      ];
      const muhurat = KAAL_FIELDS.map(({ key, name }) => {
        const period = timeRangeToIso(data[key], date);
        return period ? { name, period: [period], type: 'Inauspicious' } : null;
      }).filter(Boolean);
      return res.status(200).json({ rahuKaal: { data: { muhurat } } });
    } catch (err) {
      console.error('[free-services] shubh-muhurat/rahu-kaal error:', err.message);
      return res.status(502).json({ success: false, message: 'Failed to fetch rahu kaal' });
    }
  });

  console.log('[free-services] routes registered: POST /api/free-services/{horoscope,panchang,janam-kundali,kundali-match,shubh-muhurat/choghadiya,shubh-muhurat/hora-timing,shubh-muhurat/rahu-kaal}');
};
