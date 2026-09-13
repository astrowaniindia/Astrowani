import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';

// Home Greeting — the line at the top of the customer app's Home ("Jai Shree Ram").
// Backed by the `thoughts` table. Every ACTIVE line is used: each time a customer
// opens the app, Home shows the next active line after the one they saw last
// (GET /api/thoughts/active). Older installed app versions still show only the
// newest active line (/api/thoughts/latest).
const EMPTY = { text: '', text_hi: '', is_active: true };

export default function Thoughts() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/thoughts');
    // Oldest first — the same order the app rotates through.
    const list = (data.data || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    setRows(list);
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
    if (!confirm('Delete this greeting line?')) return;
    await client.delete(`/api/admin/thoughts/${r.id}`);
    await load();
  };

  const toggleActive = async (r) => {
    await client.put(`/api/admin/thoughts/${r.id}`, { ...r, is_active: !r.is_active });
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Home Greeting</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ Add line</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        The line shown at the top of Home in the customer app (for example <b>Jai Shree Ram</b>).
        Each time a customer opens the app, Home shows the <b>next active line</b> in this list,
        in order, so it changes on every open. {activeCount === 0
          ? 'No line is active, so the app shows its built-in welcome text.'
          : `${activeCount} active line${activeCount === 1 ? '' : 's'} in rotation.`}
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>English</th><th>Hindi</th><th>In rotation</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="empty">No greeting lines yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{i + 1}</td>
                <td>{r.text}</td>
                <td className="muted">{r.text_hi || '— (shows English)'}</td>
                <td>
                  <button className={`btn sm ${r.is_active ? '' : 'ghost'}`} onClick={() => toggleActive(r)}>
                    {r.is_active ? 'On' : 'Off'}
                  </button>
                </td>
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
        <Modal title={editing.id ? 'Edit greeting line' : 'New greeting line'} onClose={() => setEditing(null)}>
          <div className="field"><label>Greeting (English / Hinglish)</label>
            <input type="text" value={editing.text} onChange={(e) => set('text', e.target.value)} placeholder="Jai Shree Ram" /></div>
          <div className="field"><label>Greeting (Hindi, optional)</label>
            <input type="text" value={editing.text_hi || ''} onChange={(e) => set('text_hi', e.target.value)} placeholder="जय श्री राम" /></div>
          <div className="field checkbox-row">
            <input id="ta" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="ta" style={{ margin: 0 }}>In rotation</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.text.trim()}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
