import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import Modal from './Modal';
import { SortableTh } from './filters';

// ─────────────────────────────────────────────────────────────────────────────
// The consultation list, one page at a time. Filters, search, sort and the totals
// all run on the server over the WHOLE period (sql/admin_consultations_rpc.sql);
// the page only ever holds the rows it is showing. It used to load the newest 500
// sessions and total those, so every period read "500" and every total was wrong.
//
// Used by Consultations & Chats (every astrologer) and by an astrologer's own
// history in the Astrologers Directory (`astrologerId`).
// ─────────────────────────────────────────────────────────────────────────────

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const TYPE_ICON = { chat: '💬', audio: '📞', voice: '📞', video: '🎥' };

const PAGE_SIZE = 50;

export function Pager({ page, pages, total, onPage, unit = 'rows' }) {
  if (!total) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
      <button className="btn secondary sm" disabled={page <= 1} onClick={() => onPage(1)}>« First</button>
      <button className="btn secondary sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</button>
      <span className="muted" style={{ fontSize: 13 }}>
        Page {page} of {pages} · {total.toLocaleString('en-IN')} {unit}
      </span>
      <button className="btn secondary sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
      <button className="btn secondary sm" disabled={page >= pages} onClick={() => onPage(pages)}>Last »</button>
    </div>
  );
}

export default function ConsultationList({
  windowKey = 'all',
  includeTest = false,
  typeFilter = 'all',
  statusFilter = 'all',
  search = '',
  astrologerId = null,
  hideAstrologerColumn = false,
  reloadKey = 0,
  onMeta,
}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'startedAt', dir: 'desc' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [q, setQ] = useState(search);
  const reqId = useRef(0);

  // Search runs on the server, so wait for the typing to stop.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any change of filter starts again from page 1.
  useEffect(() => { setPage(1); }, [windowKey, includeTest, typeFilter, statusFilter, q, sort, astrologerId]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    client.get('/api/admin/consultations', {
      params: {
        days: windowKey,
        includeTest: includeTest ? '1' : undefined,
        type: typeFilter,
        status: statusFilter,
        search: q || undefined,
        sort: sort.key,
        dir: sort.dir,
        page,
        limit: PAGE_SIZE,
        astrologerId: astrologerId || undefined,
      },
    })
      .then(({ data }) => {
        if (id !== reqId.current) return; // a newer request has been sent since
        setRows(data.data || []);
        setSummary(data.summary || null);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        onMeta?.({ testCount: data.testCount || 0, total: data.total || 0 });
      })
      .catch((e) => { if (id === reqId.current) setError(e.response?.data?.message || e.message); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, includeTest, typeFilter, statusFilter, q, sort, page, astrologerId, reloadKey]);

  const cols = hideAstrologerColumn ? 9 : 10;

  return (
    <>
      {error && <div className="card" style={{ color: 'var(--red, #c0392b)', marginBottom: 16 }}>{error}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 18 }}>
        <div className="stat">
          <div className="stat-header"><span className="label">Sessions</span></div>
          <div className="value">{summary ? Number(summary.sessions).toLocaleString('en-IN') : '…'}</div>
          <div className="stat-footer"><span className="muted">{summary ? Math.round(summary.minutes).toLocaleString('en-IN') : '…'} minutes talked</span></div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Customers paid</span></div>
          <div className="value">{summary ? rupees(summary.paid) : '…'}</div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Astrologer{astrologerId ? '' : 's'} earned</span></div>
          <div className="value" style={{ color: 'var(--emerald)' }}>{summary ? rupees(summary.earned) : '…'}</div>
          <div className="stat-footer"><span className="muted">Includes free-call payouts</span></div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Platform kept</span></div>
          <div className="value">{summary ? rupees(summary.kept) : '…'}</div>
          {/* The 50/50 split only started on 30 Sept 2026 (before that the astrologer
              got the whole charge). Free-call payouts come out of the platform wallet
              but are not linked to a session there, so they are NOT subtracted here. */}
          <div className="stat-footer"><span className="muted">50% of paid minutes since 30 Sept 2026 (free-call payouts not subtracted)</span></div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              {!hideAstrologerColumn && <SortableTh label="Astrologer" sortKey="astrologer" sort={sort} setSort={setSort} />}
              <SortableTh label="Customer" sortKey="customer" sort={sort} setSort={setSort} />
              <SortableTh label="Started" sortKey="startedAt" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Duration" sortKey="durationMinutes" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Customer paid" sortKey="customerPaid" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Astrologer earned" sortKey="astrologerEarned" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Platform" sortKey="platformKept" sort={sort} setSort={setSort} numeric />
              <SortableTh label="Chat" sortKey="messageCount" sort={sort} setSort={setSort} numeric title="Messages stored" />
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><td colSpan={cols} className="empty">Loading sessions…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={cols} className="empty">No sessions match these filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: loading ? 0.5 : 1 }}>
                <td title={r.type}>
                  {TYPE_ICON[r.type] || '💬'}{' '}
                  {r.isActive && <span className="pill-badge green">Live</span>}
                  {r.isFree && <span className="pill-badge">Free</span>}
                  {r.flagged && <span className="pill-badge" title="Off-platform contact flag">🚩</span>}
                  {r.hadConnectivityIssue && (
                    <span className="pill-badge" title="One side's connection dropped during this session — duration/earnings may look short because billing paused">📶⚠️</span>
                  )}
                </td>
                {!hideAstrologerColumn && (
                  <td>
                    <div style={{ fontWeight: 700 }}>{r.astrologer?.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{r.astrologer?.phone || '—'}</div>
                  </td>
                )}
                <td>
                  <div style={{ fontWeight: 600 }}>{r.customer?.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.customer?.mobile || '—'}</div>
                </td>
                <td className="muted" style={{ fontSize: 12.5 }}>{fmt(r.startedAt)}</td>
                <td>{r.durationMinutes != null ? `${r.durationMinutes} min` : '—'}</td>
                <td>{rupees(r.customerPaid)}</td>
                <td style={{ fontWeight: 700, color: r.astrologerEarned > 0 ? '#059669' : undefined }}>
                  {rupees(r.astrologerEarned)}
                </td>
                <td className="muted">{rupees(r.platformKept)}</td>
                <td>{r.messageCount || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn ghost sm"
                    onClick={() => setTranscript(r.id)}
                    title={r.type === 'chat' ? 'Read this conversation' : 'Calls are not recorded — shows timing and money only'}
                  >
                    {r.type === 'chat' ? 'View chat' : 'Details'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager page={page} pages={pages} total={total} onPage={setPage} unit="sessions" />

      {transcript && (
        <TranscriptModal
          sessionId={transcript}
          onClose={() => setTranscript(null)}
          onDeleted={(id) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, messageCount: 0 } : r)))}
        />
      )}
    </>
  );
}

// ── Transcript popup ──────────────────────────────────────────────────────────
export function TranscriptModal({ sessionId, onClose, onDeleted }) {
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    client.get(`/api/admin/consultations/${sessionId}/chat`)
      .then(({ data }) => { if (!dead) setState({ ...data }); })
      .catch((e) => { if (!dead) setState({ error: e.response?.data?.message || e.message }); });
    return () => { dead = true; };
  }, [sessionId]);

  const s = state.session;

  const deleteChat = async () => {
    if (!window.confirm('Delete this conversation permanently?\n\nThe session itself, the money and any off-platform flag stay. The messages cannot be recovered — there are no database backups.')) return;
    setBusy(true);
    try {
      const { data } = await client.delete(`/api/admin/consultations/${sessionId}/chat`);
      alert(`${data.deleted} message(s) deleted.`);
      onDeleted?.(sessionId);
      onClose();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Session transcript" onClose={onClose}>
      {state.loading && <div className="muted">Loading…</div>}
      {state.error && <div style={{ color: 'var(--red, #c0392b)' }}>{state.error}</div>}

      {s && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            {[
              ['Astrologer', s.astrologer.name],
              ['Customer', s.customer.name],
              ['Type', `${TYPE_ICON[s.type] || ''} ${s.type}`],
              ['Started', fmt(s.startedAt)],
              ['Duration', s.durationMinutes != null ? `${s.durationMinutes} min` : '—'],
              ['Rate', `${rupees(s.perMinuteCharge)}/min`],
              ['Customer paid', rupees(s.customerPaid)],
              ['Astrologer earned', rupees(s.astrologerEarned)],
              ['Platform kept', rupees(s.platformKept)],
            ].map(([k, v]) => (
              <div key={k} style={{ minWidth: 120 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v}</div>
              </div>
            ))}
          </div>

          {s.type !== 'chat' && (
            <div className="muted" style={{ fontSize: 12.5, padding: '10px 12px', borderRadius: 8, background: 'var(--maroon-50)', marginBottom: 12 }}>
              This was a {s.type} call. Calls are peer-to-peer, so the server never sees the audio
              and there is no transcript to show — only the money and timing above.
            </div>
          )}

          {state.retention?.enabled && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Chat retention is on: conversations are deleted {state.retention.days} days after they happen
              {state.retention.keepFlagged ? ', except flagged ones' : ''}.
            </div>
          )}

          <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 10, padding: 12 }}>
            {state.messages?.length === 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: 24 }}>
                No messages stored for this session.
              </div>
            )}
            {state.messages?.map((m) => {
              const astro = m.from === 'astrologer';
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: astro ? 'flex-start' : 'flex-end',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '8px 11px',
                      borderRadius: 12,
                      background: astro ? 'var(--maroon-50)' : 'var(--border-light)',
                      border: m.flagged ? '1.5px solid var(--crimson, #c0392b)' : '1px solid transparent',
                    }}
                  >
                    <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 2 }}>
                      {m.name} · {fmt(m.at)} {m.flagged ? '· 🚩 flagged' : ''}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.message}</div>
                    {/* Contact details are starred out before saving, so the flag's copy is
                        the only record of what was actually typed. */}
                    {m.originalText && (
                      <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--crimson, #c0392b)' }}>
                        As typed: {m.originalText}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="actions" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn danger sm" onClick={deleteChat} disabled={busy || !state.messages?.length}>
              {busy ? 'Deleting…' : 'Delete this conversation'}
            </button>
            <button className="btn secondary" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
