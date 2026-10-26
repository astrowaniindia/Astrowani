// The faces shown on the free-call login screen.
//
// THESE ARE BUNDLED ON PURPOSE AND MUST STAY BUNDLED (owner, 2026-10-26). This row is
// the first thing a brand-new install sees, before any account exists and often before
// the network has settled, so it must draw instantly and identically every time. Reading
// it from /api/astrologers would mean an empty hole on a cold start, a different line-up
// on every launch, and a face disappearing the moment someone goes offline or is
// suspended -- none of which is acceptable for what is effectively artwork.
//
// The photos were taken once from the live profiles and cropped to 168px squares (see
// src/assets/images/astrologers/). They do NOT track the database: if one of these
// astrologers leaves or changes their photo, THIS FILE has to be updated by hand and the
// app re-shipped. That is the cost of the guarantee above, and it is the intended trade.
//
// Order is left-to-right as drawn. Astro Rishiraj sits dead centre at the owner's
// request, which is why the list is an odd length -- adding a sixth face moves him off
// centre, so if one is ever added, add a seventh too.
export const FEATURED_ASTROLOGERS = [
  { key: 'soni', name: 'Astro Soni', image: require('../assets/images/astrologers/soni.jpg') },
  { key: 'dilip', name: 'Dilip Sharma', image: require('../assets/images/astrologers/dilip.jpg') },
  { key: 'rishiraj', name: 'Astro Rishiraj', image: require('../assets/images/astrologers/rishiraj.jpg') },
  { key: 'anshuman', name: 'Acharya Anshuman', image: require('../assets/images/astrologers/anshuman.jpg') },
  { key: 'poorvi', name: 'Poorvi Bansal', image: require('../assets/images/astrologers/poorvi.jpg') },
  // A sixth face is ready to drop in if the row should be longer -- but see the note
  // about centring above before adding it:
  // { key: 'pradeep', name: 'Pradeep Kumar', image: require('../assets/images/astrologers/pradeep.jpg') },
];

export default FEATURED_ASTROLOGERS;
