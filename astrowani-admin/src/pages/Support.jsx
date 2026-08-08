import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const STATUS_BADGE = { open: 'red', in_progress: 'amber', resolved: 'green' };
const TABS = ['open', 'in_progress', 'resolved', 'all'];

export default function Support() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/support-tickets');
      setRows(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    await client.put(`/api/admin/support-tickets/${id}`, { status, admin_note: notes[id] });
    load();
  };

  const visible = tab === 'all' ? rows : rows.filter((r) => r.status === tab);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Support Tickets</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      <div className="btn-group" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t} className={`btn sm ${tab === t ? '' : 'ghost'}`} onClick={() => setTab(t)}>
            {t === 'all' ? 'All' : t.replace('_', ' ')} ({t === 'all' ? rows.length : rows.filter((r) => r.status === t).length})
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Submitted</th><th>Name</th><th>Contact</th><th>Issue</th><th>Message</th><th>Status</th><th>Note / Resolve</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && visible.length === 0 && <tr><td colSpan={7} className="empty">No tickets here.</td></tr>}
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.name}</td>
                <td className="muted">{r.email}{r.mobile ? ` · ${r.mobile}` : ''}</td>
                <td><span className={`badge ${r.issue_type === 'Refund Request' ? 'red' : 'gray'}`}>{r.issue_type}</span></td>
                <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>{r.message}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || 'gray'}`}>{r.status.replace('_', ' ')}</span></td>
                <td>
                  <input
                    type="text"
                    placeholder="admin note"
                    defaultValue={r.admin_note || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    style={{ width: 140, marginRight: 6 }}
                  />
                  {r.status !== 'in_progress' && (
                    <button className="btn secondary" onClick={() => setStatus(r.id, 'in_progress')}>In progress</button>
                  )}
                  {r.status !== 'resolved' && (
                    <button className="btn" onClick={() => setStatus(r.id, 'resolved')}>Resolve</button>
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
