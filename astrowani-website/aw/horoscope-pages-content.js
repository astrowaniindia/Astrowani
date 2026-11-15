/**
 * Copy for the twelve sign horoscope pages, English and Hindi side by side.
 *
 * WHY EACH PAGE CARRIES A WRITTEN PROFILE. The daily reading comes from
 * astroHoroscopeReading() in astro-engine.js — a seeded pick from one shared
 * set of phrases, the same machinery for every sign. Twelve pages carrying
 * only that would differ by little more than the sign name, which is exactly
 * what Google's scaled-content systems demote (SEO-Growth-Gap-Analysis 1.5).
 * So each page's substance is the sign profile below, written per sign; the
 * reading is the daily hook on top of it.
 *
 * HONESTY RULES, same as horoscope.html already states:
 *  - the reading is general guidance for a sign, never presented as computed
 *    from today's planets;
 *  - a reading applies whichever way the reader identifies their sign, so the
 *    page says so rather than pretending Western sun-sign dates are your Rashi.
 *    In India most people mean their Vedic Moon sign; the page points to the
 *    Rashi calculator for that.
 *  - traits are framed as what the sign is "traditionally associated with".
 *
 * Every visible string is an [english, hindi] pair; aw/horoscope-pages.js
 * merges them into hindi-strings.json. No inline links inside paragraphs (the
 * Hindi build translates whole text nodes). Straight apostrophes only.
 */

const SHARED = {
  crumbParent: ['Horoscope', 'राशिफल'],
  periods: {
    daily: ['Today', 'आज'],
    // "कल" alone means both yesterday and tomorrow; the site already uses this.
    tomorrow: ['Tomorrow', 'कल (आने वाला)'],
    weekly: ['This week', 'इस सप्ताह'],
    monthly: ['This month', 'इस महीने'],
    yearly: ['This year', 'इस वर्ष'],
  },
  meters: { love: ['Love', 'प्रेम'], career: ['Career', 'करियर'], money: ['Money', 'धन'], health: ['Health', 'स्वास्थ्य'] },
  readingNote: [
    'A general reading for the sign, refreshed every day — not a personal prediction. Read it for whichever sign you go by: your Rashi (Vedic Moon sign) or your Western sun sign.',
    'यह राशि के लिए सामान्य पाठ है, जो हर दिन बदलता है — व्यक्तिगत भविष्यवाणी नहीं। इसे अपनी उसी राशि के लिए पढ़ें जिसे आप मानते हैं: अपनी चंद्र राशि (वैदिक) या पश्चिमी सूर्य राशि।',
  ],
  factsTitle: ['At a glance', 'एक नज़र में'],
  facts: {
    symbol: ['Symbol', 'प्रतीक'],
    element: ['Element', 'तत्व'],
    lord: ['Ruling planet', 'स्वामी ग्रह'],
    day: ['Traditional day', 'पारंपरिक दिन'],
    dates: ['Sun sign dates (Western)', 'सूर्य राशि की तिथियां (पश्चिमी)'],
    partners: ['Traditional partner signs', 'पारंपरिक अनुकूल राशियां'],
  },
  whichSignTitle: ['Which sign is mine?', 'मेरी राशि कौन-सी है?'],
  whichSignText: [
    'In India, "your rashi" usually means your Vedic Moon sign, which needs your birth time and is often different from the Western sun sign you get from your birthday alone. If you are not sure which you are, the free calculators will tell you both.',
    'भारत में "आपकी राशि" का अर्थ आमतौर पर आपकी वैदिक चंद्र राशि होता है, जिसके लिए जन्म समय चाहिए और जो अक्सर केवल जन्मदिन से निकलने वाली पश्चिमी सूर्य राशि से अलग होती है। अगर आपको पक्का नहीं पता, तो मुफ़्त कैलकुलेटर आपको दोनों बता देंगे।',
  ],
  rashiLink: ['Find your Rashi', 'अपनी राशि जानें'],
  sunLink: ['Find your sun sign', 'अपनी सूर्य राशि जानें'],
  faqEyebrow: ['Frequently asked', 'अक्सर पूछे जाने वाले प्रश्न'],
  faqTitle: ['Common questions', 'सामान्य प्रश्न'],
  otherTitle: ['Horoscope for every sign', 'हर राशि का राशिफल'],
  allLink: ['All horoscopes', 'सभी राशिफल'],
  ctaTitle: ['A reading of your own chart', 'आपकी अपनी कुंडली का विश्लेषण'],
  ctaText: [
    'A sign horoscope is the same for everyone born under that sign. For a question about your own life, a verified astrologer reads your full birth chart with you.',
    'राशि का राशिफल उस राशि के सभी लोगों के लिए एक जैसा होता है। अपने जीवन से जुड़े प्रश्न के लिए एक सत्यापित ज्योतिषी आपके साथ आपकी पूरी जन्म कुंडली पढ़ते हैं।',
  ],
  ctaButton: ['Talk to an astrologer', 'ज्योतिषी से बात करें'],
  // The static links added to horoscope.html (one per sign).
  bySignTitle: ['Horoscope by sign', 'राशि के अनुसार राशिफल'],
};

const ELEMENT = { Fire: 'अग्नि', Earth: 'पृथ्वी', Air: 'वायु', Water: 'जल' };
const PLANET = { Mars: 'मंगल', Venus: 'शुक्र', Mercury: 'बुध', Moon: 'चंद्रमा', Sun: 'सूर्य', Jupiter: 'बृहस्पति', Saturn: 'शनि' };
const DAY = { Mars: ['Tuesday', 'मंगलवार'], Venus: ['Friday', 'शुक्रवार'], Mercury: ['Wednesday', 'बुधवार'], Moon: ['Monday', 'सोमवार'], Sun: ['Sunday', 'रविवार'], Jupiter: ['Thursday', 'गुरुवार'], Saturn: ['Saturday', 'शनिवार'] };
const MONTH_HI = { January: 'जनवरी', February: 'फ़रवरी', March: 'मार्च', April: 'अप्रैल', May: 'मई', June: 'जून', July: 'जुलाई', August: 'अगस्त', September: 'सितंबर', October: 'अक्टूबर', November: 'नवंबर', December: 'दिसंबर' };

/**
 * `name` must equal ASTRO_ZODIAC[].name in astro-engine.js — the reading is
 * seeded by it, so the sign page and horoscope.html give the same reading.
 * `partners`: the other two signs of the element plus the seventh sign, the
 * house of partnership in Vedic astrology.
 */
const SIGNS = [
  { name: 'Aries', hi: 'मेष', vedic: 'Mesh', symbol: '♈', element: 'Fire', lord: 'Mars', dates: ['21 March', '19 April'], partners: ['Leo', 'Sagittarius', 'Libra'],
    nature: ['Aries is the first sign of the zodiac and is traditionally linked with beginnings: energy, courage and the urge to be first. People who identify with Aries are often described as direct and quick to act, happiest when there is something to start or a problem to tackle head-on. The same fire can show up as impatience, and the classic Aries lesson is learning to finish what was so eagerly begun.',
      'मेष राशिचक्र की पहली राशि है और परंपरागत रूप से शुरुआत से जुड़ी है: ऊर्जा, साहस और सबसे आगे रहने की चाह। मेष राशि वालों को अक्सर सीधा और तुरंत कदम उठाने वाला बताया जाता है, जो तब सबसे खुश होते हैं जब कुछ नया शुरू करना हो या किसी समस्या से सीधे निपटना हो। यही अग्नि अधीरता के रूप में भी दिख सकती है, और मेष की पुरानी सीख है — जो काम उत्साह से शुरू किया, उसे पूरा करना।'],
    life: ['In relationships Aries is associated with warmth and honesty, and with needing a partner who can keep up. At work the sign is linked with leadership, sport, entrepreneurship and any role where taking the initiative is rewarded more than following a routine.',
      'रिश्तों में मेष को गर्मजोशी और ईमानदारी से जोड़ा जाता है, और ऐसे साथी की ज़रूरत से जो उनके साथ कदम मिला सके। काम में यह राशि नेतृत्व, खेल, उद्यमिता और ऐसी भूमिकाओं से जुड़ी है जहां तय दिनचर्या से अधिक पहल को महत्व मिलता है।'] },
  { name: 'Taurus', hi: 'वृषभ', vedic: 'Vrishabh', symbol: '♉', element: 'Earth', lord: 'Venus', dates: ['20 April', '20 May'], partners: ['Virgo', 'Capricorn', 'Scorpio'],
    nature: ['Taurus is traditionally the sign of steadiness and of the good things in life. It is associated with patience, loyalty and a strong practical sense, and with a love of comfort, food, music and beautiful surroundings. Taurus is said to build slowly and keep what it builds; the flip side is a stubborn streak and a reluctance to change course once a decision is made.',
      'वृषभ परंपरागत रूप से स्थिरता और जीवन की अच्छी चीज़ों की राशि है। इसे धैर्य, वफ़ादारी और मज़बूत व्यावहारिक समझ से जोड़ा जाता है, साथ ही आराम, भोजन, संगीत और सुंदर माहौल के प्रति प्रेम से। कहा जाता है कि वृषभ धीरे-धीरे बनाता है और जो बनाता है उसे संभालकर रखता है; इसका दूसरा पहलू है ज़िद और एक बार निर्णय लेने के बाद दिशा बदलने में हिचक।'],
    life: ['In love Taurus is associated with devotion and physical affection, and with valuing security over excitement. At work it is linked with finance, agriculture, food, design and the arts — fields where consistent effort and an eye for quality pay off over time.',
      'प्रेम में वृषभ को समर्पण और स्नेह से जोड़ा जाता है, और उत्साह से अधिक सुरक्षा को महत्व देने से। काम में यह वित्त, कृषि, भोजन, डिज़ाइन और कला से जुड़ी है — ऐसे क्षेत्र जहां लगातार मेहनत और गुणवत्ता की परख समय के साथ फल देती है।'] },
  { name: 'Gemini', hi: 'मिथुन', vedic: 'Mithun', symbol: '♊', element: 'Air', lord: 'Mercury', dates: ['21 May', '20 June'], partners: ['Libra', 'Aquarius', 'Sagittarius'],
    nature: ['Gemini is the sign of the twins and is traditionally associated with curiosity, conversation and quick thinking. Ruled by Mercury, it is linked with a talent for language, learning and making connections between people and ideas. Gemini is said to need variety to stay interested, which can make it adaptable and lively — and, at times, restless or scattered.',
      'मिथुन जुड़वां की राशि है और परंपरागत रूप से जिज्ञासा, बातचीत और तेज़ सोच से जुड़ी है। बुध के स्वामित्व वाली यह राशि भाषा, सीखने और लोगों व विचारों के बीच संबंध जोड़ने की क्षमता से जुड़ी मानी जाती है। कहा जाता है कि मिथुन को रुचि बनाए रखने के लिए विविधता चाहिए, जो इसे लचीला और जीवंत बनाती है — और कभी-कभी बेचैन या बिखरा हुआ भी।'],
    life: ['In relationships Gemini is associated with friendship and good conversation, and with needing a partner who stays mentally engaged. At work it is linked with writing, teaching, media, sales and communication — roles where no two days are quite the same.',
      'रिश्तों में मिथुन को दोस्ती और अच्छी बातचीत से जोड़ा जाता है, और ऐसे साथी की ज़रूरत से जो मानसिक रूप से जुड़ा रहे। काम में यह लेखन, शिक्षण, मीडिया, बिक्री और संचार से जुड़ी है — ऐसी भूमिकाएं जहां कोई भी दो दिन एक जैसे नहीं होते।'] },
  { name: 'Cancer', hi: 'कर्क', vedic: 'Kark', symbol: '♋', element: 'Water', lord: 'Moon', dates: ['21 June', '22 July'], partners: ['Scorpio', 'Pisces', 'Capricorn'],
    nature: ['Cancer is ruled by the Moon and is traditionally the sign of home, family and feeling. It is associated with care, memory and a strong protective instinct towards the people it loves. Cancer is often described as intuitive and emotionally perceptive; like its symbol, the crab, it can retreat into its shell when hurt, and is said to take time to trust.',
      'कर्क का स्वामी चंद्रमा है और यह परंपरागत रूप से घर, परिवार और भावनाओं की राशि है। इसे देखभाल, यादों और अपनों के प्रति गहरी सुरक्षा की भावना से जोड़ा जाता है। कर्क को अक्सर अंतर्ज्ञानी और भावनात्मक रूप से संवेदनशील बताया जाता है; अपने प्रतीक केकड़े की तरह यह आहत होने पर अपने खोल में सिमट सकता है, और कहा जाता है कि इसे भरोसा करने में समय लगता है।'],
    life: ['In love Cancer is associated with loyalty and a deep need for emotional security. At work it is linked with caring professions, hospitality, food, property and teaching — roles that make people feel looked after.',
      'प्रेम में कर्क को वफ़ादारी और भावनात्मक सुरक्षा की गहरी ज़रूरत से जोड़ा जाता है। काम में यह देखभाल से जुड़े पेशों, आतिथ्य, भोजन, संपत्ति और शिक्षण से जुड़ी है — ऐसी भूमिकाएं जिनमें लोगों को अपनापन महसूस होता है।'] },
  { name: 'Leo', hi: 'सिंह', vedic: 'Simha', symbol: '♌', element: 'Fire', lord: 'Sun', dates: ['23 July', '22 August'], partners: ['Aries', 'Sagittarius', 'Aquarius'],
    nature: ['Leo is ruled by the Sun and is traditionally the sign of confidence, generosity and self-expression. It is associated with warmth, creativity and a natural presence that draws people in. Leo is said to lead from the heart and to be fiercely loyal to its own; the shadow side is pride, and a need for recognition that can sting when it is not given.',
      'सिंह का स्वामी सूर्य है और यह परंपरागत रूप से आत्मविश्वास, उदारता और आत्म-अभिव्यक्ति की राशि है। इसे गर्मजोशी, रचनात्मकता और ऐसी स्वाभाविक उपस्थिति से जोड़ा जाता है जो लोगों को आकर्षित करती है। कहा जाता है कि सिंह दिल से नेतृत्व करता है और अपनों के प्रति बेहद वफ़ादार होता है; इसका छाया पक्ष है अभिमान, और पहचान की ऐसी चाह जो न मिलने पर चुभ सकती है।'],
    life: ['In love Leo is associated with romance and grand gestures, and with wanting to feel admired. At work it is linked with leadership, performance, government, management and any role with a stage of some kind.',
      'प्रेम में सिंह को रोमांस और बड़े-बड़े भावों से जोड़ा जाता है, और सराहे जाने की चाह से। काम में यह नेतृत्व, प्रदर्शन कला, सरकारी सेवा, प्रबंधन और ऐसी किसी भी भूमिका से जुड़ी है जिसमें किसी न किसी तरह का मंच हो।'] },
  { name: 'Virgo', hi: 'कन्या', vedic: 'Kanya', symbol: '♍', element: 'Earth', lord: 'Mercury', dates: ['23 August', '22 September'], partners: ['Taurus', 'Capricorn', 'Pisces'],
    nature: ['Virgo is traditionally the sign of service, precision and practical intelligence. Ruled by Mercury like Gemini, it turns that quick mind towards detail: analysing, organising and improving. Virgo is associated with modesty, reliability and genuine helpfulness; it is also said to be its own harshest critic, and to worry over things that are already good enough.',
      'कन्या परंपरागत रूप से सेवा, सटीकता और व्यावहारिक बुद्धि की राशि है। मिथुन की तरह इसका स्वामी भी बुध है, पर यह उस तेज़ दिमाग को बारीकियों की ओर लगाती है: विश्लेषण, व्यवस्था और सुधार। कन्या को विनम्रता, भरोसेमंद होने और सच्ची मदद की भावना से जोड़ा जाता है; यह भी कहा जाता है कि यह खुद की सबसे कड़ी आलोचक है, और उन बातों की भी चिंता करती है जो पहले से ही काफ़ी अच्छी हैं।'],
    life: ['In love Virgo is associated with showing care through practical acts rather than words. At work it is linked with health, accounting, research, editing and any field where accuracy matters.',
      'प्रेम में कन्या को शब्दों से अधिक व्यावहारिक कामों से परवाह जताने से जोड़ा जाता है। काम में यह स्वास्थ्य, लेखा, शोध, संपादन और ऐसे किसी भी क्षेत्र से जुड़ी है जहां सटीकता मायने रखती है।'] },
  { name: 'Libra', hi: 'तुला', vedic: 'Tula', symbol: '♎', element: 'Air', lord: 'Venus', dates: ['23 September', '22 October'], partners: ['Gemini', 'Aquarius', 'Aries'],
    nature: ['Libra is the sign of the scales and is traditionally associated with balance, fairness and harmony. Ruled by Venus, it is linked with charm, good taste and a gift for seeing every side of a question. Libra is said to work hard to keep the peace and to dislike conflict; the cost can be difficulty making decisions, or saying yes to keep others happy.',
      'तुला तराज़ू की राशि है और परंपरागत रूप से संतुलन, न्याय और सामंजस्य से जुड़ी है। शुक्र के स्वामित्व वाली यह राशि आकर्षण, अच्छी रुचि और किसी प्रश्न के हर पक्ष को देखने की क्षमता से जुड़ी मानी जाती है। कहा जाता है कि तुला शांति बनाए रखने के लिए मेहनत करती है और टकराव से बचती है; इसकी कीमत निर्णय लेने में कठिनाई, या दूसरों को खुश रखने के लिए हां कह देना हो सकती है।'],
    life: ['In love Libra is associated with partnership itself — the seventh sign is the natural sign of marriage in the zodiac. At work it is linked with law, diplomacy, design, fashion and roles that involve bringing people together.',
      'प्रेम में तुला को स्वयं साझेदारी से जोड़ा जाता है — सातवीं राशि होने के कारण इसे राशिचक्र में विवाह की स्वाभाविक राशि माना जाता है। काम में यह कानून, कूटनीति, डिज़ाइन, फ़ैशन और लोगों को साथ लाने वाली भूमिकाओं से जुड़ी है।'] },
  { name: 'Scorpio', hi: 'वृश्चिक', vedic: 'Vrishchik', symbol: '♏', element: 'Water', lord: 'Mars', dates: ['23 October', '21 November'], partners: ['Cancer', 'Pisces', 'Taurus'],
    nature: ['Scorpio is traditionally the sign of depth, intensity and transformation. In Vedic astrology it is ruled by Mars, which gives it determination and staying power, turned inward rather than outward. Scorpio is associated with loyalty, perceptiveness and a talent for getting to the truth of things; it is also said to guard its privacy closely and to find it hard to forgive.',
      'वृश्चिक परंपरागत रूप से गहराई, तीव्रता और परिवर्तन की राशि है। वैदिक ज्योतिष में इसका स्वामी मंगल है, जो इसे दृढ़ता और टिके रहने की शक्ति देता है, पर बाहर की बजाय भीतर की ओर। वृश्चिक को वफ़ादारी, पैनी समझ और बातों की सच्चाई तक पहुंचने की क्षमता से जोड़ा जाता है; यह भी कहा जाता है कि यह अपनी निजता की कड़ी रक्षा करता है और इसे माफ़ करना कठिन लगता है।'],
    life: ['In love Scorpio is associated with all-or-nothing commitment and strong emotional bonds. At work it is linked with research, investigation, medicine, finance and psychology — fields that reward looking beneath the surface.',
      'प्रेम में वृश्चिक को पूर्ण प्रतिबद्धता और गहरे भावनात्मक बंधन से जोड़ा जाता है। काम में यह शोध, जांच, चिकित्सा, वित्त और मनोविज्ञान से जुड़ी है — ऐसे क्षेत्र जो सतह के नीचे देखने को महत्व देते हैं।'] },
  { name: 'Sagittarius', hi: 'धनु', vedic: 'Dhanu', symbol: '♐', element: 'Fire', lord: 'Jupiter', dates: ['22 November', '21 December'], partners: ['Aries', 'Leo', 'Gemini'],
    nature: ['Sagittarius is the archer and is traditionally the sign of wisdom, faith and the search for meaning. Ruled by Jupiter, the guru among the planets, it is associated with optimism, generosity and a love of learning, travel and philosophy. Sagittarius is said to speak its mind honestly — sometimes more bluntly than intended — and to need room to roam.',
      'धनु धनुर्धारी की राशि है और परंपरागत रूप से ज्ञान, आस्था और जीवन के अर्थ की खोज से जुड़ी है। ग्रहों के गुरु बृहस्पति के स्वामित्व वाली यह राशि आशावाद, उदारता और ज्ञान, यात्रा व दर्शन के प्रति प्रेम से जुड़ी मानी जाती है। कहा जाता है कि धनु अपनी बात ईमानदारी से कहता है — कभी-कभी इरादे से अधिक साफ़-साफ़ — और उसे घूमने-फिरने की आज़ादी चाहिए।'],
    life: ['In love Sagittarius is associated with adventure and a partner who is also a friend and fellow traveller. At work it is linked with teaching, law, publishing, travel and religious or spiritual work.',
      'प्रेम में धनु को रोमांच से जोड़ा जाता है, और ऐसे साथी से जो दोस्त और हमसफ़र भी हो। काम में यह शिक्षण, कानून, प्रकाशन, यात्रा और धार्मिक या आध्यात्मिक कार्यों से जुड़ी है।'] },
  { name: 'Capricorn', hi: 'मकर', vedic: 'Makar', symbol: '♑', element: 'Earth', lord: 'Saturn', dates: ['22 December', '19 January'], partners: ['Taurus', 'Virgo', 'Cancer'],
    nature: ['Capricorn is ruled by Saturn and is traditionally the sign of discipline, responsibility and long-term ambition. It is associated with patience, a strong sense of duty and the ability to keep climbing steadily towards a goal others gave up on. Capricorn is often described as reserved and serious; it is also said to have a dry humour and to grow warmer and more relaxed with age.',
      'मकर का स्वामी शनि है और यह परंपरागत रूप से अनुशासन, ज़िम्मेदारी और दीर्घकालिक महत्वाकांक्षा की राशि है। इसे धैर्य, कर्तव्य की गहरी भावना और उस लक्ष्य की ओर लगातार बढ़ते रहने की क्षमता से जोड़ा जाता है जिसे दूसरे छोड़ चुके हों। मकर को अक्सर संयमी और गंभीर बताया जाता है; यह भी कहा जाता है कि इसमें सूखा-सा हास्य होता है और उम्र के साथ यह अधिक सहज और आत्मीय हो जाती है।'],
    life: ['In love Capricorn is associated with commitment and quiet reliability rather than display. At work it is linked with administration, government, engineering, business and any long career built step by step.',
      'प्रेम में मकर को दिखावे की बजाय प्रतिबद्धता और शांत भरोसे से जोड़ा जाता है। काम में यह प्रशासन, सरकारी सेवा, इंजीनियरिंग, व्यवसाय और कदम-दर-कदम बनाए गए किसी भी लंबे करियर से जुड़ी है।'] },
  { name: 'Aquarius', hi: 'कुंभ', vedic: 'Kumbh', symbol: '♒', element: 'Air', lord: 'Saturn', dates: ['20 January', '18 February'], partners: ['Gemini', 'Libra', 'Leo'],
    nature: ['Aquarius is the water bearer and is traditionally associated with ideas, independence and concern for the wider good. In Vedic astrology it is ruled by Saturn, which gives its idealism a patient, persistent quality. Aquarius is said to think differently from the crowd and to value friendship and fairness highly; it can also seem detached, more at home with causes than with feelings.',
      'कुंभ घड़ा उठाने वाले की राशि है और परंपरागत रूप से विचारों, स्वतंत्रता और व्यापक भलाई की चिंता से जुड़ी है। वैदिक ज्योतिष में इसका स्वामी शनि है, जो इसके आदर्शवाद को धैर्य और दृढ़ता देता है। कहा जाता है कि कुंभ भीड़ से अलग सोचता है और दोस्ती व न्याय को बहुत महत्व देता है; यह कभी-कभी अलग-थलग भी लग सकता है, भावनाओं से अधिक उद्देश्यों में सहज।'],
    life: ['In love Aquarius is associated with needing both closeness and personal space, and with partnerships that start as friendships. At work it is linked with science, technology, social work and new ways of doing things.',
      'प्रेम में कुंभ को निकटता और निजी जगह दोनों की ज़रूरत से जोड़ा जाता है, और ऐसे रिश्तों से जो दोस्ती से शुरू होते हैं। काम में यह विज्ञान, तकनीक, सामाजिक कार्य और काम करने के नए तरीकों से जुड़ी है।'] },
  { name: 'Pisces', hi: 'मीन', vedic: 'Meen', symbol: '♓', element: 'Water', lord: 'Jupiter', dates: ['19 February', '20 March'], partners: ['Cancer', 'Scorpio', 'Virgo'],
    nature: ['Pisces is the last sign of the zodiac and is traditionally associated with compassion, imagination and spirituality. Ruled by Jupiter in Vedic astrology, it is linked with devotion, intuition and a deep sensitivity to other people. Pisces is said to be kind and artistic, and to feel the world strongly; it is also said to need time alone, and to find firm boundaries hard to hold.',
      'मीन राशिचक्र की अंतिम राशि है और परंपरागत रूप से करुणा, कल्पना और आध्यात्मिकता से जुड़ी है। वैदिक ज्योतिष में इसका स्वामी बृहस्पति है, और इसे भक्ति, अंतर्ज्ञान और दूसरों के प्रति गहरी संवेदनशीलता से जोड़ा जाता है। कहा जाता है कि मीन दयालु और कलात्मक होती है और दुनिया को गहराई से महसूस करती है; यह भी कहा जाता है कि इसे अकेले समय की ज़रूरत होती है और पक्की सीमाएं बनाए रखना कठिन लगता है।'],
    life: ['In love Pisces is associated with devotion and a romantic, giving nature. At work it is linked with the arts, music, healing, charity and spiritual work.',
      'प्रेम में मीन को समर्पण और रोमानी, देने वाले स्वभाव से जोड़ा जाता है। काम में यह कला, संगीत, उपचार, दान और आध्यात्मिक कार्यों से जुड़ी है।'] },
];

const file = (s) => `${s.name.toLowerCase()}-horoscope.html`;
const byName = Object.fromEntries(SIGNS.map((s) => [s.name, s]));
const hiDate = (d) => { const [n, m] = d.split(' '); return `${n} ${MONTH_HI[m]}`; };

/** Everything per-sign that is derived rather than written, as [en, hi] pairs. */
function derived(s) {
  const [dEn, dHi] = DAY[s.lord];
  const partnersEn = s.partners.join(', ');
  const partnersHi = s.partners.map((p) => byName[p].hi).join(', ');
  const datesEn = `${s.dates[0]} – ${s.dates[1]}`;
  const datesHi = `${hiDate(s.dates[0])} – ${hiDate(s.dates[1])}`;
  return {
    title: `${s.name} Horoscope Today — Daily ${s.name} (${s.vedic}) Horoscope | Astrowani`,
    titleHi: `आज का ${s.hi} राशिफल — दैनिक ${s.hi} राशिफल | Astrowani`,
    desc: `Today's ${s.name} horoscope, plus tomorrow, this week, this month and this year — with what ${s.name} (${s.vedic} rashi) is traditionally said to be like in love and work.`,
    crumb: [s.name, s.hi],
    h1: [`${s.name} horoscope`, `${s.hi} राशिफल`],
    lead: [`Today's reading for ${s.name} (${s.vedic}), and what the sign is traditionally said to be like.`,
      `${s.hi} राशि के लिए आज का राशिफल, और परंपरागत रूप से इस राशि का स्वभाव कैसा माना जाता है।`],
    natureTitle: [`${s.name} nature`, `${s.hi} राशि का स्वभाव`],
    lifeTitle: [`${s.name} in love and work`, `प्रेम और काम में ${s.hi}`],
    linkLabel: [`${s.name} horoscope`, `${s.hi} राशिफल`],
    element: [s.element, ELEMENT[s.element]],
    lord: [s.lord, PLANET[s.lord]],
    day: [dEn, dHi],
    dates: [datesEn, datesHi],
    partners: [partnersEn, partnersHi],
    faqs: [
      [[`Is ${s.name} the same as ${s.vedic} rashi?`, `क्या ${s.name} और ${s.hi} राशि एक ही हैं?`],
        [`Yes — ${s.vedic} is the Hindi name for the same sign. What can differ is how you work out which sign is yours: by your Western sun sign (${datesEn}) or by your Vedic Moon sign, which needs your birth time.`,
          `हां — ${s.name} इसी राशि का अंग्रेज़ी नाम है। अंतर इसमें हो सकता है कि आप अपनी राशि कैसे निकालते हैं: पश्चिमी सूर्य राशि (${datesHi}) से, या वैदिक चंद्र राशि से, जिसके लिए जन्म समय चाहिए।`]],
      [[`Which planet rules ${s.name}?`, `${s.hi} राशि का स्वामी ग्रह कौन है?`],
        [`${s.lord}. That is why ${dEn}, the day of ${s.lord}, is traditionally considered ${s.name}'s day, and why remedies for the sign often involve ${s.lord}.`,
          `${PLANET[s.lord]}। इसी कारण ${PLANET[s.lord]} का दिन ${dHi} परंपरागत रूप से ${s.hi} राशि का दिन माना जाता है, और इस राशि के उपाय अक्सर ${PLANET[s.lord]} से जुड़े होते हैं।`]],
      [[`Which signs are traditionally compatible with ${s.name}?`, `कौन-सी राशियां ${s.hi} के साथ परंपरागत रूप से अनुकूल मानी जाती हैं?`],
        [`${partnersEn} are the traditional pairings: the other signs of its element, and the seventh sign, the house of partnership. Real compatibility is judged from two full birth charts through kundli matching, not from signs alone.`,
          `${partnersHi} पारंपरिक जोड़ियां हैं: उसी तत्व की अन्य राशियां, और सातवीं राशि, जो साझेदारी का भाव है। वास्तविक अनुकूलता केवल राशियों से नहीं, बल्कि कुंडली मिलान में दोनों पूरी जन्म कुंडलियों से देखी जाती है।`]],
    ],
  };
}

for (const s of SIGNS) Object.assign(s, derived(s), { file: file(s) });

/**
 * The reading phrases in Hindi, index for index with ASTRO_HOROSCOPE_FRAGMENTS
 * in astro-engine.js. They live in astro-engine.js (ASTRO_HOROSCOPE_FRAGMENTS_HI)
 * because the reading is assembled in the browser; this comment is the pointer.
 */

module.exports = { SHARED, SIGNS };
