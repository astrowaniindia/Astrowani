import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// The fulfilment path, in order. Must stay in step with ADMIN_SETTABLE_STATUSES in
// astrowani-backend/src/adminRoutes.js — the backend rejects anything outside that list,
// and orders.status now carries a matching CHECK constraint.
const STATUSES = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'completed', 'cancelled'];

// Which transitions send the customer a push (adminRoutes.js STATUS_PUSH). Surfaced in the
// confirm dialog so nobody changes a status without realising the customer gets notified.
const NOTIFIES = new Set(['shipped', 'out_for_delivery', 'completed', 'cancelled']);

const TYPE_LABEL = {
  puja: 'Puja', gemstone: 'Gemstone', specific_puja: 'Specific Puja',
  life_report: 'Life Report', mixed: 'Mixed',
};

const STATUS_LABEL = {
  pending_payment: 'awaiting payment', placed: 'placed', confirmed: 'confirmed',
  packed: 'packed', shipped: 'shipped', out_for_delivery: 'out for delivery',
  completed: 'delivered', cancelled: 'cancelled',
};

function statusBadge(s) {
  const cls = s === 'completed' ? 'green'
    : s === 'cancelled' ? 'red'
      : s === 'pending_payment' ? 'gray'
        : s === 'placed' ? 'amber' : 'blue';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[s] || s}</span>;
}

function paymentBadge(r) {
  if (r.payment_status === 'paid') return <span className="badge green">Paid</span>;
  if (r.payment_status === 'refunded') return <span className="badge gray">Refunded</span>;
  if (r.payment_status === 'refund_pending') return <span className="badge red">Refund due</span>;
  if (r.payment_status === 'failed') return <span className="badge red">Failed</span>;
  return <span className="badge amber">Pending</span>;
}

function addressText(r) {
  const a = r.delivery_address;
  if (!a) return r.address || '—';
  return [a.house_flat, a.street_area, a.landmark, a.city, a.state, a.pincode]
    .filter(Boolean).join(', ');
}

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState(null); // life_report being written up
  const [reportText, setReportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      // Abandoned Razorpay checkouts sit at 'pending_payment' and are hidden by default —
      // they aren't orders to fulfil. Worth revealing when investigating a customer who
      // says they paid but sees no order.
      if (showUnpaid) params.includeUnpaid = 1;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const { data } = await client.get('/api/admin/orders', { params });
      setRows(data.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [showUnpaid, statusFilter, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free-text search stays client-side: the endpoint already caps at 300 rows, so
  // filtering here avoids a round trip per keystroke.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [
      r.item_title, r.customer_name, r.customer_phone, r.delivery_address?.pincode,
      r.razorpay_payment_id, r.id,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [rows, search]);

  const setStatus = async (r, status) => {
    if (status === r.status) return;
    const warning = NOTIFIES.has(status)
      ? `\n\nThis sends the customer a push notification.`
      : '';
    if (!confirm(`Move "${r.item_title}" to "${STATUS_LABEL[status] || status}"?${warning}`)) return;
    try {
      await client.patch(`/api/admin/orders/${r.id}`, { status });
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const markPaid = async (r) => {
    // A manual override for the rare case where money arrived out of band. Deliberately
    // confirmed and deliberately loud: normally payment_status is only ever set by the
    // verified Razorpay/wallet flow in src/orderRoutes.js.
    if (!confirm(
      `Mark this order PAID manually?\n\nOnly do this if you have confirmed the money arrived `
      + `outside the app. Normal payments mark themselves paid automatically.`,
    )) return;
    try {
      await client.patch(`/api/admin/orders/${r.id}`, { payment_status: 'paid' });
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const openDeliver = (r) => {
    setDelivering(r);
    setReportText(r.report_content || '');
  };

  const submitReport = async () => {
    if (!reportText.trim()) return;
    setBusy(true);
    try {
      await client.patch(`/api/admin/orders/${delivering.id}`, { report_content: reportText });
      setDelivering(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Orders</h1>

      <div className="card" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label>Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Item, customer, phone, pincode, payment id"
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="checkbox-row">
          <input id="unpaid" type="checkbox" checked={showUnpaid} onChange={(e) => setShowUnpaid(e.target.checked)} />
          <label htmlFor="unpaid" style={{ margin: 0 }}>Include abandoned checkouts</label>
        </div>
        <button className="btn secondary sm" onClick={load}>Refresh</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Order</th><th>Type</th><th>Items</th><th>Total (₹)</th><th>Customer</th>
            <th>Deliver to</th><th>Payment</th><th>Status</th><th>Placed</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
            {!loading && visible.length === 0 && <tr><td colSpan={10} className="empty">No orders match.</td></tr>}
            {visible.map((r) => {
              const items = r.order_items || [];
              const isOpen = expanded === r.id;
              return [
                <tr key={r.id}>
                  <td>
                    <div>{r.item_title}</div>
                    <div className="muted" style={{ fontSize: 11 }}>#{String(r.id).split('-').pop().toUpperCase()}</div>
                  </td>
                  <td className="muted">{TYPE_LABEL[r.item_type] || r.item_type}</td>
                  <td>{items.length || r.quantity || 1}</td>
                  <td><b>{r.grand_total ?? r.total}</b></td>
                  <td>
                    <div>{r.customer_name || '—'}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{r.customer_phone || '—'}</div>
                  </td>
                  <td className="muted" style={{ maxWidth: 200 }}>
                    {addressText(r)}
                    {r.delivery_address?.pincode ? (
                      <div><b>{r.delivery_address.pincode}</b></div>
                    ) : null}
                  </td>
                  <td>
                    {paymentBadge(r)}
                    <div className="muted" style={{ fontSize: 11 }}>{r.payment_method || '—'}</div>
                    {r.payment_status !== 'paid' && r.status !== 'pending_payment' && r.status !== 'cancelled' ? (
                      <button className="btn secondary sm" style={{ marginTop: 4 }} onClick={() => markPaid(r)}>
                        Mark paid
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {/* Two states are read-only. An abandoned checkout has no fulfilment
                        status to set — the dropdown would invite pushing an unpaid order
                        into 'shipped'. And a cancelled order is terminal: reviving one the
                        customer was already refunded for would queue goods nobody paid
                        for. The backend rejects both regardless of what the UI shows. */}
                    {r.status === 'pending_payment' || r.status === 'cancelled' ? statusBadge(r.status) : (
                      <>
                        <select value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
                          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        <div style={{ marginTop: 4 }}>{statusBadge(r.status)}</div>
                      </>
                    )}
                  </td>
                  <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn secondary sm" onClick={() => setExpanded(isOpen ? null : r.id)}>
                        {isOpen ? 'Hide' : 'Details'}
                      </button>
                      {r.item_type === 'life_report' && (
                        r.delivered_at
                          ? <span className="badge green">Delivered</span>
                          : <button className="btn secondary sm" onClick={() => openDeliver(r)}>Write &amp; Deliver</button>
                      )}
                    </div>
                  </td>
                </tr>,

                isOpen ? (
                  <tr key={`${r.id}-details`}>
                    <td colSpan={10} style={{ background: 'rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
                        <div style={{ minWidth: 280 }}>
                          <h4 style={{ margin: '0 0 6px' }}>Items</h4>
                          {items.length ? items.map((li) => (
                            <div key={li.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                              {li.image ? <img src={li.image} className="thumb" alt="" /> : null}
                              <span style={{ flex: 1 }}>{li.item_title}</span>
                              <span className="muted">× {li.quantity}</span>
                              <b>₹{li.line_total}</b>
                            </div>
                          )) : (
                            // Orders placed before order_items existed (every life_report)
                            // keep their single item in the inline columns.
                            <div className="muted">
                              {r.item_title} × {r.quantity} — ₹{r.total}
                            </div>
                          )}

                          {r.grand_total != null ? (
                            <div style={{ marginTop: 10, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 6 }}>
                              <div className="row-between"><span className="muted">Item total</span><span>₹{r.subtotal}</span></div>
                              <div className="row-between"><span className="muted">Delivery</span><span>{Number(r.delivery_fee) === 0 ? 'FREE' : `₹${r.delivery_fee}`}</span></div>
                              {Number(r.handling_fee) > 0 ? (
                                <div className="row-between"><span className="muted">Handling</span><span>₹{r.handling_fee}</span></div>
                              ) : null}
                              <div className="row-between"><b>Total</b><b>₹{r.grand_total}</b></div>
                            </div>
                          ) : null}
                        </div>

                        <div style={{ minWidth: 240 }}>
                          <h4 style={{ margin: '0 0 6px' }}>Delivery address</h4>
                          {r.delivery_address ? (
                            <div className="muted" style={{ lineHeight: 1.6 }}>
                              <div><b>{r.delivery_address.full_name}</b> · {r.delivery_address.phone}</div>
                              <div>{r.delivery_address.house_flat}</div>
                              {r.delivery_address.street_area ? <div>{r.delivery_address.street_area}</div> : null}
                              {r.delivery_address.landmark ? <div>Near {r.delivery_address.landmark}</div> : null}
                              <div>{[r.delivery_address.city, r.delivery_address.state].filter(Boolean).join(', ')}</div>
                              <div><b>{r.delivery_address.pincode}</b></div>
                              <div style={{ marginTop: 4 }}>({r.delivery_address.label})</div>
                            </div>
                          ) : (
                            <div className="muted">{r.address || 'No address recorded.'}</div>
                          )}

                          {r.razorpay_payment_id ? (
                            <>
                              <h4 style={{ margin: '14px 0 6px' }}>Payment</h4>
                              <div className="muted" style={{ fontSize: 12 }}>
                                <div>Payment: <code>{r.razorpay_payment_id}</code></div>
                                <div>Order: <code>{r.razorpay_order_id}</code></div>
                                {r.paid_at ? <div>Paid {new Date(r.paid_at).toLocaleString()}</div> : null}
                              </div>
                            </>
                          ) : null}
                        </div>

                        <div style={{ minWidth: 260 }}>
                          <h4 style={{ margin: '0 0 6px' }}>History</h4>
                          {(r.order_status_events || []).length ? (
                            [...r.order_status_events]
                              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                              .map((ev) => (
                                <div key={ev.id} className="muted" style={{ fontSize: 12, padding: '2px 0' }}>
                                  <b>{STATUS_LABEL[ev.status] || ev.status}</b>
                                  {' — '}{new Date(ev.created_at).toLocaleString()}
                                  <div>{ev.note ? `${ev.note} ` : ''}<i>by {ev.created_by}</i></div>
                                </div>
                              ))
                          ) : (
                            <div className="muted">No history recorded for this order.</div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      {delivering && (
        <Modal title={`Write report — ${delivering.item_title}`} onClose={() => setDelivering(null)}>
          <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
            For {delivering.customer_name || 'customer'} ({delivering.customer_phone || '—'}). This is sent as a
            push notification and shown in the customer's app once saved.
          </p>
          <div className="field"><label>Report content</label>
            <textarea
              rows={12}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Write the full report here..."
            />
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setDelivering(null)}>Cancel</button>
            <button className="btn" onClick={submitReport} disabled={busy || !reportText.trim()}>
              {busy ? 'Delivering…' : 'Deliver Report'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
