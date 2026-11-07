// astrowani-backend/src/waitlist.js
//
// "Notify me" waitlist — fire-once, not a live auto-connect queue. A customer who hits
// a busy astrologer can register interest; when that astrologer becomes free, the first
// few waiters get a push notification and their row is deleted (so they don't get pushed
// again the next time the same astrologer frees up). The customer still has to tap to
// actually initiate a request once notified.

const { recordInAppAsync } = require('./notifications/inApp');

const MAX_NOTIFIED_PER_FREE = 5; // cap so a suddenly-free popular astrologer doesn't fan out unbounded pushes at once

async function notifyWaitlistIfFree(supabase, sendPush, astrologerId) {
  try {
    const { data: waiters } = await supabase
      .from('astrologer_waitlist')
      .select('id, customer_id')
      .eq('astrologer_id', astrologerId)
      .order('created_at', { ascending: true })
      .limit(MAX_NOTIFIED_PER_FREE);

    if (!waiters || !waiters.length) return;

    const custIds = waiters.map((w) => w.customer_id);
    const [{ data: astro }, { data: customers }] = await Promise.all([
      supabase.from('astrologers').select('first_name, last_name').eq('id', astrologerId).single(),
      supabase.from('customers').select('id, fcm_token').in('id', custIds),
    ]);
    const astroName = astro ? `${astro.first_name || ''} ${astro.last_name || ''}`.trim() || 'Astrologer' : 'Astrologer';

    const tokenById = {};
    (customers || []).forEach((c) => { tokenById[c.id] = c.fcm_token; });

    for (const w of waiters) {
      const token = tokenById[w.customer_id];
      if (token) {
        await sendPush(token, {
          title: "They're free now!",
          body: `${astroName} is available now — tap to connect.`,
          data: { type: 'astrologer_free', astrologerId },
        }).catch(() => {});
      }
  // Written OUTSIDE the `has a token` guard on purpose: the in-app list is the
  // DURABLE record and the push is only the alert. Of 4,890 customers, 289 can
  // receive a push — gating the record on the token would leave the other 94%
  // with no trace of the thing at all, which is the population this exists for.
      // EXPIRES AFTER TWO HOURS, unlike every other type here. "They're free now!"
      // is true for minutes, and a day-old one sitting in the list is worse than
      // nothing — it sends somebody to a profile that is busy again. That is what
      // the expires_at column is for, and the list filters on it.
      recordInAppAsync({
        type: 'astrologer_free',
        customerId: w.customer_id,
        title: "They're free now!",
        body: `${astroName} is available now — tap to connect.`,
        data: { astrologerId },
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Fire-once — remove so they don't get notified again next time this astrologer frees up.
    await supabase.from('astrologer_waitlist').delete().in('id', waiters.map((w) => w.id));
  } catch (e) {
    console.error('[waitlist] notifyWaitlistIfFree error:', e.message);
  }
}

module.exports = { notifyWaitlistIfFree };
