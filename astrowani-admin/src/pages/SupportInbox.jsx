// Support inbox — the human side of in-app support.
//
// The old Support page listed one-shot tickets and let an admin set a status and
// write an admin_note. Nothing in either app ever displayed that note, so the
// answer never reached the person who asked. This is where a reply actually
// lands in the customer's thread.
//
// The queue is ordered by SLA, not by arrival. A breached urgent conversation
// sitting under twenty pieces of feedback is how support teams miss the one that
// mattered.
import { useCallback, useEffect, useRef, useState } from 'react';
import client from '../api/client';

const TABS = [
  { key: 'open', label: 'Needs a person' },
  { key: 'bot', label: 'With the assistant' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const PRIORITY_COLOR = { urgent: 'red', high: 'amber', normal: 'gray', low: 'gray' };
const STATUS_LABEL = {
  bot: 'Assistant', awaiting_human: 'Waiting for us', human: 'With us',
  resolved: 'Resolved', closed: 'Closed',
};

// Refreshed on a timer because an escalation can arrive at any moment and nobody
// watches a queue they have to remember to reload.
const POLL_MS = 20000;

function Sla({ row }) {
  if (!row.first_response_due_at) return <span className="muted">—</span>;
  if (row.first_human_response_at) return <span className="badge green">Answered</span>;
  if (row.slaBreached) return <span className="badge red">Overdue</span>;
  const m = row.minutesToDue;
  if (m == null) return <span className="muted">—</span>;
  return <span className={`badge ${m < 15 ? 'amber' : 'gray'}`}>{m}m left</span>;
}

export default function SupportInbox() {
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('open');
  const [appFilter, setAppFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const threadEndRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = { status: tab };
      if (appFilter !== 'all') params.app = appFilter;
      const { data } = await client.get('/api/admin/support/conversations', { params });
      setRows(data.data || []);
      setTableMissing(!!data.tableMissing);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab, appFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const openThread = useCallback(async (id) => {
    setSelected(id);
    const { data } = await client.get(`/api/admin/support/conversations/${id}`);
    setThread(data.data);
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // Keep the open thread live too, so a reply typed here appears alongside
  // whatever the customer sent while it was being written.
  useEffect(() => {
    if (!selected) return undefined;
    const id = setInterval(() => {
      client.get(`/api/admin/support/conversations/${selected}`)
        .then(({ data }) => setThread(data.data))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [selected]);

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/support/conversations/${selected}/reply`, { body: reply.trim() });
      setReply('');
      await openThread(selected);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const patch = async (body) => {
    if (!selected) return;
    setBusy(true);
    try {
      await client.patch(`/api/admin/support/conversations/${selected}`, body);
      await openThread(selected);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const partyLabel = (p) => {
    if (!p) return '—';
    if (p.kind === 'customer') return `${p.name || 'Customer'} · ${p.mobile || ''}`;
    return `${`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Astrologer'} · ${p.phone_number || ''}`;
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Support Inbox</h1>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>

      {tableMissing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Not set up yet.</b> Run <code>sql/support_agent_schema.sql</code> in the Supabase SQL
          editor to create the support conversation tables. Until then both apps fall back to
          telling people support is being set up, rather than erroring.
        </div>
      )}

      <div className="btn-group" style={{ marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            className={`btn ${tab === tb.key ? '' : 'secondary'}`}
            onClick={() => setTab(tb.key)}>
            {tb.label}
          </button>
        ))}
        <select value={appFilter} onChange={(e) => setAppFilter(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="all">Both apps</option>
          <option value="customer">Customers</option>
          <option value="vendor">Astrologers</option>
        </select>
        <span className="muted" style={{ fontSize: 13 }}>{rows.length} conversation{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)', gap: 16, alignItems: 'start' }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Who</th><th>Issue</th><th>Priority</th><th>SLA</th><th>Status</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="empty">Nothing here.</td></tr>}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openThread(r.id)}
                  style={{ cursor: 'pointer', background: selected === r.id ? '#f6efe9' : undefined }}>
                  <td>
                    {r.partyName}
                    <div className="muted" style={{ fontSize: 11 }}>{r.app === 'vendor' ? 'Astrologer' : 'Customer'}</div>
                  </td>
                  <td className="muted">{r.category || '—'}</td>
                  <td><span className={`badge ${PRIORITY_COLOR[r.priority] || 'gray'}`}>{r.priority}</span></td>
                  <td><Sla row={r} /></td>
                  <td className="muted">{STATUS_LABEL[r.status] || r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ minHeight: 320 }}>
          {!thread ? (
            <p className="muted" style={{ margin: 0 }}>Select a conversation to read it and reply.</p>
          ) : (
            <>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div>
                  <b>{partyLabel(thread.party)}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {thread.category || 'uncategorised'} · {thread.priority} ·{' '}
                    {STATUS_LABEL[thread.status] || thread.status}
                    {thread.escalation_reason ? ` · ${thread.escalation_reason}` : ''}
                  </div>
                </div>
                {thread.party?.wallet_balance != null && (
                  <span className="badge gray">Wallet ₹{thread.party.wallet_balance}</span>
                )}
              </div>

              <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #eee', borderRadius: 10, padding: 12, background: '#fafafa' }}>
                {(thread.messages || []).map((m) => (
                  <div key={m.id} style={{ marginBottom: 12, textAlign: m.sender === 'user' ? 'left' : 'right' }}>
                    <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
                      {m.sender === 'user' ? 'Them' : m.sender === 'agent' ? 'Assistant' : m.sender === 'human' ? 'Us' : 'System'}
                      {' · '}{new Date(m.created_at).toLocaleString()}
                    </div>
                    <div style={{
                      display: 'inline-block', maxWidth: '85%', textAlign: 'left',
                      padding: '8px 12px', borderRadius: 12,
                      background: m.sender === 'user' ? '#fff' : m.sender === 'human' ? '#eafaf0' : m.sender === 'system' ? '#f0e6e0' : '#f4ecff',
                      border: '1px solid #e6e6e6', whiteSpace: 'pre-wrap',
                    }}>
                      {m.body}
                    </div>
                    {/* What the assistant actually looked up. This is the first thing
                        you need when someone says "your bot told me I'd be refunded". */}
                    {m.tool_trace && (
                      <details style={{ fontSize: 11, marginTop: 4 }}>
                        <summary className="muted" style={{ cursor: 'pointer' }}>what the assistant checked</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', padding: 8, borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                          {typeof m.tool_trace === 'string' ? m.tool_trace : JSON.stringify(m.tool_trace, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to them directly. This appears in their app and sends a push."
                  rows={3}
                />
              </div>
              <div className="btn-group">
                <button className="btn" onClick={sendReply} disabled={busy || !reply.trim()}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
                {thread.status !== 'resolved' && (
                  <button className="btn secondary" onClick={() => patch({ status: 'resolved' })} disabled={busy}>
                    Mark resolved
                  </button>
                )}
                <select
                  value={thread.priority}
                  onChange={(e) => patch({ priority: e.target.value })}
                  disabled={busy}>
                  {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
