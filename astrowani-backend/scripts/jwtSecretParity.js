// Does the LOCAL .env JWT_SECRET match the one production signs with?
//
// Run:  node --env-file=.env scripts/jwtSecretParity.js
//
// WHY THIS IS WORTH A SCRIPT. A local module that verifies tokens will answer 401
// to every real app token if the two secrets differ, and a 401 is indistinguishable
// from a genuine auth bug — the customer app even treats it as a session expiry and
// logs the person out, which is exactly what it did on the emulator. This answers
// the question in one request instead of a debugging session.
//
// It signs a token with the LOCAL secret and presents it to a PRODUCTION endpoint
// that requires authentication. 200 means the secrets match. 401 means they do not.
// No secret value is printed, and nothing is written anywhere.

const jwt = require('jsonwebtoken');

const UPSTREAM = 'https://backend.astrowani.com';
// A GET that requires a customer token and changes nothing.
const PROBE = '/api/notifications/list?limit=1';
const PHONE = '9999999999';

(async () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing - run with --env-file=.env');
  console.log(`local JWT_SECRET: present, ${secret.length} chars (value not printed)`);

  const token = jwt.sign({ phone: PHONE, userId: '00000000-0000-0000-0000-000000000000' }, secret, { expiresIn: '5m' });

  // Control first: no token at all must be refused, or a 200 below would prove nothing.
  const anon = await fetch(UPSTREAM + PROBE);
  console.log(`CONTROL  no token            -> ${anon.status}`);

  const r = await fetch(UPSTREAM + PROBE, { headers: { Authorization: 'Bearer ' + token } });
  console.log(`         locally-signed token -> ${r.status}`);

  if (anon.status === 200) {
    console.log('\nINCONCLUSIVE: that endpoint does not require auth. Pick another probe.');
  } else if (r.status === 401 || r.status === 403) {
    console.log('\nThe secrets DIFFER. A local module cannot verify a token the real app holds,');
    console.log('so every request from the app answers 401 and the app logs the person out.');
  } else if (r.status >= 200 && r.status < 300) {
    console.log('\nThe secrets MATCH. A 401 from a local module is a real auth bug, not a mismatch.');
  } else {
    console.log(`\nUnexpected status ${r.status} - inconclusive.`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
