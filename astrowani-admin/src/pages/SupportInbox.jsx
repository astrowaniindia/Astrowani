// Support inbox — the human side of in-app support.
//
// SIMPLE ON PURPOSE (2026-11-14). Built on the model Zendesk, Intercom and Help
// Scout all share, cut down to what a one-admin team needs:
//
//   - The status says WHOSE TURN IT IS, and nothing else:
//       Reply needed   -> our turn (someone is waiting on us)
//       Waiting on them -> we answered, the ball is in their court
//       Solved
//     When they write again, it jumps straight back to "Reply needed" by itself
//     (Zendesk's Pending -> Open), so nothing has to be watched by hand.
//   - Worst first: urgent, then whoever has waited longest.
//   - Saved replies, because the same handful of answers cover most questions.
//   - Photos both ways: a screenshot settles most payment questions in one step.
//   - The person's wallet and recent payments beside the thread, so "where is
//     my money" can be answered without opening other pages.
//
// Deliberately NOT here (big-team tools with no use for one admin): owners,
// "Mine/Unassigned" views, internal notes, a wall of metrics.
import { useCallback, useEffect, useRef, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import './SupportInbox.css';

const TABS = [
  { key: 'waiting', label: 'Reply needed' },
  { key: 'pending', label: 'Waiting on them' },
  { key: 'solved', label: 'Solved' },
  { key: 'all', label: 'All' },
];

const STATUS_LABEL = {
  bot: 'With the assistant', awaiting_human: 'Reply needed', human: 'Waiting on them',
  resolved: 'Solved', closed: 'Closed',
};

const LIST_POLL_MS = 20000;
const THREAD_POLL_MS = 10000;
// Photos are shrunk in the browser before upload: a phone screenshot can be
// 6 MB of base64 and the server would only shrink it again.
const MAX_EDGE = 2000;

function waited(m) {
  if (m == null) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function partyName(p) {
  if (!p) return 'Unknown';
  if (p.kind === 'customer') return p.name || 'Customer';
  return `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Astrologer';
}

/** Read an image File into a downscaled JPEG data URI. */
function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Only images can be sent.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparent PNG -> not black
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

function SavedRepliesEditor({ replies, onClose, onSaved }) {
  const [list, setList] = useState(replies.map((r) => ({ ...r })));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await client.put('/api/admin/support/saved-replies', { replies: list });
      onSaved(data.data || list);
      onClose();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal title="Saved replies" onClose={onClose} className="si-modal-wide">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Write <code>{'{name}'}</code> and it becomes the person&apos;s first name.
      </p>
      <div className="si-saved-edit-list">
        {list.map((r, i) => (
          <div key={r.id || i} className="si-saved-edit-row">
            <input
              value={r.title}
              placeholder="Short title"
              onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            />
            <textarea
              rows={3}
              value={r.body}
              placeholder="The reply"
              onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
            />
            <button className="btn ghost sm" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </div>
      <div className="btn-group" style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={() => setList((l) => [...l, { id: `r${Date.now()}`, title: '', body: '' }])}>+ Add</button>
        <span style={{ flex: 1 }} />
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

/** The few facts that answer most questions: who, how to reach them, their money. */
function PersonPanel({ thread }) {
  const p = thread.party;
  const ctx = thread.context || {};
  const rawPhone = p?.mobile || p?.phone_number || '';
  const phone = /^deleted:/.test(rawPhone) ? '' : rawPhone; // deleted accounts hold a placeholder
  const money = p?.kind === 'astrologer' ? (ctx.recentWithdrawals || []) : (ctx.recentPayments || []);
  return (
    <aside className="si-context">
      <div className="si-person">
        <div className={`si-avatar si-avatar-lg ${p?.kind === 'astrologer' ? 'si-avatar-astro' : ''}`}>{initials(partyName(p))}</div>
        <div style={{ minWidth: 0 }}>
          <div className="si-person-name">{partyName(p)}</div>
          <div className="si-person-kind">{p?.kind === 'astrologer' ? 'Astrologer' : 'Customer'}{phone ? ` · ${phone}` : ''}</div>
        </div>
      </div>
      {p?.wallet_balance != null && (
        <div className="si-kv"><span>Wallet</span><b>₹{Number(p.wallet_balance).toFixed(2)}</b></div>
      )}

      {money.length > 0 && (
        <section>
          <h4>{p?.kind === 'astrologer' ? 'Payout requests' : 'Recent recharges'}</h4>
          {money.slice(0, 4).map((r) => {
            const st = r.status === 'paid' || r.status === 'approved' ? 'ok' : r.status === 'failed' || r.status === 'rejected' ? 'bad' : 'wait';
            const label = p?.kind === 'astrologer' ? r.status : st === 'ok' ? 'paid' : st === 'bad' ? 'failed' : 'not paid';
            return (
              <div key={r.id} className="si-mini-row">
                <span>₹{r.net_amount ?? r.amount}</span>
                <span className={`si-chip ${st === 'ok' ? 'si-chip-green' : st === 'bad' ? 'si-chip-red' : 'si-chip-amber'}`}>{label}</span>
                <span className="muted">{when(r.paid_at || r.requested_at || r.created_at)}</span>
              </div>
            );
          })}
        </section>
      )}

      {ctx.recentSessions?.length > 0 && (
        <section>
          <h4>Recent consultations</h4>
          {ctx.recentSessions.slice(0, 4).map((s) => (
            <div key={s.id} className="si-mini-row">
              <span style={{ textTransform: 'capitalize' }}>{s.type}{s.free ? ' (free)' : ''}</span>
              <span>{s.live ? 'live' : s.minutes != null ? `${s.minutes} min` : '—'}</span>
              <span className="muted">{when(s.startedAt)}</span>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}

export default function SupportInbox() {
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('waiting');
  const [appFilter, setAppFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [firstReply, setFirstReply] = useState(null);
  const [replies, setReplies] = useState([]);
  const [showReplies, setShowReplies] = useState(false);
  const [editingReplies, setEditingReplies] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const threadEndRef = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const lastMsgCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const params = { status: tab };
      if (appFilter !== 'all') params.app = appFilter;
      const [{ data }, sum] = await Promise.all([
        client.get('/api/admin/support/conversations', { params }),
        client.get('/api/admin/support/summary').catch(() => null),
      ]);
      setRows(data.data || []);
      setTableMissing(!!data.tableMissing);
      if (sum?.data?.data) setSummary(sum.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab, appFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    client.get('/api/admin/support/saved-replies').then(({ data }) => setReplies(data.data || [])).catch(() => {});
    client.get('/api/admin/support/stats').then(({ data }) => setFirstReply(data.data?.medianFirstResponseMin ?? null)).catch(() => {});
  }, []);

  const fetchThread = useCallback(async (id) => {
    const { data } = await client.get(`/api/admin/support/conversations/${id}`);
    setThread(data.data);
    const n = data.data?.messages?.length || 0;
    // Scroll only when something new arrived, so reading back is not interrupted.
    if (n !== lastMsgCount.current) {
      lastMsgCount.current = n;
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  }, []);

  const openThread = useCallback(async (id) => {
    setSelected(id);
    setThread(null);
    setDraft('');
    setAttachment(null);
    lastMsgCount.current = 0;
    const url = new URL(window.location.href);
    url.searchParams.set('c', id);
    window.history.replaceState(null, '', url);
    try { await fetchThread(id); } catch (e) { console.error(e); }
  }, [fetchThread]);

  // The alert emails link here with ?c=<conversation id>.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) openThread(c).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const id = setInterval(() => { fetchThread(selected).catch(() => {}); }, THREAD_POLL_MS);
    return () => clearInterval(id);
  }, [selected, fetchThread]);

  const firstName = (thread && partyName(thread.party).split(' ')[0]) || 'there';

  const applyReply = (r) => {
    const text = r.body.replace(/\{name\}/g, firstName);
    setDraft((d) => (d.trim() ? `${d.trim()}\n\n${text}` : text));
    setShowReplies(false);
    setTimeout(() => textRef.current?.focus(), 0);
  };

  const pickFile = async (file) => {
    try { setAttachment(await fileToDataUri(file)); } catch (e) { alert(e.message); }
  };

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); pickFile(item.getAsFile()); }
  };

  const send = async () => {
    const body = draft.trim();
    if (!selected || busy || (!body && !attachment)) return;
    setBusy(true);
    try {
      await client.post(`/api/admin/support/conversations/${selected}/reply`, { body, image: attachment || undefined });
      setDraft('');
      setAttachment(null);
      await fetchThread(selected);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const patch = async (body) => {
    if (!selected) return;
    setBusy(true);
    try {
      await client.patch(`/api/admin/support/conversations/${selected}`, body);
      await fetchThread(selected);
      await load();
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  const canSend = !!(draft.trim() || attachment);
  const waitingMin = thread?.awaiting_reply_since
    ? Math.round((Date.now() - new Date(thread.awaiting_reply_since)) / 60000) : null;

  return (
    <div className="si-page">
      <div className="row-between" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Support Inbox</h1>
        <div className="si-numbers">
          <span className={summary?.waiting ? 'si-num-red' : ''}><b>{summary?.waiting ?? '—'}</b> need a reply</span>
          <span className={summary?.overdue ? 'si-num-amber' : ''}><b>{summary?.overdue ?? '—'}</b> overdue</span>
          <span><b>{firstReply == null ? '—' : waited(firstReply)}</b> typical first reply</span>
        </div>
      </div>

      {tableMissing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Not set up yet.</b> Run <code>sql/support_agent_schema.sql</code> in the Supabase SQL editor.
        </div>
      )}

      <div className="si-shell">
        {/* ── The list ── */}
        <div className="si-queue">
          <div className="si-views">
            {TABS.map((tb) => (
              <button key={tb.key} className={`si-view ${tab === tb.key ? 'active' : ''}`} onClick={() => setTab(tb.key)}>
                {tb.label}
                {tb.key === 'waiting' && summary?.waiting ? <span className="si-view-count">{summary.waiting}</span> : null}
              </button>
            ))}
            <select className="si-app-filter" value={appFilter} onChange={(e) => setAppFilter(e.target.value)}>
              <option value="all">Everyone</option>
              <option value="customer">Customers</option>
              <option value="vendor">Astrologers</option>
            </select>
          </div>
          <div className="si-queue-list">
            {loading && <div className="si-empty">Loading…</div>}
            {!loading && rows.length === 0 && (
              <div className="si-empty">{tab === 'waiting' ? '🎉 Nobody is waiting for a reply.' : 'Nothing here.'}</div>
            )}
            {rows.map((r) => (
              <button
                key={r.id}
                className={`si-item ${selected === r.id ? 'active' : ''} ${r.waitingOnUs ? 'waiting' : ''}`}
                onClick={() => openThread(r.id)}>
                <div className={`si-prio-bar si-prio-${r.priority}`} />
                <div className={`si-avatar ${r.app === 'vendor' ? 'si-avatar-astro' : ''}`}>{initials(r.partyName)}</div>
                <div className="si-item-body">
                  <div className="si-item-top">
                    <span className="si-item-name">{r.partyName}</span>
                    {r.waitingOnUs
                      ? <span className={`si-wait ${r.slaBreached ? 'late' : ''}`}>{waited(r.waitingMinutes)}</span>
                      : <span className="si-item-time">{when(r.last_message_at)}</span>}
                  </div>
                  <div className="si-item-preview">{r.lastUserMessage || r.subject || '—'}</div>
                  {(r.priority === 'urgent' || r.priority === 'high' || r.app === 'vendor') && (
                    <div className="si-item-meta">
                      {r.priority === 'urgent' && <span className="si-chip si-chip-red">Urgent</span>}
                      {r.priority === 'high' && <span className="si-chip si-chip-amber">High</span>}
                      {r.app === 'vendor' && <span className="si-chip si-chip-violet">Astrologer</span>}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── The conversation ── */}
        <div
          className="si-thread"
          onDragOver={(e) => { if (selected) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && selected) pickFile(f); }}>
          {!selected ? (
            <div className="si-placeholder">
              <div style={{ fontSize: 40 }}>💬</div>
              <div>Pick a conversation.</div>
            </div>
          ) : !thread ? (
            <div className="si-placeholder">Loading…</div>
          ) : (
            <>
              <div className="si-thread-head">
                <div style={{ minWidth: 0 }}>
                  <div className="si-thread-title">{partyName(thread.party)}</div>
                  <div className="si-thread-sub">
                    {STATUS_LABEL[thread.status] || thread.status}
                    {waitingMin != null && <> · <b className="si-red">waiting {waited(waitingMin)}</b></>}
                  </div>
                </div>
                <div className="si-thread-actions">
                  {thread.status !== 'resolved' && thread.status !== 'closed' && (
                    <button className="btn sm" onClick={() => patch({ status: 'resolved' })} disabled={busy}>✓ Mark solved</button>
                  )}
                  {thread.awaiting_reply_since && (
                    <button className="btn secondary sm" onClick={() => patch({ status: 'closed' })} disabled={busy}
                      title="For 'hi', tests and duplicates. Takes it off the list without messaging them.">
                      No reply needed
                    </button>
                  )}
                </div>
              </div>

              <div className="si-messages">
                {(thread.messages || []).filter((m) => m.sender !== 'note').map((m) => {
                  if (m.sender === 'system') {
                    return <div key={m.id} className="si-sys">{m.body}</div>;
                  }
                  const them = m.sender === 'user';
                  const who = them ? partyName(thread.party).split(' ')[0] : m.sender === 'agent' ? 'Assistant' : (m.adminName || 'You');
                  const caption = m.image_url ? String(m.body || '').replace(/^📷\s*/, '').replace(/^Photo$/, '') : m.body;
                  return (
                    <div key={m.id} className={`si-msg ${them ? 'them' : 'us'}`}>
                      <div className="si-msg-who">{who} · {when(m.created_at)}</div>
                      <div className={`si-bubble ${them ? 'them' : m.sender === 'agent' ? 'bot' : 'human'}`}>
                        {m.image_url && (
                          <img src={m.image_url} alt="Sent in support" className="si-msg-img" loading="lazy"
                            onClick={() => setLightbox(m.image_url)} />
                        )}
                        {caption ? <div>{caption}</div> : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              <div className="si-composer">
                {attachment && (
                  <div className="si-attach">
                    <img src={attachment} alt="To send" />
                    <span>Photo ready to send</span>
                    <button className="btn ghost sm" onClick={() => setAttachment(null)}>Remove</button>
                  </div>
                )}
                <textarea
                  ref={textRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
                  onPaste={onPaste}
                  rows={3}
                  placeholder={`Reply to ${firstName}…`}
                />
                <div className="si-composer-foot">
                  <div className="si-saved-wrap">
                    <button className="si-tool" onClick={() => setShowReplies((s) => !s)}>⚡ Saved replies</button>
                    {showReplies && (
                      <div className="si-saved-pop" onMouseLeave={() => setShowReplies(false)}>
                        {replies.map((r) => (
                          <button key={r.id} className="si-saved-item" onClick={() => applyReply(r)}>
                            <b>{r.title}</b>
                            <span>{r.body.replace(/\{name\}/g, firstName)}</span>
                          </button>
                        ))}
                        <button className="si-saved-manage" onClick={() => { setShowReplies(false); setEditingReplies(true); }}>Edit saved replies…</button>
                      </div>
                    )}
                  </div>
                  <button className="si-tool" onClick={() => fileRef.current?.click()}>📎 Photo</button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickFile(f); }} />
                  <span style={{ flex: 1 }} />
                  <button className="btn" onClick={send} disabled={busy || !canSend}>{busy ? 'Sending…' : 'Send'}</button>
                </div>
              </div>
            </>
          )}
        </div>

        {thread ? <PersonPanel thread={thread} /> : <aside className="si-context si-context-empty" />}
      </div>

      {lightbox && (
        <div className="si-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Full size" />
        </div>
      )}
      {editingReplies && (
        <SavedRepliesEditor replies={replies} onClose={() => setEditingReplies(false)} onSaved={setReplies} />
      )}
    </div>
  );
}
