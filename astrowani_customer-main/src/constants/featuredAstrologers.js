// The faces shown on the gift reveal and the free-call login screen.
//
// THESE ARE BUNDLED ON PURPOSE AND MUST STAY BUNDLED (owner, 2026-10-26). They are the
// first thing a brand-new install sees, before an account exists and often before the
// network has settled, so they must draw instantly and identically every time. They are
// the floor: the gift screen shows exactly this list and nothing else, and the login
// screen starts from it and swaps live astrologers in over the top where it can
// (see src/utils/featuredAstrologersLive.js).
//
// The photos were taken once from the live profiles and cropped to 168px squares (see
// src/assets/images/astrologers/). They do NOT track the database: if one of these
// astrologers leaves or changes their photo, THIS FILE has to be updated by hand and the
// app re-shipped. That is the cost of the guarantee above, and it is the intended trade.
//
// `id` is the real astrologers.id, and it is not decoration -- it is what stops a live
// astrologer being drawn twice when they are also in this list.
//
// Order is left-to-right as drawn. Astro Rishiraj sits dead centre at the owner's
// request and is NEVER replaced, which is why the list is an odd length -- adding a
// sixth face moves him off centre, so if one is ever added, add a seventh too.
export const FEATURED_ASTROLOGERS = [
  { key: 'soni', id: '30e6aef2-906e-4245-8194-3e5018e4ef4d', name: 'Astro Soni', image: require('../assets/images/astrologers/soni.jpg') },
  { key: 'dilip', id: 'f36f19e8-5fbc-4e6f-a9f7-f9cd73eafcb3', name: 'Dilip Sharma', image: require('../assets/images/astrologers/dilip.jpg') },
  { key: 'rishiraj', id: '4158f1c0-7a73-48cf-a6b4-10a59db4778c', name: 'Astro Rishiraj', image: require('../assets/images/astrologers/rishiraj.jpg') },
  { key: 'anshuman', id: 'a5f81290-d233-43fb-a986-83121d6e4568', name: 'Acharya Anshuman', image: require('../assets/images/astrologers/anshuman.jpg') },
  { key: 'poorvi', id: 'ec150bc0-d4dd-41bf-b1da-d3d8bd803c87', name: 'Poorvi Bansal', image: require('../assets/images/astrologers/poorvi.jpg') },
  // A sixth face is ready to drop in if the row should be longer -- but see the note
  // about centring above before adding it:
  // { key: 'pradeep', id: '9d533174-d419-4d62-9b00-b3f05abdab02', name: 'Pradeep Kumar', image: require('../assets/images/astrologers/pradeep.jpg') },
];

// The one face that is never swapped out, by position and by identity.
export const PINNED_CENTRE_ID = '4158f1c0-7a73-48cf-a6b4-10a59db4778c';

export default FEATURED_ASTROLOGERS;
