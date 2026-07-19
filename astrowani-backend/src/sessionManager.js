// astrowani-backend/src/sessionManager.js

const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');

// Initialize Supabase Client with Service Role Key for administrative access
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// First-ever session for a customer is free for this long, after which normal per-minute
// billing resumes for the remainder of that same session.
const FREE_CONSULTATION_MS = 3 * 60 * 1000;

class SessionManager {
  constructor() {
    this.pollingInterval = 30 * 1000; // Poll every 30 seconds
    this.resetInterval = 60 * 60 * 1000; // Check resets every hour
    this.timer = null;
    this.resetTimer = null;
    this.io = null;

    // Track last reset times in memory.
    // Initialize lastDailyResetDate to null so the first run always performs today's reset
    // (catches cases where the server was down at midnight).
    this.lastDailyResetDate = null;
    // Initialize lastMonthlyResetMs to 31 days ago so the first run checks if a monthly reset is due.
    this.lastMonthlyResetMs = Date.now() - 31 * 24 * 60 * 60 * 1000;
    console.log('SessionManager Instance Created.');
  }

  start(io) {
    this.io = io;
    if (this.timer) return;
    console.log(`SessionManager Background Worker Started (Interval: ${this.pollingInterval}ms)`);
    this.timer = setInterval(() => {
      this.checkActiveSessions();
      this.markStaleRequestsMissed();
    }, this.pollingInterval);
    // Run earnings reset check hourly, and immediately on startup
    this.checkEarningsResets();
    this.endStaleLiveSessions();
    this.resetTimer = setInterval(() => {
      this.checkEarningsResets();
      this.endStaleLiveSessions();
    }, this.resetInterval);
  }

  /**
   * Safety net for live_sessions left is_active=true forever — the normal end path
   * (GoLiveScreen unmount → POST /api/live/:id/end) never runs if the vendor's app
   * crashes or is force-killed mid-broadcast, and there's no heartbeat to detect that
   * more precisely. A live stream realistically never runs for hours, so anything still
   * "active" past a generous ceiling is almost certainly abandoned — auto-close it and
   * clear the astrologer's is_live flag so it stops appearing in the customer Live list.
   */
  async endStaleLiveSessions() {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // 6 hours
    try {
      const { data: stale } = await supabase
        .from('live_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('is_active', true)
        .lt('started_at', cutoff)
        .select('id, astrologer_id');
      if (!stale || !stale.length) return;

      const astroIds = [...new Set(stale.map((s) => s.astrologer_id).filter(Boolean))];
      if (astroIds.length) {
        await supabase.from('astrologers').update({ is_live: false }).in('id', astroIds);
      }
      if (this.io) {
        stale.forEach((s) =>
          this.io.to('live_' + s.id).emit('live_ended', { sessionId: s.id, reason: 'stale_timeout' })
        );
      }
      console.log(`[SessionManager] Auto-ended ${stale.length} stale live session(s)`);
    } catch (err) {
      console.error('[SessionManager] endStaleLiveSessions error:', err.message);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.resetTimer) {
      clearInterval(this.resetTimer);
      this.resetTimer = null;
    }
    console.log('SessionManager Background Worker Stopped.');
  }

  /**
   * Resets today_earnings to 0 for all astrologers when a new calendar day begins.
   * Resets total_earnings to 0 for all astrologers every 30 days.
   */
  async checkEarningsResets() {
    const now = new Date();
    const todayStr = now.toDateString(); // e.g. "Fri Jun 20 2026"

    // Daily reset: fires on first run (lastDailyResetDate is null) and on each new day
    if (this.lastDailyResetDate !== todayStr) {
      console.log(`[SessionManager] Daily earnings reset triggered (${this.lastDailyResetDate} → ${todayStr})`);
      const { error } = await supabase
        .from('astrologers')
        .update({ today_earnings: 0 })
        .gt('today_earnings', 0); // only update rows that have earnings to clear
      if (error) {
        console.error('[SessionManager] Daily earnings reset failed:', error.message);
      } else {
        console.log('[SessionManager] Daily earnings reset complete for', todayStr);
        this.lastDailyResetDate = todayStr;
      }
    }

    // Monthly reset: fires every 30 days
    const daysSinceMonthlyReset = (now.getTime() - this.lastMonthlyResetMs) / (1000 * 60 * 60 * 24);
    if (daysSinceMonthlyReset >= 30) {
      console.log(`[SessionManager] Monthly earnings reset triggered (${daysSinceMonthlyReset.toFixed(1)} days since last reset)`);
      const { error } = await supabase
        .from('astrologers')
        .update({ total_earnings: 0 })
        .gt('total_earnings', 0);
      if (error) {
        console.error('[SessionManager] Monthly earnings reset failed:', error.message);
      } else {
        console.log('[SessionManager] Monthly earnings reset complete');
        this.lastMonthlyResetMs = now.getTime();
      }
    }
  }

  /**
   * Marks call/chat requests as MISSED when they sit 'pending' longer than ~75s
   * (the customer-side timeout is 60s; this is the authoritative backup for cases
   * where the customer app closed before its timer fired).
   */
  async markStaleRequestsMissed() {
    const cutoff = new Date(Date.now() - 75 * 1000).toISOString();
    try {
      const { data: missedCalls } = await supabase.from('call_requests')
        .update({ status: 'missed' })
        .eq('status', 'pending')
        .lt('created_at', cutoff)
        .select('customer_id, astrologer_id, room_id');
      const { data: missedChats } = await supabase.from('chat_requests')
        .update({ status: 'missed' })
        .eq('status', 'pending')
        .lt('created_at', cutoff)
        .select('caller_id, receiver_id');

      await this.notifyMissed(missedCalls, 'customer_id', 'astrologer_id', 'call');
      await this.notifyMissed(missedChats, 'caller_id', 'receiver_id', 'chat');
    } catch (err) {
      console.error('[SessionManager] markStaleRequestsMissed error:', err.message);
    }
  }

  /**
   * Pushes a "missed" notification to the customer side of each flipped request
   * (backup path — the customer app itself may already show an inline alert if it's
   * still open; this covers the case where it's backgrounded or killed) AND a
   * cancel-notification push to the vendor side, so a heads-up "Incoming Call/Chat"
   * notification doesn't keep sitting there — with working Accept/Reject — advertising
   * a request the customer already gave up on. This sweep only catches requests whose
   * customer never got to fire its own 60s timeout (e.g. its app died first); the fast
   * path for a live customer app is the 'cancel_call' socket handler in index.js.
   */
  async notifyMissed(rows, customerKey, astrologerKey, kind) {
    if (!rows || !rows.length) return;
    try {
      const astroIds = [...new Set(rows.map((r) => r[astrologerKey]).filter(Boolean))];
      const custIds = [...new Set(rows.map((r) => r[customerKey]).filter(Boolean))];
      const [{ data: astros }, { data: customers }] = await Promise.all([
        supabase.from('astrologers').select('id, first_name, last_name, fcm_token').in('id', astroIds),
        supabase.from('customers').select('id, fcm_token').in('id', custIds),
      ]);

      const astroNameById = {};
      const astroTokenById = {};
      (astros || []).forEach((a) => {
        astroNameById[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer';
        astroTokenById[a.id] = a.fcm_token;
      });
      const tokenById = {};
      (customers || []).forEach((c) => { tokenById[c.id] = c.fcm_token; });

      for (const row of rows) {
        const token = tokenById[row[customerKey]];
        const name = astroNameById[row[astrologerKey]] || 'Astrologer';
        if (token) {
          await sendPush(token, {
            title: kind === 'call' ? 'Missed Call' : 'Missed Chat',
            body: `${name} didn't pick up your ${kind} request.`,
            data: { type: 'missed_session', kind },
          });
        }

        const vendorToken = astroTokenById[row[astrologerKey]];
        if (vendorToken) {
          await sendPush(vendorToken, {
            data: {
              type: 'cancel_incoming_request',
              roomId: kind === 'call' ? row.room_id || '' : '',
              callerId: kind === 'chat' ? row[customerKey] || '' : '',
            },
          });
        }
      }
    } catch (err) {
      console.error('[SessionManager] notifyMissed error:', err.message);
    }
  }

  /**
   * Authoritative Polling Loop
   * Finds sessions where is_active=true AND next_billing_at <= NOW
   */
  async checkActiveSessions() {
    const now = new Date();
    try {
      // Fetch active sessions first without joining customers
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('is_active', true)
        .lte('next_billing_at', now.toISOString());

      if (error) throw error;
      if (!sessions || sessions.length === 0) return;

      console.log(`[SessionManager] Found ${sessions.length} sessions due for billing.`);

      for (const session of sessions) {
        // First-ever session for this customer — free for the opening window; skip
        // charging (and skip the opaque billing RPC entirely) while still inside it.
        // Once the window elapses, normal per-minute billing resumes for what's left.
        if (session.is_free_session && session.started_at) {
          const elapsed = now.getTime() - new Date(session.started_at).getTime();
          if (elapsed < FREE_CONSULTATION_MS) {
            await supabase
              .from('chat_sessions')
              .update({ next_billing_at: new Date(now.getTime() + 60000).toISOString() })
              .eq('id', session.id);
            continue;
          }
        }

        // Fetch customer data manually using caller_id
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('wallet_balance')
          .eq('id', session.caller_id)
          .single();

        if (!customerError && customerData) {
          session.customers = customerData;
        }

        await this.processBilling(session);
      }
    } catch (err) {
      console.error('[SessionManager] Error in checkActiveSessions:', err.message);
    }
  }

  /**
   * Processes a single billing cycle (1 minute)
   */
  async processBilling(session) {
    console.log(`[SessionManager] Billing session ${session.id} via RPC`);

    try {
      const { data: success, error } = await supabase.rpc('process_session_billing', {
        p_session_id: session.id
      });

      if (error) throw error;

      if (success) {
        console.log(`[SessionManager] Billing successful for ${session.id}`);
      } else {
        console.log(`[SessionManager] Billing failed for ${session.id} (Insufficient balance). Terminating.`);
        if (this.io) {
          this.io.to(session.caller_id).emit('session_ended', { sessionId: session.id, reason: 'insufficient_balance' });
          this.io.to(session.vendor_id).emit('session_ended', { sessionId: session.id, reason: 'insufficient_balance' });
          this.io.to(session.id).emit('session_ended', { sessionId: session.id, reason: 'insufficient_balance' });
        }
        await this.terminateSession(session.id, 'Insufficient balance');
      }
    } catch (err) {
      console.error(`[SessionManager] Failed to process billing for ${session.id}:`, err.message);
    }
  }

  /**
   * Activates a session when a client signals connection
   */
  async activateSession(sessionId) {
    console.log(`[SessionManager] Activating session ${sessionId}`);
    const nextBilling = new Date(Date.now() + 60000).toISOString(); // First billing in 1 minute
    
    const { error } = await supabase
      .from('chat_sessions')
      .update({
        is_active: true,
        next_billing_at: nextBilling,
        started_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      console.error(`[SessionManager] Activation failed for ${sessionId}:`, error.message);
      return false;
    }
    return true;
  }

  /**
   * Terminates a session (sets is_active=false)
   */
  async terminateSession(sessionId, reason = 'Normal termination') {
    console.log(`[SessionManager] Terminating session ${sessionId}. Reason: ${reason}`);
    
    // Fetch session first to get caller_id and vendor_id
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('caller_id, vendor_id')
      .eq('id', sessionId)
      .single();

    await supabase
      .from('chat_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId);
    
    // Notify clients directly via their personal rooms + session room
    if (this.io && session) {
      this.io.to(session.caller_id).emit('session_ended', { sessionId, reason });
      this.io.to(session.vendor_id).emit('session_ended', { sessionId, reason });
      this.io.to(sessionId).emit('session_ended', { sessionId, reason });
    }
  }
}

module.exports = new SessionManager();
