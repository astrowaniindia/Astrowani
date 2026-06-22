// One-off: seed (or update) an admin account in the `admins` table.
//
//   node scripts/seedAdmin.js <email> <password> [name]
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (service role needed
// to insert into `admins`). Run after applying sql/admin_schema.sql.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const [, , emailArg, passwordArg, nameArg] = process.argv;
const email = (emailArg || 'admin@astrowani.com').toLowerCase().trim();
const password = passwordArg || 'admin123';
const name = nameArg || 'Admin';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const password_hash = bcrypt.hashSync(password, 10);
  // Upsert by email so re-running just resets the password.
  const { data: existing } = await supabase.from('admins').select('id').eq('email', email).limit(1);
  let error;
  if (existing && existing.length) {
    ({ error } = await supabase.from('admins').update({ password_hash, name }).eq('email', email));
  } else {
    ({ error } = await supabase.from('admins').insert([{ email, password_hash, name, role: 'admin' }]));
  }
  if (error) {
    console.error('Failed to seed admin:', error.message);
    process.exit(1);
  }
  console.log(`✅ Admin ready → email: ${email}  password: ${password}`);
  process.exit(0);
})();
