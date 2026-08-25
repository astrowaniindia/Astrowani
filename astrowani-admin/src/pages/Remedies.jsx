import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const TABS = [
  { key: 'puja', label: 'Puja' },
  { key: 'gemstone', label: 'Gemstones' },
  { key: 'specific_puja', label: 'Specific Puja' },
  { key: 'life_report', label: 'Life Reports' },
  { key: 'vastu', label: 'Vastu Remedies' },
];

// mrp/stock/unit_label added with the cart checkout (2026-08-21). mrp blank = no
// struck-through "was" price shown; stock blank = unlimited (what every pre-existing
// item means, since is_active used to be the only availability switch).
const EMPTY = {
  title: '', title_hi: '', description: '', description_hi: '', price: 0, mrp: '',
  unit_label: '', stock: '', image: '', is_active: true, sort_order: 0, subcategory: '',
};

// The storefront's Vastu page filters by these. Only offered on that type, because no other
// catalogue is grouped this way. Blank means "let the storefront work it out from the title",
// which is what every row created before this field existed does.
const VASTU_SUBCATEGORIES = ['Crystals', 'Feng Shui', 'Pyramids', 'Vastu Enhancer', 'Handicraft', 'Gifts'];

// Ordering is switched on one category at a time as fulfilment becomes real for it. The
// customer app reads these keys straight from app_settings, and POST /api/orders/checkout
// re-checks them server-side, so turning one off here genuinely stops orders rather than
// just hiding a button.
const ORDER_TOGGLE_KEY = (type) => `remedy_orders_enabled_${type}`;

// Three linked price inputs: MRP, discount %, and the selling price. Edit any one and the
// others follow, because the natural way to think about this is "give 20% off" while the
// DB stores what the customer actually pays.
//
// The discount is NOT stored. It is always derived from mrp vs price, so there is exactly
// one source of truth — a stored percentage would silently drift out of step the moment
// someone edited either price directly, and then the card and the admin would disagree
// about the same item.
function PriceFields({ price, mrp, onChange }) {
  const p = Number(price) || 0;
  const m = Number(mrp) || 0;
  const hasDiscount = m > p && p > 0;
  const pct = hasDiscount ? Math.round(((m - p) / m) * 100) : 0;

  // Typing a discount % sets the SELLING price from the MRP (rather than raising the MRP),
  // because MRP is the fixed, printed number and the sale price is the lever being pulled.
  const applyPct = (raw) => {
    const next = Math.max(0, Math.min(99, Number(raw) || 0));
    if (!m) return; // No MRP to discount from — leave price alone rather than zero it.
    onChange({ price: Math.round(m * (1 - next / 100)) });
  };

  return (
    <>
      <div className="two-col">
        <div className="field">
          <label>MRP (₹) — the struck-through "was" price</label>
          <input
            type="number"
            value={mrp ?? ''}
            onChange={(e) => onChange({ mrp: e.target.value })}
            placeholder="Blank = no discount badge"
          />
        </div>
        <div className="field">
          <label>Discount %</label>
          <input
            type="number"
            value={hasDiscount ? pct : ''}
            onChange={(e) => applyPct(e.target.value)}
            placeholder={m ? 'e.g. 20' : 'Set an MRP first'}
            disabled={!m}
          />
        </div>
      </div>

      <div className="field">
        <label>Selling price (₹) — what the customer actually pays</label>
        <input type="number" value={price} onChange={(e) => onChange({ price: e.target.value })} />
      </div>

      {/* Live preview of the exact three figures the app will render, so a mistake is
          obvious here instead of on a customer's phone. */}
      <div className="card" style={{ margin: '0 0 12px', padding: 12, background: 'rgba(0,0,0,0.03)' }}>
        {p <= 0 ? (
          <span className="muted">Enter a selling price to see how the card will look.</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="muted">Customer sees:</span>
            <b style={{ fontSize: 17 }}>₹{p}</b>
            {hasDiscount ? (
              <>
                <span className="muted" style={{ textDecoration: 'line-through' }}>₹{m}</span>
                <span className="badge green">{pct}% OFF</span>
                <span style={{ color: '#2E7D32', fontWeight: 600 }}>Save ₹{m - p}</span>
              </>
            ) : (
              <span className="muted">no discount badge</span>
            )}
          </div>
        )}
        {m > 0 && m <= p ? (
          <div style={{ marginTop: 8 }}>
            <span className="badge red">MRP is not above the selling price</span>{' '}
            <span className="muted">— no badge will show. Raise the MRP or lower the price.</span>
          </div>
        ) : null}
      </div>
    </>
  );
}

// Blank / missing / non-numeric → null, so an empty box clears the column rather than
// writing 0 (which would mean something quite different for both mrp and stock).
function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

  // Per-category "accepting orders" switches + the bill-summary fees, all app_settings.
  const [ordering, setOrdering] = useState({});
  const [fees, setFees] = useState({ delivery: '0', freeAbove: '0', handling: '0' });
  // Referral commission per remedy type, plus how long a recommendation stays
  // attributable. Comes out of the platform margin, never the customer's price.
  const [commission, setCommission] = useState({ gemstone: '0', puja: '0', specific_puja: '0', windowDays: '30' });
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [orderingBusy, setOrderingBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/remedies');
    setItems(data.data || []);
    setLoading(false);
    // Independent of the item list — a failure here (e.g. app_settings not
    // yet migrated) must not block the remedies table from rendering.
    try {
      const settingsRes = await client.get('/api/admin/settings');
      const st = settingsRes.data.settings || {};
      setPopupTitle(st.remedy_unavailable_title || "We're not there yet");
      setPopupMessage(
        st.remedy_unavailable_message
        || "We're not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.",
      );
      // Absent key = OFF, matching how the app and the checkout endpoint both read it.
      setOrdering(Object.fromEntries(
        TABS.map((tb) => [tb.key, st[ORDER_TOGGLE_KEY(tb.key)] === 'true']),
      ));
      setFees({
        delivery: st.remedy_delivery_fee ?? '0',
        freeAbove: st.remedy_free_delivery_above ?? '0',
        handling: st.remedy_handling_fee ?? '0',
      });
      // Astrologer referral commission, one rate per remedy type. Paid out of the
      // platform's margin when a referred order is delivered — the customer's price
      // is unaffected. See astrowani-backend/src/remedyCommission.js.
      setCommission({
        gemstone: st.remedy_commission_percent_gemstone ?? '0',
        puja: st.remedy_commission_percent_puja ?? '0',
        specific_puja: st.remedy_commission_percent_specific_puja ?? '0',
        windowDays: st.remedy_referral_window_days ?? '30',
      });
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

  const saveOrdering = async () => {
    setOrderingBusy(true);
    try {
      await Promise.all([
        ...TABS.map((tb) => client.patch('/api/admin/settings', {
          key: ORDER_TOGGLE_KEY(tb.key), value: ordering[tb.key] ? 'true' : 'false',
        })),
        client.patch('/api/admin/settings', { key: 'remedy_delivery_fee', value: String(Number(fees.delivery) || 0) }),
        client.patch('/api/admin/settings', { key: 'remedy_free_delivery_above', value: String(Number(fees.freeAbove) || 0) }),
        client.patch('/api/admin/settings', { key: 'remedy_handling_fee', value: String(Number(fees.handling) || 0) }),
      ]);
      alert('Saved. New app sessions pick this up immediately.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setOrderingBusy(false); }
  };

  const saveCommission = async () => {
    setCommissionBusy(true);
    try {
      // Clamped 0-100 here as well as by the DB CHECK — a typo'd 1000% would otherwise
      // pay an astrologer ten times the order value out of the platform's margin.
      const pct = (v) => String(Math.min(100, Math.max(0, Number(v) || 0)));
      await Promise.all([
        client.patch('/api/admin/settings', { key: 'remedy_commission_percent_gemstone', value: pct(commission.gemstone) }),
        client.patch('/api/admin/settings', { key: 'remedy_commission_percent_puja', value: pct(commission.puja) }),
        client.patch('/api/admin/settings', { key: 'remedy_commission_percent_specific_puja', value: pct(commission.specific_puja) }),
        client.patch('/api/admin/settings', { key: 'remedy_referral_window_days', value: String(Math.max(1, Number(commission.windowDays) || 30)) }),
      ]);
      alert('Saved. Applies to orders placed from now on — orders already placed keep the rate they were priced at.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setCommissionBusy(false); }
  };

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
      const payload = {
        ...editing,
        type: tab,
        price: Number(editing.price) || 0,
        sort_order: Number(editing.sort_order) || 0,
        // Blank means "not set", which is NOT the same as 0 for either of these: mrp 0
        // would render a nonsense discount, and stock 0 would mark the item sold out.
        // `undefined` counts as blank too — rows loaded before the migration ran have
        // neither column at all.
        mrp: numOrNull(editing.mrp),
        stock: numOrNull(editing.stock),
        unit_label: editing.unit_label?.trim() ? editing.unit_label.trim() : null,
        // Blank means "work it out from the title", which is what the storefront does
        // for every row created before this field existed - so blank must reach the
        // server as null rather than an empty string it would then try to match on.
        subcategory: editing.subcategory?.trim() ? editing.subcategory.trim() : null,
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

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const tabLabel = TABS.find((t) => t.key === tab)?.label;

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Remedies Shop</h1>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>+ New {tabLabel} item</button>
      </div>

      {/* Which categories actually take orders, and what the bill summary charges. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>Accepting orders</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Turn a category on only once you can actually fulfil and ship it. While it's off,
          tapping ADD in the app shows the "not delivering yet" popup below instead of adding
          to the cart — and the server refuses the order too, so an old app build can't get
          around it.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
          {TABS.map((tb) => (
            <div className="checkbox-row" key={tb.key}>
              <input
                id={`ord-${tb.key}`}
                type="checkbox"
                checked={!!ordering[tb.key]}
                onChange={(e) => setOrdering((p) => ({ ...p, [tb.key]: e.target.checked }))}
              />
              <label htmlFor={`ord-${tb.key}`} style={{ margin: 0 }}>{tb.label}</label>
            </div>
          ))}
        </div>

        <h4 style={{ margin: '0 0 8px' }}>Charges shown in the cart</h4>
        <div className="two-col">
          <div className="field"><label>Delivery charge (₹)</label>
            <input type="number" value={fees.delivery}
              onChange={(e) => setFees((p) => ({ ...p, delivery: e.target.value }))} /></div>
          <div className="field"><label>Free delivery above (₹) — 0 = never free</label>
            <input type="number" value={fees.freeAbove}
              onChange={(e) => setFees((p) => ({ ...p, freeAbove: e.target.value }))} /></div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}><label>Handling charge (₹)</label>
          <input type="number" value={fees.handling}
            onChange={(e) => setFees((p) => ({ ...p, handling: e.target.value }))} /></div>
        <button className="btn" onClick={saveOrdering} disabled={orderingBusy}>
          {orderingBusy ? 'Saving…' : 'Save ordering settings'}
        </button>
      </div>

      {/* Astrologer referral commission — one rate per remedy type. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>Astrologer referral commission</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          When an astrologer recommends a remedy and that customer buys it, the astrologer
          earns this share of the item's price. It comes out of <b>your margin</b> — the
          customer pays exactly the same either way. Paid only once the order is marked
          <b> delivered</b>, so a cancelled or refunded order never pays a commission.
          Changing a rate affects <b>future</b> orders only; orders already placed keep the
          rate they were priced at.
        </p>
        <div className="two-col">
          <div className="field"><label>Gemstone (%)</label>
            <input type="number" min="0" max="100" value={commission.gemstone}
              onChange={(e) => setCommission((p) => ({ ...p, gemstone: e.target.value }))} /></div>
          <div className="field"><label>Puja (%)</label>
            <input type="number" min="0" max="100" value={commission.puja}
              onChange={(e) => setCommission((p) => ({ ...p, puja: e.target.value }))} /></div>
        </div>
        <div className="two-col">
          <div className="field"><label>Specific Puja (%)</label>
            <input type="number" min="0" max="100" value={commission.specific_puja}
              onChange={(e) => setCommission((p) => ({ ...p, specific_puja: e.target.value }))} /></div>
          <div className="field">
            <label>Attribution window (days)</label>
            <input type="number" min="1" value={commission.windowDays}
              onChange={(e) => setCommission((p) => ({ ...p, windowDays: e.target.value }))} />
          </div>
        </div>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>
          The window is how long after a recommendation a purchase still credits that
          astrologer. If two astrologers recommended the same item to the same customer,
          the most recent one earns it.
        </p>
        <button className="btn" onClick={saveCommission} disabled={commissionBusy}>
          {commissionBusy ? 'Saving…' : 'Save commission settings'}
        </button>
      </div>

      {/* The popup shown when a category above is switched OFF. Use {item} in the message
          anywhere you want the specific remedy's name to appear. */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0 }}>"Not delivering yet" popup</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
          Shown when a customer taps ADD on an item in a category that is switched off above.
          Nothing is charged and no order is created. Use{' '}
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
          <thead><tr>
            <th></th><th>Title</th><th>Unit</th><th>Price (₹)</th><th>MRP (₹)</th>
            <th>Stock</th><th>Active</th><th>Order</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="empty">No {tabLabel} items yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} className="thumb" alt="" /> : null}</td>
                <td>{r.title}</td>
                <td className="muted">{r.unit_label || '—'}</td>
                <td><b>{r.price}</b></td>
                <td className="muted">
                  {r.mrp ? (
                    <>
                      {r.mrp}
                      {/* At-a-glance check that a discount is actually live: an MRP that
                          isn't above the price shows no badge in the app, which is easy to
                          create by accident and invisible from a bare number. */}
                      {Number(r.mrp) > Number(r.price) ? (
                        <span className="badge green" style={{ marginLeft: 6 }}>
                          {Math.round(((r.mrp - r.price) / r.mrp) * 100)}%
                        </span>
                      ) : (
                        <span className="badge gray" style={{ marginLeft: 6 }}>no badge</span>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td>
                  {r.stock === null || r.stock === undefined
                    ? <span className="muted">Unlimited</span>
                    : r.stock === 0
                      ? <span className="badge red">Sold out</span>
                      : r.stock}
                </td>
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
          <PriceFields
            price={editing.price}
            mrp={editing.mrp}
            onChange={(patch) => setEditing((prev) => ({ ...prev, ...patch }))}
          />
          <div className="two-col">
            <div className="field"><label>Unit label — optional</label>
              <input type="text" value={editing.unit_label ?? ''} onChange={(e) => set('unit_label', e.target.value)}
                placeholder="e.g. 5.25 ratti, 1 pc, 250 g" /></div>
            <div className="field"><label>Stock — blank = unlimited</label>
              <input type="number" value={editing.stock ?? ''} onChange={(e) => set('stock', e.target.value)}
                placeholder="Blank for unlimited" /></div>
          </div>
          {tab === 'vastu' && (
            <div className="field"><label>Category — which tile it appears under on the shop</label>
              <select value={editing.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)}>
                <option value="">Work it out from the title</option>
                {VASTU_SUBCATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
          )}
          <div className="field"><label>Sort order</label>
            <input type="number" value={editing.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></div>
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
