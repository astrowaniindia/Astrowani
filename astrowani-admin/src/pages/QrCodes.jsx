import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import client from '../api/client';

// Offline QR posters — one printed code per physical location, and what each one
// actually brought in.
//
// HOW THE ATTRIBUTION WORKS: a poster's QR encodes OUR short link
// (https://backend.astrowani.com/q/qr_<place>). That link logs the scan and redirects to
// the Play Store with `referrer=utm_source=qr_<place>`. Play hands that string back to
// the app: on first launch the app reports the install, and at signup it is stored on the
// customer (customers.acquisition_source). So the page shows the whole funnel:
//   scans -> opened the app -> signed up -> paid.
//
// WHAT IT STILL CANNOT SHOW, stated on the page itself: an install that never opens the
// app (Play Console counts those), and posters printed BEFORE the short link existed
// (they point straight at the Play Store, so their scans are invisible to us).

// The prefix is what keeps these posters from ever colliding with Google Ads or
// organic Play traffic, which set their own utm_source. The backend enforces it too.
const QR_PREFIX = 'qr_';

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const pct = (num, den) => (den > 0 ? `${Math.min(100, Math.round((num / den) * 100))}%` : '—');
const day = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// The backend's public scan link. Deliberately NOT derived from VITE_API_URL: a QR made
// while running this page locally would otherwise encode localhost and be printed.
const SCAN_BASE = 'https://backend.astrowani.com';

/**
 * The link a poster's QR encodes.
 *
 * It points at OUR server, which logs the scan and then redirects to the Play Store with
 * the referrer (see astrowani-backend/src/qrTrackingRoutes.js). Being much shorter than
 * a Play URL also makes the QR sparser: fewer, bigger dots scan faster from further away.
 * Nothing but the source is in the link — the backend builds the Play URL itself.
 */
function storeLink(source) {
  return `${SCAN_BASE}/q/${source}`;
}

/** Normalize typed input into a valid source, matching the backend's own rule. */
function toSource(input) {
  const cleaned = String(input || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 80);
  if (!cleaned) return '';
  return cleaned.startsWith(QR_PREFIX) ? cleaned : `${QR_PREFIX}${cleaned}`;
}

async function downloadQr(source, label) {
  try {
    // 1024px and error-correction 'Q' (~25% recoverable): a poster gets rained on,
    // scuffed and partly covered, and a code that stops scanning is a dead location.
    const dataUrl = await QRCode.toDataURL(storeLink(source), {
      width: 1024, margin: 4, errorCorrectionLevel: 'Q',
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${source}.png`;
    a.click();
  } catch (e) {
    window.alert(`Could not generate the QR image: ${e.message}`);
  }
}

function QrPreview({ source }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(storeLink(source), { width: 220, margin: 1, errorCorrectionLevel: 'Q' })
      .then((d) => { if (alive) setUrl(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [source]);
  if (!url) return <div className="muted" style={{ fontSize: 12 }}>Generating…</div>;
  return <img src={url} alt={`QR for ${source}`} width={220} height={220} style={{ borderRadius: 8, background: '#fff' }} />;
}

export default function QrCodes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [funnelMissing, setFunnelMissing] = useState(false);

  const [form, setForm] = useState({ source: '', label: '', city: '', location: '', placedAt: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copied, setCopied] = useState('');

  // Copies a poster's Play Store link. The label flips to "Copied" for a moment so
  // it's obvious the click did something.
  const copyLink = async (source) => {
    try {
      await navigator.clipboard.writeText(storeLink(source));
      setCopied(source);
      setTimeout(() => setCopied((c) => (c === source ? '' : c)), 2000);
    } catch (e) {
      window.prompt('Copy this link:', storeLink(source));
    }
  };

  const [openSource, setOpenSource] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/qr/sources');
      setRows(data.data || []);
      setMigrationMissing(!!data.migrationMissing);
      setTruncated(!!data.truncated);
      setFunnelMissing(!!data.funnelMissing);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load QR posters.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (source) => {
    if (openSource === source) { setOpenSource(''); setDetail(null); return; }
    setOpenSource(source);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await client.get(`/api/admin/qr/sources/${encodeURIComponent(source)}`);
      setDetail(data);
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to load customers.');
      setOpenSource('');
    } finally {
      setDetailLoading(false);
    }
  };

  const save = async (e) => {
    e?.preventDefault();
    const source = toSource(form.source);
    if (!source || source === QR_PREFIX) {
      window.alert('Give the poster a short code, e.g. "har_ki_pauri".');
      return;
    }
    if (!editing && rows.some((r) => r.source === source && r.registered)) {
      window.alert(`"${source}" already exists. Edit it instead, or pick a different code.`);
      return;
    }
    setSaving(true);
    try {
      await client.put(`/api/admin/qr/sources/${encodeURIComponent(source)}`, {
        label: form.label, city: form.city, location: form.location,
        placedAt: form.placedAt, note: form.note,
      });
      setForm({ source: '', label: '', city: '', location: '', placedAt: '', note: '' });
      setEditing(null);
      await load();
    } catch (e2) {
      window.alert(e2.response?.data?.message || e2.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r) => {
    setEditing(r.source);
    setForm({
      source: r.source, label: r.label || '', city: r.city || '',
      location: r.location || '', placedAt: r.placedAt || '', note: r.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleArchive = async (r) => {
    const next = !r.archived;
    if (!window.confirm(next
      ? `Archive "${r.label || r.source}"? It stays in the reports but drops out of the main list.`
      : `Bring "${r.label || r.source}" back into the active list?`)) return;
    try {
      await client.put(`/api/admin/qr/sources/${encodeURIComponent(r.source)}`, { ...r, archived: next });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to update.');
    }
  };

  const remove = async (r) => {
    if (!window.confirm(
      `Delete the poster "${r.label || r.source}"?\n\n` +
      'Nothing is lost. It moves to "Archived & deleted posters" at the bottom of this page with ' +
      'its name and every number, and you can restore it any time.\n\n' +
      'Its QR keeps working: if the printed code is still on a wall, new scans will keep counting.',
    )) return;
    try {
      await client.delete(`/api/admin/qr/sources/${encodeURIComponent(r.source)}`);
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to delete.');
    }
  };

  // Active posters fill the main table AND the summary cards. Archived and deleted posters
  // are kept whole in their own section below, but do NOT count in the cards: deleting a
  // poster is how you take it out of the numbers (a test poster, a wall that came down).
  // Nothing is erased — the archive section shows their own totals.
  const visible = useMemo(() => rows.filter((r) => !r.archived && !r.deleted), [rows]);
  const archivedRows = useMemo(() => rows.filter((r) => r.archived || r.deleted), [rows]);

  const restore = async (r) => {
    if (!window.confirm(`Bring "${r.label || r.source}" back into the active list?`)) return;
    try {
      await client.put(`/api/admin/qr/sources/${encodeURIComponent(r.source)}`, { ...r, archived: false, deleted: false });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to restore.');
    }
  };

  const sumRows = (list) => list.reduce((acc, r) => ({
    scans: acc.scans + (r.scans || 0),
    uniqueScans: acc.uniqueScans + (r.uniqueScans || 0),
    opened: acc.opened + (r.installsOpened || 0),
    signups: acc.signups + r.signups,
    paying: acc.paying + r.payingCustomers,
    revenue: acc.revenue + r.totalRecharged,
    sessions: acc.sessions + r.sessions,
  }), { scans: 0, uniqueScans: 0, opened: 0, signups: 0, paying: 0, revenue: 0, sessions: 0 });
  const totals = useMemo(() => sumRows(visible), [visible]);
  const archivedTotals = useMemo(() => sumRows(archivedRows), [archivedRows]);

  const best = useMemo(
    () => [...visible].filter((r) => r.signups > 0).sort((a, b) => b.totalRecharged - a.totalRecharged)[0],
    [visible],
  );

  return (
    <div>
      <h1 className="page-title">QR Codes (Offline)</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: 900 }}>
        One printed code per location. Each poster carries its own Play Store link, so every customer
        it brings in is tagged with that poster for life. Kept completely separate from Google Ads —
        ad installs carry Google&apos;s own tag and can never appear here.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>How this works</h3>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li><strong>Add a poster</strong> below — one per place you will stick a poster. Only the short code is required.</li>
          <li>The page makes that poster&apos;s <strong>tracking link</strong> (our own short link, which sends people on to the Play Store). Copy it, or download it as a <strong>QR code</strong>.</li>
          <li>Send the <strong>QR image</strong> to the printer. Never retype the link by hand.</li>
          <li>Each poster&apos;s row then shows the whole path: <strong>scanned → opened the app → signed up → paid</strong>, with how much they paid.</li>
        </ol>
      </div>

      {funnelMissing && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber, #d97706)' }}>
          <strong>Scan and install counting is not switched on.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Run <code>astrowani-backend/sql/qr_funnel_events.sql</code>. Until then the Scanned and Opened
            columns read zero, but signups and everything after them are unaffected.
          </p>
        </div>
      )}

      {migrationMissing && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber, #d97706)' }}>
          <strong>Tracking is not switched on yet.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            The database is missing the attribution columns, so every poster below will read zero no matter
            how many people scan it. Run <code>astrowani-backend/sql/acquisition_source.sql</code>. You can
            still create posters and print their codes now — they will start counting once it is applied.
          </p>
        </div>
      )}

      {truncated && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber, #d97706)' }}>
          <strong>These totals are incomplete.</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            There is more data than one read can return, so the numbers below under-report. Treat them as a
            floor, not a total.
          </p>
        </div>
      )}

      <div className="stat-grid">
        {[
          { label: 'QR scans', value: totals.scans, footer: `From ${totals.uniqueScans} different phone${totals.uniqueScans === 1 ? '' : 's'} · every scan counted` },
          { label: 'Installed and opened the app', value: totals.opened, footer: totals.uniqueScans ? `${pct(totals.opened, totals.uniqueScans)} of the different phones that scanned` : 'No scans yet' },
          { label: 'Customers from QR posters', value: totals.signups, footer: totals.opened ? `Verified their number · ${pct(totals.signups, totals.opened)} of installs that opened` : 'Verified their number' },
          { label: 'Of those, have paid', value: totals.paying, footer: totals.signups ? `${pct(totals.paying, totals.signups)} of the customers · completed at least one recharge` : 'Completed at least one recharge' },
          { label: 'Money in from QR customers', value: inr(totals.revenue), footer: 'Total recharged, all time' },
          { label: 'Best poster', value: best ? (best.label || best.source) : '—', footer: best ? `${inr(best.totalRecharged)} from ${best.signups} customers` : 'No signups yet' },
        ].map((c) => (
          <div className="stat" key={c.label}>
            <div className="stat-header"><span className="label">{c.label}</span></div>
            <div className="value" style={{ fontSize: typeof c.value === 'string' && c.value.length > 12 ? 20 : undefined }}>
              {loading ? '…' : c.value}
            </div>
            <div className="stat-footer"><span className="muted">{c.footer}</span></div>
          </div>
        ))}
      </div>

      {archivedRows.length > 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>
          These totals are for active posters only. {archivedRows.length} archived or deleted poster{archivedRows.length === 1 ? ' is' : 's are'} kept
          separately at the bottom of the page ({archivedTotals.scans} scans · {archivedTotals.signups} customer{archivedTotals.signups === 1 ? '' : 's'} · {inr(archivedTotals.revenue)}) and are not counted above.
        </p>
      )}

      <div className="card" style={{ marginTop: 20, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{editing ? `Edit ${editing}` : 'Add a poster'}</h3>
        <p className="muted" style={{ marginTop: -4 }}>
          Create the poster first, then download its QR and send that exact image to the printer.
          Generating the code here is what guarantees the link is right — a hand-typed URL that is one
          character off produces a poster that tracks nothing.
        </p>
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Short code *</div>
            <input
              type="text" placeholder="har_ki_pauri" value={form.source}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Saved as <code>{toSource(form.source) || `${QR_PREFIX}…`}</code>. Cannot be changed later.
            </div>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Name</div>
            <input type="text" placeholder="Har Ki Pauri – Aarti ghat" value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>City</div>
            <input type="text" placeholder="Haridwar" value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Exact spot</div>
            <input type="text" placeholder="Left of the main stairs" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Put up on</div>
            <input type="date" value={form.placedAt}
              onChange={(e) => setForm({ ...form, placedAt: e.target.value })} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Note</div>
            <input type="text" placeholder="Paid ₹500/month to the shop" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          {toSource(form.source) && toSource(form.source) !== QR_PREFIX && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Tracking link for this poster (updates as you type)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ flex: 1, minWidth: 260, wordBreak: 'break-all', fontSize: 11 }}>
                  {storeLink(toSource(form.source))}
                </code>
                <button type="button" className="btn secondary sm" onClick={() => copyLink(toSource(form.source))}>
                  {copied === toSource(form.source) ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
              {/* Nothing is saved here: the QR is generated from the code just typed, so a
                  QR can be downloaded without creating a poster. Attribution still works —
                  it keys off the code inside the link, and an unsaved code shows up in the
                  table as "unregistered" once a customer signs up through it. */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <QrPreview source={toSource(form.source)} />
                <div>
                  <button type="button" className="btn" onClick={() => downloadQr(toSource(form.source))}>
                    Download QR (PNG)
                  </button>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6, maxWidth: 380 }}>
                    No need to save a poster first. Saving one only adds a name and location so you can
                    recognise it later in the table.
                  </div>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add poster'}
            </button>
            {editing && (
              <button className="btn secondary" type="button" onClick={() => {
                setEditing(null);
                setForm({ source: '', label: '', city: '', location: '', placedAt: '', note: '' });
              }}>Cancel</button>
            )}
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="btn secondary sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {visible.length} poster{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <div className="card" style={{ borderLeft: '4px solid #c0392b' }}>{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Poster</th>
              <th title="Every scan of this poster's link (different phones in brackets)">Scans</th>
              <th title="Installs that opened the app at least once">Opened app</th>
              <th>Signed up</th>
              <th>Paid</th>
              <th>Money in</th>
              <th>Consultations</th>
              <th>In wallets</th>
              <th>Last signup</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
            {!loading && !visible.length && (
              <tr><td colSpan={10} className="empty">
                No posters yet. Add one above, download its QR, and put it on the wall.
              </td></tr>
            )}
            {!loading && visible.map((r) => (
              <tr key={r.source} style={openSource === r.source ? { background: 'var(--maroon-50, rgba(0,0,0,.03))' } : undefined}>
                <td colSpan={openSource === r.source ? 10 : 1} style={openSource === r.source ? { padding: 0 } : undefined}>
                  {openSource !== r.source ? (
                    <>
                      <div className="cell-title">{r.label || r.source}</div>
                      <div className="cell-sub muted">
                        <code>{r.source}</code>
                        {r.city ? ` · ${r.city}` : ''}
                        {r.location ? ` · ${r.location}` : ''}
                        {r.placedAt ? ` · up since ${day(r.placedAt)}` : ''}
                      </div>
                      {!r.registered && (
                        <span className="badge amber" title="Signups are arriving under this code, but no poster was created for it here.">
                          unregistered
                        </span>
                      )}
                      {r.archived && <span className="badge gray">archived</span>}
                    </>
                  ) : (
                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                          <QrPreview source={r.source} />
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button className="btn sm" onClick={() => downloadQr(r.source, r.label)}>Download PNG</button>
                            <button className="btn secondary sm" onClick={() => copyLink(r.source)}>
                              {copied === r.source ? 'Copied ✓' : 'Copy link'}
                            </button>
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <h3 style={{ marginTop: 0 }}>{r.label || r.source}</h3>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                            <code>{r.source}</code>
                            {r.city ? ` · ${r.city}` : ''}{r.location ? ` · ${r.location}` : ''}
                          </div>
                          {r.note && <p className="muted" style={{ fontSize: 13 }}>{r.note}</p>}
                          <div style={{ wordBreak: 'break-all', fontSize: 11, marginTop: 8 }} className="muted">
                            {storeLink(r.source)}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                            <button className="btn secondary sm" onClick={() => startEdit(r)}>Edit details</button>
                            {r.registered && (
                              <>
                                <button className="btn secondary sm" onClick={() => toggleArchive(r)}>
                                  {r.archived ? 'Unarchive' : 'Archive'}
                                </button>
                                <button className="btn danger sm" onClick={() => remove(r)}>Delete</button>
                              </>
                            )}
                            <button className="btn ghost sm" onClick={() => openDetail(r.source)}>Close</button>
                          </div>
                        </div>
                      </div>

                      <h4 style={{ marginBottom: 6, marginTop: 20 }}>Customers from this poster</h4>
                      {detailLoading && <div className="empty">Loading…</div>}
                      {!detailLoading && detail && !detail.data.length && (
                        <div className="empty">
                          Nobody has signed up from this poster yet. If it has been up a while, check that the
                          printed code matches the one above, and compare against Play Console — people may be
                          installing but not finishing signup.
                        </div>
                      )}
                      {!detailLoading && detail && !!detail.data.length && (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Customer</th><th>Signed up</th><th>Recharged</th>
                                <th>Consultations</th><th>Wallet</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.data.map((c) => (
                                <tr key={c.id}>
                                  <td>
                                    <div className="cell-title">{c.name || 'No name'}</div>
                                    <div className="cell-sub muted">
                                      {c.isDeleted ? 'account deleted' : (c.mobile || '—')}
                                    </div>
                                  </td>
                                  <td>{day(c.createdAt)}</td>
                                  <td>
                                    {c.totalRecharged > 0
                                      ? <span className="badge green">{inr(c.totalRecharged)}</span>
                                      : <span className="muted">—</span>}
                                  </td>
                                  <td>{c.sessions || '—'}</td>
                                  <td>{inr(c.walletBalance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                {openSource !== r.source && (
                  <>
                    <td>
                      {r.scans || 0}
                      {(r.scans || 0) > 0 && (
                        <span className="muted" style={{ fontSize: 11 }}> ({r.uniqueScans || 0} phone{(r.uniqueScans || 0) === 1 ? '' : 's'})</span>
                      )}
                    </td>
                    <td>
                      {r.installsOpened || 0}
                      {r.uniqueScans > 0 && <span className="muted" style={{ fontSize: 11 }}> ({pct(r.installsOpened || 0, r.uniqueScans)})</span>}
                    </td>
                    <td>{r.signups}
                      {r.installsOpened > 0 && <span className="muted" style={{ fontSize: 11 }}> ({pct(r.signups, r.installsOpened)})</span>}
                    </td>
                    <td>
                      {r.payingCustomers}
                      <span className="muted" style={{ fontSize: 11 }}> ({pct(r.payingCustomers, r.signups)})</span>
                    </td>
                    <td><strong>{inr(r.totalRecharged)}</strong></td>
                    <td>{r.sessions || '—'}</td>
                    <td className="muted">{inr(r.walletBalance)}</td>
                    <td className="muted">{day(r.lastSignupAt)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn secondary sm" style={{ marginRight: 6 }} onClick={() => copyLink(r.source)}>
                        {copied === r.source ? 'Copied ✓' : 'Copy link'}
                      </button>
                      <button className="btn secondary sm" onClick={() => openDetail(r.source)}>Open</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {archivedRows.length > 0 && (
        <details className="card" style={{ marginTop: 20 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            Archived &amp; deleted posters ({archivedRows.length})
          </summary>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 12px' }}>
            Kept for reference and NOT counted in the totals above. Together: {archivedTotals.scans} scans ·{' '}
            {archivedTotals.opened} opened the app · {archivedTotals.signups} customer{archivedTotals.signups === 1 ? '' : 's'} ·{' '}
            {inr(archivedTotals.revenue)} recharged. Any of them can be restored. If a printed code is still on a
            wall, new scans keep counting here.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Poster</th><th>Status</th><th>Scans</th><th>Opened app</th><th>Signed up</th>
                  <th>Paid</th><th>Money in</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedRows.map((r) => (
                  <tr key={r.source}>
                    <td>
                      <div className="cell-title">{r.label || r.source}</div>
                      <div className="cell-sub muted">
                        <code>{r.source}</code>{r.city ? ` · ${r.city}` : ''}{r.location ? ` · ${r.location}` : ''}
                      </div>
                    </td>
                    <td>
                      {r.deleted
                        ? <span className="badge red" title={r.deletedAt ? `Deleted ${day(r.deletedAt)}` : undefined}>deleted{r.deletedAt ? ` · ${day(r.deletedAt)}` : ''}</span>
                        : <span className="badge gray">archived</span>}
                    </td>
                    <td>{r.scans || 0}{(r.scans || 0) > 0 && <span className="muted" style={{ fontSize: 11 }}> ({r.uniqueScans || 0} phone{(r.uniqueScans || 0) === 1 ? '' : 's'})</span>}</td>
                    <td>{r.installsOpened || 0}</td>
                    <td>{r.signups}</td>
                    <td>{r.payingCustomers}</td>
                    <td><strong>{inr(r.totalRecharged)}</strong></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn secondary sm" style={{ marginRight: 6 }} onClick={() => copyLink(r.source)}>
                        {copied === r.source ? 'Copied ✓' : 'Copy link'}
                      </button>
                      <button className="btn sm" onClick={() => restore(r)}>Restore</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>How to read these numbers</h3>
        <ul className="muted" style={{ fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>Scans</strong> counts every hit on the poster&apos;s short link, so someone scanning twice adds
            two. The brackets show how many different phones those came from — approximate, since people on
            the same office or mobile network can occasionally look like one. Link-preview robots are ignored.
            The install and signup percentages are measured against different phones, not raw scans.
          </li>
          <li>
            <strong>Opened app</strong> is installs from the poster that were opened at least once — including
            people who never signed up. An install that is never opened is invisible to us; Play Console →
            Grow → Acquisition (group by <code>utm_source</code>) counts those.
          </li>
          <li>
            <strong>Posters printed before the short link existed</strong> point straight at the Play Store,
            so their scans are not counted — only opens and signups are. Print new codes from this page.
          </li>
          <li>
            <strong>Opens and signups only count from build 46 onward.</strong> Someone who installs an older
            version through the same poster still opens the app, but nothing reports it.
          </li>
          <li>
            <strong>iPhone scans will not appear.</strong> Apple provides no equivalent way to tell which
            poster an install came from, so an iPhone-heavy spot can look dead here while still working.
          </li>
          <li>
            <strong>Only new accounts are tagged.</strong> Someone who already had an account and
            reinstalled after scanning is not counted — the poster did not win them.
          </li>
          <li>
            <strong>A poster reading zero after a week</strong> is worth checking before moving it: scan it
            yourself with a phone that has never had the app, and confirm it opens the Play Store listing.
          </li>
        </ul>
      </div>
    </div>
  );
}
