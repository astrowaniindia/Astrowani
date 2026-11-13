// node scripts/testProfileText.js — offline checks for src/profileText.js.
const { cleanAstrologerProfile: c } = require('../src/profileText');
let f = 0; const ok = (n, x) => { console.log((x ? '  ok  ' : '  FAIL') + ' ' + n); if (!x) f++; };
const evil = c({ first_name: '<img src=x onerror=alert(1)>', last_name: 'Sharma<script>', bio: 'a > b',
  languages: ['Hindi', '<svg onload=alert(1)>', ''], profile_pic_url: 'javascript:alert(1)', bank_name: 'SBI<b>' });
ok('no angle brackets survive in any field', !/[<>]/.test(JSON.stringify(evil)));
ok('javascript: photo dropped to null', evil.profile_pic_url === null);
ok('data: photo dropped', c({ profile_pic_url: 'data:image/png;base64,AAA' }).profile_pic_url === null);
ok('http (not https) photo dropped', c({ profile_pic_url: 'http://x.com/a.jpg' }).profile_pic_url === null);
// Positive controls: ordinary values must pass through unchanged.
const good = { first_name: 'Pandit Ram', last_name: "D'Souza", bio: 'Vedic astrologer, 12 yrs. Q&A welcome!',
  languages: ['Hindi', 'English', 'मराठी'], profile_pic_url: 'https://abc.supabase.co/storage/v1/object/public/app-images/a.jpg',
  upi_id: 'ram@okaxis', experience: 12 };
ok('CONTROL ordinary profile unchanged', JSON.stringify(c(good)) === JSON.stringify(good));
ok('CONTROL absent fields stay absent', !('bio' in c({ first_name: 'A' })));
ok('CONTROL null stays null', c({ bio: null }).bio === null);
process.exit(f ? 1 : 0);
