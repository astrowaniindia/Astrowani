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

  console.log('[free-services] routes registered: POST /api/free-services/{horoscope,panchang,janam-kundali,kundali-match}');
};
