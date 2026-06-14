const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkSchema() {
  const { data: customerData, error: customerError } = await supabase.from('customers').select('wallet_balance').limit(1);
  if (customerError) console.error('Customer Error:', customerError.message);
  else console.log('Customer wallet_balance exists!');

  const { data: astroData, error: astroError } = await supabase.from('astrologers').select('video_price, audio_price, chat_price').limit(1);
  if (astroError) console.error('Astrologer Error:', astroError.message);
  else console.log('Astrologer price columns exist!');
}

checkSchema();
