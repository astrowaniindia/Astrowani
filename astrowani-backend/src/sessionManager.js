// astrowani-backend/src/sessionManager.js

const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');
const { checkAstrologerBusy } = require('./busyStatus');
const { notifyWaitlistIfFree } = require('./waitlist');
const { logError } = require('./errorLogger');
const wallet = require('./wallet');

// Initialize Supabase Client with Service Role Key for administrative access
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

class SessionManager {
  constructor() {
    this.pollingInterval = 30 * 1000; // Poll every 30 seconds
    this.resetInterval = 60 * 60 * 1000; // Check resets every hour
    this.timer = null;
    this.resetTimer = null;
    this.io = null;

    // Reset timers are persisted in `app_settings` (see loadEarningsResetState()) —
    // NOT kept only in memory. An in-memory-only clock resets to "unknown" on every
    // process start, and any fresh process — including a developer's local backend
    // pointed at the same production Supabase project, which is exactly how this bit
    // once before — would then assume a reset is overdue and wipe every astrologer's
    // earnings. Loaded lazily (DB read can't happen in a constructor) on the first
    // checkEarningsResets() call; these two fields are undefined until then.
    this.lastDailyResetDate = undefined;
    this.lastMonthlyResetMs = undefined;
    this.earningsResetStateLoaded = false;
    // Re-entrancy guard for the 30s billing poll — see checkActiveSessions().
    this.isCheckingSessions = false;
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
    this.checkWalletHealth();
    this.resetTimer = setInterval(() => {
      this.checkEarningsResets();
      this.endStaleLiveSessions();
      this.checkWalletHealth();
    }, this.resetInterval);
  }

  /**
   * Wallet/billing reconciliation — catches silent financial anomalies that the bug-scan
   * agent structurally can't see (it only reads crashes/errors, not data correctness).
   * Deliberately detection-only: it never touches wallet_balance or chat_sessions rows
   * itself. Anomalies go through logError() so they land in both the file-based log
   * (/api/bug-agent/errors) and, once SENTRY_DSN is configured, the backend Sentry project —
   * a human always makes the actual correction by hand. Runs on startup and hourly
   * (same cadence as the earnings-reset check).
   */
  async checkWalletHealth() {
    try {
      const staleBillingCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const [{ data: negCustomers }, { data: negAstros }, { data: stuckSessions }] = await Promise.all([
        supabase.from('customers').select('id, wallet_balance').lt('wallet_balance', 0),
        supabase.from('astrologers').select('id, wallet_balance').lt('wallet_balance', 0),
        supabase.from('chat_sessions')
          .select('id, vendor_id, caller_id, next_billing_at')
          .eq('is_active', true)
          .lt('next_billing_at', staleBillingCutoff),
      ]);

      if (negCustomers && negCustomers.length) {
        logError('wallet-reconciliation', new Error(
          `${negCustomers.length} customer(s) with negative wallet_balance: ` +
          negCustomers.map((c) => `${c.id}=${c.wallet_balance}`).join(', ')
        ));
      }
      if (negAstros && negAstros.length) {
        logError('wallet-reconciliation', new Error(
          `${negAstros.length} astrologer(s) with negative wallet_balance: ` +
          negAstros.map((a) => `${a.id}=${a.wallet_balance}`).join(', ')
        ));
      }
      if (stuckSessions && stuckSessions.length) {
        logError('wallet-reconciliation', new Error(
          `${stuckSessions.length} chat_session(s) still is_active=true with next_billing_at ` +
          `more than 5 minutes overdue — the 30s billing poll should never let this happen: ` +
          stuckSessions.map((s) => s.id).join(', ')
        ));
      }
    } catch (err) {
      console.error('[SessionManager] checkWalletHealth error:', err.message);
    }
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

  // Reads the two reset timestamps from `app_settings` (shared key/value table also
  // used for the banner interval etc.) so they survive process restarts. Called once,
  // lazily, from the first checkEarningsResets() — see the constructor's comment.
  // Deliberately does NOT default a missing/unreadable value to "overdue": if we don't
  // have a trustworthy prior timestamp, we seed it to "now" (i.e. assume a reset just
  // happened) rather than risk wiping every astrologer's earnings on an unrelated
  // process's first boot. The daily reset stays effectively self-healing regardless —
  // once a real date is persisted, a missed midnight is still caught correctly on the
  // next real day change.
  async loadEarningsResetState() {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['last_daily_earnings_reset', 'last_monthly_earnings_reset_ms']);
      const byKey = {};
      (data || []).forEach((r) => { byKey[r.key] = r.value; });

      this.lastDailyResetDate = byKey.last_daily_earnings_reset || null;

      const persistedMs = Number(byKey.last_monthly_earnings_reset_ms);
      this.lastMonthlyResetMs = Number.isFinite(persistedMs) && persistedMs > 0 ? persistedMs : Date.now();
      if (!Number.isFinite(persistedMs) || persistedMs <= 0) {
        // First time this code has run since the DB-backed change shipped (or the
        // setting row doesn't exist yet) — persist "now" so we don't re-seed (and
        // don't fire a reset) on every subsequent restart either.
        await this.setAppSetting('last_monthly_earnings_reset_ms', String(this.lastMonthlyResetMs));
      }
    } catch (e) {
      console.error('[SessionManager] Failed to load earnings-reset state, defaulting to "just reset" to avoid a spurious wipe:', e.message);
      this.lastDailyResetDate = null;
      this.lastMonthlyResetMs = Date.now();
    } finally {
      this.earningsResetStateLoaded = true;
    }
  }

  async setAppSetting(key, value) {
    try {
      await supabase
        .from('app_settings')
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    } catch (e) {
      console.error(`[SessionManager] Failed to persist app_settings.${key}:`, e.message);
    }
  }

  /**
   * Resets today_earnings to 0 for all astrologers when a new calendar day begins.
   * Resets total_earnings to 0 for all astrologers every 30 days.
   * Both timestamps are DB-backed (see loadEarningsResetState()) so a process restart
   * — anyone's, anywhere — can never re-trigger a reset that already happened.
   */
  async checkEarningsResets() {
    if (!this.earningsResetStateLoaded) await this.loadEarningsResetState();

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
        await this.setAppSetting('last_daily_earnings_reset', todayStr);
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
        await this.setAppSetting('last_monthly_earnings_reset_ms', String(this.lastMonthlyResetMs));
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

      // Requests that just timed out may have been an astrologer's only busy-source —
      // check each distinct astrologer once and notify their waitlist if now free.
      const freedAstroIds = new Set([
        ...(missedCalls || []).map((r) => r.astrologer_id),
        ...(missedChats || []).map((r) => r.receiver_id),
      ].filter(Boolean));
      // Parallel, not sequential — each astrologer's check/notify is independent,
      // and during a traffic spike/outage backlog this can be dozens of astrologers
      // freed in one sweep (was previously one 4-query checkAstrologerBusy at a time).
      await Promise.all([...freedAstroIds].map(async (astroId) => {
        const stillBusy = await checkAstrologerBusy(supabase, astroId);
        if (!stillBusy.busy) {
          await notifyWaitlistIfFree(supabase, sendPush, astroId);
        }
      }));
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
   *
   * LOAD-SCALING FIX (2026-08-08 — see security-audit-2026-08-08.md): this used to process
   * every due session sequentially (await-in-a-for-loop), and each iteration did a second,
   * completely unused round-trip fetching the customer's wallet_balance (set onto
   * session.customers, which nothing downstream ever read — dead code, pure waste). At low
   * concurrent-session counts the serial cost is invisible; at scale (hundreds of
   * simultaneously active paid calls/chats) it stretches one 30s tick's wall-clock time
   * linearly with active-session count. Worse, the setInterval driving this never checked
   * whether the previous tick had finished, so a tick that ran long could overlap the next
   * one processing the SAME sessions concurrently. Fixed by: dropping the dead customer
   * fetch, running each due session's billing concurrently (process_session_billing's own
   * row-level FOR UPDATE lock makes concurrent calls for DIFFERENT sessions safe — see
   * sql/process_session_billing.sql), and an isCheckingSessions guard so an overlap-prone
   * long tick skips the next one instead of double-processing.
   */
  async checkActiveSessions() {
    if (this.isCheckingSessions) {
      console.warn('[SessionManager] Previous checkActiveSessions tick still running — skipping this one.');
      return;
    }
    this.isCheckingSessions = true;
    const now = new Date();
    try {
      // Narrowed to the columns processBilling/this loop actually reads — this
      // runs every 30s for as long as any session is active, so full-row
      // fetch cost scales with active-session count on every tick.
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('is_active', true)
        .lte('next_billing_at', now.toISOString());

      if (error) throw error;
      if (!sessions || sessions.length === 0) return;

      console.log(`[SessionManager] Found ${sessions.length} sessions due for billing.`);

      await Promise.all(sessions.map((session) => this.processBilling(session)));
    } catch (err) {
      console.error('[SessionManager] Error in checkActiveSessions:', err.message);
    } finally {
      this.isCheckingSessions = false;
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
   * Activates a session when a client signals connection.
   *
   * SECURITY (fixed 2026-08-08 — see security-audit-2026-08-08.md): this used to update by
   * id alone, with no check that the session hadn't already ended. The `signal_connection`
   * socket event that calls this has no auth of its own, so a stray or deliberately replayed
   * signal for a sessionId that already finished (real hangup, insufficient balance, admin
   * force-end) would resurrect it and restart the 60s billing clock — silently re-billing a
   * customer for a call that isn't happening. Now only activates a session that has never
   * been ended (`ended_at IS NULL`); a replay against an already-terminated session is a no-op.
   */
  async activateSession(sessionId) {
    console.log(`[SessionManager] Activating session ${sessionId}`);
    const nextBilling = new Date(Date.now() + 60000).toISOString(); // First billing in 1 minute

    const { data, error } = await supabase
      .from('chat_sessions')
      .update({
        is_active: true,
        next_billing_at: nextBilling,
        started_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .is('ended_at', null)
      .select('id');

    if (error) {
      console.error(`[SessionManager] Activation failed for ${sessionId}:`, error.message);
      return false;
    }
    if (!data || data.length === 0) {
      console.warn(`[SessionManager] Activation no-op for ${sessionId} — session already ended or missing.`);
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

    if (session?.caller_id) {
      await this.maybeRewardReferral(session.caller_id);
    }

    // If this was the astrologer's only busy-source, let anyone waiting for them know.
    if (session?.vendor_id) {
      const stillBusy = await checkAstrologerBusy(supabase, session.vendor_id);
      if (!stillBusy.busy) {
        await notifyWaitlistIfFree(supabase, sendPush, session.vendor_id);
      }
    }
  }

  /**
   * Rewards a referrer the first time their referred customer completes a session — proof
   * of genuine engagement, not just a signup. No-ops if there's no pending referral for this
   * customer, or if this isn't their first-ever completed session (ended_at set).
   */
  async maybeRewardReferral(referredCustomerId) {
    try {
      const { data: referral } = await supabase
        .from('referrals')
        .select('*')
        .eq('referred_customer_id', referredCustomerId)
        .eq('status', 'pending')
        .maybeSingle();
      if (!referral) return;

      // Only need to know "is this the first or second+ completed session" —
      // .limit(2) stops there instead of counting a long-time customer's full history.
      const { data: completedRows } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('caller_id', referredCustomerId)
        .not('ended_at', 'is', null)
        .limit(2);
      if ((completedRows || []).length !== 1) return; // not their first completed session

      const { data: referrer } = await supabase
        .from('customers').select('fcm_token').eq('id', referral.referrer_customer_id).single();
      if (!referrer) return;

      // Keyed on the referral row, so this sweep running twice — or two sessions
      // ending close together — cannot pay the same referral bonus twice.
      await wallet.adjustCustomerWallet(
        referral.referrer_customer_id,
        Number(referral.reward_amount),
        {
          description: 'Referral reward — your friend completed their first session',
          idempotencyKey: `referral:${referral.id}`,
        },
      );

      await supabase
        .from('referrals')
        .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
        .eq('id', referral.id);

      if (referrer.fcm_token) {
        sendPush(referrer.fcm_token, {
          title: 'Referral Reward!',
          body: `You earned ₹${referral.reward_amount} because your friend completed their first session.`,
          data: { type: 'referral_reward' },
        }).catch((e) => console.error('[referral] push error:', e.message));
      }

      // In-app popup (ReferralRewardPopup, customer app) for when the referrer
      // already has the app open — the push above covers the backgrounded case.
      if (this.io) {
        this.io.to(referral.referrer_customer_id).emit('referral_rewarded', {
          amount: Number(referral.reward_amount),
        });
      }
    } catch (err) {
      console.error('[SessionManager] maybeRewardReferral error:', err.message);
    }
  }
}

module.exports = new SessionManager();
