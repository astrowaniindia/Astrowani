import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import { ChipGroup, SortableTh, sortRows, chipStyle } from '../components/filters';

// ─────────────────────────────────────────────────────────────────────────────
// The consultation record: every chat / audio / video session, what the customer
// paid for it, WHAT THE ASTROLOGER EARNED FROM IT, what the platform kept, and —
// for chat — the transcript, with a retention switch that deletes old chats.
//
// The money figures are summed server-side from the three ledgers, not from
// `chat_sessions`: that table has no total-charged column at all, which is why the
// old version of this page showed 0 charged on every row.
// ─────────────────────────────────────────────────────────────────────────────

const WINDOWS = [
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
];

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'audio', label: '📞 Audio' },
  { key: 'video', label: '🎥 Video' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Any' },
  { key: 'live', label: '🟢 Live now' },
  { key: 'ended', label: 'Ended' },
  { key: 'paid', label: 'Earned > ₹0' },
  { key: 'zero', label: 'Earned ₹0', title: 'Connected but never billed — free, abandoned or a billing failure' },
  { key: 'flagged', label: '🚩 Flagged' },
];

const SESSION_SORT = {
  startedAt: (r) => (r.startedAt ? new Date(r.startedAt).getTime() : null),
  astrologer: (r) => (r.astrologer?.name || '').toLowerCase(),
  customer: (r) => (r.customer?.name || '').toLowerCase(),
  durationMinutes: (r) => r.durationMinutes,
  customerPaid: (r) => r.customerPaid,
  astrologerEarned: (r) => r.astrologerEarned,
  platformKept: (r) => r.platformKept,
  messageCount: (r) => r.messageCount,
};

const EARNINGS_SORT = {
  name: (r) => r.name.toLowerCase(),
  walletBalance: (r) => r.walletBalance,
  todayEarnings: (r) => r.todayEarnings,
  totalEarnings: (r) => r.totalEarnings,
  earnedInWindow: (r) => r.earnedInWindow,
  sessionsInWindow: (r) => r.sessionsInWindow,
  lastEarnedAt: (r) => (r.lastEarnedAt ? new Date(r.lastEarnedAt).getTime() : null),
};

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const TYPE_ICON = { chat: '💬', audio: '📞', voice: '📞', video: '🎥' };

// ── Transcript popup ──────────────────────────────────────────────────────────
function TranscriptModal({ sessionId, onClose, onDeleted }) {
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

// ── Chat retention panel ──────────────────────────────────────────────────────
function RetentionPanel() {
  const [info, setInfo] = useState(null);
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await client.get('/api/admin/chat-retention');
      setInfo(data);
      setDays(String(data.days));
    } catch (e) {
      setInfo({ error: e.response?.data?.message || e.message });
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setBusy(true);
    try {
      for (const [key, value] of Object.entries(patch)) {
        await client.patch('/api/admin/settings', { key, value: String(value) });
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  };

  const runNow = async () => {
    if (!window.confirm(`Delete every chat message older than ${days} days right now?\n\nThis cannot be undone and there are no database backups.`)) return;
    setBusy(true);
    try {
      const { data } = await client.post('/api/admin/chat-retention/run');
      alert(`Deleted ${data.deleted} message(s).${data.skippedFlagged ? ` Kept ${data.skippedFlagged} belonging to flagged sessions.` : ''}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally { setBusy(false); }
  };

  if (!info) return <div className="card"><div className="muted">Loading retention settings…</div></div>;
  if (info.error) return <div className="card" style={{ color: 'var(--red, #c0392b)' }}>{info.error}</div>;

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 6px' }}>Chat retention</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Keep consultation chats for a fixed number of days, then delete them automatically.
        The purge runs every hour. <b>Deleted messages cannot be recovered</b> — this database
        has no backups — so the switch starts off and nothing is deleted until you turn it on.
      </p>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', margin: '14px 0' }}>
        <div className="stat">
          <div className="stat-header"><span className="label">Messages stored</span></div>
          <div className="value">{info.totalMessages.toLocaleString('en-IN')}</div>
          <div className="stat-footer"><span className="muted">oldest {fmtDay(info.oldestMessageAt)}</span></div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Older than {info.days} days</span></div>
          <div className="value" style={{ color: info.dueNow ? 'var(--crimson)' : undefined }}>
            {info.dueNow.toLocaleString('en-IN')}
          </div>
          <div className="stat-footer">
            <span className="muted">{info.enabled ? 'deleted on the next hourly run' : 'would be deleted once switched on'}</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-header"><span className="label">Status</span></div>
          <div className="value" style={{ color: info.enabled ? '#059669' : undefined }}>
            {info.enabled ? 'ON' : 'OFF'}
          </div>
          <div className="stat-footer"><span className="muted">{info.keepFlagged ? 'flagged chats kept' : 'flagged chats deleted too'}</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          Keep chats for
          <input
            type="number"
            min="1"
            max="3650"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={() => Number(days) >= 1 && Number(days) !== info.days && save({ chat_retention_days: Math.round(Number(days)) })}
            style={{ width: 80, padding: '5px 8px', borderRadius: 8 }}
          />
          days
        </label>

        <label className="checkbox-row" style={{ fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={info.keepFlagged}
            disabled={busy}
            onChange={(e) => save({ chat_retention_keep_flagged: e.target.checked })}
          />
          {' '}Never delete chats that carry an off-platform contact flag
        </label>
      </div>

      {/* The flag exemption is not a nicety: a flag keeps only the offending sentence, and
          the admin proof view reads the surrounding conversation out of chat_messages. */}
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        A flag stores the offending sentence itself, but the “view proof” panel shows the
        conversation around it — which lives only in these messages. Leave this ticked unless
        you have a reason not to.
      </p>

      <div className="btn-group" style={{ marginTop: 16 }}>
        <button
          className={`btn ${info.enabled ? 'danger' : ''}`}
          disabled={busy}
          onClick={() => {
            if (!info.enabled && !window.confirm(`Turn automatic deletion on?\n\n${info.dueNow.toLocaleString('en-IN')} message(s) are already older than ${info.days} days and will be deleted within the hour.`)) return;
            save({ chat_retention_enabled: !info.enabled });
          }}
        >
          {info.enabled ? 'Turn automatic deletion OFF' : 'Turn automatic deletion ON'}
        </button>
        <button className="btn secondary" disabled={busy || !info.dueNow} onClick={runNow}>
          Delete the {info.dueNow.toLocaleString('en-IN')} old message(s) now
        </button>
        <button className="btn ghost" disabled={busy} onClick={load}>Refresh</button>
      </div>
    </div>
  );
}

// ── Session start message (unchanged behaviour, now tucked behind a button) ────
function IntroBannerPanel() {
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState({ enabled: false, text: '', textHi: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.get('/api/admin/settings')
      .then(({ data }) => {
        const st = data.settings || {};
        setIntro({
          enabled: st.session_intro_banner_enabled === 'true',
          text: st.session_intro_banner_text || '',
          textHi: st.session_intro_banner_text_hi || '',
        });
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await Promise.all([
        client.patch('/api/admin/settings', { key: 'session_intro_banner_enabled', value: intro.enabled ? 'true' : 'false' }),
        client.patch('/api/admin/settings', { key: 'session_intro_banner_text', value: intro.text }),
        client.patch('/api/admin/settings', { key: 'session_intro_banner_text_hi', value: intro.textHi }),
      ]);
      alert('Saved. New sessions show the updated message immediately.');
    } catch (e) { alert(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <button
        className="btn secondary"
        style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>⚙️ Session start message — click here to change</span>
        <span className={`pill-badge ${intro.enabled ? 'green' : ''}`}>{intro.enabled ? 'SHOWING' : 'OFF'}</span>
      </button>

      {open && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Shown to the customer at the top of every chat, call and video session, then it fades
            away on its own. <b>This is wording only.</b> It does not change billing, pricing or the
            per-minute charge — so avoid promising a free minute here: the session is charged from
            the moment it connects, and a customer can check that claim against their wallet.
          </p>
          <div className="checkbox-row" style={{ marginBottom: 12 }}>
            <input
              id="intro-on"
              type="checkbox"
              checked={intro.enabled}
              onChange={(e) => setIntro((p) => ({ ...p, enabled: e.target.checked }))}
            />
            <label htmlFor="intro-on" style={{ margin: 0 }}>Show this message during sessions</label>
          </div>
          <div className="field">
            <label>Message (English)</label>
            <textarea rows={3} value={intro.text} onChange={(e) => setIntro((p) => ({ ...p, text: e.target.value }))} />
          </div>
          <div className="field">
            <label>Message (Hindi) — falls back to English if left blank</label>
            <textarea rows={3} value={intro.textHi} onChange={(e) => setIntro((p) => ({ ...p, textHi: e.target.value }))} />
          </div>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save message'}</button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Sessions() {
  const [view, setView] = useState('sessions'); // 'sessions' | 'earnings' | 'retention'
  const [windowKey, setWindowKey] = useState('30');
  // Off by default: the Apple/Play reviewer account runs real test sessions against
  // production (memory: store-reviewer-accounts), and those are not consultations
  // anyone should be counted on, paid for, or compared against in a report.
  const [includeTest, setIncludeTest] = useState(false);
  const [testCount, setTestCount] = useState(0);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'startedAt', dir: 'desc' });
  const [transcript, setTranscript] = useState(null);

  const [earnings, setEarnings] = useState([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsSort, setEarningsSort] = useState({ key: 'earnedInWindow', dir: 'desc' });
  const [earningsSearch, setEarningsSearch] = useState('');

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/api/admin/consultations', { params: { days: windowKey, includeTest: includeTest ? '1' : undefined } });
      setRows(data.data || []);
      setTestCount(data.testCount || 0);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  };

  const loadEarnings = async () => {
    setEarningsLoading(true);
    try {
      const { data } = await client.get('/api/admin/consultations/astrologer-earnings', { params: { days: windowKey, includeTest: includeTest ? '1' : undefined } });
      setEarnings(data.data || []);
      setTestCount(data.testCount || 0);
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally { setEarningsLoading(false); }
  };

  useEffect(() => { if (view === 'sessions') loadSessions(); }, [windowKey, view, includeTest]);
  useEffect(() => { if (view === 'earnings') loadEarnings(); }, [windowKey, view, includeTest]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all') {
        const t = r.type === 'voice' ? 'audio' : r.type;
        if (t !== typeFilter) return false;
      }
      if (statusFilter === 'live' && !r.isActive) return false;
      if (statusFilter === 'ended' && r.isActive) return false;
      if (statusFilter === 'paid' && !(r.astrologerEarned > 0)) return false;
      if (statusFilter === 'zero' && r.astrologerEarned > 0) return false;
      if (statusFilter === 'flagged' && !r.flagged) return false;
      if (!q) return true;
      return (
        (r.astrologer?.name || '').toLowerCase().includes(q) ||
        (r.customer?.name || '').toLowerCase().includes(q) ||
        (r.customer?.mobile || '').includes(q) ||
        (r.astrologer?.phone || '').includes(q)
      );
    });
  }, [rows, typeFilter, statusFilter, search]);

  const sorted = useMemo(() => sortRows(filtered, sort, SESSION_SORT), [filtered, sort]);

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    paid: acc.paid + r.customerPaid,
    earned: acc.earned + r.astrologerEarned,
    kept: acc.kept + r.platformKept,
    minutes: acc.minutes + (r.durationMinutes || 0),
  }), { paid: 0, earned: 0, kept: 0, minutes: 0 }), [filtered]);

  const earningsFiltered = useMemo(() => {
    const q = earningsSearch.trim().toLowerCase();
    const list = q
      ? earnings.filter((r) => r.name.toLowerCase().includes(q) || (r.phone || '').includes(q))
      : earnings;
    return sortRows(list, earningsSort, EARNINGS_SORT);
  }, [earnings, earningsSearch, earningsSort]);

  return (
    <div style={{ maxWidth: 1400 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ margin: '0 0 6px' }}>Consultations</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Every chat, audio and video session — what the customer paid, what the astrologer
            earned from it, and the chat itself.
          </p>
        </div>
        <button className="btn secondary sm" onClick={() => (view === 'earnings' ? loadEarnings() : loadSessions())}>
          🔄 Refresh
        </button>
      </div>

      <div className="btn-group" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        <button className={`btn sm ${view === 'sessions' ? '' : 'secondary'}`} onClick={() => setView('sessions')}>📋 Sessions</button>
        <button className={`btn sm ${view === 'earnings' ? '' : 'secondary'}`} onClick={() => setView('earnings')}>💰 Astrologer earnings & balance</button>
        <button className={`btn sm ${view === 'retention' ? '' : 'secondary'}`} onClick={() => setView('retention')}>🗑️ Chat retention</button>
      </div>

      {view === 'retention' ? (
        <RetentionPanel />
      ) : (
        <>
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Period:</span>
              <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                {WINDOWS.map((w) => (
                  <button
                    key={w.key}
                    className={`btn sm ${windowKey === w.key ? '' : 'ghost'}`}
                    style={chipStyle(windowKey === w.key)}
                    onClick={() => setWindowKey(w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              <div className="search-bar-wrap" style={{ marginLeft: 'auto' }}>
                <span className="search-bar-icon">🔍</span>
                <input
                  type="text"
                  placeholder={view === 'earnings' ? 'Search astrologer…' : 'Search astrologer or customer…'}
                  value={view === 'earnings' ? earningsSearch : search}
                  onChange={(e) => (view === 'earnings' ? setEarningsSearch(e.target.value) : setSearch(e.target.value))}
                />
              </div>
            </div>

            {view === 'sessions' && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <ChipGroup label="Type:" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
                <ChipGroup label="Show:" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
              </div>
            )}

            {/* The Apple/Play reviewer account (memory: store-reviewer-accounts) runs real
                test sessions against production under a fixed phone number. They are hidden
                by default on both tabs so they never get averaged into a real report. */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="checkbox-row" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeTest}
                  onChange={(e) => setIncludeTest(e.target.checked)}
                />
                {' '}Include Play Store / App Store reviewer test sessions
              </label>
              {!includeTest && testCount > 0 && (
                <span className="muted" style={{ fontSize: 12 }}>
                  — hiding {testCount.toLocaleString('en-IN')} test {view === 'earnings' ? (testCount === 1 ? 'account' : 'accounts') : (testCount === 1 ? 'session' : 'sessions')}
                </span>
              )}
            </div>
          </div>

          {error && <div className="card" style={{ color: 'var(--red, #c0392b)', marginBottom: 16 }}>{error}</div>}

          {view === 'sessions' ? (
            <>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginBottom: 18 }}>
                <div className="stat">
                  <div className="stat-header"><span className="label">Sessions</span></div>
                  <div className="value">{loading ? '…' : filtered.length.toLocaleString('en-IN')}</div>
                  <div className="stat-footer"><span className="muted">{Math.round(totals.minutes)} minutes talked</span></div>
                </div>
                <div className="stat">
                  <div className="stat-header"><span className="label">Customers paid</span></div>
                  <div className="value">{loading ? '…' : rupees(totals.paid)}</div>
                </div>
                <div className="stat">
                  <div className="stat-header"><span className="label">Astrologers earned</span></div>
                  <div className="value" style={{ color: 'var(--emerald)' }}>{loading ? '…' : rupees(totals.earned)}</div>
                </div>
                <div className="stat">
                  <div className="stat-header"><span className="label">Platform kept</span></div>
                  <div className="value">{loading ? '…' : rupees(totals.kept)}</div>
                  {/* The 50/50 split only started on 30 Sept 2026 — before that the
                      astrologer was credited the whole charge, so an older period shows a
                      platform figure far below half and that is the history, not a bug. */}
                  <div className="stat-footer"><span className="muted">50% of each billed minute since 30 Sept 2026</span></div>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <SortableTh label="Astrologer" sortKey="astrologer" sort={sort} setSort={setSort} />
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
                    {loading && <tr><td colSpan={10} className="empty">Loading sessions…</td></tr>}
                    {!loading && sorted.length === 0 && <tr><td colSpan={10} className="empty">No sessions match these filters.</td></tr>}
                    {!loading && sorted.map((r) => (
                      <tr key={r.id}>
                        <td title={r.type}>
                          {TYPE_ICON[r.type] || '💬'}{' '}
                          {r.isActive && <span className="pill-badge green">Live</span>}
                          {r.isFree && <span className="pill-badge">Free</span>}
                          {r.flagged && <span className="pill-badge" title="Off-platform contact flag">🚩</span>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{r.astrologer.name}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{r.astrologer.phone || '—'}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.customer.name}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{r.customer.mobile || '—'}</div>
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
            </>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortableTh label="Astrologer" sortKey="name" sort={earningsSort} setSort={setEarningsSort} />
                    <SortableTh label="Current balance" sortKey="walletBalance" sort={earningsSort} setSort={setEarningsSort} numeric title="What they can withdraw right now" />
                    <SortableTh label="Today" sortKey="todayEarnings" sort={earningsSort} setSort={setEarningsSort} numeric />
                    <SortableTh label="Total (30-day cycle)" sortKey="totalEarnings" sort={earningsSort} setSort={setEarningsSort} numeric />
                    <SortableTh label="Earned in period" sortKey="earnedInWindow" sort={earningsSort} setSort={setEarningsSort} numeric />
                    <SortableTh label="Sessions in period" sortKey="sessionsInWindow" sort={earningsSort} setSort={setEarningsSort} numeric />
                    <SortableTh label="Last earned" sortKey="lastEarnedAt" sort={earningsSort} setSort={setEarningsSort} numeric />
                  </tr>
                </thead>
                <tbody>
                  {earningsLoading && <tr><td colSpan={7} className="empty">Loading earnings…</td></tr>}
                  {!earningsLoading && earningsFiltered.length === 0 && <tr><td colSpan={7} className="empty">No astrologers.</td></tr>}
                  {!earningsLoading && earningsFiltered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>
                          {r.name}
                          {r.isSuspended && <span className="pill-badge" style={{ marginLeft: 6 }}>suspended</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{r.phone || '—'}</div>
                      </td>
                      <td style={{ fontWeight: 800, color: r.walletBalance > 0 ? '#059669' : undefined }}>{rupees(r.walletBalance)}</td>
                      <td>{rupees(r.todayEarnings)}</td>
                      <td>{rupees(r.totalEarnings)}</td>
                      <td style={{ fontWeight: 700 }}>
                        {rupees(r.earnedInWindow)}
                        {/* Gifts land in the same ledger and carry no session, so a single
                            number here can never be reconciled against the session list. */}
                        {r.earnedFromGifts > 0 && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {rupees(r.earnedFromSessions)} consultations + {rupees(r.earnedFromGifts)} gifts
                          </div>
                        )}
                      </td>
                      <td>{r.sessionsInWindow || '—'}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{fmt(r.lastEarnedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'earnings' && (
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              <b>Current balance</b> is the astrologer's live wallet — what a payout would pay out.
              <b> Today</b> resets at midnight and <b>Total</b> resets every 30 days, both by the
              backend's own reset job, so neither is a lifetime figure. <b>Earned in period</b> is
              summed from the earnings ledger over the period selected above; where gifts are
              involved it is broken out underneath, because only the consultation part can be
              reconciled against the session list. A small gap can remain even then: when a
              customer account is hard-deleted its session rows go with it, while the earnings
              stay in the ledger forever — so those rupees have no session left to list.
            </p>
          )}
        </>
      )}

      <IntroBannerPanel />

      {transcript && (
        <TranscriptModal
          sessionId={transcript}
          onClose={() => setTranscript(null)}
          onDeleted={(id) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, messageCount: 0 } : r)))}
        />
      )}
    </div>
  );
}
