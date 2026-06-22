import { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// Date-range filter chips for the created_at column.
const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' },
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// Returns true if `created` falls inside the selected range.
function inRange(created, filter) {
  if (filter === 'all') return true;
  if (!created) return false;
  const c = new Date(created);
  const now = new Date();
  const today = startOfDay(now);
  if (filter === 'today') return c >= today;
  if (filter === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return c >= y && c < today;
  }
  if (filter === 'week') {
    const w = new Date(today); w.setDate(w.getDate() - 6); // last 7 days incl. today
    return c >= w;
  }
  if (filter === 'month') {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    return c >= m;
  }
  return true;
}

const fullName = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Astrologer';

export default function NewEntries() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/new-entries');
      setRows(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // auto-refresh so new signups appear
    return () => clearInterval(t);
  }, [load]);

  const moderate = async (id, approval_status) => {
    setBusyId(id);
    try {
      await client.patch(`/api/admin/astrologers/${id}`, { approval_status });
      setViewing(null);
      await load(); // row leaves the pending list once decided
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => rows.filter((r) => inRange(r.created_at, filter)), [rows, filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) c[f.key] = rows.filter((r) => inRange(r.created_at, f.key)).length;
    return c;
  }, [rows]);

  return (
    <div>
      <div className="row-between">
        <h1 className="page-title">New Entries</h1>
        <button className="btn secondary sm" onClick={load}>Refresh</button>
      </div>
      <p className="muted">New astrologer signups awaiting approval. Accept to let them into their dashboard; they only appear in the customer app once they also complete their profile.</p>

      <div className="btn-group" style={{ margin: '14px 0' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn sm ${filter === f.key ? '' : 'ghost'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({counts[f.key] ?? 0})
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Phone</th><th>Email</th><th>Experience</th><th>Signed up</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="empty">No pending entries for this period.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{fullName(r)}</td>
                <td className="muted">{r.phone_number || '—'}</td>
                <td className="muted">{r.email || '—'}</td>
                <td>{r.experience != null ? `${r.experience} yr` : '—'}</td>
                <td className="muted">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                <td><div className="btn-group">
                  <button className="btn ghost sm" onClick={() => setViewing(r)}>View</button>
                  <button className="btn sm" disabled={busyId === r.id} onClick={() => moderate(r.id, 'approved')}>
                    {busyId === r.id ? '…' : 'Accept'}
                  </button>
                  <button className="btn danger sm" disabled={busyId === r.id} onClick={() => moderate(r.id, 'rejected')}>Reject</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title={`Application — ${fullName(viewing)}`} onClose={() => setViewing(null)}>
          {viewing.profile_image
            ? <img src={viewing.profile_image} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', marginBottom: 12 }} />
            : <div className="muted" style={{ marginBottom: 12 }}>No photo uploaded</div>}
          <div className="field"><label>Email</label><div>{viewing.email || '—'}</div></div>
          <div className="two-col">
            <div className="field"><label>Phone</label><div>{viewing.phone_number || '—'}</div></div>
            <div className="field"><label>Gender</label><div>{viewing.gender || '—'}</div></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Experience</label><div>{viewing.experience != null ? `${viewing.experience} yr` : '—'}</div></div>
            <div className="field"><label>Languages</label><div>{Array.isArray(viewing.languages) ? viewing.languages.join(', ') || '—' : (viewing.languages || '—')}</div></div>
          </div>
          <div className="field"><label>Signed up</label><div>{viewing.created_at ? new Date(viewing.created_at).toLocaleString() : '—'}</div></div>
          <div className="actions">
            <button className="btn danger" disabled={busyId === viewing.id} onClick={() => moderate(viewing.id, 'rejected')}>Reject</button>
            <button className="btn" disabled={busyId === viewing.id} onClick={() => moderate(viewing.id, 'approved')}>
              {busyId === viewing.id ? 'Saving…' : 'Accept'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
