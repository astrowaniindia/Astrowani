#!/usr/bin/env node
/**
 * Generate the service landing pages.
 *
 *   node aw/service-pages.js            # write them
 *   node aw/service-pages.js --check    # report, write nothing
 *
 * ============================================================================
 * WHY THESE EXIST.
 *
 * The homepage blueprint supplied 2026-10-29 ends its service section with one
 * instruction: "Each card should link to its own relevant service landing page
 * rather than sending all users to the same generic astrologer listing."
 *
 * It was right, and the audit found the same thing from the other direction:
 * the mega menu offers 44 destinations that resolve to FIVE indexable URLs,
 * because 35 of them are hash fragments — and Google strips a fragment
 * entirely. "Numerology consultation" was calculators.html#numerology, which is
 * not a URL and never was.
 *
 * So these are the pages those keywords had nowhere to land.
 *
 * ONE PAGE, ONE INTENT. Two pages chasing one phrase compete with each other,
 * Google picks one — often the wrong one — and both do worse than a single good
 * page would. Where a page already owns an intent it is NOT duplicated here:
 * marriage.html owns kundli matching, panchang.html owns muhurat.
 *
 * EVERY SERVICE HERE IS ONE ASTROWANI ACTUALLY OFFERS. Checked against the live
 * categories table on 2026-10-29 — the live astrologer counts are in `staffed`
 * below. A landing page for a service nobody can deliver is worse than no page,
 * and the blueprint says so itself: "only use the trust claims that your actual
 * platform can substantiate."
 *
 * THE PROSE IS WRITTEN HERE, NOT COPIED FROM THE BLUEPRINT. The blueprint's
 * long-form sections are keyword-dense and in places ungrammatical ("So
 * Astrowani explore to discover online astrology services"). Published as-is
 * that reads as machine-generated filler, which Google's helpful-content
 * systems demote — the opposite of what the keywords are for. The intent and
 * the target phrases are the blueprint's; the sentences are not.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'marriage.html');
const check = process.argv.includes('--check');

const ICON = {
  chart: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  star: '<path d="M12 2l2.2 4.6L19 8l-3.6 3.3L16.2 16 12 13.5 7.8 16l.8-4.7L5 8l4.8-1.4z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  book: '<path d="M4 4h10a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H4z"/><path d="M4 4v16"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  hand: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-2.5a1.5 1.5 0 0 1 3 0"/>',
};

/**
 * `staffed` is the live astrologer count for the backing category, measured
 * 2026-10-29. It is recorded so a future reader can see the page was justified
 * by real coverage rather than by a keyword list — and so a service that later
 * loses its astrologers can be spotted.
 */
const PAGES = [
  {
    file: 'kundli-reading.html',
    crumb: 'Kundli Reading',
    staffed: '53 (Vedic Astrology)',
    h1: 'Online Kundli reading',
    lead: 'Your birth chart read by a verified astrologer — what the placements mean for you, in plain language.',
    title: 'Online Kundli Reading by Verified Astrologers | Astrowani',
    desc: 'Get an online Kundli reading from a verified astrologer. Share your birth details and discuss your chart, planetary positions and remedies by chat or call.',
    tiles: [
      [ICON.chart, 'Share your birth details', 'Date, time and place of birth. Birth time matters most — it sets the ascendant and the house positions.'],
      [ICON.star, 'The chart is cast and read', 'Planetary positions, houses, dashas and any doshas that are actually relevant to your question.'],
      [ICON.chat, 'Talk it through', 'A live chat, call or video session, so you can ask what a placement means rather than read a report alone.'],
    ],
    prose: [
      ['What a Kundli reading covers',
       'A Kundli, or birth chart, is a map of the sky at the moment you were born. An online Kundli reading walks through that chart with you: the ascendant and what it suggests about temperament, the placement of the Moon and Sun, the houses that relate to the area you are asking about, and the current dasha period.',
       'Astrologers on Astrowani work in the Vedic tradition, so the reading is based on the sidereal zodiac and the traditional house system. Where a dosha such as Mangal, Kaal Sarp or Sade Sati is present, it is explained in context — including whether the classical cancellation conditions apply, which is the part most automated reports leave out.'],
      ['What to have ready',
       'The reading is only as accurate as the birth time. If you have a birth certificate or hospital record, use that rather than a remembered time. If the time is genuinely unknown, say so at the start — an astrologer can still read a great deal from the date and place, and will tell you which conclusions become less reliable.'],
    ],
    faqs: [
      ['What do I need for an online Kundli reading?', 'Your date of birth, time of birth and place of birth. Birth time is the one that matters most, because it determines the ascendant and the house positions.'],
      ['How is this different from a free Kundli report?', 'A generated report prints positions. A reading is a conversation — you can ask what a placement means for the decision you are actually facing, and the astrologer can tell you where the chart is and is not informative.'],
      ['Can I get the reading in Hindi?', 'Yes. Astrologer profiles list the languages each one speaks, so you can choose someone who works in the language you are most comfortable in.'],
    ],
    cta: ['Ready for your birth chart reading?', 'Choose an astrologer who works in the area you want to discuss, and start a chat, call or video consultation.', 'Find an astrologer'],
  },
  {
    file: 'tarot-reading.html',
    crumb: 'Tarot Reading',
    staffed: '13 (Tarot Reading)',
    h1: 'Online tarot card reading',
    lead: 'Talk to an online tarot reader about a question you are sitting with — no birth details needed.',
    title: 'Online Tarot Card Reading & Tarot Reader | Astrowani',
    desc: 'Connect with an online tarot reader on Astrowani. Discuss relationships, decisions and timing through a live tarot card reading over chat, call or video.',
    tiles: [
      [ICON.chat, 'Bring a question', 'Tarot works best on something specific — a decision, a relationship, a situation you are weighing up.'],
      [ICON.star, 'The spread is drawn', 'Your reader chooses a spread suited to the question and explains what each position represents.'],
      [ICON.book, 'Read together', 'Cards are discussed as themes and tendencies, not verdicts, and you can ask follow-up questions as you go.'],
    ],
    prose: [
      ['What a tarot reading is for',
       'A tarot card reading is a structured way of thinking through a question. The cards give a reader a framework — positions for what is behind a situation, what is in front of it, and what you may not be seeing — and the conversation that follows is where the value sits.',
       'Unlike a Kundli reading, tarot needs no birth details, which makes it a common starting point for people who do not have an accurate birth time or who want to ask about one specific thing rather than about their life as a whole.'],
      ['What it will not do',
       'A reading is for reflection, not prediction of fixed outcomes. Readers on Astrowani are asked to frame a spread in terms of tendencies and choices. If you want a definite yes or no about a medical, legal or financial matter, a tarot reading is the wrong tool and a good reader will tell you so.'],
    ],
    faqs: [
      ['Do I need to give my birth details for tarot?', 'No. A tarot reading works from your question, not from a birth chart. You can give your name and what you would like to ask about, and that is enough.'],
      ['How long does an online tarot reading take?', 'Most readings run between ten and thirty minutes depending on the spread and how much you want to discuss. You are billed per minute and can end the session whenever you choose.'],
      ['Can I ask about more than one question?', 'Yes, though a single clear question usually gives a more useful reading than several at once. Your reader will tell you if a question is too broad to spread for.'],
    ],
    cta: ['Have a question for the cards?', 'Browse readers who specialise in tarot, see their experience and start a session when you are ready.', 'Find a tarot reader'],
  },
  {
    file: 'numerology.html',
    crumb: 'Numerology',
    staffed: '16 (Numerology)',
    h1: 'Numerology consultation',
    lead: 'The numbers behind your birth date and name, read by an astrologer who works with them daily.',
    title: 'Numerology Consultation Online | Astrowani',
    desc: 'Book a numerology consultation on Astrowani. Discuss your life path number, name numerology and compatibility with a verified consultant by chat or call.',
    tiles: [
      [ICON.hash, 'Your core numbers', 'Life path from your date of birth, and the numbers derived from the spelling of your name.'],
      [ICON.star, 'What they are taken to mean', 'The traditional interpretation of each number, and how they interact rather than in isolation.'],
      [ICON.chat, 'Ask about your own case', 'A live session, so you can ask how an interpretation applies to the thing you are actually deciding.'],
    ],
    prose: [
      ['How numerology is read',
       'Numerology assigns meaning to numbers derived from your date of birth and the letters of your name. The life path number, calculated from the full birth date, is usually the starting point; name numerology adds a second layer, which is why some people consider a spelling change.',
       'A numerology consultation on Astrowani is a conversation rather than a printout. The consultant explains how each number is arrived at, what the tradition associates with it, and — importantly — where two numbers pull in different directions, which is usually the interesting part.'],
      ['Numerology alongside a birth chart',
       'Many people ask for numerology and a Kundli reading together. They are separate traditions and will not always agree. Where they differ, a good consultant will say so rather than force them into one story, and will tell you which they consider more informative for your question.'],
    ],
    faqs: [
      ['What do I need for a numerology consultation?', 'Your full date of birth and your name as you normally write it. If you are asking about a name change, bring both spellings.'],
      ['Does changing the spelling of my name change anything?', 'In the numerological tradition the name number changes with the spelling. Whether that is meaningful is a matter of belief, and a consultant should present it as a traditional interpretation rather than a guaranteed outcome.'],
      ['Can numerology tell me about compatibility?', 'It is commonly used that way, comparing life path numbers between two people. For marriage questions specifically, most people pair it with traditional Kundli matching.'],
    ],
    cta: ['Want your numbers read?', 'Choose a consultant who works with numerology and start a chat, call or video session.', 'Find a numerologist'],
  },
  {
    file: 'career-astrology.html',
    crumb: 'Career & Business',
    staffed: '42 Career, 47 Business',
    h1: 'Career and business astrology',
    lead: 'Discuss a job change, a stalled career or a business decision with an astrologer who reads charts for exactly this.',
    title: 'Career & Business Astrology Consultation | Astrowani',
    desc: 'Talk to an astrologer about career direction, job changes and business decisions. Online career and business astrology consultation on Astrowani.',
    tiles: [
      [ICON.briefcase, 'The houses that matter', 'The tenth house for profession, the sixth for service and work, the second and eleventh for income.'],
      [ICON.chart, 'Timing and dashas', 'Which period you are running, and what the tradition associates with it for work and money.'],
      [ICON.chat, 'A specific question', 'Bring the actual decision — a move, an offer, a partnership — rather than a general reading.'],
    ],
    prose: [
      ['What a career consultation looks at',
       'An online career astrology consultation reads the parts of your chart traditionally associated with work: the tenth house and its lord, the sixth house, the position of Saturn, and the dasha period you are currently running. A business astrology consultation adds the houses associated with partnership and gain.',
       'The useful version of this conversation is specific. "Should I take this offer", "my business has been flat for two years", "is this the year to go independent" — a chart can be read against a concrete question in a way it cannot be read against "tell me about my career".'],
      ['What it is and is not',
       'Astrology is one input among several, and a consultation here is not financial, legal or investment advice. An astrologer can tell you what the tradition associates with a period or a placement. The decision, and the due diligence behind it, stays yours — and any consultant who tells you otherwise is overselling.'],
    ],
    faqs: [
      ['Can an astrologer tell me whether to take a job offer?', 'They can tell you what your chart and current period traditionally indicate for a change of work, and talk through the timing. The decision remains yours and should also rest on the practical facts of the offer.'],
      ['Is this useful for business as well as employment?', 'Yes. Business questions bring in the houses associated with partnership, investment and gain, and several astrologers on Astrowani work specifically on business charts.'],
      ['Do I need my birth time for a career reading?', 'It helps a great deal, because the tenth house depends on the ascendant. Without a reliable birth time an astrologer can still read the planetary positions, and will tell you which conclusions become weaker.'],
    ],
    cta: ['Weighing up a move?', 'Find an astrologer who works on career and business charts, and talk it through.', 'Find an astrologer'],
  },
  {
    file: 'vastu.html',
    crumb: 'Vastu',
    staffed: '20 (Vastu)',
    h1: 'Vastu consultation',
    lead: 'Traditional Vastu guidance for a home, a new property or a workplace — discussed with a consultant, remotely.',
    title: 'Vastu Consultation Online for Home & Office | Astrowani',
    desc: 'Get an online Vastu consultation for your home, office or a property you are buying. Discuss directions, layout and traditional remedies with a consultant.',
    tiles: [
      [ICON.home, 'Share the layout', 'A floor plan or a few photographs, plus which way the main entrance faces.'],
      [ICON.compass, 'Directions and placement', 'Entrance, kitchen, bedrooms and water placement read against the traditional directional scheme.'],
      [ICON.chat, 'Practical remedies', 'What can reasonably be changed, and what the tradition suggests where it cannot.'],
    ],
    prose: [
      ['What a Vastu consultation covers',
       'Vastu Shastra is a traditional Indian system concerning the orientation and layout of buildings. A consultation looks at the direction the property faces, the placement of the entrance, kitchen, bedrooms and water sources, and how the space is used day to day.',
       'Online works well for this, because most of it is read from a plan. Consultants on Astrowani will ask for a rough floor plan or photographs and the facing direction, then go through the space with you over a call or video session.'],
      ['Before you buy or renovate',
       'The most common reason people ask is a property they are about to buy or a renovation they are about to start — the points at which a change is still cheap. Where a feature cannot be altered, the tradition offers remedies rather than demanding structural work, and a sensible consultant will say plainly which suggestions are significant and which are minor.'],
    ],
    faqs: [
      ['What do I need for an online Vastu consultation?', 'A floor plan if you have one, or photographs of the main rooms, and the direction the main entrance faces. A compass reading from your phone is accurate enough.'],
      ['Can Vastu be applied to a rented flat?', 'Yes. Most Vastu suggestions for a rented home concern placement and use of rooms rather than construction, so they can be followed without altering the property.'],
      ['Do I need a Vastu consultation before buying property?', 'Many people ask at that point, because it is when the layout can still be chosen. It is one consideration among the practical ones, not a replacement for a survey or legal checks.'],
    ],
    cta: ['Thinking about a property?', 'Talk to a consultant who works on Vastu for homes and workplaces.', 'Find a Vastu consultant'],
  },
  {
    file: 'lal-kitab.html',
    crumb: 'Lal Kitab',
    staffed: 'confirmed offered 2026-10-29; category pending',
    h1: 'Lal Kitab consultation',
    lead: 'Lal Kitab readings and its characteristically simple, practical remedies — discussed with an astrologer who works in the tradition.',
    title: 'Lal Kitab Consultation & Remedies Online | Astrowani',
    desc: 'Consult an astrologer who works in the Lal Kitab tradition. Discuss your chart and its simple, practical remedies online by chat, call or video on Astrowani.',
    tiles: [
      [ICON.book, 'A different reading', 'Lal Kitab reads a chart by its own rules, which do not always match classical Vedic interpretation.'],
      [ICON.chart, 'Your chart, its way', 'The same birth details, read through the Lal Kitab system of houses and planetary debts.'],
      [ICON.star, 'Simple remedies', 'The tradition is known for everyday remedies rather than elaborate or expensive rituals.'],
    ],
    prose: [
      ['What makes Lal Kitab different',
       'Lal Kitab is a twentieth-century body of astrological writing that reads a birth chart by its own rules. It uses the same planetary positions as Vedic astrology but interprets them differently, and it is best known for the idea of planetary debts and for remedies that are deliberately modest — an action, an object, a small habit, rather than an expensive ritual.',
       'Because its rules differ, a Lal Kitab reading will not always agree with a classical Vedic one. That is expected rather than a contradiction, and an astrologer working in both will tell you where the two diverge.'],
      ['About the remedies',
       'The remedies are the reason most people come to Lal Kitab. They are characteristically simple and inexpensive, which is part of the tradition rather than a shortcut. Treat them as a traditional practice: an astrologer on Astrowani should explain what a remedy is for and never present one as a guaranteed result, nor press you to buy anything in order to follow it.'],
    ],
    faqs: [
      ['How is Lal Kitab different from Vedic astrology?', 'It uses the same planetary positions but its own rules for reading them, and it places particular emphasis on simple, practical remedies. The two traditions will not always give the same answer.'],
      ['Are Lal Kitab remedies expensive?', 'They are known for being the opposite — typically small everyday actions or objects. If a remedy involves a significant purchase, ask why, and feel free to seek another opinion.'],
      ['Do I need my birth details?', 'Yes, the same as for any chart reading: date, time and place of birth. Birth time matters for the house positions.'],
    ],
    cta: ['Want a Lal Kitab reading?', 'Find an astrologer who works in the Lal Kitab tradition and talk through your chart.', 'Find an astrologer'],
  },
  {
    file: 'palmistry.html',
    crumb: 'Palmistry',
    staffed: '23 (Palmistry)',
    h1: 'Online palm reading',
    lead: 'Send a photograph of your palm and talk it through with a verified palmist — no birth details needed.',
    title: 'Online Palm Reading by Verified Palmists | Astrowani',
    desc: 'Get an online palm reading from a verified palmist on Astrowani. Send a clear photograph of your palm and discuss what the lines suggest by chat, call or video.',
    tiles: [
      [ICON.hand, 'Photograph your palm', 'Your dominant hand, in daylight, with the fingers open and the whole palm in frame. Both hands if you can.'],
      [ICON.chat, 'Send it in the chat', 'You can attach the photograph inside the consultation, so the palmist reads the hand rather than a description of it.'],
      [ICON.star, 'Talk through what it shows', 'The major lines and the shape of the hand, discussed live, with room to ask what any of it means.'],
    ],
    prose: [
      ['What a palm reading looks at',
       'Palmistry reads the hand itself: the three major lines that most people know as the heart, head and life lines, the mounts below the fingers, the shape and proportion of the palm and fingers, and the smaller marks that cross or break a line. A palmist works from what is actually in front of them, which is why the photograph matters more than anything you write.',
       'It needs no birth details at all. That makes it the one reading available to somebody who does not know their time of birth, and it is a common reason people choose it over a chart reading.'],
      ['How to take a usable photograph',
       'Use daylight rather than a flash, hold the hand flat with the fingers slightly apart, and fill the frame with the palm from wrist to fingertips. Avoid a hard shadow across the centre of the hand, which is where the major lines meet. Your dominant hand is the one usually read as the present; the other is often read alongside it, so send both if you can.'],
      ['What it can and cannot tell you',
       'Treat a palm reading the way you would any traditional reading: as a lens for thinking about a situation, not a forecast of events. A palmist on Astrowani should talk about tendencies and timing in general terms, and should never claim a line fixes how long you will live or guarantee a specific outcome. If you want something read against a specific date or decision, a kundli reading works from a chart and is the better fit.'],
    ],
    faqs: [
      ['Do I need my birth details for a palm reading?', 'No. Palmistry reads the hand, so it needs no date, time or place of birth. That is why it suits people who do not know their birth time.'],
      ['How do I send a photograph of my palm?', 'Attach it inside the consultation chat. Daylight, fingers slightly apart, and the whole palm from wrist to fingertips in frame.'],
      ['Which hand should I send?', 'Your dominant hand is the one usually read as the present. Many palmists read the other alongside it, so send both if you can.'],
      ['Can a palm reading tell me how long I will live?', 'No, and a palmist who claims otherwise is not reading the tradition honestly. The life line is read for vitality and broad periods, not as a lifespan.'],
    ],
    cta: ['Ready for a palm reading?', 'Find a palmist, send a clear photograph of your hand and talk through what it shows.', 'Find an astrologer'],
  },
];

function tile(svgPath, title, desc, i) {
  const anim = ['reveal-slide-left', 'reveal-scale', 'reveal-slide-right'][i % 3];
  const gold = i % 2 === 0;
  const bg = gold ? 'var(--gold)' : 'var(--maroon)';
  const stroke = gold ? 'var(--maroon)' : 'var(--cream)';
  return `      <div class="svc-tile reveal ${anim} tilt-card">
        <div class="svc-icon" style="background:${bg};">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>
        </div>
        <div class="svc-title">${title}</div>
        <div class="svc-desc">${desc}</div>
      </div>`;
}

function body(p) {
  const tiles = p.tiles.map((t, i) => tile(t[0], t[1], t[2], i)).join('\n');
  const prose = p.prose.map(([h, ...paras]) => `
<div class="band">
  <div class="block" style="max-width:760px;">
    <h2 class="serif section-title" style="margin-bottom:22px;">${h}</h2>
    ${paras.map((t) => `<p style="font-size:15.5px; line-height:1.85; color:var(--ink-soft); margin:0 0 18px;">${t}</p>`).join('\n    ')}
  </div>
</div>`).join('\n');

  const faqs = `
<div class="band band-tint">
  <div class="block" style="max-width:760px;">
    <div class="eyebrow">Frequently asked</div>
    <h2 class="serif section-title" style="margin-bottom:26px;">${p.crumb} questions</h2>
    ${p.faqs.map(([q, a]) => `<div style="margin:0 0 24px;">
      <h3 style="font-size:17px; margin:0 0 8px; color:var(--maroon);">${q}</h3>
      <p style="font-size:15.5px; line-height:1.8; color:var(--ink-soft); margin:0;">${a}</p>
    </div>`).join('\n    ')}
  </div>
</div>`;

  return `<main id="content">
<div class="page-header">
  <div class="crumb"><a href="index.html" style="color:var(--gold);">Home</a> · ${p.crumb}</div>
  <h1 class="serif">${p.h1}</h1>
  <p>${p.lead}</p>
</div>

<div class="band">
  <div class="block" style="max-width:860px; text-align:center;">
    <div class="eyebrow">How it works</div>
    <h2 class="serif section-title" style="margin-bottom:30px;">What to expect</h2>
    <div class="svc-grid" style="grid-template-columns:repeat(3, minmax(0,1fr));">
${tiles}
    </div>
  </div>
</div>
${prose}
${faqs}

<div class="band">
  <div class="block" style="max-width:720px; text-align:center;">
    <h2 class="serif section-title" style="margin-bottom:18px;">${p.cta[0]}</h2>
    <p style="font-size:15.5px; line-height:1.75; color:var(--ink-soft); margin:0 0 30px;">${p.cta[1]}</p>
    <a href="astrologers.html" class="btn-gold magnetic" style="display:inline-block; font-size:16px; padding:16px 34px;">${p.cta[2]}</a>
  </div>
</div>

</main>`;
}

// Only generate when run directly. apply-seo.js requires this file purely for
// PAGES, and importing a module must never write files as a side effect.
if (require.main === module) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const headEnd = tpl.indexOf('<main id="content">');
  const footStart = tpl.indexOf('<footer');
  if (headEnd < 0 || footStart < 0) {
    console.error('could not find <main> / <footer> in marriage.html — template shape changed.');
    process.exit(1);
  }
  const chromeTop = tpl.slice(0, headEnd);
  const chromeBottom = tpl.slice(footStart);
  const eol = tpl.includes('\r\n') ? '\r\n' : '\n';

  let wrote = 0;
  for (const p of PAGES) {
    // The SEO block is written by aw/apply-seo.js, which must run after this.
    const top = chromeTop.replace(/<!-- SEO:START[\s\S]*?<!-- SEO:END -->\r?\n?/, '');
    let html = top + body(p) + eol + eol + chromeBottom;
    html = html.split('\n').join(eol).split(eol + eol + eol).join(eol + eol);
    const out = path.join(ROOT, p.file);
    const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    // Never clobber hand edits silently: if the file exists and was not generated
    // by this script, stop rather than overwrite someone's work.
    if (prev && !prev.includes('<!-- generated by aw/service-pages.js -->')) {
      console.error(`REFUSING to overwrite ${p.file}: it exists and was not generated here.`);
      process.exit(1);
    }
    html = html.replace('<body>', '<body>\n<!-- generated by aw/service-pages.js -->');
    if (prev !== html) {
      wrote++;
      if (!check) fs.writeFileSync(out, html);
      console.log(`${check ? 'would write' : 'wrote'}  ${p.file}   (astrologers: ${p.staffed})`);
    }
  }
  console.log(`\n${check ? 'would write' : 'wrote'} ${wrote} page(s)`);
  console.log('NOW RUN: node aw/apply-seo.js  (these pages have no SEO block yet)');
}

module.exports.PAGES = PAGES;
