import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const EMPTY = { title: '', title_hi: '', description: '', description_hi: '', image: '', link: '', sort_order: 0, is_active: true, app: 'both' };

const APP_LABELS = { customer: 'Customer App', vendor: 'Vendor App', both: 'Both Apps' };

export default function Banners() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [intervalSecs, setIntervalSecs] = useState('4');
  const [intervalBusy, setIntervalBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('customer'); // 'customer' | 'vendor'

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const bannersRes = await client.get('/api/admin/banners');
      setRows(bannersRes.data.data || []);
    } catch (e) {
      const msg = e.response?.data?.message || e.message;
      console.error('load banners failed:', msg);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
    // Settings are independent — a failure here (e.g. app_settings table not yet
    // created) must NOT block the banner list from rendering.
    try {
      const settingsRes = await client.get('/api/admin/settings');
      setIntervalSecs(settingsRes.data.settings?.banner_interval_seconds || '4');
    } catch (e) {
      console.error('load settings failed (run app_settings_schema.sql):', e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const saveInterval = async () => {
    const secs = Math.max(1, Number(intervalSecs) || 4);
    setIntervalBusy(true);
    try {
      await client.patch('/api/admin/settings', { key: 'banner_interval_seconds', value: secs });
      setIntervalSecs(String(secs));
      alert('Banner rotation interval saved. It applies on the next app refresh.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setIntervalBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...editing, sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) await client.put(`/api/admin/banners/${editing.id}`, payload);
      else await client.post('/api/admin/banners', payload);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm('Delete this banner?')) return;
    await client.delete(`/api/admin/banners/${r.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  // A banner shows in the current tab if it targets that app or 'both'.
  const visibleRows = rows.filter((r) => (r.app || 'both') === tab || (r.app || 'both') === 'both');

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Banners</h1>
        {/* New banner defaults to the app of the current tab */}
        <button className="btn" onClick={() => setEditing({ ...EMPTY, app: tab })}>+ New Banner</button>
      </div>

      {/* App sections */}
      <div className="btn-group" style={{ marginBottom: 16 }}>
        <button className={`btn sm ${tab === 'customer' ? '' : 'ghost'}`} onClick={() => setTab('customer')}>Customer App</button>
        <button className={`btn sm ${tab === 'vendor' ? '' : 'ghost'}`} onClick={() => setTab('vendor')}>Vendor App</button>
      </div>

      {/* Rotation interval — applies to the customer + vendor home banners */}
      <div className="card" style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>Banner change interval (seconds)</label>
          <input
            type="number" min="1" value={intervalSecs}
            onChange={(e) => setIntervalSecs(e.target.value)}
          />
        </div>
        <button className="btn" onClick={saveInterval} disabled={intervalBusy}>
          {intervalBusy ? 'Saving…' : 'Save interval'}
        </button>
        <span className="muted" style={{ alignSelf: 'center' }}>
          How long each banner shows before switching, in both apps.
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Title</th><th>Shows in</th><th>Order</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && loadError && <tr><td colSpan={6} className="empty" style={{ color: 'var(--red)' }}>Couldn't load banners: {loadError}</td></tr>}
            {!loading && !loadError && visibleRows.length === 0 && <tr><td colSpan={6} className="empty">No banners for the {APP_LABELS[tab]} yet — click “+ New Banner” to add one.</td></tr>}
            {visibleRows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} className="thumb" alt="" /> : null}</td>
                <td>{r.title}</td>
                <td><span className="badge gray">{APP_LABELS[r.app || 'both']}</span></td>
                <td>{r.sort_order}</td>
                <td>{r.is_active ? <span className="badge green">Yes</span> : <span className="badge gray">No</span>}</td>
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
        <Modal title={editing.id ? 'Edit Banner' : 'New Banner'} onClose={() => setEditing(null)}>
          <div className="field"><label>Title (English)</label>
            <input type="text" value={editing.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="field"><label>Title (Hindi)</label>
            <input type="text" value={editing.title_hi || ''} onChange={(e) => set('title_hi', e.target.value)} placeholder="हिंदी में शीर्षक" /></div>
          <div className="field"><label>Description (English)</label>
            <input type="text" value={editing.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="field"><label>Description (Hindi)</label>
            <input type="text" value={editing.description_hi || ''} onChange={(e) => set('description_hi', e.target.value)} placeholder="हिंदी में विवरण" /></div>
          <ImageField label="Banner image (URL or upload)" value={editing.image} onChange={(v) => set('image', v)} />
          <div className="field"><label>Link (optional)</label>
            <input type="text" value={editing.link || ''} onChange={(e) => set('link', e.target.value)} /></div>
          <div className="field"><label>Show in app</label>
            <select value={editing.app || 'both'} onChange={(e) => set('app', e.target.value)}>
              <option value="customer">Customer App only</option>
              <option value="vendor">Vendor App only</option>
              <option value="both">Both Apps</option>
            </select></div>
          <div className="two-col">
            <div className="field"><label>Sort order</label>
              <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
            <div className="field checkbox-row" style={{ marginTop: 28 }}>
              <input id="ba" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              <label htmlFor="ba" style={{ margin: 0 }}>Active</label></div>
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
