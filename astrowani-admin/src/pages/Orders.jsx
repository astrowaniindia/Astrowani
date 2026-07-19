import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

const STATUSES = ['placed', 'confirmed', 'shipped', 'completed', 'cancelled'];

const TYPE_LABEL = { puja: 'Puja', gemstone: 'Gemstone', specific_puja: 'Specific Puja', life_report: 'Life Report' };

function statusBadge(s) {
  const cls = s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : s === 'placed' ? 'amber' : 'gray';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delivering, setDelivering] = useState(null); // order being written up
  const [reportText, setReportText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/orders');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (r, status) => {
    await client.patch(`/api/admin/orders/${r.id}`, { status });
    await load();
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
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Item</th><th>Type</th><th>Qty</th><th>Total (₹)</th><th>Customer</th>
            <th>Phone</th><th>Address</th><th>Payment</th><th>Status</th><th>Placed</th><th>Report</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={11} className="empty">No orders yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.item_title}</td>
                <td className="muted">{TYPE_LABEL[r.item_type] || r.item_type}</td>
                <td>{r.quantity}</td>
                <td><b>{r.total}</b></td>
                <td>{r.customer_name || '—'}</td>
                <td className="muted">{r.customer_phone || '—'}</td>
                <td className="muted" style={{ maxWidth: 180 }}>{r.address || '—'}</td>
                <td>{r.payment_status === 'paid' ? <span className="badge green">Paid</span> : <span className="badge amber">Pending</span>}</td>
                <td>
                  <select value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div style={{ marginTop: 4 }}>{statusBadge(r.status)}</div>
                </td>
                <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                <td>
                  {r.item_type === 'life_report' && (
                    r.delivered_at ? (
                      <span className="badge green">Delivered</span>
                    ) : (
                      <button className="btn secondary sm" onClick={() => openDeliver(r)}>Write & Deliver</button>
                    )
                  )}
                </td>
              </tr>
            ))}
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
