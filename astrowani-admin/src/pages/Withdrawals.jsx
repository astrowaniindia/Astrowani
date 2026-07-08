import { useEffect, useState } from 'react';
import client from '../api/client';

function statusBadge(s) {
  const cls = s === 'paid' ? 'green' : s === 'rejected' ? 'red' : s === 'approved' ? 'amber' : 'gray';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export default function Withdrawals() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/withdrawals');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const act = async (r, status) => {
    const note = status === 'rejected' ? window.prompt('Reason for rejecting (optional):') || '' : '';
    await client.patch(`/api/admin/withdrawals/${r.id}`, { status, admin_note: note });
    await load();
  };

  return (
    <div>
      <h1 className="page-title">Withdrawal Requests</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Vendor payout requests. Amount is already deducted from the vendor's wallet on request —
        rejecting refunds it automatically.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Astrologer</th><th>Phone</th><th>Amount (₹)</th><th>Status</th>
            <th>Requested</th><th>Note</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="empty">No withdrawal requests yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.astrologers ? `${r.astrologers.first_name || ''} ${r.astrologers.last_name || ''}`.trim() : '—'}</td>
                <td className="muted">{r.astrologers?.mobile || '—'}</td>
                <td><b>{r.amount}</b></td>
                <td>{statusBadge(r.status)}</td>
                <td className="muted">{new Date(r.requested_at).toLocaleString()}</td>
                <td className="muted">{r.admin_note || '—'}</td>
                <td>
                  {r.status === 'pending' && (
                    <>
                      <button className="btn secondary" onClick={() => act(r, 'approved')} style={{ marginRight: 6 }}>Approve</button>
                      <button className="btn secondary" onClick={() => act(r, 'rejected')}>Reject</button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <button className="btn secondary" onClick={() => act(r, 'paid')}>Mark Paid</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
