const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getAllTables() {
  const { data, error } = await supabase.rpc('get_tables'); // Or try to query information_schema if rpc fails
  if (error) {
     // fallback
     console.log("RPC failed, fetching a known table to verify");
  } else {
     console.log("Tables:", data);
  }
}

getAllTables();
