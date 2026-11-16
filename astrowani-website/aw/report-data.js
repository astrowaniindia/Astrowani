/**
 * The numbers behind what-india-asks-an-astrologer.html (aw/report-page.js).
 *
 * A SNAPSHOT, pulled once from production on 2026-11-16 with read-only SQL that
 * returned COUNTS ONLY — no names, numbers, messages or ids ever left the
 * database. The queries are in WEBSITE.md ("What India asks" report), so the
 * next edition can be pulled the same way and compared like for like.
 *
 * Population: every finished consultation from 15 June to 16 November 2026 that
 * lasted between 1 minute and 12 hours, excluding the store-reviewer account and
 * the customer excluded from analytics (app_settings).
 *
 * PRIVACY RULES the generator ENFORCES, not just this comment:
 *   - any group under MIN_GROUP people/consultations is dropped;
 *   - nobody under 18 is reported (the service is 18+; that bucket is omitted,
 *     not folded into another);
 *   - no message text is quoted, ever. Topics are keyword counts.
 */
module.exports = {
  MIN_GROUP: 20,
  period: { from: '2026-06-15', to: '2026-11-16' },
  consultations: 2330,
  customers: 1410,

  // Consultation type: count and median minutes.
  types: [
    { key: 'free', label: ['Free first voice call', 'पहली मुफ़्त वॉयस कॉल'], n: 1356, median: 7.0 },
    { key: 'chat', label: ['Chat', 'चैट'], n: 586, median: 3.4 },
    { key: 'voice', label: ['Paid voice call', 'सशुल्क वॉयस कॉल'], n: 374, median: 6.3 },
    { key: 'video', label: ['Video call', 'वीडियो कॉल'], n: 14, median: 1.7 },
  ],

  // Topics: chat consultations whose CUSTOMER messages mention the topic
  // (English, Hinglish and Hindi keywords; a chat can mention several).
  // Base: chats where the customer typed something besides the automatic
  // birth-details message.
  topicBase: 499,
  topics: [
    { label: ['Love and relationships', 'प्रेम और रिश्ते'], n: 175 },
    { label: ['Marriage', 'विवाह'], n: 111 },
    { label: ['Career and jobs', 'करियर और नौकरी'], n: 68 },
    { label: ['Money and business', 'धन और व्यापार'], n: 25 },
    { label: ['Going abroad', 'विदेश जाना'], n: 24 },
    { label: ['Family and children', 'परिवार और संतान'], n: 20 },
    { label: ['Studies and exams', 'पढ़ाई और परीक्षा'], n: 15 },
    { label: ['Health', 'स्वास्थ्य'], n: 4 },
  ],

  // The language customers TYPE in, per chat (Devanagari present -> Hindi;
  // else common Hindi words in Latin script -> Hinglish; else English).
  languageBase: 483,
  languages: [
    { label: ['Hinglish (Hindi in English letters)', 'हिंग्लिश (अंग्रेज़ी अक्षरों में हिंदी)'], n: 433 },
    { label: ['English', 'अंग्रेज़ी'], n: 38 },
    { label: ['Hindi (Devanagari)', 'हिंदी (देवनागरी)'], n: 12 },
  ],

  // People, from the profile they filled in (only those who did).
  gender: [
    { label: ['Women', 'महिलाएं'], n: 482 },
    { label: ['Men', 'पुरुष'], n: 214 },
    { label: ['Other', 'अन्य'], n: 1 },
  ],
  age: [
    { label: ['18–27', '18–27'], n: 420 },
    { label: ['28–37', '28–37'], n: 183 },
    { label: ['38–47', '38–47'], n: 44 },
    { label: ['48 and over', '48 और अधिक'], n: 12 },
  ],
  marital: [
    { label: ['Unmarried', 'अविवाहित'], n: 525 },
    { label: ['Married', 'विवाहित'], n: 171 },
  ],
  // Customers by the state on their profile. Base: those who gave one.
  stateBase: 674,
  states: [
    { label: ['Uttar Pradesh', 'उत्तर प्रदेश'], n: 156 },
    { label: ['Maharashtra', 'महाराष्ट्र'], n: 65 },
    { label: ['Bihar', 'बिहार'], n: 54 },
    { label: ['West Bengal', 'पश्चिम बंगाल'], n: 54 },
    { label: ['Rajasthan', 'राजस्थान'], n: 50 },
    { label: ['Madhya Pradesh', 'मध्य प्रदेश'], n: 39 },
    { label: ['Delhi', 'दिल्ली'], n: 35 },
    { label: ['Haryana', 'हरियाणा'], n: 34 },
    { label: ['Punjab', 'पंजाब'], n: 30 },
    { label: ['Chhattisgarh', 'छत्तीसगढ़'], n: 27 },
    { label: ['Gujarat', 'गुजरात'], n: 21 },
  ],

  // When: consultations by India time.
  hours: [69, 41, 38, 21, 14, 26, 28, 45, 92, 119, 145, 157, 203, 175, 151, 175, 183, 108, 103, 117, 89, 84, 79, 68],
  days: [
    { label: ['Monday', 'सोमवार'], n: 373 },
    { label: ['Tuesday', 'मंगलवार'], n: 245 },
    { label: ['Wednesday', 'बुधवार'], n: 317 },
    { label: ['Thursday', 'गुरुवार'], n: 316 },
    { label: ['Friday', 'शुक्रवार'], n: 376 },
    { label: ['Saturday', 'शनिवार'], n: 301 },
    { label: ['Sunday', 'रविवार'], n: 402 },
  ],
};
