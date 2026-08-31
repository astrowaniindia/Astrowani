// Turning a WhatsApp conversation into a real order.
//
// The bot agrees the item and (for a gemstone) the weight, then calls this. It
// writes the SAME orders/order_items rows the app's checkout writes, so My Orders,
// the admin fulfilment queue, stock, order tracking and astrologer referral
// commission all keep working - a sale that moved to WhatsApp should not fall out
// of the business.
//
// Two rules carried over from the in-app checkout, for the same reasons:
//   - the price comes from the DATABASE, never from anything the model said. The
//     bot is told to quote only what it read, but "told to" is not a guarantee,
//     and this is money.
//   - the order exists BEFORE the payment link does, so a paid link always has an
//     order behind it.

const { createClient } = require('@supabase/supabase-js');
const razorpay = require('./razorpay');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const clampQty = (q) => Math.max(1, Math.min(10, Math.round(Number(q) || 1)));

/**
 * Builds the tool implementation the bot calls to close a sale. Bound to one
 * conversation so the model cannot create an order against somebody else's.
 */
function makeCreateOrderTool(convo) {
  return async function createOrderAndPaymentLink({ item_id, variant_id, quantity }) {
    if (!razorpay.isConfigured()) {
      return { error: 'Payment is not switched on yet. Tell the customer someone will follow up.' };
    }
    const qty = clampQty(quantity);

    // ── price it from the database, not from the conversation ────────────────
    const { data: item } = await db
      .from('remedy_items')
      .select('id, type, title, price, stock, is_active')
      .eq('id', item_id)
      .maybeSingle();
    if (!item || item.is_active === false) return { error: 'That item is not available.' };

    let unitPrice = Number(item.price) || 0;
    let variantLabel = null;
    let variantId = null;

    if (variant_id) {
      const { data: v } = await db
        .from('remedy_item_variants')
        .select('id, item_id, label, price, stock, is_active')
        .eq('id', variant_id)
        .maybeSingle();
      // The variant must belong to THIS item — otherwise a mixed-up id could sell
      // a cheap stone's weight against an expensive one.
      if (!v || v.item_id !== item.id || v.is_active === false) {
        return { error: 'That weight is not available for this item.' };
      }
      if (v.stock !== null && v.stock < qty) {
        return { error: `Only ${v.stock} left in ${v.label}.` };
      }
      unitPrice = Number(v.price);
      variantLabel = v.label;
      variantId = v.id;
    } else {
      // A gemstone priced by weight must not be sold without one — that is exactly
      // how a customer ends up paying the 5 ratti price for an 8 ratti stone.
      const { data: weights } = await db
        .from('remedy_item_variants')
        .select('id')
        .eq('item_id', item.id)
        .eq('is_active', true)
        .limit(1);
      if (weights && weights.length) {
        return { error: 'This item is priced by weight — ask the customer which ratti they want first.' };
      }
      if (item.stock !== null && item.stock < qty) {
        return { error: `Only ${item.stock} left.` };
      }
    }

    const subtotal = unitPrice * qty;

    // ── the order ────────────────────────────────────────────────────────────
    const orderRow = {
      customer_id: convo.customer_id || null,
      item_type: item.type,
      // The legacy inline columns are still read by older screens (see
      // sql/remedy_commerce_schema.sql), so they keep being written.
      item_id: item.id,
      item_title: variantLabel ? `${item.title} (${variantLabel})` : item.title,
      quantity: qty,
      subtotal,
      delivery_fee: 0,
      handling_fee: 0,
      grand_total: subtotal,
      total: subtotal,
      status: 'pending_payment',
      payment_status: 'pending',
      payment_method: 'razorpay',
      source: 'whatsapp',
      whatsapp_conversation_id: convo.id,
      customer_name: convo.display_name || null,
      customer_phone: convo.wa_id || null,
    };

    const { data: order, error: orderErr } = await db
      .from('orders').insert([orderRow]).select('id').single();
    if (orderErr) {
      console.error('[whatsappOrders] order insert failed:', orderErr.message);
      return { error: 'Could not create the order just now.' };
    }

    const { error: lineErr } = await db.from('order_items').insert([{
      order_id: order.id,
      item_id: item.id,
      item_type: item.type,
      title: item.title,
      unit_price: unitPrice,
      quantity: qty,
      line_total: subtotal,
      variant_id: variantId,
      variant_label: variantLabel,
    }]);
    if (lineErr) {
      // Without its line the order is a total with nothing behind it — nobody
      // could fulfil it and the commission logic would see an empty basket.
      await db.from('orders').delete().eq('id', order.id);
      console.error('[whatsappOrders] order_items insert failed:', lineErr.message);
      return { error: 'Could not create the order just now.' };
    }

    // ── the link ─────────────────────────────────────────────────────────────
    let link;
    try {
      link = await razorpay.createPaymentLink({
        amountRupees: subtotal,
        referenceId: order.id,
        description: orderRow.item_title,
        customer: { name: convo.display_name, contact: convo.wa_id },
      });
    } catch (e) {
      // The order stays pending_payment and shows in the admin's "abandoned
      // checkouts" view, so nothing is lost — but the customer must not be sent
      // a link that does not exist.
      console.error('[whatsappOrders] payment link failed:', e.message);
      return { error: 'Could not create the payment link. Tell the customer someone will send it shortly.' };
    }

    await db.from('orders').update({
      razorpay_payment_link_id: link.id,
    }).eq('id', order.id);

    return {
      ok: true,
      order_id: order.id,
      item: orderRow.item_title,
      quantity: qty,
      // Give the model the figure it is allowed to say, so it does not do its own
      // arithmetic on the way to the customer.
      total_rupees: subtotal,
      payment_link: link.short_url,
    };
  };
}

module.exports = { makeCreateOrderTool };
