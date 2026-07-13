import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

const EMPTY = { text: '', text_hi: '', author: '', author_hi: '', is_active: true };

export default function Thoughts() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/thoughts');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      if (editing.id) await client.put(`/api/admin/thoughts/${editing.id}`, editing);
      else await client.post('/api/admin/thoughts', editing);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm('Delete this thought?')) return;
    await client.delete(`/api/admin/thoughts/${r.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Thought of the Day</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ New Thought</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        The customer app shows the latest <b>active</b> thought on Home.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Text</th><th>Author</th><th>Active</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="empty">No thoughts yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.text}</td>
                <td className="muted">{r.author || '—'}</td>
                <td>{r.is_active ? <span className="badge green">Yes</span> : <span className="badge gray">No</span>}</td>
                <td className="muted">{new Date(r.created_at).toLocaleDateString()}</td>
                <td><div className="btn-group">
                  <button className="btn secondary sm" onClick={() => setEditing({ ...r })}>Edit</button>
                  <button className="btn danger sm" onClick={() => remove(r)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit Thought' : 'New Thought'} onClose={() => setEditing(null)}>
          <div className="field"><label>Thought text (English)</label>
            <textarea value={editing.text} onChange={(e) => set('text', e.target.value)} /></div>
          <div className="field"><label>Thought text (Hindi)</label>
            <textarea value={editing.text_hi || ''} onChange={(e) => set('text_hi', e.target.value)} placeholder="हिंदी में विचार" /></div>
          <div className="field"><label>Author (optional, English)</label>
            <input type="text" value={editing.author || ''} onChange={(e) => set('author', e.target.value)} /></div>
          <div className="field"><label>Author (optional, Hindi)</label>
            <input type="text" value={editing.author_hi || ''} onChange={(e) => set('author_hi', e.target.value)} /></div>
          <div className="field checkbox-row">
            <input id="ta" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="ta" style={{ margin: 0 }}>Active</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.text}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
