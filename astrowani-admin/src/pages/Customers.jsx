import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topup, setTopup] = useState(null); // customer being topped up
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/customers');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submitTopup = async () => {
    const amt = Number(amount);
    if (!amt) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/customers/${topup.id}/wallet`, { amount: amt });
      setTopup(null);
      setAmount('');
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="page-title">Customers</h1>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Wallet (₹)</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="empty">No customers.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name || '—'}</td>
                <td className="muted">{r.mobile || '—'}</td>
                <td className="muted">{r.email || '—'}</td>
                <td><b>{r.wallet_balance ?? 0}</b></td>
                <td className="muted">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                <td><button className="btn secondary sm" onClick={() => { setTopup(r); setAmount(''); }}>Adjust wallet</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {topup && (
        <Modal title={`Adjust wallet — ${topup.name || topup.mobile}`} onClose={() => setTopup(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Current balance: <b>₹{topup.wallet_balance ?? 0}</b>. Enter a positive amount to credit,
            negative to debit.
          </p>
          <div className="field"><label>Amount (₹)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setTopup(null)}>Cancel</button>
            <button className="btn" onClick={submitTopup} disabled={busy || !amount}>{busy ? 'Applying…' : 'Apply'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
