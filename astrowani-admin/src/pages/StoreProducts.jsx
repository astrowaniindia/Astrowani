import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';
import PriceFields, { numOrNull } from '../components/PriceFields';
import { STARTER_GEMSTONES } from '../data/starterGemstones';

// Product categories for the store's own catalog. These are `remedy_items.type` values,
// same table Remedies.jsx manages — just a different slice of `type`s, so gemstones added
// here and gemstones added there are the same rows. 'rudraksha' / 'bracelet-mala' / 'yantra'
// / 'pooja-supplies' are new type strings (deliberately distinct from the existing 'puja',
// which is a bookable puja *service*, not a retail item like a dhoop stick or havan kit).
const TYPES = [
  { key: 'gemstone', label: 'Gemstones' },
  { key: 'rudraksha', label: 'Rudraksha' },
  { key: 'bracelet-mala', label: 'Bracelets & Malas' },
  { key: 'yantra', label: 'Yantras' },
  { key: 'pooja-supplies', label: 'Pooja & Incense' },
];

const EMPTY = {
  title: '', title_hi: '', description: '', description_hi: '', price: 0, mrp: '',
  unit_label: '', stock: '', image: '', is_active: true, sort_order: 0,
};

export default function StoreProducts() {
  const [tab, setTab] = useState('gemstone');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importState, setImportState] = useState(null); // {done, total} while importing, else null

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/remedies');
    setItems(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const rows = items.filter((i) => i.type === tab);
  const tabLabel = TYPES.find((t) => t.key === tab)?.label;

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...editing,
        type: tab,
        price: Number(editing.price) || 0,
        sort_order: Number(editing.sort_order) || 0,
        mrp: numOrNull(editing.mrp),
        stock: numOrNull(editing.stock),
        unit_label: editing.unit_label?.trim() ? editing.unit_label.trim() : null,
      };
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

  const toggleActive = async (r) => {
    await client.put(`/api/admin/remedies/${r.id}`, { is_active: !r.is_active });
    await load();
  };

  // One-time convenience: uploads each starter gemstone's photo through the real
  // /api/upload-image pipeline (same path any admin-picked file takes — nothing bypasses
  // Supabase Storage) and creates the row as a DRAFT (is_active:false), so nothing shows
  // in the live customer app until someone reviews and activates it. Safe to click more
  // than once — it just adds more draft rows, so it warns if gemstones already exist.
  const importStarterGemstones = async () => {
    const existing = items.filter((i) => i.type === 'gemstone').length;
    const warn = existing > 0
      ? `You already have ${existing} gemstone item(s). `
      : '';
    if (!confirm(
      `${warn}Import ${STARTER_GEMSTONES.length} starter gemstones now?\n\n`
      + 'Each photo will be uploaded to real storage and a real product row will be created '
      + '— but every one starts INACTIVE (draft), so nothing appears in the customer app '
      + 'until you open it and switch it on. Prices and descriptions are placeholders — '
      + 'review each before activating.'
    )) return;

    setImportState({ done: 0, total: STARTER_GEMSTONES.length });
    for (let i = 0; i < STARTER_GEMSTONES.length; i++) {
      const g = STARTER_GEMSTONES[i];
      try {
        const uploadRes = await client.post('/api/upload-image', { base64: g.image, folder: 'gemstones' });
        await client.post('/api/admin/remedies', {
          type: 'gemstone',
          title: g.title,
          description: g.description,
          price: g.price,
          mrp: g.mrp,
          unit_label: g.unit_label,
          sort_order: existing + i,
          image: uploadRes.data.url,
          is_active: false,
        });
      } catch (e) {
        console.error('Import failed for', g.title, e.response?.data?.message || e.message);
      }
      setImportState({ done: i + 1, total: STARTER_GEMSTONES.length });
    }
    setImportState(null);
    await load();
    alert('Import finished. New items are inactive — open each one to review and activate.');
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Astrowani Store — Products</h1>
        <Link to="/store" className="btn ghost sm">← All store sections</Link>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        These are the same items that show up on the storefront — this view is just cards
        instead of a table. Every category below shares one catalog with the Remedies Shop
        page; adding a gemstone here is the same as adding one there.
      </p>

      <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="btn-group">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={`btn ${tab === t.key ? '' : 'secondary'}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} ({items.filter((i) => i.type === t.key).length})
            </button>
          ))}
        </div>
        <div className="btn-group">
          {tab === 'gemstone' && (
            <button className="btn secondary sm" onClick={importStarterGemstones} disabled={!!importState}>
              {importState ? `Importing ${importState.done}/${importState.total}…` : 'Import starter gemstones'}
            </button>
          )}
          <button className="btn sm" onClick={() => setEditing({ ...EMPTY })}>+ Add {tabLabel} item</button>
        </div>
      </div>

      {loading && <div className="empty">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted" style={{ margin: '0 0 14px' }}>No {tabLabel} items yet.</p>
          <button className="btn sm" onClick={() => setEditing({ ...EMPTY })}>+ Add the first one</button>
        </div>
      )}

      <div className="product-card-grid">
        {rows.map((r) => {
          const hasDiscount = r.mrp && Number(r.mrp) > Number(r.price);
          return (
            <div className="product-card" key={r.id}>
              <div className="product-card-media">
                {r.image ? <img src={r.image} alt="" /> : <div className="product-card-noimg">No image</div>}
                <span className={`badge ${r.is_active ? 'green' : 'gray'} product-card-status`}>
                  {r.is_active ? 'Active' : 'Draft'}
                </span>
              </div>
              <div className="product-card-body">
                <div className="product-card-title">{r.title}</div>
                <div className="product-card-price-row">
                  <b>₹{r.price}</b>
                  {hasDiscount && <span className="muted" style={{ textDecoration: 'line-through', fontSize: 12.5 }}>₹{r.mrp}</span>}
                  {hasDiscount && (
                    <span className="badge green">{Math.round(((r.mrp - r.price) / r.mrp) * 100)}% OFF</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {r.stock === null || r.stock === undefined
                    ? 'Unlimited stock'
                    : r.stock === 0 ? <span className="badge red">Sold out</span> : `${r.stock} in stock`}
                  {r.unit_label ? ` · ${r.unit_label}` : ''}
                </div>
              </div>
              <div className="product-card-actions">
                <button className="btn secondary sm" onClick={() => setEditing({ ...r })}>Edit</button>
                <button className="btn secondary sm" onClick={() => toggleActive(r)}>
                  {r.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="btn danger sm" onClick={() => remove(r)}>Delete</button>
              </div>
            </div>
          );
        })}

        {/* Trailing "add new" tile, so the grid itself doubles as the entry point. */}
        {!loading && (
          <button className="product-card product-card-add" onClick={() => setEditing({ ...EMPTY })}>
            <span className="product-card-add-plus">+</span>
            <span>Add {tabLabel} item</span>
          </button>
        )}
      </div>

      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'New'} ${tabLabel} item`} onClose={() => setEditing(null)}>
          <div className="field"><label>Title (English)</label>
            <input type="text" value={editing.title} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="field"><label>Description (English)</label>
            <textarea value={editing.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
          <ImageField label="Item image (URL or upload)" value={editing.image} onChange={(v) => set('image', v)} />
          <PriceFields
            price={editing.price}
            mrp={editing.mrp}
            onChange={(patch) => setEditing((prev) => ({ ...prev, ...patch }))}
          />
          <div className="two-col">
            <div className="field"><label>Unit label — optional</label>
              <input type="text" value={editing.unit_label ?? ''} onChange={(e) => set('unit_label', e.target.value)}
                placeholder="e.g. per stone, 5.25 ratti, 1 pc" /></div>
            <div className="field"><label>Stock — blank = unlimited</label>
              <input type="number" value={editing.stock ?? ''} onChange={(e) => set('stock', e.target.value)}
                placeholder="Blank for unlimited" /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Title (Hindi) — optional, auto-translated if left blank</label>
              <input type="text" value={editing.title_hi || ''} onChange={(e) => set('title_hi', e.target.value)} placeholder="हिंदी में शीर्षक" /></div>
            <div className="field"><label>Sort order</label>
              <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
          </div>
          <div className="field checkbox-row">
            <input id="sa" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="sa" style={{ margin: 0 }}>Active (visible in customer app)</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.title}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
