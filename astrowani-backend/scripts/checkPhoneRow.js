require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const phone = process.argv[2];
(async () => {
  const { data, error } = await supabase
    .from('astrologers')
    .select('id, first_name, last_name, phone_number, approval_status, is_suspended, created_at')
    .eq('phone_number', phone);
  console.log(JSON.stringify({ data, error }, null, 2));
})();
