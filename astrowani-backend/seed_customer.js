const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function seedCustomer() {
  const { data, error } = await supabase.from('customers').insert([
    { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Test User', email: 'testuser@example.com', mobile: '9999999999', wallet_balance: 200 }
  ]);
  if (error) console.error('Error:', error.message);
  else console.log('Inserted customer user_123 with 200 balance!');
}

seedCustomer();
