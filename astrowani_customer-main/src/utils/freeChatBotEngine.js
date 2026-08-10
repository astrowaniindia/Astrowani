// Scripted reply engine for the free 5-minute "bot chat" welcome offer.
// Deliberately simple keyword-matched canned responses for now. To swap in a
// real LLM later (e.g. a Claude call with an astrologer-persona system
// prompt), replace only the body of `getBotReply` — the signature (message +
// prior turns in, a reply string out) is the seam; no caller/UI changes needed.
const OPENERS = [
  "Namaste! I'm so glad you're here. Tell me, what's on your mind today?",
  "Welcome! I can sense you have something important to ask. Go ahead, I'm listening.",
];

const TOPIC_REPLIES = {
  love: [
    "Matters of the heart are never simple. The stars suggest patience — a good phase for relationships is coming in the next few weeks.",
    "Love needs both patience and clarity. Trust your instincts, but don't rush any big decisions right now.",
  ],
  career: [
    "Your career line shows steady growth. A good opportunity may come your way soon — stay alert and prepared.",
    "This is a phase of hard work paying off. Don't be discouraged by small delays.",
  ],
  money: [
    "Financially, things look stable, but avoid any big risks this month. Save where you can.",
    "There's a positive shift coming in your finances, but it will take a little time and patience.",
  ],
  health: [
    "Take care of your health, especially your sleep and stress levels. Small lifestyle changes will help a lot.",
    "Your energy levels should improve soon — don't ignore rest and proper meals in the meantime.",
  ],
  family: [
    "Family matters need a calm approach right now. Listen more than you speak, and things will settle.",
    "There may be some tension at home, but it will pass if you stay patient and understanding.",
  ],
  general: [
    "That's a good question. The planets suggest this is a time for patience and quiet reflection.",
    "I understand. Everything happens in its own time — trust the process a little longer.",
    "This phase will pass. Stay positive, and don't make big decisions in haste.",
    "The energy around you is shifting for the better. Keep faith and stay grounded.",
  ],
};

const KEYWORDS = {
  love: ['love', 'marriage', 'partner', 'boyfriend', 'girlfriend', 'husband', 'wife', 'relationship'],
  career: ['job', 'career', 'work', 'business', 'promotion', 'interview'],
  money: ['money', 'finance', 'wealth', 'loan', 'debt', 'income'],
  health: ['health', 'sick', 'illness', 'pain', 'stress', 'sleep'],
  family: ['family', 'parents', 'mother', 'father', 'brother', 'sister', 'child', 'kids'],
};

function pickTopic(message) {
  const lower = message.toLowerCase();
  for (const [topic, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return topic;
  }
  return 'general';
}

const lastIndexByTopic = {};

function pickReply(topic) {
  const pool = TOPIC_REPLIES[topic] || TOPIC_REPLIES.general;
  const lastIdx = lastIndexByTopic[topic];
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && idx === lastIdx) idx = (idx + 1) % pool.length;
  lastIndexByTopic[topic] = idx;
  return pool[idx];
}

export function getOpeningMessage() {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)];
}

// `history` is unused by the scripted engine but kept in the signature so a
// future LLM-backed implementation can use prior turns for context without
// any caller changes.
export async function getBotReply(message, history = []) {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 900)); // feels like typing, not instant
  const topic = pickTopic(message);
  return pickReply(topic);
}
