import { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { ChipGroup, SortableTh, sortRows, chipStyle } from '../components/filters';
import ConsultationList from '../components/ConsultationList';

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
  { key: 'connectivity', label: '📶⚠️ Connectivity issue' },
];


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

  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [earnings, setEarnings] = useState([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsSort, setEarningsSort] = useState({ key: 'earnedInWindow', dir: 'desc' });
  const [earningsSearch, setEarningsSearch] = useState('');

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

  useEffect(() => { if (view === 'earnings') loadEarnings(); }, [windowKey, view, includeTest]);

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
        <button className="btn secondary sm" onClick={() => (view === 'earnings' ? loadEarnings() : setReloadKey((k) => k + 1))}>
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
            <ConsultationList
              windowKey={windowKey}
              includeTest={includeTest}
              typeFilter={typeFilter}
              statusFilter={statusFilter}
              search={search}
              reloadKey={reloadKey}
              onMeta={(m) => setTestCount(m.testCount)}
            />
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

    </div>
  );
}
