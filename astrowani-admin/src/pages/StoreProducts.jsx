import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';
import { STARTER_STORE_PRODUCTS } from '../data/starterStoreProducts';

// Categories for the store's OWN catalog (store_products.category) — separate from
// remedy_items.type. Matches the CHECK constraint in sql/store_products_schema.sql.
const CATEGORIES = [
  { key: 'gemstone', label: 'Gemstones' },
  { key: 'rudraksha', label: 'Rudraksha' },
  { key: 'bracelet-mala', label: 'Bracelets & Malas' },
  { key: 'yantra', label: 'Yantras' },
  { key: 'pooja', label: 'Pooja & Incense' },
];

const PURPOSE_TAGS = [
  { key: 'wealth', label: 'Wealth & Money' },
  { key: 'love', label: 'Love & Relationship' },
  { key: 'career', label: 'Career & Business' },
  { key: 'health', label: 'Health & Healing' },
  { key: 'protection', label: 'Protection' },
  { key: 'marriage', label: 'Marriage & Family' },
];

const EMPTY = {
  category: 'gemstone', name: '', description: '', tags: [], benefits: [],
  price: 0, mrp: '', unit_label: '', image: '', is_active: true, sort_order: 0,
};

// Blank / missing / non-numeric → null (distinct from 0, which would draw a real
// discount badge or nothing at all depending on the field).
function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function StoreProducts() {
  const [tab, setTab] = useState('gemstone');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importState, setImportState] = useState(null); // {done, total} while importing

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/remedies');
    // remedy_items speaks type/title; the rest of this page was written against
    // category/name, so normalise once here rather than at every read site.
    setItems((data.data || []).map((r) => ({ ...r, category: r.type, name: r.title })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const rows = items.filter((i) => i.category === tab);
  const tabLabel = CATEGORIES.find((c) => c.key === tab)?.label;

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const toggleTag = (tagKey) => setEditing((p) => {
    const has = p.tags.includes(tagKey);
    return { ...p, tags: has ? p.tags.filter((t) => t !== tagKey) : [...p.tags, tagKey] };
  });


  // remedy_items has no tags/benefits columns, and the backend's `allowed` list silently
  // drops keys it doesn't know — so sending them would be lossy without any error. The
  // benefit lines are folded into the description instead, which is the field both the
  // storefront and the app already render, so nothing the admin typed disappears.
  const toRemedyItem = (o) => {
    const benefits = Array.isArray(o.benefits)
      ? o.benefits
      : String(o.benefits || '').split(String.fromCharCode(10)).map((b) => b.trim()).filter(Boolean);
    const description = [String(o.description || '').trim(), ...benefits].filter(Boolean).join(' ').trim();
    return {
      type: o.category,
      title: o.name,
      description,
      price: Number(o.price) || 0,
      mrp: numOrNull(o.mrp),
      unit_label: o.unit_label && String(o.unit_label).trim() ? String(o.unit_label).trim() : null,
      image: o.image,
      is_active: o.is_active !== false,
      sort_order: Number(o.sort_order) || 0,
    };
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = toRemedyItem(editing);
      if (editing.id) await client.put(`/api/admin/remedies/${editing.id}`, payload);
      else await client.post('/api/admin/remedies', payload);
      setEditing(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    await client.delete(`/api/admin/remedies/${r.id}`);
    await load();
  };

  const toggleActive = async (r) => {
    await client.put(`/api/admin/remedies/${r.id}`, { is_active: !r.is_active });
    await load();
  };

  // Uploads each starter gemstone's photo through the real /api/upload-image pipeline
  // (same path any admin-picked file takes) and creates the row directly — safe to run
  // more than once, but warns if gemstones already exist so it isn't clicked by accident.
  const importStarterGemstones = async () => {
    const existing = items.filter((i) => i.category === 'gemstone').length;
    const warn = existing > 0 ? `You already have ${existing} gemstone item(s). ` : '';
    if (!confirm(`${warn}Import ${STARTER_STORE_PRODUCTS.length} starter gemstones now? Each photo is uploaded to storage and a real, ORDERABLE product is created. These show in the web store AND the app's Remedies shop, and customers can buy them.`)) return;

    setImportState({ done: 0, total: STARTER_STORE_PRODUCTS.length });
    for (let i = 0; i < STARTER_STORE_PRODUCTS.length; i++) {
      const g = STARTER_STORE_PRODUCTS[i];
      try {
        const uploadRes = await client.post('/api/upload-image', { base64: g.image, folder: 'store-products' });
        await client.post('/api/admin/remedies', toRemedyItem({ ...g, sort_order: existing + i, image: uploadRes.data.url }));
      } catch (e) {
        console.error('Import failed for', g.name, e.response?.data?.message || e.message);
      }
      setImportState({ done: i + 1, total: STARTER_STORE_PRODUCTS.length });
    }
    setImportState(null);
    await load();
    alert('Import finished.');
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Astrowani Store — Products</h1>
        <Link to="/store" className="btn ghost sm">← Astrowani Store</Link>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        This store's own catalog — separate from the Remedies Shop.
      </p>

      <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="btn-group">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`btn ${tab === c.key ? '' : 'secondary'}`}
              onClick={() => setTab(c.key)}
            >
              {c.label} ({items.filter((i) => i.category === c.key).length})
            </button>
          ))}
        </div>
        <div className="btn-group">
          {tab === 'gemstone' && (
            <button className="btn secondary sm" onClick={importStarterGemstones} disabled={!!importState}>
              {importState ? `Importing ${importState.done}/${importState.total}…` : 'Import starter gemstones'}
            </button>
          )}
          <button className="btn sm" onClick={() => setEditing({ ...EMPTY, category: tab })}>+ Add {tabLabel} item</button>
        </div>
      </div>

      {loading && <div className="empty">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted" style={{ margin: '0 0 14px' }}>No {tabLabel} items yet.</p>
          <button className="btn sm" onClick={() => setEditing({ ...EMPTY, category: tab })}>+ Add the first one</button>
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
                  {r.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="product-card-body">
                <div className="product-card-title">{r.name}</div>
                <div className="product-card-price-row">
                  <b>₹{r.price}</b>
                  {hasDiscount && <span className="muted" style={{ textDecoration: 'line-through', fontSize: 12.5 }}>₹{r.mrp}</span>}
                  {hasDiscount && (
                    <span className="badge green">{Math.round(((r.mrp - r.price) / r.mrp) * 100)}% OFF</span>
                  )}
                </div>
                {r.unit_label && <div className="muted" style={{ fontSize: 12.5 }}>{r.unit_label}</div>}
                {Array.isArray(r.tags) && r.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {r.tags.map((t) => (
                      <span key={t} className="badge blue" style={{ fontSize: 10 }}>
                        {PURPOSE_TAGS.find((p) => p.key === t)?.label || t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="product-card-actions">
                <button className="btn secondary sm" onClick={() => setEditing({ ...r, mrp: r.mrp ?? '', tags: r.tags || [], benefits: r.benefits || [] })}>Edit</button>
                <button className="btn secondary sm" onClick={() => toggleActive(r)}>
                  {r.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="btn danger sm" onClick={() => remove(r)}>Delete</button>
              </div>
            </div>
          );
        })}

        {!loading && (
          <button className="product-card product-card-add" onClick={() => setEditing({ ...EMPTY, category: tab })}>
            <span className="product-card-add-plus">+</span>
            <span>Add {tabLabel} item</span>
          </button>
        )}
      </div>

      {editing && (
        <Modal title={`${editing.id ? 'Edit' : 'New'} ${CATEGORIES.find((c) => c.key === editing.category)?.label} item`} onClose={() => setEditing(null)}>
          <div className="field"><label>Name</label>
            <input type="text" value={editing.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="two-col">
            <div className="field"><label>Category</label>
              <select value={editing.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Unit label — optional</label>
              <input type="text" value={editing.unit_label ?? ''} onChange={(e) => set('unit_label', e.target.value)}
                placeholder="e.g. per stone, 108 beads, 1 pc" /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Price (₹)</label>
              <input type="number" value={editing.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div className="field"><label>MRP (₹) — optional, blank = no discount badge</label>
              <input type="number" value={editing.mrp} onChange={(e) => set('mrp', e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Purpose tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {PURPOSE_TAGS.map((t) => (
                <label key={t.key} className="checkbox-row" style={{ border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px' }}>
                  <input type="checkbox" checked={editing.tags.includes(t.key)} onChange={() => toggleTag(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div className="field"><label>Description</label>
            <textarea value={editing.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="field"><label>Benefits — one per line</label>
            <textarea
              value={Array.isArray(editing.benefits) ? editing.benefits.join('\n') : editing.benefits}
              onChange={(e) => set('benefits', e.target.value)}
              rows={3}
            /></div>
          <ImageField label="Item image (URL or upload)" value={editing.image} onChange={(v) => set('image', v)} />
          <div className="field"><label>Sort order</label>
            <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
          <div className="field checkbox-row">
            <input id="spa" type="checkbox" checked={editing.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <label htmlFor="spa" style={{ margin: 0 }}>Active</label></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.name}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
