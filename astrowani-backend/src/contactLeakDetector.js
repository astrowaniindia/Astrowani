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

// Returns [{start, end}] character ranges of phone numbers in the ORIGINAL text.
function findPhoneRanges(text) {
  const re = /\p{Nd}+|[\p{L}\p{M}]+|[^\p{L}\p{M}\p{Nd}]+/gu;
  const ranges = [];
  let run = '';
  let runStart = null;
  let runEnd = null;
  let pendingMult = 1;
  let multStart = null;

  const endRun = () => {
    if (run.length >= 10 && isMobile(run)) ranges.push({ start: runStart, end: runEnd });
    run = ''; runStart = null; runEnd = null; pendingMult = 1; multStart = null;
  };
  const consume = (digits, start, end) => {
    if (runStart === null) runStart = multStart !== null ? multStart : start;
    run += digits;
    runEnd = end;
    pendingMult = 1; multStart = null;
  };

  let m;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    const start = m.index;
    const end = start + tok.length;
    if (/^\p{Nd}+$/u.test(tok)) {
      consume(Array.from(tok).map((ch) => digitValue(ch) ?? '').join(''), start, end);
      continue;
    }
    if (/^[\p{L}\p{M}]+$/u.test(tok)) {
      // Keycap / zero-width marks left over after a digit are transparent.
      if (/^[\p{M}​-‍]+$/u.test(tok)) { if (runEnd !== null) runEnd = end; continue; }
      const w = tok.toLowerCase();
      if (MULTIPLIERS[w]) { pendingMult = MULTIPLIERS[w]; multStart = runStart === null ? start : multStart; continue; }
      if (Object.prototype.hasOwnProperty.call(WORD_DIGITS, w)) {
        consume(WORD_DIGITS[w].repeat(pendingMult), start, end);
        continue;
      }
      endRun();
      continue;
    }
    if (TRANSPARENT.test(tok)) continue;
    endRun();
  }
  endRun();
  return ranges;
}

function findPhones(text) {
  return findPhoneRanges(text).map((r) => text.slice(r.start, r.end));
}

// Combining marks (keycap, vowel signs) are dropped rather than starred, so one digit = one star.
const starAll = (str) => str.replace(/[\p{M}​-‍]/gu, '').replace(/[\p{L}\p{Nd}]/gu, '*');

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

/**
 * Replaces contact details with stars: every letter/digit of a phone number, email, UPI id,
 * link or handle becomes '*' (separators and everything else are kept). Wording-only
 * matches (a channel name, "give me your number") are left alone -- only actual details
 * are hidden.
 * @returns {{ text: string, masked: boolean }}
 */
function maskContacts(text) {
  if (typeof text !== 'string' || !text) return { text: text || '', masked: false };
  let out = text;
  const ranges = findPhoneRanges(out);
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { start, end } = ranges[i];
    out = out.slice(0, start) + starAll(out.slice(start, end)) + out.slice(end);
  }
  for (const re of [EMAIL_RE, UPI_RE, URL_RE, HANDLE_RE]) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    out = out.replace(g, (mm) => starAll(mm));
  }
  return { text: out, masked: out !== text };
}

module.exports = { analyze, findPhones, maskContacts };
