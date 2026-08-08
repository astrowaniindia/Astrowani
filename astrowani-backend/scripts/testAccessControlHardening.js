// Verifies sql/hardening_02_access_control.sql was applied correctly: the original
// wallet-theft-by-anon-key exploit is closed, sensitive data is no longer directly
// readable by the public key, and every legitimate app write path still works.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O'; // same key both APKs ship
const service = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

async function main() {
  const tag = `hardcheck-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let customer, astro;

  try {
    customer = (await service.from('customers').insert([{ name: tag, mobile: `9${randDigits(9)}`, wallet_balance: 500 }]).select('id, wallet_balance').single()).data;
    astro = (await service.from('astrologers').insert([{
      first_name: tag, phone_number: `8${randDigits(9)}`, call_charge_per_minute: 25,
      bank_account_number: '1234567890', is_chat_enabled: false,
    }]).select('id').single()).data;

    // ═══ THE ORIGINAL CRITICAL EXPLOIT: direct wallet rewrite via the public key ═══
    const { error: walletWriteErr } = await anon.from('astrologers').update({ wallet_balance: 999999 }).eq('id', astro.id);
    check('anon CANNOT overwrite astrologer wallet_balance (the original exploit)', !!walletWriteErr);

    const { error: custWalletErr } = await anon.from('customers').update({ wallet_balance: 999999 }).eq('id', customer.id);
    check('anon CANNOT overwrite customer wallet_balance', !!custWalletErr);

    const { error: rateErr } = await anon.from('astrologers').update({ call_charge_per_minute: 1 }).eq('id', astro.id);
    check('anon CANNOT rewrite call_charge_per_minute', !!rateErr);

    // ═══ SENSITIVE DATA NO LONGER DIRECTLY READABLE ═══
    const { data: custRead } = await anon.from('customers').select('*').eq('id', customer.id);
    check('anon CANNOT read customers table at all', !custRead || custRead.length === 0);

    const { data: bankRead } = await anon.from('astrologers').select('bank_account_number').eq('id', astro.id);
    check('anon CANNOT read astrologer bank_account_number', !bankRead || bankRead.length === 0 || bankRead[0].bank_account_number === undefined);

    // ═══ LEGITIMATE APP FUNCTIONALITY STILL WORKS ═══
    const { error: toggleErr } = await anon.from('astrologers').update({ is_chat_enabled: true }).eq('id', astro.id);
    check('vendor app CAN still toggle is_chat_enabled', !toggleErr);

    const { data: listRead, error: listErr } = await anon.from('astrologers')
      .select('id, first_name, call_charge_per_minute, is_chat_enabled').eq('id', astro.id);
    check('customer app CAN still read astrologer list columns (name, charges, toggles)', !listErr && listRead?.length === 1);

    const { data: sessRow, error: sessErr } = await anon.from('chat_sessions').insert([{
      caller_id: customer.id, vendor_id: astro.id, per_minute_charge: 10, call_type: 'chat', is_active: false,
    }]).select('id').single();
    check('apps CAN still insert chat_sessions rows', !sessErr && !!sessRow);

    const { data: msgRow, error: msgErr } = await anon.from('chat_messages').insert([{
      room_id: 'room-x', session_id: sessRow?.id, sender_id: customer.id, receiver_id: astro.id, message: 'hi',
    }]).select('id').single();
    check('apps CAN still insert chat_messages', !msgErr && !!msgRow);

    const { error: callReqErr } = await anon.from('call_requests').insert([{
      customer_id: customer.id, astrologer_id: astro.id, status: 'pending',
    }]);
    check('apps CAN still insert call_requests', !callReqErr);

    // Cleanup rows this test created directly (bypass restricted RLS-less tables via service role)
    if (sessRow) await service.from('chat_messages').delete().eq('session_id', sessRow.id);
    if (sessRow) await service.from('chat_sessions').delete().eq('id', sessRow.id);
    await service.from('call_requests').delete().eq('astrologer_id', astro.id);
  } finally {
    if (astro) await service.from('astrologers').delete().eq('id', astro.id);
    if (customer) await service.from('customers').delete().eq('id', customer.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
