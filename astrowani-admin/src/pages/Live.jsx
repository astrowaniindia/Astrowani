import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

export default function Live() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/live');
      setRows(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // refresh active streams every 10s
    return () => clearInterval(t);
  }, [load]);

  const stop = async (r) => {
    if (!confirm(`Force-stop ${r.astrologerName}'s live stream?`)) return;
    await client.post(`/api/admin/live/${r.id}/stop`);
    await load();
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Live Streams</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Astrologers currently broadcasting. Use Stop to immediately end a stream (both vendor and viewers are dropped).
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Astrologer</th><th>Title</th><th>Viewers</th><th>Gifts (₹)</th><th>Started</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="empty">No live streams right now.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="badge red" style={{ marginRight: 8 }}>● LIVE</span>
                  {r.astrologerName}
                </td>
                <td className="muted">{r.title || '—'}</td>
                <td>{r.viewerCount}</td>
                <td><b>{r.totalGiftAmount}</b></td>
                <td className="muted">{r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : '—'}</td>
                <td><button className="btn danger sm" onClick={() => stop(r)}>Stop</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
