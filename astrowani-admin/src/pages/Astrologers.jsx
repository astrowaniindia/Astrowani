import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import ImageField from '../components/ImageField';

function StatusBadge({ s }) {
  if (s === 'approved') return <span className="badge green">Approved</span>;
  if (s === 'rejected') return <span className="badge red">Rejected</span>;
  return <span className="badge amber">Pending</span>;
}

export default function Astrologers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [topup, setTopup] = useState(null); // astrologer being wallet-adjusted
  const [amount, setAmount] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/api/admin/astrologers');
    setRows(data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
      });
      setEditing(null);
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
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Phone</th><th>Status</th><th>Suspended</th>
            <th>Charges (chat/call/video)</th><th>Wallet (₹)</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="empty">No astrologers.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{name(r)}</td>
                <td className="muted">{r.phone_number || '—'}</td>
                <td><StatusBadge s={r.approval_status} /></td>
                <td>{r.is_suspended ? <span className="badge red">Suspended</span> : <span className="badge gray">No</span>}</td>
                <td className="muted">{r.chat_charge_per_minute || 0} / {r.call_charge_per_minute || 0} / {r.video_charge_per_minute || 0}</td>
                <td><b>{r.wallet_balance ?? 0}</b></td>
                <td><div className="btn-group">
                  {r.approval_status !== 'approved' &&
                    <button className="btn sm" onClick={() => patch(r.id, { approval_status: 'approved' })}>Approve</button>}
                  {r.approval_status !== 'rejected' &&
                    <button className="btn danger sm" onClick={() => patch(r.id, { approval_status: 'rejected' })}>Reject</button>}
                  <button className="btn secondary sm" onClick={() => patch(r.id, { is_suspended: !r.is_suspended })}>
                    {r.is_suspended ? 'Unsuspend' : 'Suspend'}
                  </button>
                  <button className="btn ghost sm" onClick={() => openEdit(r)}>Edit</button>
                  <button className="btn ghost sm" onClick={() => { setTopup(r); setAmount(''); }}>Adjust wallet</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
