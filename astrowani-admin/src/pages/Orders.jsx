import { useEffect, useState } from 'react';
import client from '../api/client';

const STATUSES = ['placed', 'confirmed', 'shipped', 'completed', 'cancelled'];

const TYPE_LABEL = { puja: 'Puja', gemstone: 'Gemstone', specific_puja: 'Specific Puja' };

function statusBadge(s) {
  const cls = s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : s === 'placed' ? 'amber' : 'gray';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      <h1 className="page-title">Orders</h1>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Item</th><th>Type</th><th>Qty</th><th>Total (₹)</th><th>Customer</th>
            <th>Phone</th><th>Address</th><th>Payment</th><th>Status</th><th>Placed</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={10} className="empty">No orders yet.</td></tr>}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
