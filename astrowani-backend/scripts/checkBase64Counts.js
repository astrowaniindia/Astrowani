require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check(table, column, idColumn = 'id') {
  const { data, error } = await supabase.from(table).select(`${idColumn}, ${column}`);
  if (error) { console.log(`[${table}.${column}] error: ${error.message}`); return; }
  const base64Rows = (data || []).filter(r => typeof r[column] === 'string' && r[column].startsWith('data:'));
  const totalBytes = base64Rows.reduce((sum, r) => sum + r[column].length, 0);
  console.log(`[${table}.${column}] total rows: ${data.length}, base64 rows: ${base64Rows.length}, approx size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

(async () => {
  await check('categories', 'image');
  await check('banners', 'image');
  await check('blogs', 'thumbnail');
  await check('remedy_items', 'image');
  await check('astrologers', 'profile_image');
  await check('customers', 'profile_image');
  await check('customers', 'hand_image');
})();
