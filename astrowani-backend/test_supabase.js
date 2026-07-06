const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSupabase() {
  console.log('Connecting to Supabase...');
  try {
    const { data: customers, error: errCust } = await supabase.from('customers').select('id, mobile, name').limit(5);
    console.log('Customers:', customers);
  } catch (err) {
    console.error('Connection Exception:', err.message);
  }
}

testSupabase();
