// astrowani-backend/src/remedyCommission.js
//
// Astrologer referral commission on remedy orders. Two jobs:
//
//   resolveLineCommissions() — at CHECKOUT, decide which astrologer (if any) gets
//   credit for each line and snapshot the rate + amount onto it.
//
//   payoutOrderCommissions() — at DELIVERY, move the money.
//
// THREE RULES THIS FILE EXISTS TO ENFORCE
//
// 1. The commission comes out of the PLATFORM's margin, never the customer's price.
//    Nothing here touches the amount the customer is charged — resolution runs after
//    the quote is priced and only annotates lines. Payout credits the astrologer and
//    debits admin_wallet by the same figure.
//
// 2. Rates are SNAPSHOTTED at checkout. Changing a rate in the admin must not
//    retroactively change what an order already placed pays out, so payout never
//    re-reads app_settings — it uses the number stored on the line.
//
// 3. Payout happens on DELIVERY, and only once. Paying at checkout would need a
//    clawback on every cancellation and refund; paying at delivery means a cancelled
//    order simply never pays. `commission_paid_at` makes it idempotent, and the wallet
//    idempotency keys are a second, independent guard.

const wallet = require('./wallet');

const TYPE_SETTING = {
  gemstone: 'remedy_commission_percent_gemstone',
  puja: 'remedy_commission_percent_puja',
  specific_puja: 'remedy_commission_percent_specific_puja',
};

const WINDOW_SETTING = 'remedy_referral_window_days';
const DEFAULT_WINDOW_DAYS = 30;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Read the commission rates and attribution window in one query.
 *
 * Fails CLOSED: any unreadable/missing/invalid rate becomes 0, i.e. no commission.
 * Paying nothing when configuration is broken is recoverable (an admin can attribute
 * it later); paying a wrong amount out of the platform's margin is not.
 */
async function loadCommissionConfig(db) {
  const keys = [...Object.values(TYPE_SETTING), WINDOW_SETTING];
  const rates = { gemstone: 0, puja: 0, specific_puja: 0 };
  let windowDays = DEFAULT_WINDOW_DAYS;

  try {
    const { data } = await db.from('app_settings').select('key, value').in('key', keys);
    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    for (const [type, key] of Object.entries(TYPE_SETTING)) {
      const pct = Number(map[key]);
      rates[type] = Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 0;
    }
    const w = Number(map[WINDOW_SETTING]);
    if (Number.isFinite(w) && w > 0) windowDays = w;
  } catch (e) {
    console.warn('[remedyCommission] could not read settings — no commission will be attributed:', e.message);
  }

  return { rates, windowDays };
}

/**
 * Decide the referring astrologer and commission for each checkout line.
 *
 * @param db        service-role Supabase client
 * @param customerId
 * @param lines     the priced quote lines ({ itemId, type, lineTotal, … })
 * @returns Map<itemId, { astrologerId, percent, amount }> — only for lines that earned one
 *
 * Never throws. A failure here must not block a customer's purchase: the worst case is
 * an unattributed order, which an admin can fix afterwards.
 */
async function resolveLineCommissions(db, customerId, lines) {
  const result = new Map();
  if (!customerId || !Array.isArray(lines) || lines.length === 0) return result;

  try {
    const { rates, windowDays } = await loadCommissionConfig(db);

    // Nothing to attribute if every rate is zero — skip the query entirely.
    if (!Object.values(rates).some((r) => r > 0)) return result;

    const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
    if (itemIds.length === 0) return result;

    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    // Ordered newest-first so the FIRST row seen per item is the winner —
    // "last recommendation wins" when two astrologers recommended the same item.
    const { data: referrals, error } = await db
      .from('remedy_referrals')
      .select('astrologer_id, remedy_item_id, created_at')
      .eq('customer_id', customerId)
      .in('remedy_item_id', itemIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const winnerByItem = new Map();
    for (const r of referrals || []) {
      if (!winnerByItem.has(r.remedy_item_id)) winnerByItem.set(r.remedy_item_id, r.astrologer_id);
    }
    if (winnerByItem.size === 0) return result;

    for (const line of lines) {
      const astrologerId = winnerByItem.get(line.itemId);
      if (!astrologerId) continue;
      const percent = rates[line.type] ?? 0;
      if (percent <= 0) continue;
      const amount = round2((Number(line.lineTotal) || 0) * (percent / 100));
      if (amount <= 0) continue;
      result.set(line.itemId, { astrologerId, percent, amount });
    }
  } catch (e) {
    console.warn('[remedyCommission] resolve failed, order proceeds unattributed:', e.message);
    return new Map();
  }

  return result;
}

/**
 * Pay every unpaid commission on a delivered order.
 *
 * Credits each referring astrologer and debits admin_wallet by the same total, because
 * the commission is the platform's cost, not an extra charge to the customer. Note the
 * admin debit is recorded even for a Razorpay-paid order, where that money never
 * entered our ledger — the resulting negative is accurate: we owe an astrologer out of
 * revenue that went straight to the gateway.
 *
 * Idempotent twice over: `commission_paid_at` is checked and set, and each wallet call
 * carries a deterministic idempotency key. Never throws — a delivery must still be
 * recordable if the payout fails; the lines stay unpaid and can be retried.
 *
 * @returns {Promise<{paid: number, total: number, astrologers: number, error?: string}>}
 */
async function payoutOrderCommissions(db, orderId) {
  const summary = { paid: 0, total: 0, astrologers: 0 };
  if (!orderId) return summary;

  try {
    const { data: lines, error } = await db
      .from('order_items')
      .select('id, referred_by_astrologer_id, commission_amount, item_title')
      .eq('order_id', orderId)
      .not('referred_by_astrologer_id', 'is', null)
      .is('commission_paid_at', null);
    if (error) throw error;
    if (!lines || lines.length === 0) return summary;

    // One wallet write per astrologer, not per line — an order with three gemstones
    // from the same astrologer should read as one commission entry in their ledger.
    const byAstrologer = new Map();
    for (const l of lines) {
      const amt = Number(l.commission_amount) || 0;
      if (amt <= 0) continue;
      if (!byAstrologer.has(l.referred_by_astrologer_id)) {
        byAstrologer.set(l.referred_by_astrologer_id, { amount: 0, lineIds: [] });
      }
      const entry = byAstrologer.get(l.referred_by_astrologer_id);
      entry.amount = round2(entry.amount + amt);
      entry.lineIds.push(l.id);
    }

    for (const [astrologerId, entry] of byAstrologer) {
      try {
        await wallet.adjustVendorWallet(astrologerId, entry.amount, {
          description: `Referral commission — remedy order ${orderId}`,
          // Real earned income, so it belongs in today_earnings/total_earnings.
          countEarnings: true,
          idempotencyKey: `remedy-commission:${orderId}:${astrologerId}`,
        });

        // Platform's share of the cost. Logged-and-continued rather than fatal: the
        // astrologer has already been paid at this point, so a ledger hiccup must not
        // make the caller think the payout failed and retry it.
        try {
          await wallet.adjustAdminWallet(-entry.amount, {
            description: `Referral commission paid to astrologer — remedy order ${orderId}`,
            idempotencyKey: `remedy-commission:${orderId}:${astrologerId}:admin`,
          });
        } catch (adminErr) {
          console.error(`[remedyCommission] admin ledger debit failed for order ${orderId}:`, adminErr.message);
        }

        // Stamped only after the credit succeeded, so a failure leaves the lines
        // retryable rather than silently marked paid.
        const nowIso = new Date().toISOString();
        await db.from('order_items').update({ commission_paid_at: nowIso }).in('id', entry.lineIds);

        summary.paid += entry.lineIds.length;
        summary.total = round2(summary.total + entry.amount);
        summary.astrologers += 1;
      } catch (e) {
        console.error(`[remedyCommission] payout FAILED for astrologer ${astrologerId} on order ${orderId}:`, e.message);
        summary.error = e.message;
      }
    }
  } catch (e) {
    console.error(`[remedyCommission] payout could not run for order ${orderId}:`, e.message);
    summary.error = e.message;
  }

  return summary;
}

module.exports = {
  loadCommissionConfig,
  resolveLineCommissions,
  payoutOrderCommissions,
  TYPE_SETTING,
  WINDOW_SETTING,
};
