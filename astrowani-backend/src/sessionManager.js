// astrowani-backend/src/sessionManager.js

const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');
const { checkAstrologerBusy } = require('./busyStatus');
const { notifyWaitlistIfFree } = require('./waitlist');
const { logError } = require('./errorLogger');
const wallet = require('./wallet');
const vendorDevices = require('./vendorDevices');
const holds = require('./astrologerHolds');
const localTest = require('./freeCallLocalTest');
const { freeCallPayout, normaliseMilestones } = require('./freeCallPayout');
const freeCallAttempts = require('./freeCallAttempts');

// Initialize Supabase Client with Service Role Key for administrative access
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Set false the first time the database answers "no such column" for is_free, so a
// backend running against a pre-migration database stops paying for the failed query
// on every 30s tick. NOTE it latches per PROCESS: restart the backend after applying
// sql/free_call_in_app.sql or the filter stays off.
let freeColumnAvailable = true;
const isMissingFreeColumn = (error) =>
  !!error && (error.code === '42703' || error.code === 'PGRST204'
    || /is_free/.test(error.message || ''));

// Same idea for free_call_bookings.kind (sql/free_call_instant.sql), latching per
// process for the same reason — restart the backend after applying that file.
// How long an instant free-call booking may sit without ever reaching a call before it
// is handed back to the customer. Long enough that somebody who rings, gets no answer
// and wanders off for a few minutes still resumes the same attempt; short enough that
// they can try again the same evening.
const STALE_INSTANT_BOOKING_MS = 30 * 60 * 1000;

// The line between "a call happened" and "a connection was attempted". Below this the
// booking is not completed, the astrologer is not held, nobody is paid, and an instant
// attempt is handed back to the customer rather than counted as their free call. One
// constant for all four, because if they ever disagree somebody is charged, paid or
// blocked for a conversation that did not take place.
const MIN_REAL_CALL_SECONDS = 30;
/**
 * A free call must run this long before the customer is offered paid minutes, and
 * before the astrologer is reserved while they decide.
 *
 * Below it there is nothing to upsell: a call that lasted ninety seconds did not answer
 * anybody's question, and following it with a price list reads as a shakedown. It is
 * also the line for the rating prompt — asking "how was Astrowani?" after a call that
 * barely happened collects noise and annoys people.
 *
 * Reserving the astrologer is gated on the same number on purpose: a hold placed after
 * a call nobody had takes a working astrologer off the market for ninety seconds for an
 * offer that will never be shown.
 */
const MIN_UPSELL_SECONDS = 540;
/**
 * Above this, but below MIN_UPSELL_SECONDS, the customer is not offered more minutes —
 * they are offered the chance to give a Dakshina instead. A six-minute conversation was
 * worth something but was not cut short mid-flow, so "buy more time" is the wrong ask
 * and "thank them if you want to" is the right one.
 */
const MIN_DAKSHINA_SECONDS = 180;

/**
 * Whether ENDING a free call should immediately reserve the astrologer for the
 * "5 / 10 / 15 more minutes" sheet.
 *
 * FALSE, and no longer because the sheet is hidden — the sheet is back on since
 * 2026-10-04. It is false because the hold MOVED: Shagun Arpan now runs in front of the
 * continue sheet, and a Razorpay round trip would have burned most of a 60-second
 * reservation before the customer ever saw the offer. The hold is created when the sheet
 * actually opens instead — see openDecisionHold() in src/freeCallRoutes.js, which does
 * the same placeHold with the same holdDecisionSeconds and sends the same
 * `astrologer_hold_started` notice.
 *
 * So turning this back to `true` would not restore anything missing; it would reserve
 * every astrologer twice, once at call end and once on open.
 */
const UPSELL_SHEET_ENABLED = false;

let bookingKindAvailable = true;
const isMissingColumn = (error, column) =>
  !!error && (error.code === '42703' || error.code === 'PGRST204' || error.code === '42P10'
    || new RegExp(column).test(error.message || ''));

class SessionManager {
  // Longest a billed consultation may run before it is treated as abandoned.
  // 2h, set by the product owner 2026-08-27 — deliberately tighter than the 6h
  // used for live streams, because every extra minute here is money off a real
  // customer. See endStaleBilledSessions().
  static MAX_BILLED_SESSION_MS = 2 * 60 * 60 * 1000;

  // How long a CUSTOMER may be disconnected from a billed session before it is ended.
  //
  // 30s (owner's decision 2026-10-02, was 2 min). NOTE THE TRADE-OFF THIS REOPENS: a phone
  // lock or app switch drops the socket for ~40-60s, which is why this was raised from 45s
  // to 2 min in the first place. A customer who takes an incoming call mid-reading will now
  // come back to a closed session and must start (and pay for) a new one.
  //
  // It is NOT what stops someone farming free consultation — SERVICE_PRESENCE_GRACE_MS in
  // index.js does that, by refusing to carry their messages after 20s. Nothing is served or
  // billed during this window either way, so shortening it buys no extra protection.
  //
  // Accurate only to one polling interval (30s): absence is noticed by checkActiveSessions,
  // so the real time-to-end via THIS path is 30-60s. The socket-disconnect path in index.js
  // (SESSION_ABANDON_GRACE_MS) is event-driven and hits the 30s exactly; it is also the path
  // that fires in practice.
  static SESSION_PRESENCE_GRACE_MS = 30 * 1000;

  // How long the ASTROLOGER may be disconnected from a billed session (socket gone —
  // network blip, elevator, tunnel) before it is ended.
  //
  // 30s (owner's decision 2026-10-02), matching the customer so both countdowns read the
  // same. THIS REVERSES THE 2026-09-24 PRODUCT DECISION and the 5-minute allowance that
  // replaced it, so do not "restore" either without asking: the reason they existed is that
  // a 10-second Wi-Fi cut measured on 2026-09-24 took ~50s to reconnect (Wi-Fi
  // re-association + socket.io backoff), and the 45s grace in place then killed a live call
  // mid-consultation. At 30s that outcome is expected rather than exceptional — the
  // astrologer loses the remaining earnings and the customer must re-open and pay from
  // minute one. Both sides are now TOLD what is happening and see the countdown, which is
  // what makes this acceptable; the silent version of it was not.
  //
  // Billing is paused while absent, so the customer is never charged for the gap.
  static VENDOR_ABSENT_GRACE_MS = 30 * 1000;

  // How long an ASTROLOGER may keep a billed session open while their app is in the
  // background (pressed Home / switched apps) before it is ended. Billing continues
  // as normal during it.
  static VENDOR_BACKGROUND_GRACE_MS = 5 * 60 * 1000;

  // How long a pending call/chat request keeps ringing before it counts as missed.
  // Product decision 2026-09-24: 5 minutes (was ~60s).
  static REQUEST_RING_MS = 5 * 60 * 1000;

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
    // When a participant of an active session was first seen NOT connected to its
    // socket room: "sessionId:caller" / "sessionId:vendor" -> timestampMs.
    // See checkActiveSessions().
    this.absentSince = new Map();
    // Astrologer app sent to the background mid-session: "sessionId:vendorId" -> ms.
    // Set/cleared by the vendor app's session_app_state socket event (index.js).
    this.vendorBackgroundSince = new Map();
    // When billing for a session was paused because someone was away: sessionId -> ms.
    // On resume the next charge is pushed back by the pause, so away time is never billed.
    this.pausedSince = new Map();
    console.log('SessionManager Instance Created.');
  }

  // Attaching the socket server is SEPARATE from starting the billing worker.
  //
  // `this.io` used to be set only inside start(), which is gated on
  // ENABLE_SESSION_MANAGER. Every client notification terminateSession sends — the
  // `session_ended` that tells the other side a call is over — is behind `if (this.io)`,
  // so on any process where that flag is not 'true' a session could be ended with NOBODY
  // told, and the other side would sit on "Connecting…" / a live-looking call forever.
  // Production does set the flag, so this never bit a real customer, but tying "can we
  // tell people the call ended" to "do we run billing here" is the wrong dependency and
  // it hid the bug during local testing.
  attachIo(io) {
    this.io = io;
  }

  start(io) {
    this.io = io;
    if (this.timer) return;
    console.log(`SessionManager Background Worker Started (Interval: ${this.pollingInterval}ms)`);
    this.timer = setInterval(() => {
      this.checkActiveSessions();
      this.markStaleRequestsMissed();
      this.endStaleBilledSessions();
      this.endAbandonedFreeCalls();
      this.endOverdueFreeCalls();
      this.sweepExpiredHolds();
      this.cancelStaleInstantBookings();
      this.chaseWhatsAppEscalations();
    }, this.pollingInterval);
    // Run earnings reset check hourly, and immediately on startup
    this.checkEarningsResets();
    this.endStaleLiveSessions();
    // Run at boot too: a crash or VPS reboot leaves sessions is_active with
    // nobody left to end them, and that is precisely how a phone-died session
    // survives to keep billing.
    this.endStaleBilledSessions();
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
   * Auto-end billed consultations that have run past any plausible length.
   *
   * WHY THIS EXISTS — the leak it closes:
   * checkActiveSessions() bills every is_active session whose next_billing_at has
   * passed, every 30 seconds, with NO upper bound on how long a session may run.
   * A session only ends when someone's client calls POST /api/call/end. If a phone
   * dies mid-call — battery, crash, force-kill, tunnel — doEndCall() never runs,
   * that request never arrives, and the row stays is_active forever. Billing then
   * keeps deducting a minute at a time until the customer's WALLET RUNS DRY. That
   * was the only backstop.
   *
   * Live streaming already had this guard (endStaleLiveSessions, 6h) with a comment
   * reasoning about force-killed apps and the absence of a heartbeat. It was built
   * for the path that costs nothing, and never for the one that costs money.
   *
   * WHY 2 HOURS: a real consultation does not run this long; anything past it is
   * almost certainly a dead phone rather than a customer happily paying. Chosen by
   * the product owner (2026-08-27) deliberately tighter than live's 6h, because
   * every extra minute here is money off a real person's balance.
   *
   * WHY IT ONLY STOPS THE BLEEDING AND DOES NOT REFUND:
   * There is no heartbeat, so the backend cannot know WHEN the phone died — five
   * minutes in or a hundred and fifteen. Any automatic refund would be a guess, and
   * guessing wrong with someone's money is worse than not guessing. So this ends
   * the session and files a flagged record for a human, exactly as
   * checkWalletHealth() does for its anomalies ("a human always makes the actual
   * correction by hand"). Customer support does the refund.
   *
   * The record distinguishes two cases, and the difference decides whether anyone
   * is owed anything:
   *   billed=true   next_billing_at was set, so checkActiveSessions WAS charging
   *                 this every minute. The customer was almost certainly
   *                 overcharged and needs reviewing.
   *   billed=false  next_billing_at was NULL, which is invisible to the billing
   *                 poll (it filters next_billing_at <= now). Nothing was charged;
   *                 the only harm is the astrologer being stuck "busy" and locked
   *                 out of work. This is the zombie-session shape from the
   *                 2026-08-07 data-layer audit. No refund needed.
   */
  async endStaleBilledSessions() {
    const cutoffMs = Date.now() - SessionManager.MAX_BILLED_SESSION_MS;
    const cutoff = new Date(cutoffMs).toISOString();
    try {
      const { data: stale, error } = await supabase
        .from('chat_sessions')
        .select('id, caller_id, vendor_id, per_minute_charge, started_at, next_billing_at, call_type')
        .eq('is_active', true)
        .lt('started_at', cutoff);
      if (error) throw error;
      if (!stale || !stale.length) return;

      console.warn(`[SessionManager] ${stale.length} session(s) past the ${SessionManager.MAX_BILLED_SESSION_MS / 3600000}h cap — auto-ending.`);

      // Sequential on purpose: terminateSession does several writes plus socket
      // emits per session, and this list should essentially always be empty. If it
      // ever is not, something is badly wrong and hammering the DB will not help.
      for (const s of stale) {
        const ranMinutes = Math.max(0, Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000));
        const wasBilled = s.next_billing_at !== null;
        // An ESTIMATE only. The authoritative figure is the sum of this session's
        // rows in wallet_transactions; this is here so the reviewer knows the
        // rough scale without running a query first.
        const estimatedCharge = wasBilled ? ranMinutes * (Number(s.per_minute_charge) || 0) : 0;

        try {
          await this.terminateSession(
            s.id,
            `Auto-ended: exceeded ${SessionManager.MAX_BILLED_SESSION_MS / 3600000}h maximum session length`,
          );
        } catch (err) {
          // Keep going — one failure must not strand the rest, and the flagged
          // record below is what a human acts on either way.
          console.error(`[SessionManager] failed to terminate stale session ${s.id}:`, err.message);
        }

        logError('abandoned-session', new Error(
          `Auto-ended abandoned ${s.call_type || 'session'} ${s.id} after ${ranMinutes} min ` +
          `(cap ${SessionManager.MAX_BILLED_SESSION_MS / 3600000}h). ` +
          (wasBilled
            ? `WAS BEING BILLED at ${s.per_minute_charge}/min — customer ${s.caller_id} was ` +
              `likely overcharged by roughly ${estimatedCharge}. NEEDS REFUND REVIEW.`
            : `next_billing_at was NULL so nothing was charged (zombie session); the only ` +
              `harm is astrologer ${s.vendor_id} being stuck busy. No refund needed.`)
        ), {
          sessionId: s.id,
          callType: s.call_type,
          customerId: s.caller_id,
          astrologerId: s.vendor_id,
          startedAt: s.started_at,
          ranMinutes,
          perMinuteCharge: s.per_minute_charge,
          billed: wasBilled,
          estimatedCharge,
          needsRefundReview: wasBilled,
        });
      }
    } catch (err) {
      console.error('[SessionManager] endStaleBilledSessions error:', err.message);
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
   * Marks call/chat requests as MISSED when they sit 'pending' longer than the ring window
   * plus a 15s margin. A request rings until the customer cancels, the astrologer rejects
   * or accepts, or REQUEST_RING_MS (5 minutes) passes — the customer app's own timer
   * (REQUEST_RING_TIMEOUT_MS in astrowani_customer-main/src/utils/requestTimeouts.js) fires
   * first; this is the authoritative backup for cases where the customer app closed before
   * it could. Both must move together or requests get marked missed early.
   */
  async markStaleRequestsMissed() {
    const cutoff = new Date(Date.now() - (SessionManager.REQUEST_RING_MS + 15 * 1000)).toISOString();
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
      // ALL active billed sessions, not only the ones due: presence is checked on
      // every tick (see below), so a participant who left is caught within a tick
      // instead of only when their next minute comes due.
      // is_free excludes the free 11-minute introductory calls (see
      // sql/free_call_in_app.sql). Those run on a real chat_sessions row so the
      // WebRTC screens' membership checks work, but they must never be billed —
      // this filter is the single place that guarantees it.
      const COLUMNS = 'id, caller_id, vendor_id, next_billing_at';
      let sessions;
      let error;
      if (freeColumnAvailable) {
        ({ data: sessions, error } = await supabase
          .from('chat_sessions')
          .select(COLUMNS)
          .eq('is_active', true)
          .eq('is_free', false));
        // 42703 / PGRST204: the migration has not been applied on this database yet.
        // Latch it off and carry on unfiltered rather than letting the whole billing
        // loop die — a backend that bills nobody is far worse than one that briefly
        // bills a free session at its per_minute_charge of 0. Deploy order therefore
        // does not matter, same posture as src/wallet.js.
        if (error && isMissingFreeColumn(error)) {
          freeColumnAvailable = false;
          console.warn(
            '[SessionManager] chat_sessions.is_free is missing — run sql/free_call_in_app.sql. ' +
            'Free calls are charged at their per_minute_charge (0) until then.',
          );
          error = null;
          sessions = null;
        }
      }
      if (!freeColumnAvailable) {
        ({ data: sessions, error } = await supabase
          .from('chat_sessions')
          .select(COLUMNS)
          .eq('is_active', true));
      }

      if (error) throw error;
      const active = sessions || [];
      // Forget absence/pause timers for sessions that are no longer active.
      const activeIds = new Set(active.map((s) => s.id));
      for (const map of [this.absentSince, this.vendorBackgroundSince]) {
        for (const key of map.keys()) {
          if (!activeIds.has(key.split(':')[0])) map.delete(key);
        }
      }
      for (const id of this.pausedSince.keys()) {
        if (!activeIds.has(id)) this.pausedSince.delete(id);
      }
      if (active.length === 0) return;

      await Promise.all(active.map(async (session) => {
        // Never charge a customer for a minute unless BOTH people are actually
        // connected to the session. Ended after a short grace if either stays away.
        const present = await this.bothParticipantsPresent(session);
        if (!present) {
          if (!this.pausedSince.has(session.id)) this.pausedSince.set(session.id, Date.now());
          return;
        }
        await this.resumeAfterPause(session);
        const due = session.next_billing_at && new Date(session.next_billing_at) <= now;
        if (due) await this.processBilling(session);
      }));
    } catch (err) {
      console.error('[SessionManager] Error in checkActiveSessions:', err.message);
    } finally {
      this.isCheckingSessions = false;
    }
  }

  /**
   * Processes a single billing cycle (1 minute)
   */
  /**
   * MONEY-LEAK GUARD (2026-09-14). Is the customer AND the astrologer connected to this
   * session's socket room right now? Returns true only if both are.
   *
   * The previous guard paused billing only when the room was completely EMPTY. So when
   * just the customer's app died (killed, crashed, restarted) while the astrologer stayed
   * in the chat, the room still had one occupant and every minute kept being charged to
   * a customer who was no longer there. Seen on 2026-09-14 in a real test chat.
   *
   * Presence is identified by socket.data.participantId, which index.js sets on a verified
   * join_session — every chat/call screen in both apps emits it on mount and on every
   * reconnect. A participant missing for SESSION_PRESENCE_GRACE_MS ends the session through
   * terminateSession(), which notifies both sides. No minute is billed while anyone is
   * missing. Without socket.io (scripts, tests) it answers true, the old behaviour.
   */
  async bothParticipantsPresent(session) {
    if (!this.io || typeof this.io.in !== 'function') return true;
    let sockets;
    try {
      sockets = await this.io.in(session.id).fetchSockets();
    } catch (err) {
      // Can't tell — don't end a session over our own error, but don't bill it either.
      console.error(`[SessionManager] presence check failed for ${session.id}:`, err.message);
      return false;
    }
    const ids = new Set(sockets.map((s) => String(s.data?.participantId || '')));
    const nowMs = Date.now();
    let allPresent = true;
    for (const [role, id] of [['caller', session.caller_id], ['vendor', session.vendor_id]]) {
      const key = `${session.id}:${role}`;
      // Astrologer's app is in the background (pressed Home / switched apps, not closed):
      // the session carries on and keeps BILLING as normal, even if the phone has put the
      // app to sleep and its socket dropped, for up to VENDOR_BACKGROUND_GRACE_MS. After
      // that the session is ended. Product decision 2026-09-14.
      if (role === 'vendor') {
        const bgSince = this.vendorBackgroundSince.get(`${session.id}:${id}`);
        if (bgSince) {
          this.absentSince.delete(key);
          if (nowMs - bgSince >= SessionManager.VENDOR_BACKGROUND_GRACE_MS) {
            console.warn(`[SessionManager] Session ${session.id}: astrologer in background ${Math.round((nowMs - bgSince) / 1000)}s — ending session.`);
            this.absentSince.delete(`${session.id}:caller`);
            this.vendorBackgroundSince.delete(`${session.id}:${id}`);
            await this.terminateSession(session.id, 'Astrologer left the app during the session',
              { endedAtMs: bgSince });
            return false;
          }
          continue;
        }
      }
      if (id && ids.has(String(id))) {
        if (this.absentSince.delete(key)) this.emitPresence(session.id, 'participant_back', role, 0);
        continue;
      }
      allPresent = false;
      const since = this.absentSince.get(key);
      const graceMs = role === 'vendor'
        ? SessionManager.VENDOR_ABSENT_GRACE_MS
        : SessionManager.SESSION_PRESENCE_GRACE_MS;
      // The astrologer gets the 5-minute allowance here too (VENDOR_ABSENT_GRACE_MS);
      // the customer keeps the short one so a vanished customer stops the billing clock.
      if (!since) {
        this.absentSince.set(key, nowMs);
        // Tell whoever IS still in the room who dropped, so their app can say so instead of
        // leaving them typing into a session the server has already stopped billing. The
        // absent side cannot be told — they are not in the room — so their own app detects
        // its own disconnection locally. Between them the warning is always side-aware:
        // nobody is ever told to fix a connection that is not theirs.
        this.emitPresence(session.id, 'participant_absent', role, graceMs);
        // Write it down (2026-10-02, owner's request after a live test). The live notice and
        // the frozen timer explain a drop WHILE it happens; this is what's left of that once
        // the session is over and someone is reading the history card. Fire-and-forget and
        // never awaited — a failed write here must not affect billing or presence detection.
        // One place only: cleared never, so "did this session ever have a gap" stays a fact
        // about the session rather than something that can flip back and forth.
        supabase.from('chat_sessions').update({ had_connectivity_issue: true }).eq('id', session.id)
          .then(({ error }) => {
            if (error) console.error(`[SessionManager] could not flag connectivity issue for ${session.id}:`, error.message);
          });
        console.warn(`[SessionManager] Session ${session.id}: ${role} not connected — billing paused.`);
      } else if (nowMs - since >= graceMs) {
        const who = role === 'caller' ? 'Customer' : 'Astrologer';
        console.warn(`[SessionManager] Session ${session.id}: ${role} away ${Math.round((nowMs - since) / 1000)}s (grace ${Math.round(graceMs / 1000)}s) — ending session.`);
        this.absentSince.delete(`${session.id}:caller`);
        this.absentSince.delete(`${session.id}:vendor`);
        // `since` is when they were first seen missing — the last moment this was still
        // a two-person call, and therefore the honest end of a free introductory one.
        await this.terminateSession(session.id, `${who} left the session (app closed or lost connection)`,
          { endedAtMs: since });
        return false;
      }
    }
    return allPresent;
  }

  // Best-effort notice to the session room that one side dropped or came back. Never
  // allowed to affect billing or session lifetime — it is presentational only.
  emitPresence(sessionId, event, role, graceMs) {
    if (!this.io) return;
    try {
      this.io.to(sessionId).emit(event, {
        sessionId,
        role,                                   // 'caller' | 'vendor'
        who: role === 'vendor' ? 'astrologer' : 'customer',
        graceMs: graceMs || 0,
      });
    } catch (e) {
      console.error('[SessionManager] presence notice failed:', e.message);
    }
  }

  // Astrologer app went to the background (true) or came back (false). Only the
  // session's own astrologer is accepted — index.js verifies that before calling.
  setVendorBackground(sessionId, vendorId, isBackground) {
    const key = `${sessionId}:${vendorId}`;
    if (isBackground) {
      if (!this.vendorBackgroundSince.has(key)) {
        this.vendorBackgroundSince.set(key, Date.now());
        console.log(`[SessionManager] Session ${sessionId}: astrologer app in background — session kept open.`);
      }
    } else if (this.vendorBackgroundSince.delete(key)) {
      console.log(`[SessionManager] Session ${sessionId}: astrologer app back in foreground.`);
    }
  }

  isVendorBackground(sessionId, vendorId) {
    return this.vendorBackgroundSince.has(`${sessionId}:${vendorId}`);
  }

  // Both participants are back after a pause: push the next charge back by the length
  // of the pause, so the minute that was running when someone left is not charged for
  // the time they were away. (process_session_billing only ever bills one minute per
  // call, but without this the overdue minute would be charged the moment they return.)
  async resumeAfterPause(session) {
    const since = this.pausedSince.get(session.id);
    if (!since) return;
    this.pausedSince.delete(session.id);
    const pauseMs = Date.now() - since;
    if (pauseMs <= 0 || !session.next_billing_at) return;
    const next = new Date(new Date(session.next_billing_at).getTime() + pauseMs).toISOString();
    const { error } = await supabase
      .from('chat_sessions')
      .update({ next_billing_at: next })
      .eq('id', session.id)
      .eq('is_active', true);
    if (error) {
      console.error(`[SessionManager] could not shift billing after pause for ${session.id}:`, error.message);
      return;
    }
    session.next_billing_at = next;
    console.log(`[SessionManager] Session ${session.id}: resumed after ${Math.round(pauseMs / 1000)}s pause — next charge moved to ${next}.`);
  }

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
   *
   * SECURITY (fixed 2026-08-14 — money/billing audit): the above fix still let a repeated
   * signal against a session that is CURRENTLY active push next_billing_at another 60s into
   * the future every time it fired, since the update matched on id + ended_at IS NULL only.
   * checkActiveSessions() only bills sessions where next_billing_at <= now, so a client
   * re-emitting signal_connection every ~30s could keep next_billing_at perpetually just out
   * of reach and get an unlimited free call/chat — never billed, vendor never paid. Adding
   * `is_active: false` to the match makes this a true one-shot: the first signal transitions
   * is_active false -> true and sets the first billing time; every subsequent signal for the
   * same session matches zero rows and is a no-op, so next_billing_at can never be pushed
   * forward by replaying this event.
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
      .eq('is_active', false)
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
  /**
   * @param {object} [opts]
   * @param {number} [opts.endedAtMs] When the call REALLY stopped, if that is earlier
   *   than now. Used only to measure a free introductory call's length — see
   *   closeFreeCallBooking. A session ended because both apps vanished stopped when they
   *   vanished, not when the 30-second sweep happened to notice, and the difference is
   *   the platform paying a milestone that was never reached. Deliberately NOT applied
   *   to chat_sessions.ended_at: that is the moment the session was actually closed, and
   *   rewriting it would change paid-session records and every analytics figure built on
   *   them for a problem that only exists on the free path.
   */
  async terminateSession(sessionId, reason = 'Normal termination', opts = {}) {
    console.log(`[SessionManager] Terminating session ${sessionId}. Reason: ${reason}`);
    this.absentSince.delete(`${sessionId}:caller`);
    this.absentSince.delete(`${sessionId}:vendor`);
    this.pausedSince.delete(sessionId);
    for (const key of this.vendorBackgroundSince.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.vendorBackgroundSince.delete(key);
    }

    // Claim the end atomically: only flip the row if it is still active, and bail out if
    // someone else already ended it. A normal call runs this at least TWICE (the ending
    // side posts /api/call/end, the other side's app then posts it again after receiving
    // session_ended), and the sweeps add more callers. Without the guard the second run
    // overwrote ended_at with a later time (skewing billed duration), re-emitted
    // session_ended and re-sent its push, and re-ran the referral/waitlist work below.
    const { data: session } = await supabase
      .from('chat_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      // Claim on "not ended yet", NOT on is_active: a call session is only activated when
      // the media connects (signal_connection), and billing also flips is_active off on low
      // balance. Keying on is_active=true meant ending a call that never connected was
      // treated as "already ended" — no session_ended was sent and the astrologer's screen
      // sat on "Connecting…" forever (seen 2026-09-24 after a video ring timeout).
      .is('ended_at', null)
      .select('caller_id, vendor_id');
    const sessionRow = (session || [])[0];
    if (!sessionRow) {
      // Already ended (or never existed) — every notification below already went out.
      console.log(`[SessionManager] Session ${sessionId} was already ended; nothing to do.`);
      return;
    }
    
    // Notify clients directly via their personal rooms + session room
    if (this.io) {
      this.io.to(sessionRow.caller_id).emit('session_ended', { sessionId, reason });
      this.io.to(sessionRow.vendor_id).emit('session_ended', { sessionId, reason });
      this.io.to(sessionId).emit('session_ended', { sessionId, reason });
    }

    // The astrologer's app may be backgrounded or its process asleep, with its socket long
    // gone — the emits above reach nobody. It shows an ongoing "chat/call in progress"
    // notification for the whole session, so tell the device the session is over and let it
    // clear that notification. Data-only, best-effort: a failed push must never affect
    // ending the session.
    if (sessionRow.vendor_id) {
      vendorDevices.pushTargetFor(sessionRow.vendor_id)
        .then((astro) => (astro && astro.fcm_token
          ? sendPush(astro.fcm_token, { data: { type: 'session_ended', sessionId: String(sessionId) } })
          : null))
        .catch((e) => console.error('[SessionManager] session_ended push error:', e.message));
    }

    // A free introductory call is not proof of paid engagement, so it must not
    // trigger the referral reward — and it closes out its booking rather than
    // being just another ended session. Identified by the booking that points at
    // this session, so it does not depend on chat_sessions.is_free having been
    // migrated yet.
    const freeBooking = await this.closeFreeCallBooking(sessionId, opts.endedAtMs, opts.endedBy || null);

    if (sessionRow.caller_id && !freeBooking) {
      await this.maybeRewardReferral(sessionRow.caller_id);
    }

    // ORDER MATTERS FOR THE NEXT THREE BLOCKS.
    //
    // The hold goes FIRST, before the waitlist check at the bottom. A held astrologer
    // is not free, and telling five waiting customers "they're available now" while the
    // person who just spoke to them is inside Razorpay buying more minutes is exactly
    // the race the hold exists to prevent. Because checkAstrologerBusy now reads holds,
    // placing it here makes the waitlist block below stay quiet on its own.
    //
    // `callHappened` gates it: a connection that died in the first seconds shows the
    // customer no offer at all (the call screen only raises the sheet when the call had
    // a duration), so holding the astrologer would reserve them for ninety seconds, and
    // show them busy to everyone else, for a customer who is never coming.
    if (freeBooking && freeBooking.kind === 'instant' && freeBooking.callHappened
      && sessionRow.vendor_id && sessionRow.caller_id) {
      // Gated on the 3-minute line, not merely "a call happened": holding an astrologer
      // for an offer that will never be shown is pure lost availability.
      if (UPSELL_SHEET_ENABLED && freeBooking.qualifiesForUpsell) {
        await this.holdAstrologerForUpsell(sessionId, sessionRow, freeBooking);
      }
    }

    // Then pay the astrologer for the free minutes they just gave.
    if (freeBooking) {
      await this.payFreeCallAstrologer(sessionId, sessionRow, freeBooking);
    }

    // If this was the astrologer's only busy-source, let anyone waiting for them know.
    if (sessionRow.vendor_id) {
      const stillBusy = await checkAstrologerBusy(supabase, sessionRow.vendor_id);
      if (!stillBusy.busy) {
        await notifyWaitlistIfFree(supabase, sendPush, sessionRow.vendor_id);
      }
    }
  }

  /**
   * Reserve the astrologer for the customer who was just on the free call, so they can
   * buy more minutes with the same person. Phase 'decision' — see astrologerHolds.js
   * for why that blocks a new free call but not a paying one.
   *
   * Never throws. A missed reservation costs an upsell; a thrown one would stop a call
   * from ending.
   */
  async holdAstrologerForUpsell(sessionId, sessionRow, booking) {
    try {
      const seconds = await this.freeCallOfferNumbers();
      const held = await holds.placeHold(supabase, {
        astrologerId: sessionRow.vendor_id,
        customerId: sessionRow.caller_id,
        sessionId,
        seconds: seconds.holdDecisionSeconds,
      });
      // Tell the astrologer WHY they have just gone unavailable. Without this they end
      // a free call, see themselves stop receiving requests for a minute and a half,
      // and have no idea it is deliberate — which reads as the app being broken and is
      // exactly the sort of thing that makes an astrologer switch themselves offline.
      if (held && this.io && sessionRow.vendor_id) {
        this.io.to(sessionRow.vendor_id).emit('astrologer_hold_started', {
          seconds: seconds.holdDecisionSeconds,
          sessionId,
        });
      }
    } catch (err) {
      console.error('[SessionManager] holdAstrologerForUpsell failed:', err.message);
    }
  }

  /**
   * Pay the astrologer for a free introductory call, out of the PLATFORM's pocket.
   *
   * The customer is never charged for this (chat_sessions.is_free keeps the billing loop
   * away from the row entirely), so the money comes from admin_wallet — the same shape as
   * the remedy referral commission: credit the astrologer, debit the platform by the
   * identical figure.
   *
   * RULES, all deliberate:
   *   * A MILESTONE, not per-minute: ₹5 for reaching 4 minutes, flat, however much longer
   *     the call then runs. See freeCallPayout.js for why — in short, the astrologer is
   *     paid for holding a conversation, not for picking up, so a time-waster costs the
   *     platform nothing. A call that ends at 3:59 pays zero.
   *   * settled once, from the final duration, rather than credited as each mark passes.
   *     Free sessions are kept out of the billing poll on purpose and there is no worker
   *     watching them; the money and the idempotency are identical either way.
   *   * countEarnings: true — this is real earned income and belongs in today's/total
   *     earnings, unlike a withdrawal.
   *   * idempotent on the SESSION id, so the several callers of terminateSession and any
   *     re-run of a sweep cannot pay twice.
   *
   * Never throws: the astrologer has already done the work and the call must still end.
   * A failure here leaves the ledger short and is logged loudly for an admin to fix.
   */
  async payFreeCallAstrologer(sessionId, sessionRow, booking) {
    try {
      if (!sessionRow.vendor_id) return;
      // Local test mode: the payout moves real rupees between an astrologer's balance
      // and admin_wallet in the shared production ledger, and an interactive UI test
      // should not need a teardown script to put money back. The money path has its own
      // dedicated verification; what is being exercised here is the screen flow.
      // Inert in every environment except a developer's own machine.
      if (localTest.skipPayout()) {
        console.warn(`[FreeCall] LOCAL TEST MODE — payout suppressed for session ${sessionId}. `
          + 'No wallet or admin_wallet write was made.');
        return;
      }
      const seconds = Number(booking.call_duration_seconds);
      const elapsed = Number.isFinite(seconds) && seconds > 0
        ? seconds
        : (booking.call_started_at
          ? Math.max(0, Math.round((Date.now() - new Date(booking.call_started_at).getTime()) / 1000))
          : 0);
      const { payoutMilestones } = await this.freeCallOfferNumbers();
      const { amount, label } = freeCallPayout(elapsed, payoutMilestones);
      if (amount <= 0) return;

      const key = `freecall-payout:${sessionId}`;
      const description = `Free intro call payout (${label} reached)`;

      await wallet.adjustVendorWallet(sessionRow.vendor_id, amount, {
        description,
        sessionId,
        idempotencyKey: key,
        countEarnings: true,
      });

      // admin_wallet is deliberately NOT debited for this (owner, 2026-10-06).
      // Platform Wallet is meant to read as revenue the platform has actually taken
      // in — it only ever moves on a credit (a session's platform-share leg, a gift's
      // platform-share leg, a paid report, …). A free-call payout is a real cost, not
      // a reversal of revenue the platform collected (a free call takes ₹0 from the
      // customer), so it is paid to the astrologer without ever touching this ledger.
      // free_call_attempts.payout_amount (read by GET /api/admin/free-call/analytics'
      // "Paid to astrologers" figure) remains the place this cost is actually visible.

      // "settled", not "paid": the wallet RPC is keyed on the session id, so a repeat
      // call for the same session is a no-op that still reaches this line. Claiming a
      // fresh payment here would send someone chasing a double credit that never
      // happened — the ledger is the record, not this log.
      // Analytics: what this attempt actually cost the platform. Written after the wallet
      // moves, so the number recorded is one that was really settled.
      freeCallAttempts.recordPayout(sessionId, amount);

      console.log(`[SessionManager] Free call ${sessionId}: settled ${amount} for ${sessionRow.vendor_id} (${label} of ${elapsed}s).`);
    } catch (err) {
      console.error(`[SessionManager] free-call payout FAILED for session ${sessionId} — `
        + 'the astrologer has not been paid for this call:', err.message);
    }
  }

  /**
   * The payout and hold numbers off the free_call_offer blob, clamped.
   *
   * Cached for 60s: terminateSession runs on every call end, and these values change
   * about once a month. Every field falls back to a safe default, so an admin typing
   * nonsense into the settings form cannot mint money or hold an astrologer for an hour.
   */
  async freeCallOfferNumbers() {
    const now = Date.now();
    if (this._freeCallNumbers && this._freeCallNumbersAt && now - this._freeCallNumbersAt < 60_000) {
      return this._freeCallNumbers;
    }
    const clamp = (v, lo, hi, dflt) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
    };
    let offer = {};
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'free_call_offer').limit(1);
      const raw = data && data[0] ? data[0].value : null;
      offer = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch (_) { offer = {}; }

    const numbers = {
      payoutMilestones: normaliseMilestones(offer.payoutMilestones),
      holdDecisionSeconds: clamp(offer.holdDecisionSeconds, 10, 600, 60),
      holdPaymentSeconds: clamp(offer.holdPaymentSeconds, 30, 900, 180),
    };
    this._freeCallNumbers = numbers;
    this._freeCallNumbersAt = now;
    return numbers;
  }

  /**
   * If this session was a free introductory call, stamp its booking with what
   * happened and return it. Returns null for an ordinary paid session.
   *
   * Never throws: a booking that fails to update must not stop a call from ending,
   * and must not leave is_active true. Worst case the admin marks it by hand.
   */
  async closeFreeCallBooking(sessionId, endedAtMs = null, endedBy = null) {
    try {
      const read = (columns) => supabase
        .from('free_call_bookings')
        .select(columns)
        .eq('call_session_id', sessionId)
        .maybeSingle();

      // `kind` only exists once sql/free_call_instant.sql has run. Naming a missing
      // column makes PostgREST 400 the whole query, which would look identical to
      // "this was not a free call" and silently stop every payout — so fall back to
      // the pre-migration column list and treat the booking as 'scheduled'.
      let { data: booking, error } = await read('id, status, call_started_at, kind');
      if (error && !bookingKindAvailable) booking = null;
      if (error) {
        if (bookingKindAvailable && isMissingColumn(error, 'kind')) {
          bookingKindAvailable = false;
          console.warn('[SessionManager] free_call_bookings.kind is missing — run sql/free_call_instant.sql. '
            + 'Free calls are treated as scheduled until then (no upsell hold).');
        }
        ({ data: booking, error } = await read('id, status, call_started_at'));
      }
      // Includes the not-yet-migrated case (no call_session_id column) — treated
      // as "not a free call", which is correct for every pre-existing session.
      if (error || !booking) return null;
      if (!booking.kind) booking.kind = 'scheduled';

      const startedAt = booking.call_started_at ? new Date(booking.call_started_at) : null;

      // Measure to when the call actually stopped, which is NOT always now. A session
      // ended because both apps vanished stopped at the last moment both were present;
      // one ended by the overrun backstop stopped at its allotted end. Clamped between
      // the start and now, so a bad clock or a stale caller cannot invent a longer call
      // than really happened — this number decides what the platform pays.
      const caller = Number(endedAtMs);
      const endedAt = (Number.isFinite(caller) && caller > 0)
        ? new Date(Math.min(Date.now(), Math.max(caller, startedAt ? startedAt.getTime() : caller)))
        : new Date();
      const seconds = startedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : null;

      const happened = seconds !== null && seconds >= MIN_REAL_CALL_SECONDS;
      // Long enough to be worth continuing — drives BOTH the hold and the app's
      // post-call screen, so the reservation and the offer can never disagree.
      const qualifiesForUpsell = seconds !== null && seconds >= MIN_UPSELL_SECONDS;
      const qualifiesForDakshina = seconds !== null && seconds >= MIN_DAKSHINA_SECONDS;
      // The astrologer hung up on a call that had barely started. From the customer's
      // side that is not their free call spent, it is an astrologer who could not take
      // it — so the booking goes back to being retryable with somebody else.
      // "The astrologer bailed before it was really a call" — the case that must not
      // spend the customer's free call. Keyed on the DAKSHINA line (3 min), not the
      // upsell line (9 min): a seven-minute conversation happened, whoever ended it.
      const abandonedByAstrologer = endedBy === 'astrologer' && !qualifiesForDakshina;

      const patch = {
        call_ended_at: endedAt.toISOString(),
        call_duration_seconds: seconds,
      };
      // Only a call that actually carried some conversation counts as done. A ring
      // nobody answered stays 'booked' so it still shows in the astrologer's list
      // to try again, rather than silently disappearing as completed.
      if (booking.status === 'booked' && happened && !abandonedByAstrologer) {
        patch.status = 'completed';
        patch.completed_at = endedAt.toISOString();
      }

      // A CONNECTION THAT DIED BEFORE IT WAS A CONVERSATION MUST NOT BURN THE FREE CALL.
      //
      // Media failing to establish, the astrologer's phone dropping the instant they
      // accepted, a customer whose battery died at "hello" — all of these ended a session
      // after a handful of seconds, and the customer got nothing. Until 2026-09-28 the
      // booking kept its call_session_id, which makes resumableInstantAttempt() false, so
      // instantGate answered ALREADY_USED forever: one failed connection silently cost
      // them the whole offer. (CLAUDE.md's edge-case table claimed "they can retry" — it
      // was wrong, and this is the fix rather than the claim being true.)
      //
      // Unlinking the session returns the row to exactly the shape it had while the pool
      // was still being rung, so the customer can try somebody else. The ring attempt was
      // already counted at ring time, so maxRingAttempts still caps this, and
      // cancelStaleInstantBookings still releases the row entirely if they give up.
      if (booking.kind === 'instant' && booking.status === 'booked' && (!happened || abandonedByAstrologer)) {
        patch.call_session_id = null;
        patch.call_ended_at = null;
        patch.call_duration_seconds = null;
        console.log(`[SessionManager] Free call ${sessionId} lasted ${seconds ?? 'no'}s — `
          + `under ${MIN_REAL_CALL_SECONDS}s, so booking ${booking.id} is released to be retried.`);
      }

      // ANALYTICS, RECORDED HERE ON PURPOSE: this is the only place that knows both who
      // hung up and how the attempt was classified, and the patch above is about to erase
      // the evidence for a released attempt (call_ended_at / call_duration_seconds are
      // NULLed so the customer can retry). Fire-and-forget; never blocks the end of a call.
      freeCallAttempts.markEnded({
        sessionId,
        outcome: abandonedByAstrologer ? 'abandoned_by_astrologer' : (happened ? 'completed' : 'too_short'),
        endedBy,
        durationSeconds: seconds,
      });

      await supabase.from('free_call_bookings').update(patch).eq('id', booking.id);
      // The caller needs the measured length to work out the payout, and `booking` is
      // the row as it was BEFORE this update. `callHappened` is carried so the hold and
      // the payout cannot disagree with the decision made here.
      return {
        ...booking,
        call_duration_seconds: seconds,
        callHappened: happened,
        qualifiesForUpsell,
        qualifiesForDakshina,
        abandonedByAstrologer,
      };
    } catch (err) {
      console.error('[SessionManager] closeFreeCallBooking failed:', err.message);
      return null;
    }
  }

  /**
   * Ends free introductory calls that have overrun their allotted minutes.
   *
   * The 11 minutes is the whole promise of the offer, so it is enforced here and
   * not only in the two call screens — a killed app, a lost socket or a phone that
   * slept must not leave the astrologer marked busy indefinitely (the zombie-session
   * shape called out in CLAUDE.md's data-layer audit). Two minutes of slack is
   * allowed so the screens' own countdown normally wins and ends it cleanly.
   */
  /**
   * Move an escalated WhatsApp conversation on when the astrologer it was given
   * to has not replied. Without this, one busy person silently absorbs a
   * customer who was promised a human. See src/whatsappEscalation.js.
   */
  async chaseWhatsAppEscalations() {
    try {
      const { chaseUnansweredEscalations } = require('./whatsappEscalation');
      await chaseUnansweredEscalations();
    } catch (err) {
      console.error('[SessionManager] chaseWhatsAppEscalations failed:', err.message);
    }
  }

  /**
   * Drop reservations whose time is up.
   *
   * holdBlocks() already ignores an expired row, so this is housekeeping rather than
   * correctness — but without it the table grows forever and every busy check reads
   * more rows than it needs.
   */
  async sweepExpiredHolds() {
    try {
      await holds.sweepExpired(supabase);
    } catch (err) {
      console.error('[SessionManager] sweepExpiredHolds failed:', err.message);
    }
  }

  /**
   * Give back a free call that was never taken.
   *
   * An instant booking is created the moment the customer rings their first astrologer,
   * and one-free-call-per-customer is enforced by an index on that row. So a customer
   * who rings a few people, gets no answer and closes the app would otherwise have burnt
   * their free call without ever speaking to anybody. Cancelling the booking releases
   * the index (it is partial on status <> 'cancelled') and lets them come back.
   *
   * Only rows that never reached a call are touched: call_session_id IS NULL. A booking
   * that connected is closed by closeFreeCallBooking instead.
   */
  async cancelStaleInstantBookings() {
    if (!bookingKindAvailable) return;
    try {
      const cutoff = new Date(Date.now() - STALE_INSTANT_BOOKING_MS).toISOString();
      const { error } = await supabase
        .from('free_call_bookings')
        .update({ status: 'cancelled' })
        .eq('kind', 'instant')
        .eq('status', 'booked')
        .is('call_session_id', null)
        .lt('created_at', cutoff);
      if (error) {
        if (isMissingColumn(error, 'kind')) {
          bookingKindAvailable = false;
          return;
        }
        console.error('[SessionManager] cancelStaleInstantBookings failed:', error.message);
      }
    } catch (err) {
      console.error('[SessionManager] cancelStaleInstantBookings threw:', err.message);
    }
  }

  /**
   * End a free introductory call whose participants are gone.
   *
   * THE HOLE THIS FILLS: `chat_sessions.is_free` keeps free calls out of
   * checkActiveSessions — correctly, because there is nothing to bill — but that poll is
   * also where bothParticipantsPresent() runs, so free calls were the one kind of session
   * nobody was watching. If both phones died at minute two, the session stayed open until
   * endOverdueFreeCalls noticed at minute fourteen: the astrologer showed busy for twelve
   * minutes they were not working, and the call was measured to the sweep, so the
   * platform paid every milestone the customer never reached.
   *
   * Presence, not billing. bothParticipantsPresent() ends the session itself and carries
   * the last-seen-together timestamp into terminateSession, so the call is measured to
   * when it really stopped. The graces are the same ones paid calls use (2 min for a
   * customer, 5 for an astrologer, 5 for a backgrounded astrologer app) — a free call
   * must not die on a network blip that a paid call would survive.
   *
   * Without socket.io (scripts, tests) presence is unknowable, so this does nothing and
   * endOverdueFreeCalls stays the backstop.
   */
  async endAbandonedFreeCalls() {
    if (!this.io || typeof this.io.in !== 'function') return;
    try {
      const { data: rows, error } = await supabase
        .from('chat_sessions')
        .select('id, caller_id, vendor_id')
        .eq('is_active', true)
        .eq('is_free', true);
      // is_free arrives with sql/free_call_instant.sql; before that there is nothing
      // here to watch and endOverdueFreeCalls already covers the overrun case.
      if (error || !rows || !rows.length) return;
      for (const session of rows) {
        await this.bothParticipantsPresent(session);
      }
    } catch (err) {
      console.error('[SessionManager] endAbandonedFreeCalls failed:', err.message);
    }
  }

  async endOverdueFreeCalls() {
    try {
      const { data: rows, error } = await supabase
        .from('free_call_bookings')
        .select('id, call_session_id, call_started_at, duration_minutes')
        .not('call_session_id', 'is', null)
        .is('call_ended_at', null);
      if (error || !rows || !rows.length) return;

      const now = Date.now();
      for (const row of rows) {
        if (!row.call_started_at) continue;
        const startedMs = new Date(row.call_started_at).getTime();
        const promisedMs = (row.duration_minutes || 11) * 60 * 1000;
        if (now - startedMs < promisedMs + 120_000) continue;
        console.log(`[SessionManager] Free call ${row.call_session_id} overran — ending it.`);
        // Recorded as exactly the minutes that were promised, not the extra two of slack
        // plus however long this sweep took to come round. The offer was 11 minutes; a
        // call closed by the backstop did not earn a thirteenth.
        await this.terminateSession(row.call_session_id, 'Free call time is up',
          { endedAtMs: startedMs + promisedMs });
      }
    } catch (err) {
      console.error('[SessionManager] endOverdueFreeCalls failed:', err.message);
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

      // ABUSE MITIGATION (added 2026-08-14 — money/billing audit): nothing ties a referral
      // code redemption to a real distinct person — one person can sign up several accounts
      // under different phone numbers and refer each into existence from a single "main"
      // account, farming the reward repeatedly. A real device-fingerprint check would need
      // new client-side collection this codebase doesn't have yet, so as an immediate,
      // schema-free bound: cap how many referral rewards one referrer can collect in a
      // rolling 24h window. Legitimate word-of-mouth referring rarely exceeds a handful of
      // real friends in a day; this only meaningfully blocks a farming pattern.
      const REFERRAL_REWARDS_PER_DAY_CAP = 5;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentRewardCount } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_customer_id', referral.referrer_customer_id)
        .eq('status', 'rewarded')
        .gte('rewarded_at', since);
      if ((recentRewardCount || 0) >= REFERRAL_REWARDS_PER_DAY_CAP) {
        console.warn(`[SessionManager] Referral reward skipped — referrer ${referral.referrer_customer_id} hit the ${REFERRAL_REWARDS_PER_DAY_CAP}/24h cap.`);
        return;
      }

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
