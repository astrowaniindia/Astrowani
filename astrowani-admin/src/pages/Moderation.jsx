import { useEffect, useState } from 'react';
import client from '../api/client';

// Reports from the apps that need a person to look at them.
//
// App Store Guideline 1.2 and Google Play's UGC policy require that reported content is
// acted on. Two queues:
//   Live comments -- a customer or astrologer reported a comment in a live stream.
//                    "Ban from comments" silences that customer on every stream.
//   Chat reports  -- an astrologer reported a customer from chat or My Customers.
//                    (These existed before this page; nothing showed them.)

function statusBadge(s) {
  const cls = s === 'actioned' ? 'red' : s === 'reviewed' ? 'green' : 'amber';
  return <span className={`badge ${cls}`}>{s}</span>;
}

const fullName = (a) => (a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '');

export default function Moderation() {
  const [tab, setTab] = useState('live');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDone, setShowDone] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const url = tab === 'live' ? '/api/admin/live-comment-reports' : '/api/admin/customer-reports';
      const { data } = await client.get(url);
      setRows(data.data || []);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const setStatus = async (r, status) => {
    const note = window.prompt(`Admin note for marking "${status}" (optional):`) ?? null;
    if (note === null) return;
    try {
      const url = tab === 'live'
        ? `/api/admin/live-comment-reports/${r.id}`
        : `/api/admin/customer-reports/${r.id}`;
      await client.patch(url, { status, admin_note: note });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to update report.');
    }
  };

  const ban = async (r) => {
    const who = r.reported?.name || r.reported?.mobile || 'this customer';
    const reason = window.prompt(`Ban ${who} from commenting on ALL live streams?\nReason (optional):`);
    if (reason === null) return;
    try {
      await client.post('/api/admin/live-comment-bans', { customerId: r.reported_customer_id, reason });
      await client.patch(`/api/admin/live-comment-reports/${r.id}`, {
        status: 'actioned',
        admin_note: r.admin_note || `Banned from live comments${reason ? `: ${reason}` : ''}`,
      });
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to ban.');
    }
  };

  const unban = async (r) => {
    if (!window.confirm('Allow this customer to comment on live streams again?')) return;
    try {
      await client.delete(`/api/admin/live-comment-bans/${r.reported_customer_id}`);
      await load();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to remove ban.');
    }
  };

  const visible = rows.filter((r) => showDone || r.status === 'pending');
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const cols = tab === 'live' ? 9 : 8;

  return (
    <div>
      <h1 className="page-title">Moderation</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Reports filed from the apps. Review each one; app stores expect reported content to be acted on
        promptly (aim for within 24 hours).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn ${tab === 'live' ? '' : 'secondary'}`} onClick={() => setTab('live')}>
          Live stream comments
        </button>
        <button className={`btn ${tab === 'chat' ? '' : 'secondary'}`} onClick={() => setTab('chat')}>
          Customers reported by astrologers
        </button>
        <label style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show reviewed / actioned
        </label>
      </div>
      {!loading && !error && (
        <p className="muted" style={{ marginBottom: 8 }}>{pendingCount} pending</p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            {tab === 'live' ? (
              <tr>
                <th>Comment</th><th>Written by</th><th>Reported by</th><th>Stream</th><th>Reason</th>
                <th>Status</th><th>Filed</th><th>Admin note</th><th>Actions</th>
              </tr>
            ) : (
              <tr>
                <th>Customer</th><th>Reported by astrologer</th><th>Reason</th><th>Note</th>
                <th>Status</th><th>Filed</th><th>Admin note</th><th>Actions</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading && <tr><td colSpan={cols} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={cols} className="empty" style={{ color: '#c0392b' }}>{error}</td></tr>}
            {!loading && !error && visible.length === 0 && (
              <tr><td colSpan={cols} className="empty">Nothing to review.</td></tr>
            )}
            {!loading && !error && tab === 'live' && visible.map((r) => (
              <tr key={r.id}>
                <td style={{ maxWidth: 260 }}>
                  <b>“{r.comment_text || '—'}”</b>
                  {r.note && <><br /><span className="muted">Note: {r.note}</span></>}
                </td>
                <td>
                  {r.reported?.name || '—'}<br />
                  <span className="muted">{r.reported?.mobile || ''}</span>
                  {r.reported_is_banned && <><br /><span className="badge red">banned</span></>}
                </td>
                <td className="muted">
                  {r.reporter_customer
                    ? `${r.reporter_customer.name || 'Customer'} (customer)`
                    : r.reporter_astrologer
                      ? `${fullName(r.reporter_astrologer)} (host astrologer)`
                      : '—'}
                </td>
                <td className="muted">{fullName(r.host) || '—'}</td>
                <td><b>{r.reason}</b></td>
                <td>{statusBadge(r.status)}</td>
                <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                <td className="muted">{r.admin_note || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status !== 'reviewed' && r.status !== 'actioned' && (
                    <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setStatus(r, 'reviewed')}>
                      No action needed
                    </button>
                  )}
                  {r.reported_customer_id && !r.reported_is_banned && (
                    <button className="btn" style={{ marginRight: 6 }} onClick={() => ban(r)}>Ban from comments</button>
                  )}
                  {r.reported_customer_id && r.reported_is_banned && (
                    <button className="btn secondary" onClick={() => unban(r)}>Remove ban</button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && !error && tab === 'chat' && visible.map((r) => (
              <tr key={r.id}>
                <td>{r.customers?.name || '—'}<br /><span className="muted">{r.customers?.mobile || ''}</span></td>
                <td className="muted">{fullName(r.astrologers) || '—'}</td>
                <td><b>{r.reason}</b></td>
                <td className="muted" style={{ maxWidth: 260 }}>{r.note || '—'}</td>
                <td>{statusBadge(r.status)}</td>
                <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
                <td className="muted">{r.admin_note || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'pending' && (
                    <button className="btn secondary" style={{ marginRight: 6 }} onClick={() => setStatus(r, 'reviewed')}>
                      Mark reviewed
                    </button>
                  )}
                  {r.status !== 'actioned' && (
                    <button className="btn secondary" onClick={() => setStatus(r, 'actioned')}>Mark actioned</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
