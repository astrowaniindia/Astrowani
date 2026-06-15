const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function addBalance() {
  const { data, error } = await supabase
    .from('customers')
    .update({ wallet_balance: 5000 })
    .ilike('email', 'testuser@example.com')
    .select();
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success! Updated balance for:", data);
  }
}

addBalance();
