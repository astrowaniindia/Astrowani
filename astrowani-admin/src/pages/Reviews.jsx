import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// Inline 5-star render (yellow filled, grey empty) — matches the customer app's look.
function Stars({ value = 0 }) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span style={{ color: '#FFB400', letterSpacing: 1, whiteSpace: 'nowrap' }}>
      {'★'.repeat(filled)}
      <span style={{ color: '#ccc' }}>{'★'.repeat(5 - filled)}</span>
    </span>
  );
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'visible', label: 'Visible' },
  { key: 'hidden', label: 'Hidden' },
];

export default function Reviews() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/reviews');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (tab === 'visible') return rows.filter((r) => !r.is_hidden);
    if (tab === 'hidden') return rows.filter((r) => r.is_hidden);
    return rows;
  }, [rows, tab]);

  const toggleHide = async (r) => {
    await client.patch(`/api/admin/reviews/${r.id}`, { is_hidden: !r.is_hidden });
    await load();
  };

  const remove = async (r) => {
    if (!confirm(`Permanently delete this review by ${r.customerName}? This cannot be undone.`)) return;
    await client.delete(`/api/admin/reviews/${r.id}`);
    await load();
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await client.patch(`/api/admin/reviews/${editing.id}`, {
        rating: Number(editing.rating) || 1,
        comment: editing.comment || '',
        admin_note: editing.admin_note || '',
        admin_reply: editing.admin_reply || '',
        is_hidden: !!editing.is_hidden,
      });
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

  return (
    <div>
      <h1 className="page-title">Reviews</h1>

      <div className="btn-group" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn sm ${tab === t.key ? '' : 'ghost'}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Rating</th><th>Comment</th><th>Astrologer</th><th>Customer</th>
            <th>Status</th><th>Date</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="empty">No reviews.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><Stars value={r.rating} /></td>
                <td style={{ maxWidth: 320 }} className="muted">
                  {r.comment || <em>(no comment)</em>}
                  {r.admin_reply ? <div style={{ color: '#6b1f2a', fontStyle: 'italic' }}>↳ {r.admin_reply}</div> : null}
                </td>
                <td>{r.astrologerName}</td>
                <td className="muted">{r.customerName}</td>
                <td>{r.is_hidden ? <span className="badge red">Hidden</span> : <span className="badge green">Visible</span>}</td>
                <td className="muted">{fmtDate(r.created_at)}</td>
                <td><div className="btn-group">
                  <button className="btn secondary sm" onClick={() => toggleHide(r)}>{r.is_hidden ? 'Unhide' : 'Hide'}</button>
                  <button className="btn ghost sm" onClick={() => setEditing({ ...r })}>Edit</button>
                  <button className="btn danger sm" onClick={() => remove(r)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={`Review — ${editing.astrologerName}`} onClose={() => setEditing(null)}>
          <div className="field"><label>Rating (1–5)</label>
            <select value={editing.rating} onChange={(e) => set('rating', e.target.value)}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select></div>
          <div className="field"><label>Comment</label>
            <textarea value={editing.comment || ''} onChange={(e) => set('comment', e.target.value)} /></div>
          <div className="field"><label>Public reply (shown under the review)</label>
            <textarea value={editing.admin_reply || ''} onChange={(e) => set('admin_reply', e.target.value)} /></div>
          <div className="field"><label>Internal note (admin only)</label>
            <textarea value={editing.admin_note || ''} onChange={(e) => set('admin_note', e.target.value)} /></div>
          <div className="field checkbox-row">
            <input id="hidden" type="checkbox" checked={!!editing.is_hidden} onChange={(e) => set('is_hidden', e.target.checked)} />
            <label htmlFor="hidden" style={{ margin: 0 }}>Hidden (excluded from app + average)</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
