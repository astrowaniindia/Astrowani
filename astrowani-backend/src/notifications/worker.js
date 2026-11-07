// astrowani-backend/src/notifications/worker.js
//
// The only thing in this codebase that sends a notification nobody asked for in
// the last second. It therefore gets the most conservative gate in the file set.
//
// IT RUNS ONLY WHERE ENABLE_SESSION_MANAGER === 'true'.
//
// That flag already means "this process is the real production one" — it is what
// gates the billing worker and the earnings resets, and CLAUDE.md's standing rule
// is that index.js must never be booted on a developer machine precisely because
// of it. Reusing it means a laptop that boots the backend by accident cannot fire
// a campaign at 4,857 people, and production needs no new environment variable.
//
// pm2 runs this process in FORK mode (one process, verified 2026-10-01), so there
// is exactly one worker. If this ever moves to cluster mode, every automation would
// run once per worker — the claim guards in sender.js and automations.js are
// conditional database updates and would hold, but do not rely on that without
// checking; cluster mode also needs a Socket.io Redis adapter first and is already
// marked as requiring it.

const { db } = require('./db');
const sender = require('./sender');
const automations = require('./automations');

const TICK_MS = 60 * 1000;
// notification_sends grows by one row per recipient per campaign. A daily
// automation over 5,000 people is 150,000 rows a month, so the detail is pruned
// while the campaign roll-ups — which is what the reports read — are kept forever.
const SEND_RETENTION_DAYS = 120;

let running = false;
let started = false;
let lastPurgeDay = null;

// Abandoned-recharge detection window. The LOWER bound is what provides the wait:
// a recharge created four minutes ago may still be paid in minute five, so asking
// "did they pay" before 30 minutes have passed answers the wrong question. That is
// also why the `recharge_abandoned` automation carries delay_minutes 0 — the delay
// is in this window, and stacking both would make the push an hour late.
const ABANDONED_MIN_AGE_MIN = 30;
const ABANDONED_MAX_AGE_MIN = 180;

/**
 * Turn "opened the wallet and closed it without paying" into an event.
 *
 * Server-side only, from wallet_recharges, because the client cannot be trusted to
 * report it and an app that is closed cannot report anything at all.
 *
 * The automation's own cooldown (2 days) is what stops this firing repeatedly at
 * someone who abandons a recharge every day; this function deliberately does no
 * de-duplication of its own, so there is one place that decides.
 */
async function sweepAbandonedRecharges(client) {
  // Cheap guard first: do not read wallet_recharges every minute for an automation
  // nobody has switched on.
  const { data: autos } = await client
    .from('notification_automations')
    .select('id')
    .eq('enabled', true)
    .eq('trigger_type', 'event')
    .eq('event_name', 'recharge_abandoned')
    .limit(1);
  if (!autos?.length) return;

  const now = Date.now();
  const { data: rows, error } = await client
    .from('wallet_recharges')
    .select('customer_id, created_at, status')
    .gte('created_at', new Date(now - ABANDONED_MAX_AGE_MIN * 60000).toISOString())
    .lte('created_at', new Date(now - ABANDONED_MIN_AGE_MIN * 60000).toISOString())
    .limit(400);
  if (error) throw error;
  if (!rows?.length) return;

  // Filtered HERE rather than with `.neq('status', 'paid')`, because in SQL
  // `status <> 'paid'` evaluates to NULL — not true — for a row whose status is
  // NULL, so those rows were silently excluded. A created-but-never-updated
  // recharge is precisely the abandoned case this sweep exists to find, which
  // made the filter drop its best candidates.
  const unpaid = rows.filter((r) => String(r.status || '') !== 'paid');
  if (!unpaid.length) return;

  const candidates = [...new Set(unpaid.map((r) => String(r.customer_id)).filter(Boolean))];
  if (!candidates.length) return;

  // Anyone who has since paid is NOT an abandoned recharge — they are a customer
  // who retried and succeeded, and telling them their payment failed would be
  // worse than saying nothing.
  const { data: paid } = await client
    .from('wallet_recharges')
    .select('customer_id')
    .eq('status', 'paid')
    .gte('created_at', new Date(now - ABANDONED_MAX_AGE_MIN * 60000).toISOString())
    .in('customer_id', candidates);
  const paidSet = new Set((paid || []).map((r) => String(r.customer_id)));

  for (const customerId of candidates) {
    if (paidSet.has(customerId)) continue;
    await automations.handleEvent('recharge_abandoned', { customerId });
  }
}

async function tick(io) {
  // The latch is set BEFORE the first await. Every await yields the event loop, so
  // checking it after one would let two ticks through — the async-guard rule this
  // codebase has already paid for more than once.
  if (running) return;
  running = true;
  try {
    const client = db();
    if (!client) return;

    // ── due campaigns ──
    const { data: due, error } = await client
      .from('notification_campaigns')
      .select('id, name, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20);
    if (error) throw error;

    for (const c of due || []) {
      try {
        const result = await sender.deliverCampaign(c.id, io);
        if (result.ok) {
          console.log(`[notifications] sent scheduled campaign "${c.name || c.id}": ${JSON.stringify(result.stats)}`);
        } else if (result.skipped !== 'already_claimed_or_wrong_status') {
          console.warn(`[notifications] scheduled campaign ${c.id} not sent: ${result.skipped || result.error}`);
        }
      } catch (err) {
        console.error(`[notifications] scheduled campaign ${c.id} threw:`, err.message);
      }
    }

    // ── due automations ──
    await automations.runDueAutomations(io);

    // ── event sweeps ──
    await sweepAbandonedRecharges(client).catch((err) => {
      console.error('[notifications] abandoned-recharge sweep failed:', err.message);
    });

    // ── retention, once a day ──
    const today = new Date().toISOString().slice(0, 10);
    if (lastPurgeDay !== today) {
      lastPurgeDay = today;
      try {
        const cutoff = new Date(Date.now() - SEND_RETENTION_DAYS * 86400000).toISOString();
        const { error: delErr } = await client.from('notification_sends').delete().lt('created_at', cutoff);
        if (delErr) throw delErr;
      } catch (err) {
        console.error('[notifications] send-log purge failed:', err.message);
      }
    }
  } catch (err) {
    console.error('[notifications] worker tick failed:', err.message);
  } finally {
    running = false;
  }
}

/** Call once from index.js, after io exists. Safe to call twice. */
function start(io) {
  if (started) return false;
  if (process.env.ENABLE_SESSION_MANAGER !== 'true') {
    console.log('[notifications] worker NOT started (ENABLE_SESSION_MANAGER is not "true") — '
      + 'scheduled campaigns and automations will not fire in this process.');
    return false;
  }
  if (String(process.env.NOTIFICATIONS_WORKER || '').toLowerCase() === 'off') {
    console.warn('[notifications] worker disabled by NOTIFICATIONS_WORKER=off.');
    return false;
  }
  started = true;
  // `.unref()` so the interval cannot hold the process open during a shutdown,
  // matching every other poller in index.js.
  setInterval(() => { tick(io).catch(() => {}); }, TICK_MS).unref?.();
  console.log(`[notifications] worker started — checking scheduled campaigns and automations every ${TICK_MS / 1000}s.`);
  return true;
}

module.exports = {
  start, tick, sweepAbandonedRecharges,
  isStarted: () => started,
  TICK_MS, SEND_RETENTION_DAYS, ABANDONED_MIN_AGE_MIN, ABANDONED_MAX_AGE_MIN,
};
