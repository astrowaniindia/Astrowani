import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const TABS = [
  { key: 'puja', label: 'Puja' },
  { key: 'gemstone', label: 'Gemstones' },
  { key: 'specific_puja', label: 'Specific Puja' },
  { key: 'life_report', label: 'Life Reports' },
];

const EMPTY = { title: '', title_hi: '', description: '', description_hi: '', price: 0, image: '', is_active: true, sort_order: 0 };

export default function Remedies() {
  const [tab, setTab] = useState('puja');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  // The 4 top-level category cards (Puja/Gemstones/Specific Puja/Life Reports) shown
  // on the customer app's Remedies landing screen — the main title/description/image
  // for each section, distinct from the items *inside* it edited below. Was previously
  // hardcoded in the app; now backed by table remedy_categories (see
  // sql/remedy_categories_schema.sql).
  const [categories, setCategories] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryBusy, setCategoryBusy] = useState(false);

  // "We're not there yet" popup — shown to the customer when they tap Place
  // Order (remedies fulfillment isn't live yet, see RemedyShop.js). {item} in
  // the message is replaced with the actual remedy's title on the customer's
  // device. Same app_settings key/value pattern as the Live Aarti URL on the
  // Banners page.
  const [popupTitle, setPopupTitle] = useState('');
  const [popupMessage, setPopupMessage] = useState('');
  const [popupBusy, setPopupBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/remedies');
    setItems(data.data || []);
    setLoading(false);
    // Independent of the item list — a failure here (e.g. app_settings not
    // yet migrated) must not block the remedies table from rendering.
    try {
      const settingsRes = await client.get('/api/admin/settings');
      setPopupTitle(settingsRes.data.settings?.remedy_unavailable_title || "We're not there yet");
      setPopupMessage(
        settingsRes.data.settings?.remedy_unavailable_message
        || "We're not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.",
      );
    } catch (e) {
      console.error('load popup settings failed (run remedy_unavailable_popup_schema.sql):', e.message);
    }
    // Independent of the item list — a failure here (e.g. remedy_categories not yet
    // migrated) must not block the items table from rendering.
    try {
      const categoriesRes = await client.get('/api/admin/remedy-categories');
      setCategories(categoriesRes.data.data || []);
    } catch (e) {
      console.error('load remedy categories failed (run remedy_categories_schema.sql):', e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const saveCategory = async () => {
    setCategoryBusy(true);
    try {
      const payload = {
        title: editingCategory.title,
        title_hi: editingCategory.title_hi,
        description: editingCategory.description,
        description_hi: editingCategory.description_hi,
        image: editingCategory.image,
      };
      await client.put(`/api/admin/remedy-categories/${editingCategory.id}`, payload);
      setEditingCategory(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setCategoryBusy(false); }
  };
  const setCat = (k, v) => setEditingCategory((p) => ({ ...p, [k]: v }));

  const savePopup = async () => {
    setPopupBusy(true);
    try {
      await Promise.all([
        client.patch('/api/admin/settings', { key: 'remedy_unavailable_title', value: popupTitle }),
        client.patch('/api/admin/settings', { key: 'remedy_unavailable_message', value: popupMessage }),
      ]);
      alert('Saved — the customer app will show the new wording immediately.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setPopupBusy(false); }
  };

  const rows = items.filter((i) => i.type === tab);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...editing, type: tab, price: Number(editing.price) || 0, sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) await client.put(`/api/admin/remedies/${editing.id}`, payload);
      else await client.post('/api/admin/remedies', payload);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await client.delete(`/api/admin/remedies/${r.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const tabLabel = TABS.find((t) => t.key === tab)?.label;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Remedies Shop</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ New {tabLabel} item</button>
      </div>

      {/* "We're not there yet" popup — shown on Place Order since remedies
          fulfillment isn't live yet. Use {item} in the message anywhere you
          want the specific remedy's name to appear. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>"Not delivering yet" popup (shown on Place Order)</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Shown to the customer instead of actually placing an order — remedies fulfillment
          isn't live yet, so nothing is charged and no order is created either way. Use{' '}
          <code>{'{item}'}</code> in the message to insert the specific remedy's name.
        </p>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Title</label>
          <input type="text" value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Message</label>
          <textarea value={popupMessage} onChange={(e) => setPopupMessage(e.target.value)} rows={3} />
        </div>
        <button className="btn" onClick={savePopup} disabled={popupBusy}>
          {popupBusy ? 'Saving…' : 'Save popup text'}
        </button>
      </div>

      <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="btn-group">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`btn ${tab === t.key ? '' : 'secondary'}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} ({items.filter((i) => i.type === t.key).length})
            </button>
          ))}
        </div>
        <button
          className="btn secondary sm"
          disabled={!categories.find((c) => c.type === tab)}
          onClick={() => setEditingCategory({ ...categories.find((c) => c.type === tab) })}
        >
          Edit "{tabLabel}" section (title/description/image)
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Title</th><th>Price (₹)</th><th>Active</th><th>Order</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="empty">No {tabLabel} items yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} className="thumb" alt="" /> : null}</td>
                <td>{r.title}</td>
                <td><b>{r.price}</b></td>
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
        <Modal title={`${editing.id ? 'Edit' : 'New'} ${tabLabel} item`} onClose={() => setEditing(null)}>
          <div className="field"><label>Title (English)</label>
            <input type="text" value={editing.title} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="field"><label>Title (Hindi)</label>
            <input type="text" value={editing.title_hi || ''} onChange={(e) => set('title_hi', e.target.value)} placeholder="हिंदी में शीर्षक" /></div>
          <div className="field"><label>Description (English)</label>
            <textarea value={editing.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="field"><label>Description (Hindi)</label>
            <textarea value={editing.description_hi || ''} onChange={(e) => set('description_hi', e.target.value)} placeholder="हिंदी में विवरण" /></div>
          <ImageField label="Item image (URL or upload)" value={editing.image} onChange={(v) => set('image', v)} />
          <div className="two-col">
            <div className="field"><label>Price (₹)</label>
              <input type="number" value={editing.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div className="field"><label>Sort order</label>
              <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
          </div>
          <div className="field checkbox-row">
            <input id="ra" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="ra" style={{ margin: 0 }}>Active (visible in customer app)</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.title}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {editingCategory && (
        <Modal title={`Edit "${tabLabel}" section`} onClose={() => setEditingCategory(null)}>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            This is the main card the customer sees on the Remedies home screen for this
            section — not one of the individual items above. Leave the image blank to keep
            using the app's built-in default image.
          </p>
          <div className="field"><label>Title (English)</label>
            <input type="text" value={editingCategory.title || ''} onChange={(e) => setCat('title', e.target.value)} /></div>
          <div className="field"><label>Title (Hindi)</label>
            <input type="text" value={editingCategory.title_hi || ''} onChange={(e) => setCat('title_hi', e.target.value)} placeholder="हिंदी में शीर्षक" /></div>
          <div className="field"><label>Description (English)</label>
            <textarea value={editingCategory.description || ''} onChange={(e) => setCat('description', e.target.value)} /></div>
          <div className="field"><label>Description (Hindi)</label>
            <textarea value={editingCategory.description_hi || ''} onChange={(e) => setCat('description_hi', e.target.value)} placeholder="हिंदी में विवरण" /></div>
          <ImageField label="Section image (URL or upload)" value={editingCategory.image} onChange={(v) => setCat('image', v)} />
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditingCategory(null)}>Cancel</button>
            <button className="btn" onClick={saveCategory} disabled={categoryBusy || !editingCategory.title}>{categoryBusy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
