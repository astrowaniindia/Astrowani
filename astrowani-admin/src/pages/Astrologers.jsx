import { useEffect, useState, useMemo } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';
import ActionMenu from '../components/ActionMenu';

function StatusBadge({ s }) {
  if (s === 'approved') return <span className="badge green"><span className="badge-dot" /> Approved</span>;
  if (s === 'rejected') return <span className="badge red"><span className="badge-dot" /> Rejected</span>;
  return <span className="badge amber"><span className="badge-dot" /> Pending Review</span>;
}

function AstroBadge({ badge }) {
  if (!badge) return null;
  if (badge === 'celebrity') return <span className="badge amber">⭐ Celebrity</span>;
  if (badge === 'top_rated') return <span className="badge green">🏆 Top Rated</span>;
  return <span className="badge blue">✓ Verified</span>;
}

const PAGE_SIZE = 18;

const BLANK_ASTROLOGER = {
  first_name: '', last_name: '', phone_number: '', email: '', gender: '',
  experience: '', languages: '', bio: '', profile_pic_url: '', specialties: [],
  chat_charge_per_minute: '', call_charge_per_minute: '', video_charge_per_minute: '',
  is_chat_enabled: true, is_call_enabled: true, is_video_call_enabled: true,
  badge: '', admin_notes: '',
};

export default function Astrologers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [topup, setTopup] = useState(null);
  const [amount, setAmount] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(null);
  const [categories, setCategories] = useState([]);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/astrologers');
    setRows(data.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    client.get('/api/admin/categories')
      .then(({ data }) => setCategories(data.data || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const counts = useMemo(() => {
    const approved = rows.filter((r) => r.approval_status === 'approved' && !r.is_suspended).length;
    const pending = rows.filter((r) => r.approval_status === 'pending').length;
    const suspended = rows.filter((r) => !!r.is_suspended).length;
    return { all: rows.length, approved, pending, suspended };
  }, [rows]);

  const matchesFilter = (r) => {
    if (statusFilter === 'suspended') return !!r.is_suspended;
    if (statusFilter !== 'all') return r.approval_status === statusFilter;
    return true;
  };

  const matchesSearch = (r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const fullName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
    const phone = (r.phone_number || '').toLowerCase();
    const email = (r.email || '').toLowerCase();
    return fullName.includes(q) || phone.includes(q) || email.includes(q);
  };

  const filteredRows = rows.filter((r) => matchesFilter(r) && matchesSearch(r));
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const patch = async (id, body) => {
    await client.patch(`/api/admin/astrologers/${id}`, body);
    await load();
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await patch(editing.id, {
        approval_status: editing.approval_status,
        is_suspended: editing.is_suspended,
        chat_charge_per_minute: Number(editing.chat_charge_per_minute) || 0,
        call_charge_per_minute: Number(editing.call_charge_per_minute) || 0,
        video_charge_per_minute: Number(editing.video_charge_per_minute) || 0,
        is_chat_enabled: editing.is_chat_enabled,
        is_call_enabled: editing.is_call_enabled,
        is_video_call_enabled: editing.is_video_call_enabled,
        admin_notes: editing.admin_notes,
        first_name: editing.first_name,
        last_name: editing.last_name,
        experience: Number(editing.experience) || 0,
        languages: (editing.languages || '').split(',').map((s) => s.trim()).filter(Boolean),
        bio: editing.bio || '',
        profile_pic_url: editing.profile_pic_url || '',
        badge: editing.badge || null,
      });
      setEditing(null);
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const saveNew = async () => {
    if (!creating.phone_number?.trim()) return alert('Phone number is required');
    if (!creating.first_name?.trim()) return alert('First name is required');
    setBusy(true);
    try {
      const payload = {
        ...creating,
        experience: Number(creating.experience) || 0,
        languages: (creating.languages || '').split(',').map((s) => s.trim()).filter(Boolean),
        chat_charge_per_minute: Number(creating.chat_charge_per_minute) || 0,
        call_charge_per_minute: Number(creating.call_charge_per_minute) || 0,
        video_charge_per_minute: Number(creating.video_charge_per_minute) || 0,
        badge: creating.badge || null,
      };
      await client.post('/api/admin/astrologers', payload);
      setCreating(null);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    const label = name(r);
    if (!confirm(`Delete ${label}?`)) return;
    setBusy(true);
    try {
      await client.delete(`/api/admin/astrologers/${r.id}`);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const unlockCharges = async (r) => {
    if (!confirm(`Allow ${name(r)} to edit rates once again?`)) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/astrologers/${r.id}/unlock-charges`);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const submitTopup = async () => {
    const amt = Number(amount);
    if (!amt) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/astrologers/${topup.id}/wallet`, { amount: amt });
      setTopup(null);
      setAmount('');
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const name = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Astrologer';
  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const setNew = (k, v) => setCreating((p) => ({ ...p, [k]: v }));
  const openEdit = (r) => setEditing({
    ...r,
    languages: Array.isArray(r.languages) ? r.languages.join(', ') : (r.languages || ''),
  });

  return (
    <div>
      {/* Header with View Toggle */}
      <div className="page-header">
        <div>
          <h1>Astrologers Directory</h1>
          <p>Review onboarded astrologers, vetting statuses, consultation fees, and wallet earnings.</p>
        </div>
        <div className="btn-group">
          {/* Card View vs Table View Toggle */}
          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              🗂️ Cards
            </button>
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'table' ? ' active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              📄 Table
            </button>
          </div>
          <button className="btn sm" onClick={() => setCreating({ ...BLANK_ASTROLOGER })}>
            <span>+</span> Add Astrologer
          </button>
        </div>
      </div>

      {/* Mini KPI Summary Banner */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat" style={{ padding: '16px 20px' }}>
          <div className="label">Total Onboarded</div>
          <div className="value" style={{ fontSize: 26, marginTop: 4 }}>{counts.all}</div>
        </div>
        <div className="stat" style={{ padding: '16px 20px' }}>
          <div className="label">Approved & Active</div>
          <div className="value" style={{ fontSize: 26, marginTop: 4, color: 'var(--emerald)' }}>{counts.approved}</div>
        </div>
        <div className="stat" style={{ padding: '16px 20px' }}>
          <div className="label">Pending Review</div>
          <div className="value" style={{ fontSize: 26, marginTop: 4, color: 'var(--amber)' }}>{counts.pending}</div>
        </div>
        <div className="stat" style={{ padding: '16px 20px' }}>
          <div className="label">Suspended</div>
          <div className="value" style={{ fontSize: 26, marginTop: 4, color: 'var(--crimson)' }}>{counts.suspended}</div>
        </div>
      </div>

      {/* Search & Segmented Filter Tabs */}
      <div className="search-toolbar">
        <div className="input-with-icon">
          <svg className="input-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, phone number, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div className="tabs-row">
          <button
            type="button"
            className={`tab-btn${statusFilter === 'all' ? ' active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All <span className="tab-count">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`tab-btn${statusFilter === 'approved' ? ' active' : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            Approved <span className="tab-count">{counts.approved}</span>
          </button>
          <button
            type="button"
            className={`tab-btn${statusFilter === 'pending' ? ' active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            Pending <span className="tab-count">{counts.pending}</span>
          </button>
          <button
            type="button"
            className={`tab-btn${statusFilter === 'suspended' ? ' active' : ''}`}
            onClick={() => setStatusFilter('suspended')}
          >
            Suspended <span className="tab-count">{counts.suspended}</span>
          </button>
        </div>
      </div>

      {/* ── CARD VIEW (Intuitive & Human-Friendly) ── */}
      {viewMode === 'grid' && (
        <div className="astro-grid">
          {loading && <div className="card empty" style={{ gridColumn: '1 / -1' }}>Loading astrologers…</div>}
          {!loading && filteredRows.length === 0 && (
            <div className="card empty" style={{ gridColumn: '1 / -1' }}>No astrologers match the selected filters.</div>
          )}
          {pageRows.map((r) => (
            <div className="astro-card" key={r.id}>
              <div>
                <div className="astro-card-top">
                  <div className="astro-card-avatar">
                    {r.profile_pic_url ? (
                      <img src={r.profile_pic_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 12, objectFit: 'cover' }} />
                    ) : (
                      (r.first_name || 'A').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="astro-card-info">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div className="astro-card-name">{name(r)}</div>
                      <StatusBadge s={r.approval_status} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.phone_number || 'No phone'} • {r.experience ? `${r.experience} yrs` : 'New'}
                    </div>
                    {r.badge && (
                      <div style={{ marginTop: 4 }}>
                        <AstroBadge badge={r.badge} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Specialties */}
                <div className="astro-card-specialties">
                  {Array.isArray(r.specialties) && r.specialties.length > 0 ? (
                    r.specialties.slice(0, 3).map((sp, i) => (
                      <span key={i} className="specialty-tag">{sp}</span>
                    ))
                  ) : (
                    <span className="specialty-tag">Vedic Astrology</span>
                  )}
                </div>

                {/* Rates Box */}
                <div className="astro-card-rates">
                  <div className="rate-item">
                    <span className="rate-item-label">Chat</span>
                    <span className="rate-item-val">₹{r.chat_charge_per_minute || 0}/m</span>
                  </div>
                  <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
                  <div className="rate-item">
                    <span className="rate-item-label">Audio</span>
                    <span className="rate-item-val">₹{r.call_charge_per_minute || 0}/m</span>
                  </div>
                  <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
                  <div className="rate-item">
                    <span className="rate-item-label">Video</span>
                    <span className="rate-item-val">₹{r.video_charge_per_minute || 0}/m</span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="astro-card-footer">
                <div className="wallet-badge-clean">
                  ₹{(r.wallet_balance ?? 0).toLocaleString('en-IN')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.approval_status === 'pending' && (
                    <button
                      type="button"
                      className="btn sm"
                      style={{ background: 'var(--emerald)' }}
                      onClick={() => patch(r.id, { approval_status: 'approved' })}
                    >
                      ✓ Approve
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm secondary"
                    onClick={() => openEdit(r)}
                  >
                    Edit
                  </button>
                  <ActionMenu items={[
                    r.approval_status !== 'approved' &&
                      { label: 'Approve Profile', onClick: () => patch(r.id, { approval_status: 'approved' }) },
                    r.approval_status !== 'rejected' &&
                      { label: 'Reject Profile', onClick: () => patch(r.id, { approval_status: 'rejected' }) },
                    { label: r.is_suspended ? 'Unsuspend' : 'Suspend', onClick: () => patch(r.id, { is_suspended: !r.is_suspended }) },
                    { label: 'Adjust Wallet', onClick: () => { setTopup(r); setAmount(''); } },
                    { label: 'Delete Profile', danger: true, onClick: () => remove(r) },
                  ]} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TABLE VIEW (Compact Data Grid) ── */}
      {viewMode === 'table' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Astrologer</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Badges</th>
                <th>Charges (Chat/Call/Video)</th>
                <th>Wallet Balance</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
              {!loading && filteredRows.length === 0 && <tr><td colSpan={7} className="empty">No astrologers found.</td></tr>}
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="avatar-cell">
                      <div className="user-avatar-circle">
                        {(r.first_name || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="cell-title">{name(r)}</div>
                        <div className="cell-sub">{r.experience ? `${r.experience} yrs exp` : 'New'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.phone_number || '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.email || 'No email'}</div>
                  </td>
                  <td>
                    <StatusBadge s={r.approval_status} />
                  </td>
                  <td>
                    <AstroBadge badge={r.badge} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span className="rate-tag">💬 ₹{r.chat_charge_per_minute || 0}</span>
                      <span className="rate-tag">📞 ₹{r.call_charge_per_minute || 0}</span>
                      <span className="rate-tag">📹 ₹{r.video_charge_per_minute || 0}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 800, color: 'var(--maroon)' }}>
                      ₹{(r.wallet_balance ?? 0).toLocaleString('en-IN')}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn sm secondary" onClick={() => openEdit(r)}>Edit</button>
                      <ActionMenu items={[
                        r.approval_status !== 'approved' && { label: 'Approve Profile', onClick: () => patch(r.id, { approval_status: 'approved' }) },
                        { label: r.is_suspended ? 'Unsuspend' : 'Suspend', onClick: () => patch(r.id, { is_suspended: !r.is_suspended }) },
                        { label: 'Adjust Wallet', onClick: () => { setTopup(r); setAmount(''); } },
                        { label: 'Delete', danger: true, onClick: () => remove(r) },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="btn-group" style={{ marginTop: 20, alignItems: 'center', justifyContent: 'center' }}>
          <button className="btn secondary sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
          <span className="muted" style={{ fontSize: 13, padding: '0 10px' }}>Page {page} of {totalPages}</span>
          <button className="btn secondary sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <Modal title={`Edit ${name(editing)}`} onClose={() => setEditing(null)}>
          <div className="two-col">
            <div className="field">
              <label>First Name</label>
              <input type="text" value={editing.first_name || ''} onChange={(e) => set('first_name', e.target.value)} />
            </div>
            <div className="field">
              <label>Last Name</label>
              <input type="text" value={editing.last_name || ''} onChange={(e) => set('last_name', e.target.value)} />
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <label>Approval Status</label>
              <select value={editing.approval_status} onChange={(e) => set('approval_status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="field">
              <label>Badge</label>
              <select value={editing.badge || ''} onChange={(e) => set('badge', e.target.value || null)}>
                <option value="">None</option>
                <option value="verified">Verified</option>
                <option value="top_rated">Top Rated</option>
                <option value="celebrity">Celebrity</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>Chat Rate (₹/m)</label>
              <input type="number" value={editing.chat_charge_per_minute || 0} onChange={(e) => set('chat_charge_per_minute', e.target.value)} />
            </div>
            <div className="field">
              <label>Call Rate (₹/m)</label>
              <input type="number" value={editing.call_charge_per_minute || 0} onChange={(e) => set('call_charge_per_minute', e.target.value)} />
            </div>
            <div className="field">
              <label>Video Rate (₹/m)</label>
              <input type="number" value={editing.video_charge_per_minute || 0} onChange={(e) => set('video_charge_per_minute', e.target.value)} />
            </div>
          </div>
          <div className="modal-actions actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={saveEdit}>Save Changes</button>
          </div>
        </Modal>
      )}

      {/* Add Astrologer Modal */}
      {creating && (
        <Modal title="Add Astrologer" onClose={() => setCreating(null)}>
          <div className="field">
            <label>Phone Number *</label>
            <input type="text" value={creating.phone_number} onChange={(e) => setNew('phone_number', e.target.value)} placeholder="e.g. +91 98765 43210" />
          </div>
          <div className="two-col">
            <div className="field">
              <label>First Name *</label>
              <input type="text" value={creating.first_name} onChange={(e) => setNew('first_name', e.target.value)} />
            </div>
            <div className="field">
              <label>Last Name</label>
              <input type="text" value={creating.last_name} onChange={(e) => setNew('last_name', e.target.value)} />
            </div>
          </div>
          <div className="modal-actions actions">
            <button className="btn secondary" onClick={() => setCreating(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={saveNew}>Create Astrologer</button>
          </div>
        </Modal>
      )}

      {/* Adjust Wallet Modal */}
      {topup && (
        <Modal title={`Adjust Wallet: ${name(topup)}`} onClose={() => setTopup(null)}>
          <p className="muted" style={{ margin: '0 0 16px' }}>Current balance: ₹{(topup.wallet_balance ?? 0).toLocaleString('en-IN')}</p>
          <div className="field">
            <label>Amount (₹) — positive to credit, negative to debit</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500 or -200" autoFocus />
          </div>
          <div className="modal-actions actions">
            <button className="btn secondary" onClick={() => setTopup(null)}>Cancel</button>
            <button className="btn" disabled={busy || !amount} onClick={submitTopup}>Update Wallet</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
