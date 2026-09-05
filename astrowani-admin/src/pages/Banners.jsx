import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

const EMPTY = {
  title: '', title_hi: '', description: '', description_hi: '', image: '',
  sort_order: 0, is_active: true, app: 'both', language: 'both', audience: 'all',
  placement: 'home_primary', action_type: 'none', action_value: '',
};

const APP_LABELS = { customer: 'Customer App', vendor: 'Vendor App', both: 'Both Apps' };
const LANGUAGE_LABELS = { english: 'English', hindi: 'Hindi', both: 'Both Languages' };
// Where the customer is in their journey. 'new' = still able to claim the free
// 5-minute chat; tapping such a banner opens the free-chat offer instead of
// navigating. Once they have used it they become 'returning' and see those
// banners instead. See sql/banner_audience.sql.
const AUDIENCE_LABELS = {
  all: 'Everyone',
  new: 'New (free chat unused)',
  returning: 'After free chat',
};

// Every spot in the apps a banner can be placed, with the exact image size to upload.
// Widths/heights are in px — export at this ratio (or larger, same ratio) for a crisp image.
const PLACEMENTS = {
  // Shortened 2026-09-05 (500 -> 400, 400 -> 300) so Home's astrologer list starts
  // higher up. KEPT IN STEP with astrowani_customer-main PlacementBanner.js
  // PLACEMENT_ASPECT — the app derives each banner's height from these exact ratios,
  // so changing one without the other crops the artwork.
  // Banners uploaded before that date are stored at the old shape and need re-uploading.
  home_primary: { label: 'Home screen — top banner (rotating)', width: 1200, height: 400, note: 'The big banner right under the header, e.g. "100% Cashback". Re-upload if yours was made before Sep 2026 — the slot is shorter now.' },
  home_secondary: { label: 'Home screen — second banner (below the top one)', width: 1200, height: 300, note: 'A smaller banner shown right after the top one, before the astrologer list. Re-upload if yours was made before Sep 2026 — the slot is shorter now.' },
  chat_top: { label: 'Chat with Astrologers — top banner', width: 1200, height: 300, note: 'Shown above the astrologer list on the Chat tab.' },
  video_top: { label: 'Video with Experts — top banner', width: 1200, height: 300, note: 'Shown above the astrologer list on the Video tab.' },
  call_top: { label: 'Talk to Experts (Audio) — top banner', width: 1200, height: 300, note: 'Shown above the astrologer list on the Call tab.' },
};

// Where "Go to a screen in the app" can send the customer when they tap the banner.
const SCREEN_OPTIONS = [
  { value: 'Wallet', label: 'Wallet / Recharge' },
  { value: 'Chat', label: 'Chat with Astrologers' },
  { value: 'Video', label: 'Video with Experts' },
  { value: 'Call', label: 'Talk to Experts (Audio)' },
  { value: 'Live', label: 'Live' },
  { value: 'Remedies', label: 'Remedies' },
  { value: 'Home', label: 'Home' },
];

export default function Banners() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [intervalSecs, setIntervalSecs] = useState('4');
  const [intervalBusy, setIntervalBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('customer'); // 'customer' | 'vendor'
  const [langTab, setLangTab] = useState('all'); // 'all' | 'english' | 'hindi'

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

  // Pause/resume without deleting — flips is_active only, no other fields touched.
  const toggleActive = async (r) => {
    setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, is_active: !row.is_active } : row)));
    try {
      await client.put(`/api/admin/banners/${r.id}`, { ...r, is_active: !r.is_active });
    } catch (e) {
      alert(e.response?.data?.message || e.message);
      await load(); // revert the optimistic flip on failure
    }
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  // A banner shows in the current tab if it targets that app or 'both', and (if a
  // language sub-filter is active) that language or 'both'.
  const visibleRows = rows
    .filter((r) => (r.app || 'both') === tab || (r.app || 'both') === 'both')
    .filter((r) => langTab === 'all' || (r.language || 'both') === langTab || (r.language || 'both') === 'both');

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Banners</h1>
        {/* New banner defaults to the app + language of the current tabs */}
        <button className="btn" onClick={() => setEditing({ ...EMPTY, app: tab, language: langTab === 'all' ? 'both' : langTab })}>+ New Banner</button>
      </div>

      {/* App sections */}
      <div className="btn-group" style={{ marginBottom: 12 }}>
        <button className={`btn sm ${tab === 'customer' ? '' : 'ghost'}`} onClick={() => setTab('customer')}>Customer App</button>
        <button className={`btn sm ${tab === 'vendor' ? '' : 'ghost'}`} onClick={() => setTab('vendor')}>Vendor App</button>
      </div>

      {/* Language sections — separate place for Hindi banners vs English banners.
          A banner set to "Both Languages" still shows under either filter. */}
      <div className="btn-group" style={{ marginBottom: 16 }}>
        <button className={`btn sm ${langTab === 'all' ? '' : 'ghost'}`} onClick={() => setLangTab('all')}>All Languages</button>
        <button className={`btn sm ${langTab === 'english' ? '' : 'ghost'}`} onClick={() => setLangTab('english')}>English</button>
        <button className={`btn sm ${langTab === 'hindi' ? '' : 'ghost'}`} onClick={() => setLangTab('hindi')}>Hindi</button>
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
          <thead><tr><th></th><th>Title</th><th>Placement</th><th>Shows in</th><th>Language</th><th>Audience</th><th>Order</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && loadError && <tr><td colSpan={8} className="empty" style={{ color: 'var(--red)' }}>Couldn't load banners: {loadError}</td></tr>}
            {!loading && !loadError && visibleRows.length === 0 && <tr><td colSpan={9} className="empty">No banners for the {APP_LABELS[tab]}{langTab !== 'all' ? ` (${LANGUAGE_LABELS[langTab]})` : ''} yet — click “+ New Banner” to add one.</td></tr>}
            {visibleRows.map((r) => (
              <tr key={r.id}>
                <td>{r.image ? <img src={r.image} className="thumb" alt="" /> : null}</td>
                <td>{r.title}</td>
                <td><span className="badge gray">{PLACEMENTS[r.placement]?.label || r.placement || 'home_primary'}</span></td>
                <td><span className="badge gray">{APP_LABELS[r.app || 'both']}</span></td>
                <td><span className="badge gray">{LANGUAGE_LABELS[r.language || 'both']}</span></td>
                <td><span className={`badge ${(r.audience || 'all') === 'all' ? 'gray' : 'blue'}`}>
                  {AUDIENCE_LABELS[r.audience || 'all']}
                </span></td>
                <td>{r.sort_order}</td>
                <td>{r.is_active ? <span className="badge green">Yes</span> : <span className="badge gray">No</span>}</td>
                <td><div className="btn-group">
                  <button className="btn secondary sm" onClick={() => toggleActive(r)}>
                    {r.is_active ? 'Stop' : 'Activate'}
                  </button>
                  <button className="btn secondary sm" onClick={() => setEditing({ ...EMPTY, ...r })}>Edit</button>
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

          <div className="field">
            <label>Where does this banner show?</label>
            <select value={editing.placement || 'home_primary'} onChange={(e) => set('placement', e.target.value)}>
              {Object.entries(PLACEMENTS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
          </div>
          {(() => { const p = PLACEMENTS[editing.placement || 'home_primary']; return p ? (
            <div className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13 }}>
              {p.note}
            </div>
          ) : null; })()}

          <ImageField
            label="Banner image (URL or upload)"
            value={editing.image}
            onChange={(v) => set('image', v)}
            recommendedWidth={PLACEMENTS[editing.placement || 'home_primary']?.width}
            recommendedHeight={PLACEMENTS[editing.placement || 'home_primary']?.height}
          />

          <div className="field"><label>When tapped…</label>
            <select value={editing.action_type || 'none'} onChange={(e) => set('action_type', e.target.value)}>
              <option value="none">Do nothing</option>
              <option value="screen">Go to a screen in the app</option>
              <option value="url">Open a web link</option>
            </select></div>
          {editing.action_type === 'screen' && (
            <div className="field"><label>Screen</label>
              <select value={editing.action_value || ''} onChange={(e) => set('action_value', e.target.value)}>
                <option value="">Choose a screen…</option>
                {SCREEN_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select></div>
          )}
          {editing.action_type === 'url' && (
            <div className="field"><label>Web link (https://…)</label>
              <input type="text" value={editing.action_value || ''} onChange={(e) => set('action_value', e.target.value)} placeholder="https://example.com" /></div>
          )}

          <div className="field"><label>Show in app</label>
            <select value={editing.app || 'both'} onChange={(e) => set('app', e.target.value)}>
              <option value="customer">Customer App only</option>
              <option value="vendor">Vendor App only</option>
              <option value="both">Both Apps</option>
            </select></div>
          <div className="field"><label>Language</label>
            <select value={editing.language || 'both'} onChange={(e) => set('language', e.target.value)}>
              <option value="english">English only</option>
              <option value="hindi">Hindi only</option>
              <option value="both">Both Languages</option>
            </select>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Shown to a customer whose app language matches (or who set no preference and it's
              "Both Languages"). Use this when the banner image itself has English/Hindi text
              baked in and needs a different image per language — the Title/Description (Hindi)
              fields above are for when the same image works for both.
            </div>
          </div>
          <div className="field"><label>Who sees it</label>
            <select value={editing.audience || 'all'} onChange={(e) => set('audience', e.target.value)}>
              <option value="all">Everyone</option>
              <option value="new">New customers — free chat not used yet</option>
              <option value="returning">After the free chat has been used</option>
            </select>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              On the Home screen, a customer who can still claim the free 5-minute chat opens
              that offer when they tap a banner, instead of going where “When tapped…” points.
              Set that banner to <strong>New customers</strong>. Set the banner that should
              replace it afterwards — one pointing at Chat or Call with an astrologer — to
              <strong> After the free chat</strong>. Leave it on <strong>Everyone</strong> for
              anything that should always show.
            </div>
          </div>

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
