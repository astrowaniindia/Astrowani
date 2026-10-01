// Tests the astrologerFanout non-display-change filter.
//
// WHY THIS MATTERS MORE THAN MOST TESTS: a false positive here is invisible and
// expensive. If the filter wrongly classifies a real change as non-display, an
// astrologer goes online and no customer is told — the list just stays wrong
// until someone refocuses the screen. So most of these cases assert that a
// change IS relayed, not that it is skipped.
//
// Run: node scripts/testFanoutFilter.js    (no database, no network)

const { isNonDisplayChange, NON_DISPLAY_COLUMNS } = require('../src/astrologerFanout');

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} — expected ${expected}, got ${actual}`);
  }
}

// A realistic full row, as REPLICA IDENTITY FULL delivers it.
const base = {
  id: '1f70210e-6234-4f49-a764-13e851968e1e',
  first_name: 'Test', last_name: 'Astrologer',
  wallet_balance: '5663', today_earnings: '0', total_earnings: '5673',
  is_online: true, is_available: true, is_live: false,
  is_chat_enabled: true, is_call_enabled: true, is_video_call_enabled: true,
  call_charge_per_minute: '25', chat_charge_per_minute: '20', video_charge_per_minute: '40',
  approval_status: 'approved', is_suspended: false, hidden_from_customers: false,
  badge: 'verified', average_rating: '4.5', total_reviews: 12,
  fcm_token: 'tok-aaa', voip_token: null, profile_pic_url: 'https://x/y.jpg',
  admin_notes: null, bank_account_number: '1234', upi_id: 'a@b',
};

const upd = (changes) => ({
  eventType: 'UPDATE',
  old: { ...base },
  new: { ...base, ...changes },
});

console.log('\n--- SKIPPED (noise that cannot change what a customer sees) ---');
// The whole reason this exists: one billed minute.
check('billing: wallet+today+total earnings', isNonDisplayChange(upd({
  wallet_balance: '5675.5', today_earnings: '12.5', total_earnings: '5685.5',
})), true);
check('earnings reset: today_earnings zeroed', isNonDisplayChange(upd({ today_earnings: '0' })), true);
check('fcm_token refreshed on login', isNonDisplayChange(upd({ fcm_token: 'tok-bbb' })), true);
check('voip token registered', isNonDisplayChange(upd({ voip_token: 'vtok', voip_platform: 'ios' })), true);
check('logout clears fcm_token', isNonDisplayChange(upd({ fcm_token: null })), true);
check('bank/payout details edited', isNonDisplayChange(upd({ bank_account_number: '9999', upi_id: 'c@d' })), true);
check('admin_notes edited', isNonDisplayChange(upd({ admin_notes: 'called them' })), true);
check('no-op write (nothing differs)', isNonDisplayChange(upd({})), true);
check('billing + fcm together', isNonDisplayChange(upd({ wallet_balance: '1', fcm_token: 'z' })), true);

console.log('\n--- RELAYED (must always reach customers) ---');
check('went online', isNonDisplayChange(upd({ is_online: false })), false);
check('went offline', isNonDisplayChange(upd({ is_online: false, is_available: false })), false);
check('GO LIVE', isNonDisplayChange(upd({ is_live: true })), false);
check('chat toggle off', isNonDisplayChange(upd({ is_chat_enabled: false })), false);
check('call toggle off', isNonDisplayChange(upd({ is_call_enabled: false })), false);
check('video toggle off', isNonDisplayChange(upd({ is_video_call_enabled: false })), false);
check('price change', isNonDisplayChange(upd({ call_charge_per_minute: '30' })), false);
check('suspended by admin', isNonDisplayChange(upd({ is_suspended: true })), false);
// NOTE: base.approval_status is already 'approved', so this must change it to
// something different — setting it to the same value is a no-op write, which is
// correctly skipped. (The first version of this test got that wrong.)
check('approval revoked', isNonDisplayChange(upd({ approval_status: 'rejected' })), false);
check('approval granted (pending -> approved)', isNonDisplayChange({
  eventType: 'UPDATE',
  old: { ...base, approval_status: 'pending' },
  new: { ...base, approval_status: 'approved' },
}), false);
check('hidden_from_customers flipped', isNonDisplayChange(upd({ hidden_from_customers: true })), false);
check('badge granted', isNonDisplayChange(upd({ badge: 'celebrity' })), false);
check('rating recomputed', isNonDisplayChange(upd({ average_rating: '4.7', total_reviews: 13 })), false);
check('profile photo changed', isNonDisplayChange(upd({ profile_pic_url: 'https://x/new.jpg' })), false);
check('name changed', isNonDisplayChange(upd({ first_name: 'New' })), false);
check('REAL change alongside billing noise', isNonDisplayChange(upd({
  wallet_balance: '9999', is_online: false,
})), false);

console.log('\n--- FAILS SAFE (cannot prove it is noise => relay it) ---');
check('INSERT', isNonDisplayChange({ eventType: 'INSERT', new: { ...base }, old: {} }), false);
check('DELETE', isNonDisplayChange({ eventType: 'DELETE', old: { ...base }, new: {} }), false);
check('no old (REPLICA IDENTITY not FULL)', isNonDisplayChange({
  eventType: 'UPDATE', old: { id: base.id }, new: { ...base, wallet_balance: '1' },
}), false);
check('empty old', isNonDisplayChange({ eventType: 'UPDATE', old: {}, new: { ...base } }), false);
check('null payload', isNonDisplayChange(null), false);
check('undefined payload', isNonDisplayChange(undefined), false);
check('garbage payload', isNonDisplayChange({ foo: 'bar' }), false);
check('unknown new column defaults to display-relevant', isNonDisplayChange({
  eventType: 'UPDATE',
  old: { ...base, some_future_column: 'a' },
  new: { ...base, some_future_column: 'b' },
}), false);

console.log('\n--- sanity ---');
const mustNotBeIgnored = [
  'is_online', 'is_available', 'is_live', 'is_chat_enabled', 'is_call_enabled',
  'is_video_call_enabled', 'approval_status', 'is_suspended', 'badge',
  'average_rating', 'total_reviews', 'hidden_from_customers', 'profile_pic_url',
  'call_charge_per_minute', 'chat_charge_per_minute', 'video_charge_per_minute',
];
const leaked = mustNotBeIgnored.filter((c) => NON_DISPLAY_COLUMNS.has(c));
check(`no customer-visible column is in the ignore list (${mustNotBeIgnored.length} checked)`, leaked.length, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
