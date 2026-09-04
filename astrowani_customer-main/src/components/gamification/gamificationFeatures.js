// The catalogue of not-yet-live gamification features.
//
// ONE SOURCE FOR THREE SURFACES: the Home discovery strip, the hub screen, and each
// feature's own screen all read from this list. Adding a feature, renaming one, or pulling
// one from the tour is a single edit here — the surfaces have no per-feature code.
//
// EVERY ENTRY IS "COMING SOON" AND THAT FRAMING IS LOAD-BEARING. None of these award
// anything: the reward economics are undecided and there is no backend behind the streak,
// the wheel or the mala. Presenting them as usable would mean a customer taps a wheel,
// "wins" 25% off, and has nothing to redeem — which is worse than not showing them at all.
// The demos on each screen are interactive so the idea lands, but they are labelled as
// previews and they hand out nothing.
//
// WHEN ONE GOES LIVE: remove it from this list in the same change that ships its real
// surface. A feature that is both "coming soon" on the tour and live elsewhere is a bug.

export const FEATURES = [
  {
    id: 'streak',
    title: 'Deepak Streak',
    tagline: 'Light a lamp every day you visit',
    icon: 'local-fire-department',
    blurb:
      'A diya for every day you open Astrowani. Seven in a row completes the week, and the lamps carry over as long as you keep coming back.',
    how: [
      'One tap lights the day’s lamp.',
      'Miss a day and you get one forgiveness a week — a long streak will not be wiped for a single missed morning.',
      'Reaching day 3, 7 and 21 unlocks a reward.',
    ],
    note: 'The day rolls over at midnight IST, wherever you are.',
  },
  {
    id: 'chakra',
    title: 'Rashi Chakra',
    tagline: 'One free spin, every day',
    icon: 'casino',
    blurb:
      'A twelve-part wheel of discounts. One spin a day, free — on consultations, reports, gemstones and pujas.',
    how: [
      'The wheel is free. There will never be a spin you can pay for.',
      'Most spins give a small discount; a few wedges hold something much better.',
      'Your spin refreshes every morning.',
    ],
    note: 'Odds will be published in full when this goes live.',
  },
  {
    id: 'chart',
    title: 'Chart Completeness',
    tagline: 'See how much of your kundli we actually hold',
    icon: 'grid-on',
    blurb:
      'Your birth chart, drawn with a house darkened for everything we are still missing. The more complete it is, the sharper every reading an astrologer can give you.',
    how: [
      'Your exact birth time matters most — without it a chart can only ever be approximate.',
      'Place of birth and date carry the rest.',
      'Filling the gaps takes a minute and improves every reading afterwards.',
    ],
    note: 'This one reads your real profile — the number you see is genuine.',
  },
  {
    id: 'tree',
    title: 'Kalpavriksha',
    tagline: 'Your referrals, growing',
    icon: 'park',
    blurb:
      'The wish-fulfilling tree grows a leaf for every friend who joins through you, and bears fruit at five, ten and twenty-five.',
    how: [
      'A leaf appears once your friend completes their first session.',
      'You still earn ₹50 per friend exactly as you do today — nothing about that changes.',
      'The fruits are extra, on top of the cash.',
    ],
    note: 'This one shows your real referral count.',
  },
  {
    id: 'mala',
    title: 'Mala Counter',
    tagline: 'Count your jaap, 108 beads',
    icon: 'blur-circular',
    blurb:
      'A full mala on screen for the mantra your astrologer has prescribed. Tap a bead for each repetition and keep your place across rounds.',
    how: [
      'All 108 beads plus the sumeru, so you can see exactly how far round you are.',
      'Completing a round keeps your count for the day rather than starting you over.',
      'Useful on its own — no reward needed.',
    ],
    note: 'Your astrologer’s prescribed mantra will appear here automatically.',
  },
];

export const getFeature = id => FEATURES.find(f => f.id === id) || null;
