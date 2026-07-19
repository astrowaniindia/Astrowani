// astrowani-backend/src/astrologerMetrics.js
// Shared metrics computation for the vendor performance dashboard and the admin
// leaderboard — one source of truth so both surfaces always agree on the numbers.
//
// Metrics, per astrologer:
// - avgResponseSeconds: mean time between a request being created and the astrologer
//   accepting/rejecting it (responded_at - created_at). Missed/cancelled requests have no
//   responded_at and are excluded from this average (there was no response to time), but
//   still count toward acceptanceRate's denominator below.
// - acceptanceRate: accepted / (accepted + rejected + missed), across calls + chats.
// - repeatCustomerRate: of this astrologer's distinct customers (by chat_sessions.caller_id),
//   the fraction who booked more than once.
//
// Computed in Node rather than a Postgres RPC — this app's volume doesn't yet need
// database-side aggregation, and keeping the logic here makes it directly testable/readable
// alongside the rest of the backend.

const RESOLVED_STATUSES = ['accepted', 'rejected', 'missed'];

async function computeAstrologerMetrics(db, astroIds) {
  if (!astroIds || astroIds.length === 0) return {};

  const [
    { data: callRows },
    { data: chatRows },
    { data: sessionRows },
  ] = await Promise.all([
    db.from('call_requests')
      .select('astrologer_id, status, created_at, responded_at')
      .in('astrologer_id', astroIds)
      .in('status', RESOLVED_STATUSES),
    db.from('chat_requests')
      .select('receiver_id, status, created_at, responded_at')
      .in('receiver_id', astroIds)
      .in('status', RESOLVED_STATUSES),
    db.from('chat_sessions')
      .select('vendor_id, caller_id')
      .in('vendor_id', astroIds),
  ]);

  const byAstro = {};
  astroIds.forEach((id) => {
    byAstro[id] = {
      accepted: 0,
      resolved: 0,
      responseSecondsSum: 0,
      responseCount: 0,
      customerCounts: {},
    };
  });

  const tally = (rows, astroKey) => {
    (rows || []).forEach((row) => {
      const astroId = row[astroKey];
      const bucket = byAstro[astroId];
      if (!bucket) return;
      bucket.resolved += 1;
      if (row.status === 'accepted') bucket.accepted += 1;
      if (row.responded_at && row.created_at) {
        const seconds = (new Date(row.responded_at).getTime() - new Date(row.created_at).getTime()) / 1000;
        if (seconds >= 0) {
          bucket.responseSecondsSum += seconds;
          bucket.responseCount += 1;
        }
      }
    });
  };
  tally(callRows, 'astrologer_id');
  tally(chatRows, 'receiver_id');

  (sessionRows || []).forEach((row) => {
    const bucket = byAstro[row.vendor_id];
    if (!bucket || !row.caller_id) return;
    bucket.customerCounts[row.caller_id] = (bucket.customerCounts[row.caller_id] || 0) + 1;
  });

  const result = {};
  astroIds.forEach((id) => {
    const b = byAstro[id];
    const customerIds = Object.keys(b.customerCounts);
    const repeatCustomers = customerIds.filter((cid) => b.customerCounts[cid] > 1).length;
    result[id] = {
      avgResponseSeconds: b.responseCount > 0 ? Math.round(b.responseSecondsSum / b.responseCount) : null,
      acceptanceRate: b.resolved > 0 ? Math.round((b.accepted / b.resolved) * 100) : null,
      repeatCustomerRate: customerIds.length > 0 ? Math.round((repeatCustomers / customerIds.length) * 100) : null,
      totalCustomers: customerIds.length,
      resolvedRequests: b.resolved,
    };
  });
  return result;
}

module.exports = { computeAstrologerMetrics };
