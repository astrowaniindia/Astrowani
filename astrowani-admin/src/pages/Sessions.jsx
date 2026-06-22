import { useEffect, useState } from 'react';
import client from '../api/client';

export default function Sessions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/api/admin/sessions')
      .then(({ data }) => setRows(data.data || []))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

  return (
    <div>
      <h1 className="page-title">Sessions</h1>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Type</th><th>Caller</th><th>Vendor</th><th>Active</th>
            <th>Started</th><th>Ended</th><th>₹/min</th><th>Charged</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="empty">No sessions.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.call_type || '—'}</td>
                <td className="muted" title={r.caller_id}>{String(r.caller_id || '').slice(0, 8)}…</td>
                <td className="muted" title={r.vendor_id}>{String(r.vendor_id || '').slice(0, 8)}…</td>
                <td>{r.is_active ? <span className="badge green">Live</span> : <span className="badge gray">Ended</span>}</td>
                <td className="muted">{fmt(r.started_at)}</td>
                <td className="muted">{fmt(r.ended_at)}</td>
                <td>{r.per_minute_charge ?? '—'}</td>
                <td><b>{r.total_charged ?? 0}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
