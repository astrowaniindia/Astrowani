import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';
import ActionMenu from '../components/ActionMenu';

function StatusBadge({ s }) {
  if (s === 'approved') return <span className="badge green">Approved</span>;
  if (s === 'rejected') return <span className="badge red">Rejected</span>;
  return <span className="badge amber">Pending</span>;
}

const BADGE_LABELS = { verified: 'Verified', celebrity: 'Celebrity', top_rated: 'Top Rated' };
const BADGE_COLORS = { verified: 'blue', celebrity: 'amber', top_rated: 'green' };

function AstroBadge({ badge }) {
  if (!badge) return <span className="badge gray">None</span>;
  return <span className={`badge ${BADGE_COLORS[badge] || 'gray'}`}>{BADGE_LABELS[badge] || badge}</span>;
}

const PAGE_SIZE = 20;

// A brand-new astrologer added here. approval_status is 'approved' from the start —
// an account an admin typed in by hand has already been vetted, which is the whole
// point of not sending them through the signup queue. Services default ON so the
// astrologer is reachable the moment they log in; each one still needs a charge
// before the backend will actually enable it.
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
  const [topup, setTopup] = useState(null); // astrologer being wallet-adjusted
  const [amount, setAmount] = useState('');
  // Search/filter/pagination — the list grew large enough that scrolling to find a
  // specific astrologer, or scanning the whole table for e.g. pending ones, became slow.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | approved | rejected | suspended
  const [page, setPage] = useState(1);
  // Manual creation — an astrologer onboarded offline, who never goes through the
  // vendor app's signup form or the approval queue.
  const [creating, setCreating] = useState(null);
  const [categories, setCategories] = useState([]);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/astrologers');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  // Specialties are stored as category UUIDs (see formatAstrologer in the backend) —
  // they're what puts an astrologer on the Home category screens, so the create form
  // offers the real list rather than free text. A failure here is non-fatal: the rest
  // of the form still works, the astrologer just lands with no categories.
  useEffect(() => {
    client.get('/api/admin/categories')
      .then(({ data }) => setCategories(data.data || []))
      .catch(() => setCategories([]));
  }, []);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const matchesFilter = (r) => {
    if (statusFilter === 'suspended') return !!r.is_suspended;
    if (statusFilter !== 'all') return r.approval_status === statusFilter;
    return true;
  };
  const matchesSearch = (r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
    const phone = (r.phone_number || '').toLowerCase();
    const email = (r.email || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || email.includes(q);
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

  const setNew = (k, v) => setCreating((p) => ({ ...p, [k]: v }));
  const toggleSpecialty = (id) => setCreating((p) => ({
    ...p,
    specialties: p.specialties.includes(id)
      ? p.specialties.filter((x) => x !== id)
      : [...p.specialties, id],
  }));

  const submitNew = async () => {
    setBusy(true);
    try {
      const { data } = await client.post('/api/admin/astrologers', {
        ...creating,
        languages: (creating.languages || '').split(',').map((s) => s.trim()).filter(Boolean),
        experience: Number(creating.experience) || 0,
        chat_charge_per_minute: Number(creating.chat_charge_per_minute) || 0,
        call_charge_per_minute: Number(creating.call_charge_per_minute) || 0,
        video_charge_per_minute: Number(creating.video_charge_per_minute) || 0,
        badge: creating.badge || null,
      });
      setCreating(null);
      await load();
      // Approved-and-complete is the only state customers can actually see, so say
      // which one this landed in rather than a bare "created" that looks broken when
      // the astrologer never appears in the app.
      const name = `${data.data?.first_name || ''} ${data.data?.last_name || ''}`.trim() || 'Astrologer';
      if (data.visibleToCustomers) {
        alert(`${name} is created and live. They can log in to the astrologer app with ` +
          `${data.data?.phone_number} right away — they'll get an OTP as usual and go straight to their home screen, ` +
          `with no signup form and no approval wait.`);
      } else {
        alert(`${name} is created and can log in with ${data.data?.phone_number}, but they are NOT visible to ` +
          `customers yet. Still missing: ${(data.missingForVisibility || []).join(', ')}.` +
          `\n\nFill those in via Edit (or let the astrologer complete them in their own app) and they'll appear automatically.`);
      }
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    const label = name(r);
    if (!confirm(`Delete ${label}? This cannot be undone.\n\nIf they have session or earnings history, the database won't allow permanently deleting them — instead they'll be rejected, suspended, and hidden everywhere in the app.`)) return;
    setBusy(true);
    try {
      const { data } = await client.delete(`/api/admin/astrologers/${r.id}`);
      if (data.mode === 'deleted') {
        alert(`${label} was permanently deleted.`);
      } else {
        alert(`${label} has session or earnings history, so they weren't permanently deleted — instead they've been rejected, suspended, and hidden everywhere in the app.`);
      }
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  // Astrologers can self-set chat/call/video charges via the vendor app only
  // once (charges_locked_at gets set on their first save there); admin edits
  // above are never affected by this. This lets an admin grant one more
  // self-edit — e.g. after agreeing to a rate change requested outside the
  // app — without having to manually enter the new rates themselves.
  const unlockCharges = async (r) => {
    if (!confirm(`Let ${name(r)} set their own chat/call/video charges again? It will lock again after their next save.`)) return;
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
  const openEdit = (r) => setEditing({
    ...r,
    languages: Array.isArray(r.languages) ? r.languages.join(', ') : (r.languages || ''),
  });

  return (
    <div>
      <h1 className="page-title">Astrologers</h1>
      <div className="btn-group" style={{ marginBottom: 12, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        <span className="muted" style={{ fontSize: 13 }}>
          {filteredRows.length} of {rows.length} astrologer{rows.length === 1 ? '' : 's'}
        </span>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setCreating({ ...BLANK_ASTROLOGER })}>
          + Add astrologer
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Phone</th><th>Status</th><th>Suspended</th><th>Badge</th>
            <th>Charges (chat/call/video)</th><th>Wallet (₹)</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && filteredRows.length === 0 && <tr><td colSpan={8} className="empty">No astrologers match.</td></tr>}
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td>{name(r)}</td>
                <td className="muted">{r.phone_number || '—'}</td>
                <td><StatusBadge s={r.approval_status} /></td>
                <td>{r.is_suspended ? <span className="badge red">Suspended</span> : <span className="badge gray">No</span>}</td>
                <td><AstroBadge badge={r.badge} /></td>
                <td className="muted">
                  {r.chat_charge_per_minute || 0} / {r.call_charge_per_minute || 0} / {r.video_charge_per_minute || 0}
                  {' '}
                  {r.charges_locked_at
                    ? <span className="badge gray" title="Astrologer has already set these once and can't self-edit anymore">Locked</span>
                    : <span className="badge amber" title="Astrologer can still set these once via their app">Not set yet</span>}
                </td>
                <td><b>{r.wallet_balance ?? 0}</b></td>
                <td>
                  <ActionMenu items={[
                    r.approval_status !== 'approved' &&
                      { label: 'Approve', onClick: () => patch(r.id, { approval_status: 'approved' }) },
                    r.approval_status !== 'rejected' &&
                      { label: 'Reject', onClick: () => patch(r.id, { approval_status: 'rejected' }) },
                    { label: r.is_suspended ? 'Unsuspend' : 'Suspend', onClick: () => patch(r.id, { is_suspended: !r.is_suspended }) },
                    { label: 'Edit', onClick: () => openEdit(r) },
                    r.badge !== 'verified' &&
                      { label: 'Set badge: Verified', onClick: () => patch(r.id, { badge: 'verified' }) },
                    r.badge !== 'celebrity' &&
                      { label: 'Set badge: Celebrity', onClick: () => patch(r.id, { badge: 'celebrity' }) },
                    r.badge !== 'top_rated' &&
                      { label: 'Set badge: Top Rated', onClick: () => patch(r.id, { badge: 'top_rated' }) },
                    r.badge &&
                      { label: 'Remove badge', onClick: () => patch(r.id, { badge: null }) },
                    r.charges_locked_at &&
                      { label: 'Allow charge self-edit (one-time)', onClick: () => unlockCharges(r) },
                    { label: 'Adjust wallet', onClick: () => { setTopup(r); setAmount(''); } },
                    { label: 'Delete', danger: true, onClick: () => remove(r) },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="btn-group" style={{ marginTop: 12, alignItems: 'center' }}>
          <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted" style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {creating && (
        <Modal title="Add an astrologer" onClose={() => setCreating(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            For an astrologer onboarded offline. They skip the signup form and the approval
            queue — the account is created approved and ready to work. They still log in with
            an OTP on their own phone (there is no password in the astrologer app), but they go
            straight to their home screen, never to a registration form.
          </p>
          <div className="field">
            <label>Mobile number *</label>
            <input
              type="tel"
              value={creating.phone_number}
              onChange={(e) => setNew('phone_number', e.target.value)}
              placeholder="10-digit number, e.g. 9876543210"
              autoFocus
            />
            <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              This is their login identity — it must be a real handset they can receive an OTP on,
              and it cannot be changed from here later.
            </span>
          </div>
          <ImageField label="Profile photo (URL or upload)" value={creating.profile_pic_url} onChange={(v) => setNew('profile_pic_url', v)} />
          <div className="two-col">
            <div className="field"><label>First name *</label>
              <input type="text" value={creating.first_name} onChange={(e) => setNew('first_name', e.target.value)} /></div>
            <div className="field"><label>Last name</label>
              <input type="text" value={creating.last_name} onChange={(e) => setNew('last_name', e.target.value)} /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Email</label>
              <input type="email" value={creating.email} onChange={(e) => setNew('email', e.target.value)} /></div>
            <div className="field"><label>Gender</label>
              <select value={creating.gender} onChange={(e) => setNew('gender', e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Experience (years)</label>
              <input type="number" value={creating.experience} onChange={(e) => setNew('experience', e.target.value)} /></div>
            <div className="field"><label>Languages (comma separated)</label>
              <input type="text" value={creating.languages} onChange={(e) => setNew('languages', e.target.value)} placeholder="Hindi, English" /></div>
          </div>
          <div className="field"><label>Bio / About</label>
            <textarea value={creating.bio} onChange={(e) => setNew('bio', e.target.value)} placeholder="Shown on their profile in the customer app" /></div>
          {categories.length > 0 && (
            <div className="field">
              <label>Categories / specialties</label>
              <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                {categories.map((c) => (
                  <label key={c.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={creating.specialties.includes(c.id)}
                      onChange={() => toggleSpecialty(c.id)}
                    /> {c.name}
                  </label>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                Decides which category screens they show up on in the customer app.
              </span>
            </div>
          )}
          <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
            Set the rates you agreed with them. Leave all three at 0 to let the astrologer set
            their own rates once from their app instead — if you set any rate here, that decision
            locks and only an admin can change it afterwards.
          </div>
          <div className="two-col">
            <div className="field"><label>Chat charge / min</label>
              <input type="number" value={creating.chat_charge_per_minute} onChange={(e) => setNew('chat_charge_per_minute', e.target.value)} /></div>
            <div className="field"><label>Call charge / min</label>
              <input type="number" value={creating.call_charge_per_minute} onChange={(e) => setNew('call_charge_per_minute', e.target.value)} /></div>
          </div>
          <div className="field"><label>Video charge / min</label>
            <input type="number" value={creating.video_charge_per_minute} onChange={(e) => setNew('video_charge_per_minute', e.target.value)} /></div>
          <div className="btn-group" style={{ marginBottom: 6 }}>
            <label className="checkbox-row"><input type="checkbox" checked={creating.is_chat_enabled} onChange={(e) => setNew('is_chat_enabled', e.target.checked)} /> Chat</label>
            <label className="checkbox-row"><input type="checkbox" checked={creating.is_call_enabled} onChange={(e) => setNew('is_call_enabled', e.target.checked)} /> Call</label>
            <label className="checkbox-row"><input type="checkbox" checked={creating.is_video_call_enabled} onChange={(e) => setNew('is_video_call_enabled', e.target.checked)} /> Video</label>
          </div>
          <div className="muted" style={{ marginBottom: 14, fontSize: 12 }}>
            A service with no charge stays off regardless. The astrologer still has to switch
            themselves online in their own app before customers can reach them.
          </div>
          <div className="field"><label>Badge</label>
            <select value={creating.badge} onChange={(e) => setNew('badge', e.target.value)}>
              <option value="">None</option>
              <option value="verified">Verified</option>
              <option value="celebrity">Celebrity</option>
              <option value="top_rated">Top Rated</option>
            </select></div>
          <div className="field"><label>Admin notes</label>
            <textarea value={creating.admin_notes} onChange={(e) => setNew('admin_notes', e.target.value)} placeholder="Why this astrologer was added directly (optional)" /></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setCreating(null)}>Cancel</button>
            <button
              className="btn"
              onClick={submitNew}
              disabled={busy || !creating.first_name.trim() || !creating.phone_number.trim()}
            >{busy ? 'Creating…' : 'Create astrologer'}</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit — ${name(editing)}`} onClose={() => setEditing(null)}>
          <ImageField label="Profile photo (URL or upload)" value={editing.profile_pic_url} onChange={(v) => set('profile_pic_url', v)} />
          <div className="two-col">
            <div className="field"><label>First name</label>
              <input type="text" value={editing.first_name || ''} onChange={(e) => set('first_name', e.target.value)} /></div>
            <div className="field"><label>Last name</label>
              <input type="text" value={editing.last_name || ''} onChange={(e) => set('last_name', e.target.value)} /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Experience (years)</label>
              <input type="number" value={editing.experience || 0} onChange={(e) => set('experience', e.target.value)} /></div>
            <div className="field"><label>Languages (comma separated)</label>
              <input type="text" value={editing.languages || ''} onChange={(e) => set('languages', e.target.value)} /></div>
          </div>
          <div className="field"><label>Bio / About</label>
            <textarea value={editing.bio || ''} onChange={(e) => set('bio', e.target.value)} placeholder="Shown on the astrologer's profile in the customer app" /></div>
          <div className="two-col">
            <div className="field"><label>Approval status</label>
              <select value={editing.approval_status} onChange={(e) => set('approval_status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select></div>
            <div className="field checkbox-row" style={{ marginTop: 28 }}>
              <input id="susp" type="checkbox" checked={!!editing.is_suspended} onChange={(e) => set('is_suspended', e.target.checked)} />
              <label htmlFor="susp" style={{ margin: 0 }}>Suspended</label></div>
          </div>
          <div className="field"><label>Badge</label>
            <select value={editing.badge || ''} onChange={(e) => set('badge', e.target.value || null)}>
              <option value="">None</option>
              <option value="verified">Verified</option>
              <option value="celebrity">Celebrity</option>
              <option value="top_rated">Top Rated</option>
            </select></div>
          <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
            {editing.charges_locked_at
              ? 'This astrologer has already set these once via their app and can no longer self-edit — you can still change them here anytime.'
              : 'This astrologer has not set these yet — the first time they save charges themselves, it locks for them (editable here regardless).'}
          </div>
          <div className="two-col">
            <div className="field"><label>Chat charge / min</label>
              <input type="number" value={editing.chat_charge_per_minute || 0} onChange={(e) => set('chat_charge_per_minute', e.target.value)} /></div>
            <div className="field"><label>Call charge / min</label>
              <input type="number" value={editing.call_charge_per_minute || 0} onChange={(e) => set('call_charge_per_minute', e.target.value)} /></div>
          </div>
          <div className="field"><label>Video charge / min</label>
            <input type="number" value={editing.video_charge_per_minute || 0} onChange={(e) => set('video_charge_per_minute', e.target.value)} /></div>
          <div className="btn-group" style={{ marginBottom: 14 }}>
            <label className="checkbox-row"><input type="checkbox" checked={!!editing.is_chat_enabled} onChange={(e) => set('is_chat_enabled', e.target.checked)} /> Chat</label>
            <label className="checkbox-row"><input type="checkbox" checked={!!editing.is_call_enabled} onChange={(e) => set('is_call_enabled', e.target.checked)} /> Call</label>
            <label className="checkbox-row"><input type="checkbox" checked={!!editing.is_video_call_enabled} onChange={(e) => set('is_video_call_enabled', e.target.checked)} /> Video</label>
          </div>
          <div className="field"><label>Admin notes</label>
            <textarea value={editing.admin_notes || ''} onChange={(e) => set('admin_notes', e.target.value)} /></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {topup && (
        <Modal title={`Adjust wallet — ${name(topup)}`} onClose={() => setTopup(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Current balance: <b>₹{topup.wallet_balance ?? 0}</b>. Enter a positive amount to credit,
            negative to debit. Use this only for verified mishap corrections — it is logged in
            vendor_wallet_transactions and does not count toward earnings.
          </p>
          <div className="field"><label>Amount (₹)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setTopup(null)}>Cancel</button>
            <button className="btn" onClick={submitTopup} disabled={busy || !amount}>{busy ? 'Applying…' : 'Apply'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
