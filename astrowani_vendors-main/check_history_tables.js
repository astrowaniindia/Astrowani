const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTables() {
  const tables = ['call_history', 'chat_history', 'live_history', 'video_call_history'];
  for (const table of tables) {
    console.log(`Checking table: ${table}`);
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Error checking ${table}:`, error.message);
    } else {
      console.log(`Columns in ${table}:`, data.length > 0 ? Object.keys(data[0]) : 'No rows found to infer schema (please insert one or look at schema)');
    }
  }
}

checkTables();
