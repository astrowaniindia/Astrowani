import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const CATEGORIES = [
  'Kundli', 'Matching', 'Chart', 'Dasha', 'Dosh', 'Numerology', 'Lal Kitab', 'KP Astrology', 'Tarot', 'PDF Reports',
];

const EMPTY = { key: '', name: '', description: '', category: CATEGORIES[0], price: 0, image: '', is_active: true, sort_order: 0 };

export default function AstroServices() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState(CATEGORIES[0]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await client.get('/api/admin/astro-services');
      setRows(data.data || []);
    } catch (e) {
      setLoadError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...editing, price: Number(editing.price) || 0, sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) await client.put(`/api/admin/astro-services/${editing.id}`, payload);
      else await client.post('/api/admin/astro-services', payload);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    await client.delete(`/api/admin/astro-services/${r.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  const visibleRows = rows.filter((r) => r.category === tab);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Astro Services</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY, category: tab })}>+ New Service</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Paid astrology reports (JyotishamAstroAPI). Every purchase debits the customer's wallet
        and credits the platform admin wallet in full — no vendor split.
      </p>

      <div className="btn-group" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <button key={c} className={`btn sm ${tab === c ? '' : 'ghost'}`} onClick={() => setTab(c)}>{c}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Image</th><th>Key</th><th>Name</th><th>Price (₹)</th><th>Active</th><th>Order</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && loadError && (
              <tr><td colSpan={7} className="empty" style={{ color: 'var(--red)' }}>
                Couldn't load astro services: {loadError} (run sql/astro_services_schema.sql in the Supabase SQL editor)
              </td></tr>
            )}
            {!loading && !loadError && visibleRows.length === 0 && <tr><td colSpan={7} className="empty">No services in {tab} yet.</td></tr>}
            {visibleRows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} alt="" className="thumb" /> : <span className="muted">—</span>}</td>
                <td><code>{r.key}</code></td>
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
        <Modal title={editing.id ? 'Edit Service' : 'New Service'} onClose={() => setEditing(null)}>
          <div className="field"><label>Key (matches /api/astro/:key — don't change after launch)</label>
            <input type="text" value={editing.key} onChange={(e) => set('key', e.target.value)} disabled={!!editing.id} /></div>
          <div className="field"><label>Name</label>
            <input type="text" value={editing.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label>Description</label>
            <input type="text" value={editing.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
          <ImageField label="Card image" value={editing.image} onChange={(v) => set('image', v)} />
          <div className="field"><label>Category</label>
            <select value={editing.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="two-col">
            <div className="field"><label>Price (₹)</label>
              <input type="number" value={editing.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div className="field"><label>Sort order</label>
              <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
          </div>
          <div className="field checkbox-row">
            <input id="asa" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="asa" style={{ margin: 0 }}>Active</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.name || !editing.key}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
