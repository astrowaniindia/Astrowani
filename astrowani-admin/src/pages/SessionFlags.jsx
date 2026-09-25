import { Fragment, useEffect, useState } from 'react';
import client from '../api/client';

// Off-platform contact flags: chat messages where a phone number, email, UPI id, link or
// messaging handle appeared (or someone asked for one). Nothing is blocked -- this is the
// review queue. "High" = contact details are actually present; "Low" = wording only.

const fullName = (a) => (a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '');
const KIND_LABEL = {
  phone: 'Phone number', email: 'Email', upi: 'UPI id', link: 'Link', handle: 'Social handle',
  channel: 'Mentions WhatsApp/Telegram/etc.', contact_request: 'Asks for a number',
};

function statusBadge(s) {
  const cls = s === 'actioned' ? 'red' : s === 'reviewed' ? 'green' : s === 'dismissed' ? '' : 'amber';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export default function SessionFlags() {
  const [rows, setRows] = useState([]);
  const [repeat, setRepeat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableMissing, setTableMissing] = useState(false);
  const [status, setStatus] = useState('pending');
  const [severity, setSeverity] = useState('high');
  const [role, setRole] = useState('astrologer');
  const [open, setOpen] = useState(null); // flag id whose conversation is showing
  const [context, setContext] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/api/admin/session-flags', { params: { status, severity, role } });
      setRows(data.data || []);
      setRepeat(data.repeat || []);
      setTableMissing(!!data.tableMissing);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load flags.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, severity, role]);

  const mark = async (r, next) => {
    const note = window.prompt(`Admin note for marking "${next}" (optional):`);
    if (note === null) return;
    try {
      await client.patch(`/api/admin/session-flags/${r.id}`, { status: next, admin_note: note });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to update.');
    }
  };

  const toggleContext = async (r) => {
    if (open === r.id) { setOpen(null); return; }
    setOpen(r.id);
    setContext([]);
    try {
      const { data } = await client.get(`/api/admin/session-flags/${r.id}/context`);
      setContext(data.data || []);
    } catch (e) {
      setContext([{ id: 'err', from: 'customer', message: e.response?.data?.message || 'Could not load conversation.' }]);
    }
  };

  return (
    <div>
      <h1 className="page-title">Off-platform contact flags</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Chat messages that contained a phone number, email, UPI id, link or messaging handle. Messages are
        never blocked; each match lands here for review.
      </p>

      {tableMissing && (
        <div className="card" style={{ marginBottom: 12 }}>
          Run <code>sql/session_flags.sql</code> in the Supabase SQL editor to enable this page.
        </div>
      )}

      {repeat.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Most flagged astrologers (last 30 days, contact details shared)</b>
          <div style={{ marginTop: 6 }}>
            {repeat.map((r) => (
              <span key={r.astrologerId} className="badge red" style={{ marginRight: 6 }}>
                {r.name || 'Astrologer'} · {r.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="reviewed">Reviewed</option>
          <option value="actioned">Actioned</option><option value="dismissed">Dismissed</option>
          <option value="all">Any status</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="high">Contact details shared</option>
          <option value="low">Wording only</option>
          <option value="all">Any severity</option>
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="astrologer">Sent by astrologer</option>
          <option value="customer">Sent by customer</option>
          <option value="all">Anyone</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Message</th><th>What was found</th><th>Astrologer</th><th>Customer</th><th>Sent by</th>
              <th>Status</th><th>When</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={8} className="empty" style={{ color: '#c0392b' }}>{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="empty">Nothing to review.</td></tr>}
            {!loading && !error && rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td style={{ maxWidth: 300 }}>“{r.excerpt || '—'}”</td>
                  <td>{(r.kinds || []).map((k) => (
                    <span key={k} className={`badge ${r.severity === 'high' ? 'red' : 'amber'}`} style={{ marginRight: 4 }}>
                      {KIND_LABEL[k] || k}
                    </span>
                  ))}</td>
                  <td>{fullName(r.astrologers) || '—'}<br /><span className="muted">{r.astrologers?.phone_number || ''}</span></td>
                  <td>{r.customers?.name || '—'}<br /><span className="muted">{r.customers?.mobile || ''}</span></td>
                  <td>{r.sender_role}</td>
                  <td>{statusBadge(r.status)}{r.admin_note && <><br /><span className="muted">{r.admin_note}</span></>}</td>
                  <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.session_id && (
                      <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => toggleContext(r)}>
                        {open === r.id ? 'Hide chat' : 'View chat'}
                      </button>
                    )}
                    {r.status === 'pending' && (
                      <>
                        <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => mark(r, 'dismissed')}>Not an issue</button>
                        <button className="btn" onClick={() => mark(r, 'actioned')}>Actioned</button>
                      </>
                    )}
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={8} style={{ background: 'rgba(0,0,0,0.03)' }}>
                      {context.length === 0 && <span className="muted">Loading conversation…</span>}
                      {context.map((m) => (
                        <div key={m.id} style={{ padding: '2px 0', fontWeight: m.isFlagged ? 700 : 400 }}>
                          <span className="muted">{m.from === 'astrologer' ? 'Astrologer' : 'Customer'}:</span> {m.message}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
