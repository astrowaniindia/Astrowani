import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const EMPTY = { name: '', name_hi: '', image: '', sort_order: 0 };

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/categories');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...editing, sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) await client.put(`/api/admin/categories/${editing.id}`, payload);
      else await client.post('/api/admin/categories', payload);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm(`Delete category "${r.name}"?`)) return;
    await client.delete(`/api/admin/categories/${r.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Categories</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ New Category</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Name</th><th>Order</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="empty">No categories yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} className="thumb" alt="" /> : null}</td>
                <td>{r.name}</td>
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
        <Modal title={editing.id ? 'Edit Category' : 'New Category'} onClose={() => setEditing(null)}>
          <div className="field"><label>Name (English)</label>
            <input type="text" value={editing.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label>Name (Hindi)</label>
            <input type="text" value={editing.name_hi || ''} onChange={(e) => set('name_hi', e.target.value)} placeholder="हिंदी में नाम" /></div>
          <ImageField label="Icon / image (URL or upload)" value={editing.image} onChange={(v) => set('image', v)} />
          <div className="field"><label>Sort order</label>
            <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.name}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
