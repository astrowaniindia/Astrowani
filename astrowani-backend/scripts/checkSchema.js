require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await db.from('astrologers').select('*').limit(1);
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  console.log('Columns:', Object.keys(data[0] || {}));
}
main().then(() => process.exit(0));
