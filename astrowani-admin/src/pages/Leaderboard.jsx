import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

function formatResponseTime(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/api/admin/leaderboard');
      setRows(data.data || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Astrologer Leaderboard</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Ranked by acceptance rate, rating, and response time — the same metrics astrologers see about themselves.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>#</th><th>Astrologer</th><th>Rating</th><th>Acceptance Rate</th>
            <th>Avg. Response</th><th>Repeat Customers</th><th>Resolved Requests</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {error && <tr><td colSpan={7} className="empty" style={{ color: '#c0392b' }}>{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={7} className="empty">No astrologers yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td><b>{i + 1}</b></td>
                <td>{r.name}</td>
                <td className="muted">{r.rating ? `${r.rating.toFixed(1)} ★ (${r.totalReviews})` : '—'}</td>
                <td>{r.acceptanceRate != null ? `${r.acceptanceRate}%` : '—'}</td>
                <td className="muted">{formatResponseTime(r.avgResponseSeconds)}</td>
                <td className="muted">{r.repeatCustomerRate != null ? `${r.repeatCustomerRate}%` : '—'}</td>
                <td className="muted">{r.resolvedRequests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
