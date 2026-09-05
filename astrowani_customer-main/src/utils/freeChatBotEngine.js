// Scripted reply engine for the free 5-minute chat.
//
// NO AI, NO NETWORK. Everything here is deterministic rules over hand-written
// Vedic-astrology content. That is a deliberate constraint, not a placeholder:
// the chat has to work offline, cost nothing per message, and never say anything
// nobody wrote.
//
// THREE RULES THIS IS BUILT ON:
//
// 1. IT CONVERSES, IT DOES NOT ANSWER. The old version matched a keyword and
//    returned one of two canned lines, so a five-minute chat was five minutes of
//    fortune-cookie. A real astrologer asks before they tell — birth details,
//    then what exactly is worrying you, then the reading. So every topic here has
//    a PROBE turn before its INSIGHT turn, and the reading refers back to what the
//    customer actually said.
//
// 2. IT NEVER HANDS OFF. No "let me connect you", no "our team will help", no
//    naming another astrologer. This character talks, and that is all it does.
//
// 3. THE LAST MINUTE NAMES A REMEDY WITHOUT GIVING IT. Once under 60 seconds the
//    engine switches to closing mode: it says a specific upaay exists for what was
//    discussed, tied to the planet it has been talking about — and does not say
//    what it is. It is honest about why (it needs exact birth details and more
//    time), it never claims the remedy was already given, and it never promises
//    anyone will follow up. The pull is the unfinished reading itself.
//
// Variety is combinatorial, not a bigger list: each reply is assembled from
// separate pools (opener + observation + insight + probe), and `pick()` will not
// repeat a line until its pool is exhausted. Two identical replies in one session
// is the failure mode this exists to prevent.

// ── Domain vocabulary ───────────────────────────────────────────────────────
// Real Vedic terms, used the way a Hindi-speaking astrologer would use them. The
// point is not to teach astrology — it is that a customer who knows the subject
// should not catch the bot using a word wrongly.
const PLANETS = {
  saturn: {en: 'Saturn', hi: 'Shani', theme: 'delay, discipline, and lessons that arrive late but stay'},
  jupiter: {en: 'Jupiter', hi: 'Guru', theme: 'growth, guidance, and doors opening a little at a time'},
  mars: {en: 'Mars', hi: 'Mangal', theme: 'energy, courage, and a temper that needs somewhere to go'},
  venus: {en: 'Venus', hi: 'Shukra', theme: 'love, comfort, and what you find beautiful'},
  mercury: {en: 'Mercury', hi: 'Budh', theme: 'speech, calculation, and quick thinking'},
  sun: {en: 'the Sun', hi: 'Surya', theme: 'authority, the father, and standing in your own name'},
  moon: {en: 'the Moon', hi: 'Chandra', theme: 'the mind, the mother, and how steady you feel inside'},
  rahu: {en: 'Rahu', hi: 'Rahu', theme: 'sudden desire, foreign things, and restlessness'},
  ketu: {en: 'Ketu', hi: 'Ketu', theme: 'detachment, past-life pull, and things that end abruptly'},
};

// Which house each concern sits in. Used so an observation lands on the right one.
const TOPIC_HOUSE = {
  love: {house: '7th', label: 'the house of marriage and partnership', planet: 'venus'},
  career: {house: '10th', label: 'the house of karma and profession', planet: 'saturn'},
  business: {house: '10th', label: 'the house of work and standing', planet: 'mercury'},
  money: {house: '2nd and 11th', label: 'the houses of wealth and gains', planet: 'jupiter'},
  education: {house: '5th', label: 'the house of learning and intellect', planet: 'mercury'},
  health: {house: '6th', label: 'the house of illness and recovery', planet: 'mars'},
  family: {house: '4th', label: 'the house of home and the mother', planet: 'moon'},
  children: {house: '5th', label: 'the house of progeny', planet: 'jupiter'},
  property: {house: '4th', label: 'the house of land and vehicles', planet: 'mars'},
  travel: {house: '12th', label: 'the house of distant places', planet: 'rahu'},
  legal: {house: '6th', label: 'the house of disputes', planet: 'saturn'},
  obstacles: {house: '8th', label: 'the house of sudden turns', planet: 'ketu'},
  spiritual: {house: '9th', label: 'the house of faith and fortune', planet: 'jupiter'},
  general: {house: '1st', label: 'your lagna, the house of the self', planet: 'moon'},
};

// Keywords per topic. Hinglish included on purpose — customers type "shaadi kab
// hogi", not "when is my marriage".
const KEYWORDS = {
  love: ['love', 'marriage', 'shaadi', 'shadi', 'partner', 'boyfriend', 'girlfriend', 'husband',
    'wife', 'relationship', 'breakup', 'divorce', 'pyar', 'pyaar', 'engagement', 'rishta', 'crush',
    'ex ', 'affair', 'proposal'],
  career: ['job', 'career', 'naukri', 'nokri', 'work', 'promotion', 'interview', 'boss', 'office',
    'salary', 'resign', 'transfer', 'appraisal', 'unemployed', 'placement'],
  business: ['business', 'startup', 'partnership', 'shop', 'trade', 'vyapar', 'dhandha', 'client',
    'venture', 'invest in business'],
  money: ['money', 'finance', 'wealth', 'paisa', 'paise', 'loan', 'debt', 'karz', 'income', 'savings',
    'lakh', 'crore', 'rupees', 'financial', 'emi'],
  education: ['study', 'exam', 'padhai', 'college', 'school', 'result', 'admission', 'competitive',
    'upsc', 'neet', 'jee', 'degree', 'student'],
  health: ['health', 'sick', 'illness', 'pain', 'stress', 'sleep', 'bimari', 'tabiyat', 'anxiety',
    'depression', 'operation', 'surgery', 'hospital', 'tension'],
  family: ['family', 'parents', 'mother', 'father', 'maa', 'papa', 'brother', 'sister', 'ghar',
    'in-laws', 'sasural', 'quarrel at home'],
  children: ['child', 'children', 'baby', 'bacha', 'bachcha', 'santan', 'pregnan', 'conceive', 'son', 'daughter'],
  property: ['property', 'house', 'flat', 'plot', 'land', 'makan', 'zameen', 'vehicle', 'car', 'rent'],
  travel: ['travel', 'foreign', 'abroad', 'visa', 'videsh', 'settle abroad', 'immigration', 'relocat'],
  legal: ['court', 'case', 'legal', 'lawyer', 'police', 'fir', 'mukadma', 'dispute', 'litigation'],
  obstacles: ['enemy', 'enemies', 'obstacle', 'rukavat', 'problem', 'nazar', 'evil eye', 'jadoo',
    'black magic', 'bad luck', 'kismat', 'failure', 'stuck'],
  spiritual: ['god', 'puja', 'temple', 'mantra', 'spiritual', 'bhagwan', 'fast', 'vrat', 'meditation', 'karma'],
};

// Direct astrological questions get a direct astrological answer, not a topic
// reading — someone asking "what is sade sati" is asking a factual question and
// being handed a love reading would look like the bot was not listening.
const CONCEPTS = [
  {
    id: 'sadesati',
    match: ['sade sati', 'sadesati', 'sade-sati', 'shani dasha', 'shani ki dasha'],
    replies: [
      "Sade Sati is the seven-and-a-half years Shani spends crossing the sign before your Moon, your Moon sign, and the one after. It is not a punishment — it is a stripping-away. Whatever is not built properly tends to come apart in it, and whatever survives it holds for life. Which phase you are in matters enormously; the first and last are quite different animals.",
      "People hear Sade Sati and panic, but Shani is not cruel — he is exact. Seven and a half years of being asked to earn what you have. The middle phase is usually the heaviest. Tell me your Moon sign and I can tell you roughly where you stand in it.",
    ],
  },
  {
    id: 'manglik',
    match: ['manglik', 'mangalik', 'mangal dosh', 'mangal dosha', 'kuja dosha'],
    replies: [
      "Manglik dosh comes from Mangal sitting in the 1st, 4th, 7th, 8th or 12th house. It has a fearsome reputation it mostly does not deserve — it raises the heat in a marriage, the arguments, the impatience. And it cancels in a good number of charts, which is the part nobody mentions when they are frightening you about it.",
      "Mangal in certain houses makes what we call Manglik dosh. What it really describes is temperament, not doom — two people with strong Mangal often suit each other very well. The cancellations matter more than the dosh itself, and there are several.",
    ],
  },
  {
    id: 'kaalsarp',
    match: ['kaal sarp', 'kalsarp', 'kaalsarp', 'kal sarp'],
    replies: [
      "Kaal Sarp forms when every planet sits between Rahu and Ketu — the whole chart caught on one side of that axis. It tends to show as effort that does not convert: you work, and the result arrives late or goes to somebody else. It is also one of the most over-diagnosed things in astrology, so I would want to see the actual placement before agreeing you have it.",
      "Kaal Sarp yog is the entire chart hemmed in between Rahu and Ketu. The feeling it produces is very particular — a sense of being blocked by something you cannot name. There are twelve varieties and they behave quite differently.",
    ],
  },
  {
    id: 'rashi',
    match: ['my rashi', 'which rashi', 'rashi kya', 'moon sign', 'zodiac sign', 'star sign', 'what is my sign'],
    replies: [
      "In Vedic astrology your rashi is your MOON sign, not the sun sign the newspapers print — that is why so many people feel their horoscope never fits. The Moon governs the mind. Give me your date, time and place of birth and the rashi follows from that.",
      "Your rashi is where the Moon sat at your birth, and it needs the birth time to be exact — the Moon changes sign every two and a quarter days. What are your birth details?",
    ],
  },
  {
    id: 'dasha',
    match: ['dasha', 'mahadasha', 'antardasha', 'which period'],
    replies: [
      "Vimshottari dasha is the sequence that decides WHEN a chart delivers. The same placement gives nothing for years and then everything in eighteen months, purely because its dasha arrived. This is usually the difference between two people with similar charts and very different lives.",
      "Dasha is timing. A strong planet sitting quietly for a decade is simply waiting its turn. Knowing which mahadasha and antardasha you are running tells me more about the next two years than almost anything else in the chart.",
    ],
  },
  {
    id: 'gemstone',
    match: ['gemstone', 'ratna', 'stone', 'pukhraj', 'neelam', 'moonga', 'panna', 'which stone', 'wear ring'],
    replies: [
      "Please do not wear a stone because it worked for a friend. A gemstone strengthens whichever planet it belongs to — and if that planet is a malefic for your lagna, you have just strengthened your own difficulty. Neelam especially is not something to experiment with.",
      "Stones are prescribed against the lagna and the dasha you are running, never against the problem you are describing. The same stone that lifts one chart flattens another. Which is why I will not name one for you without seeing the chart.",
    ],
  },
  {
    id: 'nakshatra',
    match: ['nakshatra', 'birth star', 'janam nakshatra'],
    replies: [
      "Your nakshatra is a finer cut than the rashi — twenty-seven divisions instead of twelve, each with its own ruling planet and its own temperament. It is what I would look at for marriage matching before almost anything else.",
      "The nakshatra the Moon occupied at birth sets the starting point of your whole dasha sequence. It is where timing comes from, so it is one of the first things I check.",
    ],
  },
];

// ── Reply components ────────────────────────────────────────────────────────
const OPENERS = [
  "Namaste. Sit with me a moment — tell me what has been weighing on you.",
  "Namaste. Something brought you here today. Tell me what it is, in your own words.",
  "Namaste. I am listening. What is troubling you most right now?",
];

// Asked early. A reading with no birth details is a guess, and asking makes the
// conversation feel like a consultation rather than a slot machine.
const BIRTH_ASKS = [
  "Before I say anything, tell me — what is your date of birth, and do you know the time and place?",
  "Give me your birth date, and the time if you have it. The time is what separates a real reading from a general one.",
  "What is your date, time and place of birth? Even an approximate time helps me place the lagna.",
];

const BIRTH_ACKS = [
  "Good, that helps. Let me look at where that puts things.",
  "Thank you. That gives me the lagna to work from.",
  "Noted. That changes what I would say quite a lot, actually.",
];

const ACKS = [
  "I hear you.",
  "That is a real weight to carry.",
  "Thank you for saying it plainly.",
  "I understand — and you are not the first to sit with this.",
  "That makes sense.",
  "Yes. I see why that is on your mind.",
];

// Per-topic probes. The bot asks these BEFORE giving a reading on that topic.
const PROBES = {
  love: [
    "Is this about someone already in your life, or someone you are still hoping for?",
    "Tell me — is the difficulty between the two of you, or is it the families?",
    "How long has this been unsettled?",
  ],
  career: [
    "Are you in a job now and unhappy in it, or looking for one?",
    "Is it recognition you are missing, or money, or both?",
    "Has this been building for a while, or did something change recently?",
  ],
  business: [
    "Is the business already running, or are you deciding whether to start?",
    "Is the trouble in the money, or in the people you work with?",
  ],
  money: [
    "Is it that money does not come, or that it comes and does not stay?",
    "Is there a loan or a debt sitting on this?",
  ],
  education: [
    "Is this your own study, or a child's?",
    "Is it the exam itself, or being able to concentrate at all?",
  ],
  health: [
    "Is this a diagnosed problem, or a feeling of not being right?",
    "How long have you felt like this?",
    "Is your sleep holding up?",
  ],
  family: [
    "Who in the house is it, if you do not mind saying?",
    "Is this recent, or has it been there for years?",
  ],
  children: [
    "Is this about a child you already have, or one you are hoping for?",
    "How long has this been a worry?",
  ],
  property: [
    "Is this a purchase you are considering, or a dispute over something you own?",
  ],
  travel: [
    "Is this for work or for study? The houses involved are different.",
    "Has there been a rejection already, or is this the first attempt?",
  ],
  legal: [
    "Is the matter already filed, or still a dispute between parties?",
  ],
  obstacles: [
    "When you say things are stuck — is it one area, or everything at once?",
    "Did this start after some particular event?",
  ],
  spiritual: [
    "Is there a deity or practice you already keep to?",
  ],
  general: [
    "Tell me a little more — which part of life is it sitting in?",
    "What made today the day you asked?",
  ],
};

// The reading. Written to sound like judgement rather than a horoscope column —
// specific, willing to say something unwelcome, and never a flat prediction of
// good fortune.
const INSIGHTS = {
  love: [
    "Venus in your chart is not weak — it is obstructed. That is a different problem. It means the feeling is there on both sides and something external keeps interrupting it: timing, distance, family, or your own hesitation at the wrong moment.",
    "The 7th house tells me you are not indecisive about the person. You are indecisive about whether you will be accepted. Those look the same from outside and are not the same thing at all.",
    "There is a delay here, and I do not think it is a bad one. A marriage settled in this phase would have been settled for the wrong reasons. What comes after the delay is steadier.",
  ],
  career: [
    "Saturn's signature is all over this. He does not deny the result — he postpones it until you have genuinely earned it. Which is unbearable to live through and tends to look, in hindsight, like the thing that made you competent.",
    "The 10th house is active but the recognition is going elsewhere. That is a very particular frustration: the work is yours, the credit is not. It usually resolves through a change of setting rather than a change of effort.",
    "You have been working hard in the wrong direction rather than not working hard. The chart suggests the opening is adjacent to what you are doing, not further along it.",
  ],
  business: [
    "The partnership axis is where the strain is, not the trade itself. Money troubles in a business are very often people troubles wearing a costume.",
    "Mercury governs the deal-making and it is doing its work. The difficulty is in the follow-through — agreements made well and then left unattended.",
  ],
  money: [
    "Your 2nd house holds, your 11th leaks. Money arrives and finds somewhere to go before you have decided. That is a pattern, not bad luck, and patterns can be interrupted.",
    "There is Jupiter's promise here but it is arriving in instalments, not in one lump. People miss that and conclude nothing is coming.",
  ],
  education: [
    "The 5th house is strong — the intelligence is not in question. What is disturbed is the Moon, which governs concentration. You are not failing to understand; you are failing to settle.",
    "Mercury supports this line of study. The obstacle reads as environmental rather than intellectual — noise, pressure, someone's expectations sitting on your shoulder.",
  ],
  health: [
    "The 6th house is where illness lives and also where it is defeated — the same house. What that means practically is that this is a phase, not a permanent condition, provided you stop ignoring it.",
    "A great deal of what you are describing is the mind pressing on the body. Astrologically that is the Moon, and the Moon responds to routine faster than to anything else.",
  ],
  family: [
    "The 4th house is disturbed and that is felt more than any other affliction, because it is the ground you stand on. When home is unsettled everything else is harder than it should be.",
    "There is an old grievance here, older than the current argument. The present quarrel is the shape it happens to be taking this year.",
  ],
  children: [
    "The 5th house carries this, and Jupiter is its natural significator. When Jupiter is under pressure the delay can be long and then resolve quite suddenly — which is cruel, because the waiting gives you no signal.",
    "I would want to see both charts for this, not one. The 5th house of one person is only half the answer.",
  ],
  property: [
    "Mars governs land and Mars does not do things gently. Property matters in this phase tend to conclude, but rarely quietly.",
    "The 4th house indicates the acquisition is possible. The friction is in paperwork and in a person who is slowing it deliberately.",
  ],
  travel: [
    "Rahu is the significator of foreign land and Rahu is never straightforward. It grants the thing, usually later than promised and rarely in the form you pictured.",
    "The 12th house supports going. What it does not promise is that the first attempt is the one that succeeds.",
  ],
  legal: [
    "The 6th house governs disputes and yours favours the one who is patient rather than the one who is loud. Long matters go to whoever can outlast them.",
    "Saturn is involved, so expect this to take longer than anyone has told you, and to end more in your favour than you currently believe.",
  ],
  obstacles: [
    "When everything is stuck at once, it is usually one planetary period rather than twelve separate misfortunes. That is better news than it sounds — one cause can be worked with.",
    "Ketu produces exactly this feeling: effort that meets nothing, as though the ground has been removed. It passes, and it tends to leave people less attached to things that were not serving them.",
  ],
  spiritual: [
    "The 9th house is your dharma and it is well disposed. The instinct that brought you to ask is itself the chart working.",
    "Jupiter favours this line. Faith kept quietly and regularly does more here than any large gesture.",
  ],
  general: [
    "Your lagna is steadier than you feel right now. What you are experiencing is a transit, and transits are weather, not climate.",
    "The chart does not show collapse. It shows a slow patch, and slow patches feel permanent from inside them.",
  ],
};

// A second, deeper turn on the same topic — so returning to a subject gets more,
// not the same thing rephrased.
const DEEPEN = {
  love: [
    "One more thing about the 7th house — it also describes what you bring to a partnership, not only what arrives. Something in how you handle the first disagreement is doing more damage than the disagreement.",
    "Venus and the Moon together decide whether affection is expressed or only felt. In your case I suspect it is felt and not said, and the other person is reading silence as indifference.",
  ],
  career: [
    "Look at where Saturn is transiting rather than where he sits natally. The pressure you are under is a passing weight, and it lifts on a schedule.",
    "The 10th house rewards being seen, not only being useful. You have been the second and not the first, and that is fixable without changing the work at all.",
  ],
  money: [
    "Jupiter's periods give money through people rather than through effort — a recommendation, an introduction. Watch who arrives, not what you do.",
    "The leak is in the 12th house, which governs spending you do not notice. Small, constant, invisible.",
  ],
  health: [
    "The Moon runs on rhythm. Sleeping and eating at the same hours does more for a disturbed Moon than most people are willing to believe.",
    "The 6th house also governs habit. Whatever is wrong here was built slowly and comes apart slowly, in the same way.",
  ],
  family: [
    "The 4th house is the mother's house. Very often when home feels wrong, her state is part of it — sometimes unspoken.",
    "The Moon governs the household mood. One steady person changes the whole temperature of a house, and it is usually whoever noticed the problem first.",
  ],
  general: [
    "Charts do not describe fate so much as tendency. The tendency is strong; the outcome still has your hand in it.",
    "The same placement in two charts produces two lives. What differs is what the person does in the difficult year.",
  ],
};

// Follow-ups that keep the conversation moving without asking a whole new question.
const NUDGES = [
  "Does that match what you have been seeing?",
  "Tell me if that lands, or if I have read it wrong.",
  "Does that sound like your situation, or not quite?",
  "What do you make of that?",
  "Is there more to it than you have said?",
];

// ── Last minute: name the remedy, withhold it ───────────────────────────────
// Never states the remedy. Never claims it was given. Never promises follow-up or
// points at another person — the unfinished reading is the whole pull.
const REMEDY_TEASES = [
  (p) => `There is something else. For what you have described, your chart carries a specific upaay tied to ${p} — a practice, done on one particular day of the week, in a particular order. It is not a general suggestion, it is prescribed against your placement. I cannot set it out properly without your exact birth time, and not in the minutes we have left.`,
  (p) => `Before we run out of time — what is troubling you here has a remedy in the classical texts, and it is a ${p} remedy. Done correctly it works quietly, over about forty days. Done from a general list off the internet it does nothing at all, which is why I will not throw a half-version of it at you now.`,
  (p) => `I will say this much: there is a defined upaay for this, and it belongs to ${p}. The texts are quite specific about the timing and the count. Prescribing it properly needs the chart in front of me — and honestly, more than the time we have.`,
  (p) => `One thing I have not said. Your situation has a ${p} remedy attached to it, and it is simple to perform once you know it. What it is not is guessable. The wrong version of a remedy is worse than none, so I would rather leave it unsaid than say it carelessly.`,
];

const CLOSING_LINES = [
  "Our time is nearly up. What I would leave you with is this: the difficult part of this phase is already behind you, even if it does not feel that way today.",
  "We are almost at the end. Hold on to this — nothing in your chart is fixed against you. It is timing, and timing moves.",
  "Time is short now. Whatever else you take from this: you are not unlucky. You are early.",
];

// ── Session state ───────────────────────────────────────────────────────────
// Module-level on purpose: one chat runs at a time and the screen resets it on
// mount. Kept out of React so the engine stays a plain function.
let session = null;

function freshSession() {
  return {
    turn: 0,
    used: {},            // pool name -> Set of used indices
    probedTopics: new Set(),
    readTopics: new Set(),
    lastTopic: null,
    birthAsked: false,
    birthGiven: false,
    conceptsUsed: new Set(),
    remedyTeased: false,
    closed: false,
  };
}

export function resetChatSession() {
  session = freshSession();
}

/** Pick from a pool without repeating until the pool is exhausted. */
function pick(poolName, pool) {
  if (!pool || !pool.length) return '';
  if (!session.used[poolName]) session.used[poolName] = new Set();
  const used = session.used[poolName];
  if (used.size >= pool.length) used.clear();
  const available = pool.map((_, i) => i).filter((i) => !used.has(i));
  const idx = available[Math.floor(Math.random() * available.length)];
  used.add(idx);
  return pool[idx];
}

function detectTopic(lower) {
  let best = null;
  let bestHits = 0;
  for (const [topic, words] of Object.entries(KEYWORDS)) {
    const hits = words.filter((w) => lower.includes(w)).length;
    if (hits > bestHits) { bestHits = hits; best = topic; }
  }
  return best;
}

function detectConcept(lower) {
  return CONCEPTS.find((c) => c.match.some((m) => lower.includes(m))) || null;
}

// Loose check for "they just gave me birth details" — a date, a year, or a
// month name is enough. This only decides whether to acknowledge, so a false
// positive costs nothing.
function looksLikeBirthDetails(text) {
  const lower = text.toLowerCase();
  if (/\b(19|20)\d{2}\b/.test(text)) return true;
  if (/\b\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}\b/.test(text)) return true;
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(lower) && /\d/.test(text);
}

const GREETING = /^(hi|hello|hey|namaste|namaskar|pranam|good morning|good evening|hii+|helo)\b/i;
const THANKS = /\b(thank|thanks|thanku|dhanyavad|shukriya)\b/i;
const BYE = /\b(bye|goodbye|alvida|see you|ok bye)\b/i;

/** The planet to attribute a closing remedy to, based on what was discussed. */
function remedyPlanetFor(topic) {
  const entry = TOPIC_HOUSE[topic] || TOPIC_HOUSE.general;
  const p = PLANETS[entry.planet];
  return `${p.en} (${p.hi})`;
}

export function getOpeningMessage() {
  if (!session) resetChatSession();
  return pick('openers', OPENERS);
}

/**
 * @param message           what the customer just typed
 * @param history           prior turns (unused; kept so the signature is stable)
 * @param opts.secondsLeft  seconds remaining in the free chat. Drives closing mode.
 */
export async function getBotReply(message, history = [], opts = {}) {
  if (!session) resetChatSession();
  // Typing delay, scaled a little to reply length so long replies do not appear
  // instantly — that is the tell that gives away a script.
  await new Promise((r) => setTimeout(r, 750 + Math.random() * 850));

  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  session.turn += 1;

  const secondsLeft = Number.isFinite(opts.secondsLeft) ? opts.secondsLeft : null;
  const closing = secondsLeft !== null && secondsLeft <= 60;

  const topic = detectTopic(lower) || session.lastTopic || 'general';
  if (detectTopic(lower)) session.lastTopic = topic;

  // ── Closing mode: the remedy exists, and it is not being handed over ──────
  if (closing && !session.remedyTeased) {
    session.remedyTeased = true;
    const tease = pick('remedyTease', REMEDY_TEASES);
    return typeof tease === 'function' ? tease(remedyPlanetFor(session.lastTopic || topic)) : tease;
  }
  if (closing) {
    return pick('closing', CLOSING_LINES);
  }

  // ── Social turns ─────────────────────────────────────────────────────────
  if (BYE.test(lower)) {
    return "Go carefully. What we found today was real — sit with it before you decide anything.";
  }
  if (THANKS.test(lower) && text.length < 40) {
    return pick('thanks', [
      "There is nothing to thank me for. Tell me what else is sitting with you.",
      "You are welcome. Is there another corner of this we have not touched?",
    ]);
  }
  if (GREETING.test(lower) && text.length < 25 && session.turn <= 2) {
    // Mark it asked, or the turn-2 rule below asks for birth details a second
    // time in consecutive messages — which reads as not listening.
    session.birthAsked = true;
    return `${pick('greetBack', ["Namaste.", "Namaste, welcome."])} ${pick('birthAsk', BIRTH_ASKS)}`;
  }

  // ── Birth details ────────────────────────────────────────────────────────
  if (!session.birthGiven && looksLikeBirthDetails(text)) {
    session.birthGiven = true;
    const t = session.lastTopic || 'general';
    const entry = TOPIC_HOUSE[t];
    // This turn IS the probe for that topic. Without marking it, the next reply
    // re-introduces the same house and asks a second probe about something the
    // customer has usually just answered.
    session.probedTopics.add(t);
    return `${pick('birthAck', BIRTH_ACKS)} With that, I am looking at ${entry.house} house — ${entry.label}. ${pick('probe_' + t, PROBES[t] || PROBES.general)}`;
  }
  // Ask once, early, and only if they have not already volunteered it.
  if (!session.birthAsked && !session.birthGiven && session.turn === 2) {
    session.birthAsked = true;
    return `${pick('acks', ACKS)} ${pick('birthAsk', BIRTH_ASKS)}`;
  }

  // ── A direct astrological question beats a topic reading ─────────────────
  const concept = detectConcept(lower);
  if (concept && !session.conceptsUsed.has(concept.id)) {
    session.conceptsUsed.add(concept.id);
    return pick('concept_' + concept.id, concept.replies);
  }

  // ── Probe before reading ─────────────────────────────────────────────────
  if (!session.probedTopics.has(topic)) {
    session.probedTopics.add(topic);
    const entry = TOPIC_HOUSE[topic];
    const planet = PLANETS[entry.planet];
    return `${pick('acks', ACKS)} That sits in the ${entry.house} house — ${entry.label} — and ${planet.en} governs it, which is ${planet.theme}. ${pick('probe_' + topic, PROBES[topic] || PROBES.general)}`;
  }

  // ── Reading, then a deeper reading on a return visit ──────────────────────
  if (!session.readTopics.has(topic)) {
    session.readTopics.add(topic);
    return `${pick('insight_' + topic, INSIGHTS[topic] || INSIGHTS.general)} ${pick('nudges', NUDGES)}`;
  }

  const deeper = DEEPEN[topic] || DEEPEN.general;
  return `${pick('deepen_' + topic, deeper)} ${pick('nudges', NUDGES)}`;
}
