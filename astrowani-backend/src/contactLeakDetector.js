// astrowani-backend/src/contactLeakDetector.js
//
// Detects an attempt to move a customer off the platform: a phone number, email, UPI id,
// link or messaging handle inside a chat message (or, later, a call transcript).
//
// PURE and synchronous -- no I/O -- so it is cheap to run on every message and easy to
// test offline. It only DESCRIBES a message; it never blocks one. A false positive must
// cost an admin a glance, not a customer a lost message.
//
// Phone numbers are the hard case, because people disguise them:
//   "98765 43210", "9-8-7-6...", "+91 98765 43210", "९८७६५४३२१०",
//   "nine eight seven six ...", "nau aath saat chhe ...", "double nine eight ...", 9️⃣8️⃣...
// so the text is walked as a stream of digits, where spelled-out digits count as digits
// and spaces / dots / dashes are transparent.
//
// Birth details are discussed in nearly every consultation ("15 08 1995 10 30" is twelve
// digits in a row), so a run only counts as a phone when, after removing a +91 / 91 / 0
// prefix, it is EXACTLY ten digits and starts 6-9 -- the shape of an Indian mobile.
// Commas and slashes END a run, which keeps "Rs 500, 9876543210" and dates apart.

const WORD_DIGITS = {
  zero: '0', shunya: '0', sifar: '0', 'शून्य': '0',
  one: '1', ek: '1', 'एक': '1',
  two: '2', do: '2', 'दो': '2',
  three: '3', teen: '3', 'तीन': '3',
  four: '4', char: '4', chaar: '4', 'चार': '4',
  five: '5', paanch: '5', panch: '5', 'पांच': '5', 'पाँच': '5',
  six: '6', chhe: '6', chhah: '6', che: '6', chah: '6', 'छह': '6', 'छः': '6',
  seven: '7', saat: '7', 'सात': '7',
  eight: '8', aath: '8', ath: '8', 'आठ': '8',
  nine: '9', nau: '9', no: null, 'नौ': '9',
};
delete WORD_DIGITS.no;
const MULTIPLIERS = { double: 2, triple: 3, dabal: 2 };

// Unicode decimal-digit blocks worth handling. Each is ten contiguous code points.
const DIGIT_BLOCKS = [0x30, 0x660, 0x6f0, 0x966, 0xff10];
function digitValue(ch) {
  const cp = ch.codePointAt(0);
  for (const base of DIGIT_BLOCKS) {
    if (cp >= base && cp <= base + 9) return String(cp - base);
  }
  return null;
}

const TRANSPARENT = /^[\s\-._()+*​-‍️⃣|~]+$/;

function isMobile(run) {
  let d = run;
  if (d.length === 14 && d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 && /^[6-9]/.test(d);
}

function findPhones(text) {
  text = text.replace(/[️⃣​-‍]/g, '');
  const tokens = text.match(/\p{Nd}+|[\p{L}\p{M}]+|[^\p{L}\p{M}\p{Nd}]+/gu) || [];
  const found = [];
  let run = '';
  let pendingMult = 1;

  const endRun = () => {
    if (run.length >= 10 && isMobile(run)) found.push(run);
    run = '';
    pendingMult = 1;
  };

  for (const tok of tokens) {
    if (/^\p{Nd}+$/u.test(tok)) {
      for (const ch of Array.from(tok)) run += digitValue(ch) ?? '';
      pendingMult = 1;
      continue;
    }
    if (/^[\p{L}\p{M}]+$/u.test(tok)) {
      const w = tok.toLowerCase();
      if (MULTIPLIERS[w]) { pendingMult = MULTIPLIERS[w]; continue; }
      if (Object.prototype.hasOwnProperty.call(WORD_DIGITS, w)) {
        run += WORD_DIGITS[w].repeat(pendingMult);
        pendingMult = 1;
        continue;
      }
      endRun();
      continue;
    }
    // Punctuation / whitespace: transparent unless it contains a run-breaker.
    if (TRANSPARENT.test(tok)) continue;
    endRun();
  }
  endRun();
  return found;
}

const EMAIL_RE = /[A-Z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[A-Z0-9-]+\s?(?:\.|\(dot\)|\[dot\])\s?[A-Z]{2,}/i;
const UPI_RE = /\b[\w.-]{2,}@(?:ok(?:axis|hdfcbank|icici|sbi)|ybl|ibl|axl|paytm|upi|apl|sbi|oksbi|hdfcbank|icici|pnb|barodampay|freecharge|jio|airtel)\b/i;
const URL_RE = /(?:https?:\/\/|wa\.me\/|t\.me\/|bit\.ly\/|www\.)\S+/i;
// A handle with its own platform word next to it: "insta: guru_ji", "@guru_ji on telegram".
const HANDLE_RE = /(?:insta(?:gram)?|snap(?:chat)?|telegram|tg|signal|fb|facebook)\s*(?:id|handle|:|-|=)?\s*@?[\w.]{3,}|@[\w.]{3,}\s+(?:on|pe|par)\s+(?:insta|telegram|snap)/i;
const CHANNEL_RE = /\b(?:whats\s?app|watsapp|whatsap|wtsp|wp\s?number|telegram|instagram|snapchat|google\s?pay|gpay|phone\s?pe|phonepe|paytm)\b|व्हाट्सएप|व्हाट्सऐप|वॉट्सऐप|व्हाट्स\s?ऐप|टेलीग्राम/i;
const CONTACT_REQUEST_RE = /(?:personal|direct|private|apna|mera|meri|mere)\s+(?:number|no\b|contact|nambar)|(?:number|no\b|contact)\s+(?:de\s?do|dijiye|bhejo|bhej\s?do|send|share|dedo)|call\s+me\s+(?:on|at|directly)|contact\s+me\s+(?:on|at|directly|outside)|outside\s+(?:the\s+)?(?:app|astrowani)|bahar\s+(?:baat|milte|call)|app\s+ke\s+bahar|without\s+(?:the\s+)?app|direct\s+(?:payment|pay)|पर्सनल\s+नंबर|अपना\s+नंबर|मेरा\s+नंबर|ऐप\s+के\s+बाहर/i;

/**
 * @param {string} text
 * @returns {{ flagged: boolean, severity: 'high'|'low'|null, kinds: string[] }}
 * Severity HIGH means contact details are actually present; LOW means the wording points
 * that way (a channel name, a request for a number) but nothing usable was shared.
 */
function analyze(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s.trim()) return { flagged: false, severity: null, kinds: [] };
  const high = [];
  const low = [];

  if (findPhones(s).length) high.push('phone');
  if (EMAIL_RE.test(s)) high.push('email');
  if (UPI_RE.test(s)) high.push('upi');
  if (URL_RE.test(s)) high.push('link');
  if (HANDLE_RE.test(s)) high.push('handle');
  if (CHANNEL_RE.test(s)) low.push('channel');
  if (CONTACT_REQUEST_RE.test(s)) low.push('contact_request');

  const kinds = [...high, ...low];
  if (!kinds.length) return { flagged: false, severity: null, kinds: [] };
  return { flagged: true, severity: high.length ? 'high' : 'low', kinds };
}

module.exports = { analyze, findPhones };
