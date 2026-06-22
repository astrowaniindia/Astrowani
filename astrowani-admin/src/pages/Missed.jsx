import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const TYPE_BADGE = {
  'Chat': 'gray',
  'Audio Call': 'green',
  'Video Call': 'amber',
};

export default function Missed() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/missed');
      setRows(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresh missed list every 15s
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Missed Sessions</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Requests an astrologer did not pick up within 1 minute (chat / audio / video).
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Astrologer</th><th>Customer</th><th>Type</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="empty">No missed sessions.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.astrologerName}</td>
                <td className="muted">{r.customerName}</td>
                <td><span className={`badge ${TYPE_BADGE[r.type] || 'gray'}`}>{r.type}</span></td>
                <td><span className="badge red">Not picked</span></td>
                <td className="muted">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
