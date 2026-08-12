require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const phone = process.argv[2];
(async () => {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, mobile, created_at')
    .eq('mobile', phone);
  console.log(JSON.stringify({ data, error }, null, 2));
})();
