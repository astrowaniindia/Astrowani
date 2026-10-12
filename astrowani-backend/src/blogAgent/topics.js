// ─────────────────────────────────────────────────────────────────────────────
// What to write about next.
//
// THE CONSTRAINT THAT SHAPES THIS FILE: three articles a day is ~1,100 a year.
// A hand-written list of topics is therefore not a catalogue, it is a countdown —
// and the failure at the end of it is the worst kind, because an agent that has
// run out of ideas does not stop, it starts quietly rewriting last month's post
// under a new title. Duplicate content does not just fail to rank, it drags down
// the pages that were already ranking.
//
// So topics come from two places:
//   1. SEED_TOPICS — ~75 hand-written evergreen articles aimed at keywords people
//      actually search in India. These are the valuable ones and they go first.
//   2. FAMILIES — combinatorial generators (planet x house, sign x life area,
//      number x facet, ...). Lower value individually, but there are thousands,
//      every one a real long-tail query, and they mean the agent cannot run dry.
//
// Every topic carries a STABLE `key`. The key, not the title, is what the
// `blog_agent_runs` ledger remembers, because the model rewrites the title on
// every run while the key identifies the subject. Dedup is on the key.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Categories as they exist in the `categories` table (read from production
 * 2026-10-13). A topic names one; publish.js resolves it to an id. A name that
 * does not resolve publishes with a null category rather than failing — an
 * uncategorised article still ranks, an unpublished one does not.
 */
const CATEGORIES = {
  MARRIAGE: 'Marriage',
  VASTU: 'Vastu',
  PALMISTRY: 'Palmistry',
  VEDIC: 'Vedic Astrology',
  LOVE: 'Love Relationship',
  HEALTH: 'Health',
  BUSINESS: 'Business',
  NUMEROLOGY: 'Numerology',
  CAREER: 'Career',
  TAROT: 'Tarot Reading',
};

// ── 1. The hand-written evergreen set ───────────────────────────────────────
//
// `keyword` is the primary search phrase the article is built around: it goes in
// the title, the slug, the first 100 words, at least one H2, the meta
// description and the image alt text. Keep them as a real person would type them
// into Google, Hinglish and all — "mangal dosh" outranks "Mars affliction" in
// India by an order of magnitude.
const SEED_TOPICS = [
  // Vedic astrology — the highest-volume cluster
  { key: 'shani-sade-sati', title: 'Shani Sade Sati', keyword: 'sade sati', category: CATEGORIES.VEDIC },
  { key: 'mangal-dosh', title: 'Mangal Dosh', keyword: 'mangal dosh', category: CATEGORIES.VEDIC },
  { key: 'kaal-sarp-dosh', title: 'Kaal Sarp Dosh', keyword: 'kaal sarp dosh', category: CATEGORIES.VEDIC },
  { key: 'pitra-dosh', title: 'Pitra Dosh', keyword: 'pitra dosh', category: CATEGORIES.VEDIC },
  { key: 'rahu-kaal', title: 'Rahu Kaal', keyword: 'rahu kaal', category: CATEGORIES.VEDIC },
  { key: 'gajakesari-yoga', title: 'Gajakesari Yoga', keyword: 'gajakesari yoga', category: CATEGORIES.VEDIC },
  { key: 'reading-your-kundali', title: 'How to Read Your Own Kundali', keyword: 'how to read kundali', category: CATEGORIES.VEDIC },
  { key: 'dasha-system', title: 'The Vimshottari Dasha System', keyword: 'vimshottari dasha', category: CATEGORIES.VEDIC },
  { key: 'retrograde-planets', title: 'Retrograde Planets in the Birth Chart', keyword: 'retrograde planets', category: CATEGORIES.VEDIC },
  { key: 'nakshatra-basics', title: 'The 27 Nakshatras Explained', keyword: 'nakshatra', category: CATEGORIES.VEDIC },
  { key: 'ascendant-vs-sun-sign', title: 'Ascendant vs Sun Sign', keyword: 'ascendant vs sun sign', category: CATEGORIES.VEDIC },
  { key: 'navamsa-chart', title: 'The Navamsa Chart (D9)', keyword: 'navamsa chart', category: CATEGORIES.VEDIC },
  { key: 'grah-shanti-puja', title: 'Grah Shanti Puja', keyword: 'grah shanti puja', category: CATEGORIES.VEDIC },
  { key: 'guru-chandal-yoga', title: 'Guru Chandal Yoga', keyword: 'guru chandal yoga', category: CATEGORIES.VEDIC },
  { key: 'shani-remedies', title: 'Saturn Remedies That Actually Help', keyword: 'shani remedies', category: CATEGORIES.VEDIC },
  { key: 'rudraksha-guide', title: 'Choosing the Right Rudraksha', keyword: 'rudraksha', category: CATEGORIES.VEDIC },
  { key: 'gemstone-by-planet', title: 'Which Gemstone Suits Your Planets', keyword: 'astrology gemstone', category: CATEGORIES.VEDIC },
  { key: 'amavasya-purnima', title: 'Amavasya and Purnima', keyword: 'amavasya significance', category: CATEGORIES.VEDIC },
  { key: 'muhurat-basics', title: 'Choosing an Auspicious Muhurat', keyword: 'shubh muhurat', category: CATEGORIES.VEDIC },
  { key: 'panchang-reading', title: 'How to Read the Panchang', keyword: 'panchang', category: CATEGORIES.VEDIC },
  { key: 'shrapit-dosh', title: 'Shrapit Dosh', keyword: 'shrapit dosh', category: CATEGORIES.VEDIC },
  { key: 'chandra-grahan-effects', title: 'What an Eclipse Means for Your Chart', keyword: 'grahan effects astrology', category: CATEGORIES.VEDIC },

  // Marriage — high commercial intent
  { key: 'kundali-milan', title: 'Kundali Milan', keyword: 'kundali milan', category: CATEGORIES.MARRIAGE },
  { key: 'guna-milan-36', title: 'The 36 Gunas of Guna Milan', keyword: 'guna milan', category: CATEGORIES.MARRIAGE },
  { key: 'mangal-dosh-marriage', title: 'Mangal Dosh and Marriage', keyword: 'manglik dosh marriage', category: CATEGORIES.MARRIAGE },
  { key: 'late-marriage-astrology', title: 'Astrological Reasons for Late Marriage', keyword: 'late marriage astrology', category: CATEGORIES.MARRIAGE },
  { key: 'seventh-house-marriage', title: 'The 7th House and Your Marriage', keyword: '7th house marriage', category: CATEGORIES.MARRIAGE },
  { key: 'love-vs-arranged', title: 'Love or Arranged Marriage in Your Chart', keyword: 'love marriage astrology', category: CATEGORIES.MARRIAGE },
  { key: 'marriage-muhurat', title: 'Picking a Marriage Muhurat', keyword: 'marriage muhurat', category: CATEGORIES.MARRIAGE },
  { key: 'nadi-dosh', title: 'Nadi Dosh in Matchmaking', keyword: 'nadi dosh', category: CATEGORIES.MARRIAGE },
  { key: 'second-marriage-astrology', title: 'Second Marriage in the Birth Chart', keyword: 'second marriage astrology', category: CATEGORIES.MARRIAGE },
  { key: 'bhakoot-dosh', title: 'Bhakoot Dosh and When It Is Cancelled', keyword: 'bhakoot dosh', category: CATEGORIES.MARRIAGE },

  // Numerology
  { key: 'life-path-number', title: 'Finding Your Life Path Number', keyword: 'life path number', category: CATEGORIES.NUMEROLOGY },
  { key: 'mulank-bhagyank', title: 'Mulank and Bhagyank', keyword: 'mulank', category: CATEGORIES.NUMEROLOGY },
  { key: 'lucky-number-business', title: 'Your Lucky Number in Business', keyword: 'lucky number for business', category: CATEGORIES.NUMEROLOGY },
  { key: 'name-numerology', title: 'Name Numerology', keyword: 'name numerology', category: CATEGORIES.NUMEROLOGY },
  { key: 'numerology-house-number', title: 'House Number Numerology', keyword: 'house number numerology', category: CATEGORIES.NUMEROLOGY },
  { key: 'master-numbers', title: 'Master Numbers 11, 22 and 33', keyword: 'master number 11', category: CATEGORIES.NUMEROLOGY },
  { key: 'mobile-number-numerology', title: 'Mobile Number Numerology', keyword: 'mobile number numerology', category: CATEGORIES.NUMEROLOGY },
  { key: 'numerology-vs-astrology', title: 'Numerology or Astrology — Which Answers What', keyword: 'numerology vs astrology', category: CATEGORIES.NUMEROLOGY },

  // Palmistry
  { key: 'heart-line', title: 'Reading the Heart Line', keyword: 'heart line palmistry', category: CATEGORIES.PALMISTRY },
  { key: 'fate-line', title: 'Reading the Fate Line', keyword: 'fate line', category: CATEGORIES.PALMISTRY },
  { key: 'life-line', title: 'What the Life Line Really Tells You', keyword: 'life line palmistry', category: CATEGORIES.PALMISTRY },
  { key: 'marriage-line-palm', title: 'The Marriage Line on Your Palm', keyword: 'marriage line palmistry', category: CATEGORIES.PALMISTRY },
  { key: 'mounts-of-palm', title: 'The Mounts of the Palm', keyword: 'mounts in palmistry', category: CATEGORIES.PALMISTRY },
  { key: 'money-lines-palm', title: 'Money Lines in Palmistry', keyword: 'money line palmistry', category: CATEGORIES.PALMISTRY },
  { key: 'hand-shapes', title: 'What Your Hand Shape Says About You', keyword: 'hand shape palmistry', category: CATEGORIES.PALMISTRY },
  { key: 'head-line', title: 'The Head Line and How You Think', keyword: 'head line palmistry', category: CATEGORIES.PALMISTRY },

  // Vastu
  { key: 'vastu-main-door', title: 'Vastu for the Main Door', keyword: 'main door vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-kitchen', title: 'Vastu for the Kitchen', keyword: 'kitchen vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-bedroom', title: 'Vastu for the Bedroom', keyword: 'bedroom vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-mandir', title: 'Vastu for the Home Temple', keyword: 'puja room vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-money-plant', title: 'Where to Keep a Money Plant', keyword: 'money plant vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-mirror', title: 'Mirror Placement in Vastu', keyword: 'mirror vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-dosh-remedies', title: 'Vastu Dosh Remedies Without Breaking Walls', keyword: 'vastu dosh remedy', category: CATEGORIES.VASTU },
  { key: 'vastu-office-desk', title: 'Vastu for Your Office Desk', keyword: 'office vastu', category: CATEGORIES.VASTU },
  { key: 'vastu-plot-selection', title: 'Choosing a Plot by Vastu', keyword: 'plot vastu', category: CATEGORIES.VASTU },

  // Career & business
  { key: 'tenth-house-career', title: 'The 10th House and Your Career', keyword: '10th house career', category: CATEGORIES.CAREER },
  { key: 'job-vs-business', title: 'Job or Business — What Your Chart Says', keyword: 'job or business astrology', category: CATEGORIES.CAREER },
  { key: 'government-job-astrology', title: 'Government Job in Astrology', keyword: 'government job astrology', category: CATEGORIES.CAREER },
  { key: 'foreign-settlement', title: 'Foreign Settlement in the Birth Chart', keyword: 'foreign settlement astrology', category: CATEGORIES.CAREER },
  { key: 'career-change-timing', title: 'The Right Time to Change Jobs', keyword: 'career change astrology', category: CATEGORIES.CAREER },
  { key: 'business-partnership-astrology', title: 'Choosing a Business Partner by Chart', keyword: 'business partnership astrology', category: CATEGORIES.BUSINESS },
  { key: 'muhurat-new-business', title: 'Muhurat for Starting a Business', keyword: 'business muhurat', category: CATEGORIES.BUSINESS },
  { key: 'wealth-yogas', title: 'Dhan Yogas — Wealth in the Chart', keyword: 'dhan yoga', category: CATEGORIES.BUSINESS },
  { key: 'shop-name-numerology', title: 'Naming Your Shop or Brand', keyword: 'business name numerology', category: CATEGORIES.BUSINESS },

  // Love & relationships
  { key: 'venus-in-love', title: 'What Venus Says About Your Love Life', keyword: 'venus astrology love', category: CATEGORIES.LOVE },
  { key: 'fifth-house-romance', title: 'The 5th House and Romance', keyword: '5th house love', category: CATEGORIES.LOVE },
  { key: 'zodiac-compatibility', title: 'Zodiac Sign Compatibility', keyword: 'zodiac compatibility', category: CATEGORIES.LOVE },
  { key: 'breakup-astrology', title: 'Why Relationships End — an Astrological View', keyword: 'breakup astrology', category: CATEGORIES.LOVE },
  { key: 'twin-flame-astrology', title: 'Soulmates and Twin Flames in Astrology', keyword: 'soulmate astrology', category: CATEGORIES.LOVE },
  { key: 'long-distance-astrology', title: 'Long-Distance Relationships in the Chart', keyword: 'long distance relationship astrology', category: CATEGORIES.LOVE },

  // Tarot
  { key: 'tarot-major-arcana', title: 'The Major Arcana Explained', keyword: 'major arcana', category: CATEGORIES.TAROT },
  { key: 'three-card-spread', title: 'The Three-Card Tarot Spread', keyword: 'three card tarot', category: CATEGORIES.TAROT },
  { key: 'tarot-vs-astrology', title: 'Tarot or Astrology — Which to Ask', keyword: 'tarot vs astrology', category: CATEGORIES.TAROT },
  { key: 'reversed-cards', title: 'Reading Reversed Tarot Cards', keyword: 'reversed tarot cards', category: CATEGORIES.TAROT },
  { key: 'tarot-yes-no', title: 'Yes/No Tarot Readings', keyword: 'yes no tarot', category: CATEGORIES.TAROT },

  // Health — wellbeing framing ONLY. quality.js blocks medical claims outright;
  // CLAUDE.md fc964c0 records health claims being reworded across Wani Shop for
  // exactly this reason, and a blog is not a safer place to make them.
  { key: 'sixth-house-health', title: 'The 6th House and Everyday Wellbeing', keyword: '6th house health astrology', category: CATEGORIES.HEALTH },
  { key: 'moon-and-mind', title: 'The Moon, Sleep and a Calm Mind', keyword: 'moon astrology mind', category: CATEGORIES.HEALTH },
  { key: 'yoga-for-planets', title: 'Daily Routines for a Restless Chart', keyword: 'astrology daily routine', category: CATEGORIES.HEALTH },
];

// ── 2. The combinatorial families ───────────────────────────────────────────

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const PLANET_HI = {
  Sun: 'Surya', Moon: 'Chandra', Mars: 'Mangal', Mercury: 'Budh', Jupiter: 'Guru',
  Venus: 'Shukra', Saturn: 'Shani', Rahu: 'Rahu', Ketu: 'Ketu',
};
const HOUSES = [
  [1, 'self and personality'], [2, 'money and family'], [3, 'siblings and courage'],
  [4, 'home and mother'], [5, 'children and creativity'], [6, 'obstacles and routine'],
  [7, 'marriage and partnership'], [8, 'change and the unexpected'], [9, 'luck and dharma'],
  [10, 'career and status'], [11, 'gains and friendships'], [12, 'loss and travel'],
];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const SIGN_HI = {
  Aries: 'Mesh', Taurus: 'Vrishabha', Gemini: 'Mithun', Cancer: 'Kark', Leo: 'Simha', Virgo: 'Kanya',
  Libra: 'Tula', Scorpio: 'Vrishchik', Sagittarius: 'Dhanu', Capricorn: 'Makar', Aquarius: 'Kumbh', Pisces: 'Meen',
};
const LIFE_AREAS = [
  ['career', CATEGORIES.CAREER], ['marriage', CATEGORIES.MARRIAGE], ['money', CATEGORIES.BUSINESS],
  ['love life', CATEGORIES.LOVE], ['family life', CATEGORIES.VEDIC],
];
const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha',
  'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];
const VASTU_ROOMS = [
  'living room', 'staircase', 'bathroom', 'study room', 'balcony', 'kitchen sink',
  'water tank', 'main gate', 'kids room', 'guest room',
];
const DIRECTIONS = ['north-east', 'south-west', 'north-west', 'south-east', 'north', 'south', 'east', 'west'];
const TAROT_CARDS = [
  'Fool', 'Magician', 'High Priestess', 'Empress', 'Emperor', 'Hierophant', 'Lovers', 'Chariot',
  'Strength', 'Hermit', 'Wheel of Fortune', 'Justice', 'Hanged Man', 'Death', 'Temperance',
  'Devil', 'Tower', 'Star', 'Moon Card', 'Sun Card', 'Judgement', 'World',
  'Ace of Cups', 'Ace of Wands', 'Ace of Swords', 'Ace of Pentacles',
  'Two of Cups', 'Three of Swords', 'Four of Wands', 'Five of Pentacles', 'Six of Cups',
  'Seven of Wands', 'Eight of Swords', 'Nine of Pentacles', 'Ten of Cups',
  'Page of Wands', 'Knight of Cups', 'Queen of Swords', 'King of Pentacles',
];
const REMEDY_KINDS = [
  ['mantra', CATEGORIES.VEDIC], ['gemstone', CATEGORIES.VEDIC],
  ['daan and fasting', CATEGORIES.VEDIC], ['puja', CATEGORIES.VEDIC],
];

/**
 * Each family is a lazy product: `count` is how many distinct topics it can make,
 * `at(i)` builds the i-th. Nothing is materialised, so the catalogue costs no
 * memory however large it grows.
 */
const FAMILIES = [
  {
    name: 'planet-in-house',
    count: PLANETS.length * HOUSES.length,
    at(i) {
      const p = PLANETS[i % PLANETS.length];
      const [h, theme] = HOUSES[Math.floor(i / PLANETS.length) % HOUSES.length];
      return {
        key: `planet-house:${p}:${h}`,
        title: `${p} in the ${ordinal(h)} House`,
        keyword: `${PLANET_HI[p].toLowerCase()} in ${ordinal(h)} house`,
        category: CATEGORIES.VEDIC,
        angle: `what ${p} (${PLANET_HI[p]}) placed in the ${ordinal(h)} house means for ${theme}`,
      };
    },
  },
  {
    name: 'sign-life-area',
    count: SIGNS.length * LIFE_AREAS.length,
    at(i) {
      const s = SIGNS[i % SIGNS.length];
      const [area, cat] = LIFE_AREAS[Math.floor(i / SIGNS.length) % LIFE_AREAS.length];
      return {
        key: `sign-area:${s}:${area}`,
        title: `${s} and ${titleCase(area)}`,
        keyword: `${SIGN_HI[s].toLowerCase()} ${area}`,
        category: cat,
        angle: `how someone with a ${s} (${SIGN_HI[s]}) moon or ascendant typically experiences ${area}`,
      };
    },
  },
  {
    name: 'nakshatra',
    count: NAKSHATRAS.length,
    at(i) {
      const n = NAKSHATRAS[i % NAKSHATRAS.length];
      return {
        key: `nakshatra:${n}`,
        title: `${n} Nakshatra`,
        keyword: `${n.toLowerCase()} nakshatra`,
        category: CATEGORIES.VEDIC,
        angle: `the character, ruling planet, strengths, cautions and suitable careers of ${n} nakshatra`,
      };
    },
  },
  {
    name: 'vastu-room-direction',
    count: VASTU_ROOMS.length * DIRECTIONS.length,
    at(i) {
      const r = VASTU_ROOMS[i % VASTU_ROOMS.length];
      const d = DIRECTIONS[Math.floor(i / VASTU_ROOMS.length) % DIRECTIONS.length];
      return {
        key: `vastu:${r}:${d}`,
        title: `${titleCase(r)} in the ${d.toUpperCase()} — Vastu`,
        keyword: `${r} vastu direction`,
        category: CATEGORIES.VASTU,
        angle: `whether the ${d} is right for a ${r}, what it affects day to day, and what to do when the house is already built that way`,
      };
    },
  },
  {
    name: 'numerology-number',
    count: 9 * 4,
    at(i) {
      const n = (i % 9) + 1;
      const facets = [
        ['personality', CATEGORIES.NUMEROLOGY], ['career', CATEGORIES.CAREER],
        ['relationships', CATEGORIES.LOVE], ['lucky days and colours', CATEGORIES.NUMEROLOGY],
      ];
      const [facet, cat] = facets[Math.floor(i / 9) % facets.length];
      return {
        key: `numerology:${n}:${facet}`,
        title: `Mulank ${n} and ${titleCase(facet)}`,
        keyword: `mulank ${n} ${facet}`,
        category: cat,
        angle: `what driver number (mulank) ${n} means for ${facet}`,
      };
    },
  },
  {
    name: 'planet-in-sign',
    count: PLANETS.length * SIGNS.length,
    at(i) {
      const p = PLANETS[i % PLANETS.length];
      const s = SIGNS[Math.floor(i / PLANETS.length) % SIGNS.length];
      return {
        key: `planet-sign:${p}:${s}`,
        title: `${p} in ${s}`,
        keyword: `${PLANET_HI[p].toLowerCase()} in ${SIGN_HI[s].toLowerCase()}`,
        category: CATEGORIES.VEDIC,
        angle: `how ${p} (${PLANET_HI[p]}) behaves when it sits in ${s} (${SIGN_HI[s]}) — strengths, friction, and what it changes in daily life`,
      };
    },
  },
  {
    // The deepest family on purpose: 9 x 12 x 12 = 1,296. "mangal in 7th house in
    // mesh" is how people actually search once they have their chart in hand, and
    // each combination is a genuinely different reading rather than a reskin.
    name: 'planet-house-sign',
    count: PLANETS.length * HOUSES.length * SIGNS.length,
    at(i) {
      const p = PLANETS[i % PLANETS.length];
      const [h, theme] = HOUSES[Math.floor(i / PLANETS.length) % HOUSES.length];
      const s = SIGNS[Math.floor(i / (PLANETS.length * HOUSES.length)) % SIGNS.length];
      return {
        key: `phs:${p}:${h}:${s}`,
        title: `${p} in the ${ordinal(h)} House in ${s}`,
        keyword: `${PLANET_HI[p].toLowerCase()} in ${ordinal(h)} house ${SIGN_HI[s].toLowerCase()}`,
        category: CATEGORIES.VEDIC,
        angle: `${p} (${PLANET_HI[p]}) in the ${ordinal(h)} house with ${s} (${SIGN_HI[s]}) on it — what it does to ${theme}, and the remedies that suit this exact placement`,
      };
    },
  },
  {
    name: 'house-lord-placement',
    count: HOUSES.length * HOUSES.length,
    at(i) {
      const [a] = HOUSES[i % HOUSES.length];
      const [b, theme] = HOUSES[Math.floor(i / HOUSES.length) % HOUSES.length];
      return {
        key: `lord:${a}:${b}`,
        title: `${ordinal(a)} House Lord in the ${ordinal(b)} House`,
        keyword: `${a}th house lord in ${b}th house`,
        category: CATEGORIES.VEDIC,
        angle: `what happens when the lord of the ${ordinal(a)} house sits in the ${ordinal(b)} house of ${theme}`,
      };
    },
  },
  {
    name: 'planet-conjunction',
    // Unordered pairs, i < j. Enumerated by walking the triangle so each pair
    // appears exactly once — an ordered product would produce "Sun with Moon"
    // and "Moon with Sun" as two articles about one subject.
    count: (PLANETS.length * (PLANETS.length - 1)) / 2,
    at(i) {
      let a = 0; let rem = i;
      while (rem >= PLANETS.length - 1 - a) { rem -= PLANETS.length - 1 - a; a += 1; }
      const b = a + 1 + rem;
      const p = PLANETS[a]; const q = PLANETS[b];
      return {
        key: `conj:${p}:${q}`,
        title: `${p} and ${q} Together`,
        keyword: `${PLANET_HI[p].toLowerCase()} ${PLANET_HI[q].toLowerCase()} conjunction`,
        category: CATEGORIES.VEDIC,
        angle: `the ${p}-${q} (${PLANET_HI[p]}-${PLANET_HI[q]}) conjunction: the yoga it forms, how it actually shows up in a life, and its remedies`,
      };
    },
  },
  {
    name: 'dasha-pair',
    count: PLANETS.length * PLANETS.length,
    at(i) {
      const maha = PLANETS[i % PLANETS.length];
      const antar = PLANETS[Math.floor(i / PLANETS.length) % PLANETS.length];
      return {
        key: `dasha:${maha}:${antar}`,
        title: `${maha} Mahadasha with ${antar} Antardasha`,
        keyword: `${PLANET_HI[maha].toLowerCase()} mahadasha ${PLANET_HI[antar].toLowerCase()} antardasha`,
        category: CATEGORIES.VEDIC,
        angle: `what the ${antar} antardasha inside a ${maha} mahadasha typically brings, and how to use the period well`,
      };
    },
  },
  {
    name: 'sign-compatibility',
    count: SIGNS.length * SIGNS.length,
    at(i) {
      const a = SIGNS[i % SIGNS.length];
      const b = SIGNS[Math.floor(i / SIGNS.length) % SIGNS.length];
      return {
        key: `compat:${a}:${b}`,
        title: `${a} and ${b} Compatibility`,
        keyword: `${SIGN_HI[a].toLowerCase()} ${SIGN_HI[b].toLowerCase()} compatibility`,
        category: CATEGORIES.LOVE,
        angle: `how ${a} (${SIGN_HI[a]}) and ${b} (${SIGN_HI[b]}) get along in love and marriage — what works, what grates, and what to watch`,
      };
    },
  },
  {
    name: 'nakshatra-pada',
    count: NAKSHATRAS.length * 4,
    at(i) {
      const n = NAKSHATRAS[i % NAKSHATRAS.length];
      const pada = (Math.floor(i / NAKSHATRAS.length) % 4) + 1;
      return {
        key: `pada:${n}:${pada}`,
        title: `${n} Nakshatra, Pada ${pada}`,
        keyword: `${n.toLowerCase()} nakshatra ${pada} pada`,
        category: CATEGORIES.VEDIC,
        angle: `what being born in pada ${pada} of ${n} nakshatra adds over the nakshatra alone`,
      };
    },
  },
  {
    name: 'tarot-card',
    count: TAROT_CARDS.length,
    at(i) {
      const c = TAROT_CARDS[i % TAROT_CARDS.length];
      return {
        key: `tarot:${c}`,
        title: `The ${c} Tarot Card`,
        keyword: `${c.toLowerCase()} tarot card meaning`,
        category: CATEGORIES.TAROT,
        angle: `the upright and reversed meaning of ${c}, and what it tends to say about love, work and money`,
      };
    },
  },
  {
    name: 'remedy-by-planet',
    count: PLANETS.length * REMEDY_KINDS.length,
    at(i) {
      const p = PLANETS[i % PLANETS.length];
      const [kind, cat] = REMEDY_KINDS[Math.floor(i / PLANETS.length) % REMEDY_KINDS.length];
      return {
        key: `remedy:${p}:${kind}`,
        title: `${titleCase(kind)} for ${p}`,
        keyword: `${PLANET_HI[p].toLowerCase()} ${kind}`,
        category: cat,
        angle: `the traditional ${kind} used to settle ${p} (${PLANET_HI[p]}), how they are done, and who they suit`,
      };
    },
  },
];

const FAMILY_TOTAL = FAMILIES.reduce((n, f) => n + f.count, 0);

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function titleCase(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The i-th combinatorial topic, across all families. */
function familyTopic(i) {
  let n = ((i % FAMILY_TOTAL) + FAMILY_TOTAL) % FAMILY_TOTAL;
  for (const f of FAMILIES) {
    if (n < f.count) return { ...f.at(n), family: f.name };
    n -= f.count;
  }
  /* istanbul ignore next — unreachable: n < FAMILY_TOTAL by construction */
  return null;
}

/**
 * How many distinct topics exist in total. The CLI prints this so "will this run
 * dry?" is an answerable question rather than a hope.
 */
function catalogueSize() {
  return {
    seeds: SEED_TOPICS.length,
    generated: FAMILY_TOTAL,
    total: SEED_TOPICS.length + FAMILY_TOTAL,
  };
}

/**
 * Pick `count` topics that have not been used yet.
 *
 * SEEDS FIRST, in a stable order: they are the ones with real search volume, so
 * the agent should spend its first months on them rather than scattering them
 * randomly among long-tail combinations.
 *
 * In the generated set the offset comes from how many topics have already been
 * used, NOT from Math.random(). A random walk over a large space revisits far
 * sooner than intuition suggests (the birthday problem), and every revisit is a
 * wasted Gemini call plus a wasted run slot; walking in order visits each topic
 * exactly once. The stride is coprime with the total so consecutive articles are
 * not all from one family — three Vastu-direction posts on the same day reads
 * like a glitch even when each is individually fine.
 *
 * `usedKeys` is a Set of keys already seen. Used topics are skipped, which is
 * what makes this safe to call with a stale offset after a failed run.
 */
function pickTopics(count, usedKeys = new Set(), opts = {}) {
  const out = [];
  const seen = new Set();

  for (const t of SEED_TOPICS) {
    if (out.length >= count) break;
    if (usedKeys.has(t.key) || seen.has(t.key)) continue;
    seen.add(t.key);
    out.push({ ...t, source: 'seed' });
  }
  if (out.length >= count) return out;

  const used = opts.usedCount == null ? usedKeys.size : opts.usedCount;
  // 7919 is prime, so gcd(STRIDE, FAMILY_TOTAL) === 1 for every realistic total
  // and the walk has full period rather than falling into a short orbit.
  const STRIDE = 7919;
  let probes = 0;
  while (out.length < count && probes < FAMILY_TOTAL) {
    const t = familyTopic((used + probes) * STRIDE);
    probes += 1;
    if (!t || usedKeys.has(t.key) || seen.has(t.key)) continue;
    seen.add(t.key);
    out.push({ ...t, source: 'generated' });
  }
  return out;
}

module.exports = {
  CATEGORIES,
  SEED_TOPICS,
  FAMILIES,
  pickTopics,
  catalogueSize,
  familyTopic,
  ordinal,
  titleCase,
};
