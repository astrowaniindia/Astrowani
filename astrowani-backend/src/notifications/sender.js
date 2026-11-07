// astrowani-backend/src/notifications/sender.js
//
// Takes a campaign row and delivers it. The one place a notification is actually
// sent, so that scheduling, automations and the admin's Send button cannot drift
// apart in how they behave.
//
// What it does, in order:
//   1. CLAIM the campaign with a conditional UPDATE, so two worker ticks can never
//      both send it.
//   2. Resolve the audience, look up live devices, run the governor.
//   3. Write one `notification_sends` row per person — queued — and one in-app
//      `notifications` row, so missing the banner stops meaning losing the message.
//   4. Push, grouped by the exact text each person gets, and mark each row.
//   5. Roll the counters up onto the campaign.
//
// SUPPRESSIONS ARE RECORDED, NOT DROPPED. A person held back by quiet hours, a
// frequency cap or an opt-out gets a `notification_sends` row saying so. Otherwise
// a working system and a broken one look identical from the admin's side — the
// failure mode already written down for astrologerFanout and the blog agent.

const { db } = require('./db');
const { sendPush } = require('../push');
const devices = require('./devices');
const targeting = require('./targeting');

const PUSH_CHUNK = 500;     // FCM multicast limit
const ROW_CHUNK = 500;      // PostgREST INSERT batch — rows travel in the body
// A uuid list in a `.in()` filter travels in the QUERY STRING, so it needs the
// project's own safe size (see chunkIds in src/pagedSelect.js). Reusing
// ROW_CHUNK here built an ~18 KB URL and risked a 414 at the very end of a large
// send — after the pushes had gone out — leaving the send rows at 'queued' and
// the campaign counters wrong, with nothing to see.
const ID_CHUNK = 150;

/** Substitutes the handful of placeholders a template may carry. Unknown
 *  placeholders are left ALONE rather than blanked: "Hi {naem}" reads as a typo an
 *  admin can see and fix, where "Hi " reads as a broken app. */
function renderCopy(text, recipient) {
  if (!text) return text;
  return String(text)
    .replace(/\{name\}/g, (recipient?.name || 'there').split(' ')[0])
    .replace(/\{balance\}/g, recipient?.walletBalance != null ? String(Math.floor(Number(recipient.walletBalance))) : '0');
}

/** The copy one person gets: their language if we have it and a translation
 *  exists, otherwise the default. Falling back rather than skipping is deliberate
 *  — a missing Hindi line must mean "they get English", never "they get nothing". */
function copyFor(recipient, source) {
  const hi = recipient?.locale === 'hi';
  return {
    title: renderCopy((hi && source.title_hi) || source.title, recipient),
    body: renderCopy((hi && source.body_hi) || source.body, recipient),
    imageUrl: source.image_url || null,
  };
}

/** Picks an A/B variant by weight. Deterministic per recipient id, so a re-run of
 *  the same campaign puts the same person in the same arm — otherwise a retry
 *  reshuffles the split and the result means nothing. */
function pickVariant(variants, recipientId) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const total = variants.reduce((s, v) => s + (Number(v.weight) > 0 ? Number(v.weight) : 1), 0);
  // A cheap stable hash of the uuid. Not cryptographic; it only has to be stable.
  let h = 0;
  const s = String(recipientId);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000;
  let point = (h / 100000) * total;
  for (const v of variants) {
    point -= (Number(v.weight) > 0 ? Number(v.weight) : 1);
    if (point <= 0) return v;
  }
  return variants[variants.length - 1];
}

async function insertInChunks(client, table, rows, select) {
  const out = [];
  for (let i = 0; i < rows.length; i += ROW_CHUNK) {
    const slice = rows.slice(i, i + ROW_CHUNK);
    let q = client.from(table).insert(slice);
    if (select) q = q.select(select);
    const { data, error } = await q;
    if (error) throw error;
    if (data) out.push(...data);
  }
  return out;
}

/**
 * Deliver one campaign.
 *
 * @param campaignId
 * @param io  the Socket.io server, for instant in-app delivery to anyone
 *            foregrounded. Optional — a missing io must not stop the push.
 * @returns {Promise<{ok, skipped?, campaign?, stats?}>}
 */
async function deliverCampaign(campaignId, io = null) {
  const client = db();
  if (!client) return { ok: false, skipped: 'no_db' };

  // ── 1. CLAIM ──────────────────────────────────────────────────────────────
  // A conditional UPDATE is the latch, and it is set in the DATABASE before any
  // other await in this function. Doing it in JS ("read status, check, then write")
  // would yield the event loop between the check and the write, and two worker
  // ticks one second apart would both pass — the async-guard rule this codebase has
  // already paid for twice.
  const { data: claimed, error: claimErr } = await client
    .from('notification_campaigns')
    .update({ status: 'sending', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .in('status', ['draft', 'scheduled'])
    .select('*');
  if (claimErr) throw claimErr;
  if (!claimed?.length) return { ok: false, skipped: 'already_claimed_or_wrong_status' };

  const campaign = claimed[0];

  const finish = async (patch) => {
    await client.from('notification_campaigns')
      .update({ ...patch, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
  };

  try {
    // ── expiry ──
    // Checked AFTER the claim so an expired campaign is recorded as cancelled
    // rather than left sitting in 'scheduled' for the worker to re-examine forever.
    if (campaign.expires_at && new Date(campaign.expires_at) <= new Date()) {
      await finish({ status: 'cancelled', error: 'expired before it was sent' });
      return { ok: false, skipped: 'expired' };
    }

    // ── 2. RESOLVE + GOVERN ───────────────────────────────────────────────────
    const resolved = await targeting.resolveAudience({
      audience: campaign.audience,
      targetIds: campaign.target_ids,
      filters: campaign.filters,
      segments: campaign.segments,
    });

    const isCustomer = resolved.recipientType === 'customer';
    const ids = resolved.recipients.map((r) => r.id);
    // Both sides are multi-device for a CAMPAIGN. Note this is not what an incoming
    // consultation does — `vendorDevices.pushTargetFor` rings the newest device
    // only, deliberately.
    const deviceMap = isCustomer
      ? await devices.liveDevicesFor(ids)
      : await devices.liveAstrologerDevicesFor(ids);

    const { send, suppressed } = await targeting.govern({
      recipients: resolved.recipients,
      recipientType: resolved.recipientType,
      category: campaign.category,
      respectQuietHours: campaign.respect_quiet_hours,
      respectFrequencyCap: campaign.respect_frequency_cap,
      timezone: campaign.timezone,
      automationId: campaign.automation_id,
      // Cooldown is applied by automations.js when it BUILDS the audience, not
      // here: filtering cooled people out before the campaign exists avoids
      // writing a suppression row for every one of them on every sweep, which for
      // a condition automation would be thousands of rows a day saying nothing.
      cooldownDays: 0,
      devices: deviceMap,
    });

    const ownerCol = isCustomer ? 'customer_id' : 'astrologer_id';
    const variants = Array.isArray(campaign.variants) ? campaign.variants : null;

    // ── 3. ROWS ───────────────────────────────────────────────────────────────
    // Suppressions first, so that even a campaign that then fails at the push
    // stage has already recorded why the held-back people were held back.
    if (suppressed.length) {
      await insertInChunks(client, 'notification_sends', suppressed.map(({ r, reason }) => ({
        campaign_id: campaign.id,
        [ownerCol]: r.id,
        status: 'suppressed',
        suppress_reason: reason,
      })));
    }

    // Counted once and reused, so the "nobody to send to" return below carries the
    // SAME breakdown as a normal send. It used to omit it, which meant a campaign
    // suppressed for everybody reported `suppressed: 1` and no reason at all —
    // the one case where the reason is the entire answer.
    const suppressionBreakdown = suppressed.reduce((acc, s) => {
      acc[s.reason] = (acc[s.reason] || 0) + 1;
      return acc;
    }, {});

    if (!send.length) {
      await finish({
        status: 'sent',
        recipient_count: resolved.recipients.length,
        suppressed_count: suppressed.length,
        sent_count: 0,
      });
      return {
        ok: true,
        campaign,
        stats: {
          recipients: resolved.recipients.length,
          sent: 0,
          suppressed: suppressed.length,
          failed: 0,
          skippedSegment: resolved.skippedSegment,
          suppressionBreakdown,
        },
      };
    }

    // The in-app list. Written for everyone being sent to, with a destination —
    // `data` has been NULL on all 15,468 pre-existing rows, which is why tapping an
    // item in the list has never gone anywhere.
    //
    // The row is written BEFORE the push on purpose: if the push half fails, the
    // customer still finds the message in the app. The reverse order would mean a
    // banner pointing at a list that does not contain it.
    let notifIdByOwner = new Map();
    try {
      const notifRows = send.map((r) => {
        const variant = pickVariant(variants, r.id);
        const copy = copyFor(r, variant ? { ...campaign, ...variant } : campaign);
        return {
          astrologer_id: isCustomer ? null : r.id,
          customer_id: isCustomer ? r.id : null,
          title: copy.title,
          body: copy.body,
          type: campaign.automation_id ? 'automation' : (campaign.target_ids?.length ? 'admin_personal' : 'admin_broadcast'),
          category: campaign.category,
          campaign_id: campaign.id,
          image_url: copy.imageUrl,
          deep_link: campaign.deep_link || null,
          data: { ...(campaign.data || {}), campaignId: campaign.id, ...(campaign.deep_link ? { deepLink: campaign.deep_link } : {}) },
          expires_at: campaign.expires_at || null,
        };
      });
      const inserted = await insertInChunks(client, 'notifications', notifRows, 'id, customer_id, astrologer_id');
      notifIdByOwner = new Map(inserted.map((n) => [String(n.customer_id || n.astrologer_id), n.id]));
    } catch (err) {
      // An in-app row is valuable but it is not the notification. Losing it must
      // not cost the push.
      console.error('[notifications] in-app rows failed, continuing with the push:', err.message);
    }

    const sendRows = send.map((r) => ({
      campaign_id: campaign.id,
      [ownerCol]: r.id,
      device_count: r.tokens.length,
      token_tail: String(r.tokens[0] || '').slice(-8) || null,
      variant: pickVariant(variants, r.id)?.key || null,
      status: 'queued',
      notification_id: notifIdByOwner.get(String(r.id)) || null,
    }));
    await insertInChunks(client, 'notification_sends', sendRows);

    // ── 4. PUSH ───────────────────────────────────────────────────────────────
    // Grouped by the EXACT text each person gets — language and variant and any
    // {name} substitution all folded into the key. A plain campaign collapses to
    // one or two groups and goes out in multicasts of 500; a personalised one
    // degrades to a group per person, which is why `max_per_run` exists.
    const groups = new Map();
    for (const r of send) {
      const variant = pickVariant(variants, r.id);
      const copy = copyFor(r, variant ? { ...campaign, ...variant } : campaign);
      const key = `${copy.title}\u0000${copy.body}\u0000${copy.imageUrl || ''}`;
      if (!groups.has(key)) groups.set(key, { copy, recipients: [] });
      groups.get(key).recipients.push(r);
    }

    const ttlSeconds = campaign.expires_at
      ? Math.max(60, Math.floor((new Date(campaign.expires_at).getTime() - Date.now()) / 1000))
      : null;

    const okIds = [];
    const failedIds = [];

    for (const { copy, recipients } of groups.values()) {
      // Token → recipient, so an FCM per-token verdict can be attributed to a
      // person. Without this the counters could only ever say how many tokens
      // succeeded, which is what `push_success` has always meant and why it was
      // never a measure of reach.
      const tokenOwner = new Map();
      const tokens = [];
      for (const r of recipients) {
        for (const t of r.tokens) {
          if (!tokenOwner.has(t)) { tokenOwner.set(t, String(r.id)); tokens.push(t); }
        }
      }

      for (let i = 0; i < tokens.length; i += PUSH_CHUNK) {
        const chunk = tokens.slice(i, i + PUSH_CHUNK);
        const result = await sendPush(chunk, {
          title: copy.title,
          body: copy.body,
          imageUrl: copy.imageUrl,
          ttlSeconds,
          data: {
            type: campaign.automation_id ? 'automation' : 'admin_broadcast',
            category: campaign.category,
            campaignId: campaign.id,
            ...(campaign.deep_link ? { deepLink: campaign.deep_link } : {}),
            ...(campaign.data || {}),
          },
        });

        const responses = Array.isArray(result?.responses) ? result.responses : null;
        if (!responses) {
          // No per-token detail (push disabled, or the whole call threw). Treat the
          // chunk as it reported itself rather than guessing.
          const owners = [...new Set(chunk.map((t) => tokenOwner.get(t)))];
          if (result?.successCount) okIds.push(...owners); else failedIds.push(...owners);
          continue;
        }
        // A person with two phones counts as reached if EITHER arrived.
        const perOwner = new Map();
        responses.forEach((resp, idx) => {
          const owner = tokenOwner.get(chunk[idx]);
          if (!owner) return;
          perOwner.set(owner, (perOwner.get(owner) || false) || !!resp?.success);
        });
        for (const [owner, success] of perOwner) (success ? okIds : failedIds).push(owner);
      }
    }

    const stamp = new Date().toISOString();
    const markIds = async (ids, patch) => {
      const unique = [...new Set(ids)];
      for (let i = 0; i < unique.length; i += ID_CHUNK) {
        await client.from('notification_sends')
          .update(patch)
          .eq('campaign_id', campaign.id)
          .in(ownerCol, unique.slice(i, i + ID_CHUNK));
      }
    };
    if (okIds.length) await markIds(okIds, { status: 'sent', sent_at: stamp });
    if (failedIds.length) await markIds(failedIds, { status: 'failed', fail_code: 'push_failed' });

    // Instant in-app delivery for anyone foregrounded, on their personal room —
    // the same mechanism the old broadcast path used.
    if (io) {
      for (const r of send) {
        const variant = pickVariant(variants, r.id);
        const copy = copyFor(r, variant ? { ...campaign, ...variant } : campaign);
        try {
          io.to(r.id).emit('new_notification', {
            title: copy.title,
            body: copy.body,
            type: 'campaign',
            category: campaign.category,
            campaignId: campaign.id,
            imageUrl: copy.imageUrl,
            deepLink: campaign.deep_link || null,
            recipient_type: resolved.recipientType,
          });
        } catch (_) { /* a dropped socket is not a failed notification */ }
      }
    }

    const sentCount = new Set(okIds).size;
    const failedCount = new Set(failedIds).size;
    await finish({
      status: 'sent',
      recipient_count: resolved.recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
      suppressed_count: suppressed.length,
      error: null,
    });

    return {
      ok: true,
      campaign,
      stats: {
        recipients: resolved.recipients.length,
        sent: sentCount,
        failed: failedCount,
        suppressed: suppressed.length,
        skippedSegment: resolved.skippedSegment,
        suppressionBreakdown,
      },
    };
  } catch (err) {
    console.error(`[notifications] campaign ${campaignId} failed:`, err.message);
    // Left as 'failed' rather than put back to 'scheduled'. A campaign that threw
    // halfway has already pushed to some people, and an automatic retry would send
    // to them twice — the unique index would stop the duplicate ROW, but the push
    // itself has already left. A human decides whether to resend.
    await finish({ status: 'failed', error: String(err.message || err).slice(0, 500) });
    return { ok: false, error: err.message };
  }
}

module.exports = { deliverCampaign, renderCopy, copyFor, pickVariant };
