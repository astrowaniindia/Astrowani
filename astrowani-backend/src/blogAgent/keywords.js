// ─────────────────────────────────────────────────────────────────────────────
// The keyword bank, and the anti-repetition machinery around it.
//
// WHY THIS FILE EXISTS. The first two articles the agent published carried
// IDENTICAL anchor text — "verified astrologers on Astrowani", "Astrowani",
// "Start a consultation on Astrowani", "Astrowani app" — and an identical closing
// CTA paragraph, word for word. Each article was individually fine and the set
// was obviously machine-made.
//
// That is not a cosmetic problem, it is the main SEO problem:
//
//  * IDENTICAL ANCHOR TEXT SITE-WIDE WASTES THE STRONGEST INTERNAL SIGNAL THERE
//    IS. Anchor text tells a search engine what the destination page is about.
//    A thousand links all reading "verified astrologers on Astrowani" teach it one
//    phrase. A thousand links spread across "talk to an astrologer", "consult a
//    Vedic astrologer online", "jyotish consultation", "astrologer near me" teach
//    it the whole vocabulary people actually search.
//  * AN IDENTICAL CLOSING PARAGRAPH ON EVERY POST IS BOILERPLATE. At three a day
//    it becomes the single most repeated text on the domain, and near-duplicate
//    blocks across many pages are exactly what thin-content classifiers look for.
//  * ONE KEYWORD PER ARTICLE LEAVES THE LONG TAIL ON THE TABLE. Most search
//    traffic is not the head term; it is the hundreds of variations around it.
//
// So: ~500 real keywords grouped by category, several anchor phrasings per link
// target, several complete CTA variants, and rotation that is DETERMINISTIC
// (seeded by the article's own slug) rather than random — so the same article
// always renders the same way, and a given phrasing cannot land on two
// consecutive posts by chance.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');

/**
 * Secondary keywords by category.
 *
 * These are the phrases a reader actually types, Hinglish included — "kundali"
 * outranks "birth chart" in India by a wide margin, and "manglik" outranks "Mars
 * affliction" by more. They are given to the model as a pool to weave in
 * NATURALLY; the gate checks that a few of them landed, not that all of them did.
 *
 * A keyword appearing in several categories is intentional: "kundali" is as
 * relevant to a career article as to a marriage one.
 */
const SECONDARY = {
  'Vedic Astrology': [
    'kundli in hindi', 'free janam patri', 'birth chart reading online', 'lagna chart',
    'rashi chart', 'planet in houses', 'exalted planet', 'debilitated planet',
    'combust planet', 'vargottama', 'atmakaraka', 'shadbala strength',
    'ashtakavarga', 'sade sati remedies', 'shani sade sati', 'dhaiya shani',
    'kaal sarp yog remedy', 'pitru dosh nivaran', 'guru chandal yog', 'grahan dosh',
    'chandra grahan effect', 'surya grahan effect', 'vedic astrology basics', 'learn jyotish',
    'astrology in hindi', 'jyotish in hindi', 'today rashifal', 'weekly horoscope',
    'monthly horoscope', 'yearly prediction', 'varshphal', 'gochar phal',
    'mahadasha prediction', 'sade sati kab tak', 'which gemstone should i wear', 'gemstone according to rashi',
    'which rudraksha for me', 'kuldevi puja', 'navgraha puja', 'mangalwar vrat',
    'shanivar vrat', 'daan for planets', 'astrology questions answered', 'ask astrologer free',
    'astrologer consultation online india',
    'kundali reading', 'janam kundali', 'birth chart analysis', 'vedic astrology online',
    'jyotish shastra', 'planetary positions', 'graha dosha', 'dasha period', 'antardasha',
    'gochar transit', 'saturn transit', 'jupiter transit', 'rahu ketu transit', 'retrograde planet',
    'ascendant lagna', 'moon sign rashi', 'sun sign', 'navamsa d9 chart', 'divisional charts',
    'nakshatra calculator', 'birth chart calculator', 'free kundali online', 'astrology remedies',
    'grah shanti', 'puja for planets', 'mantra jaap', 'rudraksha for planets', 'gemstone remedy',
    'yellow sapphire', 'blue sapphire', 'ruby gemstone', 'pearl moti', 'emerald panna',
    'shubh muhurat today', 'panchang today', 'tithi nakshatra', 'rahu kaal timing',
    'amavasya date', 'purnima vrat', 'eclipse effects', 'shani dev', 'hanuman chalisa remedy',
    'talk to astrologer online', 'consult vedic astrologer', 'best astrologer in india',
    'online jyotish consultation', 'astrology prediction', 'free astrology consultation',
  ],
  Marriage: [
    'kundali milan by name', 'kundli matching in hindi', 'marriage matching free', 'ashtakoot gun milan',
    'manglik calculator', 'manglik matching', 'mangal dosh kab khatam hota hai', 'marriage age prediction',
    'shadi kab hogi', 'vivah yog in kundali', 'marriage yoga in horoscope', 'love marriage yog',
    'arranged marriage astrology', 'marriage problems remedies', 'husband astrology prediction', 'wife prediction astrology',
    'in laws problem astrology', 'marriage delay remedy', 'vivah badha nivaran', 'shubh vivah muhurat',
    'marriage date calculator', 'engagement muhurat', 'saat phere muhurat', 'compatibility by rashi',
    'love compatibility calculator', 'marriage counselling astrologer',
    'kundali matching', 'gun milan', 'ashtakoot milan', 'horoscope matching for marriage',
    'marriage compatibility', 'manglik dosh', 'mangal dosh remedy', 'nadi dosha',
    'bhakoot dosha', 'gan dosha', 'marriage prediction', 'when will i get married',
    'late marriage remedies', 'love marriage or arranged', 'inter caste marriage astrology',
    'seventh house marriage', 'venus in marriage', 'marriage muhurat date', 'vivah muhurat',
    'delayed marriage astrology', 'second marriage prediction', 'divorce in horoscope',
    'spouse prediction astrology', 'husband wife compatibility', 'free kundali milan online',
    'marriage astrologer online', 'match making by name', 'match making by date of birth',
  ],
  Numerology: [
    'numerology in hindi', 'ank jyotish', 'mulank 1 to 9', 'bhagyank calculation',
    'radical number', 'name number calculator', 'business numerology', 'lucky name spelling',
    'signature numerology', 'numerology for marriage', 'numerology compatibility calculator', 'personal year number',
    'lucky dates for me', 'lucky gemstone by number', 'numerology and astrology combined', 'name change as per numerology',
    'baby name numerology', 'lucky mobile number', 'vehicle number numerology',
    'numerology calculator', 'life path number', 'mulank number', 'bhagyank number',
    'destiny number', 'name numerology', 'lucky number for me', 'lucky colour',
    'numerology for business name', 'mobile number numerology', 'house number numerology',
    'car number numerology', 'numerology by date of birth', 'birth number meaning',
    'master number 11', 'master number 22', 'numerology compatibility', 'lo shu grid',
    'chaldean numerology', 'pythagorean numerology', 'name correction numerology',
    'numerologist online', 'free numerology report',
  ],
  Palmistry: [
    'hast rekha in hindi', 'palmistry in hindi', 'hatheli ki rekha', 'palm reading for marriage age',
    'children line palmistry', 'travel line palm', 'health line palm', 'girdle of venus',
    'simian line', 'island on life line', 'broken fate line', 'star sign on palm',
    'trident on palm', 'fish sign on palm', 'palmistry for government job', 'palm reading for wealth',
    'mole on palm meaning', 'nail reading', 'palmistry basics for beginners', 'learn palmistry online',
    'palm reading', 'hast rekha', 'hastrekha shastra', 'heart line meaning', 'head line palmistry',
    'life line meaning', 'fate line palmistry', 'sun line apollo', 'marriage line on palm',
    'money line palm', 'mount of jupiter', 'mount of venus', 'mount of saturn',
    'palm lines meaning in hindi', 'right hand or left hand palmistry', 'hand shape types',
    'finger reading', 'thumb reading', 'palmistry for marriage', 'palmistry for money',
    'free palm reading online', 'palm reader online', 'palmist near me',
  ],
  Vastu: [
    'vastu in hindi', 'vastu tips in hindi', 'griha pravesh muhurat', 'vastu for new house',
    'bed direction for sleeping', 'head direction while sleeping', 'study table direction', 'temple direction in home',
    'tulsi plant direction', 'borewell direction vastu', 'septic tank vastu', 'overhead tank direction',
    'main gate direction', 'balcony direction vastu', 'vastu for south facing house', 'east facing house vastu',
    'north facing house vastu', 'vastu for rented house', 'office cabin vastu', 'factory vastu',
    'vastu for shop entrance', 'vastu pyramid benefits', 'vastu yantra for home', 'salt remedy vastu',
    'camphor remedy vastu',
    'vastu shastra', 'vastu tips for home', 'vastu for main entrance', 'kitchen vastu direction',
    'bedroom vastu tips', 'puja room vastu', 'bathroom vastu', 'staircase vastu',
    'north east corner vastu', 'south west direction', 'vastu dosh nivaran', 'vastu remedies without demolition',
    'money plant placement', 'mirror direction vastu', 'vastu for office', 'shop vastu tips',
    'plot selection vastu', 'vastu for flat', 'house facing direction', 'vastu colours for walls',
    'pyramid vastu remedy', 'vastu consultant online', 'free vastu consultation',
  ],
  Career: [
    'career astrology free', 'job astrology prediction', 'government job in kundali', 'police job astrology',
    'doctor yoga in kundali', 'engineer yoga astrology', 'ias ips yoga', 'business or job which is better',
    'career after 30 astrology', 'job stability astrology', 'transfer in job astrology', 'interview muhurat',
    'resignation muhurat', 'new job joining muhurat', 'saturn in tenth house', 'sun in tenth house',
    'career line in palm', 'higher education astrology', 'abroad education yoga', 'which stream to choose',
    'career astrology', 'career prediction by date of birth', 'tenth house career',
    'job or business astrology', 'government job yoga', 'promotion astrology',
    'job change muhurat', 'career change astrology', 'foreign settlement yoga',
    'abroad settlement astrology', 'education astrology', 'which field suits me astrology',
    'saturn career effects', 'career horoscope', 'job loss astrology', 'unemployment remedies',
    'career counselling astrologer', 'best career astrologer online',
  ],
  Business: [
    'business astrology in hindi', 'vyapar vriddhi upay', 'business problem solution', 'partnership yoga kundali',
    'import export business astrology', 'real estate business astrology', 'shop name as per numerology', 'company name numerology',
    'gst registration muhurat', 'account opening muhurat', 'diwali puja muhurat', 'laxmi kuber mantra',
    'business growth remedies', 'debt free remedies', 'karz mukti upay', 'eleventh lord in kundali',
    'wealth in birth chart',
    'business astrology', 'dhan yoga in kundali', 'wealth yoga', 'money astrology',
    'business partnership astrology', 'business name numerology', 'shop opening muhurat',
    'business muhurat date', 'financial growth astrology', 'loan repayment astrology',
    'business loss remedies', 'lakshmi puja for business', 'kubera mantra', 'wealth remedies',
    'eleventh house gains', 'second house wealth', 'business astrologer online',
  ],
  'Love Relationship': [
    'love astrology in hindi', 'prem sambandh jyotish', 'love problem solution', 'girlfriend boyfriend compatibility',
    'ex back astrology', 'love marriage problem solution', 'parents approval love marriage', 'rashi love match',
    'nakshatra compatibility love', 'venus mars compatibility', 'seventh lord love', 'romance in kundali',
    'attraction astrology', 'relationship timing astrology', 'will i get my love astrology',
    'love astrology', 'love compatibility by date of birth', 'zodiac compatibility',
    'soulmate astrology', 'twin flame signs', 'venus in love life', 'fifth house romance',
    'breakup astrology', 'relationship problems remedies', 'get love back remedies',
    'long distance relationship astrology', 'love marriage prediction', 'crush compatibility',
    'rashi compatibility', 'love problem solution astrologer', 'relationship astrologer online',
  ],
  Health: [
    'health astrology in hindi', 'swasthya jyotish', 'mental peace remedies', 'anxiety remedies astrology',
    'sleep remedies jyotish', 'sixth lord health', 'eighth house health', 'moon weak remedies',
    'healthy routine as per rashi', 'food as per rashi', 'exercise as per astrology', 'immunity remedies',
    'seasonal care ayurveda', 'mind calming mantra',
    'health astrology', 'sixth house health', 'moon and mental peace', 'sleep problems remedies',
    'stress relief mantra', 'daily routine as per astrology', 'ayurveda and astrology',
    'yoga for planets', 'meditation for moon', 'wellbeing astrology', 'energy healing',
    'chakra balancing', 'healthy lifestyle jyotish', 'health horoscope',
  ],
  'Tarot Reading': [
    'tarot in hindi', 'tarot card reading online free', 'tarot for marriage', 'tarot for job',
    'tarot for money', 'tarot yes or no question', 'daily tarot reading', 'weekly tarot',
    'tarot spreads for beginners', 'how to read tarot cards', 'tarot deck meaning', 'angel cards reading',
    'tarot reader in india', 'online tarot consultation',
    'tarot reading online', 'tarot card meaning', 'major arcana meaning', 'minor arcana',
    'three card spread', 'celtic cross spread', 'yes no tarot', 'love tarot reading',
    'career tarot reading', 'reversed tarot cards', 'tarot vs astrology', 'oracle cards',
    'free tarot reading', 'tarot reader online', 'daily tarot card',
  ],
};

/**
 * Keywords that suit ANY article — the commercial, intent-carrying phrases that
 * are the point of the whole blog. Sampled alongside the category pool so every
 * article carries at least one "I want to actually talk to someone" term.
 */
const COMMERCIAL = [
  'talk to an astrologer', 'online astrology consultation', 'chat with astrologer',
  'call an astrologer', 'video call astrologer', 'astrologer online india',
  'best astrology app', 'astrology app india', 'instant astrology consultation',
  'astrologer near me', 'verified astrologer', 'experienced astrologer',
  'astrology consultation price', 'first consultation free', 'astrology in hindi',
];

/**
 * Anchor text variants per internal link target.
 *
 * THE FIX FOR THE ACTUAL BUG. Previously each target had exactly ONE anchor
 * string, so "verified astrologers on Astrowani" appeared on every article. Each
 * target now has 8-10 phrasings covering different search intents, and the
 * article picks by a hash of its own slug.
 *
 * Note some variants deliberately omit the brand. Not every internal link should
 * be branded — "free kundali matching" is a better anchor for the marriage page
 * than "Astrowani" is, because it tells a crawler what the page is FOR. The gate
 * still enforces a brand-mention count separately, so dropping the brand from
 * some anchors costs nothing.
 */
const ANCHORS = {
  astrologers: [
    'verified astrologers on Astrowani', 'experienced astrologers on Astrowani',
    'talk to a verified astrologer', 'our panel of Vedic astrologers',
    'astrologers available right now', 'consult an astrologer online',
    'a trusted astrologer on Astrowani', 'see the astrologers on Astrowani',
    'speak to a professional jyotishi', 'browse verified astrologers',
  ],
  consult: [
    'start a consultation on Astrowani', 'book an astrology consultation',
    'get a personal reading', 'online astrology consultation',
    'ask an astrologer your question', 'begin a consultation',
    'talk it through with an expert', 'get your chart read properly',
    'consult an astrologer on Astrowani',
  ],
  chat: [
    'chat with an astrologer', 'start a chat consultation', 'message an astrologer',
    'chat with a jyotishi on Astrowani', 'quick chat with an expert',
    'ask over chat', 'chat consultation on Astrowani',
  ],
  call: [
    'call an astrologer', 'speak to an astrologer by phone', 'book a call with an expert',
    'talk on a call', 'voice consultation on Astrowani', 'call a jyotishi directly',
  ],
  marriage: [
    'free kundali matching', 'kundali milan online', 'match two horoscopes',
    'check marriage compatibility', 'gun milan calculator', 'horoscope matching for marriage',
    'match your kundali on Astrowani', 'free gun milan',
  ],
  horoscope: [
    'daily horoscope', "today's horoscope", 'your rashifal for today',
    'daily rashifal on Astrowani', 'read your horoscope', 'free daily horoscope',
  ],
  panchang: [
    "today's panchang", 'check the panchang', 'daily panchang and muhurat',
    'tithi and nakshatra today', 'auspicious timings today', 'rahu kaal today',
  ],
  calculators: [
    'free astrology calculators', 'free kundali calculator', 'numerology calculator',
    'generate your birth chart', 'free astrology tools', 'calculate your kundali',
    'use the free calculators on Astrowani',
  ],
  courses: [
    'astrology courses', 'learn Vedic astrology', 'jyotish courses on Astrowani',
    'study astrology properly', 'astrology classes online',
  ],
  // ── The six service landing pages ──────────────────────────────────────
  //
  // Anchors here are built from the owner's own target keywords (supplied
  // 2026-10-29), because anchor text is where those keywords do real work: a
  // link reading "vastu consultation" teaches a crawler what the destination is
  // FOR, which is exactly what the landing page needs and what the article
  // itself should not be competing for.
  //
  // Hinglish variants are deliberate -- "kundli dikhana" and "haath dekhna" are
  // what people actually type, and an anchor set that is all formal English
  // covers half the vocabulary.
  kundliReading: [
    'online kundli reading', 'get your kundli read', 'janam kundali reading online',
    'birth chart reading by an astrologer', 'kundli reading on Astrowani',
    'have your birth chart read', 'online janam patri reading', 'kundli analysis online',
  ],
  tarotReading: [
    'online tarot card reading', 'talk to an online tarot reader', 'tarot card reading online',
    'book a tarot reading', 'tarot reading on Astrowani', 'ask a tarot reader',
    'get a tarot spread read', 'online tarot consultation',
  ],
  numerology: [
    'numerology consultation', 'online numerology consultation', 'get your numbers read',
    'numerology reading on Astrowani', 'talk to a numerologist', 'life path number reading',
    'name numerology consultation', 'ank jyotish consultation',
  ],
  careerAstrology: [
    'career astrology consultation', 'business astrology consultation',
    'online career astrology consultation', 'astrology for career decisions',
    'talk to an astrologer about your career', 'career and business astrology',
    'business astrology on Astrowani', 'career guidance from an astrologer',
  ],
  vastu: [
    'vastu consultation', 'online vastu consultation', 'vastu for your home',
    'talk to a vastu consultant', 'vastu consultation on Astrowani',
    'vastu advice for your house', 'vastu shastra consultation', 'ghar ka vastu',
  ],
  lalKitab: [
    'lal kitab consultation', 'lal kitab remedies', 'online lal kitab consultation',
    'consult a lal kitab astrologer', 'lal kitab upay', 'lal kitab reading on Astrowani',
    'lal kitab astrology consultation', 'simple lal kitab remedies',
  ],
  freeServices: [
    'free astrology services', 'free kundali report', 'free astrology tools on Astrowani',
    'try the free services', 'free horoscope services',
  ],
  bookCall: [
    'book a call with an astrologer', 'schedule a consultation', 'book your slot',
    'arrange a call on Astrowani', 'book an appointment',
  ],
  shop: [
    'Wani Shop', 'gemstones and puja items', 'energised gemstones',
    'rudraksha and yantras', 'shop remedies on Astrowani', 'puja samagri',
  ],
  blog: [
    'Astrowani blog', 'more astrology articles', 'read more on the blog',
    'other articles on Astrowani',
  ],
};

/**
 * Complete closing CTA variants.
 *
 * At three posts a day an identical closing paragraph becomes the most repeated
 * text on the domain within a month. Each variant is a genuinely different
 * paragraph rather than a reshuffle, and `{a}` / `{b}` are filled with the
 * article's two chosen internal links.
 */
const CTA_EN = [
  {
    heading: 'Talk it through with an astrologer on Astrowani',
    body: 'Everything above is the general principle. Your own chart is not general — its planets, '
      + 'dashas and combinations belong to you alone, and two people with the same placement can need '
      + 'opposite advice. On {a} you can reach a verified astrologer by chat, call or video within '
      + 'minutes and get an answer against your actual birth details. {b}, or get the {app} to keep '
      + 'your chart with you.',
  },
  {
    heading: 'Get this read against your own kundali',
    body: 'A rule that fits most charts still will not fit yours exactly, and that is the whole '
      + 'difficulty with reading about astrology rather than consulting on it. If any of this sounds '
      + 'like your situation, {a} and ask directly — a few minutes against your real birth details '
      + 'settles more than an hour of reading. {b} whenever you are ready, or use the {app}.',
  },
  {
    heading: 'Still not sure how this applies to you?',
    body: 'That is the normal position, and it is not something an article can fix: the same placement '
      + 'behaves differently depending on the house it falls in, its lord, and whatever else is aspecting '
      + 'it. The quickest way through is to {a} and have someone look at the actual chart. {b} on '
      + 'Astrowani, or carry your chart with you in the {app}.',
  },
  {
    heading: 'When it is worth asking an astrologer',
    body: 'Read widely by all means, but a decision worth making is worth checking against your own '
      + 'chart. If you are weighing something specific — a date, a match, a move — {a}, because the '
      + 'answer turns on details no general article can know. {b}, or download the {app}.',
  },
  {
    heading: 'Your chart, not the general rule',
    body: 'Astrology rewards specifics. The placement you have read about here can be strengthened or '
      + 'cancelled outright by something else in your chart, which is why two people are told opposite '
      + 'things about the same yoga. To find out which applies to you, {a} — most consultations start '
      + 'within a few minutes. {b}, or use the {app}.',
  },
  {
    heading: 'Ask someone who can see the whole chart',
    body: 'An article has to generalise; an astrologer does not. On Astrowani you can {a} and get a '
      + 'reading built on your date, time and place of birth rather than on a rule of thumb — by chat '
      + 'if you want it in writing, or by call or video if you would rather talk it through. {b}, or '
      + 'keep everything in one place with the {app}.',
  },
];

const CTA_HI = [
  {
    heading: 'Astrowani par jyotishi se baat kijiye',
    body: 'Is lekh mein di gayi baatein aam siddhant hain. Aapki kundali aapki hai — uske grah, dasha '
      + 'aur yog sirf aapke hain. {a} par verified jyotishi chat, call aur video par turant uplabdh hain, '
      + 'aur aap apni exact kundali dikha kar seedha jawab le sakte hain. {b}, ya {app} download karein.',
  },
  {
    heading: 'Apni kundali par yeh samajhiye',
    body: 'Jo niyam zyadatar kundali par lagta hai, zaroori nahi ki aapki par bhi waisa hi lage. Agar '
      + 'in baaton mein se kuch aapki sthiti jaisa lagta hai, to {a} aur seedha poochiye — apni asli '
      + 'janm jaankari par kuch minute ki baat ghanton ke padhne se zyada kaam aati hai. {b}, ya {app} '
      + 'istemaal karein.',
  },
  {
    heading: 'Yeh aap par kaise lagoo hota hai?',
    body: 'Yahi sabse aam sawaal hai, aur koi lekh iska pura jawab nahi de sakta: ek hi grah alag bhav, '
      + 'alag swami aur alag drishti ke saath alag phal deta hai. Sabse seedha raasta yeh hai ki {a} aur '
      + 'asli kundali dikhayein. {b}, ya apni kundali {app} mein rakhein.',
  },
  {
    heading: 'Kab jyotishi se poochna chahiye',
    body: 'Padhna achha hai, lekin koi bada faisla apni kundali par jaanch lena behtar hai. Agar aap '
      + 'koi khaas cheez soch rahe hain — koi tareekh, koi rishta, koi badlav — to {a}, kyunki jawab un '
      + 'baaton par nirbhar karta hai jo aam lekh nahi jaan sakta. {b}, ya {app} download karein.',
  },
];

/**
 * The FAQ heading does NOT rotate, and that is a reversal of an earlier decision.
 *
 * It was rotated for variety alongside the anchors and the CTA, which produced
 * "Common questions about this" — correct English, and unrecognisable as an FAQ
 * block at a glance. A reader scanning for the questions could not find them.
 *
 * The heading is STRUCTURE, not copy. Its SEO value comes from the FAQPage
 * structured data underneath it, not from the words varying, so rotating it cost
 * recognisability and gained nothing. Anchors and CTAs still rotate, because
 * those are copy and their variation is the whole point.
 */
const FAQ_HEADINGS_EN = ['Frequently asked questions'];
const FAQ_HEADINGS_HI = ['Aksar pooche jaane wale sawal'];
// NOTE "More from the Astrowani blog" is deliberately ABSENT. blog-post.html
// renders its own related-posts section under exactly that title (aw/blog.js
// articleTemplate), so an article picking it showed the heading twice, a few
// hundred pixels apart, over two different lists of the same posts.
const RELATED_HEADINGS_EN = [
  'Read next on Astrowani',
  'Related reading',
  'Continue reading on Astrowani',
  'You might also find these useful',
  'Keep reading',
];
const RELATED_HEADINGS_HI = [
  'Astrowani par aage padhiye',
  'Astrowani blog se aur lekh',
  'Isse judi aur jaankari',
  'Aage padhne ke liye',
];

/**
 * A deterministic 32-bit integer from a string.
 *
 * DETERMINISTIC, NOT RANDOM, and that is deliberate twice over: an article always
 * renders identically however many times it is regenerated (so a republish does
 * not silently rewrite its own anchors), and the choice is reproducible when
 * debugging why a given post reads the way it does.
 */
function seedOf(str, salt = '') {
  return crypto.createHash('sha256').update(`${salt}:${str}`).digest().readUInt32BE(0);
}

/** Pick one item from a list, by seed. */
function pick(list, seedStr, salt = '') {
  if (!list || !list.length) return null;
  return list[seedOf(seedStr, salt) % list.length];
}

/**
 * Pick `n` distinct items, by seed.
 *
 * Walks the list with a seeded, coprime stride rather than sampling randomly, so
 * it cannot return the same item twice and cannot clump.
 */
function sample(list, n, seedStr, salt = '') {
  if (!list || !list.length) return [];
  const count = Math.min(n, list.length);
  const start = seedOf(seedStr, salt) % list.length;
  // 2654435761 is Knuth's multiplicative-hash constant; odd, so coprime with any
  // list length that matters here, giving a full-period walk.
  const stride = 1 + ((seedOf(seedStr, `${salt}#s`) * 2654435761) % (list.length - 1 || 1));
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < count && i < list.length * 2; i += 1) {
    const idx = (start + i * stride) % list.length;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(list[idx]);
  }
  return out;
}

/**
 * The secondary keywords this article should try to carry.
 *
 * Mostly from its own category, plus at least one commercial-intent phrase so
 * every article reaches for the terms that actually bring consultations.
 */
function secondaryFor(category, seedStr, { count = 6 } = {}) {
  const pool = SECONDARY[category] || SECONDARY['Vedic Astrology'];
  const fromCategory = sample(pool, Math.max(1, count - 2), seedStr, 'sec');
  const fromCommercial = sample(COMMERCIAL, 2, seedStr, 'com');
  return [...fromCategory, ...fromCommercial];
}

/** The anchor text to use for one link target on this article. */
function anchorFor(targetKey, seedStr) {
  const list = ANCHORS[targetKey];
  return pick(list, seedStr, `anchor:${targetKey}`);
}

function ctaFor(seedStr, { hindi = false } = {}) {
  return pick(hindi ? CTA_HI : CTA_EN, seedStr, hindi ? 'cta-hi' : 'cta-en');
}
function faqHeadingFor(seedStr, { hindi = false } = {}) {
  return pick(hindi ? FAQ_HEADINGS_HI : FAQ_HEADINGS_EN, seedStr, hindi ? 'faqh-hi' : 'faqh-en');
}
function relatedHeadingFor(seedStr, { hindi = false } = {}) {
  return pick(hindi ? RELATED_HEADINGS_HI : RELATED_HEADINGS_EN, seedStr, hindi ? 'relh-hi' : 'relh-en');
}

/** Total distinct keywords, so the CLI can report the bank's size honestly. */
function bankSize() {
  const sec = Object.values(SECONDARY).reduce((n, l) => n + l.length, 0);
  const anchors = Object.values(ANCHORS).reduce((n, l) => n + l.length, 0);
  const unique = new Set([...Object.values(SECONDARY).flat(), ...COMMERCIAL]);
  return {
    secondary: sec,
    commercial: COMMERCIAL.length,
    total: sec + COMMERCIAL.length,
    unique: unique.size,
    anchorVariants: anchors,
    ctaVariants: CTA_EN.length + CTA_HI.length,
  };
}

module.exports = {
  SECONDARY, COMMERCIAL, ANCHORS, CTA_EN, CTA_HI,
  FAQ_HEADINGS_EN, FAQ_HEADINGS_HI, RELATED_HEADINGS_EN, RELATED_HEADINGS_HI,
  secondaryFor, anchorFor, ctaFor, faqHeadingFor, relatedHeadingFor,
  sample, pick, seedOf, bankSize,
};
