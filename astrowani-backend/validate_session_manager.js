/**
 * validate_session_manager.js
 * 
 * This script simulates the SessionManager's billing loop.
 * It manually performs the steps of checkActiveSessions and processBilling.
 * 
 * Usage: node validate_session_manager.js
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Mock Environment (Replace with real values or ensure .env is loaded)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.log('--- ERROR ---');
  console.log('SUPABASE_SERVICE_ROLE_KEY is missing.');
  console.log('Please run: export SUPABASE_SERVICE_ROLE_KEY=your_key_here');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-my-custom-header': 'my-app-name' } },
});

async function runValidation() {
  console.log('🚀 Starting SessionManager Validation...');

  // 1. Find a test customer and vendor
  const { data: customer } = await supabase.from('customers').select('*').limit(1).single();
  const { data: vendor } = await supabase.from('astrologers').select('*').limit(1).single();

  if (!customer || !vendor) {
    console.error('Could not find customer or vendor for testing.');
    return;
  }

  console.log(`Using Customer: ${customer.name} (Balance: ${customer.wallet_balance})`);
  console.log(`Using Vendor: ${vendor.first_name} (Balance: ${vendor.wallet_balance || 0})`);

  // 2. Create a mock active session due for billing
  console.log('Creating mock session...');
  const { data: session, error: sessErr } = await supabase.from('chat_sessions').insert([{
    caller_id: customer.id,
    vendor_id: vendor.id,
    per_minute_charge: 10,
    is_active: true,
    call_type: 'chat',
    started_at: new Date().toISOString(),
    next_billing_at: new Date(Date.now() - 5000).toISOString() // 5 seconds ago (due now)
  }]).select().single();

  if (sessErr) {
    console.error('Failed to create mock session:', sessErr.message);
    return;
  }

  console.log(`Mock session created: ${session.id}`);

  // 3. Import and run SessionManager logic
  // Since we can't easily run the actual interval, we manually trigger processBilling
  console.log('Triggering manual billing cycle...');
  
  const sessionManager = require('./src/sessionManager');
  // Inject the supabase client with service role
  // (In the actual app, it reads from process.env)
  
  try {
    await sessionManager.processBilling(session);
    console.log('✅ Billing process completed.');

    // 4. Verification
    console.log('Verifying results...');
    
    const { data: updatedCust } = await supabase.from('customers').select('wallet_balance').eq('id', customer.id).single();
    const { data: updatedVend } = await supabase.from('astrologers').select('wallet_balance').eq('id', vendor.id).single();
    const { data: updatedSess } = await supabase.from('chat_sessions').select('is_active, next_billing_at').eq('id', session.id).single();
    const { data: tx } = await supabase.from('wallet_transactions').select('*').eq('session_id', session.id).single();

    console.log(`New Customer Balance: ${updatedCust.wallet_balance} (Expected: ${customer.wallet_balance - 10})`);
    console.log(`New Vendor Balance: ${updatedVend.wallet_balance} (Expected: ${(vendor.wallet_balance || 0) + 10})`);
    console.log(`Session Still Active: ${updatedSess.is_active}`);
    console.log(`Next Billing Advanced: ${updatedSess.next_billing_at}`);
    console.log(`Transaction Logged: ${tx ? 'YES' : 'NO'}`);

    if (updatedCust.wallet_balance === customer.wallet_balance - 10 && tx) {
        console.log('\n✨ VALIDATION SUCCESSFUL ✨');
    } else {
        console.log('\n❌ VALIDATION FAILED ❌');
    }

  } catch (err) {
    console.error('Error during validation:', err.message);
  } finally {
    // Cleanup: Terminate the mock session
    await supabase.from('chat_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', session.id);
    console.log('Mock session cleaned up.');
  }
}

runValidation();
