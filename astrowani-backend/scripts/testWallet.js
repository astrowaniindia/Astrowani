// Exercises src/wallet.js end-to-end against a throwaway customer + astrologer,
// created and deleted inside this script. Touches no real account.
const { createClient } = require('@supabase/supabase-js');
const wallet = require('../src/wallet');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TAG = `wallettest-${Date.now()}`;
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

(async () => {
  // ── setup ────────────────────────────────────────────────────────────────
  const { data: cust, error: cErr } = await db.from('customers')
    .insert([{ name: TAG, mobile: TAG, wallet_balance: 100 }]).select().single();
  if (cErr) { console.error('setup failed:', cErr.message); process.exit(2); }
  const { data: astro, error: aErr } = await db.from('astrologers')
    .insert([{ first_name: TAG, phone_number: TAG, wallet_balance: 0, today_earnings: 0, total_earnings: 0 }])
    .select().single();
  if (aErr) { await db.from('customers').delete().eq('id', cust.id); console.error('setup failed:', aErr.message); process.exit(2); }

  console.log(`\nthrowaway customer ${cust.id.slice(0, 8)} (₹100), astrologer ${astro.id.slice(0, 8)} (₹0)\n`);

  const bal = async (t, id, col = 'wallet_balance') =>
    Number((await db.from(t).select(col).eq('id', id).single()).data[col]);
  const ledgerCount = async (t, col, id) =>
    (await db.from(t).select('id', { count: 'exact', head: true }).eq(col, id)).count;

  try {
    // ── credit ───────────────────────────────────────────────────────────
    let b = await wallet.adjustCustomerWallet(cust.id, 50, { description: 'test credit' });
    check('credit returns new balance', b === 150, `got ${b}`);
    check('credit persisted', (await bal('customers', cust.id)) === 150);
    check('credit wrote a ledger row', (await ledgerCount('wallet_transactions', 'user_id', cust.id)) === 1);

    // ── debit ────────────────────────────────────────────────────────────
    b = await wallet.adjustCustomerWallet(cust.id, -30, { description: 'test debit' });
    check('debit returns new balance', b === 120, `got ${b}`);
    check('debit wrote a ledger row', (await ledgerCount('wallet_transactions', 'user_id', cust.id)) === 2);

    // ── overdraft is refused ─────────────────────────────────────────────
    let threw = null;
    try { await wallet.adjustCustomerWallet(cust.id, -9999); } catch (e) { threw = e; }
    check('overdraft throws InsufficientFunds', threw instanceof wallet.InsufficientFunds, threw?.message);
    check('overdraft left the balance untouched', (await bal('customers', cust.id)) === 120);
    check('overdraft wrote no ledger row', (await ledgerCount('wallet_transactions', 'user_id', cust.id)) === 2);

    // ── allowNegative opt-in (guarded by DB constraint if present) ─────
    threw = null;
    try {
      b = await wallet.adjustCustomerWallet(cust.id, -200, { allowNegative: true, description: 'admin correction' });
      check('allowNegative permits a negative balance', b === -80, `got ${b}`);
      await wallet.adjustCustomerWallet(cust.id, 200, { description: 'undo' });
    } catch (e) {
      check('DB constraint chk_customers_balance_nonneg blocks negative balance', e instanceof wallet.InsufficientFunds, e?.message);
    }

    // ── vendor earnings semantics ────────────────────────────────────────
    await wallet.adjustVendorWallet(astro.id, 500, { description: 'earnings' });
    check('vendor credit moves balance', (await bal('astrologers', astro.id)) === 500);
    check('vendor credit counts toward today_earnings', (await bal('astrologers', astro.id, 'today_earnings')) === 500);
    check('vendor credit counts toward total_earnings', (await bal('astrologers', astro.id, 'total_earnings')) === 500);

    await wallet.adjustVendorWallet(astro.id, -200, { description: 'withdrawal', countEarnings: false });
    check('withdrawal reduces balance', (await bal('astrologers', astro.id)) === 300);
    check('withdrawal does NOT reduce today_earnings', (await bal('astrologers', astro.id, 'today_earnings')) === 500);
    check('withdrawal does NOT reduce total_earnings', (await bal('astrologers', astro.id, 'total_earnings')) === 500);

    // ── transfer ─────────────────────────────────────────────────────────
    const custBefore = await bal('customers', cust.id);
    const astroBefore = await bal('astrologers', astro.id);
    const r = await wallet.transferCustomerToVendor(cust.id, astro.id, 100, {
      vendorAmount: 50, description: 'gift (50% share)',
    });
    check('transfer debits the customer in full', r.customerBalance === custBefore - 100, `got ${r.customerBalance}`);
    check('transfer credits the vendor its share only', r.vendorBalance === astroBefore + 50, `got ${r.vendorBalance}`);
    check('transfer persisted on both sides',
      (await bal('customers', cust.id)) === custBefore - 100 && (await bal('astrologers', astro.id)) === astroBefore + 50);

    // ── transfer refuses when the customer cannot cover it ────────────────
    const custPre = await bal('customers', cust.id);
    const astroPre = await bal('astrologers', astro.id);
    threw = null;
    try { await wallet.transferCustomerToVendor(cust.id, astro.id, 99999, { vendorAmount: 1 }); } catch (e) { threw = e; }
    check('unaffordable transfer throws', threw instanceof wallet.InsufficientFunds, threw?.message);
    check('unaffordable transfer credited the vendor nothing',
      (await bal('astrologers', astro.id)) === astroPre, 'vendor was credited for a failed debit!');
    check('unaffordable transfer left the customer untouched', (await bal('customers', cust.id)) === custPre);

    // ── idempotency ──────────────────────────────────────────────────────
    const key = `test-idem-${TAG}`;
    const before = await bal('customers', cust.id);
    await wallet.adjustCustomerWallet(cust.id, 25, { idempotencyKey: key, description: 'idem' });
    const afterFirst = await bal('customers', cust.id);
    await wallet.adjustCustomerWallet(cust.id, 25, { idempotencyKey: key, description: 'idem replay' });
    const afterSecond = await bal('customers', cust.id);
    check('first keyed call applies', afterFirst === before + 25, `got ${afterFirst}`);
    check('replayed keyed call is a no-op', afterSecond === afterFirst,
      afterSecond === afterFirst + 25 ? '(DOUBLE-APPLIED — run hardening_03 SQL)' : `got ${afterSecond}`);

    // ── unknown account ──────────────────────────────────────────────────
    threw = null;
    try { await wallet.adjustCustomerWallet('00000000-0000-0000-0000-000000000000', 10); } catch (e) { threw = e; }
    check('unknown customer throws', !!threw, 'silently succeeded');
  } finally {
    // ── teardown ─────────────────────────────────────────────────────────
    await db.from('wallet_transactions').delete().eq('user_id', cust.id);
    await db.from('vendor_wallet_transactions').delete().eq('vendor_id', astro.id);
    await db.from('customers').delete().eq('id', cust.id);
    await db.from('astrologers').delete().eq('id', astro.id);
    const leftC = (await db.from('customers').select('id').eq('id', cust.id)).data.length;
    const leftA = (await db.from('astrologers').select('id').eq('id', astro.id)).data.length;
    console.log(`\nteardown: customer rows left=${leftC}, astrologer rows left=${leftA}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
