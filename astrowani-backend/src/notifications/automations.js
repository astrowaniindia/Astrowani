// astrowani-backend/src/notifications/automations.js
//
// The recurring and triggered sends — the half of a notification system that works
// while nobody is watching. Every one of the 46 sends on record before today was a
// human pressing a button, now.
//
// Three trigger types:
//   schedule   a clock trigger. Weekly horoscope on Monday 09:00 IST; birthdays at
//              10:00 daily.
//   condition  evaluated on a daily sweep: everyone who currently matches `filters`
//              (wallet under ₹20 and quiet a day; signed up 3 days ago and never
//              consulted). Cadence is `schedule_time`, defaulting to 10:00 IST.
//   event      fired by the backend at the moment something happens, to ONE person,
//              after `delay_minutes` (recharge abandoned → 30 minutes later).
//
// FOUR THINGS STAND BETWEEN THIS AND AN ACCIDENT, and none of them is optional:
//   1. Every automation ships `enabled = false`.
//   2. Enabling one does NOT fire it. The first tick only computes `next_run_at`,
//      so switching on the weekly horoscope at 3pm on a Thursday schedules Monday
//      morning rather than blasting 5,000 people immediately.
//   3. `cooldown_days` per automation, so a condition that stays true (an empty
//      wallet stays empty) cannot push the same person every sweep.
//   4. `max_per_run`, because a filter written wrongly is the realistic failure and
//      its cost should be bounded.

const { db } = require('./db');
const targeting = require('./targeting');
const sender = require('./sender');

// Asia/Kolkata is a fixed +05:30 with no daylight saving, so the arithmetic below
// is exact for it. Any other timezone falls back to IST rather than being computed
// wrongly — documented in the admin, and the only timezone this business runs in.
const IST_OFFSET_MIN = 330;
const DEFAULT_TIME = '10:00';

function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return { hh: 10, mm: 0 };
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return { hh, mm };
}

/**
 * The next moment this automation should run, strictly after `from`.
 * Returns null only if `schedule_days` is non-empty and contains nothing valid.
 */
function nextRunFor(automation, from = new Date()) {
  const { hh, mm } = parseTime(automation?.schedule_time || DEFAULT_TIME);
  const days = Array.isArray(automation?.schedule_days)
    ? automation.schedule_days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];

  for (let add = 0; add <= 8; add += 1) {
    // Shift into local time, set the wall clock, shift back. Doing it this way
    // round means `setUTCHours` is setting LOCAL hours, which is the whole point.
    const local = new Date(from.getTime() + IST_OFFSET_MIN * 60000);
    local.setUTCDate(local.getUTCDate() + add);
    local.setUTCHours(hh, mm, 0, 0);
    const utc = new Date(local.getTime() - IST_OFFSET_MIN * 60000);
    if (utc <= from) continue;                       // today's slot has already passed
    if (days.length && !days.includes(local.getUTCDay())) continue;
    return utc;
  }
  return null;
}

function copyFrom(automation) {
  return {
    title: automation.title,
    body: automation.body,
    title_hi: automation.title_hi,
    body_hi: automation.body_hi,
    image_url: automation.image_url,
    deep_link: automation.deep_link,
    data: automation.data || {},
    category: automation.category || 'engagement',
  };
}

/**
 * Build and deliver one automation's campaign.
 *
 * The audience is resolved, cooled people are removed, and the result is capped —
 * THEN a campaign is created naming those people explicitly. Doing it in that
 * order means the campaign row is a permanent record of exactly who was chosen,
 * which a filter re-evaluated later could never reproduce.
 */
async function runAutomation(automation, io = null) {
  const client = db();
  if (!client) return { ok: false, skipped: 'no_db' };
  if (!automation?.title || !automation?.body) {
    return { ok: false, skipped: 'no_copy' };
  }

  const resolved = await targeting.resolveAudience({
    audience: automation.audience || 'all_customers',
    filters: automation.filters || {},
  });

  const cooled = await targeting.withinCooldown(automation.id, automation.cooldown_days || 0);
  const eligible = resolved.recipients
    .filter((r) => !cooled.has(String(r.id)))
    // Sorted so a run that hits the cap is deterministic. Combined with the
    // cooldown this rotates naturally: whoever is sent to today is cooled
    // tomorrow, so the next run reaches the people the cap skipped.
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const cap = automation.max_per_run > 0 ? automation.max_per_run : 2000;
  const chosen = eligible.slice(0, cap);

  if (!chosen.length) {
    return { ok: true, skipped: 'nobody_eligible', considered: resolved.recipients.length, cooled: cooled.size };
  }

  const copy = copyFrom(automation);
  const { data: created, error } = await client.from('notification_campaigns').insert([{
    name: `${automation.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    status: 'draft',
    category: copy.category,
    audience: automation.audience === 'all_astrologers' ? 'astrologer' : 'customer',
    target_ids: chosen.map((r) => r.id),
    filters: {},
    title: copy.title,
    body: copy.body,
    title_hi: copy.title_hi,
    body_hi: copy.body_hi,
    image_url: copy.image_url,
    deep_link: copy.deep_link,
    data: copy.data,
    timezone: automation.timezone || 'Asia/Kolkata',
    respect_quiet_hours: automation.respect_quiet_hours !== false,
    respect_frequency_cap: true,
    automation_id: automation.id,
    created_by: `automation:${automation.key}`,
  }]).select('id');
  if (error) throw error;

  const result = await sender.deliverCampaign(created[0].id, io);

  if (result?.stats?.sent) {
    await client.from('notification_automations')
      .update({ total_sent: (automation.total_sent || 0) + result.stats.sent })
      .eq('id', automation.id);
  }

  return {
    ok: true,
    campaignId: created[0].id,
    considered: resolved.recipients.length,
    cooled: cooled.size,
    chosen: chosen.length,
    cappedOut: Math.max(0, eligible.length - chosen.length),
    stats: result?.stats || null,
  };
}

/**
 * The worker's entry point for clock-driven automations.
 *
 * A newly enabled automation whose `next_run_at` is NULL is only SCHEDULED on this
 * pass, never run — see point 2 in the file header. That one line is what makes
 * the admin's toggle safe to press.
 */
async function runDueAutomations(io = null) {
  const client = db();
  if (!client) return { ran: [], scheduled: 0 };

  const { data, error } = await client
    .from('notification_automations')
    .select('*')
    .eq('enabled', true)
    .in('trigger_type', ['schedule', 'condition']);
  if (error) throw error;

  const ran = [];
  let scheduled = 0;

  for (const automation of data || []) {
    try {
      if (!automation.next_run_at) {
        const next = nextRunFor(automation);
        if (next) {
          await client.from('notification_automations')
            .update({ next_run_at: next.toISOString() })
            .eq('id', automation.id)
            .is('next_run_at', null);
          scheduled += 1;
        }
        continue;
      }
      if (new Date(automation.next_run_at) > new Date()) continue;

      // CLAIM, in the database, before anything slow happens. A conditional UPDATE
      // on next_run_at is the latch: a second tick arriving while this one is
      // resolving a 5,000-person audience finds next_run_at already in the future
      // and does nothing. Checking in JS and writing afterwards would let both
      // through, which for an automation means everybody gets it twice.
      const next = nextRunFor(automation);
      const { data: claimed, error: claimErr } = await client
        .from('notification_automations')
        .update({ last_run_at: new Date().toISOString(), next_run_at: next ? next.toISOString() : null })
        .eq('id', automation.id)
        .lte('next_run_at', new Date().toISOString())
        .select('id');
      if (claimErr) throw claimErr;
      if (!claimed?.length) continue;

      const result = await runAutomation(automation, io);
      ran.push({ key: automation.key, ...result });
      console.log(`[notifications] automation ${automation.key}: ${JSON.stringify(result.stats || result.skipped || {})}`);
    } catch (err) {
      console.error(`[notifications] automation ${automation.key} failed:`, err.message);
      ran.push({ key: automation.key, ok: false, error: err.message });
    }
  }

  return { ran, scheduled };
}

/**
 * Fire an `event` automation for one person.
 *
 * Called from wherever the thing happens. Fire-and-forget, never awaited by a
 * request path, and it swallows everything: a customer's recharge must not fail
 * because a follow-up notification could not be scheduled.
 *
 * `delay_minutes` becomes `scheduled_at`, so the worker picks it up later. That is
 * what makes "30 minutes after they abandoned the recharge" expressible at all.
 */
async function handleEvent(eventName, { customerId, astrologerId, data = {} } = {}, io = null) {
  const client = db();
  if (!client || !eventName || !(customerId || astrologerId)) return { ok: false };

  try {
    const { data: autos, error } = await client
      .from('notification_automations')
      .select('*')
      .eq('enabled', true)
      .eq('trigger_type', 'event')
      .eq('event_name', eventName);
    if (error) throw error;
    if (!autos?.length) return { ok: true, matched: 0 };

    const out = [];
    for (const automation of autos) {
      // The cooldown is checked HERE rather than at delivery, because an event
      // automation's audience is one person and the whole decision is "have we
      // already said this to them recently".
      const cooled = await targeting.withinCooldown(automation.id, automation.cooldown_days || 0);
      if (customerId && cooled.has(String(customerId))) { out.push({ key: automation.key, skipped: 'cooldown' }); continue; }
      if (!automation.title || !automation.body) { out.push({ key: automation.key, skipped: 'no_copy' }); continue; }

      const when = new Date(Date.now() + Math.max(0, automation.delay_minutes || 0) * 60000);
      const { data: created, error: insErr } = await client.from('notification_campaigns').insert([{
        name: `${automation.name} — ${eventName}`,
        // 'scheduled' even for a zero delay: the worker is the only thing that
        // sends, so there is exactly one code path to the push and one place where
        // a double-send could happen. A direct send here would be a second.
        status: 'scheduled',
        category: automation.category || 'engagement',
        audience: customerId ? 'customer' : 'astrologer',
        target_ids: [customerId || astrologerId],
        title: automation.title,
        body: automation.body,
        title_hi: automation.title_hi,
        body_hi: automation.body_hi,
        image_url: automation.image_url,
        deep_link: automation.deep_link,
        data: { ...(automation.data || {}), ...data },
        scheduled_at: when.toISOString(),
        timezone: automation.timezone || 'Asia/Kolkata',
        respect_quiet_hours: automation.respect_quiet_hours !== false,
        automation_id: automation.id,
        created_by: `automation:${automation.key}`,
      }]).select('id');
      if (insErr) throw insErr;
      out.push({ key: automation.key, campaignId: created[0].id, scheduledAt: when.toISOString() });
    }
    return { ok: true, matched: autos.length, results: out };
  } catch (err) {
    console.error(`[notifications] handleEvent(${eventName}) failed:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { runDueAutomations, runAutomation, handleEvent, nextRunFor, parseTime };
