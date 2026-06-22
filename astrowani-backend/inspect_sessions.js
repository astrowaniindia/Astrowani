const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';

// Provide explicit options to disable realtime since we don't need it and it causes WS errors in Node 20
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { enabled: false }
});

async function inspectChatSessions() {
  const { data, error } = await supabase.from('chat_sessions').select('*').limit(1);
  if (error) {
    console.error('Error fetching chat_sessions:', error.message);
  } else if (data && data.length > 0) {
    console.log('chat_sessions sample record:', JSON.stringify(data[0], null, 2));
  } else {
    console.log('chat_sessions table is empty, checking columns via empty select...');
    const { data: cols, error: colErr } = await supabase.from('chat_sessions').select('*').limit(0);
    if (colErr) console.error('Error:', colErr.message);
    else console.log('Table exists but has no data.');
  }
}

inspectChatSessions();
