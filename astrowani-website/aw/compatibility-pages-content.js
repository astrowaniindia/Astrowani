/**
 * Copy for the zodiac compatibility pages, English and Hindi side by side.
 *
 *   78 pages, one per UNORDERED pair of signs (66 mixed + 12 same-sign), plus
 *   the compatibility.html hub. "Taurus and Aries" is the same pair as "Aries
 *   and Taurus", so it is one page at the zodiac-order address
 *   (aries-and-taurus-compatibility.html). Two addresses for one text would be
 *   a duplicate, and the gap analysis's own rule (SEO-Growth-Gap-Analysis
 *   2026-10-30, 1.5) is: if two sibling pages differ only in their variable,
 *   do not ship them.
 *
 * WHY EVERY PAGE SAYS SOMETHING DIFFERENT. A pair page is not "sign A's text
 * pasted next to sign B's". Each is assembled from four independent,
 * traditional factors, and the combination is specific to the pair:
 *
 *   1. ELEMENTS   — same, complementary (Fire/Air, Earth/Water) or contrasting.
 *   2. MODES      — cardinal / fixed / mutable, and what two of them do together.
 *   3. RULERS     — the natural friendship (naisargika maitri) between the two
 *                   ruling planets, which is the Graha Maitri koota of Guna
 *                   Milan and gives its real points out of 5.
 *   4. DISTANCE   — how many signs apart they are, which is the Bhakoot koota:
 *                   7 points, or a Bhakoot dosha (2/12, 5/9, 6/8), with the
 *                   classical cancellation when the lords are the same or
 *                   friends.
 *
 * Plus each sign's own "brings / needs" in a relationship, written per sign.
 *
 * HONESTY RULES, same as the horoscope pages:
 *  - everything is framed as the TRADITIONAL sign-level view;
 *  - the pages say plainly that real matching is a full kundli matching of two
 *    birth charts, and that Graha Maitri and Bhakoot are read from the two
 *    MOON signs (rashi), which need birth times;
 *  - no percentages and no promises about a relationship.
 *
 * Every visible string is an [english, hindi] pair; aw/compatibility-pages.js
 * merges them into hindi-strings.json. No inline links inside paragraphs (the
 * Hindi build translates whole text nodes). Straight apostrophes only.
 */

// horoscope-pages-content.js replaces `lord` and `element` with [en, hi] pairs
// for its own pages; here they are needed as plain names (Mars, Fire).
const SIGNS = require('./horoscope-pages-content.js').SIGNS.map((s) => ({ ...s, lord: s.lord[0], element: s.element[0] }));

// ── Per-sign facts not already in horoscope-pages-content.js ─────────────────
const MODE = {
  Aries: 'cardinal', Cancer: 'cardinal', Libra: 'cardinal', Capricorn: 'cardinal',
  Taurus: 'fixed', Leo: 'fixed', Scorpio: 'fixed', Aquarius: 'fixed',
  Gemini: 'mutable', Virgo: 'mutable', Sagittarius: 'mutable', Pisces: 'mutable',
};
const MODE_NAME = {
  cardinal: ['Cardinal (chara)', 'चर'],
  fixed: ['Fixed (sthira)', 'स्थिर'],
  mutable: ['Mutable (dwiswabhava)', 'द्विस्वभाव'],
};

/** What each sign is traditionally said to bring to, and need from, a relationship. */
const LOVE = {
  Aries: { brings: ['energy, courage, honesty and the will to make things happen', 'ऊर्जा, साहस, ईमानदारी और चीज़ों को अंजाम देने की इच्छा'],
    needs: ['room to lead, quick decisions and a partner who does not hold them back', 'आगे बढ़कर नेतृत्व करने की जगह, जल्दी फ़ैसले और ऐसा साथी जो उन्हें रोके नहीं'] },
  Taurus: { brings: ['loyalty, steadiness, patience and a love of comfort', 'वफ़ादारी, स्थिरता, धैर्य और सुख-सुविधा का प्रेम'],
    needs: ['security, consistency and time, and little sudden change', 'सुरक्षा, निरंतरता और समय, और कम से कम अचानक बदलाव'] },
  Gemini: { brings: ['conversation, curiosity, wit and a light touch', 'बातचीत, जिज्ञासा, हाज़िरजवाबी और हल्कापन'],
    needs: ['variety, ideas to share and the freedom to stay curious', 'विविधता, बांटने के लिए विचार और जिज्ञासु बने रहने की आज़ादी'] },
  Cancer: { brings: ['care, emotional depth and a gift for making a home', 'देखभाल, भावनात्मक गहराई और घर बसाने का गुण'],
    needs: ['reassurance, emotional safety and closeness to family', 'भरोसा, भावनात्मक सुरक्षा और परिवार से निकटता'] },
  Leo: { brings: ['warmth, generosity, loyalty and a sense of fun', 'गर्मजोशी, उदारता, वफ़ादारी और मौज-मस्ती का भाव'],
    needs: ['appreciation, respect and a partner who is proud of them', 'सराहना, सम्मान और ऐसा साथी जिसे उन पर गर्व हो'] },
  Virgo: { brings: ['practical help, reliability and care in the small things', 'व्यावहारिक मदद, भरोसेमंदी और छोटी-छोटी बातों का ध्यान'],
    needs: ['order, sincerity and gentleness instead of criticism', 'व्यवस्था, सच्चाई और आलोचना की जगह कोमलता'] },
  Libra: { brings: ['fairness, charm and a real wish for partnership', 'निष्पक्षता, आकर्षण और साझेदारी की सच्ची चाह'],
    needs: ['harmony, balance and decisions that are made together', 'सामंजस्य, संतुलन और मिलकर लिए गए फ़ैसले'] },
  Scorpio: { brings: ['intensity, devotion and deep loyalty', 'तीव्रता, समर्पण और गहरी वफ़ादारी'],
    needs: ['trust, complete honesty and respect for their privacy', 'विश्वास, पूरी ईमानदारी और उनकी निजता का सम्मान'] },
  Sagittarius: { brings: ['optimism, adventure, humour and frankness', 'आशावाद, रोमांच, हास्य और स्पष्टवादिता'],
    needs: ['freedom, space to grow and shared ideals', 'आज़ादी, आगे बढ़ने की जगह और साझे आदर्श'] },
  Capricorn: { brings: ['commitment, responsibility and long-term plans', 'प्रतिबद्धता, ज़िम्मेदारी और लंबी योजनाएं'],
    needs: ['respect, stability and time to open up', 'सम्मान, स्थिरता और खुलने के लिए समय'] },
  Aquarius: { brings: ['friendship, originality and an open mind', 'मित्रता, मौलिकता और खुला मन'],
    needs: ['independence and a real meeting of minds', 'स्वतंत्रता और विचारों का सच्चा मेल'] },
  Pisces: { brings: ['compassion, romance and imagination', 'करुणा, रोमांस और कल्पनाशीलता'],
    needs: ['gentleness, emotional understanding and kind boundaries', 'कोमलता, भावनात्मक समझ और स्नेह भरी सीमाएं'] },
};

/**
 * Two people of the SAME sign. Written per sign, because every other paragraph
 * on a same-sign page is necessarily about one element, one mode and one lord,
 * so without this the twelve same-sign pages differed by little but the name.
 */
const TWIN = {
  Aries: ['Two Aries make a fast, honest and competitive pair. Life together rarely stands still: they push each other, say exactly what they think, and get over a quarrel as quickly as they started it. The question is who gets to lead, and the pairs that last tend to divide the territory, each in charge of something.',
    'दो मेष की जोड़ी तेज़, ईमानदार और प्रतिस्पर्धी होती है। साथ का जीवन शायद ही कभी थमता है: वे एक-दूसरे को आगे धकेलते हैं, जो सोचते हैं वही कहते हैं, और झगड़ा जितनी जल्दी शुरू होता है उतनी ही जल्दी भूल भी जाते हैं। प्रश्न यह है कि नेतृत्व कौन करे, और जो जोड़ियां टिकती हैं वे अक्सर क्षेत्र बांट लेती हैं, हर एक किसी चीज़ का ज़िम्मा ले लेता है।'],
  Taurus: ['Two Taurus build something solid and comfortable together: a well-kept home, steady money and routines they both enjoy. Neither is in a hurry, which suits them both. The risk is that two of the most stubborn signs can settle into a disagreement and simply wait it out for weeks, so the pairs that do well learn to raise things early.',
    'दो वृषभ मिलकर कुछ ठोस और आरामदायक बनाते हैं: संवरा हुआ घर, स्थिर आमदनी और ऐसी दिनचर्या जो दोनों को पसंद हो। किसी को जल्दी नहीं होती, और यह दोनों को रास आता है। जोखिम यह है कि दो सबसे ज़िद्दी राशियां किसी असहमति पर जमकर हफ़्तों इंतज़ार कर सकती हैं, इसलिए अच्छी चलने वाली जोड़ियां बात जल्दी उठाना सीख लेती हैं।'],
  Gemini: ['Two Gemini never run out of things to talk about. They share a restless curiosity, a quick sense of humour and a social life full of friends. What they can lack is someone to hold the practical side together, and a pair of Gemini usually has to agree who pays the bills and keeps the plans.',
    'दो मिथुन के पास बात करने के विषय कभी खत्म नहीं होते। उनमें एक जैसी बेचैन जिज्ञासा, तेज़ हास्यबोध और दोस्तों से भरा सामाजिक जीवन होता है। जो कमी रह सकती है वह है व्यावहारिक पक्ष संभालने वाले की, और दो मिथुन को अक्सर तय करना पड़ता है कि बिल कौन भरेगा और योजनाएं कौन निभाएगा।'],
  Cancer: ['Two Cancer understand each other\'s moods without a word and put home and family first. It is one of the most nurturing pairings there is. Both are sensitive, though, and both tend to withdraw when hurt, so a small slight can turn into two people waiting for the other to come out of their shell first.',
    'दो कर्क बिना कहे एक-दूसरे का मन समझ लेते हैं और घर-परिवार को सबसे ऊपर रखते हैं। यह सबसे स्नेहपूर्ण जोड़ियों में से एक है। फिर भी दोनों संवेदनशील हैं और चोट लगने पर दोनों पीछे हट जाते हैं, इसलिए छोटी-सी बात भी ऐसी स्थिति बन सकती है जहां दोनों इंतज़ार करें कि पहले दूसरा अपने खोल से निकले।'],
  Leo: ['Two Leo make a warm, generous and glamorous couple, loyal to each other and proud to be seen together. Both want to be admired, and both are happiest when they are the one being celebrated. The pairs that thrive take turns in the spotlight and are each other\'s loudest supporters rather than rivals.',
    'दो सिंह की जोड़ी गर्मजोशी भरी, उदार और आकर्षक होती है, एक-दूसरे के प्रति वफ़ादार और साथ दिखने पर गर्वित। दोनों सराहना चाहते हैं, और दोनों तब सबसे खुश होते हैं जब तारीफ़ उनकी हो। जो जोड़ियां फलती-फूलती हैं वे बारी-बारी से आगे आती हैं और प्रतिद्वंद्वी नहीं, एक-दूसरे के सबसे बड़े समर्थक बनती हैं।'],
  Virgo: ['Two Virgo run a careful, well-organised life and show love through practical help. They share high standards and a dislike of mess and waste. The tradition\'s caution is that two critical eyes can turn on each other, and this pair does best when the attention to detail goes into the household rather than into each other.',
    'दो कन्या सोच-समझकर, व्यवस्थित जीवन जीती हैं और प्रेम व्यावहारिक मदद से जताती हैं। दोनों के मानक ऊंचे होते हैं और दोनों को अव्यवस्था व बर्बादी नापसंद है। परंपरा की चेतावनी यह है कि दो आलोचनात्मक नज़रें एक-दूसरे पर ही टिक सकती हैं, और यह जोड़ी तब सबसे अच्छी चलती है जब बारीकी का ध्यान एक-दूसरे पर नहीं, घर-गृहस्थी पर जाए।'],
  Libra: ['Two Libra create a gracious, harmonious partnership with a shared love of beauty, good company and fairness. Arguments are rare because both prefer peace. The difficulty is the other side of that: two people who both avoid conflict and both find decisions hard can leave important things unsaid and unsettled.',
    'दो तुला एक सौम्य, सामंजस्यपूर्ण साझेदारी बनाती हैं, जिसमें सुंदरता, अच्छी संगत और निष्पक्षता का साझा प्रेम होता है। बहस कम होती है क्योंकि दोनों शांति पसंद करती हैं। कठिनाई इसी का दूसरा पहलू है: जब दोनों टकराव से बचें और दोनों को फ़ैसले कठिन लगें, तो ज़रूरी बातें अनकही और अनसुलझी रह सकती हैं।'],
  Scorpio: ['Two Scorpio form an intense, private and fiercely loyal bond, and each understands the other\'s need for depth and trust. Nothing is done halfway. The same intensity means jealousy and secrets can do real damage, so this pairing depends more than most on complete honesty from the start.',
    'दो वृश्चिक का रिश्ता गहरा, निजी और बेहद वफ़ादार होता है, और दोनों एक-दूसरे की गहराई और विश्वास की ज़रूरत समझते हैं। कुछ भी आधा-अधूरा नहीं होता। यही तीव्रता ईर्ष्या और राज़ को सचमुच नुकसानदेह बना सकती है, इसलिए यह जोड़ी दूसरों से अधिक शुरू से पूरी ईमानदारी पर निर्भर करती है।'],
  Sagittarius: ['Two Sagittarius share a love of travel, learning and big ideas, and give each other the freedom that both need. Life together tends to be cheerful and full of plans. What it can miss is follow-through: with two restless optimists, someone still has to commit to the ordinary, steady parts of a shared life.',
    'दो धनु को यात्रा, सीखने और बड़े विचारों का साझा शौक होता है, और दोनों एक-दूसरे को वह आज़ादी देते हैं जिसकी दोनों को ज़रूरत है। साथ का जीवन आमतौर पर खुशमिज़ाज और योजनाओं से भरा होता है। जो कमी रह सकती है वह है निभाने की: दो बेचैन आशावादियों में भी किसी को साझे जीवन के साधारण, स्थिर हिस्सों के लिए प्रतिबद्ध होना पड़ता है।'],
  Capricorn: ['Two Capricorn build a serious, ambitious partnership with long-term goals they both respect. They are dependable, careful with money and committed. The tradition\'s caution is that work and duty can crowd out warmth, and this pair does well when it makes deliberate time for affection and rest.',
    'दो मकर एक गंभीर, महत्वाकांक्षी साझेदारी बनाते हैं जिसमें ऐसे दीर्घकालिक लक्ष्य होते हैं जिनका दोनों सम्मान करते हैं। वे भरोसेमंद, पैसे में सावधान और प्रतिबद्ध होते हैं। परंपरा की चेतावनी यह है कि काम और कर्तव्य स्नेह की जगह ले सकते हैं, और यह जोड़ी तब अच्छी चलती है जब प्रेम और आराम के लिए जानबूझकर समय निकाले।'],
  Aquarius: ['Two Aquarius are friends first, with shared ideals, unusual interests and a deep respect for each other\'s independence. It is an easy, unconventional match. Where it can struggle is closeness: two people who both keep their feelings at a distance may need to work at saying what they feel.',
    'दो कुंभ पहले मित्र होते हैं, जिनके आदर्श साझे, रुचियां अनोखी और एक-दूसरे की स्वतंत्रता के प्रति गहरा सम्मान होता है। यह सहज और लीक से हटकर जोड़ी है। जहां कठिनाई आ सकती है वह है निकटता: जो दो लोग अपनी भावनाएं दूर रखते हैं, उन्हें मन की बात कहने पर मेहनत करनी पड़ सकती है।'],
  Pisces: ['Two Pisces share a gentle, romantic and deeply intuitive bond, often with a spiritual or creative side to it. They understand each other\'s dreams. The risk is that neither likes to deal with hard practical matters, so the pairs that do well make sure someone keeps a firm hand on money and plans.',
    'दो मीन का रिश्ता कोमल, रोमानी और गहरे अंतर्ज्ञान वाला होता है, जिसमें अक्सर आध्यात्मिक या रचनात्मक पक्ष भी होता है। वे एक-दूसरे के सपने समझते हैं। जोखिम यह है कि दोनों को कठोर व्यावहारिक मामले संभालना पसंद नहीं, इसलिए अच्छी चलने वाली जोड़ियां ध्यान रखती हैं कि पैसे और योजनाओं पर किसी का मज़बूत हाथ रहे।'],
};

// ── Naisargika maitri: how each planet regards the others (classical table). ─
const F = 'friend', N = 'neutral', E = 'enemy';
const MAITRI = {
  Sun: { Moon: F, Mars: F, Jupiter: F, Mercury: N, Venus: E, Saturn: E },
  Moon: { Sun: F, Mercury: F, Mars: N, Jupiter: N, Venus: N, Saturn: N },
  Mars: { Sun: F, Moon: F, Jupiter: F, Venus: N, Saturn: N, Mercury: E },
  Mercury: { Sun: F, Venus: F, Mars: N, Jupiter: N, Saturn: N, Moon: E },
  Jupiter: { Sun: F, Moon: F, Mars: F, Saturn: N, Mercury: E, Venus: E },
  Venus: { Mercury: F, Saturn: F, Mars: N, Jupiter: N, Sun: E, Moon: E },
  Saturn: { Mercury: F, Venus: F, Jupiter: N, Sun: E, Moon: E, Mars: E },
};
const PLANET_HI = { Mars: 'मंगल', Venus: 'शुक्र', Mercury: 'बुध', Moon: 'चंद्रमा', Sun: 'सूर्य', Jupiter: 'बृहस्पति', Saturn: 'शनि' };
const REL = { friend: ['a friend', 'मित्र'], neutral: ['neutral', 'सम (तटस्थ)'], enemy: ['an enemy', 'शत्रु'] };

/** Graha Maitri koota points (out of 5), from the two one-way relationships. */
function grahaMaitri(a, b) {
  if (a === b) return 5;
  const r = [MAITRI[a][b], MAITRI[b][a]].sort().join('+');
  return { 'friend+friend': 5, 'friend+neutral': 4, 'neutral+neutral': 3, 'enemy+friend': 1, 'enemy+neutral': 0.5, 'enemy+enemy': 0 }[r];
}

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ORD_HI = ['', 'पहली', 'दूसरी', 'तीसरी', 'चौथी', 'पांचवीं', 'छठी', 'सातवीं', 'आठवीं', 'नौवीं', 'दसवीं', 'ग्यारहवीं', 'बारहवीं'];

// ── Shared page copy ─────────────────────────────────────────────────────────
const SHARED = {
  crumbParent: ['Compatibility', 'राशि अनुकूलता'],
  glanceTitle: ['At a glance', 'एक नज़र में'],
  facts: {
    elements: ['Elements', 'तत्व'],
    modes: ['Modes', 'स्वभाव (चर, स्थिर, द्विस्वभाव)'],
    lords: ['Ruling planets', 'स्वामी ग्रह'],
    place: ['Place in the zodiac', 'राशिचक्र में स्थान'],
    maitri: ['Graha Maitri (Guna Milan)', 'ग्रह मैत्री (गुण मिलान)'],
    bhakoot: ['Bhakoot (Guna Milan)', 'भकूट (गुण मिलान)'],
    overall: ['Sign-level view', 'राशि स्तर पर आकलन'],
  },
  elementsTitle: ['The elements', 'तत्व'],
  modesTitle: ['Temperament', 'स्वभाव'],
  lordsTitle: ['The ruling planets', 'स्वामी ग्रह'],
  placeTitle: ['Their place in the zodiac', 'राशिचक्र में उनका स्थान'],
  bringsTitle: ['What each brings', 'कौन क्या लाता है'],
  limitsTitle: ['What signs can and cannot tell you', 'राशियां क्या बता सकती हैं और क्या नहीं'],
  limitsText: [
    'Everything on this page is the traditional sign-level view. In Guna Milan, Graha Maitri and Bhakoot are read from the two Moon signs (rashi), which need birth times, and they are only two of the eight kootas: the others come from the nakshatras. Two people of the same pair of signs can have very different charts, so a real match is judged from both full birth charts.',
    'इस पृष्ठ पर दी गई हर बात राशि स्तर का पारंपरिक आकलन है। गुण मिलान में ग्रह मैत्री और भकूट दोनों चंद्र राशियों से देखे जाते हैं, जिनके लिए जन्म समय चाहिए, और ये आठ कूटों में से केवल दो हैं: बाकी नक्षत्रों से आते हैं। एक ही राशि-जोड़ी के दो लोगों की कुंडलियां बहुत अलग हो सकती हैं, इसलिए वास्तविक मिलान दोनों पूरी जन्म कुंडलियों से देखा जाता है।',
  ],
  matchLink: ['Kundli matching for marriage', 'विवाह के लिए कुंडली मिलान'],
  rashiLink: ['Find your Rashi', 'अपनी राशि जानें'],
  faqEyebrow: ['Frequently asked', 'अक्सर पूछे जाने वाले प्रश्न'],
  faqTitle: ['Common questions', 'सामान्य प्रश्न'],
  allLink: ['All sign pairings', 'सभी राशि जोड़ियां'],
  ctaTitle: ['Match your actual charts', 'अपनी असली कुंडलियां मिलाएं'],
  ctaText: [
    'A verified astrologer can read both birth charts together and tell you what the signs alone cannot.',
    'एक सत्यापित ज्योतिषी दोनों जन्म कुंडलियां साथ पढ़कर वह बता सकते हैं जो केवल राशियां नहीं बता सकतीं।',
  ],
  ctaButton: ['Talk to an astrologer', 'ज्योतिषी से बात करें'],
  // The hub.
  hub: {
    title: 'Zodiac Compatibility — Rashi Milan for Every Sign Pair | Astrowani',
    titleHi: 'राशि अनुकूलता — हर राशि जोड़ी का राशि मिलान | Astrowani',
    desc: 'Zodiac compatibility for all 78 sign pairs: elements, temperament, Graha Maitri and Bhakoot points, and what each sign brings to a relationship.',
    h1: ['Zodiac compatibility', 'राशि अनुकूलता'],
    lead: ['Pick a pair of signs to see how they are traditionally said to get on, and why.',
      'राशियों की एक जोड़ी चुनें और देखें कि परंपरागत रूप से उनकी कैसी बनती है, और क्यों।'],
    introTitle: ['How compatibility is read here', 'यहां अनुकूलता कैसे देखी जाती है'],
    intro: [
      'Each pairing looks at four traditional factors: the two elements, the two temperaments, the friendship between the two ruling planets, and how far apart the signs sit in the zodiac. The last two are the Graha Maitri and Bhakoot kootas of Guna Milan, so each page also shows their points. Read your Rashi (Vedic Moon sign) if you know it; it is what Guna Milan uses.',
      'हर जोड़ी में चार पारंपरिक बातें देखी जाती हैं: दोनों तत्व, दोनों स्वभाव, दोनों स्वामी ग्रहों की मित्रता, और राशिचक्र में दोनों राशियों की दूरी। अंतिम दो गुण मिलान के ग्रह मैत्री और भकूट कूट हैं, इसलिए हर पृष्ठ पर उनके अंक भी दिए गए हैं। अगर आपको अपनी राशि (वैदिक चंद्र राशि) पता है तो उसी से देखें; गुण मिलान उसी का उपयोग करता है।',
    ],
    bySign: (s) => [`${s.name} compatibility`, `${s.hi} राशि की अनुकूलता`],
  },
};

const VERDICT = {
  strong: ['Strongly supportive', 'बहुत अनुकूल'],
  supportive: ['Supportive', 'अनुकूल'],
  mixed: ['Mixed', 'मिला-जुला'],
  cancelled: ['Mixed — Bhakoot dosha traditionally cancelled', 'मिला-जुला — भकूट दोष परंपरागत रूप से निरस्त'],
  care: ['Asks for care', 'सावधानी की ज़रूरत'],
};

// ── Element and mode paragraphs ──────────────────────────────────────────────
const EL_HI = { Fire: 'अग्नि', Earth: 'पृथ्वी', Air: 'वायु', Water: 'जल' };
const COMPLEMENT = { Fire: 'Air', Air: 'Fire', Earth: 'Water', Water: 'Earth' };

function elementText(A, B) {
  const a = A.element, b = B.element;
  const ah = EL_HI[a], bh = EL_HI[b];
  if (A === B) {
    return [`Two ${A.name} signs share the ${a} element, so they tend to understand each other's pace and priorities without explanation. The tradition's caution is that a pair of the same sign also shares the same blind spots, with nobody to balance them.`,
      `दो ${A.hi} राशि वाले एक ही ${ah} तत्व के होते हैं, इसलिए वे बिना समझाए एक-दूसरे की गति और प्राथमिकताएं समझ लेते हैं। परंपरा की चेतावनी यह है कि एक ही राशि की जोड़ी की कमज़ोरियां भी एक जैसी होती हैं, और उन्हें संतुलित करने वाला कोई नहीं होता।`];
  }
  if (a === b) {
    return [`${A.name} and ${B.name} are both ${a} signs. Signs of one element are traditionally the easiest companions: they want the same kind of life and react to things in similar ways, while being different enough signs to keep things interesting.`,
      `${A.hi} और ${B.hi} दोनों ${ah} तत्व की राशियां हैं। एक ही तत्व की राशियां परंपरागत रूप से सबसे सहज साथी मानी जाती हैं: वे एक जैसा जीवन चाहती हैं और चीज़ों पर मिलती-जुलती प्रतिक्रिया देती हैं, फिर भी इतनी अलग हैं कि रिश्ता नीरस न हो।`];
  }
  if (COMPLEMENT[a] === b) {
    const pair = [a, b].sort().join('+');
    if (pair === 'Air+Fire') {
      const fire = a === 'Fire' ? A : B, air = a === 'Fire' ? B : A;
      return [`${fire.name} is Fire and ${air.name} is Air, a pairing the tradition counts as complementary: air feeds fire. ${air.name} brings ideas and perspective, ${fire.name} brings drive, and together they tend to keep each other moving.`,
        `${fire.hi} अग्नि तत्व की और ${air.hi} वायु तत्व की राशि है, जिसे परंपरा पूरक जोड़ी मानती है: वायु अग्नि को बढ़ाती है। ${air.hi} विचार और दृष्टिकोण लाती है, ${fire.hi} जोश लाती है, और साथ मिलकर वे एक-दूसरे को आगे बढ़ाती रहती हैं।`];
    }
    const earth = a === 'Earth' ? A : B, water = a === 'Earth' ? B : A;
    return [`${earth.name} is Earth and ${water.name} is Water, a pairing the tradition counts as complementary: water nourishes earth, and earth gives water a shape. ${water.name} brings feeling, ${earth.name} brings stability, and each tends to steady the other.`,
      `${earth.hi} पृथ्वी तत्व की और ${water.hi} जल तत्व की राशि है, जिसे परंपरा पूरक जोड़ी मानती है: जल पृथ्वी को पोषित करता है और पृथ्वी जल को आकार देती है। ${water.hi} भावना लाती है, ${earth.hi} स्थिरता लाती है, और दोनों एक-दूसरे को संभालती हैं।`];
  }
  const key = [a, b].sort().join('+');
  const X = (el) => (A.element === el ? A : B);
  const T = {
    'Earth+Fire': () => [`${X('Fire').name} is Fire and ${X('Earth').name} is Earth. The tradition sees different speeds here: fire wants to act now, earth wants to build carefully. When it works, ${X('Fire').name} gets ${X('Earth').name} moving and ${X('Earth').name} turns ${X('Fire').name}'s plans into something lasting.`,
      `${X('Fire').hi} अग्नि तत्व की और ${X('Earth').hi} पृथ्वी तत्व की राशि है। परंपरा इसमें अलग-अलग गति देखती है: अग्नि अभी करना चाहती है, पृथ्वी सोच-समझकर बनाना चाहती है। जब बात बनती है, तो ${X('Fire').hi} ${X('Earth').hi} को गति देती है और ${X('Earth').hi} ${X('Fire').hi} की योजनाओं को टिकाऊ बनाती है।`],
    'Fire+Water': () => [`${X('Fire').name} is Fire and ${X('Water').name} is Water, the pairing the tradition calls steam: strong attraction, and strong reactions. ${X('Fire').name} is direct where ${X('Water').name} is sensitive, so the work in this pair is in how things are said, not only what.`,
      `${X('Fire').hi} अग्नि तत्व की और ${X('Water').hi} जल तत्व की राशि है, जिसे परंपरा भाप की जोड़ी कहती है: गहरा आकर्षण, और तीखी प्रतिक्रियाएं। जहां ${X('Fire').hi} सीधी बात करती है वहां ${X('Water').hi} संवेदनशील है, इसलिए इस जोड़ी में मेहनत इस पर है कि बात कैसे कही जाए, केवल क्या कही जाए इस पर नहीं।`],
    'Air+Earth': () => [`${X('Air').name} is Air and ${X('Earth').name} is Earth: ideas meeting practicality. ${X('Air').name} can find ${X('Earth').name} slow, and ${X('Earth').name} can find ${X('Air').name} unsettled, but the tradition also sees a useful balance, with one dreaming it up and the other making it real.`,
      `${X('Air').hi} वायु तत्व की और ${X('Earth').hi} पृथ्वी तत्व की राशि है: विचारों का व्यावहारिकता से मेल। ${X('Air').hi} को ${X('Earth').hi} धीमी लग सकती है, और ${X('Earth').hi} को ${X('Air').hi} अस्थिर, पर परंपरा इसमें एक उपयोगी संतुलन भी देखती है: एक सपना देखती है और दूसरी उसे साकार करती है।`],
    'Air+Water': () => [`${X('Air').name} is Air and ${X('Water').name} is Water: head meeting heart. ${X('Air').name} tends to think a feeling through, ${X('Water').name} tends to feel it first, and the tradition says this pair does best when each learns the other's way of talking about what matters.`,
      `${X('Air').hi} वायु तत्व की और ${X('Water').hi} जल तत्व की राशि है: दिमाग का दिल से मेल। ${X('Air').hi} भावना को सोचकर समझती है, ${X('Water').hi} पहले उसे महसूस करती है, और परंपरा कहती है कि यह जोड़ी तब सबसे अच्छी रहती है जब दोनों एक-दूसरे का अपनी बात कहने का तरीका सीख लें।`],
  };
  return T[key]();
}

function modeText(A, B) {
  const ma = MODE[A.name], mb = MODE[B.name];
  if (ma === mb) {
    const t = {
      cardinal: [`${A === B ? `Two ${A.name} signs are` : `${A.name} and ${B.name} are both`} cardinal (chara) signs, the starters of the zodiac. Both like to take the lead, which brings energy and also the question of who decides. Taking turns to lead is the traditional advice.`,
        `${A === B ? `दो ${A.hi} राशियां` : `${A.hi} और ${B.hi} दोनों`} चर राशियां हैं, जो राशिचक्र में शुरुआत करने वाली मानी जाती हैं। दोनों आगे रहना पसंद करती हैं, जिससे ऊर्जा भी आती है और यह सवाल भी कि फ़ैसला कौन करे। बारी-बारी से नेतृत्व करना पारंपरिक सलाह है।`],
      fixed: [`${A === B ? `Two ${A.name} signs are` : `${A.name} and ${B.name} are both`} fixed (sthira) signs, the most steady and determined of the zodiac. That makes for loyalty and staying power, and for standoffs when both dig in. The traditional advice is to agree early on what is worth holding firm about.`,
        `${A === B ? `दो ${A.hi} राशियां` : `${A.hi} और ${B.hi} दोनों`} स्थिर राशियां हैं, जो राशिचक्र में सबसे दृढ़ मानी जाती हैं। इससे वफ़ादारी और टिकाऊपन आता है, और जब दोनों अड़ जाएं तो गतिरोध भी। पारंपरिक सलाह है कि पहले ही तय कर लें कि किन बातों पर अड़ना ठीक है।`],
      mutable: [`${A === B ? `Two ${A.name} signs are` : `${A.name} and ${B.name} are both`} mutable (dwiswabhava) signs, the adaptable signs of the zodiac. They bend easily for each other, and the tradition's caution is the opposite of a clash: with both adapting, decisions can drift. Someone has to choose.`,
        `${A === B ? `दो ${A.hi} राशियां` : `${A.hi} और ${B.hi} दोनों`} द्विस्वभाव राशियां हैं, जो राशिचक्र में सबसे लचीली मानी जाती हैं। वे एक-दूसरे के लिए आसानी से झुक जाती हैं, और परंपरा की चेतावनी टकराव की नहीं, उलटी है: जब दोनों ढलती रहें तो फ़ैसले टलते रहते हैं। किसी को चुनना होता है।`],
    };
    return t[ma];
  }
  const key = [ma, mb].sort().join('+');
  const S = (m) => (MODE[A.name] === m ? A : B);
  const T = {
    'cardinal+fixed': [`${S('cardinal').name} is a cardinal sign that starts things, ${S('fixed').name} a fixed sign that sees them through. The tradition sees a natural division of work in that, as long as ${S('cardinal').name} does not push for change faster than ${S('fixed').name} is willing to move.`,
      `${S('cardinal').hi} चर राशि है जो शुरुआत करती है, ${S('fixed').hi} स्थिर राशि है जो काम पूरा करती है। परंपरा इसमें काम का स्वाभाविक बंटवारा देखती है, बशर्ते ${S('cardinal').hi} उससे अधिक तेज़ी से बदलाव न चाहे जितना ${S('fixed').hi} बदलने को तैयार है।`],
    'cardinal+mutable': [`${S('cardinal').name} is a cardinal sign that likes to lead, ${S('mutable').name} a mutable sign that adapts. That usually makes decisions easy, and the tradition's caution is only that ${S('mutable').name}'s flexibility should not turn into always giving way.`,
      `${S('cardinal').hi} चर राशि है जो नेतृत्व पसंद करती है, ${S('mutable').hi} द्विस्वभाव राशि है जो ढल जाती है। इससे फ़ैसले आमतौर पर आसान रहते हैं, और परंपरा की चेतावनी केवल इतनी है कि ${S('mutable').hi} का लचीलापन हमेशा झुक जाने में न बदल जाए।`],
    'fixed+mutable': [`${S('fixed').name} is a fixed sign that holds steady, ${S('mutable').name} a mutable sign that keeps changing. ${S('fixed').name} gives the pair a centre and ${S('mutable').name} keeps it from getting stuck, though ${S('fixed').name} can find so much change tiring.`,
      `${S('fixed').hi} स्थिर राशि है जो टिकी रहती है, ${S('mutable').hi} द्विस्वभाव राशि है जो बदलती रहती है। ${S('fixed').hi} जोड़ी को केंद्र देती है और ${S('mutable').hi} उसे जड़ होने से बचाती है, हालांकि ${S('fixed').hi} को इतना बदलाव थका सकता है।`],
  };
  return T[key];
}

// "the Sun", "the Moon" in an English sentence; other planets take no article.
const the = (p) => (p === 'Sun' || p === 'Moon' ? `the ${p}` : p);

function lordsText(A, B, gm) {
  const la = A.lord, lb = B.lord;
  if (la === lb) {
    const who = A === B ? [`Both partners are ruled by ${the(la)}`, `दोनों ${PLANET_HI[la]} के स्वामित्व में हैं`]
      : [`${A.name} and ${B.name} are both ruled by ${the(la)}`, `${A.hi} और ${B.hi} दोनों का स्वामी ${PLANET_HI[la]} है`];
    return [`${who[0]}. One ruling planet is the strongest form of Graha Maitri, the full 5 points: the two signs want things for the same deep reasons, even when they show it differently.`,
      `${who[1]}। एक ही स्वामी ग्रह होना ग्रह मैत्री का सबसे मज़बूत रूप है, पूरे 5 अंक: दोनों राशियां एक ही गहरे कारण से चीज़ें चाहती हैं, भले ही उसे अलग ढंग से दिखाएं।`];
  }
  const ab = MAITRI[la][lb], ba = MAITRI[lb][la];
  const sum = {
    5: [`Each planet counts the other a friend, the warmest combination there is.`, `दोनों ग्रह एक-दूसरे को मित्र मानते हैं, जो सबसे स्नेहपूर्ण मेल है।`],
    4: [`One friendly and one neutral is close to the best this koota gives.`, `एक ओर मित्रता और दूसरी ओर तटस्थता इस कूट का लगभग सबसे अच्छा परिणाम है।`],
    3: [`Two neutral planets neither help nor hinder: the relationship is what the two people make of it.`, `दो तटस्थ ग्रह न मदद करते हैं न बाधा: रिश्ता वैसा ही बनता है जैसा दोनों लोग उसे बनाते हैं।`],
    1: [`Friendship on one side and enmity on the other is an uneven start, which the tradition reads as one partner giving more goodwill than the other at first.`, `एक ओर मित्रता और दूसरी ओर शत्रुता असमान शुरुआत है, जिसे परंपरा इस रूप में पढ़ती है कि शुरू में एक साथी दूसरे से अधिक सद्भाव देता है।`],
    0.5: [`Neutral on one side and hostile on the other scores low in this koota, and the tradition advises patience while trust builds.`, `एक ओर तटस्थता और दूसरी ओर शत्रुता इस कूट में कम अंक देती है, और परंपरा भरोसा बनने तक धैर्य रखने की सलाह देती है।`],
    0: [`Mutual enmity is the lowest this koota gives. It is one factor of many, and the tradition looks to the rest of both charts before drawing any conclusion.`, `परस्पर शत्रुता इस कूट का सबसे कम परिणाम है। यह कई बातों में से एक है, और कोई भी निष्कर्ष निकालने से पहले परंपरा दोनों कुंडलियों की बाकी बातें देखती है।`],
  }[gm];
  return [`${A.name} is ruled by ${the(la)} and ${B.name} by ${the(lb)}. In the natural friendship of the planets, ${the(la)} counts ${the(lb)} as ${REL[ab][0]}, and ${the(lb)} counts ${the(la)} as ${REL[ba][0]}. That gives this pair ${gm} of 5 points in Graha Maitri. ${sum[0]}`,
    `${A.hi} का स्वामी ${PLANET_HI[la]} है और ${B.hi} का ${PLANET_HI[lb]}। ग्रहों की नैसर्गिक मैत्री में ${PLANET_HI[la]} ${PLANET_HI[lb]} को ${REL[ab][1]} मानता है, और ${PLANET_HI[lb]} ${PLANET_HI[la]} को ${REL[ba][1]} मानता है। इससे इस जोड़ी को ग्रह मैत्री में 5 में से ${gm} अंक मिलते हैं। ${sum[1]}`];
}

function placeText(A, B, d, dosha, cancelled) {
  const back = 14 - d > 12 ? 1 : 14 - d;
  let where;
  if (A === B) {
    where = [`Both partners have the same sign, which in Bhakoot is a 1/1 placement and scores the full 7 points. In Guna Milan the same Moon sign is usually checked against the nakshatras as well, because two people of one sign can still be born under different stars.`,
      `दोनों साथियों की राशि एक ही है, जो भकूट में 1/1 स्थिति है और पूरे 7 अंक देती है। गुण मिलान में एक ही चंद्र राशि होने पर नक्षत्र भी देखे जाते हैं, क्योंकि एक ही राशि के दो लोग अलग-अलग नक्षत्रों में जन्मे हो सकते हैं।`];
    return where;
  }
  if (d === 7) {
    where = [`${A.name} and ${B.name} sit opposite each other, seventh from one another. The seventh sign is the house of partnership, so this is the classic pairing of opposites that attract, and in Bhakoot it scores the full 7 points.`,
      `${A.hi} और ${B.hi} आमने-सामने हैं, एक-दूसरे से सातवीं। सातवीं राशि साझेदारी का भाव है, इसलिए यह विपरीतों के आकर्षण की क्लासिक जोड़ी है, और भकूट में इसे पूरे 7 अंक मिलते हैं।`];
  } else {
    where = [`Counted from ${A.name}, ${B.name} is the ${ORD[d]} sign; counted from ${B.name}, ${A.name} is the ${ORD[back]}. In Bhakoot this is a ${Math.min(d, back)}/${Math.max(d, back)} placement.`,
      `${A.hi} से गिनें तो ${B.hi} ${ORD_HI[d]} राशि है; ${B.hi} से गिनें तो ${A.hi} ${ORD_HI[back]}। भकूट में यह ${Math.min(d, back)}/${Math.max(d, back)} स्थिति है।`];
  }
  if (d === 7) return where;
  const tail = !dosha
    ? [`It scores the full 7 points: the tradition sees the two signs as supporting each other's wellbeing and prosperity.`,
      `इसे पूरे 7 अंक मिलते हैं: परंपरा मानती है कि ये दोनों राशियां एक-दूसरे के सुख और समृद्धि में सहायक हैं।`]
    : cancelled
      ? [`That is a Bhakoot dosha and scores 0 of 7, but the classical texts treat it as cancelled when the two signs share a lord or their lords are friends, as they are here.`,
        `यह भकूट दोष है और 7 में से 0 अंक देता है, पर शास्त्र इसे तब निरस्त मानते हैं जब दोनों राशियों का स्वामी एक हो या उनके स्वामी मित्र हों, जैसा यहां है।`]
      : [`That is a Bhakoot dosha and scores 0 of 7. The tradition takes it seriously in marriage matching, and it is one of the first things an astrologer will check in the full charts, where other factors can soften it.`,
        `यह भकूट दोष है और 7 में से 0 अंक देता है। विवाह मिलान में परंपरा इसे गंभीरता से लेती है, और ज्योतिषी पूरी कुंडलियों में सबसे पहले इसे देखते हैं, जहां दूसरी बातें इसे हल्का कर सकती हैं।`];
  return [`${where[0]} ${tail[0]}`, `${where[1]} ${tail[1]}`];
}

function bringsText(A, B) {
  const a = LOVE[A.name], b = LOVE[B.name];
  if (A === B) {
    return [`${A.name} is traditionally said to bring ${a.brings[0]} to a relationship, and to need ${a.needs[0]}. ${TWIN[A.name][0]}`,
      `परंपरा के अनुसार ${A.hi} रिश्ते में ${a.brings[1]} लाती है, और उसे ${a.needs[1]} चाहिए। ${TWIN[A.name][1]}`];
  }
  return [`${A.name} is traditionally said to bring ${a.brings[0]} to a relationship, and to need ${a.needs[0]}. ${B.name} is said to bring ${b.brings[0]}, and to need ${b.needs[0]}. The pair does well when each gives what the other needs, rather than what they would want themselves.`,
    `परंपरा के अनुसार ${A.hi} रिश्ते में ${a.brings[1]} लाती है, और उसे ${a.needs[1]} चाहिए। ${B.hi} ${b.brings[1]} लाती है, और उसे ${b.needs[1]} चाहिए। यह जोड़ी तब अच्छी चलती है जब हर साथी वह दे जो दूसरे को चाहिए, न कि वह जो वह खुद चाहता।`];
}

// ── Build the 78 pairs ───────────────────────────────────────────────────────
const slug = (s) => s.name.toLowerCase();
const fileFor = (A, B) => {
  const [x, y] = SIGNS.indexOf(A) <= SIGNS.indexOf(B) ? [A, B] : [B, A];
  return `${slug(x)}-and-${slug(y)}-compatibility.html`;
};

const PAIRS = [];
for (let i = 0; i < SIGNS.length; i++) {
  for (let j = i; j < SIGNS.length; j++) {
    const A = SIGNS[i], B = SIGNS[j];
    const d = j - i + 1; // B counted from A, 1..12
    const back = 14 - d > 12 ? 1 : 14 - d;
    const placement = [Math.min(d, back), Math.max(d, back)].join('/');
    const dosha = ['2/12', '5/9', '6/8'].includes(placement);
    const sameLord = A.lord === B.lord;
    const mutualFriends = !sameLord && MAITRI[A.lord][B.lord] === F && MAITRI[B.lord][A.lord] === F;
    const cancelled = dosha && (sameLord || mutualFriends);
    const gm = grahaMaitri(A.lord, B.lord);
    const bk = dosha ? 0 : 7;
    const verdict = !dosha
      ? (gm >= 4 ? 'strong' : gm >= 3 ? 'supportive' : 'mixed')
      : (cancelled ? 'cancelled' : (gm >= 3 ? 'mixed' : 'care'));

    const pairName = A === B ? [`${A.name} and ${A.name}`, `${A.hi} और ${A.hi}`] : [`${A.name} and ${B.name}`, `${A.hi} और ${B.hi}`];
    const vedic = `${A.vedic} and ${B.vedic}`;
    const p = {
      A, B, d, placement, dosha, cancelled, gm, bk, verdict,
      file: fileFor(A, B),
      title: `${pairName[0]} Compatibility | Astrowani`,
      titleHi: `${pairName[1]} राशि की अनुकूलता | Astrowani`,
      desc: `${pairName[0]} compatibility (${vedic}): elements, temperament, ruling planets and Guna Milan — Graha Maitri ${gm}/5, Bhakoot ${bk}/7.`,
      crumb: pairName,
      label: pairName,
      h1: [`${pairName[0]} compatibility`, `${pairName[1]} राशि मिलान`],
      lead: [`How ${A === B ? `two ${A.name} signs` : `${A.name} (${A.vedic}) and ${B.name} (${B.vedic})`} are traditionally said to get on, and the reasons behind it.`,
        `${A === B ? `दो ${A.hi} राशियों` : `${A.hi} और ${B.hi}`} की परंपरागत रूप से कैसी बनती है, और उसके पीछे के कारण।`],
      facts: {
        elements: A.element === B.element ? [`${A.element} (both)`, `दोनों ${EL_HI[A.element]}`] : [`${A.element} and ${B.element}`, `${EL_HI[A.element]} और ${EL_HI[B.element]}`],
        modes: MODE[A.name] === MODE[B.name] ? [`${MODE_NAME[MODE[A.name]][0]}, both`, `दोनों ${MODE_NAME[MODE[A.name]][1]}`] : [`${MODE_NAME[MODE[A.name]][0]} and ${MODE_NAME[MODE[B.name]][0]}`, `${MODE_NAME[MODE[A.name]][1]} और ${MODE_NAME[MODE[B.name]][1]}`],
        lords: sameLord ? [A.lord, PLANET_HI[A.lord]] : [`${A.lord} and ${B.lord}`, `${PLANET_HI[A.lord]} और ${PLANET_HI[B.lord]}`],
        place: A === B ? ['Same sign (1/1)', 'एक ही राशि (1/1)'] : d === 7 ? ['Opposite signs (7/7)', 'आमने-सामने की राशियां (7/7)'] : [`${placement} from each other`, `एक-दूसरे से ${placement}`],
        maitri: [`${gm} of 5 points`, `5 में से ${gm} अंक`],
        bhakoot: dosha ? (cancelled ? ['0 of 7 points (dosha, cancelled)', '7 में से 0 अंक (दोष, निरस्त)'] : ['0 of 7 points (Bhakoot dosha)', '7 में से 0 अंक (भकूट दोष)']) : ['7 of 7 points', '7 में से 7 अंक'],
        overall: VERDICT[verdict],
      },
      elementsTitle: [`The elements: ${A.element === B.element ? `both ${A.element}` : `${A.element} and ${B.element}`}`, `तत्व: ${A.element === B.element ? `दोनों ${EL_HI[A.element]}` : `${EL_HI[A.element]} और ${EL_HI[B.element]}`}`],
      elements: elementText(A, B),
      modes: modeText(A, B),
      lords: lordsText(A, B, gm),
      place: placeText(A, B, d, dosha, cancelled),
      brings: bringsText(A, B),
    };
    const v = VERDICT[verdict];
    p.faqs = [
      [[`Are ${pairName[0]} compatible?`, `क्या ${pairName[1]} की जोड़ी अनुकूल है?`],
        [`At the level of signs the traditional reading is: ${v[0][0].toLowerCase()}${v[0].slice(1)}. Their Guna Milan points from the two sign-based kootas are ${gm} of 5 for Graha Maitri and ${bk} of 7 for Bhakoot. Signs are only a starting point; a full kundli matching of both birth charts is what decides.`,
          `राशि स्तर पर पारंपरिक आकलन है: ${v[1]}। राशियों पर आधारित दो कूटों से इनके गुण मिलान अंक ग्रह मैत्री में 5 में से ${gm} और भकूट में 7 में से ${bk} हैं। राशियां केवल शुरुआत हैं; निर्णय दोनों जन्म कुंडलियों के पूरे कुंडली मिलान से होता है।`]],
      [[`Should I use my sun sign or my Moon sign here?`, `यहां सूर्य राशि देखें या चंद्र राशि?`],
        [`Guna Milan uses the Moon sign (rashi), which needs your birth time. The element and temperament notes are often read for the sun sign too, but the Graha Maitri and Bhakoot points only apply to the Moon signs.`,
          `गुण मिलान चंद्र राशि का उपयोग करता है, जिसके लिए जन्म समय चाहिए। तत्व और स्वभाव वाली बातें अक्सर सूर्य राशि के लिए भी पढ़ी जाती हैं, पर ग्रह मैत्री और भकूट के अंक केवल चंद्र राशियों पर लागू होते हैं।`]],
      [[A === B ? `Is it good to marry someone of the same sign?` : `Does it matter which partner is ${A.name} and which is ${B.name}?`,
        A === B ? `क्या एक ही राशि के व्यक्ति से विवाह अच्छा है?` : `क्या इससे फ़र्क पड़ता है कि कौन ${A.hi} है और कौन ${B.hi}?`],
        [A === B
          ? `The tradition treats it as easy at the sign level, with the full Bhakoot and Graha Maitri points, and then looks at the nakshatras, because a few nakshatra pairs within one sign raise their own questions in Guna Milan.`
          : `Not for anything on this page: elements, temperament, Graha Maitri and Bhakoot read the same both ways. Some other kootas of Guna Milan, such as Varna and Vashya, do look at who is the bride and who is the groom.`,
        A === B
          ? `परंपरा इसे राशि स्तर पर सहज मानती है, भकूट और ग्रह मैत्री के पूरे अंकों के साथ, और फिर नक्षत्र देखती है, क्योंकि एक ही राशि के कुछ नक्षत्र-जोड़े गुण मिलान में अपने अलग प्रश्न उठाते हैं।`
          : `इस पृष्ठ की किसी बात के लिए नहीं: तत्व, स्वभाव, ग्रह मैत्री और भकूट दोनों ओर से एक जैसे पढ़े जाते हैं। गुण मिलान के कुछ अन्य कूट, जैसे वर्ण और वश्य, देखते हैं कि वधू कौन है और वर कौन।`]],
    ];
    PAIRS.push(p);
  }
}

/** Every pair a sign is part of, in zodiac order of the other sign. */
const pairsOf = (S) => SIGNS.map((O) => PAIRS.find((p) => (p.A === S && p.B === O) || (p.A === O && p.B === S)));

module.exports = { SHARED, SIGNS, PAIRS, pairsOf, VERDICT, MAITRI, grahaMaitri };
