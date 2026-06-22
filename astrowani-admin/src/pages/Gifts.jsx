import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const EMPTY = { name: '', price: 0, image: '', is_active: true, sort_order: 0 };

export default function Gifts() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/gifts');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...editing, price: Number(editing.price) || 0, sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) await client.put(`/api/admin/gifts/${editing.id}`, payload);
      else await client.post('/api/admin/gifts', payload);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm(`Delete gift "${r.name}"?`)) return;
    await client.delete(`/api/admin/gifts/${r.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Gifts</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ New Gift</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Gifts customers can send during live streams and on astrologer profiles. Astrologer receives 50%; the rest is platform revenue.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Name</th><th>Price (₹)</th><th>Active</th><th>Order</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="empty">No gifts yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} className="thumb" alt="" /> : null}</td>
                <td>{r.name}</td>
                <td>₹{r.price}</td>
                <td>{r.is_active ? <span className="badge green">Yes</span> : <span className="badge gray">No</span>}</td>
                <td>{r.sort_order}</td>
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
        <Modal title={editing.id ? 'Edit Gift' : 'New Gift'} onClose={() => setEditing(null)}>
          <div className="field"><label>Name</label>
            <input type="text" value={editing.name} onChange={(e) => set('name', e.target.value)} /></div>
          <ImageField label="Gift icon (URL or upload)" value={editing.image} onChange={(v) => set('image', v)} />
          <div className="two-col">
            <div className="field"><label>Price (₹)</label>
              <input type="number" value={editing.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div className="field"><label>Sort order</label>
              <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
          </div>
          <div className="field checkbox-row">
            <input id="ga" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="ga" style={{ margin: 0 }}>Active</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.name}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
