// ============================================================================
// Astrowani astro-engine.js — pure calculation functions, no DOM, no network.
//
// Everything in the "SUN-SIGN LEVEL" + "PANCHANG" sections below uses standard,
// published astronomical formulas (Meeus low-precision solar/lunar longitude,
// the NOAA/Meeus sunrise equation, the classic Ascendant formula from spherical
// trigonometry). These are genuinely computed, not canned text — but low-precision
// lunar/solar series are accurate to roughly 0.1-0.3 degrees, which is enough for
// a same-day tithi/nakshatra/rashi reading but NOT a substitute for a professional
// ephemeris when the real value sits within minutes of a boundary. Every page that
// uses these shows a disclaimer saying so.
//
// Numerology / name-based "calculators" (Love, Flames, Friendship, Name
// Compatibility, Lucky Vehicle Number, Lo Shu Grid) are classic deterministic
// formulas used for entertainment across the astrology-site genre — same inputs
// always give the same output, nothing random.
// ============================================================================

const ASTRO_ZODIAC = [
  { name: 'Aries',       symbol: '♈', from: [3, 21], to: [4, 19], element: 'Fire',  lord: 'Mars' },
  { name: 'Taurus',      symbol: '♉', from: [4, 20], to: [5, 20], element: 'Earth', lord: 'Venus' },
  { name: 'Gemini',      symbol: '♊', from: [5, 21], to: [6, 20], element: 'Air',   lord: 'Mercury' },
  { name: 'Cancer',      symbol: '♋', from: [6, 21], to: [7, 22], element: 'Water', lord: 'Moon' },
  { name: 'Leo',         symbol: '♌', from: [7, 23], to: [8, 22], element: 'Fire',  lord: 'Sun' },
  { name: 'Virgo',       symbol: '♍', from: [8, 23], to: [9, 22], element: 'Earth', lord: 'Mercury' },
  { name: 'Libra',       symbol: '♎', from: [9, 23], to: [10, 22], element: 'Air',   lord: 'Venus' },
  { name: 'Scorpio',     symbol: '♏', from: [10, 23], to: [11, 21], element: 'Water', lord: 'Mars' },
  { name: 'Sagittarius', symbol: '♐', from: [11, 22], to: [12, 21], element: 'Fire',  lord: 'Jupiter' },
  { name: 'Capricorn',   symbol: '♑', from: [12, 22], to: [1, 19], element: 'Earth', lord: 'Saturn' },
  { name: 'Aquarius',    symbol: '♒', from: [1, 20], to: [2, 18], element: 'Air',   lord: 'Saturn' },
  { name: 'Pisces',      symbol: '♓', from: [2, 19], to: [3, 20], element: 'Water', lord: 'Jupiter' },
];
const ASTRO_RASHI_NAMES = ['Mesha (Aries)', 'Vrishabha (Taurus)', 'Mithuna (Gemini)', 'Karka (Cancer)', 'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrischika (Scorpio)', 'Dhanu (Sagittarius)', 'Makara (Capricorn)', 'Kumbha (Aquarius)', 'Meena (Pisces)'];
const ASTRO_NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const ASTRO_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ASTRO_WEEKDAY_LORDS = ['Sun (Ravi)', 'Moon (Chandra)', 'Mars (Mangal)', 'Mercury (Budh)', 'Jupiter (Guru)', 'Venus (Shukra)', 'Saturn (Shani)'];

function astroSunSign(month, day) {
  for (const z of ASTRO_ZODIAC) {
    const [fm, fd] = z.from, [tm, td] = z.to;
    if (fm === tm) { if (month === fm && day >= fd && day <= td) return z; }
    else if ((month === fm && day >= fd) || (month === tm && day <= td)) return z;
  }
  return ASTRO_ZODIAC[0];
}

// ---------- numerology ----------
function astroDigitSum(n) { let s = String(Math.abs(n)).split('').reduce((a, c) => a + (+c), 0); return s; }
function astroReduceToSingle(n, keepMaster = true) {
  while (n > 9) {
    if (keepMaster && (n === 11 || n === 22 || n === 33)) return n;
    n = astroDigitSum(n);
  }
  return n;
}
function astroLifePathNumber(dobStr) {
  const d = new Date(dobStr);
  if (isNaN(d)) return null;
  const digits = `${d.getDate()}${d.getMonth() + 1}${d.getFullYear()}`;
  const sum = digits.split('').reduce((a, c) => a + (+c), 0);
  return astroReduceToSingle(sum);
}
const ASTRO_LIFE_PATH_MEANINGS = {
  1: 'A natural leader — independent, driven and happiest carving your own path.',
  2: 'Diplomatic and intuitive — you thrive on partnership, balance and harmony.',
  3: 'Expressive and creative — communication and joy are your signature gifts.',
  4: 'Grounded and disciplined — you build things that last through steady effort.',
  5: 'Freedom-loving and adaptable — change and new experience keep you alive.',
  6: 'Nurturing and responsible — home, family and service matter most to you.',
  7: 'Introspective and analytical — you seek truth beneath the surface of things.',
  8: 'Ambitious and resourceful — material success and authority come naturally.',
  9: 'Compassionate and idealistic — you are here to give back more than you take.',
  11: 'Master Number 11 — an intuitive visionary, here to inspire others.',
  22: 'Master Number 22 — the master builder, able to turn big dreams into reality.',
  33: 'Master Number 33 — the master teacher, guided by selfless compassion.',
};

function astroLoShuGrid(dobStr) {
  const d = new Date(dobStr);
  if (isNaN(d)) return null;
  const digits = `${d.getDate()}${d.getMonth() + 1}${d.getFullYear()}`.split('').map(Number).filter((n) => n > 0);
  const counts = {};
  digits.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
  // classic Lo Shu 3x3 magic-square position for each digit 1-9
  const positions = { 4: [0, 0], 9: [0, 1], 2: [0, 2], 3: [1, 0], 5: [1, 1], 7: [1, 2], 8: [2, 0], 1: [2, 1], 6: [2, 2] };
  const grid = [['', '', ''], ['', '', ''], ['', '', '']];
  for (let n = 1; n <= 9; n++) {
    const [r, c] = positions[n];
    if (counts[n]) grid[r][c] = String(n).repeat(counts[n]);
  }
  const missing = [];
  for (let n = 1; n <= 9; n++) if (!counts[n]) missing.push(n);
  return { grid, counts, missing };
}

// Chaldean numerology letter values (a classic alternative to Pythagorean, commonly
// used for name-compatibility style calculators).
const ASTRO_CHALDEAN = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 8, g: 3, h: 5, i: 1, j: 1, k: 2, l: 3, m: 4, n: 5, o: 7, p: 8, q: 1, r: 2, s: 3, t: 4, u: 6, v: 6, w: 6, x: 5, y: 1, z: 7 };
function astroNameNumber(name) {
  const sum = (name || '').toLowerCase().replace(/[^a-z]/g, '').split('').reduce((a, c) => a + (ASTRO_CHALDEAN[c] || 0), 0);
  return { raw: sum, reduced: astroReduceToSingle(sum) };
}

// ---------- name-pair "calculators" (deterministic, for entertainment, each a different classic formula) ----------
function astroLoveScore(name1, name2) {
  // classic "L-O-V-E" letter-counting percentage calculator
  const combined = ((name1 || '') + (name2 || '')).toLowerCase();
  const counts = { l: 0, o: 0, v: 0, e: 0 };
  for (const ch of combined) if (ch in counts) counts[ch]++;
  let a = String(counts.l) + String(counts.o), b = String(counts.v) + String(counts.e);
  // classic reduction loop used by the well-known FLAMES/LOVE calculators
  while (a.length > 2 || b.length > 2) {
    let next = '';
    const combo = a + b;
    for (let i = 0; i < combo.length - 1; i++) next += (+combo[i] + +combo[i + 1]) % 10;
    const half = Math.ceil(next.length / 2);
    a = next.slice(0, half); b = next.slice(half);
  }
  let pct = +(a + b);
  if (isNaN(pct) || pct > 100) pct = (astroNameNumber(name1).raw + astroNameNumber(name2).raw) % 101;
  pct = Math.max(1, Math.min(99, pct));
  return pct;
}
function astroFlames(name1, name2) {
  // the classic F-L-A-M-E-S elimination game
  const clean = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '').split('');
  let a = clean(name1), b = clean(name2);
  a.forEach((ch) => { const i = b.indexOf(ch); if (i > -1) { b.splice(i, 1); a[a.indexOf(ch)] = null; } });
  const common = a.filter((c) => c === null).length;
  let count = (clean(name1).length + clean(name2).length) - common * 2;
  if (count < 1) count = 1;
  const letters = ['F', 'L', 'A', 'M', 'E', 'S'];
  const labels = { F: 'Friends', L: 'Love', A: 'Affection', M: 'Marriage', E: 'Enemies', S: 'Siblings' };
  let pool = letters.slice();
  let idx = 0;
  while (pool.length > 1) {
    idx = (idx + count - 1) % pool.length;
    pool.splice(idx, 1);
    if (pool.length === 0) break;
  }
  const result = pool[0] || 'F';
  return { letter: result, label: labels[result] };
}
function astroFriendshipScore(name1, name2) {
  // a different deterministic hash so it never mirrors the love-score formula
  const s1 = astroNameNumber(name1).raw, s2 = astroNameNumber(name2).raw;
  const combined = (name1 || '').length * 7 + (name2 || '').length * 13 + s1 * 3 + s2 * 5;
  let pct = (combined * 17) % 100;
  pct = pct < 15 ? pct + 40 : pct; // keep friendship scores from reading as uniformly harsh
  return Math.max(1, Math.min(100, pct));
}
function astroNameCompatibility(name1, name2) {
  // Chaldean name-number harmony — distinct from the love/friendship formulas above
  const n1 = astroNameNumber(name1).reduced, n2 = astroNameNumber(name2).reduced;
  const diff = Math.abs(n1 - n2);
  const harmonyTable = [100, 88, 70, 55, 42, 65, 78, 90, 60]; // indexed by diff 0-8
  const pct = harmonyTable[Math.min(diff, 8)];
  return { n1, n2, pct };
}
function astroLuckyVehicleNumbers(dobStr) {
  const lp = astroLifePathNumber(dobStr);
  if (!lp) return null;
  const friendly = { 1: [1, 2, 9], 2: [2, 7, 9], 3: [3, 6, 9], 4: [4, 5, 8], 5: [4, 5, 6], 6: [3, 5, 6], 7: [2, 7, 9], 8: [4, 8, 9], 9: [1, 3, 9], 11: [1, 2, 9], 22: [4, 8, 9], 33: [3, 6, 9] };
  return { lifePath: lp, digits: friendly[lp] || [lp] };
}

// ---------- moon phase (astronomical, synodic month approximation) ----------
function astroJulianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}
function astroMoonPhase(date) {
  const jd = astroJulianDay(date);
  const knownNewMoonJD = 2451550.1; // 2000-01-06 18:14 UTC, a known new moon
  const synodicMonth = 29.530588861;
  let days = (jd - knownNewMoonJD) % synodicMonth;
  if (days < 0) days += synodicMonth;
  const illum = (1 - Math.cos((2 * Math.PI * days) / synodicMonth)) / 2;
  const phases = [
    { max: 1.84566, name: 'New Moon', icon: '🌑' },
    { max: 5.53699, name: 'Waxing Crescent', icon: '🌒' },
    { max: 9.22831, name: 'First Quarter', icon: '🌓' },
    { max: 12.91963, name: 'Waxing Gibbous', icon: '🌔' },
    { max: 16.61096, name: 'Full Moon', icon: '🌕' },
    { max: 20.30228, name: 'Waning Gibbous', icon: '🌖' },
    { max: 23.99361, name: 'Last Quarter', icon: '🌗' },
    { max: 27.68493, name: 'Waning Crescent', icon: '🌘' },
    { max: synodicMonth + 1, name: 'New Moon', icon: '🌑' },
  ];
  const phase = phases.find((p) => days <= p.max);
  return { days: days.toFixed(1), illumination: Math.round(illum * 100), name: phase.name, icon: phase.icon };
}

// ---------- low-precision solar & lunar ecliptic longitude (Meeus-style, good to ~0.1-0.3 deg) ----------
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
function astroCenturiesSinceJ2000(jd) { return (jd - 2451545.0) / 36525; }

function astroSunLongitude(jd) {
  const T = astroCenturiesSinceJ2000(jd);
  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  const Mr = M * D2R;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  let trueLong = (L0 + C) % 360;
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  return ((apparent % 360) + 360) % 360;
}

function astroMoonLongitude(jd) {
  const T = astroCenturiesSinceJ2000(jd);
  const Lp = 218.3164591 + 481267.88134236 * T - 0.0013268 * T * T;
  const D = (297.8502042 + 445267.1115168 * T - 0.0016300 * T * T) * D2R;
  const M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) * D2R;
  const Mp = (134.9634114 + 477198.8676313 * T + 0.0089970 * T * T) * D2R;
  const F = (93.2720993 + 483202.0175273 * T - 0.0034029 * T * T) * D2R;
  let sumL = 6288774 * Math.sin(Mp) + 1274027 * Math.sin(2 * D - Mp) + 658314 * Math.sin(2 * D)
    + 213618 * Math.sin(2 * Mp) - 185116 * Math.sin(M) - 114332 * Math.sin(2 * F)
    + 58793 * Math.sin(2 * D - 2 * Mp) + 57066 * Math.sin(2 * D - M - Mp) + 53322 * Math.sin(2 * D + Mp)
    + 45758 * Math.sin(2 * D - M) - 40923 * Math.sin(M - Mp) - 34720 * Math.sin(D)
    - 30383 * Math.sin(M + Mp) + 15327 * Math.sin(2 * D - 2 * F) - 12528 * Math.sin(Mp + 2 * F)
    + 10980 * Math.sin(Mp - 2 * F);
  const trueLong = Lp + sumL / 1000000;
  return ((trueLong % 360) + 360) % 360;
}

// Lahiri ayanamsa, linear approximation around J2000 (~23.85 deg in 2000, drifting ~0.01397 deg/yr)
function astroLahiriAyanamsa(year) { return 23.856 + (year - 2000) * 0.013972; }

function astroSiderealLongitude(tropicalLong, year) {
  let s = tropicalLong - astroLahiriAyanamsa(year);
  return ((s % 360) + 360) % 360;
}

function astroTithi(date) {
  const jd = astroJulianDay(date);
  const sunLong = astroSunLongitude(jd), moonLong = astroMoonLongitude(jd);
  let diff = moonLong - sunLong; diff = ((diff % 360) + 360) % 360;
  const index = Math.floor(diff / 12); // 0-29
  const paksha = index < 15 ? 'Shukla Paksha (waxing)' : 'Krishna Paksha (waning)';
  const names = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];
  const nameIdx = index % 15;
  const name = nameIdx === 14 ? (index < 15 ? 'Purnima (Full Moon)' : 'Amavasya (New Moon)') : names[nameIdx];
  return { index, name, paksha, diffDeg: diff };
}

function astroKarana(diffDeg) {
  const num = Math.floor(diffDeg / 6); // 0-59
  const movable = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti (Bhadra)'];
  if (num === 0) return 'Kimstughna';
  if (num === 57) return 'Shakuni';
  if (num === 58) return 'Chatushpada';
  if (num === 59) return 'Naga';
  return movable[(num - 1) % 7];
}

function astroNakshatra(date, year) {
  const jd = astroJulianDay(date);
  const sidereal = astroSiderealLongitude(astroMoonLongitude(jd), year);
  const span = 360 / 27;
  const idx = Math.floor(sidereal / span);
  const pada = Math.floor((sidereal % span) / (span / 4)) + 1;
  return { name: ASTRO_NAKSHATRAS[idx], pada, index: idx };
}

function astroRashi(longitudeTropical, year) {
  const sidereal = astroSiderealLongitude(longitudeTropical, year);
  const idx = Math.floor(sidereal / 30);
  return { name: ASTRO_RASHI_NAMES[idx], index: idx };
}

// ---------- sunrise / sunset (Meeus / NOAA-style sunrise equation) ----------
function astroSunriseSunset(date, lat, lon, tzOffsetHours) {
  const jd = astroJulianDay(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)));
  const T = astroCenturiesSinceJ2000(jd);
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  const sunLong = astroSunLongitude(jd);
  const epsilon = (23.4393 - 0.0130 * T) * D2R;
  const lambda = sunLong * D2R;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const alpha = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * R2D;
  let eot = 4 * (L0 - 0.0057183 - (((alpha % 360) + 360) % 360));
  eot = ((eot + 720) % 1440) - 720; // normalize into roughly [-20, 20] minutes
  const solarNoon = 12 - lon / 15 + tzOffsetHours - eot / 60;
  const latR = lat * D2R;
  const cosH = (Math.sin(-0.833 * D2R) - Math.sin(latR) * Math.sin(decl)) / (Math.cos(latR) * Math.cos(decl));
  const clamped = Math.max(-1, Math.min(1, cosH));
  const H = Math.acos(clamped) * R2D;
  const sunrise = solarNoon - H / 15;
  const sunset = solarNoon + H / 15;
  return { sunrise, sunset, solarNoon, declDeg: decl * R2D };
}
function astroHoursToClock(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const mm2 = mm === 60 ? 0 : mm;
  const hh2 = mm === 60 ? hh + 1 : hh;
  const period = hh2 >= 12 ? 'PM' : 'AM';
  let h12 = hh2 % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm2).padStart(2, '0')} ${period}`;
}

// ---------- Rahu Kaal, Hora, Choghadiya, Shubh Muhurat (rule-based on sunrise/sunset + weekday) ----------
const ASTRO_RAHU_SEGMENT = [7, 1, 6, 4, 5, 3, 2]; // Sun..Sat, 0-indexed 8th-of-day segment
function astroRahuKaal(date, sunrise, sunset) {
  const dow = date.getDay();
  const seg = (sunset - sunrise) / 8;
  const start = sunrise + ASTRO_RAHU_SEGMENT[dow] * seg;
  return { start, end: start + seg };
}

const ASTRO_HORA_TABLE = {
  0: ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'],
  1: ['Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury'],
  2: ['Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter'],
  3: ['Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus'],
  4: ['Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn'],
  5: ['Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun'],
  6: ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'],
};
function astroHoraSequence(date, sunrise, sunset) {
  const dow = date.getDay();
  const order = ASTRO_HORA_TABLE[dow];
  const dayLen = (sunset - sunrise) / 12;
  const nightLen = (24 - (sunset - sunrise)) / 12;
  const horas = [];
  for (let i = 0; i < 12; i++) horas.push({ lord: order[i % 7], start: sunrise + i * dayLen, end: sunrise + (i + 1) * dayLen, period: 'Day' });
  for (let i = 0; i < 12; i++) horas.push({ lord: order[(12 + i) % 7], start: sunset + i * nightLen, end: sunset + (i + 1) * nightLen, period: 'Night' });
  return horas;
}

const ASTRO_CHOGHADIYA_ORDER = ['Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'];
const ASTRO_CHOGHADIYA_QUALITY = { Udveg: 'Inauspicious', Chal: 'Neutral (good for travel)', Labh: 'Auspicious (good for gains)', Amrit: 'Most auspicious', Kaal: 'Inauspicious', Shubh: 'Auspicious', Rog: 'Inauspicious' };
const ASTRO_CHOGHADIYA_DAY_START = [0, 3, 6, 2, 5, 1, 4]; // Sun..Sat, index into ASTRO_CHOGHADIYA_ORDER
const ASTRO_CHOGHADIYA_NIGHT_START = [5, 1, 4, 0, 3, 6, 2];
function astroChoghadiyaSequence(date, sunrise, sunset) {
  const dow = date.getDay();
  const dayLen = (sunset - sunrise) / 8;
  const nightLen = (24 - (sunset - sunrise)) / 8;
  const day = [];
  for (let i = 0; i < 8; i++) {
    const name = ASTRO_CHOGHADIYA_ORDER[(ASTRO_CHOGHADIYA_DAY_START[dow] + i) % 7];
    day.push({ name, quality: ASTRO_CHOGHADIYA_QUALITY[name], start: sunrise + i * dayLen, end: sunrise + (i + 1) * dayLen });
  }
  const night = [];
  for (let i = 0; i < 8; i++) {
    const name = ASTRO_CHOGHADIYA_ORDER[(ASTRO_CHOGHADIYA_NIGHT_START[dow] + i) % 7];
    night.push({ name, quality: ASTRO_CHOGHADIYA_QUALITY[name], start: sunset + i * nightLen, end: sunset + (i + 1) * nightLen });
  }
  return { day, night };
}

function astroShubhMuhurat(sunrise, sunset) {
  const muhuratLen = (sunset - sunrise) / 15;
  const solarNoon = (sunrise + sunset) / 2;
  return { start: solarNoon - muhuratLen / 2, end: solarNoon + muhuratLen / 2 };
}

// ---------- Ascendant / Rising sign — real spherical-trig formula (no planetary ephemeris needed) ----------
function astroAscendant(date, timeStr, lat, lon, tzOffsetHours) {
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh || 0, mm || 0, 0);
  const utcMs = localDate.getTime() - tzOffsetHours * 3600000;
  const utcDate = new Date(utcMs);
  const jd = astroJulianDay(utcDate);
  const T = astroCenturiesSinceJ2000(jd);
  // Greenwich Mean Sidereal Time (deg)
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000;
  gmst = ((gmst % 360) + 360) % 360;
  const lst = ((gmst + lon) % 360 + 360) % 360; // local sidereal time in degrees
  const epsilon = (23.4393 - 0.0130 * T) * D2R;
  const ramc = lst * D2R;
  const latR = lat * D2R;
  const y = -Math.cos(ramc);
  const x = Math.sin(ramc) * Math.cos(epsilon) + Math.tan(latR) * Math.sin(epsilon);
  let asc = Math.atan2(y, x) * R2D;
  asc = ((asc % 360) + 360) % 360;
  const sidereal = astroSiderealLongitude(asc, date.getFullYear());
  const signIdxTropical = Math.floor(asc / 30);
  const signIdxSidereal = Math.floor(sidereal / 30);
  return { tropicalDeg: asc, tropicalSign: ASTRO_ZODIAC[signIdxTropical].name, siderealDeg: sidereal, siderealSign: ASTRO_RASHI_NAMES[signIdxSidereal] };
}

// ---------- deterministic horoscope reading generator ----------
// Not pulled from a live content API (the app's own daily-horoscope feed isn't public) —
// instead a seeded template generator: the same sign + the same day always produces the
// same reading, and it visibly changes sign-to-sign and day-to-day, without pretending to
// be real-time astrological computation the way the tithi/nakshatra tools above are.
function astroSeededRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ASTRO_HOROSCOPE_FRAGMENTS = {
  love: ['a conversation brings you closer to someone who matters', 'patience with a loved one pays off quietly', 'single? a new connection could cross your path', 'an old bond deserves a kind word today', 'romance takes a backseat to self-care, and that is fine'],
  career: ['a pending task finally moves forward', 'a colleague notices your effort — use it', 'this is a good window to pitch a new idea', 'avoid rushing a decision at work today', 'steady, unglamorous effort is what pays off now'],
  money: ['an unexpected expense asks for discipline', 'a good day to review your savings plan', 'avoid lending money on impulse', 'a small gain arrives from an old source', 'budget before you spend on anything big'],
  health: ['your energy runs higher than usual — use it well', 'rest matters more than pushing through today', 'a short walk clears your head better than screen time', 'stay hydrated and keep meals simple', 'stress shows up physically — notice it early'],
  general: ['the stars favour a slower, more deliberate pace', 'trust your instincts over outside opinions today', 'something you have been avoiding is easier than it looks', 'a small shift in routine brings surprising clarity', 'today rewards patience more than ambition'],
};
function astroDayKey(date, period) {
  const y = date.getFullYear();
  if (period === 'yearly') return `${y}`;
  if (period === 'monthly') return `${y}-${date.getMonth() + 1}`;
  if (period === 'weekly') {
    const onejan = new Date(y, 0, 1);
    const week = Math.ceil(((date - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return `${y}-W${week}`;
  }
  return `${y}-${date.getMonth() + 1}-${date.getDate()}`;
}
function astroHoroscopeReading(signName, date, period) {
  const key = `${signName}|${astroDayKey(date, period)}|${period}`;
  const rnd = astroSeededRandom(key);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const meters = {
    love: Math.floor(40 + rnd() * 55),
    career: Math.floor(40 + rnd() * 55),
    health: Math.floor(40 + rnd() * 55),
    money: Math.floor(40 + rnd() * 55),
  };
  const sentence = `${pick(ASTRO_HOROSCOPE_FRAGMENTS.general).replace(/^./, (c) => c.toUpperCase())}. In love, ${pick(ASTRO_HOROSCOPE_FRAGMENTS.love)}. At work, ${pick(ASTRO_HOROSCOPE_FRAGMENTS.career)}. On money, ${pick(ASTRO_HOROSCOPE_FRAGMENTS.money)}. For health, ${pick(ASTRO_HOROSCOPE_FRAGMENTS.health)}.`;
  return { sentence, meters };
}

const ASTRO_CITIES = [
  { name: 'New Delhi', lat: 28.6139, lon: 77.2090 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867 },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Haridwar', lat: 29.9457, lon: 78.1642 },
  { name: 'Rishikesh', lat: 30.0869, lon: 78.2676 },
];
