import { useEffect, useState } from 'react';
import client from '../api/client';

function statusBadge(s) {
  const cls = s === 'actioned' ? 'red' : s === 'reviewed' ? 'green' : 'amber';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/reports');
      setRows(data.data || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (r, status) => {
    const note = window.prompt(`Admin note for marking "${status}" (optional):`) || '';
    try {
      await client.patch(`/api/admin/reports/${r.id}`, { status, admin_note: note });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to update report.');
    }
  };

  return (
    <div>
      <h1 className="page-title">Astrologer Reports</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Complaints customers have filed against astrologers.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Astrologer</th><th>Reported By</th><th>Reason</th><th>Note</th>
            <th>Status</th><th>Filed</th><th>Admin Note</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={8} className="empty" style={{ color: '#c0392b' }}>{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="empty">No reports yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.astrologers ? `${r.astrologers.first_name || ''} ${r.astrologers.last_name || ''}`.trim() : '—'}</td>
                <td className="muted">{r.customers?.name || '—'} <br /><span className="muted">{r.customers?.mobile || ''}</span></td>
                <td><b>{r.reason}</b></td>
                <td className="muted">{r.note || '—'}</td>
                <td>{statusBadge(r.status)}</td>
                <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                <td className="muted">{r.admin_note || '—'}</td>
                <td>
                  {r.status === 'pending' && (
                    <>
                      <button className="btn secondary" onClick={() => act(r, 'reviewed')} style={{ marginRight: 6 }}>Mark Reviewed</button>
                      <button className="btn secondary" onClick={() => act(r, 'actioned')}>Mark Actioned</button>
                    </>
                  )}
                  {r.status === 'reviewed' && (
                    <button className="btn secondary" onClick={() => act(r, 'actioned')}>Mark Actioned</button>
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
