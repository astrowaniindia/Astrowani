require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://fxpoustnddrgumhwdcma.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) { console.error('list error', listErr); process.exit(1); }
  console.log('existing buckets:', buckets.map(b => b.name));
  if (buckets.find(b => b.name === 'app-images')) {
    console.log('bucket already exists');
    return;
  }
  const { data, error } = await supabase.storage.createBucket('app-images', {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
  });
  if (error) { console.error('create error', error); process.exit(1); }
  console.log('created bucket:', data);
})();
