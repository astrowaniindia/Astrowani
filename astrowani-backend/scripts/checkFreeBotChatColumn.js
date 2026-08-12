require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.from('customers').select('id, free_bot_chat_credited_at').limit(1);
  console.log(JSON.stringify({ data, error }, null, 2));
})();
