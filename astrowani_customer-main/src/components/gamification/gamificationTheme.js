// Shared visual tokens for the gamification layer.
//
// WHY THIS FILE EXISTS: the shop screens learned this lesson already (see
// components/shop/shopTheme.js) — six screens each hand-styling their own greys and radii
// drift apart within a week. The gamification pieces sit on Home, on the profile, on the
// referral screen and inside the post-session sheet, so they are guaranteed to drift
// unless the values live in one place.
//
// The palette is a deliberate narrowing of Theme/Colors.js: maroon for structure, a warm
// gold for anything EARNED, and a single ember for flame. Gold is reserved — if everything
// is gold nothing reads as a reward.
//
// Add here rather than inventing a hex in a component.

import {COLORS} from '../../Theme/Colors';

export const GAME = {
  // Surfaces — warm, matching the shop's off-white rather than a stock grey
  card: '#FFFFFF',
  cardAlt: '#FAF5EF',
  screenBg: '#F7F3EF',
  border: '#F0E6DC',
  borderStrong: '#E4D7C8',

  // Text
  text: '#2B1A11',
  textSoft: '#6B5A50',
  textMuted: '#9A8B80',

  // Brand
  brand: COLORS.AstroMaroon, // #592a19
  brandLight: '#8A4526',
  tint: COLORS.AstroSoftOrange, // #f4d8bc

  // EARNED. Reserved for rewards, filled progress and lit flames — nothing else.
  gold: '#C8871B',
  goldLit: '#F2B33D',
  goldFaint: '#FBEFD8',

  // Flame
  ember: '#E2601A',
  emberCore: '#FFF0B8',

  // Growth (the tree, completed states)
  leaf: '#4F7A3A',
  leafLight: '#7BA55E',

  // Neutral "not yet" — the empty slot, the unlit lamp, the dark house.
  // Deliberately a warm grey, not #CCC: a cold grey next to maroon reads as broken.
  dim: '#D9CCBF',
  dimSoft: '#EFE7DE',
};

// Duration tokens. Kept together so the whole layer can be slowed down or sped up
// at once, and so nothing accidentally ships at 2 seconds while its neighbour is at 200ms.
export const GAME_MS = {
  micro: 160, // a tap acknowledging itself
  reveal: 420, // one element arriving
  stagger: 90, // gap between siblings arriving in sequence
  celebrate: 900, // a reward landing
  spin: 4200, // the chakra
};

export const GAME_RADIUS = {sm: 8, md: 12, lg: 16, pill: 999};
